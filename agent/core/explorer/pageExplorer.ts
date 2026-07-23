import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page, Response } from 'playwright';
import type { BrowserAdapter } from '../browser/adapter.js';

const CREATOR_ORIGIN = 'https://creator.douyin.com';
const PAGES = [
  '/creator-micro/content/manage',
  '/creator-micro/work-management/work-detail/',
  '/creator-micro/data-center/operation',
  '/creator-micro/data-center/content',
  '/creator-micro/data/stats/follower/portrait',
];
const TARGET_TABS = ['流量分析', '观众分析', '评论分析', '粉丝来源', '趋势'];

export type PageApiSchema = { api: string; fields: string[] };
export type PageCapability = { page: string; tabs: Array<{ name: string; apis: string[]; schemas: PageApiSchema[] }> };

function responseFields(value: unknown, prefix = '', depth = 0): string[] {
  if (depth > 2 || value == null || typeof value !== 'object') return prefix ? [prefix] : [];
  const source = Array.isArray(value) ? value[0] : value;
  if (!source || typeof source !== 'object') return prefix ? [prefix] : [];
  return Object.entries(source).flatMap(([key, child]) => {
    const field = prefix ? `${prefix}.${key}` : key;
    const nested = responseFields(child, field, depth + 1);
    return nested.length ? nested : [field];
  }).slice(0, 300);
}

const isApiResponse = (response: Response) => {
  const type = response.request().resourceType();
  return type === 'xhr' || type === 'fetch';
};

async function stable(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

async function scanPage(page: Page, pagePath: string): Promise<PageCapability> {
  await page.goto(`${CREATOR_ORIGIN}${pagePath}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await stable(page);
  const labels = await page.locator('button, [role="tab"], [role="button"]').allTextContents();
  const available = TARGET_TABS.filter((target) => labels.some((label) => label.trim().includes(target)));
  const tabs: PageCapability['tabs'] = [];

  for (const name of available) {
    const urls = new Set<string>();
    const schemas = new Map<string, Set<string>>();
    const pending: Promise<void>[] = [];
    const onResponse = (response: Response) => {
      if (!isApiResponse(response)) return;
      const url = response.url();
      urls.add(url);
      pending.push(response.json().then((value) => { schemas.set(url, new Set(responseFields(value))); }).catch(() => undefined));
    };
    page.on('response', onResponse);
    try {
      const candidate = page.locator('button, [role="tab"], [role="button"]').filter({ hasText: name }).first();
      if (!await candidate.isVisible().catch(() => false)) continue;
      await candidate.click({ timeout: 8_000 });
      await stable(page);
      await Promise.allSettled(pending);
      tabs.push({ name, apis: [...urls].sort(), schemas: [...schemas].map(([api, fields]) => ({ api, fields: [...fields].sort() })) });
    } finally {
      page.off('response', onResponse);
    }
  }
  return { page: pagePath, tabs };
}

export async function exploreCreatorPages(adapter: BrowserAdapter, outputFile: string) {
  const capabilities = await adapter.withPage(async (page) => {
    const result: PageCapability[] = [];
    for (const pagePath of PAGES) {
      try { result.push(await scanPage(page, pagePath)); }
      catch (error) {
        result.push({ page: pagePath, tabs: [{ name: '__scan_error__', apis: [error instanceof Error ? error.message : String(error)], schemas: [] }] });
      }
    }
    return result;
  });
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  const temporary = `${outputFile}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(capabilities, null, 2), 'utf8');
  await fs.rename(temporary, outputFile);
  return capabilities;
}
