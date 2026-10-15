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
let createdRetrospective: typeof retrospective | null = null;
let fixtureUser = admin;
let filterRaceFixture = false;
let holdNextListRead = false;
let failHeldListRead = false;
let releaseListRead: (() => void) | null = null;
let listReadStarted: (() => void) | null = null;
let holdNextActionsRead = false;
let releaseActionsRead: (() => void) | null = null;
let actionsReadStarted: (() => void) | null = null;

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  if (req.query.fail === 'both') {
    retrospectiveListReadFailures = 1;
    myActionReadFailures = 1;
  }
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(admin))});localStorage.setItem('xmt_token','retrospective-responsive-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/retrospectives');</script>`);
});
app.post('/__qa/fail-next-reads', (req, res) => {
  if (req.query.scope === 'both' || req.query.scope === 'list') retrospectiveListReadFailures += 1;
  if (req.query.scope === 'both' || req.query.scope === 'actions') myActionReadFailures += 1;
  res.json({ ok: true });
});
app.post('/__qa/configure-create', (req, res) => {
  retrospectiveCreateFailures = Number(req.body.failures) || 0;
  retrospectiveCreateDelayMs = Number(req.body.delayMs) || 0;
  res.json({ ok: true });
});
app.get('/api/auth/me', (_req, res) => res.json(fixtureUser));
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
app.get('/api/retrospectives', async (req, res) => {
  retrospectiveListReadAttempts += 1;
  const queryStatus = String(req.query.status || 'all');
  const resultRetro = filterRaceFixture ? {
    ...retrospective,
    title: `${fixtureUser.id === admin.id ? '旧账号' : '新账号'}${queryStatus}筛选结果`,
    status: queryStatus === 'all' ? 'published' : queryStatus,
    ownerId: fixtureUser.id,
  } : retrospective;
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
  createdRetrospective = {
    ...retrospective,
    id: 993,
    title: String(req.body.title || ''),
    status: 'draft',
    snapshotCount: 0,
    actionCount: 0,
  };
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
app.get('/api/users', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 200 }));
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

try {
  const errors: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${base}/__qa?theme=${theme}`);
      await page.getByRole('heading', { name: '复盘中心' }).waitFor();
      await page.getByRole('heading', { name: '复盘列表' }).waitFor();
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

  retrospectiveCreateAttempts = 0;
  const createPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedCreate503 = 0;
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
  await createPage.getByText('创建复盘失败', { exact: true }).waitFor();
  assert.equal(retrospectiveCreateAttempts, 1, 'rapid duplicate create clicks send one POST');
  assert.equal(await titleInput.inputValue(), createTitle, 'failed create retains the entered title');
  assert.equal(await createPage.getByRole('heading', { name: '新建复盘' }).isVisible(), true, 'failed create keeps the dialog open for retry');

  await createPage.evaluate(async () => {
    await fetch('/__qa/configure-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, delayMs: 180 }),
    });
  });
  const successfulCreate = createPage.waitForResponse((response) => response.url().endsWith('/api/retrospectives') && response.request().method() === 'POST' && response.status() === 200);
  await createPage.getByRole('button', { name: '创建复盘', exact: true }).dblclick({ delay: 10 });
  await successfulCreate;
  await createPage.getByRole('heading', { name: createTitle }).waitFor();
  assert.equal(createPage.url().endsWith('/retrospectives/993'), true, 'confirmed create opens the new retrospective detail');
  assert.equal(retrospectiveCreateAttempts, 2, 'explicit retry is the only second create request');
  assert.equal(expectedCreate503, 0, 'all expected create failure responses are accounted for');
  assert.deepEqual(errors, [], 'retrospective create flow has no unexpected browser errors');
  await createPage.close();

  filterRaceFixture = true;
  const racePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedLate503 = 0;
  racePage.on('pageerror', (error) => errors.push(error.message));
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
  const statusFilter = racePage.locator('select').first();
  holdNextListRead = true;
  const oldFilterStarted = new Promise<void>((resolve) => { listReadStarted = resolve; });
  const oldFilterResponse = racePage.waitForResponse((response) => response.url().includes('/api/retrospectives?') && response.url().includes('status=published'));
  await statusFilter.selectOption('published');
  await oldFilterStarted;
  await statusFilter.selectOption('draft');
  await raceList.getByRole('button', { name: '旧账号draft筛选结果', exact: true }).waitFor();
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
  await oldErrorStarted;
  await statusFilter.selectOption('published');
  await raceList.getByRole('button', { name: '旧账号published筛选结果', exact: true }).waitFor();
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
