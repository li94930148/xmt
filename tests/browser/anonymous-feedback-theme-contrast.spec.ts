import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 97, username: 'anonymous-feedback-theme-qa', role: 'admin', name: '匿名意见箱主题验收', enabled: true, force_change_password: false };
const feedback = {
  id: 971,
  type: 'process',
  content: '让团队协作流程更加清晰。',
  need_reply: false,
  reply_content: null,
  status: 'pending',
  created_at: '2026-10-08 09:00:00',
  updated_at: '2026-10-08 09:00:00',
};

function luminance(rgb: number[]) {
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function iconContrast(locator: import('playwright').Locator) {
  const colors = await locator.locator('svg').evaluate((element) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      backgrounds.push(getComputedStyle(current).backgroundColor);
    }
    return { foreground: getComputedStyle(element).color, backgrounds };
  });
  const foreground = colors.foreground.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
  if (foreground.length !== 3) return 0;
  let background = [255, 255, 255];
  for (const value of colors.backgrounds.reverse()) {
    const channels = value.match(/[\d.]+/g)?.map(Number) || [];
    if (channels.length < 3) continue;
    const alpha = channels[3] ?? 1;
    if (alpha <= 0) continue;
    background = channels.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
  }
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

const app = express();
app.use(express.json());
let feedbackItems = [feedback];
let submissionRequestCount = 0;
let nextSubmissionGate: Promise<void> | null = null;
let releaseSubmissionGate: (() => void) | null = null;
let failNextSubmission = false;
let failedFeedbackReadsRemaining = 0;
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','anonymous-feedback-theme-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/anonymous-feedback');</script>`);
});
app.post('/__qa/hold-next-submission', (_req, res) => {
  nextSubmissionGate = new Promise<void>((resolve) => { releaseSubmissionGate = resolve; });
  res.json({ success: true });
});
app.post('/__qa/release-submission', (_req, res) => {
  releaseSubmissionGate?.();
  releaseSubmissionGate = null;
  res.json({ success: true });
});
app.post('/__qa/fail-next-submission', (_req, res) => {
  failNextSubmission = true;
  res.json({ success: true });
});
app.post('/__qa/fail-feedback-reads', (req, res) => {
  failedFeedbackReadsRemaining = Number(req.body.count) || 0;
  res.json({ success: true });
});
app.get('/__qa/submission-state', (_req, res) => res.json({ requestCount: submissionRequestCount, savedCount: feedbackItems.length }));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/anonymous-feedback', (_req, res) => {
  if (failedFeedbackReadsRemaining > 0) {
    failedFeedbackReadsRemaining -= 1;
    return res.status(503).json({ message: '意见列表暂时不可用' });
  }
  return res.json({ data: feedbackItems });
});
app.post('/api/anonymous-feedback', async (req, res) => {
  submissionRequestCount += 1;
  const gate = nextSubmissionGate;
  nextSubmissionGate = null;
  if (gate) await gate;
  if (failNextSubmission) {
    failNextSubmission = false;
    return res.status(503).json({ message: '意见提交服务暂时不可用' });
  }
  const created = {
    id: 971 + feedbackItems.length,
    type: req.body.type,
    content: req.body.content,
    need_reply: req.body.needReply,
    reply_content: null,
    status: 'pending',
    created_at: '2026-10-16 09:00:00',
    updated_at: '2026-10-16 09:00:00',
  };
  feedbackItems = [...feedbackItems, created];
  return res.status(201).json({ success: true });
});
app.use('/api', (_req, res) => res.json({ data: [] }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?theme=${theme}`);
    await page.getByRole('heading', { name: '匿名意见箱' }).waitFor();
    await page.getByText(feedback.content, { exact: true }).waitFor();
    const icon = page.getByTestId('anonymous-feedback-icon');
    const classes = await icon.getAttribute('class') || '';
    assert.match(classes, /bg-studio-cyan-soft/, `${theme} icon uses the semantic cyan surface`);
    assert.match(classes, /text-studio-cyan-contrast/, `${theme} icon uses the contrast-safe cyan foreground`);
    const ratio = await iconContrast(icon);
    assert.ok(ratio >= 3, `${theme} icon contrast is ${ratio.toFixed(2)}:1; expected at least 3:1`);
    await page.screenshot({ path: `/tmp/xmt-anonymous-feedback-icon-${theme}.png`, fullPage: true });
  }

  const submissionPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const submissionErrors: string[] = [];
  submissionPage.on('pageerror', (error) => submissionErrors.push(error.message));
  submissionPage.on('console', (message) => { if (message.type() === 'error') submissionErrors.push(message.text()); });
  await submissionPage.goto(`${base}/__qa?theme=light`);
  await submissionPage.getByRole('heading', { name: '匿名意见箱' }).waitFor();
  await submissionPage.getByRole('button', { name: '提交意见', exact: true }).first().click();
  const dialog = submissionPage.getByRole('dialog', { name: '匿名意见箱' });
  await dialog.waitFor();
  await dialog.locator('select').selectOption('process');
  await dialog.getByPlaceholder('请输入你的想法...').fill('隔离双提交与回执验收');
  await submissionPage.request.post(`${base}/__qa/hold-next-submission`);
  const submitButton = dialog.getByRole('button', { name: '提交意见', exact: true });
  await submitButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  await dialog.getByRole('button', { name: '提交中...', exact: true }).waitFor();
  assert.equal(await dialog.locator('textarea').isDisabled(), true, 'the form locks during the confirmed write');
  await submissionPage.waitForFunction(async () => (await (await fetch('/__qa/submission-state')).json()).requestCount === 1);
  await submissionPage.request.post(`${base}/__qa/release-submission`);
  await submissionPage.getByText('感谢你的声音，意见已匿名发布', { exact: true }).waitFor();
  assert.equal(await submissionPage.getByPlaceholder('请输入你的想法...').inputValue(), '', 'confirmed submission clears only after success');
  let submissionState = await (await submissionPage.request.get(`${base}/__qa/submission-state`)).json() as { requestCount: number; savedCount: number };
  assert.equal(submissionState.requestCount, 1, 'two same-event submits create one request');
  assert.equal(submissionState.savedCount, 2, 'the delayed request is saved once alongside the initial fixture');

  await dialog.locator('select').selectOption('feature');
  await dialog.getByPlaceholder('请输入你的想法...').fill('失败保留后重试验收');
  await submissionPage.request.post(`${base}/__qa/fail-next-submission`);
  await submitButton.click();
  await submissionPage.getByText('意见提交服务暂时不可用', { exact: true }).waitFor();
  assert.equal(await dialog.locator('select').inputValue(), 'feature', 'failed writes preserve the selected type');
  assert.equal(await dialog.getByPlaceholder('请输入你的想法...').inputValue(), '失败保留后重试验收', 'failed writes preserve the content for retry');
  await submitButton.click();
  await submissionPage.getByText('感谢你的声音，意见已匿名发布', { exact: true }).waitFor();
  submissionState = await (await submissionPage.request.get(`${base}/__qa/submission-state`)).json() as { requestCount: number; savedCount: number };
  assert.equal(submissionState.requestCount, 3, 'failed write and explicit retry each submit once');
  assert.equal(submissionState.savedCount, 3, 'only confirmed writes are persisted');

  await dialog.locator('select').selectOption('usage');
  await dialog.getByPlaceholder('请输入你的想法...').fill('刷新失败仍应确认已提交');
  await submissionPage.request.post(`${base}/__qa/fail-feedback-reads`, { data: { count: 2 } });
  await submitButton.click();
  await submissionPage.getByText('感谢你的声音，意见已匿名发布', { exact: true }).waitFor();
  await submissionPage.getByText('意见列表暂时不可用', { exact: true }).waitFor();
  assert.equal(await dialog.getByPlaceholder('请输入你的想法...').inputValue(), '', 'post-write read failures do not restore submitted text');
  assert.equal(await submissionPage.getByText('提交失败', { exact: true }).count(), 0, 'a confirmed write is never reported as failed due to a later read failure');
  submissionState = await (await submissionPage.request.get(`${base}/__qa/submission-state`)).json() as { requestCount: number; savedCount: number };
  assert.equal(submissionState.requestCount, 4);
  assert.equal(submissionState.savedCount, 4);
  assert.equal(await submissionPage.getByText('页面出错了', { exact: true }).count(), 0, 'framework error boundary is not visible');
  assert.deepEqual(submissionErrors, [], submissionErrors.join('\n'));
  await submissionPage.screenshot({ path: '/tmp/xmt-anonymous-feedback-submit-v9.2.1.png', fullPage: false });
  await submissionPage.close();

  assert.deepEqual(errors, [], 'anonymous feedback page has no browser errors');
  console.log('匿名意见箱亮/暗主题图标对比回归通过');
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
  io.close();
}
