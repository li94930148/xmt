import { chromium, type Page } from 'playwright';

const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5174';
const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]').first().fill(username!);
  await page.locator('input[name="password"], input[autocomplete="current-password"], input[type="password"]').first().fill(password!);
  await page.locator('button[type="submit"], button:has-text("登录")').first().click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function inspectViewport(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const result = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert(result.scrollWidth <= result.clientWidth, `${width}x${height} has horizontal overflow`);
}

async function run() {
  if (!username || !password) {
    console.log('[reactbits-theme] skipped: set E2E_USERNAME and E2E_PASSWORD for authenticated compatibility checks');
    return;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') failures.push(message.text()); });
  try {
    await login(page);
    await page.goto(`${baseUrl}/notification-settings`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '外观与动效', exact: true }).click();
    await page.getByText('React Bits 原生动效外观中心', { exact: true }).waitFor();

    for (const fontSize of [14, 16, 18, 20, 22, 24]) {
      await page.locator('select').nth(1).selectOption(String(fontSize));
      await inspectViewport(page, 1440, 900);
      await inspectViewport(page, 390, 844);
    }

    for (const preview of await page.locator('[data-reactbits-button]').all()) {
      const box = await preview.boundingBox();
      assert(box && box.height >= 32, 'React Bits button has an invalid height');
      const style = await preview.evaluate((node) => {
        const computed = getComputedStyle(node);
        return { color: computed.color, backgroundColor: computed.backgroundColor };
      });
      assert(style.color !== style.backgroundColor, 'React Bits button foreground matches its background');
    }
    const glare = page.getByText('glare-hover', { exact: false }).first();
    if (await glare.count()) {
      const box = await glare.boundingBox();
      assert(!box || (box.width < 500 && box.height < 500), 'GlareHover wrapper kept the 500px default box');
    }
    assert(await page.getByText('页面出错了', { exact: true }).count() === 0, 'React error boundary is visible');
    assert(failures.length === 0, `console errors/warnings: ${failures.slice(0, 3).join(' | ')}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(`[reactbits-theme] ${error.message}`); process.exitCode = 1; });
