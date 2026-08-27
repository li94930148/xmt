import type { Page } from 'playwright';
import type { LoginStateResult } from './types.js';

const loginText = /扫码登录|手机号登录|验证码登录/;
function result(status: LoginStateResult['status'], evidence: string[], url?: URL): LoginStateResult { return { status, evidence, finalHost: url?.hostname, finalPath: url?.pathname, source: 'browser' }; }
function isExplicitLoginUrl(url: URL) { return /(?:^|\/)(?:login|auth)(?:\/|$)/i.test(url.pathname) || /(?:^|[.-])(?:login|auth|sso)(?:[.-]|$)/i.test(url.hostname); }
function isProtectedCreatorPath(pathname: string) { return /^\/(?:creator-micro|creator-center|content|data|manage)(?:\/|$)/i.test(pathname); }
export async function getDouyinCreatorLoginState(page: Page): Promise<LoginStateResult> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  let url: URL; try { url = new URL(page.url()); } catch { return result('unknown', ['invalid_final_url']); }
  if (isExplicitLoginUrl(url)) return result('login_required', ['explicit_login_url'], url);
  const loginPrompt = await page.getByText(loginText, { exact: false }).first().isVisible().catch(() => false);
  if (loginPrompt) return result('login_required', ['visible_login_control'], url);
  if (url.hostname !== 'creator.douyin.com') return result('unknown', ['non_creator_host'], url);
  const body = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => null);
  if (body === null) return result('unknown', ['creator_page_unreadable'], url);
  if (!isProtectedCreatorPath(url.pathname)) return result('unknown', ['creator_path_unconfirmed'], url);
  const evidence = ['creator_host', 'protected_creator_path', 'creator_page_loaded'];
  if (/内容管理/.test(body)) evidence.push('content_management');
  if (/数据中心/.test(body)) evidence.push('data_center');
  if (/创作服务|数据|内容/.test(body)) evidence.push('creator_navigation');
  return result('logged_in', evidence, url);
}
