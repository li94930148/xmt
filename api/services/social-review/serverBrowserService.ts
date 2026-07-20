import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';

const contexts = new Map<number, BrowserContext>();
const remoteSessions = new Map<string, { accountId: number; ownerUserId: number; page: Page; updatedAt: number }>();
const profileRoot = process.env.SOCIAL_REVIEW_BROWSER_ROOT || '/data/social-review/browser';
const creatorUrl = 'https://creator.douyin.com/creator-micro/home';
const chromeExecutable = process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/google-chrome';
const safeKeys = new Set(['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);

export type ServerLoginStatus = 'logged_in' | 'need_login' | 'expired';
export class RemoteBrowserSessionError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function openServerBrowser(accountId: number, visible = false) {
  void visible;
  const existing = contexts.get(accountId);
  if (existing) { const page = existing.pages().find((item) => !item.isClosed()) || await existing.newPage(); return { context: existing, page }; }
  const { chromium } = await import('playwright'); const profile = path.join(profileRoot, String(accountId)); await fs.mkdir(profile, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, { executablePath: chromeExecutable, headless: false, viewport: { width: 1365, height: 900 } }); contexts.set(accountId, context);
  const page = context.pages()[0] || await context.newPage(); await page.goto(creatorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }); return { context, page };
}

export async function bindRemoteLoginSession(sessionId: string, accountId: number, ownerUserId: number) {
  const { page } = await openServerBrowser(accountId, true);
  remoteSessions.set(sessionId, { accountId, ownerUserId, page, updatedAt: Date.now() });
}
export function isRemoteLoginSessionOwner(sessionId: string, userId: number) { return remoteSessions.get(sessionId)?.ownerUserId === userId; }
export function releaseRemoteLoginSession(sessionId: string) { remoteSessions.delete(sessionId); }

function sessionPage(sessionId: string, userId?: number) {
  const session = remoteSessions.get(sessionId);
  if (!session) throw new RemoteBrowserSessionError(409, '远程浏览器会话已失效，请重新发起登录。');
  if (userId !== undefined && session.ownerUserId !== userId) throw new RemoteBrowserSessionError(403, '无权操作此远程浏览器会话。');
  if (session.page.isClosed()) { remoteSessions.delete(sessionId); throw new RemoteBrowserSessionError(409, '远程浏览器或页面已关闭，请重新发起登录。'); }
  session.updatedAt = Date.now(); return session;
}
async function viewport(page: Page) { const size = page.viewportSize(); return size || await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })); }
export async function captureRemoteBrowser(sessionId: string, userId?: number) { const { page } = sessionPage(sessionId, userId); const size = await viewport(page); const image = await page.screenshot({ type: 'jpeg', quality: 70 }); return { image, mimeType: 'image/jpeg', screenshotWidth: size.width, screenshotHeight: size.height, viewportWidth: size.width, viewportHeight: size.height }; }
function point(value: unknown, dimension: unknown, target: number) { const number = Number(value); const source = Number(dimension); if (!Number.isFinite(number) || !Number.isFinite(source) || source <= 0 || number < 0 || number > source) throw new RemoteBrowserSessionError(400, '远程操作坐标无效。'); return Math.min(target, Math.max(0, number / source * target)); }
export async function remoteBrowserClick(sessionId: string, userId: number, input: { x: unknown; y: unknown; imageWidth: unknown; imageHeight: unknown }) { const { page } = sessionPage(sessionId, userId); const size = await viewport(page); const x = point(input.x, input.imageWidth, size.width); const y = point(input.y, input.imageHeight, size.height); console.log('[Playwright Click]', x, y); await page.mouse.click(x, y); console.info('[SocialBrowser] remote action', { sessionId, action: 'DOUYIN_REMOTE_CLICK' }); return captureRemoteBrowser(sessionId, userId); }
export async function remoteBrowserScroll(sessionId: string, userId: number, input: { deltaX?: unknown; deltaY?: unknown }) { const { page } = sessionPage(sessionId, userId); const x = Number(input.deltaX || 0); const y = Number(input.deltaY || 0); if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 2000 || Math.abs(y) > 2000) throw new RemoteBrowserSessionError(400, '滚动参数无效。'); await page.mouse.wheel(x, y); console.info('[SocialBrowser] remote action', { sessionId, action: 'DOUYIN_REMOTE_SCROLL' }); return captureRemoteBrowser(sessionId, userId); }
export async function remoteBrowserType(sessionId: string, userId: number, text: unknown) { if (typeof text !== 'string' || !text.length || text.length > 512) throw new RemoteBrowserSessionError(400, '输入内容无效或过长。'); const { page } = sessionPage(sessionId, userId); await page.keyboard.type(text, { delay: 25 }); console.info('[SocialBrowser] remote action', { sessionId, action: 'DOUYIN_REMOTE_TYPE', length: text.length }); return captureRemoteBrowser(sessionId, userId); }
export async function remoteBrowserPress(sessionId: string, userId: number, key: unknown) { if (typeof key !== 'string' || !safeKeys.has(key)) throw new RemoteBrowserSessionError(400, '不支持的按键。'); const { page } = sessionPage(sessionId, userId); await page.keyboard.press(key); console.info('[SocialBrowser] remote action', { sessionId, action: 'DOUYIN_REMOTE_PRESS', key }); return captureRemoteBrowser(sessionId, userId); }
export async function detectServerLogin(accountId: number): Promise<ServerLoginStatus> { const { page } = await openServerBrowser(accountId); const url = page.url().toLowerCase(); if (/login|passport|sso|oauth/.test(url)) return 'need_login'; const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => ''); return /扫码登录|请登录|手机号登录/.test(text) ? 'need_login' : 'logged_in'; }
export async function closeServerBrowser(accountId: number) { const context = contexts.get(accountId); contexts.delete(accountId); await context?.close().catch(() => undefined); }
