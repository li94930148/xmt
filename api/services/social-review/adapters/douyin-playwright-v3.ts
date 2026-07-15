import type { Browser, BrowserContext, Page, Response } from 'playwright';
import type { NormalizedVideoSnapshot, SocialAccount } from '@shared/types/social-review';
import { decryptCredentialStorageState, getActiveCredentialByRef, markCredentialExpired } from '../credentials.js';
import { sanitizeErrorMessage } from '../credentialCrypto.js';
import { downloadDouyinOfficialExport, removeDouyinExportFile } from '../douyinExportDownloader.js';
import { parseDouyinOfficialExport } from '../douyinExportParser.js';
import type { SocialCollectDiagnostic, SocialCollectOptions, SocialCollectResult, SocialReviewAdapter } from './base.js';

const CREATOR_CENTER_URL = process.env.DOUYIN_CREATOR_CENTER_URL || 'https://creator.douyin.com/';
const LOGIN_EXPIRED_MESSAGE = '登录凭据已失效，请重新扫码登录。';
const MAX_VIDEO_ITEMS = 20;
const MAX_SCROLL_TIMES = 5;
const MAX_API_ITEMS = 30;
const MAX_CONTENT_ENTRY_CLICKS = 8;
type PlaywrightStorageState = NonNullable<Parameters<Browser['newContext']>[0]>['storageState'];

type VideoCandidate = {
  externalVideoId: string | null;
  title: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  publishTime: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  collects: number | null;
  source: 'table' | 'card' | 'link' | 'api';
};

type ApiCandidateType =
  | 'creator_work_list_candidate'
  | 'creator_comment_or_notice_candidate'
  | 'creator_account_metric_candidate'
  | 'creator_unknown_json_candidate';

type DiagnosticExtra = Pick<
  SocialCollectDiagnostic,
  'strategy' | 'safePathname' | 'candidateType' | 'fieldHitCounts' | 'arrayPathCandidateCount'
  | 'fieldPathStats' | 'workSemanticHitCounts' | 'skipReasonCounts' | 'fileType' | 'parsedRowCount' | 'skippedRowCount' | 'savedVideoCount' | 'unmappedFieldCount'
  | 'adapterVersion' | 'collectMode' | 'hasContentPath' | 'columnNames' | 'columnStats'
>;

type ApiArrayPathCandidate = {
  path: string;
  length: number;
  fieldHitCount: number;
};

type CandidateSkipReason =
  | 'no_id_field'
  | 'empty_id'
  | 'comment_notice_id'
  | 'unstable_id'
  | 'no_work_semantics'
  | 'url_id_extract_failed'
  | 'duplicate';

type SafeFieldPathStat = NonNullable<SocialCollectDiagnostic['fieldPathStats']>[string];

type ApiCandidateCollection = {
  skipped: Record<CandidateSkipReason, number>;
  idPathStats: Record<string, SafeFieldPathStat>;
  workSemanticHitCounts: Record<string, number>;
};

type ContentEntryCandidate = {
  text: string;
  pathname: string;
};

type StructureProbe = {
  safePathname: string;
  title: string;
  navTextCount: number;
  keywordTextCount: number;
  tableCandidateCount: number;
  tableRowCount: number;
  cardCandidateCount: number;
  linkCandidateCount: number;
  videoHrefCount: number;
  apiPathCount: number;
  whitelistedApiFieldCount: number;
};

function nowText() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function safePathname(value: string) {
  try {
    const url = value.startsWith('/') ? new URL(value, CREATOR_CENTER_URL) : new URL(value);
    return (url.pathname || '/').replace(/cookie|authorization|headers|session|storageState|token/gi, 'safe');
  } catch {
    return '/';
  }
}

function normalizeContentPath(value: string | null | undefined) {
  if (!value) return null;
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      if (url.hostname !== 'creator.douyin.com') return null;
      return url.pathname || null;
    }
    return value.startsWith('/') ? value.split('?')[0] : null;
  } catch {
    return null;
  }
}

function createDiagnostics() {
  const diagnostics: SocialCollectDiagnostic[] = [];
  const add = (
    type: SocialCollectDiagnostic['type'],
    message: string,
    count?: number,
    extra: DiagnosticExtra = {},
  ) => {
    diagnostics.push({ type, message, count, at: nowText(), ...extra });
  };
  return { diagnostics, add };
}

export function normalizeDouyinNumber(value: string | null | undefined) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || raw === '*') return null;
  const cleaned = raw.replace(/,/g, '').replace(/\s+/g, '').replace(/\+/g, '').toLowerCase();
  const match = cleaned.match(/(\d+(?:\.\d+)?)(万|亿|w|k)?/);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const unit = match[2];
  if (unit === '亿') return Math.round(base * 100000000);
  if (unit === '万' || unit === 'w') return Math.round(base * 10000);
  if (unit === 'k') return Math.round(base * 1000);
  return Math.round(base);
}

function findMetric(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[\\s\\S]{0,24}?([0-9][0-9,.]*(?:\\.\\d+)?\\s*(?:万|亿|w|k)?\\+?)`, 'i');
    const parsed = normalizeDouyinNumber(text.match(pattern)?.[1]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseMetricFromText(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[：:\\s]*([0-9][0-9,.]*(?:\\.\\d+)?\\s*(?:万|亿|w|k)?\\+?|\\*)`, 'i');
    const parsed = normalizeDouyinNumber(text.match(pattern)?.[1]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function looksLoggedOut(url: string, text: string) {
  const lowerUrl = url.toLowerCase();
  if (/login|passport|sso|oauth/.test(lowerUrl)) return true;
  return ['扫码登录', '登录后查看', '请登录', '手机号登录', '验证码登录', '登录抖音'].some((signal) =>
    text.includes(signal),
  );
}

function normalizeStorageState(payload: unknown): PlaywrightStorageState {
  const candidate = payload && typeof payload === 'object' && 'storageState' in payload
    ? (payload as { storageState?: unknown }).storageState
    : payload;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('采集凭据无法解密，请重新扫码登录。');
  }
  return candidate as PlaywrightStorageState;
}

async function closeQuietly(browser: Browser | null, context: BrowserContext | null) {
  try {
    await context?.close();
  } catch {
    // 关闭失败不影响任务状态落库
  }
  try {
    await browser?.close();
  } catch {
    // 关闭失败不影响任务状态落库
  }
}

async function readPageText(page: Page) {
  try {
    return await page.locator('body').innerText({ timeout: 8000 });
  } catch {
    return '';
  }
}

async function gotoCreatorPage(page: Page, pathName = '') {
  const base = CREATOR_CENTER_URL.replace(/\/+$/, '');
  const target = pathName ? `${base}${pathName}` : CREATOR_CENTER_URL;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
}

async function stabilizeAndScroll(page: Page) {
  for (let index = 0; index < MAX_SCROLL_TIMES; index += 1) {
    await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight, 600))).catch(() => undefined);
    await page.waitForTimeout(800);
  }
}

async function waitForPageStable(page: Page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
}

export async function triggerDouyinCreatorItemList(page: Page) {
  const analysis = page.getByText('作品分析', { exact: true }).first();
  if (await analysis.isVisible().catch(() => false)) {
    await analysis.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(700);
  }
  const candidates = [
    page.getByRole('tab', { name: /投稿列表|作品列表/ }).first(),
    page.getByText('投稿列表', { exact: true }).first(),
    page.getByText(/投稿列表|作品列表/).first(),
    page.locator('[role="tab"], button').filter({ hasText: /投稿列表|作品列表/ }).first(),
  ];
  for (const candidate of candidates) {
    if (!await candidate.isVisible().catch(() => false)) continue;
    await candidate.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    return true;
  }
  return false;
}

function extractVideoId(url: string | null | undefined) {
  if (!url) return null;
  const patterns = [
    /\/video\/([0-9A-Za-z_-]+)/,
    /\/note\/([0-9A-Za-z_-]+)/,
    /modal_id=([0-9A-Za-z_-]+)/,
    /item_id=([0-9A-Za-z_-]+)/,
    /aweme_id=([0-9A-Za-z_-]+)/,
    /video_id=([0-9A-Za-z_-]+)/,
  ];
  for (const pattern of patterns) {
    const matched = url.match(pattern)?.[1];
    if (matched) return matched;
  }
  return null;
}

function normalizePublishTime(value: string | number | null | undefined) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 100000000000 ? value : value * 1000;
    return new Date(timestamp).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  }
  const text = String(value).trim();
  const dateText = text.match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/)?.[0];
  if (!dateText) return null;
  return dateText.replace(/[年./]/g, '-').replace(/月/g, '-').replace(/日/g, '');
}

function normalizeVideoTitle(text: string, url: string | null) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(播放|点赞|评论|分享|收藏|发布时间|作品数据|查看详情|管理|编辑|删除|置顶)/.test(line));
  const title = lines.find((line) => line.length >= 2 && line.length <= 80) || null;
  if (title && !extractVideoId(title) && title !== url) return title;
  return null;
}

function normalizeCandidate(candidate: VideoCandidate) {
  const externalVideoId = candidate.externalVideoId || extractVideoId(candidate.videoUrl);
  if (!externalVideoId) return null;
  return {
    ...candidate,
    externalVideoId,
    title: candidate.title || null,
    videoUrl: candidate.videoUrl || null,
    coverUrl: candidate.coverUrl || null,
    publishTime: normalizePublishTime(candidate.publishTime),
  };
}

