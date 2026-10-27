import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

process.env.VITE_APP_PLATFORM = 'android';

const preferences = [{ id: 1, channel: 'web', event_type: 'review', enabled: false }];
let persistedPreferences = structuredClone(preferences);
let failNextSave: string | null = null;
let failNextRead: string | null = null;
let saveDelayMs = 0;
let saveRequests = 0;
let preferenceReadRequests = 0;
let dropNextSaveResponseAfterCommit = false;
let saveResponseLossInjected = false;

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/browser/mobile-notification-settings-harness.tsx"></script></body></html>'));
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.post('/__qa/options', (req, res) => {
  if (Number.isFinite(req.body?.saveDelayMs)) saveDelayMs = Math.max(0, Number(req.body.saveDelayMs));
  if (typeof req.body?.failNextSave === 'string') failNextSave = req.body.failNextSave || null;
  res.json({ ready: true });
});
app.get('/api/notifications/preferences', (_req, res) => {
  preferenceReadRequests += 1;
  if (failNextRead) {
    const message = failNextRead;
    failNextRead = null;
    res.status(503).json({ message });
    return;
  }
  res.json(persistedPreferences);
});
app.get('/api/notifications/channels', (_req, res) => res.json([{ id: 'web', name: '站内消息', description: 'XMT 站内提醒' }]));
app.get('/api/notifications/events', (_req, res) => res.json([{ id: 'review', name: '审核结果', description: '选题审核完成时提醒' }]));
app.put('/api/notifications/preferences', async (req, res) => {
  saveRequests += 1;
  if (saveDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
  if (failNextSave) {
    const message = failNextSave;
    failNextSave = null;
    res.status(503).json({ message });
    return;
  }
  persistedPreferences = req.body?.preferences ?? persistedPreferences;
  res.json({ message: '通知偏好已更新' });
});

const server = http.createServer(app);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_MOBILE_NOTIFICATION_QA_SERVE === '1') {
  console.log(`Isolated mobile notification settings QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  const expectedSaveRequestFailures: string[] = [];
  const expectedSaveConsoleErrors: string[] = [];
  await page.route('**/api/notifications/preferences', async (route) => {
    if (!dropNextSaveResponseAfterCommit || route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    dropNextSaveResponseAfterCommit = false;
    await route.fetch();
    saveResponseLossInjected = true;
    await route.abort('failed');
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else if (message.text().includes('net::ERR_FAILED') && saveResponseLossInjected) expectedSaveConsoleErrors.push(message.text());
    else errors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/api/notifications/preferences')) {
      expectedSaveRequestFailures.push(request.failure()?.errorText || 'request failed');
    }
  });

  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '消息通知偏好' }).waitFor();
  const back = page.getByRole('button', { name: '返回个人设置' });
  const toggle = page.getByRole('button', { name: /审核结果/ });
  const save = page.getByRole('button', { name: '保存通知偏好', exact: true });
  for (const [label, locator] of [['back', back], ['event toggle', toggle], ['save', save]] as const) {
    const bounds = await locator.boundingBox();
    assert.ok(bounds && bounds.width >= 40 && bounds.height >= 40, `mobile notification ${label} target is at least 40×40px`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, '390px notification preferences have no horizontal overflow');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');

  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'toggling updates the accessible selected state');
  saveDelayMs = 250;
  const firstSaveResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/notifications/preferences'));
  await save.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.getByText('保存中…', { exact: false }).waitFor();
  assert.equal(await toggle.isDisabled(), true, 'preference controls are disabled while a save is in flight');
  await firstSaveResponse;
  assert.equal(await saveRequests, 1, 'synchronous repeated clicks issue one save request');
  await page.getByText('通知偏好已保存。', { exact: true }).waitFor();
  assert.equal(persistedPreferences[0]?.enabled, true, 'the server-confirmed selection is persisted');

  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'editing after a successful save updates the local selection');
  assert.equal(await page.getByText('通知偏好已保存。', { exact: true }).count(), 0, 'editing clears the stale success notice');
  assert.equal(saveRequests, 1, 'editing preferences does not issue a PUT');

  saveDelayMs = 100;
  failNextSave = '通知偏好暂时无法保存，请重试。';
  await save.click();
  await page.getByText('服务器当前通知偏好与本页设置不同。为避免覆盖其他设备的更新，系统没有自动重复保存。', { exact: true }).waitFor();
  assert.equal(persistedPreferences[0]?.enabled, true, 'a failed write does not mutate the server fixture');
  assert.equal(saveRequests, 2, 'an ambiguous 503 is verified without an automatic retry');

  saveDelayMs = 0;
  await page.getByRole('button', { name: '确认覆盖服务器设置', exact: true }).click();
  await page.getByText('通知偏好已保存。', { exact: true }).waitFor();
  assert.equal(persistedPreferences[0]?.enabled, false, 'the explicit overwrite action persists the retained selection');
  assert.equal(saveRequests, 3, 'only the single initial save, failed attempt, and explicit retry reach the server');
  await toggle.click();
  const readsBeforeLostResponse = preferenceReadRequests;
  dropNextSaveResponseAfterCommit = true;
  await save.click();
  await page.getByText('已核实通知偏好已保存。', { exact: true }).waitFor();
  assert.equal(persistedPreferences[0]?.enabled, true, 'read-back confirms a committed save whose response was lost');
  assert.equal(saveRequests, 4, 'response-loss recovery does not issue a second PUT');
  assert.equal(preferenceReadRequests, readsBeforeLostResponse + 1, 'response-loss recovery performs one read-only GET');

  await toggle.click();
  dropNextSaveResponseAfterCommit = true;
  failNextRead = '通知偏好核实暂时不可用。';
  await save.click();
  await page.getByRole('button', { name: '只读重新核实', exact: true }).waitFor();
  assert.equal(await toggle.isDisabled(), true, 'an unknown outcome locks preference edits');
  assert.equal(await save.isDisabled(), true, 'an unknown outcome locks repeated saves');
  assert.equal(saveRequests, 5, 'a failed verification does not resend the PUT');
  const warnsOnUnknownUnload = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(warnsOnUnknownUnload, true, 'an unknown save result installs a browser unload warning');
  await back.click();
  const recoveryLeaveDialog = page.getByRole('dialog');
  await recoveryLeaveDialog.getByRole('heading', { name: '通知偏好结果尚未核实' }).waitFor();
  assert.equal(saveRequests, 5, 'leaving with an unknown result does not retry the save');
  await recoveryLeaveDialog.getByRole('button', { name: '继续编辑' }).click();
  await page.getByRole('button', { name: '只读重新核实', exact: true }).click();
  await page.getByText('已核实通知偏好已保存。', { exact: true }).waitFor();
  assert.equal(persistedPreferences[0]?.enabled, false, 'a read-only retry resolves the unknown outcome');
  assert.equal(saveRequests, 5, 'read-only recovery never sends another PUT');

  await toggle.click();
  const warnsOnDirtyUnload = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(warnsOnDirtyUnload, true, 'an unsaved preference draft installs a browser unload warning');
  await back.click();
  const leaveDialog = page.getByRole('dialog');
  await leaveDialog.getByRole('heading', { name: '通知偏好尚未保存' }).waitFor();
  assert.equal(saveRequests, 5, 'attempting to leave a dirty page does not save automatically');
  await leaveDialog.getByRole('button', { name: '继续编辑' }).click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'canceling navigation keeps the unsaved preference selection');

  saveDelayMs = 200;
  const saveDuringLeave = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/notifications/preferences'));
  await save.click();
  await page.getByText('保存中…', { exact: false }).waitFor();
  await back.click();
  await page.getByText('通知偏好仍在保存或核实，请等待处理完成后再离开。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '消息通知偏好' }).count(), 1, 'navigation is blocked while a save is in flight');
  assert.equal(await page.getByRole('dialog').count(), 0, 'an in-flight save cannot be discarded from the navigation prompt');
  await saveDuringLeave;
  saveDelayMs = 0;
  await page.getByText('通知偏好已保存。', { exact: true }).waitFor();
  assert.equal(saveRequests, 6, 'the in-flight save completes exactly once');

  await toggle.click();
  await back.click();
  const discardDialog = page.getByRole('dialog');
  await discardDialog.getByRole('heading', { name: '通知偏好尚未保存' }).waitFor();
  await discardDialog.getByRole('button', { name: '离开并放弃本页更改' }).click();
  await page.getByRole('heading', { name: '个人设置夹具' }).waitFor();
  assert.equal(saveRequests, 6, 'explicitly discarding local preference edits does not send a PUT');
  await page.getByRole('button', { name: '返回通知偏好夹具' }).click();
  await page.getByRole('heading', { name: '消息通知偏好' }).waitFor();
  await page.getByRole('button', { name: /审核结果/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /审核结果/ }).getAttribute('aria-pressed'), 'true', 'reopening reloads the server-confirmed preference instead of the discarded local draft');
  assert.equal(expectedSaveRequestFailures.length, 2, 'both injected response losses are observed');
  assert.equal(expectedSaveConsoleErrors.length, 2, 'both injected response losses are expected browser errors');
  assert.equal(expectedHttpErrors.length, 2, 'the expected HTTP errors are the failed save and failed verification GET');
  assert.deepEqual(errors, [], 'mobile notification settings have no browser runtime errors');
  await context.close();
  console.log('Mobile notification settings browser test passed: 390px, duplicate protection, uncertain-result read-back, explicit conflict resolution and no automatic retries.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
