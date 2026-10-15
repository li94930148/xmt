import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 96, username: 'workflow-language-qa', role: 'admin', name: '审批流语言验收', enabled: true, force_change_password: false };
const template = {
  id: 961,
  name: '阶段顺序验收模板',
  description: '仅用于隔离浏览器语言回归',
  is_default: true,
  node_count: 1,
  topic_count: 0,
  creator_name: user.name,
};
const detail = {
  ...template,
  nodes: [{
    id: 1,
    name: '非法阶段示例',
    node_order: 1,
    status_from: 'pending',
    status_to: 'shooting',
    approver_type: 'role' as const,
    approver_value: 'director',
    is_required: true,
  }],
};
let deleteScenario = false;
let workflowTemplateExists = true;
let failNextWorkflowTemplateDelete = false;
let templateManagementTemplates: Array<Record<string, unknown>> = [];
let failNextTemplateManagementRead = false;
let templateManagementCreateCount = 0;
let templateManagementReadCount = 0;
let delayNextTemplateManagementCreate = false;
const rolePermission = { id: 11, code: 'topic:create', name: '创建选题', module: 'topic' };
const initialRoles = () => [
  { id: 1, code: 'admin', name: '管理员', description: '系统管理员', is_system: true, user_count: 1, permission_count: 2, permissions: [] },
  { id: 2, code: 'director', name: '负责人', description: '内容负责人', is_system: true, user_count: 1, permission_count: 1, permissions: [] },
  { id: 3, code: 'content_ops', name: '内容运营', description: '普通业务角色', is_system: false, user_count: 0, permission_count: 1, permissions: [rolePermission] },
];
let permissionRoles = initialRoles();
let roleReadRequests = 0;
let permissionReadRequests = 0;
let roleCreateRequests = 0;
let roleUpdateRequests = 0;
let roleDeleteRequests = 0;
let failNextRoleRead = false;
let failNextPermissionRead = false;
let failRoleReadAfterCreate = false;
let failRoleReadAfterUpdate = false;
let failNextRoleDelete = false;
let delayNextRoleCreate = false;

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  deleteScenario = req.query.delete === '1';
  workflowTemplateExists = true;
  failNextWorkflowTemplateDelete = false;
  if (req.query.page === 'permissions') {
    permissionRoles = initialRoles();
    roleReadRequests = 0;
    permissionReadRequests = 0;
    roleCreateRequests = 0;
    roleUpdateRequests = 0;
    roleDeleteRequests = 0;
    failNextRoleRead = req.query.initialRoleReadFail === '1';
    failNextPermissionRead = req.query.initialPermissionReadFail === '1';
    failRoleReadAfterCreate = req.query.createRefreshFail === '1';
    failRoleReadAfterUpdate = req.query.updateRefreshFail === '1';
    failNextRoleDelete = req.query.deleteFailOnce === '1';
    delayNextRoleCreate = req.query.delayCreate === '1';
  }
  if (req.query.page === 'templates') {
    templateManagementTemplates = [];
    failNextTemplateManagementRead = req.query.initialReadFail === '1';
    templateManagementCreateCount = 0;
    templateManagementReadCount = 0;
    delayNextTemplateManagementCreate = false;
  }
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  const route = req.query.page === 'permissions' ? '/permissions' : req.query.page === 'templates' ? '/templates' : '/workflow-designer';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','workflow-language-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace(${JSON.stringify(route)});</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/roles', (_req, res) => {
  roleReadRequests += 1;
  if (failNextRoleRead) {
    failNextRoleRead = false;
    return res.status(503).json({ message: '模拟角色列表读取失败' });
  }
  return res.json(permissionRoles);
});
app.post('/api/roles', async (req, res) => {
  roleCreateRequests += 1;
  const id = 4;
  permissionRoles = [...permissionRoles, { id, code: req.body.code, name: req.body.name, description: req.body.description, is_system: false, user_count: 0, permission_count: req.body.permission_ids?.length ?? 0, permissions: [] }];
  if (delayNextRoleCreate) {
    delayNextRoleCreate = false;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  if (failRoleReadAfterCreate) failNextRoleRead = true;
  return res.json({ message: '角色创建成功', id });
});
app.put('/api/roles/:id', (req, res) => {
  roleUpdateRequests += 1;
  permissionRoles = permissionRoles.map((role) => role.id === Number(req.params.id)
    ? { ...role, name: req.body.name, description: req.body.description, permission_count: req.body.permission_ids?.length ?? role.permission_count }
    : role);
  if (failRoleReadAfterUpdate) failNextRoleRead = true;
  return res.json({ message: '角色更新成功' });
});
app.delete('/api/roles/:id', (_req, res) => {
  roleDeleteRequests += 1;
  if (failNextRoleDelete) {
    failNextRoleDelete = false;
    return res.status(503).json({ message: '模拟角色删除失败' });
  }
  permissionRoles = permissionRoles.filter((role) => role.id !== Number(_req.params.id));
  return res.json({ message: '角色删除成功' });
});
app.get('/api/permissions', (_req, res) => {
  permissionReadRequests += 1;
  if (failNextPermissionRead) {
    failNextPermissionRead = false;
    return res.status(503).json({ message: '模拟权限清单读取失败' });
  }
  return res.json({ permissions: [rolePermission], grouped: { topic: [rolePermission] } });
});
app.get('/api/workflow-templates', (_req, res) => res.json(workflowTemplateExists ? [{ ...template, is_default: !deleteScenario }] : []));
app.get('/api/workflow-templates/:id', (_req, res) => res.json(detail));
app.delete('/api/workflow-templates/:id', (_req, res) => {
  if (failNextWorkflowTemplateDelete) {
    failNextWorkflowTemplateDelete = false;
    return res.status(503).json({ message: '模拟删除失败' });
  }
  workflowTemplateExists = false;
  return res.json({ message: '模板已删除' });
});
app.get('/api/templates', (_req, res) => {
  templateManagementReadCount++;
  if (failNextTemplateManagementRead) {
    failNextTemplateManagementRead = false;
    return res.status(503).json({ message: '模拟选题模板列表刷新失败' });
  }
  return res.json({ data: templateManagementTemplates });
});
app.post('/api/templates', async (req, res) => {
  templateManagementCreateCount += 1;
  const id = 1201;
  templateManagementTemplates.push({ ...req.body, id, creator_id: user.id, creator_name: user.name, created_at: '2026-10-09 10:00:00', updated_at: '2026-10-09 10:00:00' });
  if (delayNextTemplateManagementCreate) {
    delayNextTemplateManagementCreate = false;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return res.json({ message: '模板创建成功', id });
});
app.get('/api/workflow/shadow-logs', (_req, res) => res.json([]));
app.get('/api/users', (_req, res) => res.json({ data: [user], total: 1, page: 1, limit: 10 }));
app.use('/api', (_req, res) => res.json({ success: true, data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

function parseCssColor(value: string) {
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const expanded = hex.length === 3 ? hex.split('').map((part) => `${part}${part}`).join('') : hex;
    if (expanded.length === 6) return { rgb: [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)), alpha: 1 };
  }
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 } : null;
}

function relativeLuminance(rgb: number[]) {
  const channels = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

async function contrastRatio(locator: import('playwright').Locator) {
  const styles = await locator.evaluate((element) => {
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    const backgrounds = [getComputedStyle(document.documentElement).backgroundColor];
    for (const ancestor of ancestors) backgrounds.push(getComputedStyle(ancestor).backgroundColor);
    return { foreground: getComputedStyle(element).color, backgrounds };
  });
  const foreground = parseCssColor(styles.foreground)?.rgb;
  if (!foreground) return 0;
  let background = [255, 255, 255];
  for (const value of styles.backgrounds) {
    const layer = parseCssColor(value);
    if (!layer) continue;
    background = layer.rgb.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
  }
  const text = relativeLuminance(foreground);
  const surface = relativeLuminance(background);
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}

if (process.env.XMT_WORKFLOW_LANGUAGE_QA_SERVE === '1') {
  console.log(`Isolated workflow language QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  const expectedPermissionFailureLogs: string[] = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else if (message.text().includes('permissions.management_load_failed')) expectedPermissionFailureLogs.push(message.text());
    else errors.push(message.text());
  });
  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByTitle('编辑').click();
  await page.getByRole('heading', { name: '编辑审批流' }).waitFor();
  await page.getByText('高风险', { exact: true }).waitFor();
  await page.getByText(/需处理：不允许从「待审核」直接进入「成片制作」/).waitFor();
  const nodeCard = page.locator('[title*="历史参考记录："]');
  assert.equal(await nodeCard.count(), 1, 'the invalid node exposes one explanation tooltip');
  const tooltip = await nodeCard.getAttribute('title');
  assert(tooltip);
  assert.match(tooltip, /历史参考记录：0 条/);
  assert.match(tooltip, /风险提示：高风险/);
  assert.match(tooltip, /规则类别：阶段顺序/);
  assert.match(tooltip, /流程变更由你确认并保存/);
  assert.doesNotMatch(tooltip, /Shadow logs|Risk score|Blocked reason|Failed rule|strict mode|Workflow check/i);
  const body = await page.locator('body').innerText();
  assert.doesNotMatch(body, /high 路|medium 路|low 路|必须修复：strict mode/i);
  await page.screenshot({ path: '/tmp/xmt-workflow-language-1440.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'workflow editor fits a 390px viewport without horizontal overflow');
  assert.match(await page.locator('body').innerText(), /需处理：不允许从「待审核」直接进入「成片制作」/);
  await page.screenshot({ path: '/tmp/xmt-workflow-language-390.png', fullPage: true });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('heading', { name: '编辑审批流' }).waitFor({ state: 'hidden' });

  for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/__qa?theme=${theme}`);
    await page.getByRole('heading', { name: '审批流设计' }).waitFor();
    const workflowBadge = page.getByTestId('workflow-default-badge');
    assert.ok((await workflowBadge.getAttribute('class'))?.includes('bg-studio-primary-soft'), `${theme} default workflow badge uses the soft primary surface token`);
    assert.ok((await workflowBadge.getAttribute('class'))?.includes('text-studio-primary-contrast'), `${theme} default workflow badge uses the contrast-safe primary text token`);
    assert.ok(await contrastRatio(workflowBadge) >= 4.5, `${theme} default workflow badge contrast is at least 4.5:1`);
    assert.ok(await contrastRatio(page.getByTestId('workflow-default-icon').locator('svg')) >= 4.5, `${theme} default workflow icon contrast is at least 4.5:1`);

    await page.goto(`${base}/__qa?page=permissions&theme=${theme}`);
    await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
    const systemRoleBadge = page.getByTestId('system-role-badge').first();
    assert.ok((await systemRoleBadge.getAttribute('class'))?.includes('bg-studio-primary-soft'), `${theme} system role badge uses the soft primary surface token`);
    assert.ok((await systemRoleBadge.getAttribute('class'))?.includes('text-studio-primary-contrast'), `${theme} system role badge uses the contrast-safe primary text token`);
    assert.ok(await contrastRatio(systemRoleBadge) >= 4.5, `${theme} system role badge contrast is at least 4.5:1`);
    assert.ok(await contrastRatio(page.getByTestId('role-icon-admin').locator('svg')) >= 4.5, `${theme} administrator role icon contrast is at least 4.5:1`);
    const customRoleDelete = page.getByRole('button', { name: '删除角色 内容运营' });
    await customRoleDelete.hover();
    const deleteHoverBackground = await customRoleDelete.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.notEqual(deleteHoverBackground, 'rgba(0, 0, 0, 0)', `${theme} role delete hover applies its semantic surface`);
    assert.ok(await contrastRatio(customRoleDelete.locator('svg')) >= 3, `${theme} hovered role delete icon contrast is at least 3:1`);
    assert.equal(await page.getByRole('button', { name: '编辑角色 管理员' }).count(), 1, `${theme} edit action exposes an accessible role name`);
    await page.screenshot({ path: `/tmp/xmt-permission-badges-${theme}.png` });
  }

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/__qa?page=permissions&theme=light`);
    await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `permission role cards fit a ${width}px viewport without horizontal overflow`);
    const roleNames = page.getByTestId('role-name');
    for (let index = 0; index < await roleNames.count(); index += 1) {
      assert.equal(await roleNames.nth(index).evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      }), 1, `role names remain on one line at ${width}px`);
    }
    const editButtons = page.getByTitle('编辑');
    assert.equal(await editButtons.count(), 3, `role edit actions remain available at ${width}px`);
    for (let index = 0; index < await editButtons.count(); index += 1) {
      const box = await editButtons.nth(index).boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width, `role edit action stays inside the ${width}px viewport`);
    }
    const deleteRole = page.getByRole('button', { name: '删除角色 内容运营' });
    const deleteBox = await deleteRole.boundingBox();
    assert(deleteBox && deleteBox.x >= 0 && deleteBox.x + deleteBox.width <= width, `custom role delete action stays inside the ${width}px viewport`);
    await page.screenshot({ path: `/tmp/xmt-permission-roles-${width}.png` });
  }

  await page.goto(`${base}/__qa?page=permissions&initialRoleReadFail=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('alert').getByText('模拟角色列表读取失败', { exact: true }).waitFor();
  assert.equal(await page.getByText('暂无角色', { exact: true }).count(), 0, 'a failed role read must not be presented as an empty role list');
  assert.equal(await page.getByTestId('role-name').count(), 0, 'unavailable role data is not rendered as a real empty result');
  const roleReadsBeforeRetry = roleReadRequests;
  await page.getByRole('button', { name: '重新加载角色列表', exact: true }).click();
  await page.getByText('内容运营', { exact: true }).waitFor();
  assert.equal(roleReadRequests, roleReadsBeforeRetry + 1, 'role list retry performs one read');

  await page.goto(`${base}/__qa?page=permissions&initialPermissionReadFail=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('alert').getByText('模拟权限清单读取失败', { exact: true }).waitFor();
  assert.equal(await page.getByTestId('role-name').count(), 0, 'the page does not show editable roles when the permission catalog is unavailable');
  const permissionReadsBeforeRetry = permissionReadRequests;
  await page.getByRole('button', { name: '重新加载角色列表', exact: true }).click();
  await page.getByText('内容运营', { exact: true }).waitFor();
  assert.equal(permissionReadRequests, permissionReadsBeforeRetry + 1, 'permission catalog retry performs one read');

  await page.goto(`${base}/__qa?page=permissions&createRefreshFail=1&delayCreate=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  await page.getByRole('heading', { name: '新建角色', exact: true }).waitFor();
  await page.getByPlaceholder('如 editor').fill('qa_role');
  await page.getByPlaceholder('如 编辑').fill('隔离测试角色');
  const roleCreateResponse = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'POST' && response.status() === 200);
  const failedRoleListRefresh = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '创建', exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await Promise.all([roleCreateResponse, failedRoleListRefresh]);
  await page.getByText('服务器已确认角色创建，但列表刷新失败；请重新加载确认，不要重复创建。', { exact: true }).waitFor();
  assert.equal(roleCreateRequests, 1, 'rapid duplicate role create submits once');
  assert.equal(permissionRoles.length, 4, 'the isolated role create was confirmed by the server fixture');
  assert.equal(await page.getByTestId('role-name').count(), 3, 'the page does not fabricate a role row before reloading server data');
  const roleReadsBeforeWriteRetry = roleReadRequests;
  await page.getByRole('button', { name: '重新加载角色列表', exact: true }).click();
  await page.getByText('隔离测试角色', { exact: true }).waitFor();
  assert.equal(roleReadRequests, roleReadsBeforeWriteRetry + 1, 'post-write recovery retries only the list read');
  assert.equal(roleCreateRequests, 1, 'read-only retry does not repeat role creation');

  await page.goto(`${base}/__qa?page=permissions&updateRefreshFail=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '编辑角色 内容运营' }).click();
  await page.getByRole('heading', { name: '编辑角色', exact: true }).waitFor();
  await page.getByPlaceholder('如 编辑').fill('更新后的内容运营');
  const roleUpdateResponse = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'PUT' && response.status() === 200);
  const failedRoleUpdateRefresh = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await Promise.all([roleUpdateResponse, failedRoleUpdateRefresh]);
  await page.getByText('服务器已确认角色更新，但列表刷新失败；请重新加载确认，不要重复保存。', { exact: true }).waitFor();
  assert.equal(roleUpdateRequests, 1, 'the role update was sent once before the failed list refresh');
  assert.equal(await page.getByText('更新后的内容运营', { exact: true }).count(), 0, 'the page does not invent updated role details before reloading');
  const roleReadsBeforeUpdateRetry = roleReadRequests;
  await page.getByRole('button', { name: '重新加载角色列表', exact: true }).click();
  await page.getByText('更新后的内容运营', { exact: true }).waitFor();
  assert.equal(roleReadRequests, roleReadsBeforeUpdateRetry + 1, 'update recovery retries only the list read');
  assert.equal(roleUpdateRequests, 1, 'read-only update recovery does not repeat the role update');

  await page.goto(`${base}/__qa?page=permissions&deleteFailOnce=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '删除角色 内容运营' }).click();
  await page.getByRole('heading', { name: '确认删除角色', exact: true }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(roleDeleteRequests, 0, 'cancelling role deletion does not issue a write');
  await page.getByRole('button', { name: '删除角色 内容运营' }).click();
  const failedRoleDelete = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'DELETE' && response.status() === 503);
  await page.getByRole('button', { name: '删除角色', exact: true }).click();
  await failedRoleDelete;
  await page.getByText('删除失败', { exact: true }).waitFor();
  assert.equal(permissionRoles.some((role) => role.id === 3), true, 'failed role deletion leaves the server role intact');
  assert.equal(await page.getByRole('heading', { name: '确认删除角色', exact: true }).count(), 1, 'failed role deletion keeps confirmation available for retry');
  await page.getByRole('button', { name: '删除角色', exact: true }).click();
  await page.getByRole('heading', { name: '确认删除角色', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(permissionRoles.some((role) => role.id === 3), false, 'successful role deletion removes the isolated role');
  assert.equal(await page.getByTestId('role-name').count(), 2, 'confirmed role deletion immediately updates the current list');
  assert.equal(roleDeleteRequests, 2, 'failed delete retry issues exactly one additional request');

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/__qa?delete=1`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByTitle('删除').click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  failNextWorkflowTemplateDelete = true;
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除失败', { exact: true }).waitFor();
  assert.equal(workflowTemplateExists, true, 'failed workflow template deletion leaves the isolated template intact');
  assert.equal(await page.getByRole('heading', { name: '确认删除', exact: true }).count(), 1, 'failed workflow template deletion keeps its confirmation open for retry');
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除成功', { exact: true }).waitFor();
  assert.equal(workflowTemplateExists, false, 'successful workflow template deletion removes the isolated template');

  await page.goto(`${base}/__qa?page=templates&initialReadFail=1`);
  await page.getByRole('heading', { name: '选题模板', exact: true }).waitFor();
  await page.getByText('模板列表加载失败；当前列表不可用，请重新加载。', { exact: true }).waitFor();
  assert.equal(await page.getByText('还没有选题模板', { exact: true }).count(), 0, 'a failed initial read must not look like an empty template library');
  const failedInitialReadCount = templateManagementReadCount;
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText('还没有选题模板', { exact: true }).waitFor();
  assert.equal(templateManagementReadCount, failedInitialReadCount + 1, 'initial load retry performs one read only');

  await page.goto(`${base}/__qa?page=templates`);
  await page.getByRole('heading', { name: '选题模板', exact: true }).waitFor();
  await page.getByRole('textbox', { name: '名称' }).fill('刷新失败模板');
  await page.getByRole('textbox', { name: '模板正文' }).fill('仅用于隔离刷新恢复测试。');
  delayNextTemplateManagementCreate = true;
  failNextTemplateManagementRead = true;
  const templateCreate = page.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'POST' && response.status() === 200);
  const failedTemplateRefresh = page.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '保存模板', exact: true }).evaluate((button) => {
    const form = button.closest('form');
    if (!(form instanceof HTMLFormElement)) throw new Error('template form was not found');
    form.requestSubmit();
    form.requestSubmit();
  });
  await Promise.all([templateCreate, failedTemplateRefresh]);
  await page.getByText('服务端已确认模板保存，但列表刷新失败；请重新加载确认，不要重复保存。', { exact: true }).waitFor();
  assert.equal(templateManagementTemplates.length, 1, 'the create mutation persisted despite the failed list refresh');
  assert.equal(templateManagementCreateCount, 1, 'template create was submitted once before the refresh retry');
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText('刷新失败模板', { exact: true }).waitFor();
  assert.equal(templateManagementCreateCount, 1, 'retry reload does not repeat the template create mutation');

  assert.deepEqual(errors, [], 'workflow designer renders without browser errors');
  assert.equal(expectedHttpErrors.length, 8, 'the isolated workflow, template, and permission fixtures return eight intentional 503 responses');
  assert.equal(expectedPermissionFailureLogs.length, 4, 'permission read failures emit one sanitized diagnostic per failed read');
  await page.close();
  console.log('Workflow designer/permission browser test passed: localized risk labels, light/dark default and role badges >=4.5:1, hovered delete icons >=3:1, named role actions fit 320/390px, edit/close flow and no browser errors.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
