import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { defaultSystemSettings } from '../../src/lib/systemSettings';

const app = express();
app.use(express.json());
let v1LegacyMeRequests = 0;
let loginLayout: 'style1' | 'style2' | 'style3' = 'style1';

function parseCssColor(value: string) {
  const normalized = value.trim();
  if (/^#[\da-f]{6}$/i.test(normalized)) {
    return {
      channels: [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)),
      alpha: 1,
    };
  }
  const values = normalized.match(/[\d.]+/g)?.map(Number) ?? [];
  assert.ok(values.length >= 3, `Could not parse CSS color: ${value}`);
  return { channels: values.slice(0, 3), alpha: values[3] ?? 1 };
}

function contrastRatio(foregroundCss: string, backgroundCss: string) {
  const background = parseCssColor(backgroundCss).channels;
  const foreground = parseCssColor(foregroundCss);
  const composite = foreground.channels.map((channel, index) => channel * foreground.alpha + background[index] * (1 - foreground.alpha));
  const luminance = (channels: number[]) => channels.reduce((sum, channel, index) => {
    const normalized = channel / 255;
    const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
  const lighter = Math.max(luminance(composite), luminance(background));
  const darker = Math.min(luminance(composite), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

app.get('/api/system-settings/public', (_request, response) => {
  response.json({ ...defaultSystemSettings, login: { ...defaultSystemSettings.login, layout: loginLayout } });
});

app.post('/api/auth/login', (request, response) => {
  const { username } = request.body as { username?: unknown };
  if (username === 'v1-navigation-user') {
    response.json({
      success: true,
      data: {
        user: {
          id: 102,
          username,
          email: 'v1-navigation@example.invalid',
          role: 'member',
          name: 'V1 Navigation User',
          forceChangePassword: false,
        },
        accessToken: 'v1-navigation-memory-token',
        expiresIn: 900,
        session: {
          id: 'session-v1-navigation',
          clientType: 'web',
          deviceName: 'Playwright',
          appVersion: null,
          createdAt: '2026-08-03T00:00:00.000Z',
          lastSeenAt: '2026-08-03T00:00:00.000Z',
          idleExpiresAt: '2026-08-04T00:00:00.000Z',
          absoluteExpiresAt: '2026-08-10T00:00:00.000Z',
          current: true,
        },
      },
      requestId: 'v1-navigation-request',
    });
    return;
  }

  response.json({
    user: {
      id: 101,
      username: 'legacy-navigation-user',
      email: 'legacy-navigation@example.invalid',
      role: 'member',
      name: 'Legacy Navigation User',
      enabled: true,
      force_change_password: false,
      created_at: '2026-08-03T00:00:00.000Z',
      updated_at: '2026-08-03T00:00:00.000Z',
    },
    token: 'legacy-navigation-token',
  });
});

app.get('/api/auth/me', (request, response) => {
  if (request.headers.authorization === 'Bearer v1-navigation-memory-token') {
    v1LegacyMeRequests += 1;
    response.status(401).json({ message: 'legacy endpoint must not receive a v1 access token' });
    return;
  }
  response.json({
    id: 101,
    username: 'legacy-navigation-user',
    email: 'legacy-navigation@example.invalid',
    role: 'member',
    name: 'Legacy Navigation User',
    enabled: true,
    force_change_password: false,
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  });
});

const server = http.createServer(app);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;

const vite = await createViteServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'spa',
  logLevel: 'error',
});
app.use(vite.middlewares);

const projectChromiumPath = chromium.executablePath();
const browser = await chromium.launch({ headless: true, executablePath: projectChromiumPath });

async function loginAndAssert(username: string, expectedV1: boolean, layout: 'style1' | 'style2' | 'style3') {
  loginLayout = layout;
  const context = await browser.newContext();
  const page = await context.newPage();
  const traceEvents: string[] = [];
  page.on('console', (message) => {
    try {
      const record = JSON.parse(message.text()) as { application?: unknown; event?: unknown; authEvent?: unknown };
      if (record.application === 'xmt-web' && record.event === 'auth.login_trace' && typeof record.authEvent === 'string') {
        traceEvents.push(record.authEvent);
      }
    } catch {
      // Ignore non-structured browser console messages.
    }
  });
  try {
    await page.goto(`${baseUrl}/login`);
    const usernameLabel = layout === 'style1' ? '用户名' : '账号';
    const usernameInput = page.getByLabel(usernameLabel, { exact: true });
    const passwordInput = page.getByLabel('密码', { exact: true });
    await page.waitForTimeout(500);
    const usernameInputCount = await usernameInput.count();
    assert.equal(usernameInputCount, 1, `${layout} exposes one programmatically labelled username input`);
    assert.equal(await passwordInput.count(), 1, `${layout} exposes one programmatically labelled password input`);
    const footerLink = page.locator('a[href^="https://beian.miit.gov.cn/"]');
    const footerColors = await footerLink.evaluate((element) => {
      const scope = element.closest('.xmt-theme-scope') ?? document.documentElement;
      return {
        foreground: getComputedStyle(element).color,
        background: getComputedStyle(scope).getPropertyValue('--xmt-app-bg').trim(),
      };
    });
    assert.ok(contrastRatio(footerColors.foreground, footerColors.background) >= 4.5, `${layout} footer filing link meets 4.5:1 against the theme background`);
    await usernameInput.fill(username);
    await passwordInput.fill('test-password');
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`${baseUrl}/`, { timeout: 8_000 });
    await page.waitForTimeout(250);
    assert.equal(new URL(page.url()).pathname, '/');

    const runtimeState = await page.evaluate(() => {
      const runtime = window.__xmtAuthRuntime;
      return {
        hasRuntime: Boolean(runtime),
        hasAccessToken: Boolean(runtime?.getAccessToken()),
      };
    });
    assert.equal(runtimeState.hasRuntime, expectedV1);
    assert.equal(runtimeState.hasAccessToken, expectedV1);
    if (expectedV1) {
      for (const trace of [
        'auth.response.received',
        'auth.adapter.selected',
        'auth.runtime.before',
        'auth.runtime.after',
        'auth.redirect.start',
        'auth.redirect.end',
      ]) {
        assert(traceEvents.includes(trace), `Missing development trace: ${trace}`);
      }
    }
  } finally {
    await context.close();
  }
}

try {
  await loginAndAssert('legacy-navigation-user', false, 'style1');
  await loginAndAssert('v1-navigation-user', true, 'style2');
  await loginAndAssert('legacy-navigation-user', false, 'style3');
  assert.equal(v1LegacyMeRequests, 0);
  console.log('Auth login navigation browser tests passed');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
