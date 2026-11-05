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
let dailyRiskReadDelayMs = 0;
let detailReadAttempts = 0;
let dailyRiskReadAttempts = 0;
let dailyRisksFixture: typeof dailyRisk[] = [];
let actionCreateFailures = 0;
let actionCreateDelayMs = 0;
let actionCreateAttempts = 0;
let actionCreateCommitThenFail = 0;
let actionCreateStatusFailures = 0;
let actionCreateStatusAttempts = 0;
let nextCreatedActionId = 995;
const actionCreateResults = new Map<string, { fingerprint: string; actionId: number }>();
let actionUpdateFailures = 0;
let actionUpdateDelayMs = 0;
let actionUpdateAttempts = 0;
let actionUpdateCommitThenFail = 0;
let actionUpdateStatusFailures = 0;
let actionUpdateStatusAttempts = 0;
let actionUpdateConflictFailures = 0;
let actionUpdateConflictResult = '';
let actionUpdateConflictCommitThenFail = 0;
let nextSnapshotId = 996;
const actionUpdateResults = new Map<string, { fingerprint: string }>();
const actionUpdateConflicts = new Map<string, { fingerprint: string }>();
const retroMutationAttempts = { summary: 0, snapshot: 0, publish: 0, archive: 0 };
let summaryUpdateStatusFailures = 0;
let summaryUpdateStatusAttempts = 0;
const summaryUpdateResults = new Map<string, { fingerprint: string; outcome: 'processed' | 'conflict' }>();
type RetroMutationFixtureConfig = {
  failures: number;
  delayMs: number;
  failureStatus: number;
  commitThenFail: number;
  statusFailures: number;
  conflicts: number;
  externalStatus: 'draft' | 'published' | 'archived' | null;
};
const retroMutationConfig = {
  summary: { failures: 0, delayMs: 0, failureStatus: 503, commitThenFail: 0, statusFailures: 0, conflicts: 0, externalStatus: null } as RetroMutationFixtureConfig,
  snapshot: { failures: 0, delayMs: 0, failureStatus: 503, commitThenFail: 0, statusFailures: 0, conflicts: 0, externalStatus: null } as RetroMutationFixtureConfig,
  publish: { failures: 0, delayMs: 0, failureStatus: 503, commitThenFail: 0, statusFailures: 0, conflicts: 0, externalStatus: null } as RetroMutationFixtureConfig,
  archive: { failures: 0, delayMs: 0, failureStatus: 503, commitThenFail: 0, statusFailures: 0, conflicts: 0, externalStatus: null } as RetroMutationFixtureConfig,
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

async function assertMutedTextContrast(scope: import('playwright').Locator, context: string) {
  const lowContrast: string[] = [];
  for (const locator of await scope.locator('.text-studio-text-muted').all()) {
    const text = (await locator.evaluate((element) => element instanceof HTMLElement ? element.innerText : '')).trim().replace(/\s+/g, ' ');
    if (!text) continue;
    const ratio = await contrastRatio(locator);
    if (ratio < 4.5) lowContrast.push(`${text.slice(0, 80)} (${ratio.toFixed(2)}:1)`);
  }
  assert.deepEqual(lowContrast, [], `${context} visible muted text stays at or above 4.5:1`);
}

async function assertMinTouchHeight(locator: import('playwright').Locator, context: string) {
  const bounds = await locator.boundingBox();
  assert(bounds, `${context} has measurable bounds`);
  assert.ok(bounds.height >= 40, `${context} is ${bounds.height}px high; expected at least 40px`);
}

async function assertMinTouchTarget(locator: import('playwright').Locator, context: string) {
  const bounds = await locator.boundingBox();
  assert(bounds, `${context} has measurable bounds`);
  assert.ok(bounds.width >= 40, `${context} is ${bounds.width}px wide; expected at least 40px`);
  assert.ok(bounds.height >= 40, `${context} is ${bounds.height}px high; expected at least 40px`);
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
let listFixtureEmpty = false;
app.get('/__qa-list', (req, res) => {
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  listFixtureEmpty = req.query.empty === '1';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(admin))});localStorage.setItem('xmt_token','retro-action-responsive-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/retrospectives');</script>`);
});
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
  if (editable) summaryUpdateResults.clear();
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
app.post('/__qa/configure-risk-delay', (req, res) => {
  dailyRiskReadDelayMs = Number(req.body.delayMs) || 0;
  res.json({ ok: true });
});
app.post('/__qa/configure-action-create', (req, res) => {
  actionCreateFailures = Number(req.body.failures) || 0;
  actionCreateDelayMs = Number(req.body.delayMs) || 0;
  actionCreateCommitThenFail = Number(req.body.commitThenFail) || 0;
  actionCreateStatusFailures = Number(req.body.statusFailures) || 0;
  res.json({ ok: true });
});
app.post('/__qa/configure-action-update', (req, res) => {
  actionUpdateFailures = Number(req.body.failures) || 0;
  actionUpdateDelayMs = Number(req.body.delayMs) || 0;
  actionUpdateCommitThenFail = Number(req.body.commitThenFail) || 0;
  actionUpdateStatusFailures = Number(req.body.statusFailures) || 0;
  actionUpdateConflictFailures = Number(req.body.conflicts) || 0;
  actionUpdateConflictResult = String(req.body.conflictResult || '');
  actionUpdateConflictCommitThenFail = Number(req.body.conflictCommitThenFail) || 0;
  res.json({ ok: true });
});
app.post('/__qa/configure-retro-mutation/:kind', (req, res) => {
  const kind = req.params.kind as keyof typeof retroMutationConfig;
  if (!(kind in retroMutationConfig)) return res.status(404).json({ ok: false });
  retroMutationConfig[kind] = {
    failures: Number(req.body.failures) || 0,
    delayMs: Number(req.body.delayMs) || 0,
    failureStatus: Number(req.body.failureStatus) || 503,
    commitThenFail: Number(req.body.commitThenFail) || 0,
    statusFailures: Number(req.body.statusFailures) || 0,
    conflicts: Number(req.body.conflicts) || 0,
    externalStatus: ['draft', 'published', 'archived'].includes(req.body.externalStatus) ? req.body.externalStatus : null,
  };
  if (kind === 'summary') summaryUpdateStatusFailures = Number(req.body.statusFailures) || 0;
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
app.get(`/api/retrospectives/${retrospective.id}/daily-risks`, async (_req, res) => {
  dailyRiskReadAttempts += 1;
  if (dailyRiskReadDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, dailyRiskReadDelayMs));
  if (dailyRiskReadFailures > 0) {
    dailyRiskReadFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟日报风险读取失败' });
  }
  return res.json({ success: true, data: { risks: dailyRisksFixture } });
});
app.get(`/api/retrospectives/${retrospective.id}`, (_req, res) => {
  detailReadAttempts += 1;
  res.set('Cache-Control', 'no-store');
  if (detailReadFailures > 0) {
    detailReadFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘详情读取失败' });
  }
  return res.json({ success: true, data: detail });
});
app.get(`/api/retrospectives/${retrospective.id}/actions/create-requests/:requestId`, (req, res) => {
  actionCreateStatusAttempts += 1;
  res.set('Cache-Control', 'no-store');
  if (actionCreateStatusFailures > 0) {
    actionCreateStatusFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟行动项结果核实失败' });
  }
  const result = actionCreateResults.get(req.params.requestId);
  if (!result) return res.json({ success: true, data: { state: 'not_found' } });
  const stillExists = detail.actions.some((item) => item.id === result.actionId);
  return res.json({ success: true, data: stillExists
    ? { state: 'created', actionId: result.actionId }
    : { state: 'deleted' } });
});
app.get('/api/retrospectives/actions/:actionId/update-requests/:requestId', (req, res) => {
  actionUpdateStatusAttempts += 1;
  res.set('Cache-Control', 'no-store');
  if (actionUpdateStatusFailures > 0) {
    actionUpdateStatusFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟行动项更新结果核实失败' });
  }
  const key = `${req.params.actionId}:${req.params.requestId}`;
  const state = actionUpdateConflicts.has(key) ? 'conflict' : actionUpdateResults.has(key) ? 'processed' : 'not_found';
  return res.json({ success: true, data: { state } });
});
app.post(`/api/retrospectives/${retrospective.id}/actions`, async (req, res) => {
  actionCreateAttempts += 1;
  if (actionCreateDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, actionCreateDelayMs));
  if (actionCreateFailures > 0) {
    actionCreateFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟行动项创建失败' });
  }
  const requestId = String(req.get('X-Idempotency-Key') || '');
  const fingerprint = JSON.stringify({
    title: String(req.body.title || '').trim(),
    descriptionMd: String(req.body.descriptionMd || ''),
    ownerId: req.body.ownerId || admin.id,
    dueDate: req.body.dueDate || null,
  });
  const existing = requestId ? actionCreateResults.get(requestId) : null;
  if (existing && existing.fingerprint !== fingerprint) {
    return res.status(409).json({ success: false, message: '请求编号已用于其他内容' });
  }
  if (existing) return res.json({ success: true, data: detail });
  const createdAction = {
    ...action,
    id: nextCreatedActionId++,
    title: String(req.body.title || ''),
    descriptionMd: String(req.body.descriptionMd || ''),
    ownerId: req.body.ownerId || admin.id,
    dueDate: req.body.dueDate ? String(req.body.dueDate) : null,
    status: 'todo',
  };
  detail.actions = [...detail.actions, createdAction];
  if (requestId) actionCreateResults.set(requestId, { fingerprint, actionId: createdAction.id });
  if (actionCreateCommitThenFail > 0) {
    actionCreateCommitThenFail -= 1;
    return res.status(503).json({ success: false, message: '模拟提交后丢失响应' });
  }
  return res.json({ success: true, data: detail });
});
app.patch(`/api/retrospectives/actions/${action.id}`, async (req, res) => {
  actionUpdateAttempts += 1;
  if (actionUpdateDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, actionUpdateDelayMs));
  if (actionUpdateFailures > 0) {
    actionUpdateFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟行动项更新失败' });
  }
  const requestId = String(req.get('X-Idempotency-Key') || '');
  const requestKey = requestId ? `${action.id}:${requestId}` : '';
  const fingerprint = JSON.stringify(req.body);
  const existingConflict = requestKey ? actionUpdateConflicts.get(requestKey) : null;
  if (existingConflict) {
    if (existingConflict.fingerprint !== fingerprint) {
      return res.status(409).json({ success: false, code: 'RETRO_ACTION_UPDATE_REQUEST_CONFLICT', message: '请求编号已用于其他内容' });
    }
    return res.status(409).json({ success: false, code: 'ACTION_CHANGED', message: '行动项已变化，请刷新后重新编辑' });
  }
  const existing = requestKey ? actionUpdateResults.get(requestKey) : null;
  if (existing && existing.fingerprint !== fingerprint) {
    return res.status(409).json({ success: false, code: 'RETRO_ACTION_UPDATE_REQUEST_CONFLICT', message: '请求编号已用于其他内容' });
  }
  if (existing) return res.json({ success: true, data: detail });
  if (actionUpdateConflictFailures > 0) {
    actionUpdateConflictFailures -= 1;
    if (requestKey) actionUpdateConflicts.set(requestKey, { fingerprint });
    Object.assign(action, { resultMd: actionUpdateConflictResult });
    if (actionUpdateConflictCommitThenFail > 0) {
      actionUpdateConflictCommitThenFail -= 1;
      return res.status(503).json({ success: false, message: '模拟 ACTION_CHANGED 冲突响应丢失' });
    }
    return res.status(409).json({ success: false, code: 'ACTION_CHANGED', message: '行动项已变化，请刷新后重新编辑' });
  }
  const updatedAction = {
    ...action,
    ...(req.body.status ? { status: req.body.status } : {}),
    ...(req.body.resultMd !== undefined ? { resultMd: String(req.body.resultMd) } : {}),
    ...(req.body.title !== undefined ? { title: String(req.body.title) } : {}),
    ...(req.body.descriptionMd !== undefined ? { descriptionMd: String(req.body.descriptionMd) } : {}),
    ...(req.body.ownerId !== undefined ? { ownerId: req.body.ownerId } : {}),
    ...(req.body.dueDate !== undefined ? { dueDate: req.body.dueDate } : {}),
  };
  Object.assign(action, updatedAction);
  if (requestKey) actionUpdateResults.set(requestKey, { fingerprint });
  if (actionUpdateCommitThenFail > 0) {
    actionUpdateCommitThenFail -= 1;
    return res.status(503).json({ success: false, message: '模拟提交后丢失响应' });
  }
  return res.json({
    success: true,
    data: { ...detail, actions: detail.actions.map((item) => item.id === action.id ? updatedAction : item) },
  });
});
app.get(`/api/retrospectives/${retrospective.id}/update-requests/:requestId`, (req, res) => {
  summaryUpdateStatusAttempts += 1;
  res.set('Cache-Control', 'no-store');
  if (summaryUpdateStatusFailures > 0) {
    summaryUpdateStatusFailures -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘结论结果核实失败' });
  }
  const receipt = summaryUpdateResults.get(req.params.requestId);
  return res.json({ success: true, data: { state: receipt?.outcome || 'not_found' } });
});
app.put(`/api/retrospectives/${retrospective.id}`, async (req, res) => {
  retroMutationAttempts.summary += 1;
  const config = retroMutationConfig.summary;
  if (config.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, config.delayMs));
  if (config.failures > 0) {
    config.failures -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘结论保存失败' });
  }
  const requestId = String(req.get('X-Idempotency-Key') || '');
  const fingerprint = JSON.stringify({
    title: String(req.body.title || '').trim(),
    summaryMd: String(req.body.summaryMd || ''),
    version: Number(req.body.version),
  });
  const existing = requestId ? summaryUpdateResults.get(requestId) : null;
  if (existing && existing.fingerprint !== fingerprint) {
    return res.status(409).json({ success: false, code: 'RETROSPECTIVE_UPDATE_REQUEST_CONFLICT', message: '请求编号已用于其他内容' });
  }
  if (existing?.outcome === 'conflict') {
    return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: '复盘已被更新，请刷新并核对结论后再保存' });
  }
  if (existing) return res.json({ success: true, data: detail });
  if (config.conflicts > 0) {
    config.conflicts -= 1;
    retrospective.summaryMd = '服务器先行更新的复盘结论';
    retrospective.version += 1;
    if (requestId) summaryUpdateResults.set(requestId, { fingerprint, outcome: 'conflict' });
    return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: '复盘已被更新，请刷新并核对结论后再保存' });
  }
  retrospective.summaryMd = String(req.body.summaryMd || '');
  retrospective.version += 1;
  if (requestId) summaryUpdateResults.set(requestId, { fingerprint, outcome: 'processed' });
  if (config.commitThenFail > 0) {
    config.commitThenFail -= 1;
    return res.status(503).json({ success: false, message: '模拟提交后丢失响应' });
  }
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
    id: nextSnapshotId++,
    retroId: retrospective.id,
    metricKey: 'topics_total',
    metricName: '选题数量',
    valueNum: 1,
    valueText: null,
    sourceRefJson: null,
    capturedAt: '2026-10-09 09:00:00',
  }];
  retrospective.snapshotCount = detail.snapshots.length;
  if (config.commitThenFail > 0) {
    config.commitThenFail -= 1;
    return res.status(503).json({ success: false, message: '模拟提交后丢失响应' });
  }
  return res.json({ success: true, data: detail });
});
function setFixtureRetrospectiveStatus(status: 'draft' | 'published' | 'archived') {
  retrospective.status = status;
  retrospective.publishedAt = status === 'draft' ? null : '2026-10-09 09:00:00';
  retrospective.archivedAt = status === 'archived' ? '2026-10-09 09:30:00' : null;
  detail.permissions = status === 'draft'
    ? { canEdit: true, canPublish: true, canArchive: false, canManageActions: true }
    : status === 'published'
      ? { canEdit: false, canPublish: false, canArchive: true, canManageActions: true }
      : { canEdit: false, canPublish: false, canArchive: false, canManageActions: false };
}
app.post(`/api/retrospectives/${retrospective.id}/publish`, async (_req, res) => {
  retroMutationAttempts.publish += 1;
  const config = retroMutationConfig.publish;
  if (config.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, config.delayMs));
  if (config.failures > 0) {
    config.failures -= 1;
    if (config.externalStatus) setFixtureRetrospectiveStatus(config.externalStatus);
    return res.status(config.failureStatus).json({ success: false, message: '模拟复盘发布失败' });
  }
  setFixtureRetrospectiveStatus('published');
  if (config.commitThenFail > 0) {
    config.commitThenFail -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘发布提交后响应丢失' });
  }
  return res.json({ success: true, data: detail });
});
app.post(`/api/retrospectives/${retrospective.id}/archive`, async (_req, res) => {
  retroMutationAttempts.archive += 1;
  const config = retroMutationConfig.archive;
  if (config.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, config.delayMs));
  if (config.failures > 0) {
    config.failures -= 1;
    if (config.externalStatus) setFixtureRetrospectiveStatus(config.externalStatus);
    return res.status(config.failureStatus).json({ success: false, message: '模拟复盘归档失败' });
  }
  setFixtureRetrospectiveStatus('archived');
  if (config.commitThenFail > 0) {
    config.commitThenFail -= 1;
    return res.status(503).json({ success: false, message: '模拟复盘归档提交后响应丢失' });
  }
  return res.json({ success: true, data: detail });
});
app.get('/api/users', (_req, res) => res.json({ data: [admin], total: 1, page: 1, limit: 200 }));
app.get('/api/retrospectives/actions/mine', (_req, res) => res.json({ success: true, data: { actions: listFixtureEmpty ? [] : [action] } }));
app.get('/api/retrospectives/templates', (_req, res) => res.json({ success: true, data: { templates: [] } }));
app.get('/api/retrospectives', (_req, res) => res.json({ success: true, data: { retrospectives: listFixtureEmpty ? [] : [retrospective] } }));
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
    for (const width of [320, 390, 1024, 1279, 1280, 1366, 1440, 1920]) {
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
      const main = page.locator('main').first();
      const mainBounds = await main.boundingBox();
      assert(mainBounds, `${theme}/${width}px main content has bounds`);
      const titleBounds = await page.getByRole('heading', { name: retrospective.title, exact: true }).boundingBox();
      assert(titleBounds, `${theme}/${width}px page title has bounds`);
      const pageActions = await Promise.all(['返回列表', '导出 Markdown', '打印页', '刷新'].map(async (name) => {
        const button = page.getByRole('button', { name, exact: true });
        assert.equal(await button.isVisible(), true, `${theme}/${width}px page action "${name}" is visible`);
        const bounds = await button.boundingBox();
        assert(bounds, `${theme}/${width}px page action "${name}" has bounds`);
        assert.ok(bounds.x >= mainBounds.x - 1 && bounds.x + bounds.width <= mainBounds.x + mainBounds.width + 1, `${theme}/${width}px page action "${name}" stays inside main content`);
        const overlapsTitle = titleBounds.x < bounds.x + bounds.width && titleBounds.x + titleBounds.width > bounds.x
          && titleBounds.y < bounds.y + bounds.height && titleBounds.y + titleBounds.height > bounds.y;
        assert.equal(overlapsTitle, false, `${theme}/${width}px page action "${name}" does not overlap the title`);
        return { name, ...bounds };
      }));
      for (let index = 0; index < pageActions.length; index += 1) {
        for (const other of pageActions.slice(index + 1)) {
          const action = pageActions[index];
          const overlaps = action.x < other.x + other.width && action.x + action.width > other.x
            && action.y < other.y + other.height && action.y + action.height > other.y;
          assert.equal(overlaps, false, `${theme}/${width}px page actions "${action.name}" and "${other.name}" do not overlap`);
        }
      }
      const detailColumns = page.getByTestId('retrospective-detail-columns');
      const columnLayout = await detailColumns.evaluate((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          count: style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
          x: bounds.x,
          right: bounds.right,
          width: bounds.width,
          children: [...element.children].map((child) => {
            const childBounds = child.getBoundingClientRect();
            return { x: childBounds.x, right: childBounds.right, width: childBounds.width };
          }),
        };
      });
      assert.equal(columnLayout.count, width >= 1280 ? 2 : 1, `${theme}/${width}px detail uses the expected responsive column count`);
      const archivePanelBounds = await page.getByTestId('retro-publish-archive-panel').evaluate((panel) => {
        const bounds = panel.getBoundingClientRect();
        return { x: bounds.x, right: bounds.right, y: bounds.y, width: bounds.width };
      });
      assert(archivePanelBounds, `${theme}/${width}px publish/archive panel has bounds`);
      assert.ok(archivePanelBounds.width > 0, `${theme}/${width}px publish/archive panel has positive width`);
      const archiveColumn = columnLayout.children[width >= 1280 ? 1 : 0];
      assert(archiveColumn, `${theme}/${width}px publish/archive column exists`);
      assert.ok(archivePanelBounds.x >= archiveColumn.x - 1 && archivePanelBounds.right <= archiveColumn.right + 1, `${theme}/${width}px publish/archive panel stays in its responsive column`);
      const actionPanel = page.getByTestId('retro-action-table-panel');
      for (const label of ['行动项标题', '说明（可选）', '负责人', '截止日期']) {
        const field = actionPanel.getByLabel(label, { exact: true });
        assert.equal(await field.count(), 1, `${theme}/${width}px action creation field exposes the label "${label}"`);
        assert.equal(await field.isVisible(), true, `${theme}/${width}px action creation label "${label}" is visible`);
        await assertMinTouchHeight(field, `${theme}/${width}px action creation field "${label}"`);
      }
      for (const label of ['行动项标题', '说明（可选）']) {
        const fieldBounds = await actionPanel.getByLabel(label, { exact: true }).boundingBox();
        assert(fieldBounds, `${theme}/${width}px action creation field "${label}" has bounds`);
        assert.ok(fieldBounds.width >= 160, `${theme}/${width}px action creation field "${label}" stays wide enough to edit comfortably`);
      }
      const actionRow = page.getByTestId(`retro-action-row-actions-${action.id}`).locator('xpath=..');
      const actionStatus = actionRow.getByRole('combobox', { name: `行动项“${action.title}”的状态`, exact: true });
      const actionResult = actionRow.getByRole('textbox', { name: `行动项“${action.title}”的处理结果`, exact: true });
      assert.equal(await actionStatus.count(), 1, `${theme}/${width}px inline status control identifies its action`);
      assert.equal(await actionResult.count(), 1, `${theme}/${width}px inline result control identifies its action`);
      await assertMinTouchHeight(actionStatus, `${theme}/${width}px inline action status`);
      await actionStatus.focus();
      await actionStatus.press('Tab');
      const resultFocus = await actionResult.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          focused: document.activeElement === element,
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          outlineColor: style.outlineColor,
          outlineOffset: Number.parseFloat(style.outlineOffset),
        };
      });
      assert.equal(resultFocus.focused, true, `${theme}/${width}px keyboard Tab advances from action status to its result field`);
      assert.notEqual(resultFocus.outlineStyle, 'none', `${theme}/${width}px action result field exposes a keyboard focus outline`);
      assert.ok(resultFocus.outlineWidth >= 2, `${theme}/${width}px action result focus outline is at least 2px`);
      assert.notEqual(resultFocus.outlineColor, 'rgba(0, 0, 0, 0)', `${theme}/${width}px action result focus outline is visible`);
      assert.ok(resultFocus.outlineOffset >= 2, `${theme}/${width}px action result focus outline has a visible offset`);
      if (theme === 'dark') {
        await assertMutedTextContrast(page.locator('main').first(), `${theme}/${width}px retrospective detail`);
        const tableHeaders = await page.locator('table thead th').all();
        for (const heading of tableHeaders) {
          const label = (await heading.innerText()).trim();
          const ratio = await contrastRatio(heading);
          assert.ok(ratio >= 4.5, `${theme}/${width}px action table heading "${label}" contrast is ${ratio.toFixed(2)}:1; expected at least 4.5:1`);
        }
        const publishGuidance = page.getByText('发布后基础信息和指标快照进入只读；归档后不再允许新增行动项。', { exact: true });
        const publishGuidanceContrast = await contrastRatio(publishGuidance);
        assert.ok(publishGuidanceContrast >= 4.5, `${theme}/${width}px publish/archive guidance contrast is ${publishGuidanceContrast.toFixed(2)}:1; expected at least 4.5:1`);
      }
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
      const endGeometry = await page.getByTestId('retro-action-table-scroll').evaluate((scrollArea) => {
        const cell = scrollArea.querySelector<HTMLElement>('[data-testid^="retro-action-row-actions-"]');
        if (!cell) return null;
        const initialScrollLeft = scrollArea.scrollLeft;
        const initialBounds = cell.getBoundingClientRect();
        const maxScrollLeft = scrollArea.scrollWidth - scrollArea.clientWidth;
        scrollArea.scrollLeft = maxScrollLeft;
        const cellBounds = cell.getBoundingClientRect();
        const viewportBounds = scrollArea.getBoundingClientRect();
        const result = {
          position: getComputedStyle(cell).position,
          initialScrollLeft,
          maxScrollLeft,
          initialLeft: initialBounds.left,
          initialRight: initialBounds.right,
          left: cellBounds.left,
          right: cellBounds.right,
          scrollLeft: viewportBounds.left,
          scrollRight: viewportBounds.right,
        };
        scrollArea.scrollLeft = initialScrollLeft;
        return result;
      });
      assert(endGeometry, `${theme}/${width}px action table scroll area is available`);
      assert.ok(endGeometry.maxScrollLeft > endGeometry.initialScrollLeft, `${theme}/${width}px action table has real horizontal overflow`);
      assert.equal(endGeometry.position, 'sticky', `${theme}/${width}px action column remains fixed at maximum table scroll`);
      assert.ok(endGeometry.left >= endGeometry.scrollLeft - 1 && endGeometry.right <= endGeometry.scrollRight + 1, `${theme}/${width}px action column remains visible at maximum table scroll: ${JSON.stringify(endGeometry)}`);
      assert.ok(Math.abs(endGeometry.initialLeft - endGeometry.left) <= 1 && Math.abs(endGeometry.initialRight - endGeometry.right) <= 1, `${theme}/${width}px action column remains anchored during horizontal scrolling`);

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
        if (theme === 'dark') await assertMutedTextContrast(overlay, `${theme}/${width}px action detail drawer`);
        for (const [label, field] of [
          ['标题', overlay.getByRole('textbox', { name: '标题', exact: true })],
          ['负责人', overlay.getByRole('combobox', { name: '负责人', exact: true })],
          ['截止日期', overlay.getByRole('textbox', { name: '截止日期', exact: true })],
          ['状态', overlay.getByRole('combobox', { name: '状态', exact: true })],
          ['说明', overlay.getByRole('textbox', { name: '说明', exact: true })],
          ['处理结果', overlay.getByRole('textbox', { name: '处理结果', exact: true })],
        ] as const) {
          assert.equal(await field.count(), 1, `${theme}/${width}px drawer field exposes the label "${label}"`);
          assert.equal(await field.isVisible(), true, `${theme}/${width}px drawer field "${label}" is visible`);
          await assertMinTouchHeight(field, `${theme}/${width}px drawer field "${label}"`);
        }
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

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${base}/__qa-list?theme=${theme}`);
      await page.getByRole('heading', { name: '复盘中心' }).waitFor();
      await page.getByTestId('my-retro-actions-panel').getByText(action.retroTitle, { exact: true }).waitFor();
      await page.getByTestId('retrospective-list-panel').getByText(retrospective.title, { exact: true }).waitFor();
      if (width >= 768) {
        for (const label of ['打开消息中心', '切换主题']) {
          const control = page.getByRole('button', { name: label, exact: true });
          assert.equal(await control.count(), 1, `${theme}/${width}px shared header exposes "${label}"`);
          assert.equal(await control.isVisible(), true, `${theme}/${width}px shared header control "${label}" is visible`);
          await assertMinTouchTarget(control, `${theme}/${width}px shared header control "${label}"`);
        }
      }
      if (width <= 390) {
        for (const label of ['返回首页', '退出登录']) {
          const control = page.getByRole('button', { name: label, exact: true });
          assert.equal(await control.count(), 1, `${theme}/${width}px mobile shell exposes "${label}"`);
          await assertMinTouchTarget(control, `${theme}/${width}px mobile shell control "${label}"`);
        }
      }
      if (theme === 'dark') {
        await assertMutedTextContrast(page.locator('main').first(), `${theme}/${width}px retrospective list and personal actions`);
        for (const heading of await page.locator('table thead th').all()) {
          const label = (await heading.innerText()).trim();
          const ratio = await contrastRatio(heading);
          assert.ok(ratio >= 4.5, `${theme}/${width}px retrospective list heading "${label}" contrast is ${ratio.toFixed(2)}:1; expected at least 4.5:1`);
        }
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}px retrospective list has no horizontal overflow`);
      await page.close();
    }
  }

  const desktopShellPage = await browser.newPage({ viewport: { width: 1440, height: 844 }, reducedMotion: 'reduce' });
  desktopShellPage.on('pageerror', (error) => errors.push(error.message));
  desktopShellPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await desktopShellPage.goto(`${base}/__qa-list?theme=light`);
  await desktopShellPage.getByRole('heading', { name: '复盘中心' }).waitFor();
  for (const label of ['打开消息中心', '切换主题']) {
    const control = desktopShellPage.getByRole('button', { name: label, exact: true });
    assert.equal(await control.count(), 1, `desktop shell exposes "${label}"`);
    await assertMinTouchTarget(control, `desktop shell control "${label}"`);
  }
  await desktopShellPage.setViewportSize({ width: 320, height: 844 });
  const openMenu = desktopShellPage.getByRole('button', { name: '打开导航菜单', exact: true });
  assert.equal(await openMenu.isVisible(), true, 'desktop shell in a narrow browser keeps a visible mobile navigation trigger');
  await assertMinTouchTarget(openMenu, 'narrow desktop shell open navigation menu');
  await openMenu.click();
  const closeMenu = desktopShellPage.getByRole('button', { name: '关闭导航菜单', exact: true });
  assert.equal(await closeMenu.isVisible(), true, 'narrow desktop shell navigation drawer exposes its close control');
  await assertMinTouchTarget(closeMenu, 'narrow desktop shell close navigation menu');
  await closeMenu.click();
  assert.equal(await desktopShellPage.locator('[aria-label="移动导航菜单"]').getAttribute('aria-hidden'), 'true', 'closing the narrow navigation drawer marks it unavailable to assistive technology');
  assert.ok(await desktopShellPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'narrow desktop shell has no horizontal overflow after navigation drawer closes');
  await desktopShellPage.close();

  const emptyListPage = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  emptyListPage.on('pageerror', (error) => errors.push(error.message));
  emptyListPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await emptyListPage.goto(`${base}/__qa-list?theme=dark&empty=1`);
  await emptyListPage.getByRole('heading', { name: '复盘中心' }).waitFor();
  await emptyListPage.getByText('暂无复盘', { exact: true }).waitFor();
  await emptyListPage.getByText('当前没有需要你跟进的复盘行动项。', { exact: true }).waitFor();
  await assertMutedTextContrast(emptyListPage.locator('main').first(), 'dark/320px empty retrospective states');
  assert.ok(await emptyListPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'dark/320px empty retrospective states have no horizontal overflow');
  await emptyListPage.close();

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

  await recoveryPage.evaluate(async () => {
    await fetch('/__qa/configure-risk-delay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delayMs: 500 }),
    });
  });
  const riskPanel = recoveryPage.getByTestId('retro-daily-risk-panel');
  const riskRetry = recoveryPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/daily-risks`) && response.request().method() === 'GET' && response.status() === 200);
  await recoveryPage.getByRole('button', { name: '重新加载日报风险' }).click();
  const riskLoadingStatus = riskPanel.getByRole('status').filter({ hasText: '正在加载日报风险...' });
  await riskLoadingStatus.waitFor();
  const riskRefreshButton = riskPanel.getByRole('button', { name: '刷新日报风险', exact: true });
  assert.equal(await riskRefreshButton.isDisabled(), true, 'daily risk refresh locks during its delayed read');
  assert.equal(await riskRefreshButton.getAttribute('aria-busy'), 'true', 'daily risk refresh exposes its busy state');
  const riskSpinner = riskRefreshButton.locator('svg');
  assert.equal(await riskSpinner.getAttribute('aria-hidden'), 'true', 'the daily risk spinner is decorative');
  assert.equal(await riskSpinner.evaluate((icon) => getComputedStyle(icon).animationName), 'none', 'the daily risk spinner respects reduced motion');
  await riskRetry;
  dailyRiskReadDelayMs = 0;
  assert.equal(await riskLoadingStatus.count(), 0, 'the daily risk loading announcement clears when the read succeeds');
  assert.equal(await riskRefreshButton.getAttribute('aria-busy'), 'false', 'the daily risk refresh button clears its busy state');
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
  let expectedActionUpdate409 = 0;
  const actionUpdateRequestSnapshots: Array<{ requestId?: string; payload: string | null }> = [];
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
    if (expectedActionUpdate409 > 0 && message.text().includes('409')) {
      expectedActionUpdate409 -= 1;
      return;
    }
    errors.push(message.text());
  });
  createActionPage.on('request', (request) => {
    if (request.url().endsWith(`/api/retrospectives/actions/${action.id}`) && request.method() === 'PATCH') {
      actionUpdateRequestSnapshots.push({
        requestId: request.headers()['x-idempotency-key'],
        payload: request.postData(),
      });
    }
    if (request.url().includes('/api/retrospectives') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      mutations.push(`${request.method()} ${request.url()}`);
    }
  });
  await createActionPage.goto(`${base}/__qa?theme=light`);
  await createActionPage.getByRole('heading', { name: retrospective.title }).waitFor();
  const actionPanel = createActionPage.getByTestId('retro-action-table-panel');
  const actionTitleInput = actionPanel.getByLabel('行动项标题', { exact: true });
  const actionDescriptionInput = actionPanel.getByLabel('说明（可选）', { exact: true });
  const newActionTitle = '行动项创建失败后保留输入验收';
  const newActionDescription = '确认失败后仍可按原内容安全重试。';
  await actionTitleInput.fill(newActionTitle);
  await actionDescriptionInput.fill(newActionDescription);
  await createActionPage.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    (window as Window & { __originalStorageSetItem?: typeof Storage.prototype.setItem }).__originalStorageSetItem = originalSetItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'xmt:retro-action-create:99:991') {
        const marker = JSON.parse(value) as { payload: { title: string } };
        marker.payload.title = '同一请求编号但内容被篡改';
        return originalSetItem.call(this, key, JSON.stringify(marker));
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await actionPanel.getByRole('button', { name: '新增', exact: true }).click();
  await createActionPage.getByText('恢复记录写入后未能通过校验，行动项未提交。', { exact: true }).waitFor();
  assert.equal(actionCreateAttempts, 0, 'a recovery marker changed under its request ID sends no create POST');
  assert.equal(await createActionPage.evaluate(() => sessionStorage.getItem('xmt:retro-action-create:99:991')), null, 'the mismatched create marker is removed after exact-content verification fails');
  assert.equal(await actionTitleInput.inputValue(), newActionTitle, 'preflight rejection preserves the action title');
  assert.equal(await actionDescriptionInput.inputValue(), newActionDescription, 'preflight rejection preserves the action description');
  assert.equal(await actionTitleInput.isDisabled(), false, 'a safely cleared preflight marker does not lock the form');
  await createActionPage.evaluate(() => {
    const originalSetItem = (window as Window & { __originalStorageSetItem?: typeof Storage.prototype.setItem }).__originalStorageSetItem;
    if (originalSetItem) Storage.prototype.setItem = originalSetItem;
  });
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
  await createActionPage.getByText('尚未查到这次行动项创建记录', { exact: true }).waitFor();
  assert.equal(actionCreateAttempts, 1, 'rapid duplicate action creation sends one POST');
  assert.equal(await actionTitleInput.inputValue(), newActionTitle, 'failed action creation retains the title');
  assert.equal(await actionDescriptionInput.inputValue(), newActionDescription, 'failed action creation retains the description');
  assert.equal(await actionTitleInput.isDisabled(), true, 'action fields stay locked until the result is verified');

  await createActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, delayMs: 180 }),
    });
  });
  const successfulActionCreate = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/actions`) && response.request().method() === 'POST' && response.status() === 200);
  await createActionPage.getByRole('button', { name: '使用原请求编号重试' }).click();
  await successfulActionCreate;
  await actionPanel.getByText(newActionTitle, { exact: true }).waitFor();
  assert.equal(await actionTitleInput.inputValue(), '', 'confirmed action creation clears the submitted title');
  assert.equal(await actionDescriptionInput.inputValue(), '', 'confirmed action creation clears the submitted description');
  assert.equal(actionCreateAttempts, 2, 'the explicit retry is the only second action create request');

  const uncertainActionTitle = '响应丢失后刷新只读核实';
  await actionTitleInput.fill(uncertainActionTitle);
  await createActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitThenFail: 1, statusFailures: 1 }),
    });
  });
  expectedCreateAction503 += 2;
  const committedButLostResponse = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/actions`) && response.request().method() === 'POST' && response.status() === 503);
  await actionPanel.getByRole('button', { name: '新增', exact: true }).click();
  await committedButLostResponse;
  await createActionPage.getByText('行动项创建结果暂时无法核实', { exact: true }).waitFor();
  assert.equal(await actionTitleInput.isDisabled(), true, 'uncertain create keeps the form locked');
  const attemptsBeforeReload = actionCreateAttempts;
  const statusReadsBeforeReload = actionCreateStatusAttempts;
  let postReloadDetailReads = 0;
  const readRecoveryAfterReload = new Promise<void>((resolve) => {
    createActionPage.on('response', (response) => {
      if (response.request().method() === 'GET' && response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`) {
        postReloadDetailReads += 1;
        if (postReloadDetailReads >= 2) resolve();
      }
    });
  });
  const statusRecoveryAfterReload = createActionPage.waitForResponse((response) => response.url().includes(`/api/retrospectives/${retrospective.id}/actions/create-requests/`) && response.request().method() === 'GET' && response.status() === 200);
  await createActionPage.reload();
  await Promise.all([readRecoveryAfterReload, statusRecoveryAfterReload]);
  await createActionPage.getByRole('heading', { name: retrospective.title }).waitFor();
  await createActionPage.getByText(uncertainActionTitle, { exact: true }).waitFor();
  await createActionPage.getByTestId('retro-action-table-panel').getByLabel('行动项标题', { exact: true }).waitFor();
  assert.equal(actionCreateAttempts, attemptsBeforeReload, 'refresh after uncertainty performs no POST retry');
  assert.ok(actionCreateStatusAttempts > statusReadsBeforeReload, 'refresh performs a read-only result verification');
  assert.equal(await createActionPage.getByTestId('retro-action-table-panel').getByLabel('行动项标题', { exact: true }).isDisabled(), false, 'confirmed recovery clears the write lock');

  const actionRowActions = createActionPage.getByTestId(`retro-action-row-actions-${action.id}`);
  const actionRow = actionRowActions.locator('xpath=..');
  const actionStatus = actionRow.getByRole('combobox', { name: `行动项“${action.title}”的状态`, exact: true });
  const actionResult = actionRow.getByRole('textbox', { name: `行动项“${action.title}”的处理结果`, exact: true });
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

  expectedActionUpdate503 += 1;
  const failedActionUpdate = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 503);
  const failedUpdateClick = actionRowActions.getByRole('button', { name: '保存' }).dblclick({ delay: 10 });
  await failedUpdateClick;
  assert.equal(await actionStatus.isDisabled(), true, 'action fields are locked while an update is pending');
  await failedActionUpdate;
  await createActionPage.getByText('尚未查到这次行动项更新记录', { exact: true }).waitFor();
  assert.equal(actionUpdateAttempts, 1, 'rapid duplicate action updates send one PATCH before explicit retry');
  assert.equal(await actionStatus.isDisabled(), true, 'not-found keeps the original action payload locked');
  assert.equal(await actionStatus.inputValue(), 'done', 'failed action update retains the selected status');
  assert.equal(await actionResult.inputValue(), updatedResult, 'failed action update retains the result text');
  assert.match(actionUpdateRequestSnapshots[0]?.requestId || '', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'PATCH includes a UUID idempotency key');

  await actionRowActions.getByRole('button', { name: '详情' }).click();
  const actionUpdateRecoveryDrawer = createActionPage.locator('.xmt-overlay-center');
  await actionUpdateRecoveryDrawer.getByRole('heading', { name: '行动项详情' }).waitFor();
  assert.equal(await actionUpdateRecoveryDrawer.getByLabel('处理结果').isDisabled(), true, 'the drawer shares the row recovery lock');
  assert.equal(await actionUpdateRecoveryDrawer.getByRole('button', { name: '使用原请求编号重试' }).isVisible(), true, 'the drawer exposes the same explicit recovery action');

  await createActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, delayMs: 180 }),
    });
  });
  const successfulActionUpdate = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 200);
  const successfulUpdateClick = actionUpdateRecoveryDrawer.getByRole('button', { name: '使用原请求编号重试' }).click();
  await successfulUpdateClick;
  const actionResultDom = createActionPage.locator(`textarea[aria-label="行动项“${action.title}”的处理结果"]`);
  assert.equal(await actionResultDom.isDisabled(), true, 'action result input stays locked while the retry is pending');
  await successfulActionUpdate;
  await createActionPage.getByText('行动项已更新', { exact: true }).waitFor();
  await actionUpdateRecoveryDrawer.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await actionStatus.inputValue(), 'done', 'confirmed action update applies the server status');
  assert.equal(await actionResult.inputValue(), updatedResult, 'confirmed action update retains the saved result');
  assert.equal(actionUpdateAttempts, 2, 'the explicit same-key retry is the only second PATCH');
  assert.equal(actionUpdateRequestSnapshots[1]?.requestId, actionUpdateRequestSnapshots[0]?.requestId, 'not-found retry reuses the original UUID');
  assert.equal(actionUpdateRequestSnapshots[1]?.payload, actionUpdateRequestSnapshots[0]?.payload, 'not-found retry reuses the complete original payload');

  const committedUpdateResult = '服务端已提交但响应丢失；刷新后只读恢复。';
  await actionResult.fill(committedUpdateResult);
  await createActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitThenFail: 1, statusFailures: 1 }),
    });
  });
  expectedActionUpdate503 = 2;
  const committedUpdateResponse = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 503);
  const firstFailedStatusRead = createActionPage.waitForResponse((response) => response.url().includes(`/api/retrospectives/actions/${action.id}/update-requests/`) && response.request().method() === 'GET' && response.status() === 503);
  await actionRowActions.getByRole('button', { name: '保存' }).click();
  await Promise.all([committedUpdateResponse, firstFailedStatusRead]);
  await createActionPage.getByText('行动项更新结果暂时无法核实', { exact: true }).waitFor();
  assert.equal(await actionStatus.isDisabled(), true, 'an unreadable status result keeps the current action locked');
  const updatePatchesBeforeReload = actionUpdateAttempts;
  const updateStatusReadsBeforeReload = actionUpdateStatusAttempts;
  let updateDetailReadsAfterReload = 0;
  const updateDetailRefreshAfterReload = new Promise<void>((resolve) => {
    createActionPage.on('response', (response) => {
      if (response.request().method() === 'GET' && response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`) {
        updateDetailReadsAfterReload += 1;
        if (updateDetailReadsAfterReload >= 2) resolve();
      }
    });
  });
  const processedUpdateStatusAfterReload = createActionPage.waitForResponse((response) => response.url().includes(`/api/retrospectives/actions/${action.id}/update-requests/`) && response.request().method() === 'GET' && response.status() === 200);
  await createActionPage.reload();
  await Promise.all([updateDetailRefreshAfterReload, processedUpdateStatusAfterReload]);
  const recoveredActionRow = createActionPage.getByTestId(`retro-action-row-actions-${action.id}`).locator('xpath=..');
  const recoveredActionResult = recoveredActionRow.getByRole('textbox', { name: `行动项“${action.title}”的处理结果`, exact: true });
  assert.equal(await recoveredActionResult.inputValue(), committedUpdateResult, 'processed status recovers the committed update into the current detail');
  assert.equal(actionUpdateAttempts, updatePatchesBeforeReload, 'reload recovery sends only GET requests and no second PATCH');
  assert.ok(actionUpdateStatusAttempts > updateStatusReadsBeforeReload, 'reload recovery repeats the read-only status check');
  assert.equal(await recoveredActionResult.isDisabled(), false, 'confirmed detail refresh clears the action write lock');

  const lostConflictDraft = '冲突响应丢失后不得自动重放的本地草稿。';
  const lostConflictServerResult = '服务端已先变更；状态查询确认是冲突。';
  await recoveredActionResult.fill(lostConflictDraft);
  await createActionPage.evaluate(async (conflictResult) => {
    await fetch('/__qa/configure-action-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conflicts: 1, conflictResult, conflictCommitThenFail: 1, statusFailures: 1 }),
    });
  }, lostConflictServerResult);
  expectedActionUpdate503 += 2;
  const lostConflictPatch = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 503);
  const failedConflictStatusRead = createActionPage.waitForResponse((response) => response.url().includes(`/api/retrospectives/actions/${action.id}/update-requests/`) && response.request().method() === 'GET' && response.status() === 503);
  await actionRowActions.getByRole('button', { name: '保存' }).click();
  await Promise.all([lostConflictPatch, failedConflictStatusRead]);
  await createActionPage.getByText('行动项更新结果暂时无法核实', { exact: true }).waitFor();
  const lostConflictRequestId = actionUpdateRequestSnapshots.at(-1)?.requestId;
  const patchesBeforeConflictReload = actionUpdateAttempts;
  const methodsAfterConflictReload: string[] = [];
  const recordRecoveryMethod = (request: import('playwright').Request) => {
    if (request.url().includes('/api/retrospectives')) methodsAfterConflictReload.push(request.method());
  };
  createActionPage.on('request', recordRecoveryMethod);
  const conflictStatusAfterReload = createActionPage.waitForResponse((response) => response.url().includes(`/api/retrospectives/actions/${action.id}/update-requests/`) && response.request().method() === 'GET' && response.status() === 200);
  await createActionPage.reload();
  await conflictStatusAfterReload;
  await createActionPage.getByRole('alert').filter({ hasText: '服务器已刷新；表单保留本次未提交内容' }).waitFor();
  createActionPage.off('request', recordRecoveryMethod);
  assert.equal(actionUpdateAttempts, patchesBeforeConflictReload, 'a conflict status after reload performs no additional PATCH');
  assert.ok(actionUpdateStatusAttempts >= updateStatusReadsBeforeReload + 3, 'the reloaded request reads the persisted conflict status');
  assert.deepEqual(methodsAfterConflictReload.filter((method) => method !== 'GET'), [], 'reload conflict recovery uses only GET requests');
  const actionRowActionsAfterConflictReload = createActionPage.getByTestId(`retro-action-row-actions-${action.id}`);
  const actionRowAfterConflictReload = actionRowActionsAfterConflictReload.locator('xpath=..');
  const recoveredConflictResult = actionRowAfterConflictReload.getByRole('textbox', { name: `行动项“${action.title}”的处理结果`, exact: true });
  assert.equal(await recoveredConflictResult.inputValue(), lostConflictDraft, 'the old local draft remains visible without being submitted');
  assert.equal(await createActionPage.getByText(`本次保留：${lostConflictDraft}`, { exact: true }).count(), 1, 'conflict review labels the preserved local draft');
  assert.equal(await createActionPage.getByText(`服务器当前：${lostConflictServerResult}`, { exact: true }).count(), 1, 'conflict review also shows the refreshed server value');
  assert.equal(actionUpdateAttempts, 4, 'the lost ACTION_CHANGED response is never replayed after reload');

  const externallyUpdatedResult = '其他协作者已先更新这条行动项。';
  const inlineConflictDraft = '基于旧内容准备提交的结果';
  await recoveredConflictResult.fill(inlineConflictDraft);
  await createActionPage.evaluate(async (conflictResult) => {
    await fetch('/__qa/configure-action-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conflicts: 1, conflictResult }),
    });
  }, externallyUpdatedResult);
  const statusReadsBeforeConflict = actionUpdateStatusAttempts;
  expectedActionUpdate409 += 1;
  const conflictPatch = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 409);
  const conflictDetailRefresh = createActionPage.waitForResponse((response) => response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}` && response.request().method() === 'GET' && response.status() === 200);
  await actionRowActions.getByRole('button', { name: '保存' }).click();
  await Promise.all([conflictPatch, conflictDetailRefresh]);
  await createActionPage.getByRole('alert').filter({ hasText: '服务器已刷新；表单保留本次未提交内容' }).waitFor();
  assert.equal(actionUpdateStatusAttempts, statusReadsBeforeConflict, '409 conflict refresh skips the request-status endpoint');
  assert.equal(await recoveredConflictResult.inputValue(), inlineConflictDraft, '409 refresh preserves the submitted row draft');
  assert.equal(await createActionPage.getByText(`本次保留：${inlineConflictDraft}`, { exact: true }).count(), 1, 'inline conflict review shows the local draft');
  assert.equal(await createActionPage.getByText(`服务器当前：${externallyUpdatedResult}`, { exact: true }).count(), 1, 'inline conflict review shows the latest server value');
  assert.equal(await recoveredConflictResult.isDisabled(), false, 'fields unlock for manual re-edit after conflict refresh');
  assert.equal(await createActionPage.getByRole('button', { name: '使用原请求编号重试' }).count(), 0, 'a stale payload is never offered as a retry after conflict');
  assert.equal(actionUpdateAttempts, 5, 'the conflict is one PATCH and is not retried');
  assert.notEqual(actionUpdateRequestSnapshots.at(-1)?.requestId, lostConflictRequestId, 'a later explicit save uses a fresh UUID rather than the conflict key');

  const patchesBeforeDirectConflictReload = actionUpdateAttempts;
  const statusReadsBeforeDirectConflictReload = actionUpdateStatusAttempts;
  const directConflictReloadMethods: string[] = [];
  const recordDirectConflictReloadMethod = (request: import('playwright').Request) => {
    if (request.url().includes('/api/retrospectives')) directConflictReloadMethods.push(request.method());
  };
  createActionPage.on('request', recordDirectConflictReloadMethod);
  const directConflictDetailAfterReload = createActionPage.waitForResponse((response) => response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}` && response.request().method() === 'GET' && response.status() === 200);
  await createActionPage.reload();
  await directConflictDetailAfterReload;
  await createActionPage.getByRole('alert').filter({ hasText: '服务器已刷新；表单保留本次未提交内容' }).waitFor();
  createActionPage.off('request', recordDirectConflictReloadMethod);
  assert.deepEqual(directConflictReloadMethods.filter((method) => method !== 'GET'), [], 'reload after a definitive 409 only refreshes data');
  assert.equal(actionUpdateAttempts, patchesBeforeDirectConflictReload, 'reload after a definitive 409 never replays the stale PATCH');
  assert.equal(actionUpdateStatusAttempts, statusReadsBeforeDirectConflictReload, 'definitive ACTION_CHANGED does not need a status GET');
  const actionRowAfterDirectConflictReload = createActionPage.getByTestId(`retro-action-row-actions-${action.id}`).locator('xpath=..');
  const recoveredDirectConflictResult = actionRowAfterDirectConflictReload.getByRole('textbox', { name: `行动项“${action.title}”的处理结果`, exact: true });
  assert.equal(await recoveredDirectConflictResult.inputValue(), inlineConflictDraft, 'the conflict marker restores the submitted row draft after reload');
  assert.equal(await createActionPage.getByText(`服务器当前：${externallyUpdatedResult}`, { exact: true }).count(), 1, 'reload recovery keeps the current server value visible for comparison');

  await actionRowActions.getByRole('button', { name: '详情' }).click();
  const actionDrawer = createActionPage.locator('.xmt-overlay-center');
  await actionDrawer.getByRole('heading', { name: '行动项详情' }).waitFor();
  await createActionPage.waitForFunction((expected) => {
    const result = document.querySelector('.xmt-overlay-center textarea[placeholder="填写进展、结论或关闭说明"]') as HTMLTextAreaElement | null;
    return result?.value === expected;
  }, inlineConflictDraft);
  assert.equal(await actionDrawer.getByLabel('处理结果').inputValue(), inlineConflictDraft, 'opening the drawer retains the same conflict draft for review');
  assert.equal(await actionDrawer.getByText(`服务器当前：${externallyUpdatedResult}`, { exact: true }).count(), 1, 'the drawer shows the latest server value beside the preserved draft');
  const drawerConflictDraft = '抽屉里提交但应保留的本地内容。';
  const drawerConflictServerResult = '协作者更新了抽屉对应的服务端内容。';
  await actionDrawer.getByLabel('处理结果').fill(drawerConflictDraft);
  await createActionPage.evaluate(async (conflictResult) => {
    await fetch('/__qa/configure-action-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conflicts: 1, conflictResult }),
    });
  }, drawerConflictServerResult);
  const drawerConflictPatch = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 409);
  expectedActionUpdate409 += 1;
  const drawerConflictDetail = createActionPage.waitForResponse((response) => response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}` && response.request().method() === 'GET' && response.status() === 200);
  await actionDrawer.getByRole('button', { name: '保存' }).click();
  await Promise.all([drawerConflictPatch, drawerConflictDetail]);
  assert.equal(await actionDrawer.getByLabel('处理结果').inputValue(), drawerConflictDraft, 'a 409 detail refresh keeps the drawer draft intact');
  assert.equal(await actionDrawer.getByText(`本次保留：${drawerConflictDraft}`, { exact: true }).count(), 1, 'drawer conflict review labels its local draft');
  assert.equal(await actionDrawer.getByText(`服务器当前：${drawerConflictServerResult}`, { exact: true }).count(), 1, 'drawer conflict review shows the refreshed server value');
  assert.equal(actionUpdateAttempts, 6, 'the drawer conflict itself is not retried');
  const drawerConflictRequestId = actionUpdateRequestSnapshots.at(-1)?.requestId;
  const drawerResult = '负责人完成了后续确认。';
  await actionDrawer.getByLabel('处理结果').fill(drawerResult);
  assert.equal(actionUpdateAttempts, 6, 'editing after conflict does not submit until the user clicks save');
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
  assert.notEqual(actionUpdateRequestSnapshots.at(-1)?.requestId, drawerConflictRequestId, 'the explicit drawer save after conflict creates a fresh UUID');
  assert.equal(actionUpdateAttempts, 7, 'the explicit drawer save is the only follow-up PATCH after its conflict');
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
  assert.equal(actionUpdateAttempts, 10, 'each distinct row and drawer save sends one PATCH');

  const storageFailureResult = '恢复记录存储失败时不应发送 PATCH。';
  const patchesBeforeStorageFailure = actionUpdateAttempts;
  await actionResult.fill(storageFailureResult);
  await createActionPage.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    (window as Window & { __originalStorageSetItem?: typeof Storage.prototype.setItem }).__originalStorageSetItem = originalSetItem;
    Storage.prototype.setItem = new Function(
      'key',
      'value',
      "if (key.startsWith('xmt:retro-action-update:')) throw new DOMException('模拟会话存储不可用', 'QuotaExceededError'); return window.__originalStorageSetItem.call(this, key, value);",
    ) as typeof Storage.prototype.setItem;
  });
  await actionRowActions.getByRole('button', { name: '保存' }).click();
  await createActionPage.getByText('浏览器无法保存本次恢复记录，行动项未提交。', { exact: true }).waitFor();
  assert.equal(actionUpdateAttempts, patchesBeforeStorageFailure, 'sessionStorage failure sends no PATCH');
  assert.equal(actionUpdateRequestSnapshots.length, patchesBeforeStorageFailure, 'sessionStorage failure adds no PATCH request');
  assert.equal(await actionResult.inputValue(), storageFailureResult, 'storage failure preserves the user draft');
  await createActionPage.evaluate(() => {
    const originalSetItem = (window as Window & { __originalStorageSetItem?: typeof Storage.prototype.setItem }).__originalStorageSetItem;
    if (originalSetItem) Storage.prototype.setItem = originalSetItem;
  });
  const corruptedUpdateResult = '写入后核对发现内容变化，禁止发送更新。';
  const patchesBeforeCorruptedMarker = actionUpdateAttempts;
  await actionResult.fill(corruptedUpdateResult);
  await createActionPage.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    (window as Window & { __originalStorageSetItem?: typeof Storage.prototype.setItem }).__originalStorageSetItem = originalSetItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'xmt:retro-action-update:99:992') {
        const marker = JSON.parse(value) as { payload: { resultMd: string } };
        marker.payload.resultMd = '静默改写的处理结果';
        return originalSetItem.call(this, key, JSON.stringify(marker));
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await actionRowActions.getByRole('button', { name: '保存' }).click();
  await createActionPage.getByText('恢复记录写入后未能通过校验，行动项未提交。', { exact: true }).waitFor();
  assert.equal(actionUpdateAttempts, patchesBeforeCorruptedMarker, 'a silently altered action update marker sends no PATCH');
  assert.equal(await actionResult.inputValue(), corruptedUpdateResult, 'preflight rejection preserves the edited action result');
  assert.equal(await createActionPage.evaluate(() => sessionStorage.getItem('xmt:retro-action-update:99:992')), null, 'the altered action update marker is cleared');
  await createActionPage.evaluate(() => {
    const originalSetItem = (window as Window & { __originalStorageSetItem?: typeof Storage.prototype.setItem }).__originalStorageSetItem;
    if (originalSetItem) Storage.prototype.setItem = originalSetItem;
  });
  const confirmedAfterCorruptedMarker = createActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 200);
  await actionRowActions.getByRole('button', { name: '保存' }).click();
  await confirmedAfterCorruptedMarker;
  assert.equal(action.resultMd, corruptedUpdateResult, 'a later explicit save succeeds after storage is restored');
  assert.equal(actionUpdateAttempts, patchesBeforeCorruptedMarker + 1, 'only the later explicit action update sends a PATCH');
  assert.equal(expectedActionUpdate503, 0, 'the expected action update failure response is accounted for');
  assert.equal(expectedActionUpdate409, 0, 'the expected ACTION_CHANGED responses are accounted for');
  assert.deepEqual(mutations, [
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/actions`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/actions`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/actions`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
  ], 'only the expected action creation and update requests are sent');
  assert.equal(expectedCreateAction503, 0, 'all expected action create failure responses are accounted for');
  assert.deepEqual(errors, [], 'action creation failure and retry have no unexpected browser errors');
  await createActionPage.close();

  mutations.length = 0;
  const summaryUpdateRequestIds: string[] = [];
  for (const kind of Object.keys(retroMutationAttempts) as (keyof typeof retroMutationAttempts)[]) {
    retroMutationAttempts[kind] = 0;
    retroMutationConfig[kind] = { failures: 0, delayMs: 0, failureStatus: 503, commitThenFail: 0, statusFailures: 0, conflicts: 0, externalStatus: null };
  }
  summaryUpdateStatusAttempts = 0;
  summaryUpdateStatusFailures = 0;
  const workflowPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedWorkflow503 = 0;
  let expectedWorkflow429 = 0;
  let expectedWorkflow409 = 0;
  workflowPage.on('pageerror', (error) => errors.push(error.message));
  workflowPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedWorkflow503 > 0 && message.text().includes('503')) {
      expectedWorkflow503 -= 1;
      return;
    }
    if (expectedWorkflow429 > 0 && message.text().includes('429')) {
      expectedWorkflow429 -= 1;
      return;
    }
    if (expectedWorkflow409 > 0 && message.text().includes('409')) {
      expectedWorkflow409 -= 1;
      return;
    }
    errors.push(message.text());
  });
  workflowPage.on('request', (request) => {
    if (request.url().includes('/api/retrospectives') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      mutations.push(`${request.method()} ${request.url()}`);
    }
    if (request.url().endsWith(`/api/retrospectives/${retrospective.id}`) && request.method() === 'PUT') {
      summaryUpdateRequestIds.push(request.headers()['x-idempotency-key'] || '');
    }
  });
  await workflowPage.goto(`${base}/__qa?theme=light&workflow=draft`);
  await workflowPage.getByRole('heading', { name: retrospective.title }).waitFor();
  const configureWorkflowMutation = async (
    kind: keyof typeof retroMutationConfig,
    failures = 1,
    recovery: { commitThenFail?: number; statusFailures?: number; conflicts?: number; failureStatus?: number; externalStatus?: 'draft' | 'published' | 'archived' } = {},
  ) => {
    await workflowPage.evaluate(async ({ name, count, recoveryConfig }) => {
      await fetch(`/__qa/configure-retro-mutation/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ failures: count, delayMs: 180, ...recoveryConfig }),
      });
    }, { name: kind, count: failures, recoveryConfig: recovery });
  };

  const summaryInput = workflowPage.getByPlaceholder('记录本周期发生了什么、为什么发生、下一轮怎么调整...');
  const summaryValue = '保留复盘结论，等服务端确认后再更新版本。';
  await summaryInput.fill(summaryValue);
  await configureWorkflowMutation('summary');
  expectedWorkflow503 += 1;
  const failedSummarySave = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 503);
  const summarySaveButton = workflowPage.getByRole('button', { name: '保存结论' });
  const snapshotButton = workflowPage.getByRole('button', { name: /生成快照|刷新快照/ });
  const publishButton = workflowPage.getByRole('button', { name: '发布复盘' });
  const summarySaveAttempt = summarySaveButton.dblclick({ delay: 10 });
  await summarySaveAttempt;
  assert.equal(await summaryInput.isDisabled(), true, 'summary text is locked while its save is pending');
  assert.equal(await snapshotButton.isDisabled(), true, 'a pending summary save blocks a different snapshot write');
  assert.equal(await publishButton.isDisabled(), true, 'a pending summary save blocks a different publish write');
  await failedSummarySave;
  await workflowPage.getByText('尚未查到这次复盘结论更新记录', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.summary, 1, 'rapid duplicate summary saves send one PUT');
  assert.equal(await summaryInput.inputValue(), summaryValue, 'failed summary save retains edited text');
  assert.equal(await summaryInput.isDisabled(), true, 'summary text stays locked until the user explicitly retries the confirmed-uncommitted request');
  await configureWorkflowMutation('summary', 0);
  const successfulSummarySave = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 200);
  await workflowPage.getByRole('button', { name: '使用原请求编号重试', exact: true }).click();
  await successfulSummarySave;
  await workflowPage.getByText('复盘结论已保存', { exact: true }).waitFor();
  assert.equal(await summaryInput.inputValue(), summaryValue, 'confirmed summary save retains the server-confirmed text');
  assert.equal(retroMutationAttempts.summary, 2, 'the explicit retry sends the only second summary PUT');
  assert.equal(summaryUpdateRequestIds[0], summaryUpdateRequestIds[1], 'confirmed-uncommitted retry reuses the exact original idempotency key');
  assert.equal(retrospective.version, 2, 'same-key retry commits exactly one version');

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

  const committedSummary = '服务端已提交但响应丢失的复盘结论';
  await summaryInput.fill(committedSummary);
  await configureWorkflowMutation('summary', 0, { commitThenFail: 1, statusFailures: 1 });
  expectedWorkflow503 += 2;
  const lostSummaryResponse = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 503);
  const failedSummaryStatus = workflowPage.waitForResponse((response) => response.url().includes(`/api/retrospectives/${retrospective.id}/update-requests/`) && response.request().method() === 'GET' && response.status() === 503);
  await summarySaveButton.click();
  await Promise.all([lostSummaryResponse, failedSummaryStatus]);
  await workflowPage.getByText('复盘结论保存结果暂时无法核实', { exact: true }).waitFor();
  assert.equal(await summaryInput.isDisabled(), true, 'an unknown commit outcome keeps the editor locked');
  const summaryWritesBeforeRecoveryReload = retroMutationAttempts.summary;
  const summaryStatusReadsBeforeRecoveryReload = summaryUpdateStatusAttempts;
  const summaryStatusAfterReload = workflowPage.waitForResponse((response) => response.url().includes(`/api/retrospectives/${retrospective.id}/update-requests/`) && response.request().method() === 'GET' && response.status() === 200);
  await workflowPage.reload();
  await summaryStatusAfterReload;
  await workflowPage.getByText('复盘结论已确认保存', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.summary, summaryWritesBeforeRecoveryReload, 'refresh verifies a committed update without replaying its PUT');
  assert.ok(summaryUpdateStatusAttempts > summaryStatusReadsBeforeRecoveryReload, 'refresh performs a read-only request-status check');
  assert.equal(retrospective.version, 4, 'commit-then-lost-response adds only its one expected version');

  const conflictedSummary = '与服务端并发更新冲突的本地草稿';
  await summaryInput.fill(conflictedSummary);
  await configureWorkflowMutation('summary', 0, { conflicts: 1 });
  expectedWorkflow409 += 1;
  const summaryConflict = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 409);
  const summaryConflictRefresh = workflowPage.waitForResponse((response) => response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}` && response.request().method() === 'GET' && response.status() === 200);
  await summarySaveButton.click();
  await Promise.all([summaryConflict, summaryConflictRefresh]);
  await workflowPage.getByText('复盘已刷新，请核对后手动保存', { exact: true }).waitFor();
  assert.equal(await summaryInput.inputValue(), conflictedSummary, 'version conflict preserves the local submitted summary');
  await workflowPage.getByText('服务器先行更新的复盘结论', { exact: false }).waitFor();

  await workflowPage.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Object.defineProperty(window, '__qaOriginalStorageSetItem', { value: originalSetItem, configurable: true });
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'xmt:retro-summary-update:99:991') throw new DOMException('模拟存储空间暂不可用', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };
  });
  const editedAfterConflict = '冲突后继续编辑且需恢复的本地结论';
  await summaryInput.fill(editedAfterConflict);
  await workflowPage.getByText('本地恢复记录暂不可用', { exact: true }).waitFor();
  assert.equal(await summaryInput.inputValue(), editedAfterConflict, 'a failed local-marker write keeps the in-memory edit visible');
  assert.equal(await summaryInput.isDisabled(), true, 'writes stay locked until the newest recovery marker is persisted');
  await workflowPage.evaluate(() => {
    const original = (window as Window & { __qaOriginalStorageSetItem?: typeof Storage.prototype.setItem }).__qaOriginalStorageSetItem;
    if (original) Storage.prototype.setItem = original;
  });
  await workflowPage.getByRole('button', { name: '重试保存恢复记录', exact: true }).click();
  assert.equal(await summaryInput.isDisabled(), false, 'persisting the latest recovery marker safely re-enables conflict editing');
  assert.notEqual(summaryUpdateRequestIds[4], summaryUpdateRequestIds[5], 'a conflict re-edit does not reuse the old idempotency key');
  const correctedSummary = '核对并另存后的复盘结论';
  await summaryInput.fill(correctedSummary);
  const correctedSummarySave = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 200);
  await summarySaveButton.click();
  await correctedSummarySave;
  await workflowPage.getByText('复盘结论已保存', { exact: true }).waitFor();
  assert.equal(retrospective.summaryMd, correctedSummary, 'a conflict can be corrected in a new version after recovery storage succeeds');
  await summaryInput.fill(lateSummaryInput);

  await configureWorkflowMutation('snapshot');
  expectedWorkflow503 += 1;
  const snapshotUrl = `/api/retrospectives/${retrospective.id}/snapshot`;
  const failedSnapshot = workflowPage.waitForResponse((response) => response.url().endsWith(snapshotUrl) && response.request().method() === 'POST' && response.status() === 503);
  await snapshotButton.dblclick({ delay: 10 });
  assert.equal(await snapshotButton.isDisabled(), true, 'snapshot generation locks while pending');
  const snapshotLoadingStatus = workflowPage.getByRole('status').filter({ hasText: '正在生成指标快照…' });
  await snapshotLoadingStatus.waitFor();
  assert.equal(await snapshotButton.getAttribute('aria-busy'), 'true', 'snapshot generation exposes its busy state');
  const snapshotSpinner = snapshotButton.locator('svg');
  assert.equal(await snapshotSpinner.getAttribute('aria-hidden'), 'true', 'the snapshot spinner is decorative');
  assert.equal(await snapshotSpinner.evaluate((icon) => getComputedStyle(icon).animationName), 'none', 'the snapshot spinner respects reduced motion');
  assert.equal(await summarySaveButton.isDisabled(), true, 'a pending snapshot generation blocks a different summary write');
  assert.equal(await publishButton.isDisabled(), true, 'a pending snapshot generation blocks a different publish write');
  await failedSnapshot;
  assert.equal(await snapshotLoadingStatus.count(), 0, 'snapshot generation status clears after the response');
  assert.equal(await snapshotButton.getAttribute('aria-busy'), 'false', 'snapshot generation clears its busy state after the response');
  await workflowPage.getByText('快照结果已核实未更新', { exact: true }).waitFor();
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
  await snapshotButton.click();
  const replaceSnapshotDialog = workflowPage.getByRole('dialog', { name: '替换指标快照？' });
  await replaceSnapshotDialog.waitFor();
  await replaceSnapshotDialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(retroMutationAttempts.snapshot, 2, 'cancelling snapshot replacement sends no POST');
  await snapshotButton.click();
  const confirmedReplaceSnapshotDialog = workflowPage.getByRole('dialog', { name: '替换指标快照？' });
  await confirmedReplaceSnapshotDialog.getByRole('button', { name: '替换快照', exact: true }).click();
  await workflowPage.waitForResponse((response) => response.url().endsWith(snapshotUrl) && response.request().method() === 'POST' && response.status() === 200);
  assert.equal(retroMutationAttempts.snapshot, 3, 'replacing an existing snapshot requires explicit confirmation');

  await workflowPage.evaluate(async () => {
    await fetch('/__qa/fail-next-reads?scope=detail', { method: 'POST' });
  });
  await configureWorkflowMutation('snapshot', 0, { commitThenFail: 1 });
  expectedWorkflow503 += 2;
  const committedButUnacknowledgedSnapshot = workflowPage.waitForResponse((response) => response.url().endsWith(snapshotUrl) && response.request().method() === 'POST' && response.status() === 503);
  const failedSnapshotReadback = workflowPage.waitForResponse((response) => response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}` && response.request().method() === 'GET' && response.status() === 503);
  await snapshotButton.click();
  await Promise.all([committedButUnacknowledgedSnapshot, failedSnapshotReadback]);
  await workflowPage.getByRole('alert').filter({ hasText: '快照生成结果尚未确认' }).waitFor();
  assert.equal(retroMutationAttempts.snapshot, 4, 'a committed snapshot with a lost response is sent once before readback fails');
  assert.equal(await snapshotButton.isDisabled(), true, 'an unresolved snapshot result locks repeat generation');
  const unresolvedSnapshotMarker = await workflowPage.evaluate(() => {
    const raw = sessionStorage.getItem('xmt:retro-snapshot:99:991');
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  });
  assert.equal(unresolvedSnapshotMarker?.actorId, 99, 'the snapshot recovery marker is account scoped');
  assert.equal(unresolvedSnapshotMarker?.retroId, 991, 'the snapshot recovery marker is retrospective scoped');
  assert.equal(Array.isArray(unresolvedSnapshotMarker?.beforeSnapshotIds), true, 'the snapshot recovery marker retains the pre-request snapshot identity set');

  await workflowPage.reload({ waitUntil: 'domcontentloaded' });
  await workflowPage.getByText('指标快照已核实', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.snapshot, 4, 'refresh recovery verifies the committed snapshot with GET and never repeats POST');
  assert.equal(await workflowPage.evaluate(() => sessionStorage.getItem('xmt:retro-snapshot:99:991')), null, 'a successful read-only comparison clears the exact recovery marker');
  assert.equal(await snapshotButton.isDisabled(), false, 'verified snapshot state unlocks later user-directed replacement');

  const workflowActions = workflowPage.getByTestId('retro-action-table-panel');
  await workflowActions.getByLabel('行动项标题', { exact: true }).fill('保留结论时新增的行动项');
  const conclusionActionCreate = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/actions`) && response.request().method() === 'POST' && response.status() === 200);
  await workflowActions.getByRole('button', { name: '新增', exact: true }).click();
  await conclusionActionCreate;
  assert.equal(await summaryInput.inputValue(), lateSummaryInput, 'creating an action cannot replace an unsaved conclusion');
  const workflowActionRow = workflowPage.getByTestId(`retro-action-row-actions-${action.id}`).locator('xpath=..');
  await workflowActionRow.getByRole('textbox', { name: `行动项“${action.title}”的处理结果`, exact: true }).fill('结论保留期间确认的行动进展');
  const conclusionActionUpdate = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/actions/${action.id}`) && response.request().method() === 'PATCH' && response.status() === 200);
  await workflowActionRow.getByRole('button', { name: '保存', exact: true }).click();
  await conclusionActionUpdate;
  assert.equal(await summaryInput.inputValue(), lateSummaryInput, 'updating an action cannot replace an unsaved conclusion');

  await publishButton.click();
  await workflowPage.getByRole('alert').filter({ hasText: '请先点击“保存结论”，再发布复盘' }).waitFor();
  assert.equal(retroMutationAttempts.publish, 0, 'publishing an unsaved conclusion requires an explicit save and sends no publish POST');
  assert.equal(await summaryInput.inputValue(), lateSummaryInput, 'the publish prerequisite leaves the conclusion available to save');
  await workflowPage.screenshot({ path: '/tmp/xmt-retro-unsaved-conclusion-390.png', fullPage: true });
  await summaryInput.fill(correctedSummary);
  assert.equal(await workflowPage.getByRole('alert').filter({ hasText: '请先点击“保存结论”' }).count(), 0, 'undoing the local edits removes the obsolete unsaved-conclusion warning');
  await summaryInput.fill(lateSummaryInput);
  const finalSummarySave = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 200);
  await summarySaveButton.click();
  await finalSummarySave;
  await workflowPage.getByRole('alert').filter({ hasText: '请先点击“保存结论”' }).waitFor({ state: 'hidden' });
  assert.equal(retrospective.summaryMd, lateSummaryInput, 'the preserved conclusion is saved by the explicit save action');

  const corruptedSummaryDraft = '恢复标记被静默改写时不得提交结论。';
  const summaryWritesBeforeCorruptedMarker = retroMutationAttempts.summary;
  await summaryInput.fill(corruptedSummaryDraft);
  await workflowPage.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    (window as Window & { __qaOriginalStorageSetItem?: typeof Storage.prototype.setItem }).__qaOriginalStorageSetItem = originalSetItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'xmt:retro-summary-update:99:991') {
        const marker = JSON.parse(value) as { payload: { summaryMd: string } };
        marker.payload.summaryMd = '静默改写的复盘结论';
        return originalSetItem.call(this, key, JSON.stringify(marker));
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await summarySaveButton.click();
  await workflowPage.getByText('恢复记录写入后未能通过校验，本次复盘结论未提交。', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.summary, summaryWritesBeforeCorruptedMarker, 'a silently altered summary marker sends no PUT');
  assert.equal(await summaryInput.inputValue(), corruptedSummaryDraft, 'preflight rejection preserves the edited conclusion');
  assert.equal(await workflowPage.evaluate(() => sessionStorage.getItem('xmt:retro-summary-update:99:991')), null, 'the altered summary marker is removed after verification fails');
  await workflowPage.evaluate(() => {
    const original = (window as Window & { __qaOriginalStorageSetItem?: typeof Storage.prototype.setItem }).__qaOriginalStorageSetItem;
    if (original) Storage.prototype.setItem = original;
  });
  const confirmedAfterCorruptedSummaryMarker = workflowPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}`) && response.request().method() === 'PUT' && response.status() === 200);
  await summarySaveButton.click();
  await confirmedAfterCorruptedSummaryMarker;
  assert.equal(retrospective.summaryMd, corruptedSummaryDraft, 'a later explicit save succeeds once recovery storage is restored');

  await configureWorkflowMutation('publish', 1, { failureStatus: 429 });
  expectedWorkflow429 += 1;
  const publishUrl = `/api/retrospectives/${retrospective.id}/publish`;
  const failedPublish = workflowPage.waitForResponse((response) => response.url().endsWith(publishUrl) && response.request().method() === 'POST' && response.status() === 429);
  const publishReadback = workflowPage.waitForResponse((response) => response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}` && response.request().method() === 'GET' && response.status() === 200);
  await publishButton.click();
  const publishCancelDialog = workflowPage.getByRole('dialog', { name: '发布复盘？' });
  await publishCancelDialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(retroMutationAttempts.publish, 0, 'cancelling publish confirmation sends no POST');
  await publishButton.click();
  const publishConfirmDialog = workflowPage.getByRole('dialog', { name: '发布复盘？' });
  await publishConfirmDialog.getByRole('button', { name: '发布复盘', exact: true }).dblclick({ delay: 10 });
  assert.equal(await publishButton.isDisabled(), true, 'publishing locks the workflow while pending');
  assert.equal(await summaryInput.isDisabled(), true, 'a pending publish also locks the retrospective summary');
  await Promise.all([failedPublish, publishReadback]);
  await workflowPage.getByText('发布结果已确认未完成', { exact: true }).waitFor();
  assert.equal(expectedWorkflow429, 0, 'the expected 429 publish rejection is accounted for');
  assert.equal(retroMutationAttempts.publish, 1, 'rapid duplicate publish actions send one POST');
  assert.equal(await workflowPage.getByRole('button', { name: '发布复盘' }).count(), 1, 'failed publish leaves the retrospective in draft for retry');
  await configureWorkflowMutation('publish', 0);
  const successfulPublish = workflowPage.waitForResponse((response) => response.url().endsWith(publishUrl) && response.request().method() === 'POST' && response.status() === 200);
  await workflowPage.getByRole('button', { name: '重新确认发布', exact: true }).click();
  const publishRetryConfirm = workflowPage.getByRole('dialog', { name: '发布复盘？' });
  await publishRetryConfirm.waitFor();
  assert.equal(retroMutationAttempts.publish, 1, 'opening the explicit retry confirmation sends no second POST');
  await publishRetryConfirm.getByRole('button', { name: '取消', exact: true }).click();
  await workflowPage.getByRole('button', { name: '重新确认发布', exact: true }).click();
  await workflowPage.getByRole('dialog', { name: '发布复盘？' }).getByRole('button', { name: '发布复盘', exact: true }).click();
  await successfulPublish;
  await workflowPage.getByText('复盘已发布', { exact: true }).waitFor();
  assert.equal(await workflowPage.getByRole('button', { name: '归档复盘' }).count(), 1, 'confirmed publish unlocks the archive step');
  assert.equal(retroMutationAttempts.publish, 2, 'only the explicit publish retry sends a second POST');

  await configureWorkflowMutation('archive');
  expectedWorkflow503 += 1;
  const archiveUrl = `/api/retrospectives/${retrospective.id}/archive`;
  const failedArchive = workflowPage.waitForResponse((response) => response.url().endsWith(archiveUrl) && response.request().method() === 'POST' && response.status() === 503);
  const archiveReadback = workflowPage.waitForResponse((response) => response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}` && response.request().method() === 'GET' && response.status() === 200);
  const archiveButton = workflowPage.getByRole('button', { name: '归档复盘' });
  await archiveButton.click();
  const archiveConfirmDialog = workflowPage.getByRole('dialog', { name: '归档复盘？' });
  await archiveConfirmDialog.getByRole('button', { name: '归档复盘', exact: true }).dblclick({ delay: 10 });
  assert.equal(await archiveButton.isDisabled(), true, 'archive action locks while pending');
  await Promise.all([failedArchive, archiveReadback]);
  await workflowPage.getByText('归档结果已确认未完成', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.archive, 1, 'rapid duplicate archive actions send one POST');
  assert.equal(await workflowPage.getByRole('button', { name: '归档复盘' }).count(), 1, 'failed archive leaves the published retrospective available for retry');
  await configureWorkflowMutation('archive', 0);
  const successfulArchive = workflowPage.waitForResponse((response) => response.url().endsWith(archiveUrl) && response.request().method() === 'POST' && response.status() === 200);
  await workflowPage.getByRole('button', { name: '重新确认归档', exact: true }).click();
  await workflowPage.getByRole('dialog', { name: '归档复盘？' }).getByRole('button', { name: '归档复盘', exact: true }).click();
  await successfulArchive;
  await workflowPage.getByText('复盘已归档', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.archive, 2, 'only the explicit archive retry sends a second POST');
  assert.equal(expectedWorkflow503, 0, 'all expected workflow failure responses are accounted for');
  assert.deepEqual(mutations, [
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/snapshot`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/snapshot`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/snapshot`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/snapshot`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/actions`,
    `PATCH http://127.0.0.1:${address.port}/api/retrospectives/actions/${action.id}`,
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `PUT http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/publish`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/publish`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/archive`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/archive`,
  ], 'each retrospective write retries only after a confirmed 503 and an explicit user action');
  assert.deepEqual(errors, [], 'retrospective workflow failure and retry have no unexpected browser errors');
  await workflowPage.close();

  retroMutationAttempts.publish = 0;
  retroMutationAttempts.archive = 0;
  detailReadFailures = 0;
  const transitionRecoveryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedTransition503 = 0;
  const transitionWrites: string[] = [];
  transitionRecoveryPage.on('pageerror', (error) => errors.push(error.message));
  transitionRecoveryPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedTransition503 > 0 && message.text().includes('503')) {
      expectedTransition503 -= 1;
      return;
    }
    errors.push(message.text());
  });
  transitionRecoveryPage.on('request', (request) => {
    if (request.url().includes('/api/retrospectives') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      transitionWrites.push(`${request.method()} ${request.url()}`);
    }
  });
  await transitionRecoveryPage.goto(`${base}/__qa?theme=light&workflow=draft`);
  await transitionRecoveryPage.getByRole('heading', { name: retrospective.title }).waitFor();
  await transitionRecoveryPage.evaluate(async () => {
    await fetch('/__qa/configure-retro-mutation/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, delayMs: 180, commitThenFail: 1 }),
    });
  });
  await transitionRecoveryPage.evaluate(async () => {
    await fetch('/__qa/fail-next-reads?scope=detail', { method: 'POST' });
  });
  expectedTransition503 += 2;
  const committedPublishLostResponse = transitionRecoveryPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/publish`) && response.request().method() === 'POST' && response.status() === 503);
  const failedPublishReadback = transitionRecoveryPage.waitForResponse((response) => response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}` && response.request().method() === 'GET' && response.status() === 503);
  await transitionRecoveryPage.getByRole('button', { name: '发布复盘', exact: true }).click();
  await transitionRecoveryPage.getByRole('dialog', { name: '发布复盘？' }).getByRole('button', { name: '发布复盘', exact: true }).click();
  await Promise.all([committedPublishLostResponse, failedPublishReadback]);
  await transitionRecoveryPage.getByText('复盘操作结果暂未确认', { exact: true }).waitFor();
  assert.equal(await transitionRecoveryPage.getByRole('button', { name: '归档复盘', exact: true }).isDisabled(), true,
    'a committed publish with an unreadable status keeps transition actions locked');
  const pendingPublishMarker = await transitionRecoveryPage.evaluate(() => {
    const value = sessionStorage.getItem('xmt:retro-transition:v1:99:991');
    return value ? JSON.parse(value) as Record<string, unknown> : null;
  });
  assert.equal(pendingPublishMarker?.actorId, 99, 'the publish recovery marker is scoped to the current account');
  assert.equal(pendingPublishMarker?.retroId, 991, 'the publish recovery marker is scoped to the current retrospective');
  await transitionRecoveryPage.reload({ waitUntil: 'domcontentloaded' });
  await transitionRecoveryPage.getByRole('button', { name: '归档复盘', exact: true }).waitFor();
  await transitionRecoveryPage.getByText('复盘已发布', { exact: true }).waitFor();
  assert.equal(await transitionRecoveryPage.evaluate(() => sessionStorage.getItem('xmt:retro-transition:v1:99:991')), null,
    'refresh readback of the committed publish clears its exact recovery marker');
  assert.equal(retroMutationAttempts.publish, 1, 'commit followed by a lost publish response is confirmed by GET without a second POST');
  assert.equal(await transitionRecoveryPage.getByRole('button', { name: '归档复盘', exact: true }).count(), 1, 'confirmed publish uses the readback state and enables archive');

  await transitionRecoveryPage.evaluate(async () => {
    await fetch('/__qa/configure-retro-mutation/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 1, delayMs: 180 }),
    });
    await fetch('/__qa/fail-next-reads?scope=detail', { method: 'POST' });
  });
  expectedTransition503 += 2;
  const archiveLostResponse = transitionRecoveryPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/archive`) && response.request().method() === 'POST' && response.status() === 503);
  const failedArchiveReadback = transitionRecoveryPage.waitForResponse((response) => response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}` && response.request().method() === 'GET' && response.status() === 503);
  await transitionRecoveryPage.getByRole('button', { name: '归档复盘', exact: true }).click();
  await transitionRecoveryPage.getByRole('dialog', { name: '归档复盘？' }).getByRole('button', { name: '归档复盘', exact: true }).click();
  await Promise.all([archiveLostResponse, failedArchiveReadback]);
  await transitionRecoveryPage.getByText('复盘操作结果暂未确认', { exact: true }).waitFor();
  assert.equal(await transitionRecoveryPage.getByRole('button', { name: '归档复盘', exact: true }).isDisabled(), true, 'a failed readback locks archive to prevent an uncertain duplicate write');
  assert.equal(retroMutationAttempts.archive, 1, 'a failed readback does not replay the archive POST');
  const pendingArchiveMarker = await transitionRecoveryPage.evaluate(() => {
    const value = sessionStorage.getItem('xmt:retro-transition:v1:99:991');
    return value ? JSON.parse(value) as Record<string, unknown> : null;
  });
  assert.equal(pendingArchiveMarker?.operation, 'archive', 'the archive request remains identified after the readback fails');
  await transitionRecoveryPage.reload({ waitUntil: 'domcontentloaded' });
  await transitionRecoveryPage.getByText('归档结果已确认未完成', { exact: true }).waitFor();
  assert.equal(await transitionRecoveryPage.evaluate(() => sessionStorage.getItem('xmt:retro-transition:v1:99:991')), null,
    'refresh readback of the unchanged status clears the exact archive marker');
  assert.equal(retroMutationAttempts.archive, 1, 'manual readback is GET-only and does not resend archive');
  await transitionRecoveryPage.getByRole('button', { name: '重新确认归档', exact: true }).click();
  const explicitArchiveRetry = transitionRecoveryPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/archive`) && response.request().method() === 'POST' && response.status() === 200);
  await transitionRecoveryPage.getByRole('dialog', { name: '归档复盘？' }).getByRole('button', { name: '归档复盘', exact: true }).click();
  await explicitArchiveRetry;
  await transitionRecoveryPage.getByText('复盘已归档', { exact: true }).waitFor();
  assert.equal(retroMutationAttempts.archive, 2, 'archive can be retried only after GET confirmed the original state and the user confirmed again');
  assert.equal(expectedTransition503, 0, 'the expected lost-response and readback failures are accounted for');
  assert.deepEqual(transitionWrites, [
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/publish`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/archive`,
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/archive`,
  ], 'lost responses and readback retry do not cause duplicate writes');
  await transitionRecoveryPage.close();

  const changedStatusPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let expectedChangedStatus503 = 1;
  const changedStatusWrites: string[] = [];
  changedStatusPage.on('pageerror', (error) => errors.push(error.message));
  changedStatusPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedChangedStatus503 > 0 && message.text().includes('503')) {
      expectedChangedStatus503 -= 1;
      return;
    }
    errors.push(message.text());
  });
  changedStatusPage.on('request', (request) => {
    if (request.url().includes('/api/retrospectives') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      changedStatusWrites.push(`${request.method()} ${request.url()}`);
    }
  });
  await changedStatusPage.goto(`${base}/__qa?theme=light&workflow=draft`);
  await changedStatusPage.getByRole('heading', { name: retrospective.title }).waitFor();
  await changedStatusPage.evaluate(async () => {
    await fetch('/__qa/configure-retro-mutation/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 1, delayMs: 180, externalStatus: 'archived' }),
    });
  });
  const thirdPartyPublishFailure = changedStatusPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/publish`) && response.request().method() === 'POST' && response.status() === 503);
  const thirdPartyStatusReadback = changedStatusPage.waitForResponse((response) => response.url() === `http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}` && response.request().method() === 'GET' && response.status() === 200);
  await changedStatusPage.getByRole('button', { name: '发布复盘', exact: true }).click();
  await changedStatusPage.getByRole('dialog', { name: '发布复盘？' }).getByRole('button', { name: '发布复盘', exact: true }).click();
  await Promise.all([thirdPartyPublishFailure, thirdPartyStatusReadback]);
  await changedStatusPage.getByText('复盘状态已被其他操作改变', { exact: true }).waitFor();
  await changedStatusPage.getByText(/当前为已归档/).waitFor();
  assert.equal(await changedStatusPage.getByRole('button', { name: '发布复盘', exact: true }).count(), 0, 'a third-party archived state replaces the stale draft controls');
  assert.equal(retroMutationAttempts.publish, 2, 'third-party state recovery does not resend the failed publish request');
  assert.deepEqual(changedStatusWrites, [
    `POST http://127.0.0.1:${address.port}/api/retrospectives/${retrospective.id}/publish`,
  ], 'a third-party state readback is followed by no publish retry');
  assert.equal(expectedChangedStatus503, 0, 'the third-party mutation failure response is accounted for');
  assert.deepEqual(errors, [], 'transition outcome recovery has no unexpected browser errors');
  await changedStatusPage.close();

  const leavePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  leavePage.on('pageerror', (error) => errors.push(error.message));
  leavePage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await leavePage.goto(`${base}/__qa?theme=light&workflow=draft`);
  const leaveInput = leavePage.getByPlaceholder('记录本周期发生了什么、为什么发生、下一轮怎么调整...');
  await leaveInput.fill('返回前需要保留的复盘文字');
  await leavePage.getByRole('status').filter({ hasText: '复盘结论有未保存的修改' }).waitFor();
  const beforeLeaveWrites = retroMutationAttempts.summary;
  await leavePage.getByRole('button', { name: '返回列表', exact: true }).click();
  const firstLeaveWarning = leavePage.getByRole('dialog', { name: '存在未保存的复盘结论' });
  await firstLeaveWarning.waitFor();
  assert.equal(new URL(leavePage.url()).pathname, `/retrospectives/${retrospective.id}`, 'cancelling the leave warning keeps the current retrospective open');
  assert.equal(await leaveInput.inputValue(), '返回前需要保留的复盘文字');
  assert.ok(await firstLeaveWarning.getByText(/未保存.*复制保留/).count() > 0, 'the warning explains both editable and read-only recovery');
  await firstLeaveWarning.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.equal(await leavePage.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), true, 'refresh and close are protected while the conclusion is dirty');
  assert.equal(retroMutationAttempts.summary, beforeLeaveWrites, 'cancelling leave does not save or discard on the server');
  await leavePage.getByRole('button', { name: '保存结论', exact: true }).click();
  await leavePage.getByText('复盘结论已保存', { exact: true }).waitFor();
  assert.equal(await leavePage.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), false, 'confirmed saved content no longer raises the unload warning');
  await leaveInput.fill('明确放弃的本页修改');
  await leavePage.screenshot({ path: '/tmp/xmt-retro-unsaved-leave-390.png', fullPage: false });
  // Keep the destination isolated from the unrelated list screen/API contract.
  await leavePage.route('**/api/retrospectives', (route) => route.fulfill({ json: { success: true, data: { retrospectives: [] } } }));
  await leavePage.getByRole('button', { name: '返回列表', exact: true }).click();
  await leavePage.getByRole('dialog', { name: '存在未保存的复盘结论' }).getByRole('button', { name: '放弃修改并离开', exact: true }).click();
  await leavePage.waitForURL((url) => url.pathname === '/retrospectives');
  assert.equal(retroMutationAttempts.summary, beforeLeaveWrites + 1, 'explicit discard leaves without an extra server write');
  await leavePage.close();

  const conflictPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  conflictPage.on('pageerror', (error) => errors.push(error.message));
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
  const useSavedDialog = conflictPage.getByRole('dialog', { name: '使用已保存结论？' });
  await useSavedDialog.waitFor();
  await useSavedDialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await conflictPage.getByText(conflictSummary, { exact: true }).count(), 1, 'cancelling local replacement retains the unsaved conclusion');
  await conflictPage.screenshot({ path: '/tmp/xmt-retro-readonly-unsaved-conclusion-390.png', fullPage: true });
  await conflictPage.getByRole('button', { name: '使用已保存结论' }).click();
  await conflictPage.getByRole('dialog', { name: '使用已保存结论？' }).getByRole('button', { name: '使用已保存结论', exact: true }).click();
  await conflictPage.getByRole('button', { name: '使用已保存结论' }).waitFor({ state: 'hidden' });
  assert.equal(await conflictPage.getByText('原始复盘结论', { exact: true }).count(), 1, 'explicit local replacement displays the server-confirmed conclusion');
  assert.deepEqual(conflictWrites, [], 'local confirmation does not overwrite the published server conclusion');
  const conflictArchive = conflictPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/archive`) && response.status() === 200);
  await conflictPage.getByRole('button', { name: '归档复盘' }).click();
  await conflictPage.getByRole('dialog', { name: '归档复盘？' }).getByRole('button', { name: '归档复盘', exact: true }).click();
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
  const riskConversionSelect = riskConversionPanel.getByLabel('选择日报风险', { exact: true });
  const riskConversionLabel = riskConversionPanel.getByText('选择日报风险', { exact: true });
  await riskConversionLabel.waitFor();
  assert.equal(await riskConversionSelect.count(), 1, 'daily risk selector exposes a stable accessible name');
  assert.equal(await riskConversionLabel.isVisible(), true, 'daily risk selector has a visible label');
  await riskConversionSelect.selectOption(String(dailyRisk.itemId));
  const riskActionTitle = riskConversionPanel.getByLabel('行动项标题', { exact: true });
  const riskActionOwner = riskConversionPanel.getByLabel('负责人', { exact: true });
  const riskDueDate = riskConversionPanel.getByLabel('截止日期', { exact: true });
  for (const [label, field] of [
    ['行动项标题', riskActionTitle],
    ['负责人', riskActionOwner],
    ['截止日期', riskDueDate],
  ] as const) {
    const visibleLabel = field.locator('xpath=ancestor::label').locator('span').first();
    assert.equal(await field.count(), 1, `risk conversion field exposes the accessible name "${label}"`);
    assert.equal(await visibleLabel.innerText(), label, `risk conversion field label "${label}" is visible`);
    assert.equal(await visibleLabel.isVisible(), true, `risk conversion field label "${label}" is visible`);
  }
  await assertMinTouchHeight(riskConversionSelect, '390px daily risk selector');
  await assertMinTouchHeight(riskActionTitle, '390px risk action title');
  await assertMinTouchHeight(riskActionOwner, '390px risk action owner selector');
  await assertMinTouchHeight(riskDueDate, '390px risk action due date');
  const riskActionTitleValue = '跟进日报风险：重试时保留填写内容';
  await riskActionTitle.fill(riskActionTitleValue);
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
  await riskActionPage.getByText('尚未查到这次行动项创建记录', { exact: true }).waitFor();
  assert.equal(actionCreateAttempts, 1, 'rapid duplicate risk conversions send one POST');
  assert.equal(await riskConversionSelect.inputValue(), String(dailyRisk.itemId), 'failed risk conversion retains its source item');
  assert.equal(await riskActionTitle.inputValue(), riskActionTitleValue, 'failed risk conversion retains the edited title');
  assert.equal(await riskDueDate.inputValue(), '2026-10-10', 'failed risk conversion retains its due date');
  assert.equal(await riskActionTitle.isDisabled(), true, 'risk conversion stays locked until not-found is verified');

  await riskActionPage.evaluate(async () => {
    await fetch('/__qa/configure-action-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failures: 0, delayMs: 180 }),
    });
  });
  const successfulRiskActionCreate = riskActionPage.waitForResponse((response) => response.url().endsWith(`/api/retrospectives/${retrospective.id}/actions`) && response.request().method() === 'POST' && response.status() === 200);
  await riskActionPage.getByRole('button', { name: '使用原请求编号重试' }).click();
  await successfulRiskActionCreate;
  await riskActionPage.getByText(riskActionTitleValue, { exact: true }).waitFor();
  assert.equal(await riskConversionSelect.inputValue(), '', 'confirmed risk conversion clears the selected source');
  assert.equal(await riskConversionPanel.getByLabel('行动项标题', { exact: true }).count(), 0, 'confirmed risk conversion closes the form instead of leaving a duplicate-ready button');
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