function candidateScore(candidate: VideoCandidate) {
  return [
    candidate.title,
    candidate.videoUrl,
    candidate.coverUrl,
    candidate.publishTime,
    candidate.views,
    candidate.likes,
    candidate.comments,
    candidate.shares,
    candidate.collects,
  ].filter((value) => value !== null && value !== undefined && value !== '').length;
}

function mergeCandidateFields(existing: VideoCandidate, next: VideoCandidate): VideoCandidate {
  const preferNext = candidateScore(next) > candidateScore(existing);
  const primary = preferNext ? next : existing;
  const fallback = preferNext ? existing : next;
  return {
    externalVideoId: primary.externalVideoId || fallback.externalVideoId,
    title: primary.title || fallback.title,
    videoUrl: primary.videoUrl || fallback.videoUrl,
    coverUrl: primary.coverUrl || fallback.coverUrl,
    publishTime: primary.publishTime || fallback.publishTime,
    views: primary.views ?? fallback.views,
    likes: primary.likes ?? fallback.likes,
    comments: primary.comments ?? fallback.comments,
    shares: primary.shares ?? fallback.shares,
    collects: primary.collects ?? fallback.collects,
    source: primary.source,
  };
}

function dedupeCandidates(candidates: VideoCandidate[]) {
  const byId = new Map<string, VideoCandidate>();
  let skippedNoStableId = 0;
  let dedupedCount = 0;
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    if (!normalized) {
      skippedNoStableId += 1;
      continue;
    }
    const existing = byId.get(normalized.externalVideoId);
    if (existing) {
      byId.set(normalized.externalVideoId, mergeCandidateFields(existing, normalized));
      dedupedCount += 1;
    } else {
      byId.set(normalized.externalVideoId, normalized);
    }
  }
  return { items: Array.from(byId.values()).slice(0, MAX_VIDEO_ITEMS), skippedNoStableId, dedupedCount };
}

async function probePageStructure(page: Page, apiPathnames: string[], whitelistedApiFieldCount: number): Promise<StructureProbe> {
  return page.evaluate(
    ({ apiPaths, apiFieldCount }) => {
      const toText = (value: string | null | undefined) => String(value || '').replace(/\s+/g, ' ').trim();
      const keywordPattern = /作品|内容管理|视频|发布|播放|点赞|评论|收藏|分享/;
      const navTexts = Array.from(document.querySelectorAll('nav, aside, [role="navigation"], a, button'))
        .map((node) => toText((node as HTMLElement).innerText))
        .filter(Boolean)
        .slice(0, 20);
      const keywordTexts = Array.from(document.querySelectorAll('body *'))
        .map((node) => toText((node as HTMLElement).innerText))
        .filter((text) => text.length > 0 && text.length <= 80 && keywordPattern.test(text))
        .slice(0, 30);
      const tableRows = Array.from(document.querySelectorAll('table tr, [role="row"], .table-row, .semi-table-row'));
      const cards = Array.from(document.querySelectorAll('article, li, [class*="card"], [class*="Card"], [class*="item"], [class*="Item"]'))
        .filter((node) => keywordPattern.test(toText((node as HTMLElement).innerText)));
      const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const videoLinks = links.filter((anchor) => /video|aweme|item_id|modal_id|note/.test(anchor.href || anchor.getAttribute('href') || ''));
      return {
        safePathname: window.location.pathname || '/',
        title: document.title || '',
        navTextCount: navTexts.length,
        keywordTextCount: keywordTexts.length,
        tableCandidateCount: document.querySelectorAll('table, [role="table"], [role="grid"], .semi-table, .table').length,
        tableRowCount: tableRows.length,
        cardCandidateCount: cards.length,
        linkCandidateCount: links.length,
        videoHrefCount: videoLinks.length,
        apiPathCount: apiPaths.length,
        whitelistedApiFieldCount: apiFieldCount,
      };
    },
    { apiPaths: apiPathnames.slice(0, 20), apiFieldCount: whitelistedApiFieldCount },
  );
}

