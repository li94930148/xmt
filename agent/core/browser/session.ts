import type { Page } from 'playwright';

export async function isDouyinCreatorLoggedIn(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  const url = page.url();
  const body = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
  const loginPrompt = await page.getByText(/扫码登录|手机号登录|验证码登录/, { exact: false }).first().isVisible().catch(() => false);
  const creatorShell = /内容管理/.test(body) && /数据中心/.test(body) && (/抖音号[：:]/.test(body) || /发布视频/.test(body));
  return url.includes('creator.douyin.com') && !url.includes('/login') && !loginPrompt && creatorShell;
}
