import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const admin = { id: 99, username: 'retrospective-responsive-qa', role: 'admin', name: '复盘列表响应式验收', enabled: true, force_change_password: false };
const retrospective = {
  id: 991,
  templateId: null,
  templateName: '周复盘模板',
  templateCategory: 'weekly',
  title: '验证移动端详情入口保持可见',
  scopeType: 'team',
  scopeId: null,
  periodStart: '2026-10-01',
  periodEnd: '2026-10-07',
  status: 'published',
  summaryMd: '',
  ownerId: admin.id,
  ownerName: admin.name,
  publishedAt: '2026-10-08 09:00:00',
  archivedAt: null,
  createdBy: admin.id,
  creatorName: admin.name,
  createdAt: '2026-10-08 09:00:00',
  updatedAt: '2026-10-08 09:00:00',
  version: 1,
  snapshotCount: 3,
  actionCount: 2,
};
const action = {
  id: 992,
  retroId: retrospective.id,
  retroTitle: retrospective.title,
  title: '复盘读取恢复验收行动项',
  descriptionMd: '',
  ownerId: admin.id,
  ownerName: admin.name,
  dueDate: '2099-10-30',
  status: 'todo',
  resultMd: '',
  closedAt: null,
  createdBy: admin.id,
  creatorName: admin.name,
  createdAt: '2026-10-08 09:00:00',
  updatedAt: '2026-10-08 09:00:00',
};

