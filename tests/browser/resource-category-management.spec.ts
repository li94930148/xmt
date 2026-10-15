import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
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
let expectedHttpErrorResponses = 0;
const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','resource-category-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/asset-center/knowledge');</script>`));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['resource:view', 'resource:create', 'resource:update', 'resource:category_manage']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/resource-center/categories', (req, res) => {
  if (req.query.library_type !== 'knowledge') return res.json({ data: [] });
  if (failNextCategoryReadAfterWrite) {
    failNextCategoryReadAfterWrite = false;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟分类列表刷新失败' });
  }
  return res.json({ data: [...categories].sort((left, right) => left.path.localeCompare(right.path, 'zh-CN')) });
});
app.post('/api/resource-center/categories', (req, res) => {
  categoryCreateRequests += 1;
  if (failNextCategoryCreate) {
    failNextCategoryCreate = false;
    expectedHttpErrorResponses += 1;
    return res.status(503).json({ message: '模拟分类新增失败' });
  }
  const parentId = req.body.parent_id == null ? null : Number(req.body.parent_id);
  const parent = parentId == null ? null : categories.find((item) => item.id === parentId);
  const name = String(req.body.name);
  const category: Category = { id: nextCategoryId++, library_type: 'knowledge', parent_id: parentId, name, code: null, path: `${parent?.path || ''}/${name}`.replace(/^\/+/, '/'), sort_order: 1, enabled: 1, resource_count: 0 };
  categories.push(category);
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
app.delete('/api/resource-center/categories/:id', (req, res) => {
  categoryDeleteRequests += 1;
  const category = categories.find((item) => item.id === Number(req.params.id));
  if (!category) return res.status(404).json({ message: '分类不存在' });
  if (category.resource_count > 0) { expectedHttpErrorResponses += 1; return res.status(409).json({ message: '分类下存在资料，禁止删除' }); }
  if (categories.some((item) => item.parent_id === category.id)) { expectedHttpErrorResponses += 1; return res.status(409).json({ message: '分类下存在子分类，禁止删除' }); }
  categories.splice(categories.indexOf(category), 1);
  return res.json({ message: '分类已删除' });
});
app.get('/api/resource-center/resources', (_req, res) => res.json({ data: [], pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 } }));
app.post('/api/resource-center/resources', (_req, res) => res.status(201).json({ message: '资料已创建', id: createdResourceId }));
app.get(`/api/resource-center/resources/${createdResourceId}`, (_req, res) => res.json({
  id: createdResourceId, title: '知识库新建验收资料', summary: null, library_type: 'knowledge', visibility: 'team', status: 'published', category: null, tags: [], file_count: 0,
  owner: { id: user.id, username: user.username, real_name: user.name }, created_at: '2026-10-12 09:00:00', updated_at: '2026-10-12 09:00:00', content_text: '', source_type: null, source_uri: null, parent_id: null, files: [], relations: [], versions: [], audit_summary: { total: 0, last_at: null, last_action: null },
}));
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

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  await openKnowledgePage(page);
  await page.getByRole('button', { name: '分类管理' }).click();
  await page.getByRole('heading', { name: '知识库分类管理' }).waitFor();

  const nameInput = page.getByRole('textbox', { name: '分类名称' });
  await nameInput.fill('新增分类');
  await page.getByRole('button', { name: '新增分类' }).click();
  await page.getByText('模拟分类新增失败').waitFor();
  assert.equal(await nameInput.inputValue(), '新增分类', 'failed writes keep the category form for an intentional retry');
  await page.getByRole('button', { name: '新增分类' }).click();
  await page.getByText('服务端已确认分类创建成功，但列表刷新失败').waitFor();
  assert.equal(categoryCreateRequests, 2, 'a failed write is retried once; confirmed creation is not repeated');
  await page.getByRole('button', { name: '只重试读取' }).click();
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
  await page.getByRole('button', { name: '删除分类', exact: true }).click();
  await page.getByRole('paragraph').filter({ hasText: /^已改名分类$/ }).waitFor({ state: 'detached' });
  assert.equal(categoryDeleteRequests, 2, 'blocked delete and empty-category delete are both surfaced');

  await page.screenshot({ path: '/tmp/xmt-resource-category-management-desktop.png' });
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await page.getByRole('button', { name: '新增资料' }).click();
  await page.getByRole('textbox', { name: '标题' }).fill('知识库新建验收资料');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.waitForURL(`**/asset-center/resources/${createdResourceId}`);
  assert.match(page.url(), new RegExp(`/asset-center/resources/${createdResourceId}$`), 'knowledge-library creation opens the created resource detail');

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
  await mobilePage.screenshot({ path: '/tmp/xmt-resource-category-management-mobile-320.png' });
  assert.deepEqual(consoleErrors, [], 'desktop and mobile pages render without browser console or runtime errors');
  assert.equal(expectedConsoleHttpFailures.length, expectedHttpErrorResponses, 'only the explicitly injected write/read failures appear as browser network errors');
  console.log('resource category management browser tests passed');
} finally {
  await browser.close();
  if (keepFixtureServer) {
    console.log(`isolated category fixture remains available at ${baseUrl}/__qa`);
  } else {
    await vite.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
}
