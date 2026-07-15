import type { Browser, BrowserContext, Page } from 'playwright';
import type { SocialAccount } from '@shared/types/social-review';
import { decryptCredentialStorageState, getActiveCredentialByRef, markCredentialExpired } from '../credentials.js';
import { sanitizeErrorMessage } from '../credentialCrypto.js';
import type { SocialCollectResult, SocialReviewAdapter } from './base.js';

const CREATOR_CENTER_URL = process.env.DOUYIN_CREATOR_CENTER_URL || 'https://creator.douyin.com/';
const LOGIN_EXPIRED_MESSAGE = '登录凭据已失效，请重新扫码登录。';
type PlaywrightStorageState = NonNullable<Parameters<Browser['newContext']>[0]>['storageState'];

function normalizeNumber(value: string) {
  const cleaned = value.replace(/,/g, '').trim();
  const match = cleaned.match(/(\d+(?:\.\d+)?)(万|亿)?/);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  if (match[2] === '亿') return Math.round(base * 100000000);
  if (match[2] === '万') return Math.round(base * 10000);
  return Math.round(base);
}

function findMetric(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[\\s\\S]{0,20}?([0-9][0-9,.]*(?:\\.\\d+)?\\s*[万亿]?)`);
    const value = text.match(pattern)?.[1];
    if (value) {
      return normalizeNumber(value);
    }
  }
  return null;
}

function looksLoggedOut(url: string, text: string) {
  const lowerUrl = url.toLowerCase();
  if (/login|passport|sso|oauth/.test(lowerUrl)) return true;
  const loginSignals = ['扫码登录', '登录后查看', '请登录', '手机号登录', '验证码登录'];
  return loginSignals.some((signal) => text.includes(signal));
}

function normalizeStorageState(payload: unknown): PlaywrightStorageState {
  const candidate = payload && typeof payload === 'object' && 'storageState' in payload
    ? (payload as { storageState?: unknown }).storageState
    : payload;

  if (!candidate || typeof candidate !== 'object') {
    throw new Error('采集凭据无法解密，请重新扫码登录。');
  }

  return candidate as PlaywrightStorageState;
}

async function closeQuietly(browser: Browser | null, context: BrowserContext | null) {
  try {
    await context?.close();
  } catch {
    // 关闭失败不影响采集状态落库
  }
  try {
    await browser?.close();
  } catch {
    // 关闭失败不影响采集状态落库
  }
}

async function readPageText(page: Page) {
  try {
    return await page.locator('body').innerText({ timeout: 8000 });
  } catch {
    return '';
  }
}

export class DouyinPlaywrightAdapter implements SocialReviewAdapter {
  async collect(account: SocialAccount): Promise<SocialCollectResult> {
    if (Number(account.id) !== 2) {
      throw new Error('本阶段仅允许显式采集账号 ID 2。');
    }
    if (!account.credential_ref) {
      throw new Error('账号未配置采集凭据，请先扫码登录。');
    }

    const credential = await getActiveCredentialByRef(account.credential_ref);
    let storageState: PlaywrightStorageState;
    try {
      storageState = normalizeStorageState(await decryptCredentialStorageState(credential));
    } catch {
      throw new Error('采集凭据无法解密，请重新扫码登录。');
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({
        headless: process.env.SOCIAL_COLLECT_HEADLESS !== 'false',
      });
      context = await browser.newContext({ storageState });
      const page = await context.newPage();
      await page.goto(CREATOR_CENTER_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);

      const text = await readPageText(page);
      if (looksLoggedOut(page.url(), text)) {
        await markCredentialExpired(account.credential_ref, LOGIN_EXPIRED_MESSAGE);
        throw new Error(LOGIN_EXPIRED_MESSAGE);
      }

      const followers = findMetric(text, ['粉丝总数', '粉丝数', '粉丝']);
      const likesTotal = findMetric(text, ['获赞总数', '总获赞', '获赞']);
      const videoCount = findMetric(text, ['作品总数', '作品数', '视频数', '作品']);
      const worksCount = videoCount;

      if (followers === null && likesTotal === null && videoCount === null) {
        throw new Error('账号数据解析失败，请检查页面结构。');
      }

      const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
      return {
        accountSnapshot: {
          platform: 'douyin',
          external_account_id: account.external_account_id || String(account.id),
          account_name: account.account_name,
          display_name: account.display_name || account.account_name,
          profile_url: account.profile_url,
          avatar_url: account.avatar_url,
          snapshot_date: now.slice(0, 10),
          followers: followers ?? undefined,
          following_count: undefined,
          likes_total: likesTotal ?? undefined,
          video_count: videoCount ?? undefined,
          works_count: worksCount ?? undefined,
          engagement_est: undefined,
          source_method: 'creator_center_playwright',
          source_project: 'social-review',
          raw_json: {
            source: 'creator_center',
            parsedFields: {
              hasFollowers: followers !== null,
              hasLikesTotal: likesTotal !== null,
              hasVideoCount: videoCount !== null,
            },
          },
          fetched_at: now,
        },
        videos: [],
      };
    } catch (error) {
      const message = sanitizeErrorMessage(error);
      if (message === LOGIN_EXPIRED_MESSAGE && account.credential_ref) {
        await markCredentialExpired(account.credential_ref, LOGIN_EXPIRED_MESSAGE);
      }
      throw new Error(message);
    } finally {
      await closeQuietly(browser, context);
    }
  }
}
