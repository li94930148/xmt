import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';
import * as Y from 'yjs';
import { productionStatusLabel } from '../../src/components/production/productionStatusLabel';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
assert.deepEqual(
  ['draft', 'review', 'approved', 'rejected'].map(productionStatusLabel),
  ['草稿', '审核中', '已通过', '已驳回'],
  'known production status codes should use business-facing labels',
);
assert.equal(productionStatusLabel('future_status'), '状态待确认', 'unknown production status codes should not leak into the UI');
assert.equal(productionStatusLabel(null), '状态待确认', 'missing production status should use a neutral label');
const user = { id: 91, username: 'review-qa', role: 'admin', name: '审阅验收', enabled: true, force_change_password: false };
const productionId = 77;
const topicId = 78;
function parseContrastColor(raw: string): number[] | null {
  const value = raw.trim();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const expanded = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
    if (expanded.length !== 6) return null;
    return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
  }
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? channels.slice(0, 3) : null;
}
function relativeLuminance(rgb: number[]) {
  const channels = rgb.map((value) => value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function parseLayerColor(raw: string) {
  const channels = raw.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 } : null;
}
async function textContrastRatio(locator: import('playwright').Locator) {
  const styles = await locator.evaluate((element) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) backgrounds.push(getComputedStyle(current).backgroundColor);
    return { foreground: getComputedStyle(element).color, backgrounds: backgrounds.reverse() };
  });
  const foreground = parseLayerColor(styles.foreground)?.rgb;
  if (!foreground) return 0;
  let background = [255, 255, 255];
  for (const value of styles.backgrounds) {
    const layer = parseLayerColor(value);
    if (!layer) continue;
    background = layer.rgb.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
  }
  const text = relativeLuminance(foreground);
  const surface = relativeLuminance(background);
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}
async function renderedTextContrastRatio(locator: import('playwright').Locator) {
  const styles = await locator.evaluate((element) => {
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    return {
      foreground: getComputedStyle(element).color,
      opacity: ancestors.reduce((value, ancestor) => value * Number(getComputedStyle(ancestor).opacity || 1), 1),
      backgrounds: ancestors.map((ancestor) => {
        const style = getComputedStyle(ancestor);
        return { color: style.backgroundColor, opacity: Number(style.opacity || 1) };
      }),
    };
  });
  const foreground = parseLayerColor(styles.foreground);
  if (!foreground) return 0;
  let background = [255, 255, 255];
  let opacity = 1;
  for (const layer of styles.backgrounds) {
    opacity *= layer.opacity;
    const color = parseLayerColor(layer.color);
    if (!color) continue;
    const alpha = color.alpha * opacity;
    background = color.rgb.map((channel, index) => channel * alpha + background[index] * (1 - alpha));
  }
  const foregroundOpacity = foreground.alpha * styles.opacity;
  const renderedForeground = foreground.rgb.map((channel, index) => channel * foregroundOpacity + background[index] * (1 - foregroundOpacity));
  const text = relativeLuminance(renderedForeground);
  const surface = relativeLuminance(background);
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}
const savedContents: string[] = [];
const threads: Array<Record<string, unknown> & { id: number; replies: Array<Record<string, unknown>> }> = [];
let nextThreadId = 1;
let nextReplyId = 1;
let content = '<p>第一段文字需要审阅。</p>';
let productionStatus = 'draft';
let productionSaveAttempts = 0;
let productionSaveFailuresRemaining = 0;
let productionReviewAttempts = 0;
let failNextProductionReview = false;
let productionReviewGate: Promise<void> | null = null;
let releaseProductionReview: (() => void) | null = null;
let productionSaveGate: Promise<void> | null = null;
let releaseProductionSave: (() => void) | null = null;
let productionStatusUpdateAttempts = 0;
let productionStatusUpdateContent = '';
let productionVersionSaveAttempts = 0;
let productionVersionSaveContent = '';
let collaborationUpdatesToReject = 0;
let collaborationUpdateCount = 0;
let rejectedCollaborationUpdateCount = 0;
let failNextMaterialDraftUpdate = false;
let materialDraftRevision = 0;
let materialDraftContent = '<p></p>';
let failNextMaterialDraftRead = false;
let materialDraftReadGate: Promise<void> | null = null;
let materialInsertionGate: Promise<void> | null = null;
let failNextMaterialInsertion = false;
let materialInsertionRequests = 0;
const materialDraftWrites: string[] = [];

const app = express();
app.use(express.json({ limit: '2mb' }));
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','review-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/production/content/${productionId}');</script>`);
});
app.get('/__qa/state', (_req, res) => res.json({ content, savedContents, threads, productionStatus, productionSaveAttempts, productionReviewAttempts, productionStatusUpdateAttempts, productionStatusUpdateContent, productionVersionSaveAttempts, productionVersionSaveContent, collaborationUpdateCount, rejectedCollaborationUpdateCount }));
app.post('/__qa/reset-review-fixture', (_req, res) => {
  content = '<p>第一段文字需要审阅。</p>';
  productionStatus = 'draft';
  productionSaveAttempts = 0;
  productionSaveFailuresRemaining = 0;
  productionReviewAttempts = 0;
  failNextProductionReview = false;
  releaseProductionReview?.();
  releaseProductionReview = null;
  productionReviewGate = null;
  releaseProductionSave?.();
  releaseProductionSave = null;
  productionSaveGate = null;
  productionStatusUpdateAttempts = 0;
  productionStatusUpdateContent = '';
  productionVersionSaveAttempts = 0;
  productionVersionSaveContent = '';
  savedContents.length = 0;
  threads.length = 0;
  nextThreadId = 1;
  nextReplyId = 1;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-saves', (_req, res) => {
  productionSaveFailuresRemaining = 2;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-review', (_req, res) => {
  failNextProductionReview = true;
  return res.json({ ok: true });
});
app.post('/__qa/hold-next-production-review', (_req, res) => {
  productionReviewGate = new Promise<void>((resolve) => { releaseProductionReview = resolve; });
  return res.json({ ok: true });
});
app.post('/__qa/hold-next-production-save', (_req, res) => {
  productionSaveGate = new Promise<void>((resolve) => { releaseProductionSave = resolve; });
  return res.json({ ok: true });
});
app.post('/__qa/release-production-review', (_req, res) => {
  releaseProductionReview?.();
  releaseProductionReview = null;
  return res.json({ ok: true });
});
app.post('/__qa/release-production-save', (_req, res) => {
  releaseProductionSave?.();
  releaseProductionSave = null;
  return res.json({ ok: true });
});
app.post('/__qa/set-production-rejected-state', (_req, res) => {
  productionStatus = 'rejected';
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-collaboration-update', (_req, res) => {
  collaborationUpdatesToReject = 2;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-material-draft-update', (_req, res) => {
  failNextMaterialDraftUpdate = true;
  return res.json({ ok: true });
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/resource-center/search', (_req, res) => res.json({ data: [{
  resource_id: 88, title: '隔离参考资料', summary: null, snippet: '仅用于检查资料选中态。', library_type: 'project', category: null,
}], total: 1 }));
app.get('/api/topics/:id', (_req, res) => res.json({ success: true, data: { id: topicId, title: '协作审阅稿件', outline: '', creator_id: user.id, assignee_id: user.id, status: 'production', platform: 'douyin' } }));
app.get(`/api/workflow/production/${productionId}`, (_req, res) => res.json({
  id: productionId, topic_id: topicId, topic_title: '协作审阅稿件', version: 'v1.0', status: productionStatus,
  content, contentMarkdown: content, content_markdown: content, content_json: content,
  operator_id: user.id, operator_name: user.name, can_edit: true, created_at: '2026-09-29 09:00:00', updated_at: '2026-09-29 09:00:00',
}));
app.get(`/api/workflow/production/${productionId}/history`, (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));
app.get(`/api/productions/${productionId}/material-draft`, async (_req, res) => {
  const gate = materialDraftReadGate;
  materialDraftReadGate = null;
  const draft = { production_id: productionId, content_html: materialDraftContent, revision: materialDraftRevision,
    created_by: user.id, updated_by: user.id, created_at: null, updated_at: null };
  if (gate) await gate;
  if (failNextMaterialDraftRead) {
    failNextMaterialDraftRead = false;
    return res.status(503).json({ message: '隔离测试模拟创作资料读取失败' });
  }
  return res.json({ data: draft });
});
app.put(`/api/productions/${productionId}/material-draft`, (req, res) => {
  if (failNextMaterialDraftUpdate) {
    failNextMaterialDraftUpdate = false;
    return res.status(503).json({ message: '隔离测试模拟创作资料保存失败' });
  }
  assert.equal(req.body.revision, materialDraftRevision, 'material saves must use the confirmed draft revision');
  materialDraftContent = String(req.body.content_html);
  materialDraftWrites.push(materialDraftContent);
  materialDraftRevision += 1;
  return res.json({ data: {
    production_id: productionId, content_html: req.body.content_html, revision: materialDraftRevision,
    created_by: user.id, updated_by: user.id, created_at: null, updated_at: '2026-10-08 10:00:00',
  } });
});
app.post(`/api/productions/${productionId}/material-draft/resources`, async (req, res) => {
  materialInsertionRequests += 1;
  const gate = materialInsertionGate;
  materialInsertionGate = null;
  const shouldFail = failNextMaterialInsertion;
  failNextMaterialInsertion = false;
  if (gate) await gate;
  if (shouldFail) return res.status(503).json({ message: '隔离测试模拟资料插入读取失败，请重试' });
  assert.deepEqual(req.body.resource_ids, [88], 'the selected source must stay stable throughout insertion');
  return res.json({ data: [{ resource_id: 88, title: '隔离参考资料', content_html: '<p>资料引用单次插入验收。</p>' }], empty_resource_ids: [] });
});
app.put(`/api/workflow/production/${productionId}`, async (req, res) => {
  if (req.body.status === 'review') {
    productionReviewAttempts += 1;
    const gate = productionReviewGate;
    productionReviewGate = null;
    if (gate) await gate;
    if (failNextProductionReview) {
      failNextProductionReview = false;
      return res.status(503).json({ message: '隔离测试模拟审核提交失败，请重试' });
    }
    productionStatus = 'review';
  } else {
    productionSaveAttempts += 1;
    const gate = productionSaveGate;
    productionSaveGate = null;
    if (gate) await gate;
    if (productionSaveFailuresRemaining > 0) {
      productionSaveFailuresRemaining -= 1;
      return res.status(503).json({ message: '隔离测试模拟正文保存失败' });
    }
    if (req.body.status === 'draft') {
      if (req.body.version_action === 'minor' || req.body.version_action === 'major') {
        productionVersionSaveAttempts += 1;
        productionVersionSaveContent = String(req.body.content ?? '');
      } else if (productionStatus !== 'draft') {
        productionStatusUpdateAttempts += 1;
        productionStatusUpdateContent = String(req.body.content ?? '');
        productionStatus = 'draft';
      }
    }
  }
  content = String(req.body.content ?? content);
  savedContents.push(content);
  return res.json({ message: '保存成功', version: 'v1.0' });
});
app.get(`/api/workflow/production/${productionId}/review-threads`, (_req, res) => res.json({ data: threads }));
app.post(`/api/workflow/production/${productionId}/review-threads`, (req, res) => {
  const id = nextThreadId++;
  threads.push({
    id, production_id: productionId, version: 'v1.0', kind: req.body.kind,
    anchor_quote: req.body.anchor.quote, anchor_context: req.body.anchor.context,
    anchor_from: req.body.anchor.from, anchor_to: req.body.anchor.to,
    summary: req.body.summary, proposed_text: req.body.proposed_text ?? null,
    status: 'open', author_id: user.id, author_name: user.name, reviewed_by: null,
    reviewer_name: null, created_at: '2026-09-29 09:10:00', updated_at: '2026-09-29 09:10:00', replies: [],
  });
  return res.status(201).json({ id, message: '已创建' });
});
app.post(`/api/workflow/production/${productionId}/review-threads/:threadId/replies`, (req, res) => {
  const thread = threads.find((item) => item.id === Number(req.params.threadId));
  if (!thread) return res.status(404).json({ message: '不存在' });
  const reply = { id: nextReplyId++, thread_id: thread.id, content: req.body.content, author_id: user.id, author_name: user.name, created_at: '2026-09-29 09:11:00' };
  thread.replies.push(reply);
  return res.status(201).json({ id: reply.id, message: '已回复' });
});
app.patch(`/api/workflow/production/${productionId}/review-threads/:threadId/status`, (req, res) => {
  const thread = threads.find((item) => item.id === Number(req.params.threadId));
  if (!thread) return res.status(404).json({ message: '不存在' });
  thread.status = req.body.status;
  return res.json({ message: '已处理' });
});
app.use('/api', (_req, res) => res.json({ data: [] }));

