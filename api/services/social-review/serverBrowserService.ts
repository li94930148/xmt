import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';

const contexts = new Map<number, BrowserContext>();
const profileRoot = process.env.SOCIAL_REVIEW_BROWSER_ROOT || '/data/social-review/browser';
const creatorUrl = 'https://creator.douyin.com/creator-micro/home';
const chromeExecutable =
  process.env.CHROME_EXECUTABLE_PATH ||
  '/usr/bin/google-chrome';

export type ServerLoginStatus = 'logged_in' | 'need_login' | 'expired';
export async function openServerBrowser(accountId: number, visible = false) {
  const existing = contexts.get(accountId); if (existing) { const page = existing.pages()[0] || await existing.newPage(); return { context: existing, page }; }
  const { chromium } = await import('playwright'); const profile = path.join(profileRoot, String(accountId)); await fs.mkdir(profile, { recursive: true });
  console.log('[SocialBrowser] executable:', chromeExecutable);
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: chromeExecutable,
    headless: false,
    viewport: { width: 1365, height: 900 },
  }); contexts.set(accountId, context);
  const page = context.pages()[0] || await context.newPage(); await page.goto(creatorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }); return { context, page };
}
export async function detectServerLogin(accountId: number): Promise<ServerLoginStatus> {
  const { page } = await openServerBrowser(accountId); const url = page.url().toLowerCase();
  if (/login|passport|sso|oauth/.test(url)) return 'need_login';
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  return /扫码登录|请登录|手机号登录/.test(text) ? 'need_login' : 'logged_in';
}
export async function closeServerBrowser(accountId: number) { const context = contexts.get(accountId); contexts.delete(accountId); await context?.close().catch(() => undefined); }
export async function captureServerBrowser(accountId: number) { const { page } = await openServerBrowser(accountId, true); return page.screenshot({ type: 'jpeg', quality: 70 }); }