let retrospectiveListReadFailures = 0;
let myActionReadFailures = 0;
let retrospectiveListReadAttempts = 0;
let myActionReadAttempts = 0;
let retrospectiveCreateFailures = 0;
let retrospectiveCreateDelayMs = 0;
let retrospectiveCreateAttempts = 0;
let retrospectiveCreateCommits = 0;
let retrospectiveCreateStatusFailures = 0;
let retrospectiveCreateLoseResponseAfterCommit = false;
const retrospectiveCreateRequests = new Map<string, typeof retrospective>();
let userListReadFailures = 0;
let userListReadAttempts = 0;
let createdRetrospective: typeof retrospective | null = null;
let fixtureUser = admin;
let fixturePermissions = ['*'];
let filterRaceFixture = false;
let shortTitleFixture = false;
let holdNextListRead = false;
let failHeldListRead = false;
let releaseListRead: (() => void) | null = null;
let listReadStarted: (() => void) | null = null;
let holdNextActionsRead = false;
let releaseActionsRead: (() => void) | null = null;
let actionsReadStarted: (() => void) | null = null;
let holdNextUserListRead = false;
let releaseUserListRead: (() => void) | null = null;
let userListReadStarted: (() => void) | null = null;

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  shortTitleFixture = req.query.shortTitle === '1';
  fixtureUser = req.query.restricted === '1'
    ? { ...admin, id: 102, username: 'retrospective-limited-qa', role: 'director', name: '成员名单权限受限验收' }
    : admin;
  fixturePermissions = fixtureUser.role === 'admin'
    ? ['*']
    : ['analytics:retro:view', 'analytics:retro:create'];
  if (req.query.failUsers) userListReadFailures = Number(req.query.failUsers) || 1;
  if (req.query.fail === 'both') {
    retrospectiveListReadFailures = 1;
    myActionReadFailures = 1;
  }
  if (req.query.holdActions === '1') holdNextActionsRead = true;
  const destination = req.query.detail === '1' ? `/retrospectives/${retrospective.id}` : '/retrospectives';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(fixtureUser))});localStorage.setItem('xmt_token','retrospective-responsive-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace(${JSON.stringify(destination)});</script>`);
});
app.post('/__qa/fail-next-reads', (req, res) => {
  if (req.query.scope === 'both' || req.query.scope === 'list') retrospectiveListReadFailures += 1;
  if (req.query.scope === 'both' || req.query.scope === 'actions') myActionReadFailures += 1;
  res.json({ ok: true });
});
app.post('/__qa/release-action-read', (_req, res) => {
  if (!releaseActionsRead) return res.status(409).json({ ok: false, message: '当前没有等待释放的行动项读取' });
  const release = releaseActionsRead;
  releaseActionsRead = null;
  release();
  return res.json({ ok: true });
});
app.post('/__qa/configure-create', (req, res) => {
  retrospectiveCreateFailures = Number(req.body.failures) || 0;
  retrospectiveCreateDelayMs = Number(req.body.delayMs) || 0;
  retrospectiveCreateStatusFailures = Number(req.body.statusFailures) || 0;
  retrospectiveCreateLoseResponseAfterCommit = req.body.loseResponseAfterCommit === true;
  res.json({ ok: true });
});
app.post('/__qa/configure-filter-race', (req, res) => {
  filterRaceFixture = req.body.enabled === true;
  holdNextListRead = req.body.holdNext === true;
  failHeldListRead = req.body.failHeld === true;
  res.json({ ok: true });
});
app.post('/__qa/release-filter-read', (_req, res) => {
  if (!releaseListRead) return res.status(409).json({ ok: false, message: '当前没有等待释放的列表读取' });
  const release = releaseListRead;
  releaseListRead = null;
  release();
  return res.json({ ok: true });
});
app.get('/api/auth/me', (_req, res) => res.json(fixtureUser));
app.get('/api/permissions/my', (_req, res) => res.json(fixturePermissions));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/retrospectives/actions/mine', async (_req, res) => {
  myActionReadAttempts += 1;
  const resultAction = filterRaceFixture ? { ...action, title: `${fixtureUser.id === admin.id ? '旧账号' : '新账号'}行动项`, ownerId: fixtureUser.id } : action;
  if (holdNextActionsRead) {
    holdNextActionsRead = false;
    await new Promise<void>((resolve) => { releaseActionsRead = resolve; actionsReadStarted?.(); });
  }
  if (myActionReadFailures > 0) {
    myActionReadFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘行动项读取失败' });
  }
  return res.json({ success: true, data: { actions: [resultAction] } });
});
app.get('/api/retrospectives/templates', (_req, res) => res.json({ success: true, data: { templates: [] } }));
app.get('/api/retrospectives/create-requests/:requestId', (_req, res) => {
  if (retrospectiveCreateStatusFailures > 0) {
    retrospectiveCreateStatusFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟创建状态暂时不可用' });
  }
  const item = retrospectiveCreateRequests.get(_req.params.requestId);
  return res.json({
    success: true,
    data: item ? { state: 'created', retrospectiveId: item.id } : { state: 'not_found' },
  });
});
app.get('/api/retrospectives', async (req, res) => {
  retrospectiveListReadAttempts += 1;
  const queryStatus = String(req.query.status || 'all');
  const resultRetro = filterRaceFixture ? {
    ...retrospective,
    title: `${fixtureUser.id === admin.id ? '旧账号' : '新账号'}${queryStatus}筛选结果`,
    status: queryStatus === 'all' ? 'published' : queryStatus,
    ownerId: fixtureUser.id,
  } : shortTitleFixture ? { ...retrospective, title: '短标题' } : retrospective;
  const isHeld = holdNextListRead;
  const shouldFailHeld = failHeldListRead;
  if (isHeld) {
    holdNextListRead = false;
    failHeldListRead = false;
    await new Promise<void>((resolve) => { releaseListRead = resolve; listReadStarted?.(); });
  }
  if (isHeld && shouldFailHeld) return res.status(503).json({ success: false, message: '已过期筛选的迟到读取错误' });
  if (retrospectiveListReadFailures > 0) {
    retrospectiveListReadFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘列表读取失败' });
  }
  return res.json({ success: true, data: { retrospectives: [resultRetro] } });
});
app.post('/api/retrospectives', async (req, res) => {
  retrospectiveCreateAttempts += 1;
  if (retrospectiveCreateDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retrospectiveCreateDelayMs));
  if (retrospectiveCreateFailures > 0) {
    retrospectiveCreateFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘创建失败' });
  }
  const requestId = req.get('X-Idempotency-Key');
  const existing = requestId ? retrospectiveCreateRequests.get(requestId) : null;
  if (existing) {
    createdRetrospective = existing;
    return res.json({ success: true, data: { retrospective: existing, template: null, snapshots: [], actions: [], permissions: { canEdit: true, canPublish: true, canArchive: false, canManageActions: true } } });
  }
  createdRetrospective = {
    ...retrospective,
    id: 993,
    title: String(req.body.title || ''),
    status: 'draft',
    snapshotCount: 0,
    actionCount: 0,
  };
  retrospectiveCreateCommits += 1;
  if (requestId) retrospectiveCreateRequests.set(requestId, createdRetrospective);
  if (retrospectiveCreateLoseResponseAfterCommit) {
    retrospectiveCreateLoseResponseAfterCommit = false;
    return res.status(503).json({ success: false, message: '模拟复盘已写入但响应丢失' });
  }
  return res.json({
    success: true,
    data: {
      retrospective: createdRetrospective,
      template: null,
      snapshots: [],
      actions: [],
      permissions: { canEdit: true, canPublish: true, canArchive: false, canManageActions: true },
    },
  });
});
app.get('/api/retrospectives/:id', (req, res) => {
  const item = Number(req.params.id) === 993 && createdRetrospective ? createdRetrospective : retrospective;
  return res.json({
    success: true,
    data: {
      retrospective: item,
      template: null,
      snapshots: [],
      actions: [],
      permissions: { canEdit: item.status === 'draft', canPublish: item.status === 'draft', canArchive: false, canManageActions: true },
    },
  });
});
app.get('/api/retrospectives/:id/daily-risks', (_req, res) => res.json({ success: true, data: { risks: [] } }));
app.get('/api/users', async (req, res) => {
  userListReadAttempts += 1;
  const authorization = req.get('authorization') || '';
  const visibleUser = authorization.includes('second-account-fixture')
    ? { ...admin, id: 101, name: '新账号可见成员', username: 'new-visible-member' }
    : { ...admin, id: 98, name: '旧账号可见成员', username: 'old-visible-member' };
  if (holdNextUserListRead) {
    holdNextUserListRead = false;
    await new Promise<void>((resolve) => { releaseUserListRead = resolve; userListReadStarted?.(); });
  }
  if (userListReadFailures > 0) {
    userListReadFailures -= 1;
    return res.status(503).json({ message: '模拟成员名单暂时不可用' });
  }
  return res.json({ data: [visibleUser], total: 1, page: 1, limit: 200 });
});
app.use('/api', (_req, res) => res.json({ success: true, data: {} }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
  assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
if (process.env.XMT_RETRO_LIST_QA_SERVE === '1') {
  console.log(`Isolated retrospective list QA fixture: ${base}/__qa?theme=light`);
  await new Promise<void>(() => undefined);
}
const browser = await chromium.launch({ headless: true });

async function assertMinTouchHeight(locator: import('playwright').Locator, context: string) {
  const bounds = await locator.boundingBox();
  assert(bounds, `${context} has measurable bounds`);
  assert.ok(bounds.height >= 40, `${context} is ${bounds.height}px high; expected at least 40px`);
}

async function assertRetroCreateDialogControls(page: import('playwright').Page, context: string) {
  const fields = [
    ['标题', page.getByLabel('标题', { exact: true })],
    ['类型', page.getByLabel('类型', { exact: true })],
    ['模板', page.getByLabel('模板', { exact: true })],
    ['复盘范围', page.getByLabel('复盘范围', { exact: true })],
    ['负责人', page.getByLabel('负责人', { exact: true })],
    ['开始日期', page.getByLabel('开始日期', { exact: true })],
    ['结束日期', page.getByLabel('结束日期', { exact: true })],
  ] as const;

  for (const [name, field] of fields) {
    await assertMinTouchHeight(field, `${context} dialog field "${name}"`);
    await field.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const focusState = await field.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        active: document.activeElement === element,
        focusVisible: element.matches(':focus-visible'),
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineOffset: style.outlineOffset,
      };
    });
    assert.equal(focusState.active, true, `${context} keyboard navigation returns to "${name}"`);
    assert.equal(focusState.focusVisible, true, `${context} "${name}" reports keyboard focus`);
    assert.equal(focusState.outlineWidth, '2px', `${context} "${name}" keeps the Studio 2px focus ring`);
    assert.equal(focusState.outlineStyle, 'solid', `${context} "${name}" focus ring is visible`);
    assert.equal(focusState.outlineOffset, '2px', `${context} "${name}" focus ring has the Studio offset`);
  }

  await assertMinTouchHeight(page.getByRole('button', { name: '取消', exact: true }), `${context} cancel action`);
  await assertMinTouchHeight(page.getByRole('button', { name: '创建复盘', exact: true }), `${context} submit action`);
  const pageWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(pageWidth.scroll <= pageWidth.client, `${context} create dialog does not overflow horizontally`);
}

