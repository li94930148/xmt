import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import express, { type Request, type Response } from 'express';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-auth-browser-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'auth-browser.test.db');
process.env.JWT_SECRET = 'auth-browser-legacy-secret';
process.env.JWT_V1_ISSUER = 'xmt-auth-browser-test';
process.env.JWT_V1_AUDIENCE = 'xmt-auth-browser-clients';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { beijingNow, execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { requestId } = await import('../../api/middleware/request-id.js');
const { createAuthV1Module } = await import('../../api/modules/auth/v1/index.js');
const { isAuthWebAllowed } = await import('../../api/modules/auth/web/auth-web.config.js');
const { sendV1Error } = await import('../../api/utils/response.js');

await initDatabase();
const passwordHash = await bcrypt.hash('auth-browser-password', 10);
const userId = await executeInsert(
  `INSERT INTO users (username, password, email, role, name, enabled, force_change_password)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ['auth-browser-user', passwordHash, 'auth-browser@example.invalid', 'member', 'Auth Browser User', 1, 0],
);

assert.equal(isAuthWebAllowed(userId, {}), false);
assert.equal(isAuthWebAllowed(userId, {
  XMT_AUTH_V1_ENABLED: 'true',
  XMT_AUTH_WEB_ENABLED: 'true',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: String(userId),
  NODE_ENV: 'test',
}), true);
assert.equal(isAuthWebAllowed(userId + 1, {
  XMT_AUTH_V1_ENABLED: 'true',
  XMT_AUTH_WEB_ENABLED: 'true',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: String(userId),
  NODE_ENV: 'test',
}), false);
assert.equal(isAuthWebAllowed(userId, {
  XMT_AUTH_V1_ENABLED: 'true',
  XMT_AUTH_WEB_ENABLED: 'true',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: String(userId),
  NODE_ENV: 'production',
}), false);

const app = express();
app.use(requestId);
app.use(express.json());
const server = http.createServer(app);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, 'localhost', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://localhost:${address.port}`;

app.use('/api/v1/auth', createAuthV1Module('auth-browser-refresh-pepper', {
  webConfig: {
    enabled: true,
    allowlistedUserIds: new Set([userId]),
    allowedOrigins: new Set([baseUrl]),
    csrfSecret: 'auth-browser-csrf-secret',
    secureCookies: true,
  },
}).router);
app.use('/api/v1', (req: Request, res: Response) => sendV1Error(
  req,
  res,
  { code: 'RESOURCE_NOT_FOUND', message: 'API 不存在' },
  404,
));

const vite = await createViteServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'spa',
  logLevel: 'error',
});
app.use(vite.middlewares);

type FixtureState = {
  mode: 'legacy' | 'v1-web';
  status: 'anonymous' | 'bootstrapping' | 'authenticated' | 'refreshing' | 'expired';
  token: string | null;
  user: { id: number } | null;
  lastSessionId: string | null;
  refreshCount: number;
  refreshCookieVisible: boolean;
  csrfCookieVisible: boolean;
  accessTokenPersisted: boolean;
};

async function call<T>(page: Page, expression: string): Promise<T> {
  return page.evaluate(expression) as Promise<T>;
}