async function discoverContentEntryCandidates(page: Page): Promise<ContentEntryCandidate[]> {
  const raw = await page.evaluate((maxItems) => {
    const keywords = [
      '作品管理',
      '内容管理',
      '视频管理',
      '作品数据',
      '内容数据',
      '投稿管理',
      '已发布',
      '全部作品',
      '视频',
      '图文',
      '数据中心',
      '内容分析',
      '创作管理',
    ];
    const pathPattern = /content|manage|upload|video|work|publish|data/i;
    const toText = (value: string | null | undefined) => String(value || '').replace(/\s+/g, ' ').trim();
    const toPathname = (href: string | null | undefined) => {
      if (!href) return '';
      try {
        return new URL(href, window.location.origin).pathname || '';
      } catch {
        return '';
      }
    };
    const isVisible = (node: HTMLElement) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const nodes = Array.from(document.querySelectorAll('a[href], button, [role="button"], [role="menuitem"]')) as HTMLElement[];
    const seen = new Set<string>();
    const output: ContentEntryCandidate[] = [];
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const text = toText(node.innerText || node.getAttribute('aria-label') || node.getAttribute('title')).slice(0, 40);
      const pathname = toPathname((node as HTMLAnchorElement).href || node.getAttribute('href')).slice(0, 160);
      const matched = keywords.some((keyword) => text.includes(keyword)) || pathPattern.test(pathname);
      if (!matched) continue;
      const key = `${text}|${pathname}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({ text, pathname });
      if (output.length >= maxItems) break;
    }
    return output;
  }, MAX_CONTENT_ENTRY_CLICKS);
  return raw.map((item) => ({
    text: String(item.text || '').slice(0, 40),
    pathname: item.pathname ? safePathname(item.pathname) : '',
  }));
}

async function clickContentEntryCandidate(page: Page, index: number) {
  return page.evaluate((candidateIndex) => {
    const keywords = [
      '作品管理',
      '内容管理',
      '视频管理',
      '作品数据',
      '内容数据',
      '投稿管理',
      '已发布',
      '全部作品',
      '视频',
      '图文',
      '数据中心',
      '内容分析',
      '创作管理',
    ];
    const pathPattern = /content|manage|upload|video|work|publish|data/i;
    const toText = (value: string | null | undefined) => String(value || '').replace(/\s+/g, ' ').trim();
    const toPathname = (href: string | null | undefined) => {
      if (!href) return '';
      try {
        return new URL(href, window.location.origin).pathname || '';
      } catch {
        return '';
      }
    };
    const isVisible = (node: HTMLElement) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const nodes = Array.from(document.querySelectorAll('a[href], button, [role="button"], [role="menuitem"]')) as HTMLElement[];
    const candidates = nodes.filter((node) => {
      if (!isVisible(node)) return false;
      const text = toText(node.innerText || node.getAttribute('aria-label') || node.getAttribute('title')).slice(0, 40);
      const pathname = toPathname((node as HTMLAnchorElement).href || node.getAttribute('href'));
      return keywords.some((keyword) => text.includes(keyword)) || pathPattern.test(pathname);
    });
    const target = candidates[candidateIndex];
    if (!target) return false;
    target.click();
    return true;
  }, index);
}

async function parseTableCandidates(page: Page) {
  const raw = await page.evaluate((maxItems) => {
    const toText = (value: string | null | undefined) => String(value || '').trim();
    const rows = Array.from(document.querySelectorAll('table tr, [role="row"], .semi-table-row, .table-row'));
    return rows
      .map((row) => {
        const host = row as HTMLElement;
        const text = toText(host.innerText).slice(0, 900);
        const link = Array.from(host.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>)
          .map((anchor) => anchor.href || anchor.getAttribute('href') || '')
          .find((href) => /video|aweme|item_id|modal_id|note/.test(href || '')) || '';
        const image = (host.querySelector('img') as HTMLImageElement | null)?.src || '';
        return { text, link, image };
      })
      .filter((item) => item.text && (/播放|点赞|评论|作品|视频/.test(item.text) || /video|aweme|item_id|modal_id|note/.test(item.link)))
      .slice(0, maxItems);
  }, MAX_VIDEO_ITEMS * 2);

  return raw.map((item) => ({
    externalVideoId: extractVideoId(item.link),
    title: normalizeVideoTitle(item.text, item.link),
    videoUrl: item.link || null,
    coverUrl: item.image || null,
    publishTime: normalizePublishTime(item.text),
    views: parseMetricFromText(item.text, ['播放量', '播放', '观看']),
    likes: parseMetricFromText(item.text, ['点赞量', '点赞', '赞']),
    comments: parseMetricFromText(item.text, ['评论量', '评论']),
    shares: parseMetricFromText(item.text, ['分享量', '分享']),
    collects: parseMetricFromText(item.text, ['收藏量', '收藏']),
    source: 'table' as const,
  }));
}

async function parseCardCandidates(page: Page) {
  const raw = await page.evaluate((maxItems) => {
    const toText = (value: string | null | undefined) => String(value || '').trim();
    const nodes = Array.from(document.querySelectorAll('article, li, [class*="card"], [class*="Card"], [class*="item"], [class*="Item"]'));
    return nodes
      .map((node) => {
        const host = node as HTMLElement;
        const text = toText(host.innerText).slice(0, 900);
        const link = Array.from(host.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>)
          .map((anchor) => anchor.href || anchor.getAttribute('href') || '')
          .find((href) => /video|aweme|item_id|modal_id|note/.test(href || '')) || '';
        const dataId = host.getAttribute('data-id') || host.getAttribute('data-item-id') || host.getAttribute('data-aweme-id') || '';
        const image = (host.querySelector('img') as HTMLImageElement | null)?.src || '';
        return { text, link, dataId, image };
      })
      .filter((item) => item.text && (/播放|点赞|评论|作品|视频/.test(item.text) || item.link || item.dataId))
      .slice(0, maxItems);
  }, MAX_VIDEO_ITEMS * 2);

  return raw.map((item) => ({
    externalVideoId: item.dataId || extractVideoId(item.link),
    title: normalizeVideoTitle(item.text, item.link),
    videoUrl: item.link || null,
    coverUrl: item.image || null,
    publishTime: normalizePublishTime(item.text),
    views: parseMetricFromText(item.text, ['播放量', '播放', '观看']),
    likes: parseMetricFromText(item.text, ['点赞量', '点赞', '赞']),
    comments: parseMetricFromText(item.text, ['评论量', '评论']),
    shares: parseMetricFromText(item.text, ['分享量', '分享']),
    collects: parseMetricFromText(item.text, ['收藏量', '收藏']),
    source: 'card' as const,
  }));
}

async function parseLinkCandidates(page: Page) {
  const raw = await page.evaluate((maxItems) => {
    const toText = (value: string | null | undefined) => String(value || '').trim();
    const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    return anchors
      .map((anchor) => {
        const href = anchor.href || anchor.getAttribute('href') || '';
        const host = anchor.closest('tr, li, article, section, div') || anchor;
        const text = toText((host as HTMLElement).innerText || anchor.innerText).slice(0, 800);
        const image = (host.querySelector('img') as HTMLImageElement | null)?.src || '';
        return { href: /^https?:\/\//i.test(href) ? href : '', text, image };
      })
      .filter((item) => /video|aweme|item_id|modal_id|note/.test(item.href))
      .slice(0, maxItems);
  }, MAX_VIDEO_ITEMS * 3);

  return raw.map((item) => ({
    externalVideoId: extractVideoId(item.href),
    title: normalizeVideoTitle(item.text, item.href),
    videoUrl: item.href || null,
    coverUrl: item.image || null,
    publishTime: normalizePublishTime(item.text),
    views: parseMetricFromText(item.text, ['播放量', '播放', '观看']),
    likes: parseMetricFromText(item.text, ['点赞量', '点赞', '赞']),
    comments: parseMetricFromText(item.text, ['评论量', '评论']),
    shares: parseMetricFromText(item.text, ['分享量', '分享']),
    collects: parseMetricFromText(item.text, ['收藏量', '收藏']),
    source: 'link' as const,
  }));
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    const parsed = normalizeDouyinNumber(typeof value === 'string' ? value : null);
    if (parsed !== null) return parsed;
  }
  return null;
}

function pickNestedValue(record: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current == null) return null;
    if (Array.isArray(current)) return current[Number(key)] ?? null;
    if (typeof current !== 'object') return null;
    return (current as Record<string, unknown>)[key];
  }, record);
}

function pickNestedString(record: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = pickNestedValue(record, path);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function pickNestedNumber(record: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = pickNestedValue(record, path);
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    const parsed = normalizeDouyinNumber(typeof value === 'string' ? value : null);
    if (parsed !== null) return parsed;
  }
  return null;
}

const API_FIELD_ALIASES = new Set([
  'aweme_id',
  'awemeId',
  'item_id',
  'itemId',
  'video_id',
  'videoId',
  'id',
  'title',
  'desc',
  'caption',
  'text',
  'create_time',
  'createTime',
  'publish_time',
  'publishTime',
  'cover',
  'cover_url',
  'coverUrl',
  'url',
  'share_url',
  'shareUrl',
  'web_url',
  'detail_url',
  'play_count',
  'playCount',
  'view_count',
  'digg_count',
  'like_count',
  'comment_count',
  'share_count',
  'collect_count',
  'favorite_count',
]);

const API_METRIC_ALIASES = new Set([
  'followers',
  'follower_count',
  'fans_count',
  'following_count',
  'likes_total',
  'total_favorited',
  'works_count',
  'video_count',
]);

const STABLE_ID_PATHS = [
  'aweme_id', 'item_id', 'video_id', 'id', 'work_id', 'content_id', 'group_id', 'material_id', 'object_id',
  'awemeId', 'itemId', 'videoId', 'workId', 'contentId', 'groupId', 'materialId', 'objectId',
  'item.aweme_id', 'item.item_id', 'item.video_id', 'item.id', 'item.work_id', 'item.content_id', 'item.group_id',
  'aweme.aweme_id', 'aweme.item_id', 'aweme.id', 'video.video_id', 'video.id', 'content.id', 'content.item_id',
  'content.aweme_id', 'statistics.aweme_id', 'base.item_id', 'base.aweme_id', 'base.id',
];
const VIDEO_URL_PATHS = ['share_url', 'url', 'web_url', 'detail_url', 'href', 'schema', 'open_url'];
const WORK_SEMANTIC_PATHS = [
  'title', 'desc', 'caption', 'text', 'create_time', 'publish_time', 'createTime', 'publishTime', 'cover', 'cover_url',
  'coverUrl', 'video', 'play_count', 'digg_count', 'comment_count', 'share_count', 'collect_count', 'duration',
  'media_type', 'status', 'publish_status', 'statistics', 'stats',
];
const COMMENT_NOTICE_PATTERN = /comment|notice|reply|message|notification|conversation/i;
const ID_PATH_SET = new Set(STABLE_ID_PATHS);

function createCandidateCollection(): ApiCandidateCollection {
  return {
    skipped: {
      no_id_field: 0,
      empty_id: 0,
      comment_notice_id: 0,
      unstable_id: 0,
      no_work_semantics: 0,
      url_id_extract_failed: 0,
      duplicate: 0,
    },
    idPathStats: {},
    workSemanticHitCounts: {},
  };
}

function valueType(value: unknown) {
  if (value == null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string' && !value.trim()) return 'empty';
  return typeof value;
}

function valueLength(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim().length : null;
}

function valueShape(value: unknown) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return {
    numericLong: /^\d{8,}$/.test(text) ? 1 : 0,
    alphaNumeric: /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9_-]{8,}$/.test(text) ? 1 : 0,
    urlLike: /^https?:\/\//i.test(text) ? 1 : 0,
    empty: text ? 0 : 1,
  };
}

function recordSafePathStat(collection: ApiCandidateCollection, path: string, value: unknown, source = 'apiWhitelist') {
  const existing = collection.idPathStats[path] || {
    hits: 0,
    typeCounts: {},
    minLength: null,
    maxLength: null,
    avgLength: null,
    looksLike: { numericLong: 0, alphaNumeric: 0, urlLike: 0, empty: 0 },
    blacklisted: COMMENT_NOTICE_PATTERN.test(path),
    sources: [],
  };
  existing.hits += 1;
  const type = valueType(value);
  existing.typeCounts[type] = (existing.typeCounts[type] || 0) + 1;
  const length = valueLength(value);
  if (length !== null) {
    existing.minLength = existing.minLength === null ? length : Math.min(existing.minLength, length);
    existing.maxLength = existing.maxLength === null ? length : Math.max(existing.maxLength, length);
    const previousTotal = (existing.avgLength || 0) * (existing.hits - 1);
    existing.avgLength = Math.round(((previousTotal + length) / existing.hits) * 100) / 100;
  }
  const shape = valueShape(value);
  for (const [key, count] of Object.entries(shape)) existing.looksLike[key] = (existing.looksLike[key] || 0) + count;
  if (!existing.sources.includes(source)) existing.sources.push(source);
  collection.idPathStats[path] = existing;
}

function hasStableIdShape(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const text = String(value).trim();
  return /^\d{8,}$/.test(text) || /^(?=.*\d)[A-Za-z0-9_-]{8,}$/.test(text);
}

function collectSafePathStats(value: unknown, collection: ApiCandidateCollection, path = 'root', depth = 0) {
  if (value == null || depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) collectSafePathStats(item, collection, `${path}[]`, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path === 'root' ? key : `${path}.${key}`;
    const normalizedPath = childPath.replace(/^root\./, '').replace(/\[\]/g, '');
    if (ID_PATH_SET.has(normalizedPath) || VIDEO_URL_PATHS.includes(key) || key === 'id') {
      recordSafePathStat(collection, normalizedPath, child);
    }
    if (WORK_SEMANTIC_PATHS.includes(key)) {
      collection.workSemanticHitCounts[key] = (collection.workSemanticHitCounts[key] || 0) + 1;
    }
    collectSafePathStats(child, collection, childPath, depth + 1);
  }
}

function createEmptyFieldHitCounts() {
  return {
    stableId: 0,
    title: 0,
    publishTime: 0,
    cover: 0,
    url: 0,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    collects: 0,
    accountMetric: 0,
  };
}

function countApiFieldHits(value: unknown, counts = createEmptyFieldHitCounts(), depth = 0): Record<string, number> {
  if (value == null || depth > 8) return counts;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) countApiFieldHits(item, counts, depth + 1);
    return counts;
  }
  if (typeof value !== 'object') return counts;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (['aweme_id', 'awemeId', 'item_id', 'itemId', 'video_id', 'videoId', 'work_id', 'workId', 'content_id', 'contentId', 'group_id', 'groupId', 'material_id', 'materialId', 'object_id', 'objectId', 'id'].includes(key)) counts.stableId += 1;
    if (['title', 'desc', 'caption', 'text'].includes(key)) counts.title += 1;
    if (['create_time', 'createTime', 'publish_time', 'publishTime'].includes(key)) counts.publishTime += 1;
    if (['cover', 'cover_url', 'coverUrl'].includes(key)) counts.cover += 1;
    if (['url', 'share_url', 'shareUrl', 'web_url', 'detail_url'].includes(key)) counts.url += 1;
    if (['play_count', 'playCount', 'view_count'].includes(key)) counts.views += 1;
    if (['digg_count', 'like_count'].includes(key)) counts.likes += 1;
    if (key === 'comment_count') counts.comments += 1;
    if (key === 'share_count') counts.shares += 1;
    if (['collect_count', 'favorite_count'].includes(key)) counts.collects += 1;
    if (API_METRIC_ALIASES.has(key)) counts.accountMetric += 1;
    if (API_FIELD_ALIASES.has(key) || API_METRIC_ALIASES.has(key) || typeof child === 'object') {
      countApiFieldHits(child, counts, depth + 1);
    }
  }
  return counts;
}

function findApiArrayPathCandidates(
  value: unknown,
  path = 'root',
  output: ApiArrayPathCandidate[] = [],
  depth = 0,
) {
  if (value == null || depth > 8 || output.length >= 20) return output;
  if (Array.isArray(value)) {
    const counts = createEmptyFieldHitCounts();
    for (const item of value.slice(0, 20)) countApiFieldHits(item, counts, 0);
    const fieldHitCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (value.length > 0 && fieldHitCount > 0) output.push({ path, length: value.length, fieldHitCount });
    for (const item of value.slice(0, 20)) findApiArrayPathCandidates(item, `${path}[]`, output, depth + 1);
    return output;
  }
  if (typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    findApiArrayPathCandidates(child, `${path}.${key}`, output, depth + 1);
  }
  return output;
}

function classifyApiCandidate(pathname: string, fieldHitCounts: Record<string, number>): ApiCandidateType {
  if (/comment|notice|reply|message/i.test(pathname)) return 'creator_comment_or_notice_candidate';
  const hasStableId = Number(fieldHitCounts.stableId || 0) > 0;
  const hasWorkSignal =
    Number(fieldHitCounts.title || 0) +
      Number(fieldHitCounts.publishTime || 0) +
      Number(fieldHitCounts.cover || 0) +
      Number(fieldHitCounts.url || 0) +
      Number(fieldHitCounts.views || 0) +
      Number(fieldHitCounts.likes || 0) >
    0;
  if (hasStableId && hasWorkSignal) return 'creator_work_list_candidate';
  if (Number(fieldHitCounts.accountMetric || 0) > 0) return 'creator_account_metric_candidate';
  return 'creator_unknown_json_candidate';
}

function createApiCandidate(record: Record<string, unknown>, collection: ApiCandidateCollection, recordPath: string): VideoCandidate | null {
  const idFields = STABLE_ID_PATHS.map((path) => ({ path, value: pickNestedValue(record, path) }))
    .filter((item) => item.value !== null && item.value !== undefined);
  const allowedIdFields = idFields.filter((item) => !COMMENT_NOTICE_PATTERN.test(item.path));
  const videoUrl = pickNestedString(record, VIDEO_URL_PATHS);
  const hasWorkSemantics = WORK_SEMANTIC_PATHS.some((path) => pickNestedValue(record, path) !== null && pickNestedValue(record, path) !== undefined);
  if (COMMENT_NOTICE_PATTERN.test(recordPath) || (idFields.length > 0 && allowedIdFields.length === 0)) {
    collection.skipped.comment_notice_id += 1;
    return null;
  }
  const selectedId = allowedIdFields.find((item) => hasStableIdShape(item.value));
  const hasEmptyId = allowedIdFields.some((item) => String(item.value).trim() === '');
  const urlId = extractVideoId(videoUrl);
  if (!selectedId && !urlId) {
    if (idFields.length === 0) collection.skipped.no_id_field += 1;
    else if (hasEmptyId) collection.skipped.empty_id += 1;
    else collection.skipped.unstable_id += 1;
    if (videoUrl && !urlId) collection.skipped.url_id_extract_failed += 1;
    return null;
  }
  if (!hasWorkSemantics) {
    collection.skipped.no_work_semantics += 1;
    return null;
  }
  const externalVideoId = selectedId ? String(selectedId.value).trim() : urlId;
  return {
    externalVideoId,
    title: pickString(record, ['title', 'desc', 'caption', 'text']),
    videoUrl,
    coverUrl: pickNestedString(record, [
      'cover_url',
      'coverUrl',
      'cover',
      'cover.url_list.0',
      'video.cover.url_list.0',
      'video.origin_cover.url_list.0',
      'video.dynamic_cover.url_list.0',
    ]),
    publishTime:
      normalizePublishTime(record.publish_time as string | number | null) ||
      normalizePublishTime(record.publishTime as string | number | null) ||
      normalizePublishTime(record.create_time as string | number | null) ||
      normalizePublishTime(record.createTime as string | number | null),
    views: pickNestedNumber(record, ['play_count', 'playCount', 'view_count', 'statistics.play_count', 'stats.play_count']),
    likes: pickNestedNumber(record, ['digg_count', 'like_count', 'statistics.digg_count', 'statistics.like_count', 'stats.digg_count']),
    comments: pickNestedNumber(record, ['comment_count', 'statistics.comment_count', 'stats.comment_count']),
    shares: pickNestedNumber(record, ['share_count', 'statistics.share_count', 'stats.share_count']),
    collects: pickNestedNumber(record, ['collect_count', 'favorite_count', 'statistics.collect_count', 'stats.collect_count']),
    source: 'api',
  };
}

function addCandidateCollectionDiagnostics(
  collection: ApiCandidateCollection,
  addDiagnostic: (type: SocialCollectDiagnostic['type'], message: string, count?: number, extra?: DiagnosticExtra) => void,
  extra: DiagnosticExtra,
) {
  if (Object.keys(collection.idPathStats).length > 0) {
    addDiagnostic('video_candidate_id_path_summary', '已统计候选作品标识字段路径。', Object.keys(collection.idPathStats).length, {
      ...extra,
      fieldPathStats: collection.idPathStats,
    });
  }
  if (Object.keys(collection.workSemanticHitCounts).length > 0) {
    addDiagnostic('video_candidate_work_semantics_summary', '已统计候选作品语义字段命中。', Object.values(collection.workSemanticHitCounts).reduce((sum, count) => sum + count, 0), {
      ...extra,
      workSemanticHitCounts: collection.workSemanticHitCounts,
    });
  }
  const typeMap: Record<CandidateSkipReason, SocialCollectDiagnostic['type']> = {
    no_id_field: 'video_candidate_skipped_no_id_field',
    empty_id: 'video_candidate_skipped_empty_id',
    comment_notice_id: 'video_candidate_skipped_comment_notice_id',
    unstable_id: 'video_candidate_skipped_unstable_id',
    no_work_semantics: 'video_candidate_skipped_no_work_semantics',
    url_id_extract_failed: 'video_candidate_skipped_url_id_extract_failed',
    duplicate: 'video_candidate_skipped_duplicate',
  };
  const messageMap: Record<CandidateSkipReason, string> = {
    no_id_field: '候选作品未命中标识字段路径。',
    empty_id: '候选作品标识字段为空。',
    comment_notice_id: '候选标识属于评论或通知语义，已跳过。',
    unstable_id: '候选作品标识不具备稳定性，已跳过。',
    no_work_semantics: '候选标识缺少作品语义，已跳过。',
    url_id_extract_failed: '候选链接未提取到稳定作品标识。',
    duplicate: '重复作品候选已合并。',
  };
  for (const reason of Object.keys(collection.skipped) as CandidateSkipReason[]) {
    const count = collection.skipped[reason];
    if (count > 0) addDiagnostic(typeMap[reason], messageMap[reason], count, { ...extra, skipReasonCounts: collection.skipped });
  }
}

function collectApiCandidates(value: unknown, output: VideoCandidate[], collection = createCandidateCollection()) {
  const visit = (current: unknown, path = 'root') => {
    if (output.length >= MAX_API_ITEMS || current == null) return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item, `${path}[]`);
      return;
    }
    if (typeof current !== 'object') return;
    const record = current as Record<string, unknown>;
    const hasKnownIdField = STABLE_ID_PATHS.some((path) => pickNestedValue(record, path) !== null && pickNestedValue(record, path) !== undefined);
    const hasVideoUrl = VIDEO_URL_PATHS.some((path) => pickNestedValue(record, path) !== null && pickNestedValue(record, path) !== undefined);
    const hasWorkField = WORK_SEMANTIC_PATHS.some((path) => pickNestedValue(record, path) !== null && pickNestedValue(record, path) !== undefined);
    if (hasKnownIdField || hasVideoUrl || hasWorkField) {
      const candidate = createApiCandidate(record, collection, path);
      if (candidate) output.push(candidate);
    }
    for (const [key, child] of Object.entries(record)) visit(child, `${path}.${key}`);
  };
  visit(value);
  return collection;
}

function isPotentialVideoApi(response: Response) {
  const pathname = safePathname(response.url());
  return /aweme|item|video|content|publish|creation|manage|work|notice|comment|data|stat/i.test(pathname);
}

function toDiagnosticType(candidateType: ApiCandidateType): SocialCollectDiagnostic['type'] {
  if (candidateType === 'creator_work_list_candidate') return 'api_candidate_work_list';
  if (candidateType === 'creator_comment_or_notice_candidate') return 'api_candidate_comment_notice';
  if (candidateType === 'creator_account_metric_candidate') return 'api_candidate_account_metric';
  return 'api_candidate_classified';
}

function createApiCollector(addDiagnostic: (type: SocialCollectDiagnostic['type'], message: string, count?: number, extra?: DiagnosticExtra) => void) {
  const candidates: VideoCandidate[] = [];
  const apiPathnames = new Set<string>();
  let whitelistedFieldCount = 0;

  const onResponse = async (response: Response) => {
    if (!isPotentialVideoApi(response)) return;
    const pathname = safePathname(response.url());
    apiPathnames.add(pathname);
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('json')) return;
    try {
      const payload = await response.json();
      const before = candidates.length;
      collectApiCandidates(payload, candidates);
      if (candidates.length > before) {
        whitelistedFieldCount += candidates.length - before;
        addDiagnostic('api_candidates_found', '发现作品相关接口候选。', candidates.length - before, { strategy: 'api', safePathname: pathname });
      }
    } catch {
      addDiagnostic('api_parse_failed', '接口白名单解析失败。', 0, { strategy: 'api', safePathname: pathname });
    }
  };

  return {
    candidates,
    apiPathnames,
    getWhitelistedFieldCount: () => whitelistedFieldCount,
    onResponse,
  };
}

function createSafeApiCollector(addDiagnostic: (type: SocialCollectDiagnostic['type'], message: string, count?: number, extra?: DiagnosticExtra) => void) {
  const candidates: VideoCandidate[] = [];
  const apiPathnames = new Set<string>();
  let whitelistedFieldCount = 0;
  let workApiTriggeredCount = 0;
  let workApiFieldMismatchCount = 0;
  let workApiItemsExtractedCount = 0;
  let commentNoticeApiCount = 0;

  const onResponse = async (response: Response) => {
    if (!isPotentialVideoApi(response)) return;
    const pathname = safePathname(response.url());
    apiPathnames.add(pathname);
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('json')) return;
    try {
      const payload = await response.json();
      const collection = createCandidateCollection();
      collectSafePathStats(payload, collection);
      const fieldHitCounts = countApiFieldHits(payload);
      const arrayPathCandidates = findApiArrayPathCandidates(payload);
      const fieldHitTotal = Object.values(fieldHitCounts).reduce((sum, count) => sum + count, 0);
      whitelistedFieldCount += fieldHitTotal;
      const candidateType = classifyApiCandidate(pathname, fieldHitCounts);
      const diagnosticExtra = {
        strategy: 'api',
        safePathname: pathname,
        candidateType,
        fieldHitCounts,
        arrayPathCandidateCount: arrayPathCandidates.length,
      };

      addDiagnostic('api_candidate_seen', '已发现异步接口候选。', 1, diagnosticExtra);
      addDiagnostic(toDiagnosticType(candidateType), '已完成异步接口候选分类。', 1, diagnosticExtra);
      if (candidateType === 'creator_comment_or_notice_candidate') {
        commentNoticeApiCount += 1;
      }
      if (fieldHitTotal > 0) {
        addDiagnostic('api_field_sample_counted', '已统计白名单字段命中数量。', fieldHitTotal, diagnosticExtra);
      }
      if (arrayPathCandidates.length > 0) {
        addDiagnostic('api_array_path_candidate_found', '已发现数组结构候选。', arrayPathCandidates.length, diagnosticExtra);
      }
      if (candidateType !== 'creator_work_list_candidate') return;

      workApiTriggeredCount += 1;
      addDiagnostic('work_api_triggered', '作品接口已触发。', 1, diagnosticExtra);
      const before = candidates.length;
      collectApiCandidates(payload, candidates, collection);
      const extractedCount = candidates.length - before;
      addCandidateCollectionDiagnostics(collection, addDiagnostic, diagnosticExtra);
      if (extractedCount > 0) {
        workApiItemsExtractedCount += extractedCount;
        addDiagnostic('api_candidates_found', '发现作品相关接口候选。', extractedCount, { strategy: 'api', safePathname: pathname });
        addDiagnostic('api_work_items_extracted', '已从作品接口抽取白名单作品字段。', extractedCount, diagnosticExtra);
        addDiagnostic('work_api_items_extracted', '作品接口已提取作品条目。', extractedCount, diagnosticExtra);
      } else {
        workApiFieldMismatchCount += 1;
        addDiagnostic('api_work_items_empty', '作品接口未抽取到可确认作品。', 0, diagnosticExtra);
        addDiagnostic('work_api_field_mismatch', '接口已触发但缺少稳定作品字段。', 0, diagnosticExtra);
      }
      const skippedTotal = Object.entries(collection.skipped)
        .filter(([reason]) => reason !== 'duplicate')
        .reduce((sum, [, count]) => sum + count, 0);
      if (skippedTotal > 0) {
        addDiagnostic('api_work_items_skipped_no_stable_id', '部分作品因未满足安全入库条件已跳过。', skippedTotal, {
          ...diagnosticExtra,
          skipReasonCounts: collection.skipped,
        });
      }
    } catch {
      addDiagnostic('api_parse_failed', '接口白名单解析失败。', 0, { strategy: 'api', safePathname: pathname });
    }
  };

  return {
    candidates,
    apiPathnames,
    getWhitelistedFieldCount: () => whitelistedFieldCount,
    getWorkApiTriggeredCount: () => workApiTriggeredCount,
    getWorkApiFieldMismatchCount: () => workApiFieldMismatchCount,
    getWorkApiItemsExtractedCount: () => workApiItemsExtractedCount,
    getCommentNoticeApiCount: () => commentNoticeApiCount,
    onResponse,
  };
}

async function tryVisibleContentEntry(page: Page) {
  const clicked = await page.evaluate(() => {
    const keywords = ['作品管理', '内容管理', '视频管理', '发布作品'];
    const elements = Array.from(document.querySelectorAll('a, button')) as HTMLElement[];
    const element = elements.find((node) => keywords.some((keyword) => (node.innerText || '').includes(keyword)));
    element?.click();
    return Boolean(element);
  });
  if (clicked) {
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  }
  return clicked;
}

function isLikelyContentPage(probe: StructureProbe) {
  return (
    /content|manage|upload|video|work|publish|data/i.test(probe.safePathname) ||
    probe.tableCandidateCount > 0 ||
    probe.cardCandidateCount > 0 ||
    probe.videoHrefCount > 0 ||
    probe.keywordTextCount > 0
  );
}

async function parseCurrentPage(
  page: Page,
  apiCandidates: VideoCandidate[],
  addDiagnostic: (type: SocialCollectDiagnostic['type'], message: string, count?: number, extra?: DiagnosticExtra) => void,
) {
  await stabilizeAndScroll(page);
  const safePath = safePathname(page.url());
  const tableCandidates = await parseTableCandidates(page);
  const cardCandidates = await parseCardCandidates(page);
  const linkCandidates = await parseLinkCandidates(page);
  const strategyResults = [
    { strategy: 'api', candidates: apiCandidates },
    { strategy: 'link', candidates: linkCandidates },
    { strategy: 'card', candidates: cardCandidates },
    { strategy: 'table', candidates: tableCandidates },
  ];

  for (const result of strategyResults) {
    const { items, skippedNoStableId, dedupedCount } = dedupeCandidates(result.candidates);
    if (items.length > 0) {
      const type = result.strategy === 'api'
        ? 'api_parse_success'
        : result.strategy === 'table'
          ? 'table_parse_success'
          : result.strategy === 'card'
            ? 'card_parse_success'
            : 'link_parse_success';
      addDiagnostic(type, `${result.strategy === 'api' ? '接口白名单' : result.strategy === 'table' ? '表格' : result.strategy === 'card' ? '卡片' : '链接'}解析成功。`, items.length, { strategy: result.strategy, safePathname: safePath });
      if (skippedNoStableId > 0) {
        addDiagnostic('video_items_skipped_no_stable_id', '跳过缺少稳定标识的作品。', skippedNoStableId, { strategy: result.strategy, safePathname: safePath });
      }
      if (dedupedCount > 0) {
        addDiagnostic('video_items_deduped', '重复作品已合并。', dedupedCount, { strategy: result.strategy, safePathname: safePath });
      }
      return { items, strategy: result.strategy };
    }
    const failedType = result.strategy === 'api'
      ? 'api_parse_failed'
      : result.strategy === 'table'
        ? 'table_parse_failed'
        : result.strategy === 'card'
          ? 'card_parse_failed'
          : 'link_parse_failed';
    addDiagnostic(failedType, `${result.strategy === 'api' ? '接口白名单' : result.strategy === 'table' ? '表格' : result.strategy === 'card' ? '卡片' : '链接'}解析未获得可确认作品。`, 0, { strategy: result.strategy, safePathname: safePath });
    if (skippedNoStableId > 0) {
      addDiagnostic('video_items_skipped_no_stable_id', '跳过缺少稳定标识的作品。', skippedNoStableId, { strategy: result.strategy, safePathname: safePath });
    }
  }

  return { items: [] as VideoCandidate[], strategy: null };
}

async function parseCurrentPageSafely(
  page: Page,
  apiCandidates: VideoCandidate[],
  addDiagnostic: (type: SocialCollectDiagnostic['type'], message: string, count?: number, extra?: DiagnosticExtra) => void,
) {
  try {
    return await parseCurrentPage(page, apiCandidates, addDiagnostic);
  } catch {
    addDiagnostic('video_list_parse_failed', '作品列表解析失败，已继续尝试其他入口。', 0, { safePathname: safePathname(page.url()) });
    addDiagnostic('page_structure_changed', '作品列表页面结构可能已变化。', 0, { safePathname: safePathname(page.url()) });
    return { items: [] as VideoCandidate[], strategy: null };
  }
}

function parseApiCandidatesOnly(
  apiCandidates: VideoCandidate[],
  addDiagnostic: (type: SocialCollectDiagnostic['type'], message: string, count?: number, extra?: DiagnosticExtra) => void,
  safePath: string,
) {
  let result: ReturnType<typeof dedupeCandidates>;
  try {
    result = dedupeCandidates(apiCandidates);
  } catch {
    addDiagnostic('work_api_field_mismatch', '接口候选标准化失败，已跳过本次候选。', 0, { strategy: 'api', safePathname: safePath });
    return { items: [] as VideoCandidate[], strategy: null };
  }
  const { items, skippedNoStableId, dedupedCount } = result;
  if (items.length > 0) {
    addDiagnostic('api_parse_success', '接口白名单解析成功。', items.length, { strategy: 'api', safePathname: safePath });
  }
  if (skippedNoStableId > 0) {
    addDiagnostic('video_items_skipped_no_stable_id', '跳过缺少稳定标识的作品。', skippedNoStableId, { strategy: 'api', safePathname: safePath });
  }
  if (dedupedCount > 0) {
    addDiagnostic('video_items_deduped', '重复作品已合并。', dedupedCount, { strategy: 'api', safePathname: safePath });
    addDiagnostic('video_candidate_skipped_duplicate', '重复作品候选已合并。', dedupedCount, { strategy: 'api', safePathname: safePath, skipReasonCounts: { duplicate: dedupedCount } });
  }
  return { items, strategy: items.length > 0 ? 'api' : null };
}

async function collectVideos(
  page: Page,
  apiCollector: ReturnType<typeof createSafeApiCollector>,
  addDiagnostic: (type: SocialCollectDiagnostic['type'], message: string, count?: number, extra?: DiagnosticExtra) => void,
  options: SocialCollectOptions = {},
) {
  const manualContentPath = normalizeContentPath(options.contentPath);
  const entries = [
    ...(manualContentPath ? [{ label: '人工作品管理路径', pathName: manualContentPath }] : []),
    { label: '创作者中心默认入口', pathName: '' },
    { label: '作品管理入口', pathName: '/creator-micro/content/manage' },
    { label: '发布管理入口', pathName: '/creator-micro/content/upload/manage' },
    { label: '内容数据入口', pathName: '/creator-micro/data/content' },
    { label: '视频数据入口', pathName: '/creator-micro/data/video' },
    { label: '创作工作台入口', pathName: '/creator-micro/workbench' },
  ];
  const probes: StructureProbe[] = [];

  if (options.contentPath) {
    addDiagnostic('content_manual_path_normalized', manualContentPath ? '人工路径已规范化为 pathname。' : '人工路径无效，已忽略。', manualContentPath ? 1 : 0, {
      safePathname: manualContentPath || '/',
    });
  }
  if (manualContentPath) {
    addDiagnostic('content_manual_path_used', '已使用人工作品管理路径。', 1, { safePathname: manualContentPath });
  }

  for (const entry of entries) {
    const safePath = entry.pathName || safePathname(CREATOR_CENTER_URL);
    const workApiCountBefore = apiCollector.getWorkApiTriggeredCount();
    addDiagnostic('content_entry_tried', `已尝试${entry.label}。`, 1, { safePathname: safePath });
    try {
      await gotoCreatorPage(page, entry.pathName);
    } catch {
      addDiagnostic('content_entry_failed', `${entry.label}打开失败。`, 1, { safePathname: safePath });
      continue;
    }

    const text = await readPageText(page);
    if (looksLoggedOut(page.url(), text)) {
      addDiagnostic('content_entry_login_required', '作品入口要求重新登录。', 1, { safePathname: safePathname(page.url()) });
      throw new Error(LOGIN_EXPIRED_MESSAGE);
    }
    if (/无权|没有权限|暂无权限|权限不足/.test(text)) {
      addDiagnostic('content_entry_failed', '当前账号无权访问作品管理页。', 1, { safePathname: safePathname(page.url()) });
      continue;
    }

    addDiagnostic(entry.pathName ? 'content_manage_page_loaded' : 'creator_page_loaded', `${entry.label}已加载。`, 1, { safePathname: safePathname(page.url()) });
    const probe = await probePageStructure(page, Array.from(apiCollector.apiPathnames), apiCollector.getWhitelistedFieldCount());
    probes.push(probe);
    addDiagnostic('structure_probe_done', '结构探测完成。', 1, { safePathname: probe.safePathname });
    if (probe.tableCandidateCount > 0) addDiagnostic('table_candidates_found', '发现表格候选。', probe.tableCandidateCount, { safePathname: probe.safePathname });
    if (probe.cardCandidateCount > 0) addDiagnostic('card_candidates_found', '发现卡片候选。', probe.cardCandidateCount, { safePathname: probe.safePathname });
    if (probe.videoHrefCount > 0) addDiagnostic('video_link_candidates_found', '发现视频链接候选。', probe.videoHrefCount, { safePathname: probe.safePathname });

    if (isLikelyContentPage(probe)) {
      addDiagnostic('content_entry_matched', '已进入疑似作品页。', 1, { safePathname: probe.safePathname });
      if (entry.pathName === manualContentPath) {
        addDiagnostic('content_manual_path_matched', '人工路径命中疑似作品页。', 1, { safePathname: probe.safePathname });
      }
    }
    const parsed = parseApiCandidatesOnly(apiCollector.candidates, addDiagnostic, probe.safePathname);
    if (parsed.items.length > 0) {
      addDiagnostic('content_entry_matched', '已匹配作品管理入口。', parsed.items.length, { strategy: parsed.strategy || undefined, safePathname: probe.safePathname });
      return { items: parsed.items, probes };
    }
  }

  if (apiCollector.getWorkApiTriggeredCount() === 0) {
    addDiagnostic('work_api_not_triggered', '候选路径未触发作品接口。', 0);
  }

  await gotoCreatorPage(page).catch(() => undefined);
  const menuCandidates = await discoverContentEntryCandidates(page).catch(() => []);
  if (menuCandidates.length === 0) {
    addDiagnostic('content_entry_not_found', '未发现作品管理入口。', 0);
  } else {
    addDiagnostic('content_entry_candidate_seen', '已发现作品入口候选。', menuCandidates.length);
  }

  for (let index = 0; index < Math.min(menuCandidates.length, MAX_CONTENT_ENTRY_CLICKS); index += 1) {
    const candidate = menuCandidates[index];
    const beforePath = safePathname(page.url());
    const beforeWorkApiCount = apiCollector.getWorkApiTriggeredCount();
    const clickedCandidate = await clickContentEntryCandidate(page, index).catch(() => false);
    if (!clickedCandidate) continue;
    addDiagnostic('content_entry_clicked', '已点击作品入口候选。', 1, { safePathname: candidate.pathname || beforePath });
    await waitForPageStable(page);
    const afterPath = safePathname(page.url());
    if (afterPath !== beforePath) {
      addDiagnostic('content_entry_path_changed', '点击后路径已变化。', 1, { safePathname: afterPath });
    }
    const text = await readPageText(page);
    if (looksLoggedOut(page.url(), text)) {
      addDiagnostic('content_entry_login_required', '作品入口要求重新登录。', 1, { safePathname: afterPath });
      throw new Error(LOGIN_EXPIRED_MESSAGE);
    }
    if (/无权|没有权限|暂无权限|权限不足/.test(text)) {
      addDiagnostic('content_entry_permission_denied', '当前账号无权访问作品管理页。', 1, { safePathname: afterPath });
      continue;
    }
    const probe = await probePageStructure(page, Array.from(apiCollector.apiPathnames), apiCollector.getWhitelistedFieldCount());
    probes.push(probe);
    addDiagnostic('structure_probe_done', '结构探测完成。', 1, { safePathname: probe.safePathname });
    if (isLikelyContentPage(probe)) {
      addDiagnostic('content_entry_matched', '已进入疑似作品页。', 1, { safePathname: probe.safePathname });
    }
    const parsed = parseApiCandidatesOnly(apiCollector.candidates, addDiagnostic, probe.safePathname);
    if (parsed.items.length > 0) return { items: parsed.items, probes };
    if (isLikelyContentPage(probe) && apiCollector.getWorkApiTriggeredCount() === beforeWorkApiCount) {
      addDiagnostic('work_api_not_triggered', '已进入疑似作品页但未触发作品接口。', 0, { safePathname: probe.safePathname });
    }
  }

  const clicked = await tryVisibleContentEntry(page).catch(() => false);
  if (clicked) {
    const probe = await probePageStructure(page, Array.from(apiCollector.apiPathnames), apiCollector.getWhitelistedFieldCount());
    probes.push(probe);
    addDiagnostic('content_entry_matched', '已从可见入口进入作品相关页面。', 1, { safePathname: probe.safePathname });
    addDiagnostic('structure_probe_done', '结构探测完成。', 1, { safePathname: probe.safePathname });
    const parsed = parseApiCandidatesOnly(apiCollector.candidates, addDiagnostic, probe.safePathname);
    if (parsed.items.length > 0) return { items: parsed.items, probes };
  }

  addDiagnostic('content_manage_page_missing', '作品管理页未打开。', 0);
  addDiagnostic('no_video_candidates', '未发现可确认作品候选。', 0);
  addDiagnostic('video_items_empty_with_reason', '作品明细为空并已记录原因。', 0);
  return { items: [] as VideoCandidate[], probes };
}

function toVideoSnapshots(items: VideoCandidate[]): NormalizedVideoSnapshot[] {
  return items.map((item) => ({
    platform: 'douyin',
    external_video_id: item.externalVideoId,
    title: item.title,
    video_url: item.videoUrl,
    cover_url: item.coverUrl,
    publish_time: item.publishTime,
    likes: item.likes ?? undefined,
    comments: item.comments ?? undefined,
    shares: item.shares ?? undefined,
    collects: item.collects ?? undefined,
    views: item.views ?? undefined,
    raw_json: {
      source: 'creator_center',
      strategy: item.source,
      parsedFields: {
        hasTitle: Boolean(item.title),
        hasPublishTime: Boolean(item.publishTime),
        hasViews: item.views !== null,
        hasLikes: item.likes !== null,
        hasComments: item.comments !== null,
        hasShares: item.shares !== null,
        hasCollects: item.collects !== null,
      },
    },
  }));
}

type CreatorItemApiRow = {
  id: string | null;
  description: string | null;
  create_time: string | number | null;
  cover: string | null;
  duration: number | null;
  status: string | null;
  visibility: string | null;
};

function creatorItemNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function creatorItemPublishTime(value: string | number | null) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date((value > 10_000_000_000 ? value : value * 1000)).toISOString();
  }
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

async function collectCreatorItems(
  page: Page,
  addDiagnostic: (type: SocialCollectDiagnostic['type'], message: string, count?: number, extra?: DiagnosticExtra) => void,
) {
  const videos: NormalizedVideoSnapshot[] = [];
  await triggerDouyinCreatorItemList(page);
  const seenIds = new Set<string>();
  let cursor = 0;

  for (let pageNumber = 0; pageNumber < 20 && videos.length < 500; pageNumber += 1) {
    const response = await page.evaluate(async ({ pageCursor, pageSize }) => {
      const url = new URL('/web/api/creator/item/list', window.location.origin);
      url.searchParams.set('cursor', String(pageCursor));
      url.searchParams.set('count', String(pageSize));
      const result = await fetch(url.toString(), { credentials: 'same-origin' });
      if (!result.ok) return { ok: false, hasMore: false, items: [] as CreatorItemApiRow[] };
      // The creator API serializes 19-digit work IDs as JSON numbers. Preserve only
      // the id numeric token as text before parsing so JavaScript cannot round it.
      // The raw body remains in memory and is never persisted or logged.
      const rawPayload = await result.text();
      const payload = JSON.parse(rawPayload.replace(/("id"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"')) as { items?: unknown; has_more?: unknown; max_cursor?: unknown; cursor?: unknown };
      const items = Array.isArray(payload.items) ? payload.items.map((value): CreatorItemApiRow => {
        const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        const cover = item.cover && typeof item.cover === 'object' ? item.cover as Record<string, unknown> : null;
        const urls = Array.isArray(cover?.url_list) ? cover.url_list : [];
        return {
          id: item.id == null ? null : String(item.id),
          description: typeof item.description === 'string' ? item.description : null,
          create_time: typeof item.create_time === 'string' || typeof item.create_time === 'number' ? item.create_time : null,
          cover: typeof item.cover === 'string' ? item.cover : typeof cover?.url === 'string' ? cover.url : typeof urls[0] === 'string' ? urls[0] : null,
          duration: typeof item.duration === 'number' ? item.duration : Number(item.duration) || null,
          status: item.status == null ? null : String(item.status),
          visibility: item.visibility == null ? null : String(item.visibility),
        };
      }) : [];
      const nextCursor = typeof payload.max_cursor === 'number' || typeof payload.max_cursor === 'string'
        ? Number(payload.max_cursor) : typeof payload.cursor === 'number' || typeof payload.cursor === 'string' ? Number(payload.cursor) : null;
      return { ok: true, hasMore: payload.has_more === true || payload.has_more === 1, nextCursor: Number.isFinite(nextCursor) ? nextCursor : null, items };
    }, { pageCursor: cursor, pageSize: Math.min(50, 500 - videos.length) });

    if (!response.ok) throw new Error('作品列表接口请求失败。');
    let added = 0;
    for (const item of response.items) {
      if (!item.id || seenIds.has(item.id) || videos.length >= 500) continue;
      seenIds.add(item.id);
      videos.push({
        platform: 'douyin',
        external_video_id: item.id,
        title: item.description,
        cover_url: item.cover,
        publish_time: creatorItemPublishTime(item.create_time),
        duration: creatorItemNumber(item.duration) ?? undefined,
        status: item.status,
        visibility: item.visibility,
        source_type: 'creator_item_api',
        raw_json: { source: 'creator_item_api', fields: ['id', 'description', 'create_time', 'cover', 'duration', 'status', 'visibility'] },
      });
      added += 1;
    }
    addDiagnostic('creator_item_api_page_collected', '作品列表接口页已采集。', added, { strategy: 'creator-item-api', safePathname: '/web/api/creator/item/list' });
    if (!response.hasMore || added === 0 || videos.length >= 500) {
      addDiagnostic('creator_item_api_pagination_stopped', '作品列表接口分页已停止。', videos.length, { strategy: 'creator-item-api', safePathname: '/web/api/creator/item/list' });
      break;
    }
    const nextCursor = response.nextCursor;
    if (nextCursor == null || nextCursor === cursor) {
      addDiagnostic('creator_item_api_pagination_stopped', '作品列表接口分页缺少有效游标，已防止循环。', videos.length, { strategy: 'creator-item-api', safePathname: '/web/api/creator/item/list' });
      break;
    }
    cursor = nextCursor;
  }
  return videos;
}

async function collectOfficialExport(
  page: Page,
  options: SocialCollectOptions,
  addDiagnostic: (type: SocialCollectDiagnostic['type'], message: string, count?: number, extra?: DiagnosticExtra) => void,
) {
  addDiagnostic('export_downloader_entered' as SocialCollectDiagnostic['type'], '已进入官方导出下载器。', 1, { safePathname: normalizeContentPath(options.contentPath) || '/' });
  const paths = [normalizeContentPath(options.exportPath), normalizeContentPath(options.contentPath), '/creator-micro/data-center/content', '/creator-micro/data-center/operation', '/creator-micro/data', '/creator-micro/data/video', '/creator-micro/workbench'].filter((value, index, items): value is string => Boolean(value) && items.indexOf(value) === index);
  for (const contentPath of paths) {
    addDiagnostic('export_page_navigation_attempted' as SocialCollectDiagnostic['type'], '已尝试进入官方导出页面。', 1, { safePathname: contentPath });
    await gotoCreatorPage(page, contentPath).catch(() => undefined);
    await waitForPageStable(page);
    const text = await readPageText(page);
    if (looksLoggedOut(page.url(), text)) throw new Error(LOGIN_EXPIRED_MESSAGE);
    if (/无权|没有权限|暂无权限|权限不足/.test(text)) {
      addDiagnostic('content_entry_permission_denied', '当前账号无权访问官方导出页面。', 1, { safePathname: safePathname(page.url()) });
      continue;
    }
    const downloaded = await downloadDouyinOfficialExport(page, (type, count, extra) => addDiagnostic(type as SocialCollectDiagnostic['type'], '官方导出下载器诊断。', count, extra));
    if (!downloaded.ok) {
      addDiagnostic(downloaded.reason === 'button_not_found' ? 'export_button_not_found' : 'export_download_failed', downloaded.reason === 'button_not_found' ? '未发现导出数据按钮。' : '官方导出下载失败。', 0, { safePathname: safePathname(page.url()) });
      addDiagnostic('export_incomplete' as SocialCollectDiagnostic['type'], '官方导出流程未完成：未发现导出入口。', 1, { safePathname: safePathname(page.url()) });
      continue;
    }
    addDiagnostic('export_button_found', '已发现官方导出数据按钮。', 1, { safePathname: safePathname(page.url()) });
    addDiagnostic('export_download_started', '官方导出下载已开始。', 1, { fileType: downloaded.fileType });
    addDiagnostic('export_download_completed', '官方导出下载已完成。', 1, { fileType: downloaded.fileType });
    addDiagnostic('export_file_detected', '已发现官方导出文件。', 1, { fileType: downloaded.fileType });
    try {
      const parsed = await parseDouyinOfficialExport(downloaded.filePath, 2);
      addDiagnostic('export_file_columns_analyzed' as SocialCollectDiagnostic['type'], '已完成官方导出列分析。', parsed.columnCount, { fileType: parsed.fileType, parsedRowCount: parsed.parsedRowCount, unmappedFieldCount: parsed.unmappedFieldCount, columnNames: parsed.columnStats.map((item) => item.name), columnStats: parsed.columnStats });
      addDiagnostic('export_id_candidates_identified' as SocialCollectDiagnostic['type'], '已识别稳定作品标识候选。', parsed.identifiedIdCount, { fileType: parsed.fileType, savedVideoCount: parsed.identifiedIdCount });
      const internalCount = parsed.videos.filter((video) => !video.external_video_id && video.internal_video_key).length;
      addDiagnostic('official_export_asset_mode' as SocialCollectDiagnostic['type'], internalCount > 0 ? '官方导出作品使用内部资产键。' : '官方导出作品使用外部平台标识。', 1, { strategy: internalCount > 0 ? 'internal_key' : 'external_id' });
      addDiagnostic('video_asset_generated_count' as SocialCollectDiagnostic['type'], '已生成内部作品资产键。', parsed.videos.length);
      addDiagnostic('video_external_id_count' as SocialCollectDiagnostic['type'], '已识别外部作品标识。', parsed.identifiedIdCount);
      addDiagnostic('video_internal_key_count' as SocialCollectDiagnostic['type'], '已识别内部作品资产键。', internalCount);
      addDiagnostic('export_file_parse_success', '官方导出文件解析成功。', 1, { fileType: parsed.fileType, parsedRowCount: parsed.parsedRowCount, skippedRowCount: parsed.skippedRowCount, unmappedFieldCount: parsed.unmappedFieldCount, skipReasonCounts: parsed.skipReasonCounts });
      addDiagnostic('export_rows_parsed', '已解析官方导出作品行。', parsed.parsedRowCount, { fileType: parsed.fileType, parsedRowCount: parsed.parsedRowCount });
      if (parsed.skippedRowCount > 0) addDiagnostic('export_rows_skipped_no_stable_id', '部分导出行缺少稳定作品标识已跳过。', parsed.skippedRowCount, { fileType: parsed.fileType, skippedRowCount: parsed.skippedRowCount });
      if (parsed.unmappedFieldCount > 0) addDiagnostic('export_fields_unmapped', '存在未映射导出字段。', parsed.unmappedFieldCount, { fileType: parsed.fileType, unmappedFieldCount: parsed.unmappedFieldCount });
      if (parsed.videos.length > 0) addDiagnostic('export_videos_saved', '官方导出作品明细已写入。', parsed.videos.length, { fileType: parsed.fileType, savedVideoCount: parsed.videos.length });
      else addDiagnostic('export_no_video_rows', '导出文件未发现可写入作品行。', 0, { fileType: parsed.fileType, parsedRowCount: parsed.parsedRowCount });
      return parsed.videos;
    } catch {
      addDiagnostic('export_file_parse_failed', '官方导出文件解析失败。', 0, { fileType: downloaded.fileType });
      return [] as NormalizedVideoSnapshot[];
    } finally {
      await removeDouyinExportFile(downloaded.filePath);
    }
  }
  return [] as NormalizedVideoSnapshot[];
}

export class DouyinPlaywrightAdapterV3 implements SocialReviewAdapter {
  async collect(account: SocialAccount, options: SocialCollectOptions = {}): Promise<SocialCollectResult> {
    const { diagnostics, add } = createDiagnostics();
    add('adapter_runtime_probe', '已进入抖音 V3 采集器。', 1, {
      adapterVersion: 'douyin-playwright-v3',
      collectMode: options.collectMode || 'standard',
      hasContentPath: Boolean(options.contentPath),
    });
    if (Number(account.id) !== 2) throw new Error('本阶段仅允许显式采集账号 ID 2。');
    if (!account.credential_ref) throw new Error('账号未配置采集凭据，请先扫码登录。');

    const credential = await getActiveCredentialByRef(account.credential_ref);
    let storageState: PlaywrightStorageState;
    try {
      storageState = normalizeStorageState(await decryptCredentialStorageState(credential));
      add('credential_valid', '采集凭据可用。', 1);
    } catch {
      throw new Error('采集凭据无法解密，请重新扫码登录。');
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless: process.env.SOCIAL_COLLECT_HEADLESS !== 'false' });
      context = await browser.newContext({ storageState });
      const page = await context.newPage();
      const apiCollector = createSafeApiCollector(add);
      page.on('response', (response) => {
        void apiCollector.onResponse(response);
      });

      await gotoCreatorPage(page);
      add('page_loaded', '页面已加载。', 1, { safePathname: safePathname(page.url()) });
      const text = await readPageText(page);
      if (looksLoggedOut(page.url(), text)) {
        await markCredentialExpired(account.credential_ref, LOGIN_EXPIRED_MESSAGE);
        add('credential_expired', LOGIN_EXPIRED_MESSAGE, 1);
        throw new Error(LOGIN_EXPIRED_MESSAGE);
      }

      const followers = findMetric(text, ['粉丝总数', '粉丝数', '粉丝']);
      const likesTotal = findMetric(text, ['获赞总数', '总获赞', '获赞']);
      const videoCount = findMetric(text, ['作品总数', '作品数', '视频数', '作品']);
      const worksCount = videoCount;

      if (followers === null && likesTotal === null && videoCount === null) {
        add('page_structure_changed', '账号指标区域页面结构可能已变化。', 0, { safePathname: safePathname(page.url()) });
        throw new Error('账号数据解析失败，请检查页面结构。');
      }
      add('account_metrics_parsed', '账号指标已解析。', 1);

      let videos: NormalizedVideoSnapshot[] = [];
      const apiCollectorPathnames = Array.from(apiCollector.apiPathnames);
      let probes: StructureProbe[] = [
        await probePageStructure(page, apiCollectorPathnames, apiCollector.getWhitelistedFieldCount()).catch(() => ({
          safePathname: safePathname(page.url()),
          title: '',
          navTextCount: 0,
          keywordTextCount: 0,
          tableCandidateCount: 0,
          tableRowCount: 0,
          cardCandidateCount: 0,
          linkCandidateCount: 0,
          videoHrefCount: 0,
          apiPathCount: apiCollectorPathnames.length,
          whitelistedApiFieldCount: apiCollector.getWhitelistedFieldCount(),
        })),
      ];
      add('structure_probe_done', '结构探测完成。', 1, { safePathname: probes[0]?.safePathname });
      try {
        const collectMode = options.collectMode || 'standard';
        add('collect_mode_received', '已接收采集模式。', 1, { strategy: collectMode });
        if (collectMode === 'official-export') {
          add('collect_mode_official_export_selected', '已选择官方导出采集模式。', 1);
          add('export_mode_selected', '已进入官方导出采集分支。', 1);
          if (options.contentPath) add('export_content_path_received', '已接收官方导出页面路径。', 1, { safePathname: normalizeContentPath(options.contentPath) || '/' });
          videos = await collectOfficialExport(page, options, add);
        } else if (collectMode === 'creator-item-api') {
          add('collect_mode_creator_item_api_selected', '已选择作品列表接口采集模式。', 1, { strategy: 'creator-item-api', safePathname: '/web/api/creator/item/list' });
          videos = await collectCreatorItems(page, add);
        } else {
          const collected = await collectVideos(page, apiCollector, add, options);
          probes = [...probes, ...collected.probes];
          videos = toVideoSnapshots(collected.items);
        }
        if (videos.length > 0) {
          add('video_items_saved', '作品明细已写入。', videos.length);
          add('work_api_items_saved', '作品明细已写入。', videos.length);
        } else {
          add('video_items_empty_with_reason', '作品明细为空并已记录原因。', 0);
        }
      } catch (videoError) {
        const videoMessage = videoError instanceof Error ? videoError.message : String(videoError || '');
        if (videoMessage === LOGIN_EXPIRED_MESSAGE) throw videoError;
        const errorName = videoError instanceof Error && videoError.name ? videoError.name : '未知错误';
        add('content_entry_failed', `作品入口探测失败：${errorName}`, 0);
        add('content_entry_not_found', '未发现作品管理入口。', 0);
        add('work_api_not_triggered', '作品入口探测未触发作品接口。', 0);
        add('video_list_parse_failed', '账号指标采集成功，作品列表解析失败。', 0);
        add('page_structure_changed', '作品列表页面结构可能已变化。', 0);
      }

      const fetchedAt = nowText();
      return {
        accountSnapshot: {
          platform: 'douyin',
          external_account_id: account.external_account_id || String(account.id),
          account_name: account.account_name,
          display_name: account.display_name || account.account_name,
          profile_url: account.profile_url,
          avatar_url: account.avatar_url,
          snapshot_date: fetchedAt.slice(0, 10),
          followers: followers ?? undefined,
          following_count: undefined,
          likes_total: likesTotal ?? undefined,
          video_count: videoCount ?? undefined,
          works_count: worksCount ?? undefined,
          engagement_est: undefined,
          source_method: 'creator_center_playwright',
          source_project: 'social-review',
          raw_json: {
            source: 'creator_center',
            parsedFields: {
              hasFollowers: followers !== null,
              hasLikesTotal: likesTotal !== null,
              hasVideoCount: videoCount !== null,
            },
            diagnostics,
            structureProbe: probes.slice(-3),
          },
          fetched_at: fetchedAt,
        },
        videos,
        diagnostics,
      };
    } catch (error) {
      const message = sanitizeErrorMessage(error);
      if (message === LOGIN_EXPIRED_MESSAGE && account.credential_ref) {
        await markCredentialExpired(account.credential_ref, LOGIN_EXPIRED_MESSAGE);
      }
      throw new Error(message);
    } finally {
      await closeQuietly(browser, context);
    }
  }
}
