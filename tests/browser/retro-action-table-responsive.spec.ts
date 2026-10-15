import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const admin = { id: 99, username: 'retro-action-responsive-qa', role: 'admin', name: '复盘行动项响应式验收', enabled: true, force_change_password: false };
const retrospective = {
  id: 991,
  templateId: null,
  templateName: '周复盘模板',
  templateCategory: 'weekly',
  title: '验证手机端复盘行动项操作',
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
  snapshotCount: 0,
  actionCount: 1,
};
const action = {
  id: 992,
  retroId: retrospective.id,
  retroTitle: retrospective.title,
  title: '根据本周数据调整选题方向',
  descriptionMd: '确认表现较好的内容主题，并规划下一周的选题。',
  ownerId: admin.id,
  ownerName: admin.name,
  dueDate: '2026-10-01',
  status: 'doing',
  resultMd: '',
  closedAt: null,
  createdBy: admin.id,
  creatorName: admin.name,
  createdAt: '2026-10-08 09:00:00',
  updatedAt: '2026-10-08 09:00:00',
};
const dailyRisk = {
  itemId: 993,
  reportId: 994,
  reportDate: '2026-10-07',
  userId: admin.id,
  userName: admin.name,
  sectionKey: 'risk',
  contentMd: '当前拍摄准备时间超过了本周可用人力，需要尽早调整排期。',
  riskLevel: 'warning',
  reportStatus: 'submitted',
};

let detailReadFailures = 0;
let dailyRiskReadFailures = 0;
let detailReadAttempts = 0;
let dailyRiskReadAttempts = 0;
let dailyRisksFixture: typeof dailyRisk[] = [];
let actionCreateFailures = 0;
let actionCreateDelayMs = 0;
let actionCreateAttempts = 0;
let actionUpdateFailures = 0;
let actionUpdateDelayMs = 0;
let actionUpdateAttempts = 0;
const retroMutationAttempts = { summary: 0, snapshot: 0, publish: 0, archive: 0 };
const retroMutationConfig = {
  summary: { failures: 0, delayMs: 0 },
  snapshot: { failures: 0, delayMs: 0 },
  publish: { failures: 0, delayMs: 0 },
  archive: { failures: 0, delayMs: 0 },
};

