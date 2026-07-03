import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5174';
const USERNAME = process.env.E2E_USERNAME;
const PASSWORD = process.env.E2E_PASSWORD;

const routes = ['/daily-report', '/retrospectives'];

function log(message) {
  console.log(`[e2e-smoke] ${message}`);
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.fill(value);
      return true;
    }
  }
  return false;
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.click();
      return true;
    }
  }
  return false;
}

async function assertNoBlank(page, label) {
  const bodyText = (await page.locator('body').innerText({ timeout: 10_000 })).trim();
  if (!bodyText) {
    throw new Error(`${label} rendered blank body`);
  }
  const overlay = page.locator('text=/Failed to fetch dynamically imported module|Internal server error|Vite/i');
  if (await overlay.count()) {
    const text = await overlay.first().innerText().catch(() => '');
    throw new Error(`${label} shows framework/runtime overlay: ${text.slice(0, 160)}`);
  }
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await assertNoBlank(page, 'login page');

  const hasUser = await fillFirst(page, [
    'input[name="username"]',
    'input[type="text"]',
    'input[autocomplete="username"]',
  ], USERNAME);
  const hasPassword = await fillFirst(page, [
    'input[name="password"]',
    'input[type="password"]',
    'input[autocomplete="current-password"]',
  ], PASSWORD);

  if (!hasUser || !hasPassword) {
    throw new Error('Cannot find username/password inputs on login page');
  }

  const clicked = await clickFirst(page, [
    'button[type="submit"]',
    'button:has-text("登录")',
    'button:has-text("Sign in")',
  ]);
  if (!clicked) {
    throw new Error('Cannot find login submit button');
  }

  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  const url = page.url();
  if (url.includes('/login')) {
    throw new Error('Login did not leave /login. Check E2E_USERNAME/E2E_PASSWORD or account status.');
  }
}

async function run() {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Executable doesn't exist|playwright install/i.test(message)) {
      log('Playwright browser binary is not installed. Skip browser smoke; run `npx playwright install chromium` locally to enable it.');
      return;
    }
    throw error;
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  try {
    if (!USERNAME || !PASSWORD) {
      log('Missing E2E_USERNAME/E2E_PASSWORD. Running public login/guard smoke only.');
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await assertNoBlank(page, 'login page');
      for (const route of routes) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        if (!page.url().includes('/login')) {
          throw new Error(`${route} should require login when no session exists`);
        }
      }
      log('Public login/guard smoke passed.');
      return;
    }

    await login(page);
    for (const route of routes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await assertNoBlank(page, route);
      if (page.url().includes('/login')) {
        throw new Error(`${route} redirected back to login after successful login`);
      }
      log(`${route} opened.`);
    }

    await page.evaluate(() => {
      document.documentElement.classList.toggle('dark', true);
      document.documentElement.dataset.theme = 'dark';
    });
    await assertNoBlank(page, 'dark mode smoke');

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected: ${consoleErrors.slice(0, 3).join(' | ')}`);
    }
    log('Authenticated route smoke passed.');
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`[e2e-smoke] ${error.message}`);
  process.exitCode = 1;
});
