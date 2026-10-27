import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Locator, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const admin = { id: 971, username: 'template-qa', role: 'admin', name: '模板页面验收', enabled: true, force_change_password: false };
type QaTemplate = { id: number; name: string; platform: string; description: string; template_data: string; is_default: boolean; creator_name: string; base_fingerprint: string };
const initialTemplate: QaTemplate = { id: 1, name: '通用工作选题', platform: '', description: '用于隔离验收', template_data: '背景：\n目标：\n', is_default: false, creator_name: '测试成员', base_fingerprint: '1'.padStart(64, '0') };
let templates: QaTemplate[] = [structuredClone(initialTemplate)];
let nextId = 2;
let failTemplateReads = 0;
let failNextTemplateWrite = false;
let templateCreateAttempts = 0;
let templateUpdateAttempts = 0;
let templateDeleteAttempts = 0;
let loseNextTemplateCreateResponse = false;
let loseNextTemplateDeleteResponse = false;
let conflictNextTemplateUpdate = false;
let failNextTemplateStatus = 0;
let templateFingerprintSequence = 2;
const templateReceipts = new Map<string, { actorId: number; operation: string; targetId: number; fingerprint: string }>();
const templateMutationBodies: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
let delayNextTemplateWrite = false;
let releaseTemplateWrite: (() => void) | null = null;
let holdNextTemplateRead = false;
let releaseHeldTemplateRead: (() => void) | null = null;

function nextTemplateFingerprint() {
  return String(templateFingerprintSequence++).padStart(64, '0');
}

function recordTemplateMutation(req: express.Request) {
  templateMutationBodies.push({ method: req.method, path: req.path, body: structuredClone(req.body || {}) });
}

function resetTemplateFixture() {
  templates = [structuredClone(initialTemplate)];
  nextId = 2;
  failTemplateReads = 0;
  failNextTemplateWrite = false;
  templateCreateAttempts = 0;
  templateUpdateAttempts = 0;
  templateDeleteAttempts = 0;
  loseNextTemplateCreateResponse = false;
  loseNextTemplateDeleteResponse = false;
  conflictNextTemplateUpdate = false;
  failNextTemplateStatus = 0;
  templateFingerprintSequence = 2;
  templateReceipts.clear();
  templateMutationBodies.length = 0;
  delayNextTemplateWrite = false;
  releaseTemplateWrite?.();
  releaseTemplateWrite = null;
  holdNextTemplateRead = false;
  releaseHeldTemplateRead?.();
  releaseHeldTemplateRead = null;
}