const server = http.createServer(app);
const io = new SocketServer(server);
const emptyUpdate = Array.from(Y.encodeStateAsUpdate(new Y.Doc()));
io.on('connection', (socket) => {
  socket.on('collaboration:join', ({ roomId }: { roomId: string }) => {
    socket.emit('collaboration:sync', { roomId, update: emptyUpdate });
    socket.emit('collaboration:users', { roomId, users: [] });
  });
  socket.on('collaboration:update', ({ roomId }: { roomId: string }, acknowledge?: (result: { ok: boolean; code?: string; reason?: string; version?: number }) => void) => {
    collaborationUpdateCount += 1;
    if (collaborationUpdatesToReject > 0) {
      collaborationUpdatesToReject -= 1;
      rejectedCollaborationUpdateCount += 1;
      const reason = 'Collaboration update could not be saved';
      socket.emit('collaboration:conflict-detected', { roomId, code: 'PERSISTENCE_FAILED', reason });
      acknowledge?.({ ok: false, code: 'PERSISTENCE_FAILED', reason });
      return;
    }
    acknowledge?.({ ok: true, version: collaborationUpdateCount });
  });
});
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_PRODUCTION_REVIEW_QA_SERVE === '1') {
  console.log(`Isolated production review QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  if (process.env.XMT_MATERIAL_PROTECTION_QA_ONLY !== '1') {
  const errors: string[] = [];
  const consoleProblems: string[] = [];
  let expectedReview503ConsoleErrors = 0;
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Failed to load resource.*503/.test(message.text()) && expectedReview503ConsoleErrors > 0) {
      expectedReview503ConsoleErrors -= 1;
      return;
    }
    if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  await page.getByText('草稿', { exact: true }).first().waitFor();
  assert.equal(await page.getByText('draft', { exact: true }).count(), 0, 'production detail should not show raw status codes');
  await page.getByText('这个版本还没有批注或修改建议').waitFor();
  await page.request.post(`${base}/__qa/fail-next-production-saves`);
  expectedReview503ConsoleErrors += 3;
  const mainDraftEditor = page.locator('.ProseMirror').last();
  const firstDraftSaveFailure = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 503);
  await mainDraftEditor.click();
  await mainDraftEditor.press('End');
  await mainDraftEditor.pressSequentially('正文保护验证', { delay: 1 });
  await firstDraftSaveFailure;

  const submitReviewButtons = page.getByRole('button', { name: '提交审核', exact: true });
  const submitReviewTop = submitReviewButtons.first();
  const submitReviewPanel = submitReviewButtons.last();
  const flushedDraftSaveFailure = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 503);
  await submitReviewTop.click();
  await flushedDraftSaveFailure;
  await page.getByText('正文保存未确认，请检查编辑器提示并重试后再提交审核。', { exact: true }).waitFor();
  let reviewState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(reviewState.productionStatus, 'draft', 'failed review submission keeps the manuscript in draft');
  assert.equal(await submitReviewTop.isEnabled(), true, 'failed review submission can be retried from the primary action');
  assert.equal(await submitReviewPanel.isEnabled(), true, 'failed review submission can also be retried from the version panel');
  assert.equal(reviewState.productionReviewAttempts, 0, 'unconfirmed autosave blocks the review mutation entirely');
  assert.ok(reviewState.productionSaveAttempts >= 2, 'submitting retries the failed autosave before refusing to review');

  await page.request.post(`${base}/__qa/fail-next-production-review`);
  const failedReviewResponse = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 503);
  await submitReviewTop.click();
  await failedReviewResponse;
  await page.getByText('隔离测试模拟审核提交失败，请重试', { exact: true }).waitFor();
  await submitReviewTop.waitFor({ state: 'visible' });
  assert.equal(await submitReviewTop.isEnabled(), true, 'a failed review request releases the shared production mutation lock');
  reviewState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(reviewState.productionStatus, 'draft', 'failed review submission keeps the confirmed draft state');
  assert.match(reviewState.content, /正文保护验证/, 'autosave recovery preserves the edited manuscript before the review attempt');
  assert.equal(reviewState.productionReviewAttempts, 1, 'a failed review request is recorded once and leaves retry available');

  await page.request.post(`${base}/__qa/hold-next-production-review`);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent?.trim() === '提交审核');
    if (buttons.length !== 2) throw new Error(`Expected both review-submit entry points, found ${buttons.length}`);
    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const pendingReviewSubmit = page.getByRole('button', { name: '正在提交审核…', exact: true });
  await pendingReviewSubmit.first().waitFor();
  await page.waitForFunction((expectedAttempts: number) => fetch('/__qa/state')
    .then((response) => response.json())
    .then((state) => state.productionReviewAttempts === expectedAttempts), 2);
  assert.equal(await pendingReviewSubmit.count(), 2, 'the primary and version-panel controls report the same in-flight review');
  for (const button of await pendingReviewSubmit.all()) {
    assert.equal(await button.isDisabled(), true, 'both review submission entry points stay locked until the server confirms');
  }
  assert.equal(await mainDraftEditor.getAttribute('contenteditable'), 'false', 'the submitted manuscript cannot change while its review request is in flight');
  for (const button of [
    page.getByRole('button', { name: '小修保存', exact: true }),
    page.getByRole('button', { name: '另开新版', exact: true }),
    page.getByRole('button', { name: '当前稿件', exact: true }),
    page.locator('button[title="删除创作记录"]'),
  ]) {
    assert.equal(await button.isDisabled(), true, 'version, edit, and delete actions cannot race with review submission');
  }
  reviewState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(reviewState.productionReviewAttempts, 2, 'rapid repeated clicks produce only one in-flight review write after the failed attempt');
  await page.request.post(`${base}/__qa/release-production-review`);
  await page.getByText('审核中', { exact: true }).first().waitFor();
  reviewState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(reviewState.productionStatus, 'review', 'successful review submission updates the confirmed page state');
  assert.equal(await page.getByRole('button', { name: '提交审核', exact: true }).count(), 0, 'a confirmed review submission cannot be accidentally repeated');
  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.request.post(`${base}/__qa/set-production-rejected-state`);
  await page.reload();
  await page.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  await page.getByText('已驳回', { exact: true }).first().waitFor();
  await page.getByText('这个版本还没有批注或修改建议').waitFor();

  await page.request.post(`${base}/__qa/hold-next-production-save`);
  const pendingAutosaveEditor = page.locator('.ProseMirror').last();
  await pendingAutosaveEditor.click();
  await pendingAutosaveEditor.press('End');
  await pendingAutosaveEditor.pressSequentially('状态写入并发验证', { delay: 1 });
  await page.waitForFunction(() => fetch('/__qa/state')
    .then((response) => response.json())
    .then((state) => state.productionSaveAttempts === 1), 2);
  await page.getByRole('button', { name: '重新编辑', exact: true }).click();
  await page.getByRole('button', { name: '状态处理中…', exact: true }).waitFor();
  assert.equal(await pendingAutosaveEditor.getAttribute('contenteditable'), 'false', 'status changes lock the editor while confirming any pending autosave');
  let statusState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(statusState.productionStatusUpdateAttempts, 0, 'a status write waits until the in-flight autosave is confirmed');
  assert.equal(statusState.productionStatus, 'rejected', 'the status remains unchanged while the autosave is pending');

  await page.request.post(`${base}/__qa/release-production-save`);
  await page.getByRole('button', { name: '提交审核', exact: true }).first().waitFor();
  statusState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(statusState.productionStatus, 'draft', 'the status updates after the autosave is confirmed');
  assert.match(statusState.productionStatusUpdateContent, /状态写入并发验证/, 'the status mutation carries the latest confirmed editor content');
  assert.match(statusState.content, /状态写入并发验证/, 'the latest editor content remains saved after the status transition');

  await page.request.post(`${base}/__qa/hold-next-production-save`);
  await pendingAutosaveEditor.click();
  await pendingAutosaveEditor.press('End');
  await pendingAutosaveEditor.pressSequentially('版本保存并发验证', { delay: 1 });
  await page.waitForFunction(() => fetch('/__qa/state')
    .then((response) => response.json())
    .then((state) => state.productionSaveAttempts === 3), 2);
  await page.getByRole('button', { name: '小修保存', exact: true }).click();
  await page.getByRole('button', { name: '正在保存…', exact: true }).waitFor();
  statusState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(statusState.productionVersionSaveAttempts, 0, 'a version save waits until the in-flight autosave is confirmed');
  assert.match(statusState.content, /状态写入并发验证/, 'the current saved version remains intact while autosave is pending');
  await page.request.post(`${base}/__qa/release-production-save`);
  await page.waitForFunction(() => fetch('/__qa/state')
    .then((response) => response.json())
    .then((state) => state.productionVersionSaveAttempts === 1), 2);
  statusState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.match(statusState.productionVersionSaveContent, /状态写入并发验证.*版本保存并发验证/, 'the version save includes the latest content after autosave confirmation');
  await page.getByText('小修已保存', { exact: true }).waitFor();

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.reload();
  await page.getByRole('button', { name: '提交审核', exact: true }).first().waitFor();

  const toolbarContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const toolbarPage = await toolbarContext.newPage();
  toolbarPage.setDefaultTimeout(5000);
  const toolbarErrors: string[] = [];
  toolbarPage.on('pageerror', (error) => toolbarErrors.push(error.message));
  toolbarPage.on('console', (message) => { if (message.type() === 'error') toolbarErrors.push(message.text()); });
  await toolbarPage.goto(`${base}/__qa`);
  await toolbarPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  const editorToolbar = toolbarPage.locator('.editor-toolbar').filter({ has: toolbarPage.locator('button[title^="格式刷"]') }).first();
  await editorToolbar.waitFor({ state: 'visible' });

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await toolbarPage.setViewportSize(viewport);
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
      await page.evaluate((value) => {
        document.documentElement.style.zoom = `${value * 100}%`;
      }, zoom);
      await toolbarPage.evaluate((value) => { document.documentElement.style.zoom = `${value * 100}%`; }, zoom);

      for (const name of ['当前版本查看 / 编辑', '小修保存', '另开新版', '提交审核']) {
        const button = page.getByRole('button', { name, exact: true }).last();
        await button.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
        const geometry = await button.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const clippedBy: string[] = [];
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            const ancestorRect = ancestor.getBoundingClientRect();
            const clipsX = ['hidden', 'clip'].includes(style.overflowX);
            const clipsY = ['hidden', 'clip'].includes(style.overflowY);
            if ((clipsX && (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1))
              || (clipsY && (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1))) {
              clippedBy.push(`${ancestor.tagName}.${String(ancestor.className)}`);
            }
          }
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            display: getComputedStyle(element).display,
            visibility: getComputedStyle(element).visibility,
            clippedBy,
          };
        });
        assert.ok(geometry.width > 0 && geometry.height > 0, `${name} has a layout box at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
        assert.notEqual(geometry.display, 'none', `${name} is not hidden at ${viewport.width}px / ${zoom * 100}%`);
        assert.notEqual(geometry.visibility, 'hidden', `${name} is not invisible at ${viewport.width}px / ${zoom * 100}%`);
        assert.deepEqual(geometry.clippedBy, [], `${name} is not clipped at ${viewport.width}px / ${zoom * 100}%`);
        assert.ok(geometry.x >= -1 && geometry.x + geometry.width <= geometry.viewportWidth + 1, `${name} stays within the viewport at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
      }

      for (const selector of ['button[title="撤销 (Ctrl+Z)"]', 'button[title="重做 (Ctrl+Y)"]', 'button[title^="格式刷"]', 'button[title="标题层级"]']) {
        const control = editorToolbar.locator(selector).first();
        await control.evaluate((element) => element.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
        const bounds = await control.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, display: getComputedStyle(element).display, visibility: getComputedStyle(element).visibility };
        });
        assert.ok(bounds.width > 0 && bounds.height > 0, `${selector} has a layout box at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(bounds)}`);
        assert.notEqual(bounds.display, 'none', `${selector} is not hidden at ${viewport.width}px / ${zoom * 100}%`);
        assert.notEqual(bounds.visibility, 'hidden', `${selector} is not invisible at ${viewport.width}px / ${zoom * 100}%`);
        assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= bounds.viewportWidth + 1 && bounds.y >= -1 && bounds.y + bounds.height <= bounds.viewportHeight + 1, `${selector} stays within the viewport at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(bounds)}`);
      }
    }
  }
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.setViewportSize({ width: 1440, height: 960 });

  const themeContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const themePage = await themeContext.newPage();
  themePage.setDefaultTimeout(5000);
  for (const theme of ['light', 'dark'] as const) {
    await themePage.goto(`${base}/__qa?theme=${theme}`);
    await themePage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
    const topicLink = themePage.getByRole('button', { name: '协作审阅稿件', exact: true }).first();
    await topicLink.hover();
    await page.waitForTimeout(350);
    const colors = await topicLink.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      surface: getComputedStyle(document.documentElement).getPropertyValue('--xmt-surface'),
    }));
    const foreground = parseContrastColor(colors.foreground);
    const surface = parseContrastColor(colors.surface);
    const ratio = foreground && surface
      ? (Math.max(relativeLuminance(foreground), relativeLuminance(surface)) + 0.05) / (Math.min(relativeLuminance(foreground), relativeLuminance(surface)) + 0.05)
      : 0;
    assert.ok(ratio >= 4.5, `关联选题链接在 ${theme} 主题悬停时对比度应至少 4.5:1，实际 ${ratio.toFixed(2)}:1`);

    await themePage.getByRole('button', { name: '添加资料', exact: true }).click();
    await themePage.getByPlaceholder('搜索资料标题或正文').fill('隔离参考资料');
    await themePage.getByRole('button', { name: '搜索', exact: true }).click();
    const resource = themePage.getByRole('button', { name: /隔离参考资料/ });
    await resource.waitFor();
    await resource.click();
    const selectedMarker = resource.locator('span').first();
    const selectedMarkerClass = await selectedMarker.getAttribute('class');
    assert.ok(selectedMarkerClass?.includes('bg-studio-cyan-soft') && selectedMarkerClass.includes('text-studio-cyan-contrast'), `${theme} resource selection uses semantic contrast tokens`);
    assert.ok(await textContrastRatio(selectedMarker) >= 4.5, `${theme} resource selection check icon contrast is at least 4.5:1`);
    await themePage.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(savedContents.length, 0, 'theme review never inserts a resource or edits the isolated manuscript');
  }
  await themeContext.close();

  await toolbarPage.setViewportSize({ width: 1024, height: 900 });
  await toolbarPage.evaluate(() => { document.documentElement.style.zoom = '125%'; });
  await toolbarPage.waitForTimeout(100);
  await editorToolbar.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
  const moreTools = editorToolbar.locator('button[title="更多操作"]');
  await moreTools.waitFor({ state: 'visible' });
  await moreTools.click();
  const menuGeometry = await editorToolbar.locator('div.absolute.w-56').last().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const trigger = element.parentElement?.querySelector('button[title="更多操作"]')?.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, viewportHeight: window.innerHeight, top: style.top, bottomStyle: style.bottom, maxHeight: style.maxHeight, zoom: getComputedStyle(document.documentElement).zoom, triggerTop: trigger?.top, triggerBottom: trigger?.bottom };
  });
  assert.ok(menuGeometry.y >= 0 && menuGeometry.bottom <= menuGeometry.viewportHeight, `collapsed toolbar menu stays inside the viewport: ${JSON.stringify(menuGeometry)}`);
  assert.ok(menuGeometry.bottom <= (menuGeometry.triggerTop ?? 0) + 1, `collapsed toolbar menu opens above the trigger when lower space is limited: ${JSON.stringify(menuGeometry)}`);
  const compactAlignmentAction = editorToolbar.getByRole('button', { name: '左对齐', exact: true });
  await compactAlignmentAction.waitFor({ state: 'visible' });
  const compactActionBounds = await compactAlignmentAction.boundingBox();
  assert.ok(compactActionBounds && compactActionBounds.x >= 0 && compactActionBounds.x + compactActionBounds.width <= 1024 && compactActionBounds.y >= 0 && compactActionBounds.y + compactActionBounds.height <= 900, `collapsed toolbar menu action stays in the viewport: ${JSON.stringify(compactActionBounds)}`);
  await toolbarPage.screenshot({ path: '/tmp/xmt-production-editor-toolbar-1024.png', fullPage: true });
  await toolbarPage.keyboard.press('Escape');

  await toolbarPage.setViewportSize({ width: 1200, height: 839 });
  await toolbarPage.evaluate(() => { document.documentElement.style.zoom = ''; });
  await toolbarPage.goto(`${base}/__qa?theme=light`);
  await toolbarPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  const scrollingMoreMenu = toolbarPage.locator('.editor-toolbar button[title="更多操作"]').last();
  await scrollingMoreMenu.scrollIntoViewIfNeeded();
  await scrollingMoreMenu.click();
  const scrollingMoreMenuPopup = toolbarPage.locator('.editor-toolbar div.absolute.z-50').filter({ hasText: '批注' }).last();
  await scrollingMoreMenuPopup.waitFor({ state: 'visible' });
  await toolbarPage.evaluate(() => {
    const scroller = Array.from(document.querySelectorAll('div')).find((element) => element.classList.contains('md:overflow-y-auto'));
    if (!scroller) throw new Error('Expected the editor page scroll container');
    scroller.scrollTop = Math.min(scroller.scrollHeight, 1200);
  });
  await scrollingMoreMenuPopup.waitFor({ state: 'hidden' });

  await toolbarPage.goto(`${base}/__qa?theme=light`);
  await toolbarPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  await toolbarPage.setViewportSize({ width: 1024, height: 600 });
  await toolbarPage.evaluate(() => { document.documentElement.style.zoom = '125%'; });
  const dropdownCases = [
    { trigger: 'button[title="标题层级"]', menuText: '标题 1', name: '标题层级' },
    { trigger: 'button[title="文字颜色"]', menuText: '文字颜色', name: '文字颜色' },
    { trigger: 'button[title="高亮颜色"]', menuText: '高亮颜色', name: '高亮颜色' },
    { trigger: 'button[title="更多操作"]', menuText: '左对齐', name: '更多操作' },
  ];
  for (const { trigger: triggerSelector, menuText, name } of dropdownCases) {
    const trigger = toolbarPage.locator(triggerSelector).last();
    await trigger.click();
    const menu = toolbarPage.locator('.editor-toolbar div.absolute.z-50').filter({ hasText: menuText }).last();
    await menu.waitFor({ state: 'visible' });
    const geometry = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const triggerRect = element.parentElement?.querySelector('button')?.getBoundingClientRect();
      const clippedBy: string[] = [];
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const ancestorRect = ancestor.getBoundingClientRect();
        if ((['hidden', 'clip'].includes(style.overflowX) && (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1))
          || (['hidden', 'clip'].includes(style.overflowY) && (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1))) {
          clippedBy.push(`${ancestor.tagName}.${String(ancestor.className)}`);
        }
      }
      return {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        triggerTop: triggerRect?.top,
        triggerBottom: triggerRect?.bottom,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        clippedBy,
      };
    });
    assert.ok(geometry.x >= -1 && geometry.right <= geometry.viewportWidth + 1 && geometry.y >= -1 && geometry.bottom <= geometry.viewportHeight + 1, `${name} menu stays in the 1024x600 viewport at 125% zoom: ${JSON.stringify(geometry)}`);
    assert.deepEqual(geometry.clippedBy, [], `${name} menu is not clipped by an ancestor at 1024x600 / 125%: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.bottom <= (geometry.triggerTop ?? 0) + 1 || geometry.y >= (geometry.triggerBottom ?? 0) - 1, `${name} menu stays adjacent to its trigger: ${JSON.stringify(geometry)}`);
    await trigger.click();
  }

  const bubbleEditor = toolbarPage.locator('.ProseMirror').filter({ hasText: '第一段文字需要审阅。' }).first();
  const selectToolbarParagraph = async (editor: typeof bubbleEditor) => {
    await toolbarPage.waitForFunction(() => Array.from(document.querySelectorAll('.ProseMirror p')).some((paragraph) => {
      if (!paragraph.textContent?.includes('第一段文字需要审阅。')) return false;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const rect = range.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }));
    await editor.waitFor({ state: 'visible' });
    const bounds = await editor.evaluate((root) => {
      const element = Array.from(root.querySelectorAll('p')).find((candidate) => candidate.textContent?.includes('第一段文字需要审阅。'));
      if (!element) throw new Error('Expected review paragraph to be mounted in the editor');
      element.scrollIntoView({ block: 'center' });
      const range = document.createRange();
      range.selectNodeContents(element);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) throw new Error('Expected visible review paragraph text');
      return {
        startX: rect.left + 1,
        startY: rect.top + rect.height / 2,
        endX: rect.right - 1,
        endY: rect.top + rect.height / 2,
      };
    });
    await toolbarPage.mouse.move(bounds.startX, bounds.startY);
    await toolbarPage.mouse.down();
    await toolbarPage.mouse.move(bounds.endX, bounds.endY, { steps: 8 });
    await toolbarPage.mouse.up();
  };
  await selectToolbarParagraph(bubbleEditor);
  assert.equal(await toolbarPage.evaluate(() => window.getSelection()?.toString()), '第一段文字需要审阅。');
  for (const { triggerTitle, panelTitle } of [
    { triggerTitle: '高亮', panelTitle: '高亮颜色' },
    { triggerTitle: '文字颜色', panelTitle: '文字颜色' },
  ]) {
    const trigger = toolbarPage.locator(`button[title="${triggerTitle}"]`).last();
    await trigger.waitFor({ state: 'visible' });
    await trigger.click();
    const popover = trigger.locator('xpath=..').locator('div.absolute.z-50').filter({ hasText: panelTitle }).last();
    await popover.waitFor({ state: 'visible' });
    const geometry = await popover.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const triggerRect = element.parentElement?.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, triggerTop: triggerRect?.top, triggerBottom: triggerRect?.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(geometry.x >= -1 && geometry.right <= geometry.viewportWidth + 1 && geometry.y >= -1 && geometry.bottom <= geometry.viewportHeight + 1, `${panelTitle} bubble popover stays in the 1024x600 viewport at 125% zoom: ${JSON.stringify(geometry)}`);
    const labelContrast = await renderedTextContrastRatio(popover.getByText(panelTitle, { exact: true }));
    assert.ok(labelContrast >= 4.5, `${panelTitle} bubble popover label meets 4.5:1 contrast in light theme; actual ${labelContrast.toFixed(2)}:1`);
    if (triggerTitle === '高亮') {
      await bubbleEditor.evaluate((element) => element.scrollIntoView({ block: 'start' }));
      await toolbarPage.waitForTimeout(100);
      const scrolledGeometry = await popover.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      assert.ok(scrolledGeometry.x >= -1 && scrolledGeometry.right <= scrolledGeometry.viewportWidth + 1 && scrolledGeometry.y >= -1 && scrolledGeometry.bottom <= scrolledGeometry.viewportHeight + 1, `open highlighter remains visible while its selection scrolls: ${JSON.stringify(scrolledGeometry)}`);
    }
    await trigger.click();
  }

  await toolbarPage.goto(`${base}/__qa?theme=dark`);
  await toolbarPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  const darkBubbleEditor = toolbarPage.locator('.ProseMirror').filter({ hasText: '第一段文字需要审阅。' }).first();
  await selectToolbarParagraph(darkBubbleEditor);
  assert.equal(await toolbarPage.evaluate(() => window.getSelection()?.toString()), '第一段文字需要审阅。');
  await toolbarPage.waitForFunction(() => Boolean(document.querySelector('button[title="高亮"]')));
  for (const { triggerTitle, panelTitle } of [
    { triggerTitle: '高亮', panelTitle: '高亮颜色' },
    { triggerTitle: '文字颜色', panelTitle: '文字颜色' },
  ]) {
    const trigger = toolbarPage.locator(`button[title="${triggerTitle}"]`).last();
    await trigger.click();
    const popover = trigger.locator('xpath=..').locator('div.absolute.z-50').filter({ hasText: panelTitle }).last();
    await popover.waitFor({ state: 'visible' });
    const labelContrast = await renderedTextContrastRatio(popover.getByText(panelTitle, { exact: true }));
    assert.ok(labelContrast >= 4.5, `${panelTitle} bubble popover label meets 4.5:1 contrast in dark theme; actual ${labelContrast.toFixed(2)}:1`);
    await trigger.click();
  }

  await toolbarPage.setViewportSize({ width: 1920, height: 600 });
  await toolbarPage.evaluate(() => { document.documentElement.style.zoom = '125%'; });
  const exportTrigger = toolbarPage.locator('button[title="导出"]');
  await exportTrigger.waitFor({ state: 'visible' });
  await exportTrigger.click();
  const exportMenu = toolbarPage.locator('.editor-toolbar div.absolute.z-50').filter({ hasText: '导出 Markdown' }).last();
  await exportMenu.waitFor({ state: 'visible' });
  const exportGeometry = await exportMenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const triggerRect = element.parentElement?.querySelector('button[title="导出"]')?.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, triggerTop: triggerRect?.top, triggerBottom: triggerRect?.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.ok(exportGeometry.x >= -1 && exportGeometry.right <= exportGeometry.viewportWidth + 1 && exportGeometry.y >= -1 && exportGeometry.bottom <= exportGeometry.viewportHeight + 1, `export menu stays in the 1920x600 viewport at 125% zoom: ${JSON.stringify(exportGeometry)}`);
  assert.ok(exportGeometry.bottom <= (exportGeometry.triggerTop ?? 0) + 1 || exportGeometry.y >= (exportGeometry.triggerBottom ?? 0) - 1, `export menu stays adjacent to its trigger: ${JSON.stringify(exportGeometry)}`);
  await exportTrigger.click();

  await toolbarPage.setViewportSize({ width: 1440, height: 960 });
  await toolbarPage.evaluate(() => { document.documentElement.style.zoom = ''; });
  await toolbarPage.goto(`${base}/__qa?theme=light`);
  await toolbarPage.getByRole('heading', { name: '批注与修改建议' }).waitFor();
  await toolbarPage.setViewportSize({ width: 390, height: 844 });
  const contextEditor = toolbarPage.locator('.ProseMirror').filter({ hasText: '第一段文字需要审阅' }).first();
  await contextEditor.waitFor({ state: 'visible' });
  await contextEditor.click({ button: 'right', position: { x: 300, y: 42 } });
  const contextMenu = toolbarPage.getByTestId('editor-context-menu');
  await contextMenu.waitFor({ state: 'visible' });
  assert.equal(await contextMenu.evaluate((menu) => menu.parentElement === document.body), true, 'editor context menu escapes transformed and clipping glass panels');
  await toolbarPage.evaluate(() => document.documentElement.style.setProperty('--xmt-z-editor-menu', '450'));
  assert.equal(await contextMenu.evaluate((element) => getComputedStyle(element).zIndex), '450', 'editor menus consume the shared layer token');
  assert.equal(await toolbarPage.getByTestId('editor-context-menu-backdrop').evaluate((element) => getComputedStyle(element).zIndex), '449', 'the editor dismissal backdrop stays immediately below its menu');
  await toolbarPage.evaluate(() => document.documentElement.style.removeProperty('--xmt-z-editor-menu'));
  const contextMenuBounds = await contextMenu.boundingBox();
  assert.ok(contextMenuBounds
    && contextMenuBounds.x >= 0
    && contextMenuBounds.y >= 0
    && contextMenuBounds.x + contextMenuBounds.width <= 390
    && contextMenuBounds.y + contextMenuBounds.height <= 844,
  `right-click menu stays inside the 390x844 viewport: ${JSON.stringify(contextMenuBounds)}`);
  await contextMenu.getByText('文字颜色', { exact: true }).hover();
  const contextColorSubmenu = contextMenu.getByTestId('editor-context-color-submenu');
  await contextColorSubmenu.waitFor({ state: 'visible' });
  const submenuGeometry = await contextColorSubmenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { side: element.getAttribute('data-side'), x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.equal(submenuGeometry.side, 'left', `color submenu flips left near the right viewport edge: ${JSON.stringify(submenuGeometry)}`);
  assert.ok(submenuGeometry.x >= 0 && submenuGeometry.right <= 390 && submenuGeometry.y >= 0 && submenuGeometry.bottom <= 844,
    `color submenu stays inside the 390x844 viewport: ${JSON.stringify(submenuGeometry)}`);
  await toolbarPage.screenshot({ path: '/tmp/xmt-editor-context-submenu-390.png' });
  await toolbarPage.keyboard.press('Escape');
  await contextMenu.waitFor({ state: 'hidden' });

  await toolbarPage.setViewportSize({ width: 1440, height: 960 });
  await toolbarPage.goto(`${base}/__qa?theme=dark`);
  await toolbarPage.getByRole('heading', { name: '批注与修改建议' }).waitFor();
  await toolbarPage.setViewportSize({ width: 390, height: 844 });
  await contextEditor.waitFor({ state: 'visible' });
  await contextEditor.click({ button: 'right', position: { x: 2, y: 42 } });
  await contextMenu.waitFor({ state: 'visible' });
  await contextMenu.getByText('高亮颜色', { exact: true }).hover();
  const contextHighlightSubmenu = contextMenu.getByTestId('editor-context-highlight-submenu');
  await contextHighlightSubmenu.waitFor({ state: 'visible' });
  const highlightGeometry = await contextHighlightSubmenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { side: element.getAttribute('data-side'), x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.equal(highlightGeometry.side, 'right', `highlight submenu stays to the right when opened near the left edge: ${JSON.stringify(highlightGeometry)}`);
  assert.ok(highlightGeometry.x >= 0 && highlightGeometry.right <= 390 && highlightGeometry.y >= 0 && highlightGeometry.bottom <= 844,
    `dark-theme highlight submenu stays inside the 390x844 viewport: ${JSON.stringify(highlightGeometry)}`);
  await toolbarPage.screenshot({ path: '/tmp/xmt-editor-context-submenu-dark-390.png' });
  await toolbarPage.keyboard.press('Escape');
  await contextMenu.waitFor({ state: 'hidden' });

  await toolbarPage.setViewportSize({ width: 1440, height: 960 });
  await toolbarPage.goto(`${base}/__qa?theme=light`);
  await toolbarPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  const commentEditor = toolbarPage.locator('.ProseMirror').filter({ hasText: '第一段文字需要审阅。' }).first();
  await selectToolbarParagraph(commentEditor);
  await toolbarPage.locator('.editor-toolbar button[title="更多操作"]').last().click();
  await toolbarPage.getByRole('button', { name: '批注', exact: true }).click();
  const addCommentDialog = toolbarPage.getByRole('dialog', { name: /添加批注/ });
  await addCommentDialog.waitFor({ state: 'visible' });
  assert.equal(await addCommentDialog.getAttribute('aria-modal'), 'true', 'inline comment editor exposes modal dialog semantics');
  assert.equal(await addCommentDialog.evaluate((dialog) => dialog.parentElement === document.body), true, 'comment dialog escapes animated page and scroll containers');
  const commentInput = addCommentDialog.getByLabel('批注内容');
  await commentInput.waitFor({ state: 'visible' });
  assert.ok(await renderedTextContrastRatio(addCommentDialog.getByRole('heading')) >= 4.5, 'light-theme comment dialog title remains readable');
  await commentInput.fill('取消后不应留下批注');
  await toolbarPage.setViewportSize({ width: 320, height: 568 });
  const commentDialogBounds = await addCommentDialog.boundingBox();
  assert.ok(commentDialogBounds
    && commentDialogBounds.x >= 0
    && commentDialogBounds.y >= 0
    && commentDialogBounds.x + commentDialogBounds.width <= 320
    && commentDialogBounds.y + commentDialogBounds.height <= 568,
  `comment dialog stays inside the 320x568 viewport: ${JSON.stringify(commentDialogBounds)}`);
  await toolbarPage.screenshot({ path: '/tmp/xmt-editor-comment-dialog-light-320.png' });
  await commentInput.press('Escape');
  await addCommentDialog.waitFor({ state: 'hidden' });
  assert.equal(await commentEditor.locator('[data-comment-id]').count(), 0, 'closing the comment dialog does not add a comment');

  await toolbarPage.setViewportSize({ width: 1440, height: 960 });
  await selectToolbarParagraph(commentEditor);
  await toolbarPage.locator('.editor-toolbar button[title="更多操作"]').last().click();
  await toolbarPage.getByRole('button', { name: '批注', exact: true }).click();
  const secondAddDialog = toolbarPage.getByRole('dialog', { name: /添加批注/ });
  await secondAddDialog.waitFor({ state: 'visible' });
  await toolbarPage.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  assert.ok(await renderedTextContrastRatio(secondAddDialog.getByRole('heading')) >= 4.5, 'dark-theme comment dialog title remains readable');
  await secondAddDialog.getByLabel('批注内容').fill('请补充这段的依据。');
  await secondAddDialog.getByRole('button', { name: '确认', exact: true }).click();
  await secondAddDialog.waitFor({ state: 'hidden' });
  const inlineComment = commentEditor.locator('[data-comment-id]').first();
  await inlineComment.waitFor({ state: 'visible' });
  assert.equal(await inlineComment.getAttribute('data-comment-text'), '请补充这段的依据。', 'confirming the dialog adds the selected text comment');
  await inlineComment.click();
  const commentPopup = toolbarPage.getByRole('button', { name: '编辑批注', exact: true }).locator('..');
  assert.equal(await commentPopup.evaluate((menu) => menu.parentElement === document.body), true, 'inline comment actions escape transformed page and editor ancestors');
  await toolbarPage.keyboard.press('Escape');
  await commentPopup.waitFor({ state: 'hidden' });
  await toolbarPage.setViewportSize({ width: 320, height: 568 });
  await inlineComment.evaluate((element) => element.scrollIntoView({ block: 'end' }));
  await inlineComment.click();
  const commentPopupBounds = await commentPopup.boundingBox();
  assert.ok(commentPopupBounds
    && commentPopupBounds.x >= 8
    && commentPopupBounds.y >= 8
    && commentPopupBounds.x + commentPopupBounds.width <= 312
    && commentPopupBounds.y + commentPopupBounds.height <= 560,
  `inline comment actions stay inside the 320x568 viewport: ${JSON.stringify(commentPopupBounds)}`);
  await toolbarPage.screenshot({ path: '/tmp/xmt-editor-comment-actions-320.png' });
  await inlineComment.evaluate((element) => element.dispatchEvent(new Event('scroll')));
  await commentPopup.waitFor({ state: 'hidden' });
  await toolbarPage.setViewportSize({ width: 1440, height: 960 });
  await inlineComment.click();
  await toolbarPage.getByRole('button', { name: '编辑批注', exact: true }).click();
  const editCommentDialog = toolbarPage.getByRole('dialog', { name: '编辑批注' });
  await editCommentDialog.waitFor({ state: 'visible' });
  await editCommentDialog.getByLabel('批注内容').fill('请补充可核验的来源。');
  await editCommentDialog.getByRole('button', { name: '保存', exact: true }).click();
  await editCommentDialog.waitFor({ state: 'hidden' });
  assert.equal(await inlineComment.getAttribute('data-comment-text'), '请补充可核验的来源。', 'saving the edit updates the inline comment');
  await toolbarPage.waitForTimeout(1200);
  await toolbarPage.request.post(`${base}/__qa/reset-review-fixture`);
  assert.deepEqual(toolbarErrors, [], 'editor toolbar and comment dialogs render without browser errors or warnings');
  await toolbarContext.close();

  const paragraph = page.locator('.ProseMirror p').filter({ hasText: '第一段文字需要审阅。' }).first();
  const selectRange = async (from: number, to: number) => {
    await paragraph.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const bounds = await paragraph.evaluate((element, offsets) => {
      const text = element.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected a plain-text review paragraph');
      const range = document.createRange();
      range.setStart(text, offsets.from);
      range.setEnd(text, offsets.to);
      const rect = range.getBoundingClientRect();
      return { startX: rect.left + 1, endX: rect.right - 1, y: rect.top + rect.height / 2 };
    }, { from, to });
    await page.mouse.move(bounds.startX, bounds.y);
    await page.mouse.down();
    await page.mouse.move(bounds.endX, bounds.y, { steps: 4 });
    await page.mouse.up();
  };

  await selectRange(0, 3);
  assert.equal(await page.evaluate(() => window.getSelection()?.toString()), '第一段'.slice(0, 3));
  await page.getByRole('button', { name: '给选中文字加批注' }).click();
  await page.getByLabel('批注内容').fill('请补充这段的依据。');
  await page.getByRole('button', { name: '提交', exact: true }).click();
  await page.getByText('请补充这段的依据。').waitFor();
  await page.getByLabel('回复内容').first().fill('我会补充来源说明。');
  await page.getByRole('button', { name: '回复' }).click();
  await page.getByText('我会补充来源说明。').waitFor();

  await selectRange(3, 7);
  await page.getByRole('button', { name: '提出修改建议' }).click();
  await page.getByLabel('建议替换为（留空表示建议删除）').fill('表达更清楚');
  await page.getByLabel('修改理由').fill('让表达更直接。');
  await page.getByRole('button', { name: '提交', exact: true }).click();
  await page.getByText('让表达更直接。').waitFor();
  await page.getByRole('button', { name: '接受并保存' }).click();
  await page.getByText('已采纳').waitFor();
  await page.locator('.ProseMirror').getByText('表达更清楚').waitFor();

  const state = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(state.threads.length, 2);
  assert.equal(state.threads[0].replies.length, 1);
  assert.equal(state.threads[1].status, 'accepted');
  assert.ok(state.savedContents.some((saved: string) => saved.includes('表达更清楚')));
  await page.waitForFunction(async () => {
    const state = await fetch('/__qa/state').then((response) => response.json());
    return String(state.content).includes('第一段表达更清楚审阅。');
  }, undefined, { timeout: 5000 });

  const rejectedUpdatesBefore = await page.request.get(`${base}/__qa/state`).then((response) => response.json()).then((state) => state.rejectedCollaborationUpdateCount);
  await page.request.post(`${base}/__qa/fail-next-collaboration-update`);
  const editorBody = page.locator('.ProseMirror').filter({ hasText: '表达更清楚' }).first();
  await editorBody.click();
  await editorBody.press('End');
  await editorBody.pressSequentially('协作错误提示验收', { delay: 5 });
  await page.waitForTimeout(250);
  const collaborationState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.ok(collaborationState.collaborationUpdateCount > 0, 'formal editor should send a Yjs update to the collaboration room');
  assert.equal(collaborationState.rejectedCollaborationUpdateCount, rejectedUpdatesBefore + 1, 'fixture should reject the first update and exercise the acknowledgement failure path');
  const collaborationAlert = page.getByRole('alert').filter({ hasText: '协作中间内容暂未确认保存' });
  await collaborationAlert.waitFor();
  await collaborationAlert.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await collaborationAlert.screenshot({ path: '/tmp/xmt-yjs-persistence-error-message.png' });
  await page.getByRole('alert').waitFor({ state: 'hidden', timeout: 5000 });
  const recoveredCollaborationState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.ok(recoveredCollaborationState.collaborationUpdateCount >= collaborationState.collaborationUpdateCount + 1, 'unacknowledged Yjs update should retry and receive confirmation');
  assert.deepEqual(await page.getByRole('alert').allTextContents(), []);
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleProblems, []);

  const narrowMobileContext = await browser.newContext({ viewport: { width: 320, height: 812 }, reducedMotion: 'reduce' });
  const narrowMobileErrors: string[] = [];
  const narrowMobilePage = await narrowMobileContext.newPage();
  narrowMobilePage.on('pageerror', (error) => narrowMobileErrors.push(error.message));
  narrowMobilePage.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') narrowMobileErrors.push(`${message.type()}: ${message.text()}`);
  });
  narrowMobilePage.setDefaultTimeout(5000);
  await narrowMobilePage.goto(`${base}/__qa?theme=light`);
  await narrowMobilePage.getByRole('heading', { name: '批注与修改建议' }).waitFor();
  for (const name of ['返回创作', '加粗', '保存草稿', '提交审核']) {
    const button = narrowMobilePage.getByRole('button', { name, exact: true }).last();
    await button.scrollIntoViewIfNeeded();
    const bounds = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const clippedBy: string[] = [];
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const ancestorRect = ancestor.getBoundingClientRect();
        if ((['hidden', 'clip'].includes(style.overflowX) && (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1))
          || (['hidden', 'clip'].includes(style.overflowY) && (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1))) {
          clippedBy.push(`${ancestor.tagName}.${String(ancestor.className)}`);
        }
      }
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight, clippedBy };
    });
    assert.ok(bounds.width > 0 && bounds.height > 0, `${name} has a layout box at 320px: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.x >= -1 && bounds.right <= bounds.viewportWidth + 1, `${name} stays within the 320px viewport: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.y >= -1 && bounds.bottom <= bounds.viewportHeight + 1, `${name} is reachable in the 320px viewport: ${JSON.stringify(bounds)}`);
    assert.deepEqual(bounds.clippedBy, [], `${name} is not clipped at 320px: ${JSON.stringify(bounds)}`);
  }
  assert.ok(await narrowMobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), 'light-theme mobile production editor has no horizontal overflow at 320px');
  assert.deepEqual(narrowMobileErrors, [], '320px mobile production editor should render without browser errors or warnings');
  await narrowMobileContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobileErrors: string[] = [];
  const mobileConsoleProblems: string[] = [];
  const mobilePage = await mobileContext.newPage();
  mobilePage.on('pageerror', (error) => mobileErrors.push(error.message));
  mobilePage.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') mobileConsoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  mobilePage.setDefaultTimeout(5000);
  await mobilePage.goto(`${base}/__qa`);
  await mobilePage.getByRole('heading', { name: '批注与修改建议' }).waitFor();
  const mobileEditor = mobilePage.locator('.ProseMirror').filter({ hasText: '第一段表达更清楚审阅。' }).first();
  try {
    await mobileEditor.waitFor({ state: 'visible' });
  } catch (error) {
    console.error(JSON.stringify({ event: 'mobile-review-fixture-content-mismatch', fixtureContent: content, renderedEditors: await mobilePage.locator('.ProseMirror').allTextContents() }));
    throw error;
  }
  await mobileEditor.click();
  await mobileEditor.press('Home');
  await mobileEditor.press('Shift+ArrowRight');
  await mobileEditor.press('Shift+ArrowRight');
  await mobileEditor.press('Shift+ArrowRight');
  assert.equal(await mobilePage.evaluate(() => window.getSelection()?.toString()), '第一段');
  await mobilePage.getByRole('button', { name: '给选中文字加批注' }).click();
  await mobilePage.getByLabel('批注内容').fill('移动端已可发起批注');
  await mobilePage.getByRole('button', { name: '提交', exact: true }).click();
  await mobilePage.getByText('移动端已可发起批注').waitFor();
  await mobilePage.request.post(`${base}/__qa/fail-next-collaboration-update`);
  await mobileEditor.click();
  await mobileEditor.press('End');
  await mobileEditor.pressSequentially('移动端协作未确认', { delay: 5 });
  const mobileCollaborationAlert = mobilePage.getByRole('alert').filter({ hasText: '协作中间内容暂未确认保存' });
  await mobileCollaborationAlert.waitFor();
  await mobileCollaborationAlert.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  assert.deepEqual(await mobilePage.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth })), { viewport: 390, content: 390 });
  await mobilePage.screenshot({ path: '/tmp/xmt-yjs-persistence-error-mobile-390.png' });
  await mobilePage.getByRole('alert').waitFor({ state: 'hidden', timeout: 5000 });
  assert.deepEqual(await mobilePage.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth })), { viewport: 390, content: 390 });
  await mobilePage.screenshot({ path: '/tmp/xmt-yjs-persistence-mobile-390.png' });
  assert.deepEqual(mobileErrors, []);
  assert.deepEqual(mobileConsoleProblems, []);
  await mobileContext.close();

  const recoveryBlockedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await recoveryBlockedContext.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
  });
  const recoveryBlockedErrors: string[] = [];
  const recoveryBlockedConsoleProblems: string[] = [];
  const recoveryBlockedPage = await recoveryBlockedContext.newPage();
  recoveryBlockedPage.on('pageerror', (error) => recoveryBlockedErrors.push(error.message));
  recoveryBlockedPage.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') recoveryBlockedConsoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  recoveryBlockedPage.setDefaultTimeout(5000);
  await recoveryBlockedPage.goto(`${base}/__qa`);
  await recoveryBlockedPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  await recoveryBlockedPage.getByRole('alert').filter({ hasText: '本机未能恢复尚未确认的协作内容' }).waitFor();
  const recoveryBlockedState = await recoveryBlockedPage.request.get(`${base}/__qa/state`).then((response) => response.json());
  const recoveryBlockedContent = String(recoveryBlockedState.content).replace(/<[^>]*>/g, '').trim();
  const recoveryBlockedEditor = recoveryBlockedPage.locator('.ProseMirror').filter({ hasText: recoveryBlockedContent });
  assert.equal(await recoveryBlockedEditor.getAttribute('contenteditable'), 'false', 'manuscript editor should stay locked if pending local collaboration updates cannot be restored');
  await recoveryBlockedPage.screenshot({ path: '/tmp/xmt-yjs-outbox-restore-blocked.png' });
  assert.deepEqual(recoveryBlockedErrors, []);
  assert.deepEqual(recoveryBlockedConsoleProblems, []);
  await recoveryBlockedContext.close();

  const materialContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const materialPage = await materialContext.newPage();
  const materialErrors: string[] = [];
  materialPage.on('pageerror', (error) => materialErrors.push(error.message));
  materialPage.setDefaultTimeout(10000);
  await materialPage.goto(`${base}/__qa?theme=light`);
  await materialPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  const materialPanel = materialPage.getByTestId('production-resources-panel');
  await materialPanel.getByRole('heading', { name: '创作资料', exact: true }).waitFor();
  const materialEditor = materialPanel.locator('.ProseMirror').first();
  await materialEditor.waitFor({ state: 'visible' });
  await materialPage.request.post(`${base}/__qa/fail-next-material-draft-update`);
  await materialEditor.click();
  await materialEditor.press('End');
  await materialEditor.pressSequentially('资料保存失败重试验收', { delay: 5 });
  await materialPanel.getByText('保存失败', { exact: true }).waitFor();
  const retryMaterialSave = materialPanel.getByRole('button', { name: '重试', exact: true });
  assert.ok((await retryMaterialSave.getAttribute('class'))?.includes('text-studio-cyan-contrast'), 'material draft retry uses the contrast-safe cyan text token');
  assert.ok(await textContrastRatio(retryMaterialSave) >= 4.5, 'light-theme material draft retry text contrast is at least 4.5:1');
  await materialPanel.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await materialPanel.screenshot({ path: '/tmp/xmt-material-draft-retry-light.png' });
  await retryMaterialSave.click();
  await materialPanel.getByText('已保存', { exact: true }).waitFor();
  assert.equal(materialDraftRevision, 1, 'retry should recover the isolated material draft and save once');
  assert.deepEqual(materialErrors, [], 'material draft failure and retry should not cause browser errors');
  await materialContext.close();
  }

  materialDraftContent = '<p>原有资料：保留记录。</p>';
  materialDraftRevision = 7;
  materialDraftWrites.length = 0;
  materialInsertionRequests = 0;
  const manuscriptBeforeMaterialInsert = content;
  const manuscriptWriteCountBeforeMaterialInsert = savedContents.length;
  let releaseMaterialRead = () => {};
  materialDraftReadGate = new Promise<void>((resolve) => { releaseMaterialRead = resolve; });
  const protectedMaterialContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const protectedMaterialPage = await protectedMaterialContext.newPage();
  protectedMaterialPage.setDefaultTimeout(10000);
  const protectedMaterialErrors: string[] = [];
  const protectedMaterialConsoleProblems: string[] = [];
  let expectedMaterialHttpErrors = 0;
  let expectedReducedMotionWarnings = 0;
  protectedMaterialPage.on('pageerror', (error) => protectedMaterialErrors.push(error.message));
  protectedMaterialPage.on('console', (message) => {
    if (message.type() === 'error' && /Failed to load resource.*503/.test(message.text())) expectedMaterialHttpErrors += 1;
    else if (message.type() === 'warning' && message.text().startsWith('You have Reduced Motion enabled on your device.') && message.text().includes('motion.dev/troubleshooting/reduced-motion-disabled')) expectedReducedMotionWarnings += 1;
    else if (message.type() === 'error' || message.type() === 'warning') protectedMaterialConsoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  const initialMaterialRead = protectedMaterialPage.waitForRequest((request) => request.method() === 'GET' && request.url().endsWith(`/api/productions/${productionId}/material-draft`));
  await protectedMaterialPage.goto(`${base}/__qa?theme=light`);
  await protectedMaterialPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  await initialMaterialRead;
  const protectedMaterialPanel = protectedMaterialPage.getByTestId('production-resources-panel');
  const addMaterialButton = protectedMaterialPanel.getByRole('button', { name: '添加资料', exact: true });
  await protectedMaterialPanel.getByText('正在读取…', { exact: true }).waitFor();
  assert.equal(await addMaterialButton.isDisabled(), true, 'resource insertion stays unavailable before the existing draft has loaded');
  assert.equal(await protectedMaterialPanel.locator('.ProseMirror').count(), 0, 'the material editor is not mounted with an unconfirmed blank baseline');
  assert.equal(materialInsertionRequests, 0);
  assert.equal(materialDraftWrites.length, 0);
  await protectedMaterialPanel.screenshot({ path: '/tmp/xmt-material-draft-read-pending.png' });
  releaseMaterialRead();
  await protectedMaterialPanel.getByText('已保存', { exact: true }).waitFor();
  const protectedMaterialEditor = protectedMaterialPanel.locator('.ProseMirror').first();
  assert.match(await protectedMaterialEditor.innerText(), /原有资料：保留记录/);
  assert.equal(await addMaterialButton.isEnabled(), true, 'adding is enabled only after both the stored draft and editor command handle are ready');

  failNextMaterialDraftRead = true;
  await protectedMaterialPage.reload();
  await protectedMaterialPanel.getByRole('heading', { name: '加载失败', exact: true }).waitFor();
  assert.equal(await addMaterialButton.isDisabled(), true, 'a failed initial read cannot turn an existing draft into a blank writable draft');
  assert.equal(materialInsertionRequests, 0);
  assert.equal(materialDraftWrites.length, 0);
  assert.equal(materialDraftContent, '<p>原有资料：保留记录。</p>');
  await protectedMaterialPanel.getByRole('button', { name: '重试', exact: true }).click();
  await protectedMaterialPanel.getByText('已保存', { exact: true }).waitFor();
  assert.match(await protectedMaterialEditor.innerText(), /原有资料：保留记录/);

  await addMaterialButton.click();
  const materialPicker = protectedMaterialPage.getByRole('dialog', { name: '添加资料', exact: true });
  const materialSearch = materialPicker.getByPlaceholder('搜索资料标题或正文');
  await materialSearch.fill('隔离参考资料');
  await materialPicker.getByRole('button', { name: '搜索', exact: true }).click();
  const pickedMaterial = materialPicker.getByRole('button', { name: /隔离参考资料/ });
  await pickedMaterial.click();
  let releaseMaterialInsertion = () => {};
  materialInsertionGate = new Promise<void>((resolve) => { releaseMaterialInsertion = resolve; });
  const addToDraft = materialPicker.getByRole('button', { name: '加入资料草稿（1）', exact: true });
  const materialInsertionRead = protectedMaterialPage.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith(`/api/productions/${productionId}/material-draft/resources`));
  await addToDraft.dblclick();
  await materialInsertionRead;
  await materialPicker.getByRole('status').filter({ hasText: '正在插入资料' }).waitFor();
  assert.equal(materialInsertionRequests, 1, 'a rapid repeat can start only one source request and one insertion');
  assert.equal(await materialSearch.isDisabled(), true);
  assert.equal(await materialPicker.getByRole('button', { name: '搜索', exact: true }).isDisabled(), true);
  assert.equal(await pickedMaterial.isDisabled(), true);
  assert.equal(await materialPicker.getByRole('button', { name: '取消', exact: true }).isDisabled(), true);
  assert.equal(await materialPicker.getByRole('button', { name: '关闭弹窗', exact: true }).count(), 0);
  await protectedMaterialPage.keyboard.press('Escape');
  await materialPicker.click({ position: { x: 2, y: 2 } });
  assert.equal(await materialPicker.isVisible(), true, 'Escape and overlay clicks preserve the insertion in progress');
  assert.equal(materialDraftWrites.length, 0, 'fetching the source never replaces the existing draft before insertion');
  await protectedMaterialPage.setViewportSize({ width: 390, height: 844 });
  await materialPicker.screenshot({ path: '/tmp/xmt-material-insertion-in-flight-390.png' });
  const confirmedMaterialSave = protectedMaterialPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/productions/${productionId}/material-draft`) && response.status() === 200);
  releaseMaterialInsertion();
  await materialPicker.waitFor({ state: 'hidden' });
  await confirmedMaterialSave;
  await protectedMaterialPanel.getByText('已保存', { exact: true }).waitFor();
  assert.equal(materialDraftWrites.length, 1, 'the inserted draft saves once with the loaded revision');
  assert.match(materialDraftContent, /原有资料：保留记录/);
  assert.equal(materialDraftContent.split('资料引用单次插入验收。').length - 1, 1, 'the selected source is copied once');
  assert.equal(content, manuscriptBeforeMaterialInsert, 'adding to materials preserves the separate manuscript');
  assert.equal(savedContents.length, manuscriptWriteCountBeforeMaterialInsert, 'material additions do not write the manuscript');

  const draftBeforeReference = materialDraftContent;
  await protectedMaterialPage.setViewportSize({ width: 1440, height: 900 });
  await addMaterialButton.click();
  await pickedMaterial.click();
  failNextMaterialInsertion = true;
  let releaseFailedReference = () => {};
  materialInsertionGate = new Promise<void>((resolve) => { releaseFailedReference = resolve; });
  const failedReferenceRequest = protectedMaterialPage.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith(`/api/productions/${productionId}/material-draft/resources`));
  const failedReferenceRead = protectedMaterialPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/productions/${productionId}/material-draft/resources`) && response.status() === 503);
  const referenceToManuscript = materialPicker.getByRole('button', { name: '引用到正文', exact: true });
  await referenceToManuscript.dblclick();
  await failedReferenceRequest;
  await materialPicker.getByRole('status').filter({ hasText: '正在插入资料' }).waitFor();
  assert.equal(materialInsertionRequests, 2);
  releaseFailedReference();
  await failedReferenceRead;
  await protectedMaterialPage.getByText('隔离测试模拟资料插入读取失败，请重试', { exact: true }).waitFor();
  assert.equal(await materialPicker.isVisible(), true, 'a failed reference retains its picker and selected source for an explicit retry');
  assert.equal(await referenceToManuscript.isEnabled(), true);
  assert.equal(materialInsertionRequests, 2);
  assert.equal(materialDraftContent, draftBeforeReference);
  assert.equal(content, manuscriptBeforeMaterialInsert);
  await materialPicker.screenshot({ path: '/tmp/xmt-material-reference-failure-preserved.png' });
  const referenceSaved = protectedMaterialPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 200);
  await referenceToManuscript.dblclick();
  await materialPicker.waitFor({ state: 'hidden' });
  await referenceSaved;
  assert.equal(materialInsertionRequests, 3, 'the failed request and explicit retry each run once');
  assert.equal(content.split('资料引用单次插入验收。').length - 1, 1, 'explicit reference retry inserts the source into the manuscript once');
  assert.equal(materialDraftContent, draftBeforeReference, 'referencing the manuscript leaves the independent material draft intact');
  assert.equal(materialDraftWrites.length, 1);
  assert.deepEqual(protectedMaterialErrors, []);
  assert.deepEqual(protectedMaterialConsoleProblems, []);
  assert.equal(expectedMaterialHttpErrors, 2, 'only the injected initial-read and reference-read failures are expected');
  assert.equal(await protectedMaterialPage.locator('vite-error-overlay').count(), 0);
  await protectedMaterialContext.close();

  await context.close();
  console.log(`${process.env.XMT_MATERIAL_PROTECTION_QA_ONLY === '1' ? 'Material protection' : 'Production review'} browser test passed: materials require a confirmed draft and ready editor, preserve content through read/reference failures, and insert once with protected in-flight controls; expected reduced-motion notices: ${expectedReducedMotionWarnings}.`);
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
