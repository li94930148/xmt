import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
type PomodoroNotificationTestWindow = Window & {
  __xmtDesktopNotifications: Array<{ title: string; body: string }>;
};
type PomodoroMutationFixtureState = { startAttempts: number; cancelAttempts: number };
type PomodoroCompletionFixtureState = { completeAttempts: number; completedSessionIds: number[] };
const user = { id: 93, username: 'pomodoro-notification-qa', name: '专注通知验收', role: 'admin', enabled: true, force_change_password: false };
let nextSessionId = 1;
const completedSessionIds: number[] = [];
const unexpectedWrites: string[] = [];
let startAttempts = 0;
let cancelAttempts = 0;
let completeAttempts = 0;
let failNextStart = false;
let failNextCancel = false;
let failNextCompleteBeforeWrite = false;
let loseNextCompleteResponseAfterWrite = false;
let startGate: Promise<void> | null = null;
let releaseStartGate: (() => void) | null = null;
let cancelGate: Promise<void> | null = null;
let releaseCancelGate: (() => void) | null = null;
let completeGate: Promise<void> | null = null;
let releaseCompleteGate: (() => void) | null = null;

const app = express();
app.use(express.json());
app.get('/__qa', (_request, response) => response.type('html').send(`<script>
  localStorage.setItem('xmt_user', ${JSON.stringify(JSON.stringify(user))});
  localStorage.setItem('xmt_token', 'pomodoro-notification-fixture');
  localStorage.setItem('xmt_theme', 'light');
  localStorage.setItem('xmt_last_version_seen', ${JSON.stringify(version)});
  location.replace('/pomodoro');
</script>`));
app.get('/__qa/pomodoro-mutation-state', (_request, response) => response.json({ startAttempts, cancelAttempts }));
app.get('/__qa/pomodoro-completion-state', (_request, response) => response.json({ completeAttempts, completedSessionIds }));
app.post('/__qa/reset-pomodoro-mutations', (_request, response) => {
  startAttempts = 0;
  cancelAttempts = 0;
  completeAttempts = 0;
  failNextStart = false;
  failNextCancel = false;
  failNextCompleteBeforeWrite = false;
  loseNextCompleteResponseAfterWrite = false;
  releaseStartGate?.();
  releaseStartGate = null;
  startGate = null;
  releaseCancelGate?.();
  releaseCancelGate = null;
  cancelGate = null;
  releaseCompleteGate?.();
  releaseCompleteGate = null;
  completeGate = null;
  return response.json({ ok: true });
});
app.post('/__qa/fail-next-pomodoro-start', (_request, response) => {
  failNextStart = true;
  return response.json({ ok: true });
});
app.post('/__qa/hold-next-pomodoro-start', (_request, response) => {
  startGate = new Promise<void>((resolve) => { releaseStartGate = resolve; });
  return response.json({ ok: true });
});
app.post('/__qa/release-pomodoro-start', (_request, response) => {
  releaseStartGate?.();
  releaseStartGate = null;
  return response.json({ ok: true });
});
app.post('/__qa/fail-next-pomodoro-cancel', (_request, response) => {
  failNextCancel = true;
  return response.json({ ok: true });
});
app.post('/__qa/hold-next-pomodoro-cancel', (_request, response) => {
  cancelGate = new Promise<void>((resolve) => { releaseCancelGate = resolve; });
  return response.json({ ok: true });
});
app.post('/__qa/release-pomodoro-cancel', (_request, response) => {
  releaseCancelGate?.();
  releaseCancelGate = null;
  return response.json({ ok: true });
});
app.post('/__qa/fail-next-pomodoro-complete-before-write', (_request, response) => {
  failNextCompleteBeforeWrite = true;
  return response.json({ ok: true });
});
app.post('/__qa/lose-next-pomodoro-complete-response', (_request, response) => {
  loseNextCompleteResponseAfterWrite = true;
  return response.json({ ok: true });
});
app.post('/__qa/hold-next-pomodoro-complete', (_request, response) => {
  completeGate = new Promise<void>((resolve) => { releaseCompleteGate = resolve; });
  return response.json({ ok: true });
});
app.post('/__qa/release-pomodoro-complete', (_request, response) => {
  releaseCompleteGate?.();
  releaseCompleteGate = null;
  return response.json({ ok: true });
});
app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_request, response) => response.json({}));
app.get('/api/pomodoro/stats', (_request, response) => response.json({ today: 0, week: 0, totalMinutes: 0 }));
app.get('/api/pomodoro/ranking', (_request, response) => response.json({ data: [] }));
app.post('/api/pomodoro/start', async (_request, response) => {
  startAttempts += 1;
  const gate = startGate;
  startGate = null;
  if (gate) await gate;
  if (failNextStart) {
    failNextStart = false;
    return response.status(503).json({ message: '隔离验收模拟番茄钟启动失败，请重试' });
  }
  const sessionId = nextSessionId++;
  return response.json({ sessionId, message: '专注已开始' });
});
app.post('/api/pomodoro/:id/complete', async (request, response) => {
  completeAttempts += 1;
  const gate = completeGate;
  completeGate = null;
  if (gate) await gate;
  const sessionId = Number(request.params.id);
  if (failNextCompleteBeforeWrite) {
    failNextCompleteBeforeWrite = false;
    return response.status(503).json({ message: '隔离验收模拟完成记录写入前失败，请重试' });
  }
  if (completedSessionIds.includes(sessionId)) {
    return response.status(400).json({ message: '该番茄钟已完成' });
  }
  completedSessionIds.push(sessionId);
  if (loseNextCompleteResponseAfterWrite) {
    loseNextCompleteResponseAfterWrite = false;
    return response.status(503).json({ message: '隔离验收模拟完成记录已写入但响应丢失，请重试' });
  }
  return response.json({ message: '专注已完成' });
});
app.post('/api/pomodoro/:id/cancel', async (_request, response) => {
  cancelAttempts += 1;
  const gate = cancelGate;
  cancelGate = null;
  if (gate) await gate;
  if (failNextCancel) {
    failNextCancel = false;
    return response.status(503).json({ message: '隔离验收模拟番茄钟重置失败，请重试' });
  }
  return response.json({ message: '专注已取消' });
});
app.use('/api', (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') unexpectedWrites.push(`${request.method} ${request.path}`);
  return response.status(404).json({ message: '未配置的隔离验收 API' });
});

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.get('/__qa/compact', async (_request, response, next) => {
  try {
    const html = await vite.transformIndexHtml('/__qa/compact', `<!doctype html>
      <html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>番茄钟隔离验收</title></head>
      <body><div id="root"></div><script>
        localStorage.setItem('xmt_user', ${JSON.stringify(JSON.stringify(user))});
        localStorage.setItem('xmt_token', 'pomodoro-notification-fixture');
        localStorage.setItem('xmt_theme', 'light');
      </script><script type="module" src="/tests/browser/pomodoro-compact-entry.tsx"></script></body></html>`);
    response.type('html').send(html);
  } catch (error) {
    next(error);
  }
});
app.use(vite.middlewares);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_POMODORO_NOTIFICATION_QA_SERVE === '1') {
  console.log(`Isolated pomodoro notification QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const errors: string[] = [];

  const runCompletion = async (visibility: 'visible' | 'hidden') => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.clock.install({ time: new Date('2026-10-09T10:00:00.000Z') });
    await page.goto(`${base}/__qa`);
    await page.locator('h1').getByText('番茄钟', { exact: true }).waitFor();
    assert.match(await page.url(), /\/pomodoro$/, `${visibility} notification flow reaches the pomodoro page`);
    await page.evaluate((targetVisibility) => {
      new Function('targetVisibility', `
        window.__xmtDesktopNotifications = [];
        function FixtureNotification(title, options) {
          window.__xmtDesktopNotifications.push({ title, body: options && options.body || '' });
        }
        FixtureNotification.permission = 'granted';
        FixtureNotification.prototype.close = function () {};
        Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: FixtureNotification });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return targetVisibility; } });
      `)(targetVisibility);
    }, visibility);
    const notificationContext = await page.evaluate(() => ({
      visibility: document.visibilityState,
      secure: window.isSecureContext,
      supported: 'Notification' in window,
      permission: Notification.permission,
      preference: localStorage.getItem('xmt_desktop_notify_enabled'),
    }));
    assert.deepEqual(notificationContext, { visibility, secure: true, supported: true, permission: 'granted', preference: null }, `${visibility} fixture has the expected desktop notification context`);

    const start = page.waitForResponse((response) => response.url().endsWith('/api/pomodoro/start') && response.request().method() === 'POST' && response.status() === 200);
    await page.getByRole('button', { name: '开始番茄钟', exact: true }).click();
    const startResponse = await start;
    const { sessionId } = await startResponse.json() as { sessionId: number };
    await page.getByText('25:00', { exact: true }).waitFor();
    await page.clock.runFor('24:59');
    await page.getByText('00:01', { exact: true }).waitFor();
    const complete = page.waitForResponse((response) => response.url().endsWith(`/api/pomodoro/${sessionId}/complete`) && response.request().method() === 'POST' && response.status() === 200);
    await page.clock.runFor(1000);
    await complete;

    const inAppMessage = '25分钟专注时间已完成，休息一下吧！';
    if (visibility === 'visible') {
      await page.getByText(inAppMessage, { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => (window as PomodoroNotificationTestWindow).__xmtDesktopNotifications.length), 0, 'visible tab uses only the in-app notification');
      await page.screenshot({ path: '/tmp/xmt-pomodoro-visible-toast.png' });
    } else {
      await page.getByText(inAppMessage, { exact: true }).waitFor({ state: 'hidden' });
      const desktopNotifications = await page.evaluate(() => (window as PomodoroNotificationTestWindow).__xmtDesktopNotifications);
      assert.deepEqual(desktopNotifications, [{ title: '🍅 番茄钟完成！', body: inAppMessage }], 'background tab uses only one system notification');
      await page.screenshot({ path: '/tmp/xmt-pomodoro-background-no-toast.png' });
    }
    await page.close();
  };

  await runCompletion('visible');
  await runCompletion('hidden');
  assert.deepEqual(completedSessionIds, [1, 2], 'each completed timer is persisted once');
  assert.deepEqual(unexpectedWrites, [], 'the isolated notification test sends no unrelated API writes');
  assert.deepEqual(errors, [], `pomodoro completion has no browser errors: ${errors.join(' | ')}`);

  const openMutationTimer = async (variant: 'full' | 'compact') => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    await page.clock.install({ time: new Date('2026-10-09T10:00:00.000Z') });
    const pageErrors: string[] = [];
    const expected503ConsoleErrors: string[] = [];
    const expected400ConsoleErrors: string[] = [];
    const observedPomodoroPosts = { start: 0, complete: 0, cancel: 0 };
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (request.method() !== 'POST') return;
      const path = new URL(request.url()).pathname;
      if (path === '/api/pomodoro/start') observedPomodoroPosts.start += 1;
      if (/^\/api\/pomodoro\/\d+\/complete$/.test(path)) observedPomodoroPosts.complete += 1;
      if (/^\/api\/pomodoro\/\d+\/cancel$/.test(path)) observedPomodoroPosts.cancel += 1;
    });
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (message.text().includes('server responded with a status of 503')) expected503ConsoleErrors.push(message.text());
      else if (message.text().includes('server responded with a status of 400')) expected400ConsoleErrors.push(message.text());
      else pageErrors.push(message.text());
    });
    await page.addInitScript(() => {
      if (typeof Notification !== 'undefined') {
        Object.defineProperty(Notification, 'permission', { configurable: true, value: 'granted' });
      }
    });
    await page.goto(variant === 'compact' ? `${base}/__qa/compact` : `${base}/__qa`);
    try {
      await page.getByTestId('pomodoro-start-button').waitFor({ state: 'visible' });
    } catch (error) {
      console.error('Pomodoro mutation fixture failed to mount', { variant, url: page.url(), pageErrors, body: await page.locator('body').innerText().catch(() => '') });
      throw error;
    }
    await page.request.post(`${base}/__qa/reset-pomodoro-mutations`);
    return { page, pageErrors, expected503ConsoleErrors, expected400ConsoleErrors, observedPomodoroPosts };
  };
  const readMutationState = async (page: import('playwright').Page): Promise<PomodoroMutationFixtureState> => (
    page.request.get(`${base}/__qa/pomodoro-mutation-state`).then((response) => response.json() as Promise<PomodoroMutationFixtureState>)
  );
  const waitForMutationState = async (
    page: import('playwright').Page,
    predicate: (state: PomodoroMutationFixtureState) => boolean,
    description: string,
  ) => {
    const deadline = Date.now() + 5000;
    let state = await readMutationState(page);
    while (!predicate(state) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      state = await readMutationState(page);
    }
    assert.ok(predicate(state), `fixture observed ${description} within 5 seconds; latest state: ${JSON.stringify(state)}`);
    return state;
  };
  const readCompletionState = async (page: import('playwright').Page): Promise<PomodoroCompletionFixtureState> => (
    page.request.get(`${base}/__qa/pomodoro-completion-state`).then((response) => response.json() as Promise<PomodoroCompletionFixtureState>)
  );
  const waitForCompletionState = async (
    page: import('playwright').Page,
    predicate: (state: PomodoroCompletionFixtureState) => boolean,
    description: string,
  ) => {
    const deadline = Date.now() + 5000;
    let state = await readCompletionState(page);
    while (!predicate(state) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      state = await readCompletionState(page);
    }
    assert.ok(predicate(state), `fixture observed ${description} within 5 seconds; latest state: ${JSON.stringify(state)}`);
    return state;
  };
  const waitForPomodoroResponse = (page: import('playwright').Page, path: string, status: number) => page.waitForResponse((response) => (
    response.url().endsWith(path) && response.request().method() === 'POST' && response.status() === status
  ));

  for (const variant of ['full', 'compact'] as const) {
    const { page, pageErrors, observedPomodoroPosts } = await openMutationTimer(variant);
    await page.request.post(`${base}/__qa/hold-next-pomodoro-start`);
    const delayedStart = waitForPomodoroResponse(page, '/api/pomodoro/start', 200);
    const startButton = page.getByTestId('pomodoro-start-button');
    const resetButton = page.getByTestId('pomodoro-reset-button');
    await startButton.click();
    await page.getByRole('status').filter({ hasText: '正在开始番茄钟…' }).waitFor();
    assert.equal(await startButton.isDisabled(), true, `${variant} start control locks while the start write is pending`);
    assert.equal(await resetButton.isDisabled(), true, `${variant} reset control is blocked while a start write is pending`);
    await waitForMutationState(page, (state) => state.startAttempts === 1, `${variant} initial start POST`);
    await startButton.dispatchEvent('click');
    await resetButton.dispatchEvent('click');
    const pendingStartState = await readMutationState(page);
    assert.equal(pendingStartState.startAttempts, 1, `${variant} rapid repeated start produces one POST`);
    assert.equal(pendingStartState.cancelAttempts, 0, `${variant} reset cannot race a pending start`);
    assert.equal(observedPomodoroPosts.start, 1, `${variant} duplicate clicks issue no second start request from the browser`);
    assert.equal(observedPomodoroPosts.cancel, 0, `${variant} reset during start issues no cancel request from the browser`);
    await page.request.post(`${base}/__qa/release-pomodoro-start`);
    await delayedStart;
    await page.getByRole('button', { name: '暂停番茄钟', exact: true }).waitFor();
    await page.getByRole('status').filter({ hasText: '正在开始番茄钟…' }).waitFor({ state: 'hidden' });
    assert.deepEqual(pageErrors, [], `${variant} delayed start has no browser errors`);
    await page.close();

    const failedStartPage = await openMutationTimer(variant);
    await failedStartPage.page.request.post(`${base}/__qa/fail-next-pomodoro-start`);
    const failedStart = waitForPomodoroResponse(failedStartPage.page, '/api/pomodoro/start', 503);
    await failedStartPage.page.getByTestId('pomodoro-start-button').click();
    await failedStart;
    await failedStartPage.page.getByRole('alert').filter({ hasText: '启动结果尚未确认；再次点击“开始”会恢复服务端当前会话。' }).waitFor();
    assert.equal(await failedStartPage.page.getByTestId('pomodoro-start-button').isEnabled(), true, `${variant} failed start is available for explicit retry`);
    assert.deepEqual(await readMutationState(failedStartPage.page), { startAttempts: 1, cancelAttempts: 0 }, `${variant} one failed click sends one start POST`);
    const retriedStart = waitForPomodoroResponse(failedStartPage.page, '/api/pomodoro/start', 200);
    await failedStartPage.page.getByTestId('pomodoro-start-button').click();
    await retriedStart;
    await failedStartPage.page.getByRole('button', { name: '暂停番茄钟', exact: true }).waitFor();
    assert.deepEqual(await readMutationState(failedStartPage.page), { startAttempts: 2, cancelAttempts: 0 }, `${variant} explicit retry sends exactly one additional start POST`);
    await failedStartPage.page.getByRole('alert').waitFor({ state: 'hidden' });
    assert.deepEqual(failedStartPage.pageErrors, [], `${variant} failed start and retry have no browser errors`);
    assert.equal(failedStartPage.expected503ConsoleErrors.length, 1, `${variant} start failure is the one expected 503 console message`);
    await failedStartPage.page.close();

    const failedResetPage = await openMutationTimer(variant);
    const resetStart = waitForPomodoroResponse(failedResetPage.page, '/api/pomodoro/start', 200);
    await failedResetPage.page.getByTestId('pomodoro-start-button').click();
    const resetStartResponse = await resetStart;
    const { sessionId: boundarySessionId } = await resetStartResponse.json() as { sessionId: number };
    await failedResetPage.page.getByRole('button', { name: '暂停番茄钟', exact: true }).waitFor();

    // Hold a reset at the completion boundary: cancelling must pause the local
    // interval so it cannot POST /complete while /cancel is still in flight.
    await failedResetPage.page.clock.runFor('24:59');
    await failedResetPage.page.getByText('00:01', { exact: true }).waitFor();
    await failedResetPage.page.request.post(`${base}/__qa/hold-next-pomodoro-cancel`);
    const boundaryReset = waitForPomodoroResponse(failedResetPage.page, `/api/pomodoro/${boundarySessionId}/cancel`, 200);
    await failedResetPage.page.getByTestId('pomodoro-reset-button').click();
    await failedResetPage.page.getByRole('status').filter({ hasText: '正在重置番茄钟…' }).waitFor();
    await failedResetPage.page.clock.runFor(5000);
    await failedResetPage.page.getByText('00:01', { exact: true }).waitFor();
    assert.equal(completedSessionIds.includes(boundarySessionId), false, `${variant} pending reset prevents completion POST at the timer boundary`);
    await failedResetPage.page.request.post(`${base}/__qa/release-pomodoro-cancel`);
    await boundaryReset;
    await failedResetPage.page.getByText('25:00', { exact: true }).waitFor();
    assert.equal(completedSessionIds.includes(boundarySessionId), false, `${variant} successful reset cancels the boundary session without completing it`);

    // A subsequent reset failure preserves the active timer and remains
    // explicitly retryable; this is a distinct session from the boundary case.
    const retryStart = waitForPomodoroResponse(failedResetPage.page, '/api/pomodoro/start', 200);
    await failedResetPage.page.getByTestId('pomodoro-start-button').click();
    const retryStartResponse = await retryStart;
    const { sessionId } = await retryStartResponse.json() as { sessionId: number };
    await failedResetPage.page.getByRole('button', { name: '暂停番茄钟', exact: true }).waitFor();
    await failedResetPage.page.request.post(`${base}/__qa/fail-next-pomodoro-cancel`);
    await failedResetPage.page.request.post(`${base}/__qa/hold-next-pomodoro-cancel`);
    const failedReset = waitForPomodoroResponse(failedResetPage.page, `/api/pomodoro/${sessionId}/cancel`, 503);
    await failedResetPage.page.getByTestId('pomodoro-reset-button').click();
    await failedResetPage.page.getByRole('status').filter({ hasText: '正在重置番茄钟…' }).waitFor();
    await waitForMutationState(failedResetPage.page, (state) => state.cancelAttempts === 2, `${variant} failing reset POST`);
    const timeWhileFailedResetIsPending = await failedResetPage.page.getByText(/^\d{2}:\d{2}$/).innerText();
    await failedResetPage.page.request.post(`${base}/__qa/release-pomodoro-cancel`);
    await failedReset;
    await failedResetPage.page.getByRole('alert').filter({ hasText: '重置结果尚未确认；点击“重置”可安全重试。' }).waitFor();
    assert.equal(await failedResetPage.page.getByRole('button', { name: '暂停番茄钟', exact: true }).isEnabled(), true, `${variant} failed reset preserves the active timer`);
    assert.equal(await failedResetPage.page.getByText(/^\d{2}:\d{2}$/).innerText(), timeWhileFailedResetIsPending, `${variant} failed reset restores the exact remaining time captured while reset was paused`);
    assert.deepEqual(await readMutationState(failedResetPage.page), { startAttempts: 2, cancelAttempts: 2 }, `${variant} one failed reset click sends one cancel POST`);

    await failedResetPage.page.request.post(`${base}/__qa/hold-next-pomodoro-cancel`);
    const retriedReset = waitForPomodoroResponse(failedResetPage.page, `/api/pomodoro/${sessionId}/cancel`, 200);
    await failedResetPage.page.getByTestId('pomodoro-reset-button').click();
    await failedResetPage.page.getByRole('status').filter({ hasText: '正在重置番茄钟…' }).waitFor();
    assert.equal(await failedResetPage.page.getByTestId('pomodoro-start-button').isDisabled(), true, `${variant} start control locks while reset is pending`);
    assert.equal(await failedResetPage.page.getByTestId('pomodoro-reset-button').isDisabled(), true, `${variant} reset control locks while reset is pending`);
    await failedResetPage.page.request.post(`${base}/__qa/release-pomodoro-cancel`);
    await retriedReset;
    await failedResetPage.page.getByRole('button', { name: '开始番茄钟', exact: true }).waitFor();
    await failedResetPage.page.getByRole('alert').waitFor({ state: 'hidden' });
    assert.deepEqual(await readMutationState(failedResetPage.page), { startAttempts: 2, cancelAttempts: 3 }, `${variant} explicit reset retry sends exactly one additional cancel POST`);
    assert.deepEqual(failedResetPage.pageErrors, [], `${variant} failed reset and retry have no browser errors`);
    assert.equal(failedResetPage.expected503ConsoleErrors.length, 1, `${variant} reset failure is the one expected 503 console message`);
    await failedResetPage.page.close();

    const lostCompletionPage = await openMutationTimer(variant);
    const lostStart = waitForPomodoroResponse(lostCompletionPage.page, '/api/pomodoro/start', 200);
    await lostCompletionPage.page.getByTestId('pomodoro-start-button').click();
    const lostStartResponse = await lostStart;
    const { sessionId: lostSessionId } = await lostStartResponse.json() as { sessionId: number };
    await lostCompletionPage.page.getByRole('button', { name: '暂停番茄钟', exact: true }).waitFor();
    await lostCompletionPage.page.clock.runFor('24:59');
    await lostCompletionPage.page.getByText('00:01', { exact: true }).waitFor();
    await lostCompletionPage.page.request.post(`${base}/__qa/hold-next-pomodoro-complete`);
    await lostCompletionPage.page.request.post(`${base}/__qa/lose-next-pomodoro-complete-response`);
    const lostCompletion = waitForPomodoroResponse(lostCompletionPage.page, `/api/pomodoro/${lostSessionId}/complete`, 503);
    await lostCompletionPage.page.clock.runFor(1000);
    await lostCompletionPage.page.getByText('00:00', { exact: true }).waitFor();
    await lostCompletionPage.page.getByRole('status').filter({ hasText: '正在保存完成记录…' }).waitFor();
    await waitForCompletionState(lostCompletionPage.page, (state) => state.completeAttempts === 1, `${variant} first completion request`);
    const completionStartButton = lostCompletionPage.page.getByTestId('pomodoro-start-button');
    const completionResetButton = lostCompletionPage.page.getByTestId('pomodoro-reset-button');
    assert.equal(await completionStartButton.isDisabled(), true, `${variant} start is locked while completion is pending`);
    assert.equal(await completionResetButton.isDisabled(), true, `${variant} reset is locked at the 00:00 completion boundary`);
    await completionResetButton.dispatchEvent('click');
    await completionStartButton.dispatchEvent('click');
    assert.equal((await readMutationState(lostCompletionPage.page)).cancelAttempts, 0, `${variant} reset at the completion boundary sends no cancel`);
    assert.equal(lostCompletionPage.observedPomodoroPosts.cancel, 0, `${variant} boundary guard prevents a cancel request from the browser`);
    assert.equal((await readCompletionState(lostCompletionPage.page)).completeAttempts, 1, `${variant} boundary clicks do not duplicate completion`);
    await lostCompletionPage.page.request.post(`${base}/__qa/release-pomodoro-complete`);
    await lostCompletion;
    await lostCompletionPage.page.getByRole('alert').filter({ hasText: '完成结果尚未确认' }).waitFor();
    const completionRetryButton = lostCompletionPage.page.getByTestId('pomodoro-completion-retry');
    await completionRetryButton.waitFor({ state: 'visible' });
    const completionRetryBounds = await completionRetryButton.boundingBox();
    assert.ok(completionRetryBounds && completionRetryBounds.width >= 40 && completionRetryBounds.height >= 40, `${variant} completion retry target is at least 40x40px: ${JSON.stringify(completionRetryBounds)}`);
    assert.equal(await completionStartButton.isDisabled(), true, `${variant} start remains locked while completion outcome is unconfirmed`);
    assert.equal(await completionResetButton.isDisabled(), true, `${variant} reset remains locked while completion outcome is unconfirmed`);
    const committedState = await readCompletionState(lostCompletionPage.page);
    assert.equal(committedState.completedSessionIds.filter((id) => id === lostSessionId).length, 1, `${variant} fixture committed the first write before dropping its response`);
    const alreadyCompleted = waitForPomodoroResponse(lostCompletionPage.page, `/api/pomodoro/${lostSessionId}/complete`, 400);
    await completionRetryButton.click();
    const alreadyCompletedResponse = await alreadyCompleted;
    assert.deepEqual(await alreadyCompletedResponse.json(), { message: '该番茄钟已完成' }, `${variant} retry receives the exact existing-completion response`);
    await lostCompletionPage.page.getByTestId('pomodoro-completion-retry').waitFor({ state: 'hidden' });
    await lostCompletionPage.page.getByRole('alert').waitFor({ state: 'hidden' });
    assert.equal(await lostCompletionPage.page.getByTestId('pomodoro-start-button').isEnabled(), true, `${variant} start unlocks only after completion is confirmed`);
    const recoveredState = await readCompletionState(lostCompletionPage.page);
    assert.equal(recoveredState.completeAttempts, 2, `${variant} explicit retry sends exactly one additional completion POST`);
    assert.equal(recoveredState.completedSessionIds.filter((id) => id === lostSessionId).length, 1, `${variant} idempotent retry leaves the completed counter at exactly one`);
    assert.equal(lostCompletionPage.observedPomodoroPosts.complete, 2, `${variant} only the initial completion and explicit retry POST are sent`);
    assert.equal((await readMutationState(lostCompletionPage.page)).cancelAttempts, 0, `${variant} unconfirmed completion never posts cancel`);
    assert.equal(lostCompletionPage.expected503ConsoleErrors.length, 1, `${variant} lost completion response is the expected 503`);
    assert.equal(lostCompletionPage.expected400ConsoleErrors.length, 1, `${variant} retry returns the one expected idempotent 400`);
    assert.deepEqual(lostCompletionPage.pageErrors, [], `${variant} idempotent completion recovery has no unexpected browser errors`);
    await lostCompletionPage.page.close();

    const retryableCompletionPage = await openMutationTimer(variant);
    const retryableStart = waitForPomodoroResponse(retryableCompletionPage.page, '/api/pomodoro/start', 200);
    await retryableCompletionPage.page.getByTestId('pomodoro-start-button').click();
    const retryableStartResponse = await retryableStart;
    const { sessionId: retryableSessionId } = await retryableStartResponse.json() as { sessionId: number };
    await retryableCompletionPage.page.getByRole('button', { name: '暂停番茄钟', exact: true }).waitFor();
    await retryableCompletionPage.page.clock.runFor('24:59');
    await retryableCompletionPage.page.getByText('00:01', { exact: true }).waitFor();
    await retryableCompletionPage.page.request.post(`${base}/__qa/fail-next-pomodoro-complete-before-write`);
    const notWrittenCompletion = waitForPomodoroResponse(retryableCompletionPage.page, `/api/pomodoro/${retryableSessionId}/complete`, 503);
    await retryableCompletionPage.page.clock.runFor(1000);
    await notWrittenCompletion;
    await retryableCompletionPage.page.getByRole('alert').filter({ hasText: '完成结果尚未确认' }).waitFor();
    assert.equal((await readCompletionState(retryableCompletionPage.page)).completedSessionIds.includes(retryableSessionId), false, `${variant} simulated pre-write failure has no completed record`);
    const completionWrittenOnRetry = waitForPomodoroResponse(retryableCompletionPage.page, `/api/pomodoro/${retryableSessionId}/complete`, 200);
    await retryableCompletionPage.page.getByTestId('pomodoro-completion-retry').click();
    await completionWrittenOnRetry;
    await retryableCompletionPage.page.getByRole('alert').waitFor({ state: 'hidden' });
    const writtenState = await readCompletionState(retryableCompletionPage.page);
    assert.equal(writtenState.completeAttempts, 2, `${variant} pre-write failure requires exactly one explicit retry`);
    assert.equal(writtenState.completedSessionIds.filter((id) => id === retryableSessionId).length, 1, `${variant} retry after pre-write failure writes one completion`);
    assert.equal(retryableCompletionPage.observedPomodoroPosts.complete, 2, `${variant} only the failed completion and explicit retry are sent`);
    assert.equal(retryableCompletionPage.expected503ConsoleErrors.length, 1, `${variant} pre-write failure is the expected 503`);
    assert.deepEqual(retryableCompletionPage.pageErrors, [], `${variant} pre-write completion retry has no unexpected browser errors`);
    await retryableCompletionPage.page.close();
  }

  console.log('Pomodoro notification routing passed: visible tab shows one in-app toast; background tab uses one enabled system notification.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