function waitForTemplateWriteIfRequested() {
  if (!delayNextTemplateWrite) return Promise.resolve();
  delayNextTemplateWrite = false;
  return new Promise<void>((resolve) => { releaseTemplateWrite = resolve; });
}

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  if (req.query.resetTemplates === '1') resetTemplateFixture();
  if (req.query.holdInitialRead === '1') holdNextTemplateRead = true;
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(admin))});localStorage.setItem('xmt_token','template-qa-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});if(${req.query.resetTemplates === '1'}){for(const storage of [localStorage,sessionStorage]){storage.removeItem('xmt:topic-template-mutation:pending:actor:971');storage.removeItem('xmt:topic-template-mutation:pending:actor:971:rejected')}}location.replace('/templates');</script>`);
});
app.post('/__qa/fail-next-template-read', (_req, res) => { failTemplateReads += 1; res.json({ ok: true }); });
app.post('/__qa/fail-next-template-write', (_req, res) => { failNextTemplateWrite = true; res.json({ ok: true }); });
app.post('/__qa/lose-next-template-create-response', (_req, res) => { loseNextTemplateCreateResponse = true; res.json({ ok: true }); });
app.post('/__qa/lose-next-template-delete-response', (_req, res) => { loseNextTemplateDeleteResponse = true; res.json({ ok: true }); });
app.post('/__qa/conflict-next-template-update', (_req, res) => { conflictNextTemplateUpdate = true; res.json({ ok: true }); });
app.post('/__qa/fail-next-template-status', (_req, res) => { failNextTemplateStatus += 1; res.json({ ok: true }); });
app.post('/__qa/reset-template-fixture', (_req, res) => { resetTemplateFixture(); res.json({ ok: true }); });
app.get('/__qa/template-mutation-bodies', (_req, res) => res.json({ data: templateMutationBodies }));
app.get('/__qa/template-counts', (_req, res) => res.json({ create: templateCreateAttempts, update: templateUpdateAttempts, delete: templateDeleteAttempts }));
app.post('/__qa/delay-next-template-write', (_req, res) => { delayNextTemplateWrite = true; res.json({ ok: true }); });
app.post('/__qa/release-template-write', (_req, res) => {
  const release = releaseTemplateWrite;
  releaseTemplateWrite = null;
  release?.();
  res.json({ released: Boolean(release) });
});
app.post('/__qa/release-held-template-read', (_req, res) => {
  const release = releaseHeldTemplateRead;
  releaseHeldTemplateRead = null;
  release?.();
  res.json({ released: Boolean(release) });
});
app.get('/api/auth/me', (_req, res) => res.json(admin));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({
  version,
  system: { defaultTheme: 'dark', browserTitle: '岚曜传媒协作管理系统' },
}));
app.get('/api/templates', async (_req, res) => {
  if (failTemplateReads > 0) {
    failTemplateReads -= 1;
    return res.status(503).json({ message: '隔离夹具模拟列表读取失败' });
  }
  const snapshot = structuredClone(templates);
  if (holdNextTemplateRead) {
    holdNextTemplateRead = false;
    await new Promise<void>((resolve) => { releaseHeldTemplateRead = resolve; });
  }
  return res.json({ success: true, data: snapshot });
});
app.get('/api/templates/requests/:requestId', (req, res) => {
  if (failNextTemplateStatus > 0) {
    failNextTemplateStatus -= 1;
    return res.status(503).json({ message: '隔离夹具模拟核实失败' });
  }
  const requestId = req.params.requestId.toLowerCase();
  const operation = String(req.query.operation || '');
  const fingerprint = String(req.query.request_fingerprint || '');
  const targetId = req.query.target_id === undefined ? null : Number(req.query.target_id);
  const receipt = templateReceipts.get(requestId);
  if (receipt) {
    const matches = receipt.actorId === admin.id && receipt.operation === operation
      && receipt.fingerprint === fingerprint && (operation === 'create' || receipt.targetId === targetId);
    return res.json({ data: matches ? { state: 'processed', ...(operation === 'create' ? { target_id: receipt.targetId } : {}) } : { state: 'conflict' } });
  }
  if (operation !== 'create' && !templates.some((template) => template.id === targetId)) {
    return res.json({ data: { state: 'target_missing' } });
  }
  return res.json({ data: { state: 'not_found' } });
});
app.post('/api/templates', (req, res) => {
  templateCreateAttempts += 1;
  recordTemplateMutation(req);
  if (failNextTemplateWrite) {
    failNextTemplateWrite = false;
    return res.status(503).json({ message: '隔离夹具模拟保存失败' });
  }
  const { client_request_id, request_fingerprint, ...payload } = req.body;
  const created = { id: nextId++, ...payload, is_default: Boolean(payload.is_default), creator_name: admin.name, base_fingerprint: nextTemplateFingerprint() } as QaTemplate;
  templates = [...templates, created];
  if (typeof client_request_id === 'string' && typeof request_fingerprint === 'string') {
    templateReceipts.set(client_request_id, { actorId: admin.id, operation: 'create', targetId: created.id, fingerprint: request_fingerprint });
  }
  if (loseNextTemplateCreateResponse) {
    loseNextTemplateCreateResponse = false;
    return res.socket?.destroy();
  }
  void waitForTemplateWriteIfRequested().then(() => res.status(201).json({ success: true, data: created, id: created.id }));
});
app.put('/api/templates/:id', (req, res) => {
  templateUpdateAttempts += 1;
  recordTemplateMutation(req);
  const current = templates.find((template) => template.id === Number(req.params.id));
  if (conflictNextTemplateUpdate && current) {
    conflictNextTemplateUpdate = false;
    templates = templates.map((template) => template.id === current.id
      ? { ...template, name: '外部新版本', base_fingerprint: nextTemplateFingerprint() }
      : template);
    return res.status(409).json({ code: 'TOPIC_TEMPLATE_UPDATE_BASE_CONFLICT', message: '隔离夹具模拟版本冲突' });
  }
  if (failNextTemplateWrite) {
    failNextTemplateWrite = false;
    return res.status(503).json({ message: '隔离夹具模拟保存失败' });
  }
  const { client_request_id, request_fingerprint, base_fingerprint, ...payload } = req.body;
  if (!current || current.base_fingerprint !== base_fingerprint) {
    return res.status(409).json({ code: 'TOPIC_TEMPLATE_UPDATE_BASE_CONFLICT', message: '隔离夹具模拟版本冲突' });
  }
  templates = templates.map((template) => template.id === Number(req.params.id) ? { ...template, ...payload, base_fingerprint: nextTemplateFingerprint() } : template);
  if (typeof client_request_id === 'string' && typeof request_fingerprint === 'string') {
    templateReceipts.set(client_request_id, { actorId: admin.id, operation: 'update', targetId: Number(req.params.id), fingerprint: request_fingerprint });
  }
  void waitForTemplateWriteIfRequested().then(() => res.json({ success: true }));
});
app.delete('/api/templates/:id', (req, res) => {
  templateDeleteAttempts += 1;
  recordTemplateMutation(req);
  const target = templates.find((template) => template.id === Number(req.params.id));
  if (!target) return res.status(404).json({ message: '模板不存在', code: 'TOPIC_TEMPLATE_MUTATION_TARGET_MISSING' });
  if (target.base_fingerprint !== req.body?.base_fingerprint) {
    return res.status(409).json({ code: 'TOPIC_TEMPLATE_DELETE_BASE_CONFLICT', message: '隔离夹具模拟版本冲突' });
  }
  templates = templates.filter((template) => template.id !== Number(req.params.id));
  if (typeof req.body?.client_request_id === 'string' && typeof req.body?.request_fingerprint === 'string') {
    templateReceipts.set(req.body.client_request_id, { actorId: admin.id, operation: 'delete', targetId: Number(req.params.id), fingerprint: req.body.request_fingerprint });
  }
  if (loseNextTemplateDeleteResponse) {
    loseNextTemplateDeleteResponse = false;
    return res.socket?.destroy();
  }
  res.json({ success: true });
});
app.use('/api', (_req, res) => res.json({ success: true, data: {} }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
const inspectionPort = Number(process.env.XMT_BROWSER_MCP_PORT) || 0;
await new Promise<void>((resolve) => server.listen(inspectionPort, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_TEMPLATE_MANAGEMENT_QA_SERVE === '1') {
  console.log(`Isolated template management browser fixture: ${base}/__qa`);
  await new Promise<void>(() => {});
}

const browser = await chromium.launch({ headless: true });
const unexpectedErrors: string[] = [];

function rgb(raw: string) {
  const values = raw.match(/[\d.]+/g)?.map(Number) || [];
  if (values.length < 3) return null;
  return { values: values.slice(0, 3), alpha: values.length >= 4 ? values[3] : 1 };
}

function luminance(values: number[]) {
  const channels = values.map((value) => value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

async function contrastRatio(locator: Locator) {
  const colors = await locator.evaluate((element) => {
    const layers: string[] = [];
    let opacity = 1;
    for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity || 1);
      layers.push(style.backgroundColor);
    }
    return { foreground: getComputedStyle(element).color, layers, opacity };
  });
  const foreground = rgb(colors.foreground);
  if (!foreground) return 0;
  let background = [255, 255, 255];
  for (const layer of colors.layers.reverse()) {
    const parsed = rgb(layer);
    if (parsed && parsed.alpha > 0) background = parsed.values.map((channel, index) => channel * parsed.alpha + background[index] * (1 - parsed.alpha));
  }
  const visibleForeground = foreground.values.map((channel, index) => channel * colors.opacity + background[index] * (1 - colors.opacity));
  const textLum = luminance(visibleForeground);
  const surfaceLum = luminance(background);
  return (Math.max(textLum, surfaceLum) + 0.05) / (Math.min(textLum, surfaceLum) + 0.05);
}

async function assertReadable(page: Page, label: string, locator: Locator) {
  await locator.waitFor({ state: 'visible' });
  const ratio = await contrastRatio(locator);
  assert.ok(ratio >= 4.5, `${label} contrast should be >= 4.5:1; got ${ratio.toFixed(2)}:1`);
}

function observeErrors(page: Page, expected503: { count: number }, expectedDroppedResponse = { count: 0 }, expected409 = { count: 0 }) {
  page.on('pageerror', (error) => unexpectedErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expected503.count > 0 && message.text().includes('503')) { expected503.count -= 1; return; }
    if (expected409.count > 0 && message.text().includes('409')) { expected409.count -= 1; return; }
    if (expectedDroppedResponse.count > 0 && /ERR_EMPTY_RESPONSE|net::ERR_FAILED/.test(message.text())) { expectedDroppedResponse.count -= 1; return; }
    unexpectedErrors.push(message.text());
  });
}

async function assertPageReady(page: Page, viewportWidth: number) {
  assert.match(page.url(), /\/templates$/);
  assert.equal(await page.title(), '岚曜传媒协作管理系统');
  await page.getByRole('heading', { name: '选题模板', exact: true }).waitFor();
  await page.getByRole('heading', { name: '已有模板', exact: true }).waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(), 0, 'there is no Vite error overlay');
  const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth, viewport: window.innerWidth }));
  assert.equal(widths.viewport, viewportWidth);
  assert.ok(widths.document <= viewportWidth && widths.body <= viewportWidth, `page must not overflow horizontally: ${JSON.stringify(widths)}`);
}

