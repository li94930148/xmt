import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const categoryFixtureOnly = process.env.XMT_RESOURCE_CATEGORY_FIXTURE_ONLY === '1';
const resourceCreateRecoveryFixtureMode = process.argv.includes('--mcp-resource-create-recovery-fixture');
const resourceUpdateRecoveryFixtureMode = process.argv.includes('--mcp-resource-update-recovery-fixture');
const resourceUpdateNotFoundFixtureMode = process.argv.includes('--mcp-resource-update-not-found-fixture');
const user = { id: 91, username: 'resource-category-qa', role: 'admin', name: '分类管理隔离验收', enabled: true, force_change_password: false };
type Category = { id: number; library_type: string; parent_id: number | null; name: string; code: string | null; path: string; sort_order: number; enabled: number; resource_count: number };
const categories: Category[] = [
  { id: 81, library_type: 'knowledge', parent_id: null, name: '现有资料', code: null, path: '/现有资料', sort_order: 1, enabled: 1, resource_count: 1 },
  { id: 82, library_type: 'knowledge', parent_id: 81, name: '既有子类', code: null, path: '/现有资料/既有子类', sort_order: 1, enabled: 1, resource_count: 0 },
];
const createdResourceId = 901;
let nextCategoryId = 83;
let failNextCategoryCreate = true;
let failNextCategoryReadAfterWrite = false;
let categoryCreateRequests = 0;
let categoryDeleteRequests = 0;
let categoryMutationStatusReads = 0;
let categoryMutationStatusFailures = 0;
let categoryRecoveryScenario: 'normal' | 'committed-response-lost' = 'normal';
const categoryMutationRequestIds: string[] = [];
const categoryMutationReceipts = new Map<string, { actorId: number; operation: 'created' | 'updated' | 'deleted'; categoryId: number }>();
let releaseCategoryCreate: (() => void) | null = null;
let markCategoryCreateStarted: (() => void) | null = null;
const categoryCreateStarted = new Promise<void>((resolve) => { markCategoryCreateStarted = resolve; });
const categoryCreateGate = new Promise<void>((resolve) => { releaseCategoryCreate = resolve; });
let releaseCategoryDelete: (() => void) | null = null;
let markCategoryDeleteStarted: (() => void) | null = null;
const categoryDeleteStarted = new Promise<void>((resolve) => { markCategoryDeleteStarted = resolve; });
const categoryDeleteGate = new Promise<void>((resolve) => { releaseCategoryDelete = resolve; });
let resourceCreateRequests = 0;
let resourceCreateStatusReads = 0;
let resourceCreateStatusFailures = 0;
let resourceCreateRecoveryScenario: 'normal' | 'committed-response-lost' = 'normal';
const resourceCreateRequestIds: string[] = [];
const resourceCreateReceipts = new Map<string, { actorId: number; resourceId: number }>();
let releaseResourceCreate: (() => void) | null = null;
let markResourceCreateStarted: (() => void) | null = null;
const resourceCreateStarted = new Promise<void>((resolve) => { markResourceCreateStarted = resolve; });
const resourceCreateGate = new Promise<void>((resolve) => { releaseResourceCreate = resolve; });
let resourceUpdateRequests = 0;
let resourceUpdateStatusReads = 0;
let resourceUpdateStatusFailures = 0;
let resourceUpdateRecoveryScenario: 'normal' | 'committed-response-lost' | 'not-found-response-lost' = 'normal';
const resourceUpdateRequestIds: string[] = [];
const resourceUpdateReceipts = new Map<string, { actorId: number; resourceId: number }>();
let resourceReadRequests = 0;
let resourceExists = false;
let resourceDeleteRequests = 0;
let failNextResourceUpdate = true;
let failNextResourceReadAfterUpdate = false;
let failNextResourceReadAfterDelete = false;
let releaseResourceUpdate: (() => void) | null = null;
let markResourceUpdateStarted: (() => void) | null = null;
const resourceUpdateStarted = new Promise<void>((resolve) => { markResourceUpdateStarted = resolve; });
const resourceUpdateGate = new Promise<void>((resolve) => { releaseResourceUpdate = resolve; });
let releaseResourceDelete: (() => void) | null = null;
let markResourceDeleteStarted: (() => void) | null = null;
const resourceDeleteStarted = new Promise<void>((resolve) => { markResourceDeleteStarted = resolve; });
const resourceDeleteGate = new Promise<void>((resolve) => { releaseResourceDelete = resolve; });
const resourceDetail = {
  id: createdResourceId, title: '知识库新建验收资料', summary: null as string | null, library_type: 'knowledge', visibility: 'team', status: 'published', category: null as Category | null, tags: [], file_count: 0,
  owner: { id: user.id, username: user.username, real_name: user.name }, created_at: '2026-10-12 09:00:00', updated_at: '2026-10-12 09:00:00', content_text: '', source_type: null, source_uri: null, parent_id: null, files: [], relations: [], versions: [], audit_summary: { total: 0, last_at: null, last_action: null },
};
let expectedHttpErrorResponses = 0;
const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','resource-category-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/asset-center/knowledge');</script>`));
app.get('/__qa/state', (_req, res) => res.json({
  categoryCreateRequests,
  categoryDeleteRequests,
  categoryMutationStatusReads,
  categoryMutationRequestIds,
  categoryMutationReceipts: [...categoryMutationReceipts.entries()].map(([requestId, receipt]) => ({ requestId, ...receipt })),
  categoryNames: categories.map((category) => category.name),
}));
app.post('/__qa/category-recovery/start', (_req, res) => {
  categoryRecoveryScenario = 'committed-response-lost';
  categoryMutationStatusFailures = 1;
  failNextCategoryReadAfterWrite = false;
  return res.json({ started: true });
});
app.get('/__qa/resource-create-state', (_req, res) => res.json({
  createAttempts: resourceCreateRequests,
  statusReads: resourceCreateStatusReads,
  requestIds: resourceCreateRequestIds,
  receipts: [...resourceCreateReceipts.entries()].map(([requestId, receipt]) => ({ requestId, ...receipt })),
}));
app.get('/__qa/resource-update-state', (_req, res) => res.json({
  updateAttempts: resourceUpdateRequests,
  statusReads: resourceUpdateStatusReads,
  requestIds: resourceUpdateRequestIds,
  receipts: [...resourceUpdateReceipts.entries()].map(([requestId, receipt]) => ({ requestId, ...receipt })),
}));
app.get('/__qa/resource-create-recovery', (_req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','resource-create-recovery-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/asset-center/knowledge');</script>`));
app.get('/__qa/resource-update-recovery', (_req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','resource-update-recovery-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/asset-center/resources/${createdResourceId}?library_type=knowledge');</script>`));
app.post('/__qa/release/:action', (req, res) => {
  if (req.params.action === 'category-create') releaseCategoryCreate?.();
  else if (req.params.action === 'category-delete') releaseCategoryDelete?.();
  else if (req.params.action === 'resource-create') releaseResourceCreate?.();
  else if (req.params.action === 'resource-update') releaseResourceUpdate?.();
  else if (req.params.action === 'resource-delete') releaseResourceDelete?.();
  else return res.status(404).json({ message: '未知夹具操作' });
  return res.json({ released: true });
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['resource:view', 'resource:create', 'resource:update', 'resource:delete', 'resource:category_manage']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/resource-center/categories/mutation-requests/:requestId', (req, res) => {
  categoryMutationStatusReads += 1;
  if (categoryMutationStatusFailures > 0) {
    categoryMutationStatusFailures -= 1;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟分类操作状态核实暂不可用' });
  }
  const receipt = categoryMutationReceipts.get(String(req.params.requestId).toLowerCase());
  if (!receipt || receipt.actorId !== user.id) return res.json({ state: 'not_found' });
  return res.json({ state: receipt.operation, categoryId: receipt.categoryId });
});
app.get('/api/resource-center/categories', (req, res) => {
  if (req.query.library_type !== 'knowledge') return res.json({ data: [] });
  if (failNextCategoryReadAfterWrite) {
    failNextCategoryReadAfterWrite = false;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟分类列表刷新失败' });
  }
  return res.json({ data: [...categories].sort((left, right) => left.path.localeCompare(right.path, 'zh-CN')) });
});
app.post('/api/resource-center/categories', async (req, res) => {
  categoryCreateRequests += 1;
  const requestId = String(req.body?.client_request_id || '').toLowerCase();
  categoryMutationRequestIds.push(requestId);
  const prior = requestId ? categoryMutationReceipts.get(requestId) : null;
  if (prior) return prior.actorId === user.id ? res.status(201).json({ message: '分类创建成功', id: prior.categoryId }) : res.status(409).json({ message: '请求冲突' });
  if (categoryRecoveryScenario === 'committed-response-lost') {
    categoryRecoveryScenario = 'normal';
    const parentId = req.body.parent_id == null ? null : Number(req.body.parent_id);
    const parent = parentId == null ? null : categories.find((item) => item.id === parentId);
    const name = String(req.body.name);
    const category: Category = { id: nextCategoryId++, library_type: 'knowledge', parent_id: parentId, name, code: null, path: `${parent?.path || ''}/${name}`.replace(/^\/+/, '/'), sort_order: 1, enabled: 1, resource_count: 0 };
    categories.push(category);
    if (requestId) categoryMutationReceipts.set(requestId, { actorId: user.id, operation: 'created', categoryId: category.id });
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟分类已创建但响应丢失' });
  }
  if (failNextCategoryCreate) {
    failNextCategoryCreate = false;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟分类新增失败' });
  }
  markCategoryCreateStarted?.();
  await categoryCreateGate;
  const parentId = req.body.parent_id == null ? null : Number(req.body.parent_id);
  const parent = parentId == null ? null : categories.find((item) => item.id === parentId);
  const name = String(req.body.name);
  const category: Category = { id: nextCategoryId++, library_type: 'knowledge', parent_id: parentId, name, code: null, path: `${parent?.path || ''}/${name}`.replace(/^\/+/, '/'), sort_order: 1, enabled: 1, resource_count: 0 };
  categories.push(category);
  if (requestId) categoryMutationReceipts.set(requestId, { actorId: user.id, operation: 'created', categoryId: category.id });
  failNextCategoryReadAfterWrite = true;
  return res.status(201).json({ message: '分类创建成功', id: category.id });
});
app.put('/api/resource-center/categories/:id', (req, res) => {
  const category = categories.find((item) => item.id === Number(req.params.id));
  if (!category) return res.status(404).json({ message: '分类不存在' });
  category.parent_id = req.body.parent_id == null ? null : Number(req.body.parent_id);
  category.name = String(req.body.name);
  const parent = category.parent_id == null ? null : categories.find((item) => item.id === category.parent_id);
  category.path = `${parent?.path || ''}/${category.name}`.replace(/^\/+/, '/');
  const descendants = [category];
  for (let index = 0; index < descendants.length; index += 1) {
    const current = descendants[index];
    for (const child of categories.filter((item) => item.parent_id === current.id)) {
      child.path = `${current.path}/${child.name}`;
      descendants.push(child);
    }
  }
  return res.json({ message: '分类更新成功' });
});
app.delete('/api/resource-center/categories/:id', async (req, res) => {
  categoryDeleteRequests += 1;
  const category = categories.find((item) => item.id === Number(req.params.id));
  if (!category) return res.status(404).json({ message: '分类不存在' });
  if (category.resource_count > 0) { expectedHttpErrorResponses += 1; return res.status(409).json({ message: '分类下存在资料，禁止删除' }); }
  if (categories.some((item) => item.parent_id === category.id)) { expectedHttpErrorResponses += 1; return res.status(409).json({ message: '分类下存在子分类，禁止删除' }); }
  markCategoryDeleteStarted?.();
  await categoryDeleteGate;
  const categoryIndex = categories.indexOf(category);
  if (categoryIndex < 0) { expectedHttpErrorResponses += 1; return res.status(404).json({ message: '分类不存在' }); }
  categories.splice(categoryIndex, 1);
  return res.json({ message: '分类已删除' });
});
app.get('/api/resource-center/resources', (_req, res) => res.json({ data: resourceExists ? [{ ...resourceDetail }] : [], pagination: { page: 1, page_size: 50, total: Number(resourceExists), total_pages: 1 } }));
app.get('/api/resource-center/resources/create-requests/:requestId', (req, res) => {
  resourceCreateStatusReads += 1;
  if (resourceCreateStatusFailures > 0) {
    resourceCreateStatusFailures -= 1;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟资料创建状态核实暂不可用' });
  }
  const receipt = resourceCreateReceipts.get(String(req.params.requestId).toLowerCase());
  if (!receipt || receipt.actorId !== user.id) return res.json({ state: 'not_found' });
  return res.json({ state: 'created', resourceId: receipt.resourceId });
});
app.post('/api/resource-center/resources', async (req, res) => {
  resourceCreateRequests += 1;
  const requestId = String(req.body?.client_request_id ?? '').toLowerCase();
  resourceCreateRequestIds.push(requestId);
  if (resourceCreateRecoveryScenario === 'committed-response-lost') {
    resourceCreateRecoveryScenario = 'normal';
    resourceExists = true;
    resourceDetail.title = String(req.body.title || resourceDetail.title);
    resourceDetail.summary = req.body.summary || null;
    resourceDetail.content_text = req.body.content_text || '';
    resourceDetail.visibility = String(req.body.visibility || 'team');
    resourceDetail.category = req.body.category_id ? categories.find((item) => item.id === Number(req.body.category_id)) || null : null;
    if (requestId) resourceCreateReceipts.set(requestId, { actorId: user.id, resourceId: createdResourceId });
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟资料已创建但响应丢失' });
  }
  markResourceCreateStarted?.();
  await resourceCreateGate;
  resourceExists = true;
  resourceDetail.title = String(req.body.title || resourceDetail.title);
  resourceDetail.summary = req.body.summary || null;
  resourceDetail.content_text = req.body.content_text || '';
  resourceDetail.visibility = String(req.body.visibility || 'team');
  resourceDetail.category = req.body.category_id ? categories.find((item) => item.id === Number(req.body.category_id)) || null : null;
  if (requestId) resourceCreateReceipts.set(requestId, { actorId: user.id, resourceId: createdResourceId });
  return res.status(201).json({ message: '资料已创建', id: createdResourceId });
});
app.get('/api/resource-center/resources/:id/update-requests/:requestId', (req, res) => {
  resourceUpdateStatusReads += 1;
  if (resourceUpdateStatusFailures > 0) {
    resourceUpdateStatusFailures -= 1;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟资料更新状态核实暂不可用' });
  }
  const receipt = resourceUpdateReceipts.get(String(req.params.requestId).toLowerCase());
  if (!receipt || receipt.actorId !== user.id || receipt.resourceId !== Number(req.params.id)) return res.json({ state: 'not_found' });
  return res.json({ state: 'updated', resourceId: receipt.resourceId });
});
app.get('/api/resource-center/resources/:id', (req, res) => {
  if (Number(req.params.id) !== createdResourceId) return res.status(404).json({ message: '资料不存在' });
  resourceReadRequests += 1;
  if (failNextResourceReadAfterUpdate) {
    failNextResourceReadAfterUpdate = false;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟详情刷新失败' });
  }
  if (failNextResourceReadAfterDelete) {
    failNextResourceReadAfterDelete = false;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟删除状态核实读取失败' });
  }
  return res.json(resourceDetail);
});
app.put('/api/resource-center/resources/:id', async (req, res) => {
  resourceUpdateRequests += 1;
  const requestId = String(req.body?.client_request_id ?? '').toLowerCase();
  if (requestId) resourceUpdateRequestIds.push(requestId);
  const updates = { ...req.body } as Record<string, unknown>;
  delete updates.client_request_id;
  if (resourceUpdateRecoveryScenario === 'committed-response-lost') {
    resourceUpdateRecoveryScenario = 'normal';
    Object.assign(resourceDetail, updates, {
      category: updates.category_id == null ? null : categories.find((item) => item.id === Number(updates.category_id)) || null,
      updated_at: '2026-10-24 12:00:00',
    });
    if (requestId) resourceUpdateReceipts.set(requestId, { actorId: user.id, resourceId: createdResourceId });
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟资料已更新但响应丢失' });
  }
  if (resourceUpdateRecoveryScenario === 'not-found-response-lost') {
    resourceUpdateRecoveryScenario = 'normal';
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟资料更新未提交且响应丢失' });
  }
  if (failNextResourceUpdate) {
    failNextResourceUpdate = false;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟资料保存失败' });
  }
  markResourceUpdateStarted?.();
  await resourceUpdateGate;
  Object.assign(resourceDetail, updates, {
    category: updates.category_id == null ? null : categories.find((item) => item.id === Number(updates.category_id)) || null,
    updated_at: '2026-10-16 12:00:00',
  });
  if (requestId) resourceUpdateReceipts.set(requestId, { actorId: user.id, resourceId: createdResourceId });
  failNextResourceReadAfterUpdate = true;
  return res.json({ message: '资料更新成功' });
});
app.delete('/api/resource-center/resources/:id', async (req, res) => {
  if (Number(req.params.id) !== createdResourceId) return res.status(404).json({ message: '资料不存在' });
  resourceDeleteRequests += 1;
  markResourceDeleteStarted?.();
  await resourceDeleteGate;
  if (resourceDeleteRequests === 1) {
    failNextResourceReadAfterDelete = true;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟删除失败' });
  }
  resourceDetail.status = 'deleted';
  resourceDetail.updated_at = '2026-10-19 12:00:00';
  failNextResourceReadAfterDelete = true;
  expectedHttpErrorResponses += 1;
  return res.status(503).json({ message: '模拟删除后响应丢失' });
});
app.use('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
const keepFixtureServer = process.env.XMT_KEEP_RESOURCE_CATEGORY_FIXTURE === '1';
if (categoryFixtureOnly || resourceCreateRecoveryFixtureMode || resourceUpdateRecoveryFixtureMode || resourceUpdateNotFoundFixtureMode) {
  if (resourceCreateRecoveryFixtureMode) {
    resourceCreateRequests = 0;
    resourceCreateStatusReads = 0;
    resourceCreateStatusFailures = 1;
    resourceCreateRecoveryScenario = 'committed-response-lost';
    resourceCreateRequestIds.length = 0;
    resourceCreateReceipts.clear();
    resourceExists = false;
    resourceDetail.title = '知识库新建验收资料';
    resourceDetail.summary = null;
    resourceDetail.content_text = '';
    resourceDetail.status = 'published';
    resourceDetail.visibility = 'team';
    console.log(`Resource create recovery MCP fixture ready: ${baseUrl}/__qa/resource-create-recovery (in-memory API; committed response loss and one status-read failure are injected)`);
  } else if (resourceUpdateRecoveryFixtureMode || resourceUpdateNotFoundFixtureMode) {
    resourceExists = true;
    resourceUpdateRequests = 0;
    resourceUpdateStatusReads = 0;
    resourceUpdateStatusFailures = resourceUpdateNotFoundFixtureMode ? 0 : 1;
    resourceUpdateRecoveryScenario = resourceUpdateNotFoundFixtureMode ? 'not-found-response-lost' : 'committed-response-lost';
    resourceUpdateRequestIds.length = 0;
    resourceUpdateReceipts.clear();
    failNextResourceUpdate = false;
    resourceDetail.title = '资料更新恢复起始标题';
    resourceDetail.summary = '原始摘要';
    resourceDetail.content_text = '原始正文';
    resourceDetail.status = 'published';
    resourceDetail.visibility = 'team';
    console.log(`Resource update recovery MCP fixture ready: ${baseUrl}/__qa/resource-update-recovery (in-memory API; ${resourceUpdateNotFoundFixtureMode ? 'no-commit response loss' : 'committed response loss and one status-read failure'} are injected)`);
  } else {
  console.log(`isolated category fixture ready at ${baseUrl}/__qa`);
  }
  await new Promise<void>((resolve) => {
    const stop = () => { resolve(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
} else {
const consoleErrors: string[] = [];
const expectedConsoleHttpFailures: string[] = [];

async function openKnowledgePage(page: Page) {
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/Failed to load resource: the server responded with a status of (409|503)/.test(message.text())) expectedConsoleHttpFailures.push(message.text());
    else consoleErrors.push(message.text());
  });
  await page.goto(`${baseUrl}/__qa`);
  await page.getByRole('heading', { name: '知识库' }).waitFor();
}

async function waitForCategoryCreateStart() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      categoryCreateStarted,
      new Promise<void>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Category creation request did not start')), 10000); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForCategoryDeleteStart() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      categoryDeleteStarted,
      new Promise<void>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Category deletion request did not start')), 10000); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForResourceCreateStart() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      resourceCreateStarted,
      new Promise<void>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Resource creation request did not start')), 10000); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForResourceUpdateStart() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      resourceUpdateStarted,
      new Promise<void>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Resource update request did not start')), 10000); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForResourceDeleteStart() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      resourceDeleteStarted,
      new Promise<void>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Resource deletion request did not start')), 10000); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  await openKnowledgePage(page);
  await page.getByRole('button', { name: '分类管理' }).click();
  await page.getByRole('heading', { name: '知识库分类管理' }).waitFor();

  const categoryDialog = page.getByRole('dialog', { name: '知识库分类管理' });
  const categoryDialogActions = [
    categoryDialog.getByRole('button', { name: '关闭弹窗', exact: true }),
    categoryDialog.getByRole('button', { name: '新增分类', exact: true }),
    categoryDialog.getByRole('button', { name: '编辑分类 浅色主题分类', exact: true }),
    categoryDialog.getByRole('button', { name: '删除分类 浅色主题分类', exact: true }),
  ];
  for (const action of categoryDialogActions) {
    const bounds = await action.boundingBox();
    assert(bounds, `${await action.getAttribute('aria-label') || await action.innerText()} category dialog action is visible`);
    assert.ok(bounds.width >= 40 && bounds.height >= 40, `category dialog actions meet the 40×40px minimum: ${JSON.stringify(bounds)}`);
  }

  const nameInput = page.getByRole('textbox', { name: '分类名称' });
  await nameInput.fill('新增分类');
  await page.getByRole('button', { name: '新增分类' }).click();
  await page.getByText('服务器尚未找到这次分类操作回执').waitFor();
  assert.equal(await nameInput.inputValue(), '新增分类', 'failed writes keep the category form for an intentional retry');
  await page.getByRole('button', { name: '用原内容和原编号安全重试' }).click();
  await waitForCategoryCreateStart();
  await page.getByRole('button', { name: '保存中…' }).evaluate((button) => {
    const form = button.closest('form') as HTMLFormElement;
    form.requestSubmit();
    form.requestSubmit();
  });
  await page.waitForTimeout(100);
  assert.equal(categoryCreateRequests, 2, 'synchronous duplicate submissions after a failed create issue only one retry');
  assert.equal(await nameInput.isDisabled(), true, 'the category form stays locked until creation is confirmed');
  releaseCategoryCreate?.();
  await page.getByText('服务端已确认分类创建成功，但列表刷新失败').waitFor();
  assert.equal(categoryCreateRequests, 2, 'a failed write is retried once; confirmed creation is not repeated');
  const keyedCreateIds = [...categoryMutationRequestIds];
  assert.equal(keyedCreateIds[0], keyedCreateIds[1], 'safe retry preserves the original category-create request UUID');
  await page.getByRole('button', { name: '只重试读取分类' }).click();
  await page.getByText('新增分类', { exact: true }).waitFor();

  await page.getByRole('button', { name: '编辑分类 新增分类' }).click();
  await nameInput.fill('已改名分类');
  await page.getByRole('combobox', { name: '上级分类' }).selectOption('81');
  await page.getByRole('button', { name: '保存修改' }).click();
  await page.getByText('/现有资料/已改名分类 · 0 条资料', { exact: true }).waitFor();

  await page.getByRole('button', { name: '编辑分类 现有资料' }).click();
  const descendantOption = page.locator('select[aria-label="上级分类"] option[value="82"]');
  const descendantDisabled = await descendantOption.evaluate((option) => (option as HTMLOptionElement).disabled);
  assert.equal(descendantDisabled, true, `a category cannot select itself or a descendant as parent; option=${await descendantOption.evaluate((option) => option.outerHTML)}`);
  await page.getByRole('button', { name: '取消' }).click();

  await page.getByRole('button', { name: '删除分类 现有资料' }).click();
  await page.getByRole('button', { name: '删除分类', exact: true }).click();
  await page.getByText('分类下存在资料，禁止删除').waitFor();
  await page.getByRole('button', { name: '删除分类 已改名分类' }).click();
  await page.getByRole('button', { name: '删除分类', exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await waitForCategoryDeleteStart();
  await page.waitForTimeout(100);
  assert.equal(categoryDeleteRequests, 2, 'synchronous duplicate confirmations issue only one delete request');
  assert.equal(await page.getByRole('button', { name: '处理中...' }).isDisabled(), true, 'the confirmation remains locked while deletion is pending');
  await page.getByRole('paragraph').filter({ hasText: /^已改名分类$/ }).waitFor();
  releaseCategoryDelete?.();
  await page.getByRole('paragraph').filter({ hasText: /^已改名分类$/ }).waitFor({ state: 'detached' });
  assert.equal(categoryDeleteRequests, 2, 'blocked delete and empty-category delete are both surfaced');

  await page.screenshot({ path: '/tmp/xmt-resource-category-management-desktop.png' });
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await page.getByRole('button', { name: '新增资料' }).click();
  const resourceTitle = page.getByRole('textbox', { name: '标题' });
  await resourceTitle.fill('知识库新建验收资料');
  await page.getByRole('button', { name: '创建', exact: true }).evaluate((button) => {
    const form = button.closest('form') as HTMLFormElement;
    form.requestSubmit();
    form.requestSubmit();
  });
  await waitForResourceCreateStart();
  await page.waitForTimeout(100);
  assert.equal(resourceCreateRequests, 1, 'synchronous duplicate submits create only one resource');
  assert.equal(await resourceTitle.isDisabled(), true, 'the submitted title is locked until the server confirms creation');
  assert.equal(await page.getByRole('combobox', { name: '分类' }).isDisabled(), true, 'the category is locked while creation is in flight');
  assert.equal(await page.getByRole('combobox', { name: '可见范围' }).isDisabled(), true, 'resource options are locked while creation is in flight');
  assert.equal(await page.getByRole('textbox', { name: '摘要' }).isDisabled(), true, 'the summary is locked while creation is in flight');
  assert.equal(await page.getByRole('textbox', { name: '正文' }).isDisabled(), true, 'the body is locked while creation is in flight');
  assert.equal(await page.getByRole('button', { name: '取消' }).isDisabled(), true, 'the creation dialog cannot be closed from its cancel action while pending');
  assert.equal(await page.getByRole('button', { name: '关闭弹窗' }).count(), 0, 'the dialog close control is hidden while creation is pending');
  releaseResourceCreate?.();
  await page.waitForURL(`**/asset-center/resources/${createdResourceId}**`);
  const createdDetailUrl = new URL(page.url());
  assert.equal(createdDetailUrl.pathname, `/asset-center/resources/${createdResourceId}`, 'knowledge-library creation opens the created resource detail');
  assert.equal(createdDetailUrl.searchParams.get('library_type'), 'knowledge', 'the created detail keeps its owning library in the URL');
  const editAvailable = page.getByRole('button', { name: '编辑', exact: true });
  const uploadUnavailable = page.getByRole('button', { name: '上传文件（暂未开放）', exact: true });
  assert.equal(await editAvailable.isEnabled(), true, 'resource editing is available to accounts with the update permission');
  assert.equal(await uploadUnavailable.isDisabled(), true, 'the not-yet-wired file upload is not presented as clickable');
  assert.equal(await uploadUnavailable.getAttribute('title'), '真实文件存储与上传流程尚未接入', 'the unavailable upload action explains its real limitation');

  await editAvailable.click();
  await page.getByRole('heading', { name: '编辑资料', exact: true }).waitFor();
  const editTitle = page.getByRole('textbox', { name: '资料标题' });
  await editTitle.fill('已编辑资料标题');
  await page.getByRole('textbox', { name: '资料摘要' }).fill('已更新摘要');
  await page.getByRole('textbox', { name: '资料正文' }).fill('正文可以在资料详情直接修改。');
  await page.getByRole('combobox', { name: '资料分类' }).selectOption('82');
  await page.getByRole('combobox', { name: '可见范围' }).selectOption('company');
  await page.getByRole('button', { name: '保存修改' }).click();
  await page.getByText('模拟资料保存失败').waitFor();
  assert.equal(await editTitle.inputValue(), '已编辑资料标题', 'failed updates preserve the entered title for retry');
  assert.equal(await page.getByRole('textbox', { name: '资料正文' }).inputValue(), '正文可以在资料详情直接修改。', 'failed updates preserve the edited body');

  await page.getByRole('button', { name: '保存修改' }).evaluate((button) => {
    const form = button.closest('form') as HTMLFormElement;
    form.requestSubmit();
    form.requestSubmit();
  });
  await waitForResourceUpdateStart();
  await page.waitForTimeout(100);
  assert.equal(resourceUpdateRequests, 2, 'synchronous duplicate submits produce only one update request after the failed attempt');
  assert.equal(await editTitle.isDisabled(), true, 'the edited title stays locked until server confirmation');
  assert.equal(await page.getByRole('combobox', { name: '资料分类' }).isDisabled(), true, 'the category stays locked while saving');
  assert.equal(await page.getByRole('combobox', { name: '可见范围' }).isDisabled(), true, 'visibility stays locked while saving');
  assert.equal(await page.getByRole('textbox', { name: '资料摘要' }).isDisabled(), true, 'the summary stays locked while saving');
  assert.equal(await page.getByRole('textbox', { name: '资料正文' }).isDisabled(), true, 'the edited body stays locked while saving');
  assert.equal(await page.getByRole('button', { name: '取消' }).isDisabled(), true, 'the edit dialog cannot be closed from its cancel action while pending');
  assert.equal(await page.getByRole('button', { name: '关闭弹窗' }).count(), 0, 'the edit dialog close control is hidden while saving');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('heading', { name: '编辑资料', exact: true }).count(), 1, 'Escape cannot close the edit dialog while a save is pending');
  releaseResourceUpdate?.();
  await page.getByText('服务端已确认保存，但详情刷新失败；当前内容已保留，请稍后只重试读取，不要重复保存。').waitFor();
  await page.getByRole('heading', { name: '已编辑资料标题', exact: true }).waitFor();
  assert.equal(await page.getByText('已更新摘要', { exact: true }).count(), 1, 'server-confirmed edits are immediately reflected before the detail reread');
  assert.equal(resourceUpdateRequests, 2, 'a failed post-save reread does not repeat the write');
  const readsBeforeRetry = resourceReadRequests;
  await page.getByRole('button', { name: '只重试读取详情' }).click();
  await page.getByText('已更新摘要', { exact: true }).waitFor();
  assert.equal(resourceReadRequests, readsBeforeRetry + 1, 'the recovery action retries only the detail read');
  assert.equal(resourceUpdateRequests, 2, 'read recovery does not send another update');
  await page.getByText('正文可以在资料详情直接修改。', { exact: true }).waitFor();

  await page.goto(`${baseUrl}/asset-center/resources?library_type=knowledge`);
  await page.getByRole('heading', { name: '知识库', exact: true }).waitFor();
  await page.getByRole('button', { name: '删除资料 知识库新建验收资料' }).click();
  await page.getByRole('heading', { name: '删除资料', exact: true }).waitFor();
  const listConfirmDelete = page.getByRole('button', { name: '删除', exact: true });
  await listConfirmDelete.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await waitForResourceDeleteStart();
  await page.waitForTimeout(100);
  assert.equal(resourceDeleteRequests, 1, 'synchronous duplicate list confirmation sends only one delete');
  releaseResourceDelete?.();
  await page.getByRole('alert').filter({ hasText: '删除请求未获确认' }).getByRole('button', { name: '只读核实资料状态' }).waitFor();
  assert.equal(await page.getByRole('link', { name: '编辑资料 知识库新建验收资料' }).count(), 0, 'all resource write controls are locked while deletion is unverified');
  await page.getByRole('button', { name: '只读核实资料状态' }).click();
  await page.getByText('仍未移入回收站', { exact: false }).waitFor();
  assert.equal(resourceDeleteRequests, 1, 'read-only verification does not repeat a delete that the server did not commit');
  assert.equal(await page.getByRole('button', { name: '删除资料 知识库新建验收资料' }).count(), 1, 'a successful read proving the resource is still active restores the delete action');
  await page.getByRole('link', { name: '查看资料 知识库新建验收资料' }).click();
  await page.waitForURL('**/asset-center/resources/901**');

  const detailDelete = page.getByRole('button', { name: '删除', exact: true });
  await detailDelete.click();
  await page.getByRole('heading', { name: '删除资料', exact: true }).waitFor();
  const confirmDelete = page.getByRole('button', { name: '删除', exact: true }).last();
  await confirmDelete.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await waitForResourceDeleteStart();
  await page.waitForTimeout(100);
  assert.equal(resourceDeleteRequests, 2, 'detail deletion is sent once after the list path was safely reconciled');
  assert.equal(await confirmDelete.isDisabled(), true, 'the delete confirmation is locked while the server request is pending');
  releaseResourceDelete?.();
  await page.getByRole('alert').filter({ hasText: '删除请求未获确认' }).getByRole('button', { name: '只读核实资料状态' }).waitFor();
  assert.equal(resourceDeleteRequests, 2, 'a failed status read does not repeat the delete request');
  assert.equal(await page.getByRole('button', { name: '删除', exact: true }).isDisabled(), true, 'detail deletion stays locked while outcome is unknown');
  await page.getByRole('button', { name: '只读核实资料状态' }).click();
  await page.waitForURL('**/asset-center/knowledge');
  await page.getByText('已移入回收站', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: '编辑资料 知识库新建验收资料' }).count(), 0, 'recycled resources cannot be edited from the library');
  assert.equal(await page.getByRole('button', { name: '删除资料 知识库新建验收资料' }).count(), 0, 'recycled resources cannot be deleted again from the library');
  await page.getByRole('link', { name: '查看资料 知识库新建验收资料' }).click();
  await page.getByText('此资料仅供查看，不能再次编辑或删除。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '编辑', exact: true }).count(), 0, 'recycled resource details stay read-only');
  assert.equal(await page.getByRole('button', { name: '删除', exact: true }).count(), 0, 'recycled resource details cannot repeat deletion');

  await page.setViewportSize({ width: 320, height: 800 });
  const detailGeometry = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    actions: Array.from(document.querySelectorAll('main button')).map((button) => {
      const rect = button.getBoundingClientRect();
      return { text: button.textContent?.trim(), left: rect.left, right: rect.right };
    }),
  }));
  assert.equal(detailGeometry.documentWidth, detailGeometry.viewportWidth, '320px resource details have no horizontal document overflow');
  for (const action of detailGeometry.actions) {
    assert.ok(action.left >= 0 && action.right <= detailGeometry.viewportWidth, `${action.text || 'detail action'} remains inside the 320px viewport`);
  }
  await page.setViewportSize({ width: 1366, height: 900 });

  const mobileContext = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const mobilePage = await mobileContext.newPage();
  await openKnowledgePage(mobilePage);
  await mobilePage.getByRole('button', { name: '分类管理' }).click();
  await mobilePage.getByRole('heading', { name: '知识库分类管理' }).waitFor();
  await mobilePage.locator('.xmt-overlay > div').evaluate((element) => new Promise<void>((resolve) => {
    const animations = element.getAnimations();
    if (animations.length === 0) { resolve(); return; }
    void Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => resolve());
  }));
  const geometry = await mobilePage.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    modal: (() => { const element = document.querySelector('.xmt-overlay > div'); const rect = element?.getBoundingClientRect(); return rect ? { left: rect.left, right: rect.right } : null; })(),
  }));
  assert.equal(geometry.documentWidth, geometry.viewportWidth, '320px category management has no horizontal page overflow');
  assert.ok(geometry.modal && geometry.modal.left >= 0 && geometry.modal.right <= geometry.viewportWidth, 'category modal remains inside the 320px viewport');
  for (const action of await mobilePage.getByRole('dialog').getByRole('button').all()) {
    const bounds = await action.boundingBox();
    assert(bounds, '320px category dialog actions stay visible');
    assert.ok(bounds.width >= 40 && bounds.height >= 40, `320px category dialog action meets the 40×40px minimum: ${JSON.stringify(bounds)}`);
  }
  for (const field of await mobilePage.getByRole('dialog').locator('input, select').all()) {
    const bounds = await field.boundingBox();
    assert(bounds && bounds.height >= 40, `320px category dialog field meets the 40px minimum: ${JSON.stringify(bounds)}`);
  }
  await mobilePage.screenshot({ path: '/tmp/xmt-resource-category-management-mobile-320.png' });

  resourceCreateRequests = 0;
  resourceCreateStatusReads = 0;
  resourceCreateStatusFailures = 1;
  resourceCreateRecoveryScenario = 'committed-response-lost';
  resourceCreateRequestIds.length = 0;
  resourceCreateReceipts.clear();
  resourceExists = false;
  resourceDetail.title = '知识库新建验收资料';
  resourceDetail.summary = null;
  resourceDetail.content_text = '';
  resourceDetail.status = 'published';
  resourceDetail.visibility = 'team';
  await page.goto(`${baseUrl}/asset-center/knowledge`);
  await page.getByRole('heading', { name: '知识库', exact: true }).waitFor();
  await page.getByRole('button', { name: '新增资料', exact: true }).click();
  const uncertainResourceTitle = '资料创建响应丢失后只读恢复';
  await page.getByRole('textbox', { name: '标题' }).fill(uncertainResourceTitle);
  await page.getByRole('textbox', { name: '摘要' }).fill('保留原创建内容供安全核实');
  await page.getByRole('textbox', { name: '正文' }).fill('夹具已提交但先丢失写入响应，随后暂时不能查询回执。');
  const lostCreateResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/resource-center/resources' && response.status() === 503);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await lostCreateResponse;
  await page.getByRole('button', { name: '只读重新核实创建状态', exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '标题' }).isDisabled(), true, 'an unknown create outcome locks the submitted resource payload');
  assert.equal(resourceCreateRequests, 1, 'the uncertain state does not automatically repeat resource creation');

  await page.reload();
  await page.getByRole('heading', { name: '知识库', exact: true }).waitFor();
  await page.getByRole('button', { name: '新增资料', exact: true }).click();
  await page.waitForURL(`**/asset-center/resources/${createdResourceId}**`);
  assert.equal(new URL(page.url()).searchParams.get('library_type'), 'knowledge', 'recovery opens the resource under its original library');
  const recoveryState = await page.evaluate(async () => await (await fetch('/__qa/resource-create-state')).json() as { createAttempts: number; statusReads: number; requestIds: string[] });
  assert.equal(recoveryState.createAttempts, 1, 'refresh recovery only confirms the committed resource');
  assert.equal(recoveryState.statusReads, 2, 'first status failure is followed by one read-only refresh recovery');
  assert.equal(new Set(recoveryState.requestIds).size, 1, 'the browser preserves the original create request key');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:resource-create-pending:v1:actor:91')), null, 'a confirmed creation clears only its recovery marker');

  categoryRecoveryScenario = 'committed-response-lost';
  categoryMutationStatusFailures = 1;
  failNextCategoryReadAfterWrite = false;
  const categoryWritesBeforeRecovery = categoryCreateRequests;
  const categoryStatusReadsBeforeRecovery = categoryMutationStatusReads;
  const categoryIdsBeforeRecovery = [...categoryMutationRequestIds];
  await page.goto(`${baseUrl}/asset-center/knowledge`);
  await page.getByRole('heading', { name: '知识库', exact: true }).waitFor();
  await page.getByRole('button', { name: '分类管理', exact: true }).click();
  await page.getByRole('heading', { name: '知识库分类管理', exact: true }).waitFor();
  const recoveredCategoryName = '分类提交成功但响应丢失';
  await page.getByRole('textbox', { name: '分类名称' }).fill(recoveredCategoryName);
  const lostCategoryResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/resource-center/categories' && response.status() === 503);
  await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await lostCategoryResponse;
  await page.getByText('暂时无法核实分类操作结果').waitFor();
  assert.equal(categoryCreateRequests, categoryWritesBeforeRecovery + 1, 'a committed category response loss is not automatically retried');

  await page.reload();
  await page.getByRole('heading', { name: '知识库', exact: true }).waitFor();
  await page.getByRole('heading', { name: '知识库分类管理', exact: true }).waitFor();
  await page.getByRole('dialog').getByText(recoveredCategoryName, { exact: true }).waitFor();
  await page.getByText('服务端已确认分类创建成功。').waitFor();
  assert.equal(categoryCreateRequests, categoryWritesBeforeRecovery + 1, 'reload checks the receipt and does not repeat a committed create');
  assert.equal(categoryMutationStatusReads, categoryStatusReadsBeforeRecovery + 2, 'the first status failure is recovered by a read-only check after reload');
  assert.equal(categoryMutationRequestIds.length, categoryIdsBeforeRecovery.length + 1, 'only the original create request is sent');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:resource-category-mutation-pending:v1:actor:91')), null, 'confirmed category recovery clears its local marker');

  assert.deepEqual(consoleErrors, [], 'desktop and mobile pages render without browser console or runtime errors');
  assert.equal(expectedConsoleHttpFailures.length, expectedHttpErrorResponses, 'only the explicitly injected write/read failures appear as browser network errors');
  console.log('resource category management browser tests passed');
} finally {
  releaseCategoryCreate?.();
  releaseCategoryDelete?.();
  releaseResourceCreate?.();
  releaseResourceUpdate?.();
  releaseResourceDelete?.();
  await browser.close();
  if (keepFixtureServer) {
    console.log(`isolated category fixture remains available at ${baseUrl}/__qa`);
  } else {
    await vite.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
}
}
