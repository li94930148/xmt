import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { queryOne } from '../api/database/utils.ts';
import { decryptCredentialStorageState, getActiveCredentialByRef } from '../api/services/social-review/credentials.ts';

const TARGET_URL = 'https://creator.douyin.com/creator-micro/data-center/content';
const OUTPUT_PATH = path.resolve(process.cwd(), 'data/social-review-debug/content-list-probe.json');
const CANDIDATE_PATTERN = /creator|content|video|aweme|publish|list/i;
const STATIC_RESOURCE_PATTERN = /\.(?:css|js|html|json|map)$/i;
const SENSITIVE_FIELD_PATTERN = /cookie|token|authorization|headers?|session|storage|password|secret|html/i;
const MAX_DEPTH = 5;
const MAX_KEYS = 80;

function safePathname(value) {
  try {
    return (new URL(value).pathname || '/').replace(/cookie|token|authorization|headers?|session|storage/gi, 'safe');
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
  const hierarchy = new Set();
  const arrayFields = new Set();
  const fields = new Set();
  const fieldTypes = {};
  let keyCount = 0;

  function visit(node, nodePath, depth) {
    if (depth > MAX_DEPTH || keyCount >= MAX_KEYS || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (nodePath) arrayFields.add(nodePath);
      hierarchy.add(`${nodePath || '$'}[]`);
      for (const item of node.slice(0, 3)) visit(item, nodePath ? `${nodePath}[]` : '[]', depth + 1);
      return;
    }

    hierarchy.add(nodePath || '$');
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
  return {
    jsonHierarchy: [...hierarchy].sort(),
    arrayFields: [...arrayFields].sort(),
    fields: [...fields].sort(),
    fieldTypes: Object.fromEntries(Object.entries(fieldTypes).sort(([a], [b]) => a.localeCompare(b))),
  };
}

async function clickVisibleText(page, text) {
  const exact = page.getByText(text, { exact: true }).first();
  if (await exact.isVisible().catch(() => false)) {
    await exact.click({ timeout: 10000 });
    return;
  }
  const partial = page.getByText(text).first();
  await partial.click({ timeout: 10000 });
}

async function getProbeCredential() {
  const requestedId = process.argv.find((arg) => arg.startsWith('--account-id='))?.slice('--account-id='.length);
  const account = await queryOne(
    `SELECT id, credential_ref
       FROM social_accounts
      WHERE platform = 'douyin'
        AND active = 1
        AND credential_ref IS NOT NULL
        ${requestedId ? 'AND id = ?' : ''}
      ORDER BY id
      LIMIT 1`,
    requestedId ? [Number(requestedId)] : [],
  );
  if (!account?.credential_ref) throw new Error('未找到已绑定的有效抖音 social-review 凭据。');
  return getActiveCredentialByRef(String(account.credential_ref));
}

async function main() {
  const credential = await getProbeCredential();
  const storageState = normalizeStorageState(await decryptCredentialStorageState(credential));
  const records = new Map();
  const pendingResponseSummaries = new Set();
  const browser = await chromium.launch({ headless: process.env.SOCIAL_COLLECT_HEADLESS !== 'false' });
  let context;

  try {
    context = await browser.newContext({ storageState });
    const page = await context.newPage();

    page.on('response', (response) => {
      const summaryTask = (async () => {
        const request = response.request();
        if (!['xhr', 'fetch'].includes(request.resourceType())) return;
        const pathname = safePathname(response.url());
        const candidate = CANDIDATE_PATTERN.test(pathname) && !STATIC_RESOURCE_PATTERN.test(pathname);
        const key = `${request.method()} ${pathname}`;
        const contentType = (await response.headerValue('content-type')) || (await request.headerValue('content-type')) || '';
        const record = records.get(key) || {
          pathname,
          method: request.method(),
          contentType,
          candidate,
          fields: [],
        };
        record.contentType ||= contentType;
        records.set(key, record);

        if (!candidate || !/application\/json|\+json/i.test(record.contentType)) return;
        try {
          const body = await response.json();
          Object.assign(record, summarizeJson(body));
        } catch {
          // Non-JSON or an unavailable response body is deliberately omitted.
        }
      })();
      pendingResponseSummaries.add(summaryTask);
      void summaryTask.finally(() => pendingResponseSummaries.delete(summaryTask));
    });

    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
    await clickVisibleText(page, '作品分析');
    await page.waitForTimeout(700);
    await clickVisibleText(page, '投稿列表');
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await Promise.all([...pendingResponseSummaries]);

    const output = {
      pagePath: safePathname(page.url()),
      requests: [...records.values()].sort((a, b) => a.pathname.localeCompare(b.pathname) || a.method.localeCompare(b.method)),
    };
    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    const candidates = output.requests.filter((item) => item.candidate);
    console.log(`已写入安全摘要：${path.relative(process.cwd(), OUTPUT_PATH)}`);
    console.log(`候选接口：${candidates.length}`);
    for (const item of candidates) console.log(`- ${item.method} ${item.pathname}：${item.fields.join(', ') || '未取得 JSON 字段摘要'}`);
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`内容列表接口探测失败：${error instanceof Error ? error.message : '未知错误'}`);
  process.exit(1);
});
