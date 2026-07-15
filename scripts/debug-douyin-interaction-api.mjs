import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const OUTPUT = path.resolve('data/social-review-debug/interaction-api-probe.json');
const CDP = process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';
const ROUTES = [
  ['作品管理', 'https://creator.douyin.com/creator-micro/content/manage', ['作品列表', '数据详情']],
  ['作品分析', 'https://creator.douyin.com/creator-micro/data-center/content', ['作品分析', '投稿列表', '数据详情', '单作品分析']],
];
const ID_FIELDS = new Set(['id', 'item_id', 'ItemId', 'aweme_id', 'awemeId', 'video_id', 'videoId']);
const METRIC_FIELDS = new Set(['like_count', 'LikeCount', 'comment_count', 'CommentCount', 'share_count', 'ShareCount', 'collect_count', 'CollectCount', 'favorite_count', 'FavoriteCount']);
const SENSITIVE = /cookie|token|authorization|headers?|session|storage|password|secret/i;

function pathname(value) { try { return new URL(value).pathname || '/'; } catch { return '/'; } }
function safeKey(key) { return !SENSITIVE.test(key) && /^[A-Za-z0-9_.-]+$/.test(key); }
function inspect(value) {
  const idFields = new Set(); const metricFields = new Set(); let matchedPatternCount = 0;
  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) { for (const item of node.slice(0, 50)) walk(item, depth + 1); return; }
    const keys = Object.keys(node).filter(safeKey);
    const ids = keys.filter((key) => ID_FIELDS.has(key));
    const metrics = keys.filter((key) => METRIC_FIELDS.has(key));
    ids.forEach((key) => idFields.add(key)); metrics.forEach((key) => metricFields.add(key));
    if (ids.length && metrics.length) matchedPatternCount += 1;
    for (const key of keys) walk(node[key], depth + 1);
  }
  walk(value, 0);
  return { idFields: [...idFields].sort(), metricFields: [...metricFields].sort(), matchedPatternCount };
}
async function click(page, text) { const locator = page.getByText(text, { exact: true }).first(); if (await locator.isVisible().catch(() => false)) { await locator.click({ timeout: 4000 }); return true; } return false; }

async function main() {
  const version = await fetch(`${CDP.replace(/\/$/, '')}/json/version`, { signal: AbortSignal.timeout(2000) });
  if (!version.ok) throw new Error('未发现本机 Chrome CDP。');
  const browser = await chromium.connectOverCDP(CDP);
  const page = browser.contexts().flatMap((context) => context.pages())[0];
  if (!page) throw new Error('Chrome 中没有可用标签页。');
  const records = new Map(); let source = '当前页面'; const pending = new Set();
  page.on('response', (response) => {
    const task = (async () => {
      const request = response.request(); if (!['fetch', 'xhr'].includes(request.resourceType())) return;
      const key = `${source}|${request.method()}|${pathname(response.url())}`;
      const record = records.get(key) || { endpoint: pathname(response.url()), method: request.method(), status: response.status(), page: source, idFields: [], metricFields: [], matchedPatternCount: 0 };
      record.status = response.status(); records.set(key, record);
      if (!/json/i.test((await response.headerValue('content-type')) || '')) return;
      try { const summary = inspect(await response.json()); record.idFields = [...new Set([...record.idFields, ...summary.idFields])]; record.metricFields = [...new Set([...record.metricFields, ...summary.metricFields])]; record.matchedPatternCount += summary.matchedPatternCount; } catch {}
    })(); pending.add(task); void task.finally(() => pending.delete(task));
  });
  for (const [label, url, actions] of ROUTES) {
    source = label; await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForTimeout(1200);
    for (const action of actions) { source = `${label} / ${action}`; if (await click(page, action)) await page.waitForTimeout(800); }
  }
  await Promise.all([...pending]);
  const probes = [...records.values()].filter((item) => item.idFields.length || item.metricFields.length).sort((a,b) => b.matchedPatternCount-a.matchedPatternCount || b.metricFields.length-a.metricFields.length);
  await mkdir(path.dirname(OUTPUT), { recursive: true }); await writeFile(OUTPUT, `${JSON.stringify({ interaction_api_probe: probes }, null, 2)}\n`);
  console.log(`安全摘要已写入：${OUTPUT}`); console.log(`候选接口：${probes.length}`); for (const item of probes.filter((item) => item.matchedPatternCount)) console.log(`${item.method} ${item.endpoint}：ID=${item.idFields.join(',')} 指标=${item.metricFields.join(',')}`);
}
main().then(() => process.exit(0)).catch((error) => { console.error(`互动接口探测失败：${error instanceof Error ? error.message : '未知错误'}`); process.exit(1); });
