import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { queryOne } from '../api/database/utils.ts';
import { decryptCredentialStorageState, getActiveCredentialByRef } from '../api/services/social-review/credentials.ts';

const ACCOUNT_ID = 2;
const TARGET_URL = 'https://creator.douyin.com/creator-micro/data-center/content';
const OUTPUT_PATH = path.resolve(process.cwd(), 'data/social-review-debug/video-metric-api-probe.json');
const URL_CANDIDATE_PATTERN = /item|video|content|analysis|metric|statistics|detail|list|data/i;
const SENSITIVE_FIELD_PATTERN = /cookie|token|authorization|headers?|session|storage|password|secret/i;
const METRIC_FIELDS = ['play_count', 'view_count', 'like_count', 'comment_count', 'share_count', 'favorite_count', 'collect_count'];
const VIDEO_ID_FIELDS = ['video_id', 'item_id', 'aweme_id', 'id'];
const MAX_DEPTH = 5;
const MAX_KEYS = 100;

function safePathname(value) {
  try {
    return new URL(value).pathname || '/';
  } catch {
    return '/';
  }
}

function normalizeStorageState(payload) {
  const candidate = payload && typeof payload === 'object' && 'storageState' in payload
    ? payload.storageState
    : payload;
  if (!candidate || typeof candidate !== 'object') throw new Error('凭据无法用于启动本地探测。');
  return candidate;
}

