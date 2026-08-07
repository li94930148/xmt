import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const productionUrl = process.env.XMT_PRODUCTION_TEST_URL;
if (!productionUrl) {
  throw new Error('XMT_PRODUCTION_TEST_URL is required for the production build runtime test');
}

const origin = new URL(productionUrl).origin;
const browser = await chromium.launch({
  headless: true,
  executablePath: chromium.executablePath(),
});
const context = await browser.newContext();
const page = await context.newPage();
const requests: string[] = [];

page.on('request', (request) => {
  if (new URL(request.url()).origin === origin) requests.push(new URL(request.url()).pathname);
});

// Keep this production-domain verification read-only: only the static bundle is
// fetched from production. API and socket traffic are locally intercepted.
await page.route(`${origin}/api/**`, (route) => route.abort());
await page.route(`${origin}/socket.io/**`, (route) => route.abort());
await page.route(`${origin}/api/auth/login`, async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      success: true,
      data: {
        user: {
          id: 901,
          username: 'production-build-runtime-fixture',
          email: 'fixture@example.invalid',
          role: 'member',
          name: 'Production Build Fixture',
          forceChangePassword: false,
        },
        accessToken: 'fixture-v1-access-token',
        expiresIn: 900,
        session: {
          id: 'fixture-session-901', clientType: 'web', deviceName: 'Playwright', appVersion: null,
          createdAt: '2026-08-03T00:00:00.000Z', lastSeenAt: '2026-08-03T00:00:00.000Z',
          idleExpiresAt: '2026-08-04T00:00:00.000Z', absoluteExpiresAt: '2026-08-10T00:00:00.000Z', current: true,
        },
      },
      meta: { requestId: 'production-build-runtime-fixture' },
    }),
  });
});

try {
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('输入用户名').fill('production-build-runtime-fixture');
  await page.getByPlaceholder('输入密码').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(`${origin}/`, { timeout: 10_000 });

  const runtime = await page.evaluate(() => ({
    present: Boolean(window.__xmtAuthRuntime),
    hasAccessToken: Boolean(window.__xmtAuthRuntime?.getAccessToken()),
  }));
  assert.deepEqual(runtime, { present: true, hasAccessToken: true });
  assert.equal(requests.includes('/api/auth/me'), false, 'v1 Web login must not call the legacy me endpoint');
  console.log('Production build runtime browser test passed');
} finally {
  await context.close();
  await browser.close();
}
