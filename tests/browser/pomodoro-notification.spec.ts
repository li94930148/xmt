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
const user = { id: 93, username: 'pomodoro-notification-qa', name: '专注通知验收', role: 'admin', enabled: true, force_change_password: false };
let nextSessionId = 1;
const completedSessionIds: number[] = [];
const unexpectedWrites: string[] = [];

const app = express();
app.use(express.json());
app.get('/__qa', (_request, response) => response.type('html').send(`<script>
  localStorage.setItem('xmt_user', ${JSON.stringify(JSON.stringify(user))});
  localStorage.setItem('xmt_token', 'pomodoro-notification-fixture');
  localStorage.setItem('xmt_theme', 'light');
  localStorage.setItem('xmt_last_version_seen', ${JSON.stringify(version)});
  location.replace('/pomodoro');
</script>`));
app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_request, response) => response.json({}));
app.get('/api/pomodoro/stats', (_request, response) => response.json({ today: 0, week: 0, totalMinutes: 0 }));
app.get('/api/pomodoro/ranking', (_request, response) => response.json({ data: [] }));
app.post('/api/pomodoro/start', (_request, response) => {
  const sessionId = nextSessionId++;
  return response.json({ sessionId, message: '专注已开始' });
});
app.post('/api/pomodoro/:id/complete', (request, response) => {
  completedSessionIds.push(Number(request.params.id));
  return response.json({ message: '专注已完成' });
});
app.post('/api/pomodoro/:id/cancel', (_request, response) => response.json({ message: '专注已取消' }));
app.use('/api', (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') unexpectedWrites.push(`${request.method} ${request.path}`);
  return response.status(404).json({ message: '未配置的隔离验收 API' });
});

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
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
    await page.getByRole('button', { name: '开始专注', exact: true }).click();
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
  console.log('Pomodoro notification routing passed: visible tab shows one in-app toast; background tab uses one enabled system notification.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