function safeFieldName(key) {
  return !SENSITIVE_FIELD_PATTERN.test(key) && !/^\d+$/.test(key) && /^[a-zA-Z0-9_.-]+$/.test(key);
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function summarizeJson(value) {
  const fields = new Set();
  const arrayFields = new Set();
  const jsonHierarchy = new Set();
  const fieldTypes = {};
  let keyCount = 0;

  function visit(node, nodePath, depth) {
    if (depth > MAX_DEPTH || keyCount >= MAX_KEYS || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (nodePath) arrayFields.add(nodePath);
      jsonHierarchy.add(`${nodePath || '$'}[]`);
      for (const item of node.slice(0, 3)) visit(item, nodePath ? `${nodePath}[]` : '[]', depth + 1);
      return;
    }

    jsonHierarchy.add(nodePath || '$');
    for (const [key, nested] of Object.entries(node)) {
      if (!safeFieldName(key) || keyCount >= MAX_KEYS) continue;
      keyCount += 1;
      const childPath = nodePath ? `${nodePath}.${key}` : key;
      fields.add(key);
      fieldTypes[key] ||= typeOf(nested);
      visit(nested, childPath, depth + 1);
    }
  }

  visit(value, '', 0);
  const fieldList = [...fields].sort();
  const foundMetricFields = METRIC_FIELDS.filter((field) => fields.has(field));
  const foundVideoIdFields = VIDEO_ID_FIELDS.filter((field) => fields.has(field));
  return {
    fields: fieldList,
    jsonHierarchy: [...jsonHierarchy].sort(),
    arrayFields: [...arrayFields].sort(),
    fieldTypes: Object.fromEntries(Object.entries(fieldTypes).sort(([a], [b]) => a.localeCompare(b))),
    metrics: {
      views: fields.has('play_count') || fields.has('view_count'),
      likes: fields.has('like_count'),
      comments: fields.has('comment_count'),
      shares: fields.has('share_count'),
      favorites: fields.has('favorite_count') || fields.has('collect_count'),
      matchedFields: foundMetricFields,
    },
    videoIdFields: foundVideoIdFields,
    canLinkByVideoId: foundVideoIdFields.length > 0,
  };
}

function scoreCandidate(record) {
  const metrics = record.metrics || {};
  return Number(Boolean(metrics.views)) + Number(Boolean(metrics.likes)) + Number(Boolean(metrics.comments))
    + Number(Boolean(metrics.shares)) + Number(Boolean(metrics.favorites)) + Number(Boolean(record.canLinkByVideoId));
}

async function clickVisibleText(page, text) {
  const exact = page.getByText(text, { exact: true }).first();
  if (await exact.isVisible().catch(() => false)) {
    await exact.click({ timeout: 10000 });
    return true;
  }
  const partial = page.getByText(text).first();
  if (await partial.isVisible().catch(() => false)) {
    await partial.click({ timeout: 10000 });
    return true;
  }
  return false;
}

async function getProbeCredential() {
  const account = await queryOne(
    `SELECT credential_ref
       FROM social_accounts
      WHERE id = ? AND platform = 'douyin' AND active = 1 AND credential_ref IS NOT NULL
      LIMIT 1`,
    [ACCOUNT_ID],
  );
  if (!account?.credential_ref) throw new Error('账号 2 未找到有效的抖音 social-review 凭据。');
  return getActiveCredentialByRef(String(account.credential_ref));
}

async function main() {
  const credential = await getProbeCredential();
  const storageState = normalizeStorageState(await decryptCredentialStorageState(credential));
  const records = new Map();
  const pendingSummaries = new Set();
  const browser = await chromium.launch({ headless: process.env.SOCIAL_COLLECT_HEADLESS !== 'false' });
  let context;

  try {
    context = await browser.newContext({ storageState });
    const page = await context.newPage();

    page.on('response', (response) => {
      const task = (async () => {
        const request = response.request();
        if (!['xhr', 'fetch'].includes(request.resourceType())) return;
        const pathname = safePathname(response.url());
        if (!URL_CANDIDATE_PATTERN.test(pathname)) return;

        const key = `${request.method()} ${pathname}`;
        const record = records.get(key) || { pathname, method: request.method(), status: response.status(), fields: [] };
        record.status = response.status();
        records.set(key, record);

        const contentType = await response.headerValue('content-type');
        if (!/application\/json|\+json/i.test(contentType || '')) return;
        try {
          Object.assign(record, summarizeJson(await response.json()));
        } catch {
          // The response body is deliberately not retained when it is not JSON-readable.
        }
      })();
      pendingSummaries.add(task);
      void task.finally(() => pendingSummaries.delete(task));
    });

    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await clickVisibleText(page, '数据中心');
    await page.waitForTimeout(700);
    await clickVisibleText(page, '作品分析');
    await page.waitForTimeout(700);
    await clickVisibleText(page, '投稿列表');
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await Promise.all([...pendingSummaries]);
      await page.waitForTimeout(300);
      if (pendingSummaries.size === 0) break;
    }

    const requests = [...records.values()]
      .sort((a, b) => scoreCandidate(b) - scoreCandidate(a) || a.pathname.localeCompare(b.pathname) || a.method.localeCompare(b.method));
    const candidateRanking = requests
      .filter((record) => scoreCandidate(record) > 0)
      .map((record, index) => ({
        rank: index + 1,
        pathname: record.pathname,
        method: record.method,
        status: record.status,
        metrics: record.metrics,
        canLinkByVideoId: record.canLinkByVideoId,
        videoIdFields: record.videoIdFields,
      }));
    const output = { pagePath: safePathname(page.url()), requests, candidateRanking };

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    console.log(`安全摘要已写入：${path.relative(process.cwd(), OUTPUT_PATH)}`);
    if (!candidateRanking.length) console.log('未发现包含作品指标字段的候选接口。');
    for (const item of candidateRanking) {
      const metricNames = item.metrics.matchedFields.join(', ') || '未发现指标字段';
      console.log(`${item.rank}. ${item.method} ${item.pathname} (${item.status}) — ${metricNames}；${item.canLinkByVideoId ? `可通过 ${item.videoIdFields.join(', ')} 关联作品` : '未发现可关联作品 ID'}`);
    }
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`作品指标接口探测失败：${error instanceof Error ? error.message : '未知错误'}`);
  process.exit(1);
});
