import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const OUTPUT_PATH = path.resolve(process.cwd(), 'data/social-review-debug/creator-api-map.json');
const CDP_CANDIDATES = ['http://127.0.0.1:9222', 'http://127.0.0.1:9223', 'http://127.0.0.1:9224'];
const CREATOR_ORIGIN = 'https://creator.douyin.com';
const ROUTES = [
  { label: '账号总览', path: '/creator-micro/data-center/operation', actions: [] },
  { label: '作品分析', path: '/creator-micro/data-center/content', actions: ['作品分析', '投稿列表', '粉丝分析', '重点关注'] },
];
const KEYWORD_PATTERN = /item|performance|analysis|fans|growth|statistics|overview|data|trend|export/i;
const SENSITIVE_FIELD_PATTERN = /cookie|token|authorization|headers?|session|storage|password|secret/i;
const METRIC_FIELD_ALIASES = {
  views: ['play_count', 'view_count', 'views', 'play'],
  likes: ['like_count', 'digg_count', 'likes'],
  comments: ['comment_count', 'comments'],
  shares: ['share_count', 'shares'],
  followers: ['follower_count', 'followers', 'fans_count', 'fan_count'],
};
const MAX_DEPTH = 5;
const MAX_FIELDS = 120;

function safePathname(value) {
  try {
    return new URL(value).pathname || '/';
  } catch {
    return '/';
  }
}

function safeFieldName(key) {
  return !SENSITIVE_FIELD_PATTERN.test(key) && !/^\d+$/.test(key) && /^[a-zA-Z0-9_.-]+$/.test(key);
}

function valueType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function summarizeJson(value) {
  const fields = new Set();
  const fieldTypes = {};
  let fieldCount = 0;

  function visit(node, depth) {
    if (depth > MAX_DEPTH || fieldCount >= MAX_FIELDS || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 3)) visit(item, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (!safeFieldName(key) || fieldCount >= MAX_FIELDS) continue;
      fieldCount += 1;
      fields.add(key);
      fieldTypes[key] ||= valueType(child);
      visit(child, depth + 1);
    }
  }

  visit(value, 0);
  const possibleMetrics = Object.entries(METRIC_FIELD_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => fields.has(alias)))
    .map(([metric]) => metric);
  return {
    fields: [...fields].sort(),
    fieldTypes: Object.fromEntries(Object.entries(fieldTypes).sort(([a], [b]) => a.localeCompare(b))),
    fieldCount: fields.size,
    possibleMetrics,
  };
}

async function resolveCdpUrl() {
  const candidates = process.env.CHROME_CDP_URL ? [process.env.CHROME_CDP_URL] : CDP_CANDIDATES;
  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return baseUrl;
    } catch {
      // Probe the next local debugging endpoint without inspecting browser state.
    }
  }
  throw new Error('未发现本机 Chrome CDP。请使用已登录的 Chrome 并启用 remote-debugging-port。');
}

async function findCreatorPage(browser) {
  const pages = browser.contexts().flatMap((context) => context.pages());
  return pages.find((page) => safePathname(page.url()).startsWith('/creator-micro/')) || pages.find((page) => page.url().startsWith(CREATOR_ORIGIN)) || pages[0] || null;
}

async function clickIfVisible(page, text) {
  const exact = page.getByText(text, { exact: true }).first();
  if (await exact.isVisible().catch(() => false)) {
    await exact.click({ timeout: 5000 });
    return true;
  }
  return false;
}

async function main() {
  const cdpUrl = await resolveCdpUrl();
  const browser = await chromium.connectOverCDP(cdpUrl);
  const page = await findCreatorPage(browser);
  if (!page) throw new Error('已连接 Chrome，但没有可用标签页。');

  const records = new Map();
  const pendingSummaries = new Set();
  let currentPage = '当前页面';

  page.on('response', (response) => {
    const task = (async () => {
      const request = response.request();
      if (!['fetch', 'xhr'].includes(request.resourceType())) return;
      const pathname = safePathname(response.url());
      const key = `${currentPage}|${request.method()}|${pathname}`;
      const record = records.get(key) || {
        page: currentPage,
        pathname,
        method: request.method(),
        status: response.status(),
        fields: [],
        fieldTypes: {},
        fieldCount: 0,
        possibleMetrics: [],
        keywordMatched: KEYWORD_PATTERN.test(pathname),
      };
      record.status = response.status();
      records.set(key, record);

      const contentType = await response.headerValue('content-type');
      if (!/application\/json|\+json/i.test(contentType || '')) return;
      try {
        Object.assign(record, summarizeJson(await response.json()));
      } catch {
        // A body that cannot be parsed as JSON is deliberately omitted.
      }
    })();
    pendingSummaries.add(task);
    void task.finally(() => pendingSummaries.delete(task));
  });

  try {
    for (const route of ROUTES) {
      currentPage = route.label;
      await page.goto(`${CREATOR_ORIGIN}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
      await page.waitForTimeout(1000);

      for (const action of route.actions) {
        currentPage = `${route.label} / ${action}`;
        if (await clickIfVisible(page, action)) {
          await page.waitForTimeout(800);
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
        }
      }
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await Promise.all([...pendingSummaries]);
      await page.waitForTimeout(300);
      if (pendingSummaries.size === 0) break;
    }

    const output = [...records.values()]
      .sort((a, b) => Number(b.keywordMatched) - Number(a.keywordMatched) || b.possibleMetrics.length - a.possibleMetrics.length || a.page.localeCompare(b.page) || a.pathname.localeCompare(b.pathname));
    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    const pages = [...new Set(output.map((record) => record.page))];
    const metricFields = [...new Set(output.flatMap((record) => record.possibleMetrics))].sort();
    console.log(`安全摘要已写入：${path.relative(process.cwd(), OUTPUT_PATH)}`);
    console.log(`发现接口数量：${output.length}`);
    console.log(`页面列表：${pages.join('、') || '无'}`);
    console.log(`指标字段列表：${metricFields.join('、') || '无'}`);
  } finally {
    // Do not close the CDP-connected browser or user-owned pages.
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`创作者中心接口地图探测失败：${error instanceof Error ? error.message : '未知错误'}`);
    process.exit(1);
  });
