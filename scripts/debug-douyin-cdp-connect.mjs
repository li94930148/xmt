import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const CDP_URL = process.env.CREATOR_CDP_URL || 'http://127.0.0.1:9222';
const outputPath = path.resolve('data/social-review-debug/creator-account-api-map.json');
const targets = [
  'https://creator.douyin.com/creator-micro/data-center/operation',
  'https://creator.douyin.com/creator-micro/data-center/content',
  'https://creator.douyin.com/creator-micro/data-center/fans',
];
const ignored = /\.(?:js|css|png|jpe?g|gif|svg|webp|woff2?|ico)(?:$|\?)/i;
const allowed = (url) => { const parsed = new URL(url); return parsed.hostname === 'creator.douyin.com' && !ignored.test(parsed.pathname) && (/^\/janus\//.test(parsed.pathname) || /^\/web\/api\//.test(parsed.pathname)); };
const secret = /cookie|token|authorization|password|session|secret/i;

function schema(value, depth = 0) {
  if (depth > 5) return { type: 'truncated' };
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', items: value.length ? schema(value[0], depth + 1) : { type: 'unknown' } };
  if (typeof value !== 'object') return { type: typeof value };
  const fields = {};
  for (const [key, child] of Object.entries(value)) if (!secret.test(key)) fields[key] = schema(child, depth + 1);
  return { type: 'object', fields };
}
function flatten(node, prefix = '', result = []) {
  if (!node || node.type !== 'object') return result;
  for (const [key, child] of Object.entries(node.fields || {})) { const fieldPath = prefix ? `${prefix}.${key}` : key; result.push({ path: fieldPath, type: child.type }); if (child.type === 'object') flatten(child, fieldPath, result); if (child.type === 'array' && child.items?.type === 'object') flatten(child.items, `${fieldPath}[]`, result); }
  return result;
}

const browser = await chromium.connectOverCDP(CDP_URL);
const pages = browser.contexts().flatMap((context) => context.pages());
const creatorPage = pages.find((page) => page.url().includes('creator.douyin.com'));
if (!creatorPage) throw new Error('No logged-in creator.douyin.com page found in the CDP browser.');
const apiMap = new Map();
const capture = async (action, run) => {
  const seen = [];
  const onResponse = async (response) => {
    if (!allowed(response.url())) return;
    const request = response.request();
    const url = new URL(response.url());
    const item = { pathname: url.pathname, method: request.method(), status: response.status(), queryKeys: [...url.searchParams.keys()].filter((key) => !secret.test(key)).sort(), responseKeys: [], fieldPaths: [] };
    const contentType = response.headers()['content-type'] || '';
    if (/application\/json/i.test(contentType)) {
      try { const body = await response.json(); const shape = schema(body); item.responseKeys = Object.keys(shape.fields || {}); item.fieldPaths = flatten(shape); } catch { /* schema unavailable; never persist the body */ }
    }
    seen.push(item);
  };
  creatorPage.on('response', onResponse);
  try { await run(); await creatorPage.waitForTimeout(1800); } finally { creatorPage.off('response', onResponse); }
  for (const item of seen) apiMap.set(`${item.method}:${item.pathname}:${item.status}`, item);
  return { action, eventsCount: seen.length };
};

const actions = [];
for (const target of targets) actions.push(await capture(target, async () => { await creatorPage.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 }); }));
await fs.mkdir(path.dirname(outputPath), { recursive: true });
const output = { page: { title: await creatorPage.title(), url: creatorPage.url() }, generatedAt: new Date().toISOString(), actions, eventsCount: [...apiMap.values()].length, apis: [...apiMap.values()] };
await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
console.log(JSON.stringify({ page: output.page, actions, apiCount: output.apis.length, output: path.relative(process.cwd(), outputPath) }));
await browser.close();
