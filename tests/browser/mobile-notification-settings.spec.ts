import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

process.env.VITE_APP_PLATFORM = 'android';

const preferences = [{ id: 1, channel: 'web', event_type: 'review', enabled: false }];
let persistedPreferences = structuredClone(preferences);
let failNextSave: string | null = null;
let saveDelayMs = 0;
let saveRequests = 0;

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/browser/mobile-notification-settings-harness.tsx"></script></body></html>'));
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.post('/__qa/options', (req, res) => {
  if (Number.isFinite(req.body?.saveDelayMs)) saveDelayMs = Math.max(0, Number(req.body.saveDelayMs));
  if (typeof req.body?.failNextSave === 'string') failNextSave = req.body.failNextSave || null;
  res.json({ ready: true });
});
app.get('/api/notifications/preferences', (_req, res) => res.json(persistedPreferences));
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
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
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
  await page.getByText('通知偏好暂时无法保存，请重试。', { exact: true }).waitFor();
  assert.equal(persistedPreferences[0]?.enabled, true, 'a failed write does not mutate the server fixture');

  saveDelayMs = 0;
  await save.click();
  await page.getByText('通知偏好已保存。', { exact: true }).waitFor();
  assert.equal(persistedPreferences[0]?.enabled, false, 'an explicit retry persists the retained selection');
  assert.equal(saveRequests, 3, 'only the single initial save, failed attempt, and explicit retry reach the server');
  assert.equal(expectedHttpErrors.length, 1, 'the only expected browser network error is the injected 503');
  assert.deepEqual(errors, [], 'mobile notification settings have no browser runtime errors');
  await context.close();
  console.log('Mobile notification settings browser test passed: 390px, duplicate save protection, disabled in-flight toggles, 503 retention and explicit retry.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
