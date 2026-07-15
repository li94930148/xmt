import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { getSocialAccount } from '../api/services/social-review/runner.ts';
import { decryptCredentialStorageState, getActiveCredentialByRef } from '../api/services/social-review/credentials.ts';
import { triggerDouyinCreatorItemList } from '../api/services/social-review/adapters/douyin-playwright-v3.ts';

const ORIGIN = 'https://creator.douyin.com';
const CONTENT_PATH = '/creator-micro/data-center/content';
const ITEM_LIST_PATH = '/web/api/creator/item/list';
const OUTPUT = path.resolve('data/social-review-debug/creator-item-list-diff.json');
const CDP_PORTS = ['http://127.0.0.1:9222', 'http://127.0.0.1:9223', 'http://127.0.0.1:9224'];
const SENSITIVE = /cookie|token|authorization|headers?|session|storage|password|secret|trace|signature|sign$|strdata/i;

function safeKey(key) { return !SENSITIVE.test(key) && /^[A-Za-z0-9_.-]+$/.test(key); }
function valueType(value) { return Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value; }
function responseShape(value) {
  const fields = []; const seen = new Set();
  function walk(node, prefix = '', depth = 0) {
    if (!node || typeof node !== 'object' || depth > 4 || fields.length >= 100) return;
    if (Array.isArray(node)) { if (node[0]) walk(node[0], `${prefix}[]`, depth + 1); return; }
    for (const [key, child] of Object.entries(node)) {
      if (!safeKey(key)) continue;
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      if (!seen.has(fieldPath)) { seen.add(fieldPath); fields.push({ path: fieldPath, type: valueType(child) }); }
      walk(child, fieldPath, depth + 1);
    }
  }
  walk(value); return fields;
}
function requestSummary(request, payload) {
  const url = new URL(request.url());
  const raw = request.postData(); let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  return {
    pathname: url.pathname,
    method: request.method(),
    queryKeys: [...url.searchParams.keys()].filter(safeKey).sort(),
    queryTypes: Object.fromEntries([...url.searchParams.keys()].filter(safeKey).map((key) => [key, 'string'])),
    bodyKeys: body && typeof body === 'object' ? Object.keys(body).filter(safeKey).sort() : [],
    bodyTypes: body && typeof body === 'object' ? Object.fromEntries(Object.entries(body).filter(([key]) => safeKey(key)).map(([key, value]) => [key, valueType(value)])) : {},
    responseFields: responseShape(payload),
    itemsFields: responseShape({ items: Array.isArray(payload?.items) ? payload.items.slice(0, 1) : [] }).filter((item) => item.path.startsWith('items')),
  };
}
async function cdpUrl() {
  for (const url of process.env.CHROME_CDP_URL ? [process.env.CHROME_CDP_URL] : CDP_PORTS) { try { if ((await fetch(`${url}/json/version`, { signal: AbortSignal.timeout(1500) })).ok) return url; } catch {} }
  throw new Error('未发现 Chrome CDP。');
}
async function capture(page, openAndTrigger) {
  const records = [];
  page.on('response', async (response) => {
    if (!['fetch', 'xhr'].includes(response.request().resourceType()) || new URL(response.url()).pathname !== ITEM_LIST_PATH) return;
    try { records.push(requestSummary(response.request(), await response.json())); } catch {}
  });
  await openAndTrigger();
  await page.waitForTimeout(3500);
  return records.sort((a, b) => Number(b.itemsFields.some((field) => /metrics\.(like_count|comment_count|share_count|favorite_count)$/.test(field.path))) - Number(a.itemsFields.some((field) => /metrics\.(like_count|comment_count|share_count|favorite_count)$/.test(field.path)))).at(0) || null;
}
async function main() {
  const chromeBrowser = await chromium.connectOverCDP(await cdpUrl());
  const chromePage = chromeBrowser.contexts().flatMap((context) => context.pages()).find((page) => page.url().startsWith(ORIGIN)) || chromeBrowser.contexts().flatMap((context) => context.pages())[0];
  if (!chromePage) throw new Error('Chrome 中没有可用页面。');
  const trigger = async (page) => { await page.goto(`${ORIGIN}${CONTENT_PATH}`, { waitUntil: 'domcontentloaded', timeout: 45000 }); const analysis = page.getByText('作品分析', { exact: true }).first(); if (await analysis.isVisible().catch(() => false)) { await analysis.click({ timeout: 5000 }).catch(() => undefined); await page.waitForTimeout(900); } await triggerDouyinCreatorItemList(page); };
  const chromeRequest = await capture(chromePage, () => trigger(chromePage));

  const account = await getSocialAccount(2);
  if (!account?.credential_ref) throw new Error('账号 2 未配置有效凭据。');
  const credential = await getActiveCredentialByRef(account.credential_ref);
  const localBrowser = await chromium.launch({ headless: process.env.SOCIAL_COLLECT_HEADLESS !== 'false' });
  let context = null;
  try {
    context = await localBrowser.newContext({ storageState: await decryptCredentialStorageState(credential) });
    const page = await context.newPage();
    const playwrightRequest = await capture(page, () => trigger(page));
    const chromeKeys = chromeRequest?.queryKeys || []; const playwrightKeys = playwrightRequest?.queryKeys || [];
    const output = { chromeRequest, playwrightRequest, difference: { missingParams: chromeKeys.filter((key) => !playwrightKeys.includes(key)), extraParams: playwrightKeys.filter((key) => !chromeKeys.includes(key)) } };
    await mkdir(path.dirname(OUTPUT), { recursive: true }); await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`安全摘要已写入：${path.relative(process.cwd(), OUTPUT)}`);
    console.log(`Chrome 参数：${chromeKeys.join(',') || '无'}`);
    console.log(`Playwright 参数：${playwrightKeys.join(',') || '无'}`);
    console.log(`缺失参数：${output.difference.missingParams.join(',') || '无'}`);
  } finally { await context?.close().catch(() => undefined); await localBrowser.close().catch(() => undefined); }
}
main().then(() => process.exit(0)).catch((error) => { console.error(`作品列表请求差异探测失败：${error instanceof Error ? error.message : '未知错误'}`); process.exit(1); });
