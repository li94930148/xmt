import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
let commitNextSubmissionThenFailResponse = false;
let failedFeedbackReadsRemaining = 0;
const submissionRequestIds: string[] = [];
const submissionStatusRequestIds: string[] = [];
const processedSubmissionRequestIds = new Set<string>();
const deletedRecoveryRequestId = 'ab7e2011-a635-445f-9c3b-884f93cb7d21';
const deletedRecoveryPayload = { type: 'process', content: '删除后不得用旧编号恢复意见', needReply: false };
const deletedRecoveryFingerprint = createHash('sha256')
  .update(JSON.stringify([deletedRecoveryPayload.type, deletedRecoveryPayload.content, deletedRecoveryPayload.needReply]), 'utf8')
  .digest('hex');
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
app.post('/__qa/commit-next-submission-then-fail-response', (_req, res) => {
  commitNextSubmissionThenFailResponse = true;
  res.json({ success: true });
});
app.post('/__qa/fail-feedback-reads', (req, res) => {
  failedFeedbackReadsRemaining = Number(req.body.count) || 0;
  res.json({ success: true });
});
app.get('/__qa/submission-state', (_req, res) => res.json({ requestCount: submissionRequestCount, savedCount: feedbackItems.length, requestIds: submissionRequestIds, statusRequestIds: submissionStatusRequestIds }));
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
app.get('/api/anonymous-feedback/submission-requests/:requestId', (req, res) => {
  submissionStatusRequestIds.push(req.params.requestId);
  return res.json({ data: { state: processedSubmissionRequestIds.has(req.params.requestId) ? 'processed' : 'not_found' } });
});
app.post('/api/anonymous-feedback', async (req, res) => {
  submissionRequestCount += 1;
  submissionRequestIds.push(String(req.body.client_request_id || ''));
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
  if (commitNextSubmissionThenFailResponse) {
    commitNextSubmissionThenFailResponse = false;
    processedSubmissionRequestIds.add(String(req.body.client_request_id || ''));
    return res.status(503).json({ message: '提交已保存，但客户端未收到成功响应' });
  }
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

if (process.env.XMT_ANONYMOUS_FEEDBACK_QA_SERVE === '1') {
  console.log(`Isolated anonymous feedback recovery fixture: ${base}/__qa`);
  await new Promise(() => {});
}

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
  const expectedSubmissionHttpErrors: string[] = [];
  submissionPage.on('pageerror', (error) => submissionErrors.push(error.message));
  submissionPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/503 \(Service Unavailable\)/.test(message.text())) expectedSubmissionHttpErrors.push(message.text());
    else submissionErrors.push(message.text());
  });
  await submissionPage.goto(`${base}/__qa?theme=light`);
  await submissionPage.getByRole('heading', { name: '匿名意见箱' }).waitFor();
  await submissionPage.getByRole('button', { name: '提交意见', exact: true }).first().click();
  const dialog = submissionPage.getByRole('dialog', { name: '匿名意见箱' });
  await dialog.waitFor();
  const typeField = dialog.getByLabel(/意见类型/);
  const contentField = dialog.getByLabel(/意见内容/);
  assert.equal(await typeField.getAttribute('id'), 'anonymous-feedback-type', 'the feedback type label targets a stable field id');
  assert.equal(await typeField.getAttribute('name'), 'type', 'the feedback type control has a stable form name');
  assert.equal(await contentField.getAttribute('id'), 'anonymous-feedback-content', 'the feedback content label targets a stable field id');
  assert.equal(await contentField.getAttribute('name'), 'content', 'the feedback content control has a stable form name');
  assert.equal(await typeField.getAttribute('required'), '', 'the named feedback type control exposes native required semantics');
  assert.equal(await contentField.getAttribute('required'), '', 'the named feedback content control exposes native required semantics');
  const emptySubmitButton = dialog.getByRole('button', { name: '提交意见', exact: true });
  await emptySubmitButton.click();
  await submissionPage.getByText('意见类型和意见内容均为必填项', { exact: true }).waitFor();
  const emptySubmitState = await (await submissionPage.request.get(`${base}/__qa/submission-state`)).json() as { requestCount: number };
  assert.equal(emptySubmitState.requestCount, 0, 'an empty submission shows validation feedback without sending a POST');

  await typeField.selectOption('process');
  await contentField.fill('隔离双提交与回执验收');
  await submissionPage.request.post(`${base}/__qa/hold-next-submission`);
  const submitButton = dialog.getByRole('button', { name: '提交意见', exact: true });
  await submitButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  await dialog.getByText('正在提交意见', { exact: true }).waitFor();
  assert.equal(await contentField.isDisabled(), true, 'the form locks during the confirmed write');
  await submissionPage.waitForFunction(async () => (await (await fetch('/__qa/submission-state')).json()).requestCount === 1);
  await submissionPage.request.post(`${base}/__qa/release-submission`);
  await submissionPage.getByText('感谢你的声音，意见已匿名发布', { exact: true }).first().waitFor();
  assert.equal(await contentField.inputValue(), '', 'confirmed submission clears only after success');
  let submissionState = await (await submissionPage.request.get(`${base}/__qa/submission-state`)).json() as { requestCount: number; savedCount: number };
  assert.equal(submissionState.requestCount, 1, 'two same-event submits create one request');
  assert.equal(submissionState.savedCount, 2, 'the delayed request is saved once alongside the initial fixture');

  await typeField.selectOption('feature');
  await contentField.fill('失败保留后重试验收');
  await submissionPage.request.post(`${base}/__qa/fail-next-submission`);
  await submitButton.click();
  await dialog.getByText('尚未查到这次意见提交', { exact: true }).waitFor();
  assert.equal(await typeField.inputValue(), 'feature', 'failed writes preserve the selected type');
  assert.equal(await contentField.inputValue(), '失败保留后重试验收', 'failed writes preserve the content for retry');
  const failedRequestId = submissionRequestIds.at(-1);
  assert.ok(failedRequestId, 'the ambiguous write used a request ID');
  await dialog.getByRole('button', { name: '检查后开始新提交' }).click();
  assert.equal(await submissionPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-submission-pending:v1')), null,
    'starting a new request clears the not-found recovery marker');
  await submitButton.click();
  await submissionPage.getByText('感谢你的声音，意见已匿名发布', { exact: true }).first().waitFor();
  submissionState = await (await submissionPage.request.get(`${base}/__qa/submission-state`)).json() as { requestCount: number; savedCount: number };
  assert.equal(submissionState.requestCount, 3, 'failed write and explicit retry each submit once');
  assert.equal(submissionState.savedCount, 3, 'only confirmed writes are persisted');
  assert.notEqual(submissionRequestIds.at(-1), failedRequestId, 'an explicit resubmission uses a new request ID after not_found');

  await typeField.selectOption('usage');
  await contentField.fill('刷新失败仍应确认已提交');
  await submissionPage.request.post(`${base}/__qa/fail-feedback-reads`, { data: { count: 2 } });
  await submitButton.click();
  await submissionPage.getByText('感谢你的声音，意见已匿名发布', { exact: true }).first().waitFor();
  await submissionPage.getByText('意见列表暂时不可用', { exact: true }).waitFor();
  assert.equal(await contentField.inputValue(), '', 'post-write read failures do not restore submitted text');
  assert.equal(await submissionPage.getByText('提交失败', { exact: true }).count(), 0, 'a confirmed write is never reported as failed due to a later read failure');
  submissionState = await (await submissionPage.request.get(`${base}/__qa/submission-state`)).json() as { requestCount: number; savedCount: number };
  assert.equal(submissionState.requestCount, 4);
  assert.equal(submissionState.savedCount, 4);

  await typeField.selectOption('team');
  await contentField.fill('首次响应丢失后按回执确认');
  const stateBeforeLostResponse = await (await submissionPage.request.get(`${base}/__qa/submission-state`)).json() as {
    requestCount: number; savedCount: number;
  };
  await submissionPage.request.post(`${base}/__qa/commit-next-submission-then-fail-response`);
  const lostResponsePost = submissionPage.waitForResponse((response) => response.url().endsWith('/api/anonymous-feedback') && response.request().method() === 'POST');
  await submitButton.click();
  assert.equal((await lostResponsePost).status(), 503, 'the isolated server commits the feedback but withholds a success response');
  await submissionPage.getByText('感谢你的声音，意见已匿名发布', { exact: true }).first().waitFor();
  const stateAfterLostResponse = await (await submissionPage.request.get(`${base}/__qa/submission-state`)).json() as {
    requestCount: number; savedCount: number; requestIds: string[]; statusRequestIds: string[];
  };
  const lostResponseRequestId = stateAfterLostResponse.requestIds.at(-1);
  assert.ok(lostResponseRequestId, 'the committed submission used a recovery request ID');
  assert.equal(stateAfterLostResponse.requestCount, stateBeforeLostResponse.requestCount + 1, 'recovery verifies the committed write without sending a second POST');
  assert.equal(stateAfterLostResponse.savedCount, stateBeforeLostResponse.savedCount + 1, 'the ambiguous response leaves exactly one saved feedback item');
  assert.equal(stateAfterLostResponse.statusRequestIds.filter((requestId) => requestId === lostResponseRequestId).length, 1, 'the UI checks the matching durable receipt once');
  assert.equal(await submissionPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-submission-pending:v1')), null,
    'a processed receipt clears the temporary browser recovery record');

  const deletedRecoveryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await deletedRecoveryPage.addInitScript(({ key, pending }) => {
    window.sessionStorage.setItem(key, JSON.stringify(pending));
  }, {
    key: 'xmt:anonymous-feedback-submission-pending:v1',
    pending: {
      clientRequestId: deletedRecoveryRequestId,
      requestFingerprint: deletedRecoveryFingerprint,
      payload: deletedRecoveryPayload,
    },
  });
  await deletedRecoveryPage.goto(`${base}/__qa?theme=light`);
  await deletedRecoveryPage.getByRole('button', { name: '提交意见', exact: true }).first().click();
  const deletedRecoveryDialog = deletedRecoveryPage.getByRole('dialog', { name: '匿名意见箱' });
  await deletedRecoveryDialog.getByText(/可能对应意见已被删除/).waitFor();
  assert.equal(await deletedRecoveryDialog.getByRole('button', { name: '用原请求编号重试' }).count(), 0, 'a deleted or absent request key is never retried');
  const requestCountBeforeFreshSubmit = submissionRequestCount;
  await deletedRecoveryDialog.getByRole('button', { name: '检查后开始新提交' }).click();
  assert.equal(await deletedRecoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-submission-pending:v1')), null,
    'starting a new submission clears the old recovery key');
  assert.equal(await deletedRecoveryDialog.locator('select').inputValue(), 'process', 'starting a new submission retains the selected type');
  assert.equal(await deletedRecoveryDialog.getByPlaceholder('请输入你的想法...').inputValue(), deletedRecoveryPayload.content,
    'starting a new submission retains the content for explicit review');
  await deletedRecoveryDialog.getByRole('button', { name: '提交意见', exact: true }).click();
  await deletedRecoveryPage.getByText('感谢你的声音，意见已匿名发布', { exact: true }).first().waitFor();
  const afterFreshSubmit = await (await deletedRecoveryPage.request.get(`${base}/__qa/submission-state`)).json() as {
    requestCount: number; savedCount: number; requestIds: string[];
  };
  assert.equal(afterFreshSubmit.requestCount, requestCountBeforeFreshSubmit + 1, 'only an explicit new submission sends a write');
  assert.notEqual(afterFreshSubmit.requestIds.at(-1), deletedRecoveryRequestId, 'a new submission receives a fresh request id');
  await deletedRecoveryPage.close();

  assert.equal(await submissionPage.getByText('页面出错了', { exact: true }).count(), 0, 'framework error boundary is not visible');
  assert.equal(expectedSubmissionHttpErrors.length, 4, 'only the deliberately injected failed write, lost response, and two failed reads are logged');
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