try {
  const errors: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1440]) {
      const useShortTitle = theme === 'light' && width === 320;
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${base}/__qa?theme=${theme}${useShortTitle ? '&shortTitle=1' : ''}`);
      await page.getByRole('heading', { name: '复盘中心' }).waitFor();
      await page.getByRole('heading', { name: '复盘列表' }).waitFor();
      for (const [name, field] of [
        ['复盘状态', page.getByRole('combobox', { name: '复盘状态', exact: true })],
        ['复盘类型', page.getByRole('combobox', { name: '复盘类型', exact: true })],
        ['开始日期', page.getByLabel('开始日期', { exact: true })],
        ['结束日期', page.getByLabel('结束日期', { exact: true })],
      ] as const) {
        assert.equal(await field.count(), 1, `${theme}/${width}px filter exposes the accessible name "${name}"`);
        assert.equal(await field.isVisible(), true, `${theme}/${width}px filter "${name}" is visible`);
        await assertMinTouchHeight(field, `${theme}/${width}px filter "${name}"`);
      }
      const titleButton = page.getByRole('button', { name: useShortTitle ? '短标题' : retrospective.title, exact: true });
      assert.equal(await titleButton.count(), 1, `${theme}/${width}px list title is an accessible detail entry`);
      await assertMinTouchHeight(titleButton, `${theme}/${width}px list title detail entry`);
      const actions = page.getByTestId(`retrospective-row-actions-${retrospective.id}`);
      await actions.waitFor();
      const geometry = await actions.evaluate((cell) => {
        const scrollArea = cell.closest('div.overflow-x-auto');
        const rect = cell.getBoundingClientRect();
        return {
          position: getComputedStyle(cell).position,
          left: rect.left,
          right: rect.right,
          viewportWidth: document.documentElement.clientWidth,
          pageWidth: document.documentElement.scrollWidth,
          scrollLeft: scrollArea?.getBoundingClientRect().left ?? -1,
          scrollRight: scrollArea?.getBoundingClientRect().right ?? -1,
        };
      });
      assert.equal(geometry.position, 'sticky', `${theme}/${width}px detail action stays fixed`);
      assert.ok(geometry.left >= geometry.scrollLeft - 1 && geometry.right <= geometry.scrollRight + 1, `${theme}/${width}px action is inside the table viewport: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.pageWidth <= geometry.viewportWidth, `${theme}/${width}px page has no horizontal overflow`);
      const detail = actions.locator('button', { hasText: '详情' });
      assert.equal(await detail.isVisible(), true, `${theme}/${width}px detail button remains visible`);
      const bounds = await detail.boundingBox();
      assert(bounds && bounds.x >= geometry.scrollLeft - 1 && bounds.x + bounds.width <= geometry.scrollRight + 1, `${theme}/${width}px detail button is in the visible viewport`);
      if (width <= 390) {
        await detail.scrollIntoViewIfNeeded();
        const buttonRect = await detail.boundingBox();
        const navRect = await page.getByRole('navigation', { name: '移动主导航' }).boundingBox();
        assert(buttonRect && navRect && buttonRect.y + buttonRect.height <= navRect.y + 1, `${theme}/${width}px detail action clears the fixed bottom navigation`);
      }
      const panelOverflow = await page.getByTestId('retrospective-list-panel').evaluate((panel) => ({ x: getComputedStyle(panel).overflowX, y: getComputedStyle(panel).overflowY }));
      assert.deepEqual(panelOverflow, { x: 'visible', y: 'visible' }, `${theme}/${width}px outer card does not clip the table scroll area`);
      await page.screenshot({ path: `/tmp/xmt-retrospective-list-${theme}-${width}.png`, fullPage: true });
      await page.close();
    }
  }

  retrospectiveListReadFailures = 0;
  myActionReadFailures = 0;
  retrospectiveListReadAttempts = 0;
  myActionReadAttempts = 0;
  const recoveryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expected503 = 0;
  recoveryPage.on('pageerror', (error) => errors.push(error.message));
  recoveryPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expected503 > 0 && message.text().includes('503')) {
      expected503 -= 1;
      return;
    }
    errors.push(message.text());
  });
  expected503 = 2;
  await recoveryPage.goto(`${base}/__qa?theme=light&fail=both`);
  await recoveryPage.getByRole('heading', { name: '复盘中心' }).waitFor();
  await recoveryPage.getByRole('alert').filter({ hasText: '复盘列表暂不可用' }).waitFor();
  await recoveryPage.getByRole('alert').filter({ hasText: '个人行动项暂不可用' }).waitFor();
  assert.equal(await recoveryPage.getByText('暂无复盘', { exact: true }).count(), 0, 'failed retrospective list read is not shown as empty');
  assert.equal(await recoveryPage.getByText('当前没有需要你跟进的复盘行动项。', { exact: true }).count(), 0, 'failed personal action read is not silently shown as empty');
  assert.equal(retrospectiveListReadAttempts, 1, 'one initial retrospective read is issued despite the failure state update');
  assert.equal(myActionReadAttempts, 1, 'one initial action read is issued despite the failure state update');

  const listRetry = recoveryPage.waitForResponse((response) => response.url().includes('/api/retrospectives?') && response.request().method() === 'GET' && response.status() === 200);
  const actionsRetry = recoveryPage.waitForResponse((response) => response.url().includes('/api/retrospectives/actions/mine') && response.request().method() === 'GET' && response.status() === 200);
  await recoveryPage.getByRole('button', { name: '重新加载复盘列表' }).click();
  await recoveryPage.getByRole('button', { name: '重新加载行动项' }).click();
  await Promise.all([listRetry, actionsRetry]);
  await recoveryPage.getByTestId('retrospective-list-panel').getByRole('button', { name: retrospective.title, exact: true }).waitFor();
  await recoveryPage.getByTestId('my-retro-actions-panel').getByRole('button', { name: new RegExp(action.title) }).waitFor();

  await recoveryPage.evaluate(async () => { await fetch('/__qa/fail-next-reads?scope=both', { method: 'POST' }); });
  expected503 += 2;
  const listRefreshFailure = recoveryPage.waitForResponse((response) => response.url().includes('/api/retrospectives?') && response.request().method() === 'GET' && response.status() === 503);
  const actionsRefreshFailure = recoveryPage.waitForResponse((response) => response.url().includes('/api/retrospectives/actions/mine') && response.request().method() === 'GET' && response.status() === 503);
  await recoveryPage.getByTestId('retrospective-list-panel').getByRole('button', { name: '刷新', exact: true }).click();
  await recoveryPage.getByTestId('my-retro-actions-panel').getByRole('button', { name: '刷新', exact: true }).click();
  await Promise.all([listRefreshFailure, actionsRefreshFailure]);
  await recoveryPage.getByRole('alert').filter({ hasText: '仍显示最近一次成功读取的记录' }).waitFor();
  await recoveryPage.getByRole('alert').filter({ hasText: '仍显示最近一次成功读取的内容' }).waitFor();
  await recoveryPage.getByTestId('retrospective-list-panel').getByRole('button', { name: retrospective.title, exact: true }).waitFor();
  await recoveryPage.getByTestId('my-retro-actions-panel').getByRole('button', { name: new RegExp(action.title) }).waitFor();

  const listRecovery = recoveryPage.waitForResponse((response) => response.url().includes('/api/retrospectives?') && response.request().method() === 'GET' && response.status() === 200);
  const actionsRecovery = recoveryPage.waitForResponse((response) => response.url().includes('/api/retrospectives/actions/mine') && response.request().method() === 'GET' && response.status() === 200);
  await recoveryPage.getByRole('button', { name: '重新加载复盘列表' }).click();
  await recoveryPage.getByRole('button', { name: '重新加载行动项' }).click();
  await Promise.all([listRecovery, actionsRecovery]);
  assert.equal(retrospectiveListReadAttempts, 4, 'list recovery and retry only perform the expected GET requests');
  assert.equal(myActionReadAttempts, 4, 'action recovery and retry only perform the expected GET requests');
  assert.equal(expected503, 0, 'all expected 503 console messages are accounted for');
  assert.deepEqual(errors, [], 'retrospective list has no unexpected browser errors');
  await recoveryPage.close();

  userListReadFailures = 0;
  userListReadAttempts = 0;
  const directoryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedAssignee503 = 0;
  directoryPage.on('pageerror', (error) => errors.push(error.message));
  directoryPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedAssignee503 > 0 && message.text().includes('503')) {
      expectedAssignee503 -= 1;
      return;
    }
    errors.push(message.text());
  });
  expectedAssignee503 = 1;
  await directoryPage.goto(`${base}/__qa?theme=light&failUsers=1`);
  await directoryPage.getByRole('heading', { name: '复盘中心' }).waitFor();
  await directoryPage.getByRole('button', { name: '新建复盘' }).click();
  await directoryPage.getByRole('alert').filter({ hasText: '成员名单暂不可用' }).waitFor();
  const ownerSelect = directoryPage.getByLabel('负责人');
  assert.equal(await ownerSelect.locator('option', { hasText: '复盘列表响应式验收' }).count(), 1, 'a failed member list keeps the current user as a safe fallback');
  assert.equal(await ownerSelect.locator('option', { hasText: '旧账号可见成员' }).count(), 0, 'the incomplete directory is not presented as complete');
  await directoryPage.screenshot({ path: '/tmp/xmt-retro-assignee-directory-error-390.png', fullPage: true });
  const directoryRetry = directoryPage.waitForResponse((response) => response.url().includes('/api/users') && response.request().method() === 'GET' && response.status() === 200);
  await directoryPage.getByRole('button', { name: '重新加载成员名单', exact: true }).click();
  await directoryRetry;
  await directoryPage.waitForFunction(() => Array.from(document.querySelectorAll('select option')).some((option) => option.textContent?.includes('旧账号可见成员')));
  assert.equal(await ownerSelect.locator('option', { hasText: '旧账号可见成员' }).count(), 1, 'a successful retry restores the complete member option');
  assert.equal(await directoryPage.getByRole('alert').filter({ hasText: '成员名单暂不可用' }).count(), 0, 'successful directory retry clears the warning');
  assert.equal(userListReadAttempts, 2, 'member list failure and explicit retry issue exactly two read requests');
  await directoryPage.close();

  userListReadFailures = 0;
  userListReadAttempts = 0;
  const detailDirectoryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  detailDirectoryPage.on('pageerror', (error) => errors.push(error.message));
  detailDirectoryPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedAssignee503 > 0 && message.text().includes('503')) {
      expectedAssignee503 -= 1;
      return;
    }
    errors.push(message.text());
  });
  expectedAssignee503 = 1;
  await detailDirectoryPage.goto(`${base}/__qa?theme=light&detail=1&failUsers=1`);
  await detailDirectoryPage.getByRole('heading', { name: retrospective.title, exact: true }).waitFor();
  await detailDirectoryPage.getByRole('alert').filter({ hasText: '成员名单暂不可用' }).waitFor();
  const detailDirectoryRetry = detailDirectoryPage.waitForResponse((response) => response.url().includes('/api/users') && response.request().method() === 'GET' && response.status() === 200);
  await detailDirectoryPage.getByRole('button', { name: '重新加载成员名单', exact: true }).click();
  await detailDirectoryRetry;
  assert.equal(await detailDirectoryPage.getByRole('alert').filter({ hasText: '成员名单暂不可用' }).count(), 0, 'detail action-owner directory can be retried after a read failure');
  assert.equal(userListReadAttempts, 2, 'detail directory failure and retry issue exactly two read requests');
  await detailDirectoryPage.close();

  userListReadAttempts = 0;
  const restrictedDirectoryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  restrictedDirectoryPage.on('pageerror', (error) => errors.push(error.message));
  restrictedDirectoryPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await restrictedDirectoryPage.goto(`${base}/__qa?theme=light&restricted=1`);
  await restrictedDirectoryPage.getByRole('heading', { name: '复盘中心' }).waitFor();
  await restrictedDirectoryPage.getByRole('button', { name: '新建复盘' }).click();
  await restrictedDirectoryPage.getByRole('status').filter({ hasText: '暂未确认具备查看成员名单的权限' }).waitFor();
  const restrictedOwnerSelect = restrictedDirectoryPage.getByLabel('负责人');
  assert.equal(await restrictedOwnerSelect.locator('option', { hasText: '成员名单权限受限验收' }).count(), 1, 'a user without member-view permission can still choose themself');
  assert.equal(await restrictedOwnerSelect.locator('option', { hasText: '可见成员' }).count(), 0, 'a user without member-view permission never fetches other members');
  const permissionRetry = restrictedDirectoryPage.waitForResponse((response) => response.url().includes('/api/permissions/my') && response.request().method() === 'GET');
  await restrictedDirectoryPage.getByRole('button', { name: '重新检查权限', exact: true }).click();
  await permissionRetry;
  await restrictedDirectoryPage.getByRole('status').filter({ hasText: '暂未确认具备查看成员名单的权限' }).waitFor();
  assert.equal(userListReadAttempts, 0, 'permission-limited users do not request the member directory, including after permission retry');
  await restrictedDirectoryPage.close();

  holdNextUserListRead = true;
  userListReadAttempts = 0;
  const usersReadStarted = new Promise<void>((resolve) => { userListReadStarted = resolve; });
  const directoryRacePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  directoryRacePage.on('pageerror', (error) => errors.push(error.message));
  directoryRacePage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await directoryRacePage.goto(`${base}/__qa?theme=light`);
  await directoryRacePage.getByRole('heading', { name: '复盘中心' }).waitFor();
  await usersReadStarted;
  const directoryRaceUser = { ...admin, id: 100, name: '新账号复盘验收', username: 'retrospective-directory-second-account', role: 'director' };
  fixtureUser = directoryRaceUser;
  fixturePermissions = ['analytics:retro:view', 'analytics:retro:create', 'user:view'];
  const newAccountDirectoryResponse = directoryRacePage.waitForResponse((response) => response.url().includes('/api/users') && response.request().headers().authorization?.includes('second-account-fixture'));
  await directoryRacePage.evaluate(async (user) => {
    const { useAuthStore } = await import('/src/store/index.ts');
    useAuthStore.getState().login(user, 'second-account-fixture', { persist: 'memory' });
  }, directoryRaceUser);
  const newAccountDirectory = await newAccountDirectoryResponse;
  await directoryRacePage.getByRole('button', { name: '新建复盘' }).click();
  const switchedOwnerSelect = directoryRacePage.getByLabel('负责人');
  await directoryRacePage.waitForFunction(() => Array.from(document.querySelectorAll('select option')).some((option) => option.textContent?.includes('新账号可见成员')));
  assert.equal(await switchedOwnerSelect.locator('option', { hasText: '新账号可见成员' }).count(), 1, 'the current account member appears in the owner options');
  assert.equal(await switchedOwnerSelect.locator('option', { hasText: '旧账号可见成员' }).count(), 0, 'the new account receives only its own member directory');
  const delayedOldDirectoryResponse = directoryRacePage.waitForResponse((response) => response.url().includes('/api/users') && response.request().headers().authorization?.includes('retrospective-responsive-fixture'));
  releaseUserListRead?.();
  releaseUserListRead = null;
  await delayedOldDirectoryResponse;
  await directoryRacePage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  assert.equal(await switchedOwnerSelect.locator('option', { hasText: '新账号可见成员' }).count(), 1, 'a late old-account response cannot replace the current member directory');
  assert.equal(await switchedOwnerSelect.locator('option', { hasText: '旧账号可见成员' }).count(), 0, 'no previous-account member is exposed after its response arrives');
  assert.equal(userListReadAttempts, 2, 'account switch causes one new scoped directory request');
  assert.ok(newAccountDirectory.ok(), 'the current account member request succeeds');
  await directoryRacePage.close();
  assert.equal(expectedAssignee503, 0, 'both expected member-directory 503 responses are accounted for');

  retrospectiveCreateAttempts = 0;
  retrospectiveCreateCommits = 0;
  retrospectiveCreateRequests.clear();
  createdRetrospective = null;
  const createPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedCreate503 = 0;
  const createRequestIds: string[] = [];
  createPage.on('request', (request) => {
    if (request.url().endsWith('/api/retrospectives') && request.method() === 'POST') {
      createRequestIds.push(request.headers()['x-idempotency-key'] || '');
    }
  });
  createPage.on('pageerror', (error) => errors.push(error.message));
  createPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedCreate503 > 0 && message.text().includes('503')) {
      expectedCreate503 -= 1;
      return;
    }
    errors.push(message.text());
  });
  await createPage.goto(`${base}/__qa?theme=light`);
  await createPage.getByRole('heading', { name: '复盘中心' }).waitFor();
  await createPage.getByRole('button', { name: '新建复盘' }).click();
  const titleInput = createPage.getByLabel('标题');
  await assertRetroCreateDialogControls(createPage, 'light/390px');
  const createTitle = '复盘创建失败保留与重复提交验收';
  await titleInput.fill(createTitle);
  await createPage.evaluate(async () => {
    await fetch('/__qa/configure-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 1, delayMs: 180 }),
    });
  });

  expectedCreate503 = 1;
  const failedCreate = createPage.waitForResponse((response) => response.url().endsWith('/api/retrospectives') && response.request().method() === 'POST' && response.status() === 503);
  await createPage.getByRole('button', { name: '创建复盘', exact: true }).dblclick({ delay: 10 });
  await failedCreate;
  await createPage.getByRole('button', { name: '用原请求编号重试' }).waitFor();
  assert.equal(retrospectiveCreateAttempts, 1, 'rapid duplicate create clicks send one POST');
  assert.equal(await titleInput.inputValue(), createTitle, 'failed create retains the entered title');
  assert.equal(await createPage.getByRole('heading', { name: '新建复盘' }).isVisible(), true, 'failed create keeps the dialog open for retry');
  assert.equal(await createPage.getByLabel('标题').isDisabled(), true, 'a pending request locks its original payload');

  await createPage.evaluate(async () => {
    await fetch('/__qa/configure-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, delayMs: 180 }),
    });
  });
  const successfulCreate = createPage.waitForResponse((response) => response.url().endsWith('/api/retrospectives') && response.request().method() === 'POST' && response.status() === 200);
  await createPage.getByRole('button', { name: '用原请求编号重试' }).dblclick({ delay: 10 });
  await successfulCreate;
  await createPage.getByRole('heading', { name: createTitle }).waitFor();
  assert.equal(createPage.url().endsWith('/retrospectives/993'), true, 'confirmed create opens the new retrospective detail');
  assert.equal(retrospectiveCreateAttempts, 2, 'explicit retry is the only second create request');
  assert.equal(retrospectiveCreateCommits, 1, 'same-key retry creates exactly one retrospective');
  assert.equal(createRequestIds.length, 2, 'both the original and retry requests carry an idempotency key');
  assert.ok(createRequestIds[0], 'the first create has a client request key');
  assert.equal(createRequestIds[1], createRequestIds[0], 'the retry reuses the original request key');
  assert.equal(expectedCreate503, 0, 'all expected create failure responses are accounted for');
  assert.deepEqual(errors, [], 'retrospective create flow has no unexpected browser errors');
  await createPage.close();

  for (const { width, height, theme } of [
    { width: 1440, height: 960, theme: 'dark' },
    { width: 320, height: 844, theme: 'dark' },
  ]) {
    const focusPage = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    focusPage.on('pageerror', (error) => errors.push(error.message));
    focusPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await focusPage.goto(`${base}/__qa?theme=${theme}`);
    await focusPage.getByRole('heading', { name: '复盘中心' }).waitFor();
    await focusPage.getByRole('button', { name: '新建复盘' }).click();
    await assertRetroCreateDialogControls(focusPage, `${theme}/${width}px`);
    await focusPage.close();
  }

  retrospectiveCreateAttempts = 0;
  retrospectiveCreateCommits = 0;
  retrospectiveCreateRequests.clear();
  createdRetrospective = null;
  const createCommitRecoveryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedLostCreateResponses = 0;
  createCommitRecoveryPage.on('pageerror', (error) => errors.push(error.message));
  createCommitRecoveryPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedLostCreateResponses > 0 && message.text().includes('503')) { expectedLostCreateResponses -= 1; return; }
    errors.push(message.text());
  });
  await createCommitRecoveryPage.goto(`${base}/__qa?theme=light`);
  await createCommitRecoveryPage.getByRole('heading', { name: '复盘中心' }).waitFor();
  await createCommitRecoveryPage.getByRole('button', { name: '新建复盘' }).click();
  const recoveryTitle = '服务端已创建但响应丢失后的自动恢复';
  await createCommitRecoveryPage.getByLabel('标题').fill(recoveryTitle);
  await createCommitRecoveryPage.evaluate(async () => {
    await fetch('/__qa/configure-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, statusFailures: 1, loseResponseAfterCommit: true }),
    });
  });
  expectedLostCreateResponses = 2;
  const lostResponse = createCommitRecoveryPage.waitForResponse((response) => response.url().endsWith('/api/retrospectives') && response.request().method() === 'POST' && response.status() === 503);
  const failedStatusRead = createCommitRecoveryPage.waitForResponse((response) => response.url().includes('/api/retrospectives/create-requests/') && response.status() === 503);
  await createCommitRecoveryPage.getByRole('button', { name: '创建复盘', exact: true }).click();
  await Promise.all([lostResponse, failedStatusRead]);
  await createCommitRecoveryPage.getByText('服务端暂时无法确认结果。可以重新核实；请不要新建另一条复盘。').waitFor();
  assert.equal(retrospectiveCreateAttempts, 1, 'a lost response does not trigger an automatic second POST');
  assert.equal(retrospectiveCreateCommits, 1, 'the simulated server committed once before losing the response');
  await createCommitRecoveryPage.reload();
  await createCommitRecoveryPage.getByRole('heading', { name: recoveryTitle }).waitFor();
  assert.equal(createCommitRecoveryPage.url().endsWith('/retrospectives/993'), true, 'reload status verification recovers the committed retrospective');
  assert.equal(retrospectiveCreateAttempts, 1, 'recovery after reload verifies status without resubmitting');
  assert.equal(retrospectiveCreateCommits, 1, 'reload recovery preserves exactly one committed retrospective');
  assert.deepEqual(errors, [], 'retrospective create recovery has no unexpected browser errors');
  await createCommitRecoveryPage.close();

  filterRaceFixture = true;
  const racePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedLate503 = 0;
  const listReadUrls: string[] = [];
  racePage.on('pageerror', (error) => errors.push(error.message));
  racePage.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/retrospectives') {
      listReadUrls.push(request.url());
    }
  });
  racePage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedLate503 > 0 && message.text().includes('503')) { expectedLate503 -= 1; return; }
    errors.push(message.text());
  });
  await racePage.goto(`${base}/__qa?theme=light`);
  await racePage.getByRole('heading', { name: '复盘中心' }).waitFor();
  const raceList = racePage.getByTestId('retrospective-list-panel');
  const raceActions = racePage.getByTestId('my-retro-actions-panel');
  await raceList.getByRole('button', { name: '旧账号all筛选结果', exact: true }).waitFor();
  assert.equal(listReadUrls.length, 1, 'initial page load reads the retrospective list once');
  const statusFilter = racePage.locator('select').first();
  const categoryFilter = racePage.locator('select').nth(1);
  const startDateFilter = racePage.getByLabel('开始日期', { exact: true });
  const endDateFilter = racePage.getByLabel('结束日期', { exact: true });
  await statusFilter.selectOption('published');
  await categoryFilter.selectOption('weekly');
  await startDateFilter.fill('2026-10-01');
  await endDateFilter.fill('2026-10-20');
  await racePage.waitForTimeout(100);
  assert.equal(listReadUrls.length, 1, 'editing multiple draft filters does not issue partial list reads');
  holdNextListRead = true;
  const oldFilterStarted = new Promise<void>((resolve) => { listReadStarted = resolve; });
  const oldFilterResponse = racePage.waitForResponse((response) => response.url().includes('/api/retrospectives?') && response.url().includes('status=published') && response.url().includes('category=weekly'));
  await racePage.getByRole('button', { name: '应用筛选', exact: true }).click();
  await oldFilterStarted;
  assert.equal(listReadUrls.length, 2, 'one explicit apply issues exactly one list read');
  const appliedQuery = new URL(listReadUrls[1]).searchParams;
  assert.equal(appliedQuery.get('status'), 'published');
  assert.equal(appliedQuery.get('category'), 'weekly');
  assert.equal(appliedQuery.get('start'), '2026-10-01');
  assert.equal(appliedQuery.get('end'), '2026-10-20');
  await statusFilter.selectOption('draft');
  await categoryFilter.selectOption('project');
  await racePage.getByRole('button', { name: '应用筛选', exact: true }).click();
  await raceList.getByRole('button', { name: '旧账号draft筛选结果', exact: true }).waitFor();
  assert.equal(listReadUrls.length, 3, 'applying the next filter combination issues exactly one additional list read');
  releaseListRead?.();
  releaseListRead = null;
  await oldFilterResponse;
  await racePage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  assert.equal(await statusFilter.inputValue(), 'draft', 'the latest selected filter remains active');
  assert.equal(await raceList.getByRole('button', { name: '旧账号draft筛选结果', exact: true }).count(), 1, 'a delayed earlier response cannot replace the latest filter result');
  assert.equal(await raceList.getByRole('button', { name: '旧账号published筛选结果', exact: true }).count(), 0);

  holdNextListRead = true;
  failHeldListRead = true;
  expectedLate503 = 1;
  const oldErrorStarted = new Promise<void>((resolve) => { listReadStarted = resolve; });
  const oldErrorResponse = racePage.waitForResponse((response) => response.url().includes('/api/retrospectives?') && response.url().includes('status=archived') && response.status() === 503);
  await statusFilter.selectOption('archived');
  await racePage.getByRole('button', { name: '应用筛选', exact: true }).click();
  await oldErrorStarted;
  await statusFilter.selectOption('published');
  await racePage.getByRole('button', { name: '应用筛选', exact: true }).click();
  await raceList.getByRole('button', { name: '旧账号published筛选结果', exact: true }).waitFor();
  assert.equal(listReadUrls.length, 5, 'each explicit filter application adds one request, including during an in-flight read');
  releaseListRead?.();
  releaseListRead = null;
  await oldErrorResponse;
  await racePage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  assert.equal(await raceList.getByRole('alert').count(), 0, 'an expired filter failure cannot mark the successful current result as unavailable');
  assert.equal(await raceList.getByRole('button', { name: '旧账号published筛选结果', exact: true }).count(), 1);

  holdNextListRead = true;
  holdNextActionsRead = true;
  const oldAccountListStarted = new Promise<void>((resolve) => { listReadStarted = resolve; });
  const oldAccountActionsStarted = new Promise<void>((resolve) => { actionsReadStarted = resolve; });
  await raceList.getByRole('button', { name: '刷新', exact: true }).click();
  await raceActions.getByRole('button', { name: '刷新', exact: true }).click();
  await Promise.all([oldAccountListStarted, oldAccountActionsStarted]);
  const actionRefreshButton = raceActions.getByRole('button', { name: '刷新', exact: true });
  const actionLoadingStatus = raceActions.getByRole('status').filter({ hasText: '正在加载行动项...' });
  await actionLoadingStatus.waitFor();
  assert.equal(await actionRefreshButton.isDisabled(), true, 'personal actions refresh locks while the delayed read is pending');
  assert.equal(await actionRefreshButton.getAttribute('aria-busy'), 'true', 'personal actions refresh exposes its busy state');
  const actionSpinner = actionRefreshButton.locator('svg');
  assert.equal(await actionSpinner.getAttribute('aria-hidden'), 'true', 'the refresh spinner is decorative');
  assert.equal(await actionSpinner.evaluate((icon) => getComputedStyle(icon).animationName), 'none', 'the refresh spinner respects reduced motion');
  const nextUser = { ...admin, id: 100, name: '新账号复盘验收', username: 'retrospective-second-account' };
  fixtureUser = nextUser;
  await racePage.evaluate(async (user) => {
    const { useAuthStore } = await import('/src/store/index.ts');
    useAuthStore.getState().login(user, 'second-account-fixture', { persist: 'memory' });
  }, nextUser);
  await raceList.getByRole('button', { name: '新账号published筛选结果', exact: true }).waitFor();
  await raceActions.getByRole('button', { name: /新账号行动项/ }).waitFor();
  const oldAccountListResponse = racePage.waitForResponse((response) => response.url().includes('/api/retrospectives?'));
  const oldAccountActionsResponse = racePage.waitForResponse((response) => response.url().includes('/api/retrospectives/actions/mine'));
  releaseListRead?.();
  releaseListRead = null;
  releaseActionsRead?.();
  releaseActionsRead = null;
  await Promise.all([oldAccountListResponse, oldAccountActionsResponse]);
  await racePage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  assert.equal(await actionLoadingStatus.count(), 0, 'the action loading announcement clears after the current account response arrives');
  assert.equal(await actionRefreshButton.getAttribute('aria-busy'), 'false', 'the action refresh button clears its busy state after recovery');
  assert.equal(await raceList.getByRole('button', { name: '新账号published筛选结果', exact: true }).count(), 1, 'old account list responses cannot overwrite the new account');
  assert.equal(await raceActions.getByRole('button', { name: /新账号行动项/ }).count(), 1, 'old account action responses cannot overwrite the new account');
  assert.equal(await racePage.getByText(/旧账号.*(?:筛选结果|行动项)/).count(), 0, 'previous account content stays hidden after delayed reads finish');
  assert.equal(expectedLate503, 0, 'the single expected delayed 503 is accounted for');
  await racePage.screenshot({ path: '/tmp/xmt-retro-current-account-filter-390.png', fullPage: true });
  await racePage.close();
  assert.deepEqual(errors, [], 'retrospective list has no browser errors');
  console.log('复盘列表亮/暗主题 × 320/390/1440px 回归及新建失败保留、重复提交拦截与显式重试通过');
} finally {
  releaseListRead?.();
  releaseActionsRead?.();
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
  io.close();
}
