import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Locator, type Page } from 'playwright';

const baseUrl = process.env.XMT_E2E_BASE_URL || 'http://localhost:5174';
const username = process.env.XMT_E2E_USERNAME;
const password = process.env.XMT_E2E_PASSWORD;
const screenshotDir = process.env.XMT_LIGHT_THEME_SCREENSHOT_DIR || '/tmp/xmt-light-theme-contrast';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalUrl(rawUrl: string) {
  const host = new URL(rawUrl).hostname;
  assert(host === 'localhost' || host === '127.0.0.1', `refusing non-local test target: ${host}`);
}

async function dismissSystemUpdateDialog(page: Page) {
  const button = page.getByRole('button', { name: '我知道了', exact: true });
  await button.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => undefined);
  if (await button.isVisible().catch(() => false)) await button.click();
}

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]').first().fill(username!);
  await page.locator('input[name="password"], input[autocomplete="current-password"], input[type="password"]').first().fill(password!);
  await page.locator('button[type="submit"], button:has-text("登录")').first().click();
  await page.waitForFunction((origin) => new URL(window.location.href).origin === origin && !new URL(window.location.href).pathname.startsWith('/login'), new URL(baseUrl).origin, { timeout: 15_000 });
  await dismissSystemUpdateDialog(page);
}

type Color = { r: number; g: number; b: number; a: number };

function parseColor(value: string): Color | null {
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1 } : null;
}

function luminance(color: Color) {
  const values = [color.r, color.g, color.b].map((value) => value / 255 <= 0.03928 ? value / 255 / 12.92 : Math.pow((value / 255 + 0.055) / 1.055, 2.4));
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

async function contrast(locator: Locator) {
  const styles = await locator.evaluate((node) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = node; current; current = current.parentElement) backgrounds.push(getComputedStyle(current).backgroundColor);
    return { foreground: getComputedStyle(node).color, backgrounds };
  });
  const foreground = parseColor(styles.foreground);
  if (!foreground) return 0;
  let background: Color = { r: 255, g: 255, b: 255, a: 1 };
  for (const value of styles.backgrounds.reverse()) {
    const layer = parseColor(value);
    if (!layer || layer.a === 0) continue;
    background = { r: layer.r * layer.a + background.r * (1 - layer.a), g: layer.g * layer.a + background.g * (1 - layer.a), b: layer.b * layer.a + background.b * (1 - layer.a), a: 1 };
  }
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

async function assertReadable(locator: Locator, label: string, minimum = 4.5) {
  await locator.waitFor({ state: 'visible', timeout: 15_000 });
  const ratio = await contrast(locator);
  assert(ratio >= minimum, `${label} contrast=${ratio.toFixed(2)} expected>=${minimum}`);
}

async function run() {
  if (!username || !password) {
    console.log('未提供认证测试环境变量，跳过认证态亮色对比度测试');
    return;
  }
  assertLocalUrl(baseUrl);
  await fs.mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  let originalTheme: 'light' | 'dark' = 'dark';
  try {
    await login(page);
    await dismissSystemUpdateDialog(page);
    originalTheme = await page.evaluate(() => document.documentElement.classList.contains('light') ? 'light' : 'dark');
    if (originalTheme === 'dark') await page.getByRole('button', { name: '切换主题', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('light'));

    await page.goto(`${baseUrl}/topics`, { waitUntil: 'domcontentloaded' });
    await dismissSystemUpdateDialog(page);
    await assertReadable(page.getByText('选题管理', { exact: true }).first(), '选题管理标题', 7);
    for (const label of ['待审核选题', '生产链路中', '临期或逾期']) {
      const text = page.getByText(label, { exact: true }).first();
      await assertReadable(text, label);
      const card = text.locator('xpath=ancestor::*[@data-reactbits-spotlight-card][1]');
      assert(await card.count() === 1, `${label} is not inside the themed SpotlightCard`);
      const background = await card.evaluate((node) => getComputedStyle(node).backgroundColor);
      assert(!/^rgb\((?:1[0-9]|2[0-9]),\s*(?:1[0-9]|2[0-9]),\s*(?:1[0-9]|2[0-9])\)$/.test(background), `${label} retained a dark fixed background: ${background}`);
    }
    await page.screenshot({ path: path.join(screenshotDir, 'topics-light.png'), fullPage: true });

    const topicButtons = page.locator('tbody td:nth-child(2) button');
    if (await topicButtons.count()) {
      await topicButtons.first().click();
      await page.waitForFunction(() => /^\/topics\/\d+/.test(new URL(window.location.href).pathname), undefined, { timeout: 10_000 });
      await assertReadable(page.getByText('关联资料', { exact: true }).first(), '关联资料标题');
      const resourceLinks = page.locator('a[href^="/asset-center/resources/"]');
      for (let index = 0; index < Math.min(await resourceLinks.count(), 5); index += 1) {
        await assertReadable(resourceLinks.nth(index), `关联资料 ${index + 1}`);
      }
      await page.screenshot({ path: path.join(screenshotDir, 'topic-detail-light.png'), fullPage: true });
    } else {
      console.log('本地无选题数据，跳过详情页关联资料校验');
    }
    assert(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
    console.log(`亮色对比度测试通过，截图目录：${screenshotDir}`);
  } finally {
    if (originalTheme === 'dark' && await page.getByRole('button', { name: '切换主题', exact: true }).count().catch(() => 0)) {
      if (await page.evaluate(() => document.documentElement.classList.contains('light')).catch(() => false)) {
        await page.getByRole('button', { name: '切换主题', exact: true }).click().catch(() => undefined);
      }
    }
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`[light-theme-contrast] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
