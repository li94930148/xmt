import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import express from 'express';
import { createServer as createViteServer } from 'vite';

const app = express();
app.use(express.json());
let v1LegacyMeRequests = 0;

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

async function loginAndAssert(username: string, expectedV1: boolean) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const traceEvents: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[xmt-auth]')) traceEvents.push(text);
  });
  try {
    await page.goto(`${baseUrl}/login`);
    await page.getByPlaceholder('输入用户名').fill(username);
    await page.getByPlaceholder('输入密码').fill('test-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
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
        assert(traceEvents.some((event) => event.includes(trace)), `Missing development trace: ${trace}`);
      }
    }
  } finally {
    await context.close();
  }
}

try {
  await loginAndAssert('legacy-navigation-user', false);
  await loginAndAssert('v1-navigation-user', true);
  assert.equal(v1LegacyMeRequests, 0);
  console.log('Auth login navigation browser tests passed');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
