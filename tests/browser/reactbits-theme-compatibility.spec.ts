import { chromium, type Page } from 'playwright';

const baseUrl = process.env.XMT_E2E_BASE_URL || 'http://localhost:5174';
const username = process.env.XMT_E2E_USERNAME;
const password = process.env.XMT_E2E_PASSWORD;
const fontSizes = [14, 16, 18, 20, 22, 24];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalUrl(url: string) {
  const host = new URL(url).hostname;
  assert(host === 'localhost' || host === '127.0.0.1', `refusing non-local test target: ${host}`);
}

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]').first().fill(username!);
  await page.locator('input[name="password"], input[autocomplete="current-password"], input[type="password"]').first().fill(password!);
  await page.locator('button[type="submit"], button:has-text("登录")').first().click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 });
  await page.getByText('内容生产驾驶舱', { exact: false }).first().waitFor({ timeout: 15_000 });
}

async function selectField(page: Page, label: string, value: string) {
  const select = page.locator('label').filter({ hasText: label }).locator('select');
  await select.selectOption(value);
}

async function assertNoOverflow(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const result = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert(result.scrollWidth <= result.clientWidth, `${width}x${height} has horizontal overflow`);
}

async function assertButtonPresentation(page: Page) {
  const buttons = page.locator('[data-reactbits-button]');
  assert(await buttons.count() > 0, 'React Bits button matrix is not visible');
  for (let index = 0; index < await buttons.count(); index += 1) {
    const button = buttons.nth(index);
    const box = await button.boundingBox();
    assert(box && box.width > 0 && box.height >= 32 && box.width < 500 && box.height < 500, `invalid React Bits button box at ${index}`);
    const readable = await button.evaluate((node) => {
      const style = getComputedStyle(node);
      return style.color !== style.backgroundColor && style.visibility !== 'hidden';
    });
    assert(readable, `unreadable React Bits button at ${index}`);
  }
}

async function run() {
  if (!username || !password) {
    console.log('未提供认证测试环境变量，跳过认证态测试');
    return;
  }
  assertLocalUrl(baseUrl);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await login(page);
    const heroButton = page.getByRole('button', { name: /进入选题池/ }).first();
    await heroButton.waitFor({ timeout: 15_000 });
    const heroBox = await heroButton.boundingBox();
    assert(heroBox && heroBox.width > 0 && heroBox.height >= 32, 'Home Hero button is clipped or unavailable');
    await heroButton.click();
    await page.waitForURL((url) => url.pathname === '/topics', { timeout: 10_000 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    const heading = page.locator('[role="heading"][aria-level="1"]').first();
    const headingFits = await heading.evaluate((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight);
    assert(headingFits, 'Home animated title is clipped');
    await page.goto(`${baseUrl}/notification-settings`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '外观与动效', exact: true }).click();
    await page.getByText('React Bits 原生动效外观中心', { exact: true }).waitFor();

    for (const themeButton of ['深色模式', '浅色模式']) {
      const theme = page.getByRole('button', { name: themeButton, exact: true });
      if (await theme.count()) await theme.click();
      await page.getByText(themeButton === '深色模式' ? '深色真实预览' : '浅色真实预览', { exact: true }).waitFor();
      await assertButtonPresentation(page);
    }

    const presetCount = await page.locator('button').filter({ hasText: '深空' }).count();
    assert(presetCount >= 1, 'React Bits presets are not visible');
    const presetButtons = page.locator('section').filter({ has: page.getByText('React Bits 原生动效外观中心', { exact: true }) }).locator('div.grid > button');
    const count = await presetButtons.count();
    assert(count === 6, `expected six presets, received ${count}`);
    for (let index = 0; index < count; index += 1) {
      await presetButtons.nth(index).click();
      assert(await page.getByText('页面出错了', { exact: true }).count() === 0, `error boundary after preset ${index + 1}`);
    }
    for (const fontSize of fontSizes) {
      await selectField(page, '界面字号', String(fontSize));
      await assertNoOverflow(page, 1440, 900);
      await assertNoOverflow(page, 1024, 768);
      await assertNoOverflow(page, 390, 844);
    }
    await selectField(page, '标题文本动画', 'true-focus');
    await assertNoOverflow(page, 390, 844);
    const metricFits = await page.locator('text=128').first().evaluate((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight);
    assert(metricFits, 'Animated metric is clipped');
    await assertButtonPresentation(page);

    await selectField(page, '主按钮外观', 'specular-button');
    await selectField(page, '按钮交互', 'magnet');
    await assertButtonPresentation(page);
    await selectField(page, '主按钮外观', 'star-border');
    await selectField(page, '按钮交互', 'click-spark');
    await assertButtonPresentation(page);
    await selectField(page, '按钮交互', 'glare-hover');
    await assertButtonPresentation(page);

    const canvases = await page.locator('canvas').count();
    assert(canvases <= 2, `duplicate canvases detected: ${canvases}`);
    assert(await page.getByText('页面出错了', { exact: true }).count() === 0, 'React error boundary is visible');
    await page.getByRole('button', { name: '保存外观与动效', exact: true }).click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '外观与动效', exact: true }).click();
    await page.getByText('React Bits 原生动效外观中心', { exact: true }).waitFor();
    await page.getByRole('button', { name: '恢复默认', exact: true }).click();
    await page.getByRole('button', { name: '保存外观与动效', exact: true }).click();
    assert(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(`[reactbits-theme] ${error.message}`); process.exitCode = 1; });
