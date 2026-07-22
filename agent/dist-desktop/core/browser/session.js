import path from 'node:path';
import { chromium } from 'playwright';
export async function openLogin(profileDir) { const context = await chromium.launchPersistentContext(profileDir, { headless: false, channel: process.env.XMT_PLAYWRIGHT_CHANNEL || undefined }); const page = context.pages()[0] || await context.newPage(); await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded' }); return context; }
export async function withCreatorPage(profileDir, run) { let context; try {
    context = await chromium.launchPersistentContext(path.resolve(profileDir), { headless: true, channel: process.env.XMT_PLAYWRIGHT_CHANNEL || undefined });
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    return await run(page);
}
finally {
    await context?.close();
} }
