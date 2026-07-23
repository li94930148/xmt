"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exploreCreatorPages = exploreCreatorPages;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const CREATOR_ORIGIN = 'https://creator.douyin.com';
const PAGES = [
    '/creator-micro/content/manage',
    '/creator-micro/work-management/work-detail/',
    '/creator-micro/data-center/operation',
    '/creator-micro/data-center/content',
    '/creator-micro/data/stats/follower/portrait',
];
const TARGET_TABS = ['流量分析', '观众分析', '评论分析', '粉丝来源', '趋势'];
function responseFields(value, prefix = '', depth = 0) {
    if (depth > 2 || value == null || typeof value !== 'object')
        return prefix ? [prefix] : [];
    const source = Array.isArray(value) ? value[0] : value;
    if (!source || typeof source !== 'object')
        return prefix ? [prefix] : [];
    return Object.entries(source).flatMap(([key, child]) => {
        const field = prefix ? `${prefix}.${key}` : key;
        const nested = responseFields(child, field, depth + 1);
        return nested.length ? nested : [field];
    }).slice(0, 300);
}
const isApiResponse = (response) => {
    const type = response.request().resourceType();
    return type === 'xhr' || type === 'fetch';
};
async function stable(page) {
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
}
async function scanPage(page, pagePath) {
    await page.goto(`${CREATOR_ORIGIN}${pagePath}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await stable(page);
    const labels = await page.locator('button, [role="tab"], [role="button"]').allTextContents();
    const available = TARGET_TABS.filter((target) => labels.some((label) => label.trim().includes(target)));
    const tabs = [];
    for (const name of available) {
        const urls = new Set();
        const schemas = new Map();
        const pending = [];
        const onResponse = (response) => {
            if (!isApiResponse(response))
                return;
            const url = response.url();
            urls.add(url);
            pending.push(response.json().then((value) => { schemas.set(url, new Set(responseFields(value))); }).catch(() => undefined));
        };
        page.on('response', onResponse);
        try {
            const candidate = page.locator('button, [role="tab"], [role="button"]').filter({ hasText: name }).first();
            if (!await candidate.isVisible().catch(() => false))
                continue;
            await candidate.click({ timeout: 8_000 });
            await stable(page);
            await Promise.allSettled(pending);
            tabs.push({ name, apis: [...urls].sort(), schemas: [...schemas].map(([api, fields]) => ({ api, fields: [...fields].sort() })) });
        }
        finally {
            page.off('response', onResponse);
        }
    }
    return { page: pagePath, tabs };
}
async function exploreCreatorPages(adapter, outputFile) {
    const capabilities = await adapter.withPage(async (page) => {
        const result = [];
        for (const pagePath of PAGES) {
            try {
                result.push(await scanPage(page, pagePath));
            }
            catch (error) {
                result.push({ page: pagePath, tabs: [{ name: '__scan_error__', apis: [error instanceof Error ? error.message : String(error)], schemas: [] }] });
            }
        }
        return result;
    });
    await promises_1.default.mkdir(node_path_1.default.dirname(outputFile), { recursive: true });
    const temporary = `${outputFile}.tmp`;
    await promises_1.default.writeFile(temporary, JSON.stringify(capabilities, null, 2), 'utf8');
    await promises_1.default.rename(temporary, outputFile);
    return capabilities;
}
