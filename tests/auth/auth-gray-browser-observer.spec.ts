import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, type ConsoleMessage, type Page, type Response } from 'playwright';

type TraceEvent = {
  event: string;
  metadata: Record<string, boolean | number | string | null>;
};

type Observation = {
  loginAttemptId: string | null;
  requestId: string | null;
  httpStatus: number | null;
  responseType: 'not_received' | 'http_success' | 'http_failure';
  adapterMode: string | null;
  runtimeState: Record<string, boolean | string> | null;
  pathname: string | null;
  stopReason: string | null;
  traceEvents: TraceEvent[];
};

const target = process.env.XMT_AUTH_GRAY_OBSERVER_URL;
if (!target) throw new Error('XMT_AUTH_GRAY_OBSERVER_URL is required');
const liveUsername = process.env.XMT_AUTH_GRAY_OBSERVER_USERNAME;
const livePassword = process.env.XMT_AUTH_GRAY_OBSERVER_PASSWORD;
const useMock = process.env.XMT_AUTH_GRAY_OBSERVER_MOCK === 'true';
if (!useMock && (!liveUsername || !livePassword)) {
  throw new Error('Live observer requires temporary username/password environment variables');
}

const origin = new URL(target).origin;
const observation: Observation = {
  loginAttemptId: null, requestId: null, httpStatus: null, responseType: 'not_received',
  adapterMode: null, runtimeState: null, pathname: null, stopReason: null, traceEvents: [],
};

async function safeMetadata(message: ConsoleMessage): Promise<Record<string, boolean | number | string | null>> {
  const candidate = message.args()[1];
  if (!candidate) return {};
  const value = await candidate.jsonValue();
  if (!value || typeof value !== 'object') return {};
  const allowed = new Set(['mode', 'responseKind', 'status', 'requestId', 'loginAttemptId', 'loginCompleted', 'hasAccessToken', 'hasUserId']);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => allowed.has(key) && (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null))) as Record<string, boolean | number | string | null>;
}

async function captureConsole(message: ConsoleMessage) {
  const text = message.text();
  if (!text.startsWith('[xmt-auth] ')) return;
  const event = text.slice('[xmt-auth] '.length).split(' ')[0] ?? 'unknown';
  const metadata = await safeMetadata(message);
  observation.traceEvents.push({ event, metadata });
  observation.loginAttemptId ??= typeof metadata.loginAttemptId === 'string' ? metadata.loginAttemptId : null;
  observation.requestId ??= typeof metadata.requestId === 'string' ? metadata.requestId : null;
  if (event === 'auth.adapter.selected') observation.adapterMode = typeof metadata.mode === 'string' ? metadata.mode : null;
}

async function captureResponse(response: Response) {
  if (response.request().method() !== 'POST' || new URL(response.url()).pathname !== '/api/auth/login') return;
  observation.httpStatus = response.status();
  observation.responseType = response.ok() ? 'http_success' : 'http_failure';
  observation.requestId = response.headers()['x-request-id'] ?? observation.requestId;
}

async function writeObservation() {
  const output = process.env.XMT_AUTH_GRAY_OBSERVER_OUTPUT;
  if (output) fs.writeFileSync(output, `${JSON.stringify(observation, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(observation));
}

function mockLoginResponse() {
  return {
    success: true,
    data: {
      user: { id: 991, username: 'gray-observer-fixture', email: 'fixture@example.invalid', role: 'member', name: 'Gray Observer Fixture', forceChangePassword: false },
      accessToken: 'fixture-v1-access-token', expiresIn: 900,
      session: {
        id: 'fixture-session-991', clientType: 'web', deviceName: 'Playwright', appVersion: null,
        createdAt: '2026-08-03T00:00:00.000Z', lastSeenAt: '2026-08-03T00:00:00.000Z',
        idleExpiresAt: '2026-08-04T00:00:00.000Z', absoluteExpiresAt: '2026-08-10T00:00:00.000Z', current: true,
      },
    },
    meta: { requestId: 'gray-observer-mock-request' },
  };
}

async function run(page: Page) {
  page.on('console', (message) => { void captureConsole(message); });
  page.on('response', (response) => { void captureResponse(response); });
  await page.addInitScript(() => { window.__xmtAuthGrayBrowserObserver = true; });
  if (useMock) {
    await page.route(`${origin}/api/**`, (route) => route.abort());
    await page.route(`${origin}/socket.io/**`, (route) => route.abort());
    await page.route(`${origin}/api/auth/login`, (route) => route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'X-Request-ID': 'gray-observer-mock-request' }, body: JSON.stringify(mockLoginResponse()),
    }));
  }
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('输入用户名').fill(useMock ? 'gray-observer-fixture' : liveUsername!);
  await page.getByPlaceholder('输入密码').fill(useMock ? 'fixture-password' : livePassword!);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForTimeout(1_000);
  observation.pathname = new URL(page.url()).pathname;
  observation.runtimeState = await page.evaluate(() => window.__xmtAuthRuntime?.getTraceSnapshot?.() ?? null);
  if (observation.responseType === 'http_success' && observation.pathname !== '/') {
    observation.stopReason = 'login_success_without_home_redirect';
    await writeObservation();
    throw new Error('Gray browser observer stop: login succeeded but the page did not enter /');
  }
  await writeObservation();
}

const browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
const context = await browser.newContext();
try {
  await run(await context.newPage());
  assert.equal(observation.responseType, 'http_success');
  assert.equal(observation.adapterMode, 'v1-web');
  assert.equal(observation.runtimeState?.status, 'redirecting');
  assert.equal(observation.pathname, '/');
  assert.equal(observation.traceEvents.some((item) => item.event === 'auth.redirect.end'), true);
} finally {
  await context.close();
  await browser.close();
}
