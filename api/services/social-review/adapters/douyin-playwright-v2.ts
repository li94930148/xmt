import type { Browser, BrowserContext, Page } from 'playwright';
import type { SocialAccount } from '@shared/types/social-review';
import { decryptCredentialStorageState, getActiveCredentialByRef, markCredentialExpired } from '../credentials.js';
import { sanitizeErrorMessage } from '../credentialCrypto.js';
import type { SocialCollectDiagnostic, SocialCollectResult, SocialReviewAdapter } from './base.js';

const CREATOR_CENTER_URL = process.env.DOUYIN_CREATOR_CENTER_URL || 'https://creator.douyin.com/';
const LOGIN_EXPIRED_MESSAGE = '登录凭据已失效，请重新扫码登录。';
const MAX_VIDEO_ITEMS = 20;
const MAX_SCROLL_TIMES = 5;
type PlaywrightStorageState = NonNullable<Parameters<Browser['newContext']>[0]>['storageState'];

type ExtractedVideoCandidate = {
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
};

function nowText() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function createDiagnostics() {
  const diagnostics: SocialCollectDiagnostic[] = [];
  const add = (type: SocialCollectDiagnostic['type'], message: string, count?: number) => {
    diagnostics.push({ type, message, count, at: nowText() });
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
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
}

async function stabilizeAndScroll(page: Page) {
  for (let index = 0; index < MAX_SCROLL_TIMES; index += 1) {
    await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight, 600))).catch(() => undefined);
    await page.waitForTimeout(900);
  }
}

function extractVideoId(url: string | null) {
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

function parseMetricFromText(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[：:\\s]*([0-9][0-9,.]*(?:\\.\\d+)?\\s*(?:万|亿|w|k)?\\+?|\\*)`, 'i');
    const parsed = normalizeDouyinNumber(text.match(pattern)?.[1]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function normalizeVideoTitle(text: string, url: string | null) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(播放|点赞|评论|分享|收藏|发布时间|作品数据|查看详情)/.test(line));
  const title = lines.find((line) => line.length >= 2 && line.length <= 80) || null;
  if (title && !extractVideoId(title) && title !== url) return title;
  return null;
}

async function extractVideoCandidates(page: Page): Promise<{
  items: ExtractedVideoCandidate[];
  skipped: number;
  parseFailedFields: number;
}> {
  const rawItems = await page.evaluate((maxItems) => {
    const toText = (value: string | null | undefined) => String(value || '').trim();
    const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    return anchors
      .map((anchor) => {
        const href = anchor.href || anchor.getAttribute('href') || '';
        const safeHref = /^https?:\/\//i.test(href) ? href : '';
        const textHost = anchor.closest('tr, li, article, section, div') || anchor;
        const text = toText((textHost as HTMLElement).innerText || anchor.innerText);
        const image = textHost.querySelector('img') as HTMLImageElement | null;
        return { href: safeHref, text: text.slice(0, 800), image: image?.src || '' };
      })
      .filter((item) => /video|aweme|item_id|modal_id|note/.test(item.href))
      .slice(0, maxItems * 3);
  }, MAX_VIDEO_ITEMS);

  const seen = new Set<string>();
  let skipped = 0;
  let parseFailedFields = 0;
  const items: ExtractedVideoCandidate[] = [];

  for (const item of rawItems) {
    const url = item.href || null;
    const externalVideoId = extractVideoId(url);
    if (!externalVideoId) {
      skipped += 1;
      continue;
    }
    if (seen.has(externalVideoId)) continue;
    seen.add(externalVideoId);

    const text = item.text || '';
    const candidate: ExtractedVideoCandidate = {
      externalVideoId,
      title: normalizeVideoTitle(text, url),
      videoUrl: url,
      coverUrl: item.image || null,
      publishTime: text.match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/)?.[0]?.replace(/[年月/.]/g, '-').replace(/日/g, '') || null,
      views: parseMetricFromText(text, ['播放量', '播放', '观看']),
      likes: parseMetricFromText(text, ['点赞量', '点赞', '赞']),
      comments: parseMetricFromText(text, ['评论量', '评论']),
      shares: parseMetricFromText(text, ['分享量', '分享']),
      collects: parseMetricFromText(text, ['收藏量', '收藏']),
    };

    if (/(播放|点赞|评论|分享|收藏)/.test(text)) {
      for (const key of ['views', 'likes', 'comments', 'shares', 'collects'] as const) {
        if (candidate[key] === null) parseFailedFields += 1;
      }
    }

    items.push(candidate);
    if (items.length >= MAX_VIDEO_ITEMS) break;
  }

  return { items, skipped, parseFailedFields };
}

async function collectVideos(
  page: Page,
  addDiagnostic: (type: SocialCollectDiagnostic['type'], message: string, count?: number) => void,
) {
  const candidatePaths = ['', '/creator-micro/content/manage', '/creator-micro/content/upload/manage'];
  let bestItems: ExtractedVideoCandidate[] = [];
  let skippedTotal = 0;
  let parseFailedFieldsTotal = 0;
  let sawListSignal = false;

  for (const pathName of candidatePaths) {
    if (pathName) await gotoCreatorPage(page, pathName).catch(() => undefined);
    await stabilizeAndScroll(page);
    const text = await readPageText(page);
    if (looksLoggedOut(page.url(), text)) throw new Error(LOGIN_EXPIRED_MESSAGE);
    if (/作品|内容管理|发布|播放|点赞|评论/.test(text)) sawListSignal = true;

    const extracted = await extractVideoCandidates(page);
    skippedTotal += extracted.skipped;
    parseFailedFieldsTotal += extracted.parseFailedFields;
    if (extracted.items.length > bestItems.length) bestItems = extracted.items;
    if (bestItems.length >= MAX_VIDEO_ITEMS) break;
  }

  if (bestItems.length > 0) {
    addDiagnostic('video_list_found', '已找到作品列表。', bestItems.length);
    addDiagnostic('video_items_parsed', '作品条目已解析。', bestItems.length);
  } else if (sawListSignal) {
    addDiagnostic('video_list_parse_failed', '账号指标采集成功，作品列表解析失败。', 0);
    addDiagnostic('page_structure_changed', '作品列表页面结构可能已变化。', 0);
  } else {
    addDiagnostic('video_list_empty', '未读取到作品列表。', 0);
  }

  if (skippedTotal > 0) addDiagnostic('video_items_skipped', '部分作品缺少稳定视频标识，已跳过。', skippedTotal);
  if (parseFailedFieldsTotal > 0) addDiagnostic('video_items_skipped', '部分作品指标无法标准化，已保留为空。', parseFailedFieldsTotal);

  return bestItems.map((item) => ({
    platform: 'douyin' as const,
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

export class DouyinPlaywrightAdapterV2 implements SocialReviewAdapter {
  async collect(account: SocialAccount): Promise<SocialCollectResult> {
    const { diagnostics, add } = createDiagnostics();
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
      await gotoCreatorPage(page);
      add('page_loaded', '页面已加载。', 1);

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
        add('page_structure_changed', '账号指标区域页面结构可能已变化。', 0);
        throw new Error('账号数据解析失败，请检查页面结构。');
      }
      add('account_metrics_parsed', '账号指标已解析。', 1);

      let videos: Awaited<ReturnType<typeof collectVideos>> = [];
      try {
        videos = await collectVideos(page, add);
      } catch (videoError) {
        const videoMessage = videoError instanceof Error ? videoError.message : String(videoError || '');
        if (videoMessage === LOGIN_EXPIRED_MESSAGE) {
          throw videoError;
        }
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
