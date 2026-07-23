import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export type ChromeConnection = { browser: Browser; context: BrowserContext; page: Page };

export async function connectChrome(endpoint = 'http://127.0.0.1:9222'): Promise<ChromeConnection> {
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
  const context = browser.contexts()[0];
  if (!context) throw new Error('connectOverCDP成功，但 Chrome 没有可用浏览器上下文。');
  const page = context.pages().find((candidate) => candidate.url().includes('creator.douyin.com')) ?? await context.newPage();
  if (!page.url().includes('creator.douyin.com')) await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  return { browser, context, page };
}

export async function checkLogin(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  const body = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
  const loginPrompt = /扫码登录|手机号登录|验证码登录|登录抖音/.test(body);
  const creatorShell = /作品管理|数据中心|发布作品|创作中心|创作服务/.test(body);
  return page.url().includes('creator.douyin.com') && !page.url().includes('/login') && !loginPrompt && creatorShell;
}
