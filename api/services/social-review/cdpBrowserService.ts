import type { Browser, BrowserContext, Page } from 'playwright';
export async function connectCreatorCdp(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const { chromium } = await import('playwright');
  const browser = await chromium.connectOverCDP(process.env.CREATOR_CDP_URL || 'http://127.0.0.1:9222');
  const context = browser.contexts()[0]; const page = context?.pages().find((item) => item.url().includes('creator.douyin.com'));
  if (!context || !page) { await browser.close(); throw new Error('未发现已登录的抖音创作者中心页面'); }
  return { browser, context, page };
}