try {
  const expected503 = { count: 0 };
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  observeErrors(desktop, expected503);
  await desktop.goto(`${base}/__qa?theme=dark`);
  await assertPageReady(desktop, 1440);
  await desktop.getByText('通用工作选题', { exact: true }).waitFor();
  await assertReadable(desktop, 'page title', desktop.getByRole('heading', { name: '选题模板', exact: true }));
  await assertReadable(desktop, 'page description', desktop.getByText('管理团队可复用的选题内容结构。', { exact: true }));
  await assertReadable(desktop, 'template metadata', desktop.getByText('通用 · 测试成员', { exact: true }));
  await desktop.screenshot({ path: '/tmp/xmt-template-management-1440-dark.png', fullPage: false });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  observeErrors(mobile, expected503);
  await mobile.goto(`${base}/__qa?theme=light`);
  await assertPageReady(mobile, 390);
  await assertReadable(mobile, 'form label', mobile.getByText('模板正文', { exact: true }));
  await assertReadable(mobile, 'template metadata', mobile.getByText('通用 · 测试成员', { exact: true }));

  const createName = '隔离浏览器新建模板';
  await mobile.getByLabel('名称').fill(createName);
  await mobile.getByLabel('平台').fill('视频号');
  await mobile.getByLabel('说明').fill('只写入本地夹具');
  await mobile.getByLabel('模板正文').fill('内容背景：\n传播目标：\n');
  await mobile.evaluate(async () => { await fetch('/__qa/fail-next-template-write', { method: 'POST' }); });
  expected503.count = 1;
  const failedCreate = mobile.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'POST' && response.status() === 503);
  await mobile.getByRole('button', { name: '保存模板', exact: true }).dblclick({ delay: 10 });
  await failedCreate;
  await mobile.getByTestId('template-mutation-recovery').filter({ hasText: '服务端尚未找到这次创建记录' }).waitFor();
  assert.equal(await mobile.getByLabel('名称').inputValue(), createName, 'a rejected save keeps the name for retry');
  assert.equal(await mobile.getByLabel('平台').inputValue(), '视频号', 'a rejected save keeps the platform for retry');
  assert.equal(await mobile.getByLabel('说明').inputValue(), '只写入本地夹具', 'a rejected save keeps the description for retry');
  assert.equal(await mobile.getByLabel('模板正文').inputValue(), '内容背景：\n传播目标：\n', 'a rejected save keeps the body for retry');
  assert.equal(templateCreateAttempts, 1, 'a rapid double click produces only one rejected create request');
  const originalCreateBody = await mobile.evaluate(async () => (await (await fetch('/__qa/template-mutation-bodies')).json()).data.at(-1).body);
  const confirmedCreate = mobile.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'POST' && response.status() === 201);
  await mobile.getByRole('button', { name: '使用原请求重试', exact: true }).click();
  await confirmedCreate;
  const retriedCreateBody = await mobile.evaluate(async () => (await (await fetch('/__qa/template-mutation-bodies')).json()).data.at(-1).body);
  assert.equal(retriedCreateBody.client_request_id, originalCreateBody.client_request_id, 'a not_found create retry uses the same request UUID');
  assert.equal(retriedCreateBody.request_fingerprint, originalCreateBody.request_fingerprint, 'a not_found create retry uses the same fingerprint');
  assert.deepEqual(Object.fromEntries(Object.entries(retriedCreateBody).filter(([key]) => !['client_request_id', 'request_fingerprint'].includes(key))), Object.fromEntries(Object.entries(originalCreateBody).filter(([key]) => !['client_request_id', 'request_fingerprint'].includes(key))), 'a not_found create retry preserves the normalized payload');

  await mobile.evaluate(async () => { await fetch('/__qa/fail-next-template-read', { method: 'POST' }); });
  await mobile.evaluate(async () => { await fetch('/__qa/delay-next-template-write', { method: 'POST' }); });
  expected503.count = 1;
  const createStarted = mobile.waitForRequest((request) => request.url().endsWith('/api/templates') && request.method() === 'POST');
  const failedRefresh = mobile.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'GET' && response.status() === 503);
  await mobile.getByRole('button', { name: '保存模板', exact: true }).dblclick({ delay: 10 });
  await createStarted;
  await mobile.getByRole('status').filter({ hasText: '正在创建模板' }).waitFor();
  for (const label of ['名称', '平台', '说明', '模板正文']) {
    assert.equal(await mobile.getByLabel(label).isDisabled(), true, `${label} stays locked until the create is confirmed`);
  }
  await mobile.evaluate(async () => { await fetch('/__qa/release-template-write', { method: 'POST' }); });
  await failedRefresh;
  await mobile.getByRole('status').filter({ hasText: '服务端已确认模板保存，但列表刷新失败' }).waitFor();
  assert.equal(templateCreateAttempts, 3, 'the rejected request, explicit same-key retry, and next create each send once');
  assert.equal(await mobile.getByLabel('名称').inputValue(), '', 'confirmed save closes and clears the form');
  await assertReadable(mobile, 'confirmed-save warning', mobile.getByRole('status').filter({ hasText: '服务端已确认模板保存，但列表刷新失败' }));
  await mobile.screenshot({ path: '/tmp/xmt-template-management-390-light-refresh-warning.png', fullPage: false });

  const retry = mobile.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'GET' && response.status() === 200);
  await mobile.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await retry;
  await mobile.getByText(createName, { exact: true }).waitFor();
  await mobile.getByRole('status').filter({ hasText: '模板列表已重新加载' }).waitFor();
  assert.equal(templateCreateAttempts, 3, 'recovery performs only a GET and does not repeat the confirmed save');

  const createdTemplate = mobile.locator('li').filter({ hasText: createName });
  await createdTemplate.getByRole('button', { name: '编辑', exact: true }).click();
  await mobile.getByLabel('名称').fill('隔离浏览器更新模板');
  await mobile.getByLabel('模板正文').fill('更新后的正文，仅保留在隔离夹具。');
  await mobile.evaluate(async () => { await fetch('/__qa/delay-next-template-write', { method: 'POST' }); });
  const updateStarted = mobile.waitForRequest((request) => request.url().endsWith('/api/templates/2') && request.method() === 'PUT');
  const updateConfirmed = mobile.waitForResponse((response) => response.url().endsWith('/api/templates/2') && response.request().method() === 'PUT' && response.status() === 200);
  await mobile.getByRole('button', { name: '保存模板', exact: true }).click();
  await updateStarted;
  await mobile.getByRole('status').filter({ hasText: '正在保存模板' }).waitFor();
  for (const label of ['名称', '平台', '说明', '模板正文']) {
    assert.equal(await mobile.getByLabel(label).isDisabled(), true, `${label} stays locked until the update is confirmed`);
  }
  assert.equal(await mobile.getByRole('button', { name: '取消编辑', exact: true }).isDisabled(), true, 'edit cannot be canceled while the update is in flight');
  await mobile.evaluate(async () => { await fetch('/__qa/release-template-write', { method: 'POST' }); });
  await updateConfirmed;
  await mobile.getByText('隔离浏览器更新模板', { exact: true }).waitFor();
  await mobile.getByRole('status').filter({ hasText: '模板已保存' }).waitFor();
  assert.equal(templateCreateAttempts, 3, 'updating a template does not create another record');
  await mobile.screenshot({ path: '/tmp/xmt-template-management-390-light-recovered.png', fullPage: false });
  await mobile.close();

  const compact = await browser.newPage({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
  observeErrors(compact, expected503);
  await compact.goto(`${base}/__qa?theme=dark`);
  await assertPageReady(compact, 320);
  await assertReadable(compact, 'compact template metadata', compact.getByText('通用 · 测试成员', { exact: true }));
  await compact.getByLabel('名称').waitFor();
  await compact.screenshot({ path: '/tmp/xmt-template-management-320-dark.png', fullPage: false });
  await compact.getByLabel('名称').fill('移动表单校验');
  const compactSave = compact.getByRole('button', { name: '保存模板', exact: true });
  await compactSave.scrollIntoViewIfNeeded();
  await compactSave.click();
  assert.equal(
    await compact.getByLabel('模板正文').evaluate((element) => element === document.activeElement),
    true,
    'the compact-page save action reaches the native required-field validation',
  );
  assert.equal(templateCreateAttempts, 3, 'compact validation does not write a partial template');

  const initialRead = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  observeErrors(initialRead, expected503);
  const createAttemptsBeforeHeldRead = templateCreateAttempts;
  await initialRead.goto(`${base}/__qa?theme=light&holdInitialRead=1`);
  await assertPageReady(initialRead, 390);
  await initialRead.getByText('正在加载模板…', { exact: true }).waitFor();
  assert.equal(await initialRead.getByLabel('名称').isDisabled(), true, 'form fields stay disabled while the initial list read is pending');
  assert.equal(await initialRead.getByRole('button', { name: '保存模板', exact: true }).isDisabled(), true, 'template creation stays disabled while the initial list read is pending');
  await initialRead.locator('form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(templateCreateAttempts, createAttemptsBeforeHeldRead, 'submitting programmatically during the initial read does not issue a POST');

  await initialRead.evaluate(async () => { await fetch('/__qa/release-held-template-read', { method: 'POST' }); });
  await initialRead.getByText('通用工作选题', { exact: true }).waitFor();
  assert.equal(await initialRead.getByLabel('名称').isDisabled(), false, 'form fields unlock only after the initial list read resolves');
  const initialReadCreateName = '初始读取完成后创建的模板';
  await initialRead.getByLabel('名称').fill(initialReadCreateName);
  await initialRead.getByLabel('模板正文').fill('隔离回归：首次读取完成后才允许提交。');
  const confirmedInitialReadCreate = initialRead.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'POST' && response.status() === 201);
  const refreshedInitialReadList = initialRead.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'GET' && response.status() === 200);
  await initialRead.getByRole('button', { name: '保存模板', exact: true }).click();
  await Promise.all([confirmedInitialReadCreate, refreshedInitialReadList]);
  await initialRead.getByText(initialReadCreateName, { exact: true }).waitFor();
  await initialRead.getByRole('status').filter({ hasText: '模板已保存' }).waitFor();
  assert.equal(templateCreateAttempts, createAttemptsBeforeHeldRead + 1, 'one confirmed create follows the resolved initial read');
  assert.equal(templates.filter((template) => template.name === initialReadCreateName).length, 1, 'the confirmed row remains in the isolated template list');
  await initialRead.close();

  const recoveryPage = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const expectedDroppedResponse = { count: 0 };
  const expected409 = { count: 0 };
  observeErrors(recoveryPage, expected503, expectedDroppedResponse, expected409);
  assert.equal(expected503.count, 0, 'the earlier injected 503 responses were observed');

  await recoveryPage.goto(`${base}/__qa?theme=light&resetTemplates=1`);
  await assertPageReady(recoveryPage, 1280);
  await recoveryPage.getByText('通用工作选题', { exact: true }).waitFor();
  expected503.count = 1;
  expectedDroppedResponse.count += 1;
  await recoveryPage.evaluate(async () => {
    await fetch('/__qa/lose-next-template-create-response', { method: 'POST' });
    await fetch('/__qa/fail-next-template-status', { method: 'POST' });
  });
  const lostCreateName = '响应丢失后恢复的模板';
  await recoveryPage.getByLabel('名称').fill(lostCreateName);
  await recoveryPage.getByLabel('模板正文').fill('只存在隔离内存夹具中的模板正文。');
  const lostCreateRequest = recoveryPage.waitForRequest((request) => request.url().endsWith('/api/templates') && request.method() === 'POST');
  await recoveryPage.getByRole('button', { name: '保存模板', exact: true }).click();
  await lostCreateRequest;
  await recoveryPage.getByTestId('template-mutation-recovery').filter({ hasText: '暂时无法核实' }).waitFor();
  const lostCreateSnapshot = await recoveryPage.evaluate(async () => {
    const response = await fetch('/__qa/template-mutation-bodies');
    return (await response.json()).data.at(-1).body;
  });
  assert.equal(typeof lostCreateSnapshot.client_request_id, 'string');
  const pendingMarkerBeforeReload = await recoveryPage.evaluate(() => sessionStorage.getItem('xmt:topic-template-mutation:pending:actor:971'));
  assert.ok(pendingMarkerBeforeReload, 'the original request marker is persisted before the write');
  assert.equal(expected503.count, 0, 'the injected status-read 503 was observed');
  assert.equal(expectedDroppedResponse.count, 0, 'the committed create response was dropped by the isolated fixture');
  await recoveryPage.reload();
  await recoveryPage.getByText(lostCreateName, { exact: true }).waitFor();
  await recoveryPage.getByRole('status').filter({ hasText: '模板已创建' }).waitFor();
  const lostCreateCounts = await recoveryPage.evaluate(async () => (await (await fetch('/__qa/template-counts')).json()));
  assert.equal(lostCreateCounts.create, 1, 'reload recovery confirms the committed response-lost create without repeating POST');
  const pendingMarkerAfterReload = await recoveryPage.evaluate(() => ({
    session: sessionStorage.getItem('xmt:topic-template-mutation:pending:actor:971'),
    local: localStorage.getItem('xmt:topic-template-mutation:pending:actor:971'),
  }));
  assert.deepEqual(pendingMarkerAfterReload, { session: null, local: null }, 'confirmed recovery clears its marker in both browser stores');

  await recoveryPage.goto(`${base}/__qa?theme=light&resetTemplates=1`);
  await recoveryPage.getByText('通用工作选题', { exact: true }).waitFor();
  await recoveryPage.locator('li').filter({ hasText: '通用工作选题' }).getByRole('button', { name: '编辑', exact: true }).click();
  await recoveryPage.getByLabel('名称').fill('明确重试后的模板名称');
  await recoveryPage.getByLabel('模板正文').fill('原请求载荷在刷新前后不变。');
  await recoveryPage.evaluate(async () => { await fetch('/__qa/fail-next-template-write', { method: 'POST' }); });
  expected503.count = 1;
  const firstUpdateResponse = recoveryPage.waitForResponse((response) => response.url().endsWith('/api/templates/1') && response.request().method() === 'PUT' && response.status() === 503);
  await recoveryPage.getByRole('button', { name: '保存模板', exact: true }).click();
  await firstUpdateResponse;
  await recoveryPage.getByTestId('template-mutation-recovery').filter({ hasText: '服务端尚未找到这次操作记录' }).waitFor();
  const updateBodiesBeforeRetry = await recoveryPage.evaluate(async () => (await (await fetch('/__qa/template-mutation-bodies')).json()).data.filter((entry: { method: string }) => entry.method === 'PUT').map((entry: { body: Record<string, unknown> }) => entry.body));
  assert.equal(updateBodiesBeforeRetry.length, 1);
  const retriedUpdate = recoveryPage.waitForResponse((response) => response.url().endsWith('/api/templates/1') && response.request().method() === 'PUT' && response.status() === 200);
  await recoveryPage.getByRole('button', { name: '使用原请求重试', exact: true }).click();
  await retriedUpdate;
  const updateBodiesAfterRetry = await recoveryPage.evaluate(async () => (await (await fetch('/__qa/template-mutation-bodies')).json()).data.filter((entry: { method: string }) => entry.method === 'PUT').map((entry: { body: Record<string, unknown> }) => entry.body));
  assert.equal(updateBodiesAfterRetry.length, 2);
  assert.equal(updateBodiesAfterRetry[1].client_request_id, updateBodiesBeforeRetry[0].client_request_id, 'explicit update retry reuses the original UUID');
  assert.deepEqual(updateBodiesAfterRetry[1], updateBodiesBeforeRetry[0], 'explicit update retry reuses the exact fingerprint, base, and payload');
  await recoveryPage.getByText('明确重试后的模板名称', { exact: true }).waitFor();

  await recoveryPage.goto(`${base}/__qa?theme=light&resetTemplates=1`);
  await recoveryPage.getByText('通用工作选题', { exact: true }).waitFor();
  await recoveryPage.locator('li').filter({ hasText: '通用工作选题' }).getByRole('button', { name: '编辑', exact: true }).click();
  await recoveryPage.getByLabel('名称').fill('保留的本地编辑草稿');
  await recoveryPage.getByLabel('模板正文').fill('发生冲突时不覆盖服务端新版本。');
  await recoveryPage.evaluate(async () => { await fetch('/__qa/conflict-next-template-update', { method: 'POST' }); });
  expected409.count = 1;
  const conflictResponse = recoveryPage.waitForResponse((response) => response.url().endsWith('/api/templates/1') && response.request().method() === 'PUT' && response.status() === 409);
  await recoveryPage.getByRole('button', { name: '保存模板', exact: true }).click();
  await conflictResponse;
  assert.equal(expected409.count, 0, 'the expected CAS 409 was observed');
  await recoveryPage.getByText('外部新版本', { exact: true }).waitFor();
  await recoveryPage.getByRole('alert').filter({ hasText: '本次没有覆盖新版本' }).waitFor();
  assert.equal(await recoveryPage.getByLabel('名称').inputValue(), '保留的本地编辑草稿', 'a baseline conflict preserves the user\'s unsaved form');
  assert.equal(await recoveryPage.getByRole('button', { name: '保存模板', exact: true }).isDisabled(), true, 'a changed baseline locks the stale draft until reread');
  const conflictState = await recoveryPage.evaluate(async () => ({
    row: (await (await fetch('/api/templates', { cache: 'no-store' })).json()).data[0],
    counts: await (await fetch('/__qa/template-counts')).json(),
  }));
  assert.equal(conflictState.row.name, '外部新版本', 'the external concurrent change remains stored');
  assert.equal(conflictState.counts.update, 1, 'the conflicting update is sent only once');
  assert.deepEqual(await recoveryPage.evaluate(() => ({
    session: sessionStorage.getItem('xmt:topic-template-mutation:pending:actor:971'),
    local: localStorage.getItem('xmt:topic-template-mutation:pending:actor:971'),
  })), { session: null, local: null }, 'a definite baseline conflict safely releases its rejected request marker');

  await recoveryPage.goto(`${base}/__qa?theme=light&resetTemplates=1`);
  await recoveryPage.getByText('通用工作选题', { exact: true }).waitFor();
  const deleteTemplateRow = recoveryPage.locator('li').filter({ hasText: '通用工作选题' });
  await deleteTemplateRow.getByRole('button', { name: '删除', exact: true }).click();
  const deleteTemplateDialog = recoveryPage.getByRole('dialog', { name: '确认删除选题模板？' });
  await deleteTemplateDialog.waitFor();
  assert.equal(templateDeleteAttempts, 0, 'opening the themed confirmation does not send the delete request');
  await deleteTemplateDialog.getByRole('button', { name: '取消', exact: true }).click();
  await deleteTemplateDialog.waitFor({ state: 'detached' });
  assert.equal(templateDeleteAttempts, 0, 'canceling the themed confirmation keeps the template');
  expectedDroppedResponse.count += 1;
  await recoveryPage.evaluate(async () => { await fetch('/__qa/lose-next-template-delete-response', { method: 'POST' }); });
  const lostDeleteRequest = recoveryPage.waitForRequest((request) => request.url().endsWith('/api/templates/1') && request.method() === 'DELETE');
  await deleteTemplateRow.getByRole('button', { name: '删除', exact: true }).click();
  await recoveryPage.getByRole('dialog', { name: '确认删除选题模板？' }).getByRole('button', { name: '删除模板', exact: true }).click();
  await lostDeleteRequest;
  await recoveryPage.getByText('还没有选题模板', { exact: true }).waitFor();
  const deleteCounts = await recoveryPage.evaluate(async () => (await (await fetch('/__qa/template-counts')).json()));
  assert.equal(deleteCounts.delete, 1, 'delete response-loss recovery confirms once without repeating the destructive write');
  assert.equal(expectedDroppedResponse.count, 0, 'the committed delete response was dropped by the isolated fixture');
  assert.deepEqual(await recoveryPage.evaluate(() => ({
    session: sessionStorage.getItem('xmt:topic-template-mutation:pending:actor:971'),
    local: localStorage.getItem('xmt:topic-template-mutation:pending:actor:971'),
  })), { session: null, local: null }, 'confirmed delete recovery clears its marker in both stores');
  await recoveryPage.close();

  assert.equal(expected503.count, 0, 'the single injected 503 is accounted for');
  assert.equal(expected409.count, 0, 'the injected CAS conflict was accounted for');
  assert.deepEqual(unexpectedErrors, [], 'no unexpected page, framework, or console errors');
  console.log('选题模板响应丢失刷新恢复、同 UUID 显式重试、CAS 冲突保护、删除恢复及响应式界面回归通过');
} finally {
  releaseHeldTemplateRead?.();
  await browser.close();
  io.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
}