function luminance(rgb: number[]) {
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function contrastRatio(locator: import('playwright').Locator) {
  const colors = await locator.evaluate((element) => {
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
const detail = {
  retrospective,
  template: null,
  snapshots: [],
  actions: [action],
  permissions: { canEdit: false, canPublish: false, canArchive: false, canManageActions: true },
};

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  const editable = req.query.workflow === 'draft';
  Object.assign(retrospective, {
    status: editable ? 'draft' : 'published',
    summaryMd: editable ? '原始复盘结论' : '',
    version: 1,
    snapshotCount: 0,
    publishedAt: editable ? null : '2026-10-08 09:00:00',
    archivedAt: null,
  });
  detail.snapshots = [];
  detail.actions = [action];
  detail.permissions = editable
    ? { canEdit: true, canPublish: true, canArchive: false, canManageActions: true }
    : { canEdit: false, canPublish: false, canArchive: false, canManageActions: true };
  if (req.query.fail === 'both') {
    detailReadFailures = 1;
    dailyRiskReadFailures = 1;
  }
  dailyRisksFixture = req.query.risk === 'present' ? [dailyRisk] : [];
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(admin))});localStorage.setItem('xmt_token','retro-action-responsive-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/retrospectives/${retrospective.id}');</script>`);
});
app.post('/__qa/fail-next-reads', (req, res) => {
  if (req.query.scope === 'both' || req.query.scope === 'detail') detailReadFailures += 1;
  if (req.query.scope === 'both' || req.query.scope === 'risks') dailyRiskReadFailures += 1;
  res.json({ ok: true });
});
app.post('/__qa/configure-action-create', (req, res) => {
  actionCreateFailures = Number(req.body.failures) || 0;
  actionCreateDelayMs = Number(req.body.delayMs) || 0;
  res.json({ ok: true });
});
app.post('/__qa/configure-action-update', (req, res) => {
  actionUpdateFailures = Number(req.body.failures) || 0;
  actionUpdateDelayMs = Number(req.body.delayMs) || 0;
  res.json({ ok: true });
});
app.post('/__qa/configure-retro-mutation/:kind', (req, res) => {
  const kind = req.params.kind as keyof typeof retroMutationConfig;
  if (!(kind in retroMutationConfig)) return res.status(404).json({ ok: false });
  retroMutationConfig[kind] = {
    failures: Number(req.body.failures) || 0,
    delayMs: Number(req.body.delayMs) || 0,
  };
  return res.json({ ok: true });
});
app.post('/__qa/external-publish', (_req, res) => {
  retrospective.status = 'published';
  detail.permissions = { canEdit: false, canPublish: false, canArchive: true, canManageActions: true };
  return res.json({ ok: true });
});
app.get('/api/auth/me', (_req, res) => res.json(admin));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get(`/api/retrospectives/${retrospective.id}/daily-risks`, (_req, res) => {
  dailyRiskReadAttempts += 1;
  if (dailyRiskReadFailures > 0) {
    dailyRiskReadFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟日报风险读取失败' });
  }
  return res.json({ success: true, data: { risks: dailyRisksFixture } });
});
app.get(`/api/retrospectives/${retrospective.id}`, (_req, res) => {
  detailReadAttempts += 1;
  if (detailReadFailures > 0) {
    detailReadFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘详情读取失败' });
  }
  return res.json({ success: true, data: detail });
});
app.post(`/api/retrospectives/${retrospective.id}/actions`, async (req, res) => {
  actionCreateAttempts += 1;
  if (actionCreateDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, actionCreateDelayMs));
  if (actionCreateFailures > 0) {
    actionCreateFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟行动项创建失败' });
  }
  const createdAction = {
    ...action,
    id: 995,
    title: String(req.body.title || ''),
    descriptionMd: String(req.body.descriptionMd || ''),
    dueDate: req.body.dueDate ? String(req.body.dueDate) : null,
    status: 'todo',
  };
  return res.json({ success: true, data: { ...detail, actions: [...detail.actions, createdAction] } });
});
app.patch(`/api/retrospectives/actions/${action.id}`, async (req, res) => {
  actionUpdateAttempts += 1;
  if (actionUpdateDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, actionUpdateDelayMs));
  if (actionUpdateFailures > 0) {
    actionUpdateFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟行动项更新失败' });
  }
  const updatedAction = {
    ...action,
    ...(req.body.status ? { status: req.body.status } : {}),
    ...(req.body.resultMd !== undefined ? { resultMd: String(req.body.resultMd) } : {}),
    ...(req.body.title !== undefined ? { title: String(req.body.title) } : {}),
  };
  Object.assign(action, updatedAction);
  return res.json({
    success: true,
    data: { ...detail, actions: detail.actions.map((item) => item.id === action.id ? updatedAction : item) },
  });
});
app.put(`/api/retrospectives/${retrospective.id}`, async (req, res) => {
  retroMutationAttempts.summary += 1;
  const config = retroMutationConfig.summary;
  if (config.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, config.delayMs));
  if (config.failures > 0) {
    config.failures -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘结论保存失败' });
  }
  retrospective.summaryMd = String(req.body.summaryMd || '');
  retrospective.version += 1;
  return res.json({ success: true, data: detail });
});
app.post(`/api/retrospectives/${retrospective.id}/snapshot`, async (_req, res) => {
  retroMutationAttempts.snapshot += 1;
  const config = retroMutationConfig.snapshot;
  if (config.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, config.delayMs));
  if (config.failures > 0) {
    config.failures -= 1;
    return res.status(503).json({ success: false, message: '模拟指标快照生成失败' });
  }
  detail.snapshots = [{
    id: 996,
    retroId: retrospective.id,
    metricKey: 'topics_total',
    metricName: '选题数量',
    valueNum: 1,
    valueText: null,
    sourceRefJson: null,
    capturedAt: '2026-10-09 09:00:00',
  }];
  retrospective.snapshotCount = detail.snapshots.length;
  return res.json({ success: true, data: detail });
});
app.post(`/api/retrospectives/${retrospective.id}/publish`, async (_req, res) => {
  retroMutationAttempts.publish += 1;
  const config = retroMutationConfig.publish;
  if (config.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, config.delayMs));
  if (config.failures > 0) {
    config.failures -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘发布失败' });
  }
  retrospective.status = 'published';
  retrospective.publishedAt = '2026-10-09 09:00:00';
  detail.permissions = { canEdit: false, canPublish: false, canArchive: true, canManageActions: true };
  return res.json({ success: true, data: detail });
});
app.post(`/api/retrospectives/${retrospective.id}/archive`, async (_req, res) => {
  retroMutationAttempts.archive += 1;
  const config = retroMutationConfig.archive;
  if (config.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, config.delayMs));
  if (config.failures > 0) {
    config.failures -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘归档失败' });
  }
  retrospective.status = 'archived';
  retrospective.archivedAt = '2026-10-09 09:30:00';
  detail.permissions = { canEdit: false, canPublish: false, canArchive: false, canManageActions: false };
  return res.json({ success: true, data: detail });
});
app.get('/api/users', (_req, res) => res.json({ data: [admin], total: 1, page: 1, limit: 200 }));
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
if (process.env.XMT_RETRO_ACTION_QA_SERVE === '1') {
  console.log(`Isolated retrospective action table QA fixture: ${base}/__qa?theme=light`);
  await new Promise<void>(() => undefined);
}
const browser = await chromium.launch({ headless: true });

try {
  const errors: string[] = [];
  const mutations: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', (request) => {
        if (request.url().includes('/api/retrospectives') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
          mutations.push(`${request.method()} ${request.url()}`);
        }
      });
      await page.goto(`${base}/__qa?theme=${theme}`);
      await page.getByRole('heading', { name: retrospective.title }).waitFor();
      const actions = page.getByTestId(`retro-action-row-actions-${action.id}`);
      await actions.waitFor();
      const geometry = await actions.evaluate((cell) => {
        const scrollArea = cell.closest('div.overflow-x-auto');
        const rect = cell.getBoundingClientRect();
        const containers: Array<{ tag: string; testId: string | null; className: string; width: number; minWidth: string; overflowX: string }> = [];
        let current = scrollArea as HTMLElement | null;
        for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
          const containerRect = current.getBoundingClientRect();
          const style = getComputedStyle(current);
          containers.push({ tag: current.tagName, testId: current.dataset.testid || null, className: String(current.className).slice(0, 100), width: containerRect.width, minWidth: style.minWidth, overflowX: style.overflowX });
        }
        return {
          position: getComputedStyle(cell).position,
          left: rect.left,
          right: rect.right,
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          scrollLeft: scrollArea?.getBoundingClientRect().left ?? -1,
          scrollRight: scrollArea?.getBoundingClientRect().right ?? -1,
          containers,
        };
      });
      assert.equal(geometry.position, 'sticky', `${theme}/${width}px action cell stays fixed`);
      assert.ok(geometry.left >= geometry.scrollLeft - 1 && geometry.right <= geometry.scrollRight + 1, `${theme}/${width}px action cell stays inside the table viewport: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.pageWidth <= geometry.viewportWidth, `${theme}/${width}px page has no horizontal overflow: ${JSON.stringify(geometry)}`);

      const detailButton = actions.getByRole('button', { name: '详情' });
      const saveButton = actions.getByRole('button', { name: '保存' });
      const overdue = page.getByText('已逾期', { exact: true });
      assert.equal(await overdue.isVisible(), true, `${theme}/${width}px overdue badge is visible`);
      const overdueContrast = await contrastRatio(overdue);
      assert.ok(overdueContrast >= 4.5, `${theme}/${width}px overdue badge text contrast is ${overdueContrast.toFixed(2)}:1; expected at least 4.5:1`);
      assert.equal(await detailButton.isVisible(), true, `${theme}/${width}px detail action is visible`);
      assert.equal(await saveButton.isVisible(), true, `${theme}/${width}px save action is visible`);
      if (width <= 390) {
        const navBounds = await page.getByRole('navigation', { name: '移动主导航' }).boundingBox();
        assert(navBounds, `${theme}/${width}px bottom navigation has bounds`);
        for (const [label, button] of [['detail', detailButton], ['save', saveButton]] as const) {
          await button.evaluate((element) => element.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
          const bounds = await button.boundingBox();
          assert(bounds, `${theme}/${width}px ${label} action has bounds`);
          assert(bounds.y + bounds.height <= navBounds.y + 1, `${theme}/${width}px ${label} action clears fixed bottom navigation`);
        }
        if (theme === 'light' && width === 320) {
          await page.screenshot({ path: '/tmp/xmt-retro-action-table-light-320-viewport.png' });
        }
      }

      const panelOverflow = await page.getByTestId('retro-action-table-panel').evaluate((panel) => ({ x: getComputedStyle(panel).overflowX, y: getComputedStyle(panel).overflowY }));
      assert.deepEqual(panelOverflow, { x: 'visible', y: 'visible' }, `${theme}/${width}px outer card does not clip the sticky action column`);
      await page.screenshot({ path: `/tmp/xmt-retro-action-table-${theme}-${width}.png`, fullPage: true });

      if (width === 320) {
        await detailButton.click();
        await page.getByRole('heading', { name: '行动项详情' }).waitFor();
        const overlay = page.locator('.xmt-overlay-center');
        const panelBounds = await overlay.locator(':scope > div').boundingBox();
        const closeBounds = await overlay.getByRole('button', { name: '关闭弹窗' }).boundingBox();
        const drawerSaveBounds = await overlay.getByRole('button', { name: '保存' }).boundingBox();
        assert(panelBounds && panelBounds.x >= 0 && panelBounds.x + panelBounds.width <= width, `${theme}/${width}px action detail drawer stays inside the viewport`);
        assert(closeBounds && closeBounds.x >= 0 && closeBounds.x + closeBounds.width <= width, `${theme}/${width}px drawer close control stays inside the viewport`);
        assert(drawerSaveBounds && drawerSaveBounds.x >= 0 && drawerSaveBounds.x + drawerSaveBounds.width <= width, `${theme}/${width}px drawer save control stays inside the viewport`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme}/${width}px detail drawer does not create horizontal page overflow`);
        if (theme === 'light') await page.screenshot({ path: '/tmp/xmt-retro-action-drawer-light-320.png' });
        await overlay.getByRole('button', { name: '关闭弹窗' }).click();
        await page.getByRole('heading', { name: retrospective.title }).waitFor();
      }
      await page.close();
    }
  }

  detailReadFailures = 0;
  dailyRiskReadFailures = 0;
  detailReadAttempts = 0;
  dailyRiskReadAttempts = 0;
  const recoveryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expected503 = 2;
  recoveryPage.on('pageerror', (error) => errors.push(error.message));
  recoveryPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expected503 > 0 && message.text().includes('503')) {
      expected503 -= 1;
      return;
    }
    errors.push(message.text());
  });
  recoveryPage.on('request', (request) => {
    if (request.url().includes('/api/retrospectives') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      mutations.push(`${request.method()} ${request.url()}`);
    }
  });
  await recoveryPage.goto(`${base}/__qa?theme=light&fail=both&risk=present`);
  await recoveryPage.getByRole('alert').filter({ hasText: '复盘详情暂不可用' }).waitFor();
  assert.equal(await recoveryPage.getByText('复盘不存在或当前账号不可访问。', { exact: true }).count(), 0, 'a transient detail read failure is not reported as missing or unauthorized');
  const detailRetry = recoveryPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'GET' && response.status() === 200);
  await recoveryPage.getByRole('button', { name: '重新加载详情' }).click();
  await detailRetry;
  await recoveryPage.getByRole('heading', { name: retrospective.title }).waitFor();
  await recoveryPage.getByRole('alert').filter({ hasText: '日报风险暂不可用' }).waitFor();
  assert.equal(await recoveryPage.getByText('当前复盘周期内没有可联动的日报风险分段。', { exact: true }).count(), 0, 'a failed risk read is not reported as no risks');

  const riskRetry = recoveryPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/daily-risks`) && response.request().method() === 'GET' && response.status() === 200);
  await recoveryPage.getByRole('button', { name: '重新加载日报风险' }).click();
  await riskRetry;
  const riskPanel = recoveryPage.getByTestId('retro-daily-risk-panel');
  const riskSelect = riskPanel.getByRole('combobox');
  await riskSelect.locator('option[value="993"]').waitFor({ state: 'attached' });
  await riskSelect.selectOption('993');

  await recoveryPage.evaluate(async () => { await fetch('/__qa/fail-next-reads?scope=both', { method: 'POST' }); });
  expected503 += 2;
  const detailRefreshFailure = recoveryPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'GET' && response.status() === 503);
  const riskRefreshFailure = recoveryPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/daily-risks`) && response.request().method() === 'GET' && response.status() === 503);
  await recoveryPage.getByRole('button', { name: '刷新', exact: true }).click();
  await riskPanel.getByRole('button', { name: '刷新日报风险', exact: true }).click();
  await Promise.all([detailRefreshFailure, riskRefreshFailure]);
  await recoveryPage.getByRole('alert').filter({ hasText: '详情刷新失败，仍显示最近一次成功读取的内容' }).waitFor();
  await riskPanel.getByRole('alert').filter({ hasText: '日报风险刷新失败，仍显示最近一次成功读取的内容' }).waitFor();
  await recoveryPage.getByRole('heading', { name: retrospective.title }).waitFor();
  await riskSelect.locator('option[value="993"]').waitFor({ state: 'attached' });
  assert.equal(await riskSelect.isDisabled(), true, 'stale daily risks cannot be selected while refresh has failed');

  const riskRecovery = recoveryPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/daily-risks`) && response.request().method() === 'GET' && response.status() === 200);
  await recoveryPage.getByRole('button', { name: '重新加载日报风险' }).click();
  await riskRecovery;
  const detailRecovery = recoveryPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'GET' && response.status() === 200);
  await recoveryPage.getByRole('button', { name: '重新加载详情' }).click();
  await detailRecovery;
  assert.equal(detailReadAttempts, 4, 'detail retry and recovery use only the expected GET requests');
  assert.equal(dailyRiskReadAttempts, 4, 'risk retry and recovery use only the expected GET requests');
  assert.equal(expected503, 0, 'all expected 503 console messages are accounted for');
  assert.deepEqual(mutations, [], 'responsive and read-recovery checks do not write action data');
  await recoveryPage.close();

  actionCreateAttempts = 0;
  const createActionPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedCreateAction503 = 0;
  let expectedActionUpdate503 = 0;
  createActionPage.on('pageerror', (error) => errors.push(error.message));
  createActionPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedCreateAction503 > 0 && message.text().includes('503')) {
      expectedCreateAction503 -= 1;
      return;
    }
    if (expectedActionUpdate503 > 0 && message.text().includes('503')) {
      expectedActionUpdate503 -= 1;
      return;
    }
    errors.push(message.text());
  });
  createActionPage.on('request', (request) => {
    if (request.url().includes('/api/retrospectives') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      mutations.push(`${request.method()} ${request.url()}`);
    }
  });
  await createActionPage.goto(`${base}/__qa?theme=light`);
  await createActionPage.getByRole('heading', { name: retrospective.title }).waitFor();
  const actionPanel = createActionPage.getByTestId('retro-action-table-panel');
  const actionTitleInput = actionPanel.getByPlaceholder('行动项标题');
  const actionDescriptionInput = actionPanel.getByPlaceholder('说明，可选');
  const newActionTitle = '行动项创建失败后保留输入验收';
  const newActionDescription = '确认失败后仍可按原内容安全重试。';
  await actionTitleInput.fill(newActionTitle);
  await actionDescriptionInput.fill(newActionDescription);
  await createActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 1, delayMs: 180 }),
    });
  });

  expectedCreateAction503 = 1;
  const failedActionCreate = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/actions`) && response.request().method() === 'POST' && response.status() === 503);
  await actionPanel.getByRole('button', { name: '新增', exact: true }).dblclick({ delay: 10 });
  await failedActionCreate;
  await createActionPage.getByText('创建行动项失败', { exact: true }).waitFor();
  assert.equal(actionCreateAttempts, 1, 'rapid duplicate action creation sends one POST');
  assert.equal(await actionTitleInput.inputValue(), newActionTitle, 'failed action creation retains the title');
  assert.equal(await actionDescriptionInput.inputValue(), newActionDescription, 'failed action creation retains the description');

  await createActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, delayMs: 180 }),
    });
  });
  const successfulActionCreate = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/actions`) && response.request().method() === 'POST' && response.status() === 200);
  await actionPanel.getByRole('button', { name: '新增', exact: true }).click();
  await successfulActionCreate;
  await actionPanel.getByText(newActionTitle, { exact: true }).waitFor();
  assert.equal(await actionTitleInput.inputValue(), '', 'confirmed action creation clears the submitted title');
  assert.equal(await actionDescriptionInput.inputValue(), '', 'confirmed action creation clears the submitted description');
  assert.equal(actionCreateAttempts, 2, 'the explicit retry is the only second action create request');

  const actionRowActions = createActionPage.getByTestId(`retro-action-row-actions-${action.id}`);
  const actionRow = actionRowActions.locator('xpath=..');
  const actionStatus = actionRow.getByRole('combobox');
  const actionResult = actionRow.locator('textarea');
  await actionStatus.selectOption('done');
  const updatedResult = '已完成跨平台数据核对，准备进入下一轮选题。';
  await actionResult.fill(updatedResult);
  await createActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 1, delayMs: 180 }),
    });
  });

  expectedActionUpdate503 = 1;
  const failedActionUpdate = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 503);
  const failedUpdateClick = actionRowActions.getByRole('button', { name: '保存' }).dblclick({ delay: 10 });
  await failedUpdateClick;
  assert.equal(await actionStatus.isDisabled(), true, 'action fields are locked while an update is pending');
  await failedActionUpdate;
  await createActionPage.getByText('更新行动项失败', { exact: true }).waitFor();
  assert.equal(actionUpdateAttempts, 1, 'rapid duplicate action updates send one PATCH');
  assert.equal(await actionStatus.isDisabled(), false, 'action fields unlock after a failed update for retry');
  assert.equal(await actionStatus.inputValue(), 'done', 'failed action update retains the selected status');
  assert.equal(await actionResult.inputValue(), updatedResult, 'failed action update retains the result text');

  await createActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, delayMs: 180 }),
    });
  });
  const successfulActionUpdate = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 200);
  const successfulUpdateClick = actionRowActions.getByRole('button', { name: '保存' }).click();
  await successfulUpdateClick;
  assert.equal(await actionResult.isDisabled(), true, 'action result input stays locked while the retry is pending');
  await successfulActionUpdate;
  await createActionPage.getByText('行动项已更新', { exact: true }).waitFor();
  assert.equal(await actionStatus.inputValue(), 'done', 'confirmed action update applies the server status');
  assert.equal(await actionResult.inputValue(), updatedResult, 'confirmed action update retains the saved result');
  assert.equal(actionUpdateAttempts, 2, 'only the explicit action update retry sends a second PATCH');

  await actionRowActions.getByRole('button', { name: '详情' }).click();
  const actionDrawer = createActionPage.locator('.xmt-overlay-center');
  await actionDrawer.getByRole('heading', { name: '行动项详情' }).waitFor();
  const drawerResult = '负责人完成了后续确认。';
  await actionDrawer.getByLabel('处理结果').fill(drawerResult);
  await createActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, delayMs: 180 }),
    });
  });
  const drawerActionUpdate = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 200);
  const drawerSave = actionDrawer.getByRole('button', { name: '保存' });
  const drawerUpdateClick = drawerSave.dblclick({ delay: 10 });
  await drawerUpdateClick;
  assert.equal(await actionDrawer.getByRole('textbox', { name: '处理结果' }).isDisabled(), true, 'drawer fields stay locked while an update is pending');
  assert.equal(await actionDrawer.getByRole('button', { name: '关闭', exact: true }).isDisabled(), true, 'drawer remains open while a failed update could still need its inputs');
  await drawerActionUpdate;
  await createActionPage.getByText('行动项已更新', { exact: true }).waitFor();
  assert.equal(actionUpdateAttempts, 3, 'rapid duplicate action detail saves send one PATCH');
  await actionDrawer.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await actionResult.inputValue(), drawerResult, 'the row shows the newly confirmed drawer result instead of its older saved draft');
  const saveAfterDrawer = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 200);
  await actionRowActions.getByRole('button', { name: '保存' }).click();
  await saveAfterDrawer;
  assert.equal(action.resultMd, drawerResult, 'saving the row cannot restore the older pre-drawer result');

  const unsavedRowResult = '尚未提交的行内编辑应当保留。';
  await actionResult.fill(unsavedRowResult);
  await actionRowActions.getByRole('button', { name: '详情' }).click();
  await actionDrawer.getByRole('heading', { name: '行动项详情' }).waitFor();
  const newestDrawerResult = '详情中保存的最新确认。';
  await actionDrawer.getByLabel('处理结果').fill(newestDrawerResult);
  const secondDrawerSave = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 200);
  await actionDrawer.getByRole('button', { name: '保存' }).click();
  await secondDrawerSave;
  await actionDrawer.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await actionResult.inputValue(), unsavedRowResult, 'a genuinely unsaved row edit survives a different editor confirmation');
  const saveUnsavedRow = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 200);
  await actionRowActions.getByRole('button', { name: '保存' }).click();
  await saveUnsavedRow;
  assert.equal(action.resultMd, unsavedRowResult, 'the preserved row edit is committed only by its explicit save');
  assert.equal(actionUpdateAttempts, 6, 'each distinct row and drawer save sends one PATCH');
  assert.equal(expectedActionUpdate503, 0, 'the expected action update failure response is accounted for');
  assert.deepEqual(mutations, [
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/actions`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/actions`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
  ], 'only the expected failed create and explicit successful retry mutate business data');
  assert.equal(expectedCreateAction503, 0, 'all expected action create failure responses are accounted for');
  assert.deepEqual(errors, [], 'action creation failure and retry have no unexpected browser errors');
  await createActionPage.close();

  mutations.length = 0;
  for (const kind of Object.keys(retroMutationAttempts) as (keyof typeof retroMutationAttempts)[]) {
    retroMutationAttempts[kind] = 0;
    retroMutationConfig[kind] = { failures: 0, delayMs: 0 };
  }
  const workflowPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedWorkflow503 = 0;
  workflowPage.on('pageerror', (error) => errors.push(error.message));
  workflowPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedWorkflow503 > 0 && message.text().includes('503')) {
      expectedWorkflow503 -= 1;
      return;
    }
    errors.push(message.text());
  });
  workflowPage.on('dialog', (dialog) => { void dialog.accept(); });
  workflowPage.on('request', (request) => {
    if (request.url().includes('/api/retrospectives') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      mutations.push(`${request.method()} ${request.url()}`);
    }
  });
  await workflowPage.goto(`${base}/__qa?theme=light&workflow=draft`);
  await workflowPage.getByRole('heading', { name: retrospective.title }).waitFor();
  const configureWorkflowMutation = async (kind: keyof typeof retroMutationConfig, failures = 1) => {
    await workflowPage.evaluate(async ({ name, count }) => {
      await fetch(`/__qa/configure-retro-mutation/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ failures: count, delayMs: 180 }),
      });
    }, { name: kind, count: failures });
  };

  const summaryInput = workflowPage.getByPlaceholder('记录本周期发生了什么、为什么发生、下一轮怎么调整...');
  const summaryValue = '保留复盘结论，等服务端确认后再更新版本。';
  await summaryInput.fill(summaryValue);
  await configureWorkflowMutation('summary');
  expectedWorkflow503 += 1;
  const failedSummarySave = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 503);
  const summarySaveButton = workflowPage.getByRole('button', { name: '保存结论' });
  const snapshotButton = workflowPage.getByRole('button', { name: '生成快照' });
  const publishButton = workflowPage.getByRole('button', { name: '发布复盘' });
  const summarySaveAttempt = summarySaveButton.dblclick({ delay: 10 });
  await summarySaveAttempt;
  assert.equal(await summaryInput.isDisabled(), true, 'summary text is locked while its save is pending');
  assert.equal(await snapshotButton.isDisabled(), true, 'a pending summary save blocks a different snapshot write');
  assert.equal(await publishButton.isDisabled(), true, 'a pending summary save blocks a different publish write');
  await failedSummarySave;
  await workflowPage.getByText('保存结论失败', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.summary, 1, 'rapid duplicate summary saves send one PUT');
  assert.equal(await summaryInput.inputValue(), summaryValue, 'failed summary save retains edited text');
  assert.equal(await summaryInput.isDisabled(), false, 'summary text unlocks after failure for an explicit retry');
  await configureWorkflowMutation('summary', 0);
  const successfulSummarySave = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 200);
  await summarySaveButton.click();
  await successfulSummarySave;
  await workflowPage.getByText('复盘结论已保存', { exact: true }).waitFor();
  assert.equal(await summaryInput.inputValue(), summaryValue, 'confirmed summary save retains the server-confirmed text');
  assert.equal(retroMutationAttempts.summary, 2, 'the explicit retry sends the only second summary PUT');

  const submittedBeforeLateInput = '本次明确提交的结论。';
  const lateSummaryInput = '请求发出后到达的新结论输入。';
  await summaryInput.fill(submittedBeforeLateInput);
  const lateInputSave = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 200);
  await summarySaveButton.click();
  await summaryInput.evaluate((element, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, lateSummaryInput);
  await lateInputSave;
  assert.equal(retrospective.summaryMd, submittedBeforeLateInput, 'a save commits the snapshot captured when it was explicitly submitted');
  assert.equal(await summaryInput.inputValue(), lateSummaryInput, 'a delayed confirmation cannot erase a subsequently delivered input event');

  await configureWorkflowMutation('snapshot');
  expectedWorkflow503 += 1;
  const snapshotUrl = `/api/retrospectives/${retrospective.id}/snapshot`;
  const failedSnapshot = workflowPage.waitForResponse((response) => response.url().endsWith(snapshotUrl) && response.request().method() === 'POST' && response.status() === 503);
  await snapshotButton.dblclick({ delay: 10 });
  assert.equal(await snapshotButton.isDisabled(), true, 'snapshot generation locks while pending');
  assert.equal(await summarySaveButton.isDisabled(), true, 'a pending snapshot generation blocks a different summary write');
  assert.equal(await publishButton.isDisabled(), true, 'a pending snapshot generation blocks a different publish write');
  await failedSnapshot;
  await workflowPage.getByText('生成快照失败', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.snapshot, 1, 'rapid duplicate snapshot generation sends one POST');
  assert.equal(await workflowPage.getByText('尚未生成指标快照', { exact: true }).count(), 1, 'failed snapshot generation does not fabricate snapshot data');
  assert.equal(await snapshotButton.isDisabled(), false, 'snapshot generation unlocks after failure for retry');
  await configureWorkflowMutation('snapshot', 0);
  const successfulSnapshot = workflowPage.waitForResponse((response) => response.url().endsWith(snapshotUrl) && response.request().method() === 'POST' && response.status() === 200);
  await snapshotButton.click();
  await successfulSnapshot;
  await workflowPage.getByText('指标快照已更新', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.snapshot, 2, 'the explicit snapshot retry sends only one more POST');
  assert.equal(await summaryInput.inputValue(), lateSummaryInput, 'a snapshot response preserves an unsaved conclusion');

  const workflowActions = workflowPage.getByTestId('retro-action-table-panel');
  await workflowActions.getByPlaceholder('行动项标题').fill('保留结论时新增的行动项');
  const conclusionActionCreate = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/actions`) && response.request().method() === 'POST' && response.status() === 200);
  await workflowActions.getByRole('button', { name: '新增', exact: true }).click();
  await conclusionActionCreate;
  assert.equal(await summaryInput.inputValue(), lateSummaryInput, 'creating an action cannot replace an unsaved conclusion');
  const workflowActionRow = workflowPage.getByTestId(`retro-action-row-actions-${action.id}`).locator('xpath=..');
  await workflowActionRow.getByPlaceholder('处理结果').fill('结论保留期间确认的行动进展');
  const conclusionActionUpdate = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 200);
  await workflowActionRow.getByRole('button', { name: '保存', exact: true }).click();
  await conclusionActionUpdate;
  assert.equal(await summaryInput.inputValue(), lateSummaryInput, 'updating an action cannot replace an unsaved conclusion');

  await publishButton.click();
  await workflowPage.getByRole('alert').filter({ hasText: '请先点击“保存结论”，再发布复盘' }).waitFor();
  assert.equal(retroMutationAttempts.publish, 0, 'publishing an unsaved conclusion requires an explicit save and sends no publish POST');
  assert.equal(await summaryInput.inputValue(), lateSummaryInput, 'the publish prerequisite leaves the conclusion available to save');
  await workflowPage.screenshot({ path: '/tmp/xmt-retro-unsaved-conclusion-390.png', fullPage: true });
  await summaryInput.fill(submittedBeforeLateInput);
  assert.equal(await workflowPage.getByRole('alert').filter({ hasText: '请先点击“保存结论”' }).count(), 0, 'undoing the local edits removes the obsolete unsaved-conclusion warning');
  await summaryInput.fill(lateSummaryInput);
  const finalSummarySave = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 200);
  await summarySaveButton.click();
  await finalSummarySave;
  await workflowPage.getByRole('alert').filter({ hasText: '请先点击“保存结论”' }).waitFor({ state: 'hidden' });
  assert.equal(retrospective.summaryMd, lateSummaryInput, 'the preserved conclusion is saved by the explicit save action');

  await configureWorkflowMutation('publish');
  expectedWorkflow503 += 1;
  const publishUrl = `/api/retrospectives/${retrospective.id}/publish`;
  const failedPublish = workflowPage.waitForResponse((response) => response.url().endsWith(publishUrl) && response.request().method() === 'POST' && response.status() === 503);
  await publishButton.dblclick({ delay: 10 });
  assert.equal(await publishButton.isDisabled(), true, 'publishing locks the workflow while pending');
  assert.equal(await summaryInput.isDisabled(), true, 'a pending publish also locks the retrospective summary');
  await failedPublish;
  await workflowPage.getByText('发布复盘失败', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.publish, 1, 'rapid duplicate publish actions send one POST');
  assert.equal(await workflowPage.getByRole('button', { name: '发布复盘' }).count(), 1, 'failed publish leaves the retrospective in draft for retry');
  await configureWorkflowMutation('publish', 0);
  const successfulPublish = workflowPage.waitForResponse((response) => response.url().endsWith(publishUrl) && response.request().method() === 'POST' && response.status() === 200);
  await workflowPage.getByRole('button', { name: '发布复盘' }).click();
  await successfulPublish;
  await workflowPage.getByText('复盘已发布', { exact: true }).waitFor();
  assert.equal(await workflowPage.getByRole('button', { name: '归档复盘' }).count(), 1, 'confirmed publish unlocks the archive step');
  assert.equal(retroMutationAttempts.publish, 2, 'only the explicit publish retry sends a second POST');

  await configureWorkflowMutation('archive');
  expectedWorkflow503 += 1;
  const archiveUrl = `/api/retrospectives/${retrospective.id}/archive`;
  const failedArchive = workflowPage.waitForResponse((response) => response.url().endsWith(archiveUrl) && response.request().method() === 'POST' && response.status() === 503);
  const archiveButton = workflowPage.getByRole('button', { name: '归档复盘' });
  await archiveButton.dblclick({ delay: 10 });
  assert.equal(await archiveButton.isDisabled(), true, 'archive action locks while pending');
  await failedArchive;
  await workflowPage.getByText('归档复盘失败', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.archive, 1, 'rapid duplicate archive actions send one POST');
  assert.equal(await workflowPage.getByRole('button', { name: '归档复盘' }).count(), 1, 'failed archive leaves the published retrospective available for retry');
  await configureWorkflowMutation('archive', 0);
  const successfulArchive = workflowPage.waitForResponse((response) => response.url().endsWith(archiveUrl) && response.request().method() === 'POST' && response.status() === 200);
  await workflowPage.getByRole('button', { name: '归档复盘' }).click();
  await successfulArchive;
  await workflowPage.getByText('复盘已归档', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.archive, 2, 'only the explicit archive retry sends a second POST');
  assert.equal(expectedWorkflow503, 0, 'all expected workflow failure responses are accounted for');
  assert.deepEqual(mutations, [
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/snapshot`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/snapshot`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/actions`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/publish`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/publish`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/archive`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/archive`,
  ], 'each retrospective write retries only after a confirmed 503 and an explicit user action');
  assert.deepEqual(errors, [], 'retrospective workflow failure and retry have no unexpected browser errors');
  await workflowPage.close();

  const leavePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  leavePage.on('pageerror', (error) => errors.push(error.message));
  leavePage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  let discardSummaryOnLeave = false;
  const leaveWarnings: string[] = [];
  leavePage.on('dialog', (dialog) => {
    leaveWarnings.push(dialog.message());
    void (discardSummaryOnLeave ? dialog.accept() : dialog.dismiss());
  });
  await leavePage.goto(`${base}/__qa?theme=light&workflow=draft`);
  const leaveInput = leavePage.getByPlaceholder('记录本周期发生了什么、为什么发生、下一轮怎么调整...');
  await leaveInput.fill('返回前需要保留的复盘文字');
  const beforeLeaveWrites = retroMutationAttempts.summary;
  await leavePage.getByRole('button', { name: '返回列表', exact: true }).click();
  assert.equal(new URL(leavePage.url()).pathname, `/retrospectives/${retrospective.id}`, 'cancelling the leave warning keeps the current retrospective open');
  assert.equal(await leaveInput.inputValue(), '返回前需要保留的复盘文字');
  assert.ok(leaveWarnings[0]?.includes('未保存') && leaveWarnings[0]?.includes('复制保留'), 'the warning explains both editable and read-only recovery');
  assert.equal(await leavePage.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), true, 'refresh and close are protected while the conclusion is dirty');
  assert.equal(retroMutationAttempts.summary, beforeLeaveWrites, 'cancelling leave does not save or discard on the server');
  await leavePage.getByRole('button', { name: '保存结论', exact: true }).click();
  await leavePage.getByText('复盘结论已保存', { exact: true }).waitFor();
  assert.equal(await leavePage.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), false, 'confirmed saved content no longer raises the unload warning');
  await leaveInput.fill('明确放弃的本页修改');
  await leavePage.screenshot({ path: '/tmp/xmt-retro-unsaved-leave-390.png', fullPage: false });
  // Keep the destination isolated from the unrelated list screen/API contract.
  await leavePage.route('**/api/retrospectives', (route) => route.fulfill({ json: { success: true, data: { retrospectives: [] } } }));
  discardSummaryOnLeave = true;
  await leavePage.getByRole('button', { name: '返回列表', exact: true }).click();
  await leavePage.waitForURL((url) => url.pathname === '/retrospectives');
  assert.equal(retroMutationAttempts.summary, beforeLeaveWrites + 1, 'explicit discard leaves without an extra server write');
  await leavePage.close();

  const conflictPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  conflictPage.on('pageerror', (error) => errors.push(error.message));
  let acceptConflictConfirmation = false;
  conflictPage.on('dialog', (dialog) => { void (acceptConflictConfirmation ? dialog.accept() : dialog.dismiss()); });
  const conflictWrites: string[] = [];
  conflictPage.on('request', (request) => {
    if (request.url().includes('/api/retrospectives') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) conflictWrites.push(request.method());
  });
  await conflictPage.goto(`${base}/__qa?theme=light&workflow=draft`);
  await conflictPage.getByRole('heading', { name: retrospective.title }).waitFor();
  const conflictSummary = '他人发布后仍需保留本页未提交的结论。';
  await conflictPage.getByPlaceholder('记录本周期发生了什么、为什么发生、下一轮怎么调整...').fill(conflictSummary);
  await conflictPage.request.post(`${base}/__qa/external-publish`);
  await conflictPage.getByRole('button', { name: '刷新', exact: true }).click();
  await conflictPage.getByRole('alert').filter({ hasText: '当前复盘已只读，仍保留本页未保存的结论修改' }).waitFor();
  await conflictPage.getByText(conflictSummary, { exact: true }).waitFor();
  assert.equal(await conflictPage.getByRole('button', { name: '保存结论', exact: true }).count(), 0, 'an externally published retrospective keeps the real server read-only boundary');
  await conflictPage.getByRole('button', { name: '归档复盘' }).click();
  await conflictPage.getByRole('alert').filter({ hasText: '再确认使用已保存结论后归档' }).waitFor();
  assert.deepEqual(conflictWrites, [], 'dirty read-only conclusion blocks archive without making a server write');
  await conflictPage.getByRole('button', { name: '返回列表', exact: true }).click();
  assert.equal(new URL(conflictPage.url()).pathname, `/retrospectives/${retrospective.id}`, 'read-only unsaved text is protected on return to the list too');
  assert.equal(await conflictPage.getByText(conflictSummary, { exact: true }).count(), 1);
  await conflictPage.getByRole('button', { name: '使用已保存结论' }).click();
  assert.equal(await conflictPage.getByText(conflictSummary, { exact: true }).count(), 1, 'cancelling local replacement retains the unsaved conclusion');
  await conflictPage.screenshot({ path: '/tmp/xmt-retro-readonly-unsaved-conclusion-390.png', fullPage: true });
  acceptConflictConfirmation = true;
  await conflictPage.getByRole('button', { name: '使用已保存结论' }).click();
  await conflictPage.getByRole('button', { name: '使用已保存结论' }).waitFor({ state: 'hidden' });
  assert.equal(await conflictPage.getByText('原始复盘结论', { exact: true }).count(), 1, 'explicit local replacement displays the server-confirmed conclusion');
  assert.deepEqual(conflictWrites, [], 'local confirmation does not overwrite the published server conclusion');
  const conflictArchive = conflictPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/archive`) && response.status() === 200);
  await conflictPage.getByRole('button', { name: '归档复盘' }).click();
  await conflictArchive;
  assert.deepEqual(conflictWrites, ['POST'], 'archive resumes only after the unsaved local conclusion has been explicitly resolved');
  await conflictPage.close();

  mutations.length = 0;
  actionCreateAttempts = 0;
  const riskActionPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedRiskAction503 = 0;
  riskActionPage.on('pageerror', (error) => errors.push(error.message));
  riskActionPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedRiskAction503 > 0 && message.text().includes('503')) {
      expectedRiskAction503 -= 1;
      return;
    }
    errors.push(message.text());
  });
  riskActionPage.on('request', (request) => {
    if (request.url().includes('/api/retrospectives') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      mutations.push(`${request.method()} ${request.url()}`);
    }
  });
  await riskActionPage.goto(`${base}/__qa?theme=dark&risk=present`);
  await riskActionPage.getByRole('heading', { name: retrospective.title }).waitFor();
  const riskConversionPanel = riskActionPage.getByTestId('retro-daily-risk-panel');
  const riskConversionSelect = riskConversionPanel.getByRole('combobox').first();
  await riskConversionSelect.selectOption(String(dailyRisk.itemId));
  const riskActionTitle = riskConversionPanel.getByPlaceholder('行动项标题');
  const riskActionTitleValue = '跟进日报风险：重试时保留填写内容';
  await riskActionTitle.fill(riskActionTitleValue);
  const riskDueDate = riskConversionPanel.locator('input[type="date"]');
  await riskDueDate.fill('2026-10-10');
  await riskActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 1, delayMs: 180 }),
    });
  });

  expectedRiskAction503 = 1;
  const failedRiskActionCreate = riskActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/actions`) && response.request().method() === 'POST' && response.status() === 503);
  const riskActionDoubleClick = riskConversionPanel.getByRole('button', { name: '生成行动项' }).dblclick({ delay: 10 });
  await riskActionDoubleClick;
  assert.equal(await riskActionTitle.isDisabled(), true, 'risk conversion inputs are locked while creation is pending');
  await failedRiskActionCreate;
  await riskActionPage.getByText('创建行动项失败', { exact: true }).waitFor();
  assert.equal(actionCreateAttempts, 1, 'rapid duplicate risk conversions send one POST');
  assert.equal(await riskConversionSelect.inputValue(), String(dailyRisk.itemId), 'failed risk conversion retains its source item');
  assert.equal(await riskActionTitle.inputValue(), riskActionTitleValue, 'failed risk conversion retains the edited title');
  assert.equal(await riskDueDate.inputValue(), '2026-10-10', 'failed risk conversion retains its due date');

  await riskActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, delayMs: 180 }),
    });
  });
  const successfulRiskActionCreate = riskActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/actions`) && response.request().method() === 'POST' && response.status() === 200);
  await riskConversionPanel.getByRole('button', { name: '生成行动项' }).click();
  await successfulRiskActionCreate;
  await riskActionPage.getByText(riskActionTitleValue, { exact: true }).waitFor();
  assert.equal(await riskConversionSelect.inputValue(), '', 'confirmed risk conversion clears the selected source');
  assert.equal(await riskConversionPanel.getByPlaceholder('行动项标题').count(), 0, 'confirmed risk conversion closes the form instead of leaving a duplicate-ready button');
  assert.equal(actionCreateAttempts, 2, 'the explicit retry is the only second risk conversion request');
  assert.deepEqual(mutations, [
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/actions`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/actions`,
  ], 'risk conversion retry adds one action and does not repeat after confirmation');
  assert.equal(expectedRiskAction503, 0, 'the expected risk conversion failure response is accounted for');
  assert.deepEqual(errors, [], 'action creation and update failures have no unexpected browser errors');
  await riskActionPage.close();
  console.log('复盘行动项列表/抽屉及日报风险转化回归通过：亮/暗主题 × 320/390/1440px、失败保留、成功清空与重复写入拦截');
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
  io.close();
}
