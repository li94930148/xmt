import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const OUTPUT = path.resolve('data/social-review-debug/interaction-discovery.json');
const ORIGIN = 'https://creator.douyin.com';
const CDP_CANDIDATES = ['http://127.0.0.1:9222', 'http://127.0.0.1:9223', 'http://127.0.0.1:9224'];
const ROUTES = [
  { page: '作品分析', path: '/creator-micro/data-center/content', actions: ['投稿列表', '数据详情', '分析详情', '导出数据'] },
  { page: '作品管理', path: '/creator-micro/content/manage', actions: ['作品列表', '数据详情', '分析详情', '导出数据'] },
  { page: '账号总览', path: '/creator-micro/data-center/operation', actions: [] },
  { page: '粉丝分析', path: '/creator-micro/data-center/fans', actions: [] },
  { page: '重点关注', path: '/creator-micro/data-center/focus', actions: [] },
];
const ID_FIELDS = new Set(['id', 'item_id', 'itemId', 'aweme_id', 'awemeId', 'video_id', 'videoId']);
const METRIC_FIELDS = new Set(['play_count', 'view_count', 'like_count', 'comment_count', 'share_count', 'favorite_count', 'collect_count', 'digg_count']);
const KEYWORDS = /item|video|content|analysis|metric|statistics|detail|list|data|export|fans|growth|trend/i;
const SENSITIVE = /cookie|token|authorization|headers?|session|storage|password|secret|trace|signature|sign$|strdata|user_agent|referer/i;
const MAX_DEPTH = 6;
const MAX_FIELDS = 150;

function pathname(value) { try { return new URL(value).pathname || '/'; } catch { return '/'; } }
function safeKey(key) { return !SENSITIVE.test(key) && /^[A-Za-z0-9_.-]+$/.test(key); }
function typeOf(value) { return Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value; }
function sample(value) {
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return undefined;
}

function requestShape(request) {
  const raw = request.postData();
  if (!raw || raw.length > 20_000) return null;
  try { return summarizeJson(JSON.parse(raw)); } catch { return null; }
}

function summarizeJson(value) {
  const fields = new Map(); const idFields = new Set(); const metricFields = new Set(); let matchedPatternCount = 0;
  function visit(node, depth, prefix = '') {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH || fields.size >= MAX_FIELDS) return;
    if (Array.isArray(node)) { for (const child of node.slice(0, 20)) visit(child, depth + 1, `${prefix}[]`); return; }
    const keys = Object.keys(node).filter(safeKey);
    const ids = keys.filter((key) => ID_FIELDS.has(key)); const metrics = keys.filter((key) => METRIC_FIELDS.has(key));
    if (ids.length && metrics.length) matchedPatternCount += 1;
    for (const key of keys) {
      if (fields.size >= MAX_FIELDS) break;
      const child = node[key]; const fieldPath = prefix ? `${prefix}.${key}` : key;
      if (!fields.has(fieldPath)) fields.set(fieldPath, { name: key, path: fieldPath, type: typeOf(child), sample: sample(child) });
      if (ID_FIELDS.has(key)) idFields.add(key);
      if (METRIC_FIELDS.has(key)) metricFields.add(key);
      visit(child, depth + 1, fieldPath);
    }
  }
  visit(value, 0);
  return { fields: [...fields.values()], idFields: [...idFields].sort(), metricFields: [...metricFields].sort(), matchedPatternCount };
}

async function resolveCdpUrl() {
  for (const base of process.env.CHROME_CDP_URL ? [process.env.CHROME_CDP_URL] : CDP_CANDIDATES) {
    try { if ((await fetch(`${base.replace(/\/$/, '')}/json/version`, { signal: AbortSignal.timeout(1500) })).ok) return base; } catch { /* next local port */ }
  }
  throw new Error('未发现本机 Chrome CDP。请启动已登录的 Chrome 并开启 remote-debugging-port。');
}

async function clickText(page, text) {
  const button = page.getByText(text, { exact: true }).first();
  if (!await button.isVisible().catch(() => false)) return false;
  await button.click({ timeout: 5000 });
  await page.waitForTimeout(1200);
  return true;
}

async function visibleButtonTexts(page) {
  return page.locator('button, [role="button"]').evaluateAll((nodes) => nodes
    .map((node) => (node.textContent || '').trim().replace(/\s+/g, ' '))
    .filter((text) => text && text.length <= 80)
    .slice(0, 80)).catch(() => []);
}

async function main() {
  const browser = await chromium.connectOverCDP(await resolveCdpUrl());
  const page = browser.contexts().flatMap((context) => context.pages()).find((item) => item.url().startsWith(ORIGIN)) || browser.contexts().flatMap((context) => context.pages())[0];
  if (!page) throw new Error('已连接 Chrome，但没有可用页面。');

  const records = new Map(); const operations = []; const pending = new Set(); let sourcePage = '当前页面';
  page.on('response', (response) => {
    const task = (async () => {
      const request = response.request();
      if (!['fetch', 'xhr'].includes(request.resourceType())) return;
      const endpoint = pathname(response.url());
      const queryParams = (() => { try { return [...new URL(response.url()).searchParams.keys()].filter(safeKey).sort(); } catch { return []; } })();
      const key = `${sourcePage}|${request.method()}|${endpoint}`;
      const record = records.get(key) || { page: sourcePage, pathname: endpoint, method: request.method(), status: response.status(), queryParams, requestShape: requestShape(request), response: { fields: [], idFields: [], metricFields: [], matchedPatternCount: 0 } };
      record.status = response.status(); records.set(key, record);
      if (!KEYWORDS.test(endpoint) || !/json/i.test((await response.headerValue('content-type')) || '')) return;
      try {
        const summary = summarizeJson(await response.json());
        record.response = summary;
      } catch { /* never retain an unreadable response body */ }
    })();
    pending.add(task); void task.finally(() => pending.delete(task));
  });

  for (const route of ROUTES) {
    sourcePage = route.page;
    await page.goto(`${ORIGIN}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    operations.push({ page: route.page, path: route.path, buttons: await visibleButtonTexts(page) });
    for (const action of route.actions) {
      sourcePage = `${route.page} / ${action}`;
      operations.push({ page: sourcePage, action, clicked: await clickText(page, action) });
    }
  }
  await Promise.all([...pending]);
  const endpoints = [...records.values()].sort((a, b) => b.response.matchedPatternCount - a.response.matchedPatternCount || b.response.metricFields.length - a.response.metricFields.length || a.pathname.localeCompare(b.pathname));
  const candidates = endpoints.filter((item) => item.response.idFields.length && item.response.metricFields.length).map((item) => ({ endpoint: item.pathname, method: item.method, page: item.page, idFields: item.response.idFields, metricFields: item.response.metricFields, matchedPatternCount: item.response.matchedPatternCount }));
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify({ operations, endpoints, candidates }, null, 2)}\n`, 'utf8');
  console.log(`安全诊断已写入：${path.relative(process.cwd(), OUTPUT)}`);
  console.log(`页面路径：${ROUTES.map((item) => item.path).join('、')}`);
  console.log(`候选接口数量：${candidates.length}`);
  for (const item of candidates) console.log(`${item.method} ${item.endpoint} | ID=${item.idFields.join(',')} | 指标=${item.metricFields.join(',')}`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(`互动指标探索失败：${error instanceof Error ? error.message : '未知错误'}`); process.exit(1); });
