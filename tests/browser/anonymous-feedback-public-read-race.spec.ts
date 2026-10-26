import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Browser } from 'playwright';
import { createServer as createViteServer } from 'vite';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 97, username: 'anonymous-feedback-race-qa', role: 'admin', name: '匿名意见竞态验收', enabled: true, force_change_password: false };
const initialFeedback = {
  id: 971,
  type: 'process',
  content: '已有的隔离意见',
  need_reply: false,
  reply_content: null,
  status: 'pending',
  created_at: '2026-10-18 09:00:00',
  updated_at: '2026-10-18 09:00:00',
};

const app = express();
app.use(express.json());
let feedbackItems = [initialFeedback];
let publicReadCount = 0;
let submissionCount = 0;
let releaseInitialRead: (() => void) | null = null;
const initialReadGate = new Promise<void>((resolve) => { releaseInitialRead = resolve; });

app.get('/__qa', (_request, response) => response.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','anonymous-feedback-race-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/anonymous-feedback');</script>`));
app.post('/__qa/release-initial-read', (_request, response) => {
  releaseInitialRead?.();
  releaseInitialRead = null;
  response.json({ released: true });
});
app.get('/__qa/read-state', (_request, response) => response.json({ publicReadCount, submissionCount }));
app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/permissions/my', (_request, response) => response.json(['*']));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_request, response) => response.json({}));
app.get('/api/anonymous-feedback', async (_request, response) => {
  publicReadCount += 1;
  const snapshotAtRequest = [...feedbackItems];
  if (publicReadCount === 1) {
    await initialReadGate;
    return response.json({ data: snapshotAtRequest });
  }
  return response.json({ data: feedbackItems });
});
app.post('/api/anonymous-feedback', (request, response) => {
  submissionCount += 1;
  const created = {
    ...initialFeedback,
    id: 971 + submissionCount,
    type: request.body.type,
    content: request.body.content,
    need_reply: request.body.needReply,
  };
  feedbackItems = [...feedbackItems, created];
  return response.status(201).json({ success: true });
});
app.use('/api', (_request, response) => response.json({ data: [] }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

let browser: Browser | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '匿名意见箱', exact: true }).waitFor();
  await page.waitForFunction(async () => (await (await fetch('/__qa/read-state')).json()).publicReadCount === 1);

  await page.getByRole('button', { name: '提交意见', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '匿名意见箱' });
  await dialog.waitFor();
  await dialog.locator('select').selectOption('feature');
  const submittedContent = '首屏读取挂起期间提交的隔离意见';
  await dialog.getByPlaceholder('请输入你的想法...').fill(submittedContent);
  await dialog.getByRole('button', { name: '提交意见', exact: true }).click();
  await page.getByText('感谢你的声音，意见已匿名发布', { exact: true }).waitFor();

  const publicOpinions = page.getByRole('heading', { name: '公开意见', exact: true }).locator('xpath=ancestor::section[1]');
  await publicOpinions.getByText(submittedContent, { exact: true }).waitFor();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await publicOpinions.getByText(submittedContent, { exact: true }).count(), 1, 'the confirmed submission appears in the public list before the old initial read completes');
  assert.equal((await page.evaluate(async () => (await (await fetch('/__qa/read-state')).json()).submissionCount)), 1, 'the flow writes the isolated submission exactly once');

  const lateInitialResponse = page.waitForResponse((response) => response.url().includes('/api/anonymous-feedback') && response.request().method() === 'GET' && response.status() === 200);
  await page.request.post(`${base}/__qa/release-initial-read`);
  await lateInitialResponse;
  assert.equal(await publicOpinions.getByText(submittedContent, { exact: true }).count(), 1, 'the late initial response cannot overwrite the newer confirmed list');
  assert.equal(await publicOpinions.getByText('已有的隔离意见', { exact: true }).count(), 1, 'the final list retains both the old and newly submitted isolated opinions');
  assert.deepEqual(errors, [], 'the public feedback read race has no unexpected browser errors');
  console.log('Anonymous feedback public-list race test passed: late initial reads do not hide a confirmed submission.');
} finally {
  releaseInitialRead?.();
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await vite.close();
  io.close();
}