async function openFixture(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/tests/auth/browser/fixture.html`);
  await page.waitForFunction(() => 'authFixture' in window);
  assert.equal(await page.title(), 'XMT Auth Browser Fixture');
  assert.match(await page.locator('body').innerText(), /XMT Web Auth 暗启验证/);
  return page;
}

async function resetAndLogin(context: BrowserContext, page: Page) {
  await context.clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.waitForFunction(() => 'authFixture' in window);
  return call<FixtureState>(page, 'window.authFixture.login()');
}

const projectChromiumPath = chromium.executablePath();
assert(fs.existsSync(projectChromiumPath), `项目 Playwright Chromium 不存在：${projectChromiumPath}`);
const browser = await chromium.launch({
  headless: true,
  // Do not fall back to a system browser: this suite must run against the
  // Chromium revision installed for this project.
  executablePath: projectChromiumPath,
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const consoleErrors: string[] = [];
let page: Page | null = null;

try {
  page = await openFixture(context);
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const loggedIn = await call<FixtureState>(page, 'window.authFixture.login()');
  assert.equal(loggedIn.status, 'authenticated');
  assert.equal(loggedIn.accessTokenPersisted, false);
  assert.equal(loggedIn.refreshCookieVisible, false);
  assert.equal(loggedIn.csrfCookieVisible, true);

  const browserCookies = await context.cookies(baseUrl);
  const refreshCookie = browserCookies.find((cookie) => cookie.name === '__Host-xmt_refresh');
  assert(refreshCookie);
  assert.equal(refreshCookie.httpOnly, true);
  assert.equal(refreshCookie.secure, true);
  assert.equal(refreshCookie.sameSite, 'Lax');
  assert.equal(refreshCookie.path, '/');

  await page.reload();
  await page.waitForFunction(() => 'authFixture' in window);
  const afterF5 = await call<FixtureState>(page, 'window.authFixture.coldBoot()');
  assert.equal(afterF5.status, 'authenticated');
  assert.equal(afterF5.accessTokenPersisted, false);

  const newTab = await openFixture(context);
  const newTabState = await call<FixtureState>(newTab, 'window.authFixture.coldBoot()');
  assert.equal(newTabState.status, 'authenticated');
  assert.equal(newTabState.accessTokenPersisted, false);
  await newTab.close();

  const reopenedPage = await openFixture(context);
  await page.close();
  page = reopenedPage;
  const reopenedState = await call<FixtureState>(page, 'window.authFixture.coldBoot()');
  assert.equal(reopenedState.status, 'authenticated');

  await page.evaluate('window.authFixture.expireAccess()');
  const concurrent = await call<{
    refreshes: number;
    resultCount: number;
    state: FixtureState;
  }>(page, 'window.authFixture.parallelSessions(5)');
  assert.equal(concurrent.refreshes, 1);
  assert.equal(concurrent.resultCount, 5);
  assert.equal(concurrent.state.status, 'authenticated');

  await resetAndLogin(context, page);
  await context.clearCookies();
  const missingCookie = await call<{ state: FixtureState }>(page, 'window.authFixture.refreshNow()');
  assert.equal(missingCookie.state.status, 'expired');
  assert.equal(missingCookie.state.token, null);
  assert.equal(missingCookie.state.user, null);

  const revokedLogin = await resetAndLogin(context, page);
  assert(revokedLogin.lastSessionId);
  await execute(
    "UPDATE auth_sessions SET revoked_at = ?, revoke_reason = 'admin' WHERE id = ?",
    [beijingNow(), revokedLogin.lastSessionId],
  );
  const revoked = await call<{ state: FixtureState }>(page, 'window.authFixture.refreshNow()');
  assert.equal(revoked.state.status, 'expired');
  assert.equal(revoked.state.user, null);

  await resetAndLogin(context, page);
  const oldRefreshCookie = (await context.cookies(baseUrl))
    .find((cookie) => cookie.name === '__Host-xmt_refresh');
  assert(oldRefreshCookie);
  const normalRefresh = await call<{ state: FixtureState }>(page, 'window.authFixture.refreshNow()');
  assert.equal(normalRefresh.state.status, 'authenticated');
  await context.addCookies([oldRefreshCookie]);
  const reused = await call<{ state: FixtureState }>(page, 'window.authFixture.refreshNow()');
  assert.equal(reused.state.status, 'expired');
  assert.equal(reused.state.token, null);
  assert.equal(reused.state.user, null);

  await resetAndLogin(context, page);
  await page.evaluate("window.authFixture.setCsrfOverride('invalid-csrf-token')");
  const csrfFailure = await call<{ state: FixtureState }>(page, 'window.authFixture.refreshNow()');
  assert.equal(csrfFailure.state.status, 'expired');
  assert.equal(csrfFailure.state.user, null);
  await page.evaluate('window.authFixture.setCsrfOverride(null)');

  const logoutLogin = await resetAndLogin(context, page);
  assert(logoutLogin.lastSessionId);
  const logoutState = await call<FixtureState>(page, 'window.authFixture.logout()');
  assert.equal(logoutState.status, 'anonymous');
  assert.equal(logoutState.token, null);
  const revokedSession = await queryOne<Record<string, unknown>>(
    'SELECT revoked_at, revoke_reason FROM auth_sessions WHERE id = ?',
    [logoutLogin.lastSessionId],
  );
  assert(revokedSession?.revoked_at);
  assert.equal(revokedSession.revoke_reason, 'logout');
  assert.equal((await context.cookies(baseUrl)).some((cookie) => cookie.name === '__Host-xmt_refresh'), false);
  assert.equal(await call<string>(page, 'window.authFixture.accessAfterLogout()'), 'authentication-required');

  await page.screenshot({ path: '/tmp/xmt-auth-browser-v2.13.9.png', fullPage: false });
  assert.equal(consoleErrors.length, 0, consoleErrors.join('\n'));
  console.log('Auth browser dark-launch contract tests passed');
} finally {
  await page?.close().catch(() => {});
  await context.close();
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
