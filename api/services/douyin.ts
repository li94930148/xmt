/**
 * 抖音数据采集服务 - 使用 Playwright 抓取主页数据
 */
import { chromium, type Browser, type Page } from 'playwright';

export interface DouyinProfile {
  username: string;
  douyinId: string;
  followers: string;
  likes: string;
  following: string;
  ipLocation: string;
  bio: string;
  videos: DouyinVideo[];
  scrapedAt: string;
}

export interface DouyinVideo {
  title: string;
  likes: string;
  comments?: string;
  shares?: string;
  url?: string;
  isPinned?: boolean;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browserInstance;
}

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * 从抖音主页 URL 抓取数据
 */
export async function scrapeDouyinProfile(profileUrl: string): Promise<DouyinProfile> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });

  const page = await context.newPage();

  try {
    // 屏蔽不必要的资源加载，加速抓取
    await page.route('**/*.{png,jpg,jpeg,gif,svg,mp4,mp3,woff,woff2,ttf}', (route) =>
      route.abort()
    );
    await page.route('**/analytics**', (route) => route.abort());
    await page.route('**/log/**', (route) => route.abort());

    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 等待用户信息区域加载
    await page.waitForTimeout(3000);

    // 滚动加载更多视频
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(1500);
    }

    // 提取数据
    const data = await page.evaluate(() => {
      const getText = (selectors: string[]): string => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) return el.textContent.trim();
        }
        return '';
      };

      // 用户名 - 尝试多种选择器
      const username = getText([
        '[data-e2e="user-info"] h1',
        '[data-e2e="user-info"] span',
        'h1',
        '.j5WZzJdp',
        'span.j5WZzJdp',
      ]);

      // 抖音号
      const douyinIdMatch = document.body.innerText.match(/抖音号[：:]?\s*(\d+)/);
      const douyinId = douyinIdMatch ? douyinIdMatch[1] : '';

      // 粉丝、获赞、关注
      const allText = document.body.innerText;
      const followersMatch = allText.match(/(\d+\.?\d*[万wW]?)\s*粉丝/);
      const likesMatch = allText.match(/(\d+\.?\d*[万wW]?)\s*获赞/);
      const followingMatch = allText.match(/(\d+\.?\d*[万wW]?)\s*关注/);

      // IP属地
      const ipMatch = allText.match(/IP属地[：:]\s*(\S+)/);

      // 简介
      const bio = getText([
        '[data-e2e="user-info"] .e6wsjNLL',
        '.e6wsjNLL',
        '[data-e2e="user-desc"]',
      ]);

      // 视频列表
      const videoElements = document.querySelectorAll('[data-e2e="user-post-list"] li, .ECMy_Zdt li, ul[data-e2e="scroll-list"] li');
      const videos: Array<{ title: string; likes: string; isPinned: boolean }> = [];

      videoElements.forEach((el) => {
        const titleEl = el.querySelector('a p, .iQKjW6dr p, a[title]');
        const title = titleEl?.textContent?.trim() || (titleEl as HTMLElement)?.getAttribute('title') || '';

        // 点赞数
        const likesEl = el.querySelector('.author-card-user-video-like, span[class*="like"], [data-e2e="video-like"]');
        const likes = likesEl?.textContent?.trim() || '';

        // 是否置顶
        const isPinned = !!el.querySelector('[class*="pin"], [class*="top"], :has(> span:contains("置顶"))');

        if (title) {
          videos.push({ title, likes, isPinned });
        }
      });

      // 如果上面没拿到视频，尝试另一种方式
      if (videos.length === 0) {
        const allLinks = document.querySelectorAll('a[href*="/video/"]');
        allLinks.forEach((link) => {
          const p = link.querySelector('p');
          const title = p?.textContent?.trim() || link.getAttribute('title') || '';
          if (title) {
            videos.push({ title, likes: '', isPinned: false });
          }
        });
      }

      return {
        username,
        douyinId,
        followers: followersMatch?.[1] || '',
        likes: likesMatch?.[1] || '',
        following: followingMatch?.[1] || '',
        ipLocation: ipMatch?.[1] || '',
        bio,
        videos,
      };
    });

    return {
      ...data,
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    await context.close();
  }
}

/**
 * 解析数字字符串（如 "1.2万" -> 12000）
 */
export function parseDouyinNumber(str: string): number {
  if (!str) return 0;
  str = str.replace(/\s/g, '');
  const wanMatch = str.match(/([\d.]+)[万wW]/);
  if (wanMatch) return Math.round(parseFloat(wanMatch[1]) * 10000);
  const numMatch = str.match(/[\d.]+/);
  if (numMatch) return parseFloat(numMatch[0]);
  return 0;
}

export { closeBrowser };
