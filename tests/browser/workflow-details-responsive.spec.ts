import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';
import * as Y from 'yjs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 91, username: 'workflow-detail-qa', role: 'admin', name: '详情验收', enabled: true, force_change_password: false };

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

async function setViewportAtBrowserZoom(
  page: import('playwright').Page,
  physicalViewport: { width: number; height: number },
  zoom: number,
) {
  const effectiveViewport = {
    width: Math.round(physicalViewport.width / zoom),
    height: Math.round(physicalViewport.height / zoom),
  };
  await page.setViewportSize(effectiveViewport);
  const actualViewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  assert.deepEqual(actualViewport, effectiveViewport, `browser zoom ${zoom * 100}% uses the equivalent CSS layout viewport for ${physicalViewport.width}x${physicalViewport.height}`);
  return effectiveViewport;
}

async function verifyShootingScriptSaveRecovery(browser: import('playwright').Browser, base: string, errors: string[]) {
  const committedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  committedPage.setDefaultTimeout(10000);
  committedPage.on('pageerror', (error) => errors.push(error.message));
  await committedPage.goto(`${base}/__qa?page=shooting&scriptSave=commit-read-fail`);
  await committedPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  const committedDraft = committedPage.locator('.ProseMirror').first();
  await committedDraft.fill('已提交但响应丢失的成片剧本');
  await committedPage.getByRole('button', { name: '小版本保存', exact: true }).click();
  const pendingRecovery = committedPage.getByTestId('shooting-script-save-pending-verification');
  await pendingRecovery.waitFor();
  await pendingRecovery.getByText(/详情或版本历史读取失败/).waitFor();
  assert.equal(await committedPage.getByRole('button', { name: '小版本保存', exact: true }).isDisabled(), true, 'a shooting version write stays locked while its result is unknown');
  assert.equal(await committedPage.getByRole('button', { name: '大版本保存', exact: true }).isDisabled(), true, 'both shooting version actions stay locked while the result is unknown');
  assert.equal(await committedPage.getByRole('button', { name: '完成制作', exact: true }).isDisabled(), true, 'status changes stay locked while a shooting version result is unknown');
  assert.equal(await committedDraft.evaluate((element) => (element as HTMLElement).isContentEditable), false, 'the collaborative shooting editor is read-only while the version result is unknown');
  assert.ok(await committedPage.evaluate(() => sessionStorage.getItem('xmt:shooting-script-save-pending:v1:user:91:shooting:301')), 'the shooting version request has a durable session recovery marker');
  const committedState = await committedPage.request.get(`${base}/__qa/shooting-script-save-state`).then((response) => response.json());
  assert.equal(committedState.shootingVersions.filter((entry: { is_baseline: number }) => entry.is_baseline !== 1).length, 1, 'the ambiguous shooting server commit produced exactly one explicit version');
  await committedPage.reload();
  await committedPage.getByText('版本保存结果已核实', { exact: true }).waitFor();
  await committedPage.getByText('v1.0 · 小版本', { exact: true }).waitFor();
  const recoveredState = await committedPage.request.get(`${base}/__qa/shooting-script-save-state`).then((response) => response.json());
  assert.equal(recoveredState.shootingVersionActionWriteCount, committedState.shootingVersionActionWriteCount, 'refresh recovery verifies a committed shooting version without another PUT');
  assert.equal(recoveredState.shootingVersions.filter((entry: { is_baseline: number }) => entry.is_baseline !== 1).length, 1, 'refresh recovery does not create a duplicate shooting version');
  assert.equal(await committedPage.evaluate(() => sessionStorage.getItem('xmt:shooting-script-save-pending:v1:user:91:shooting:301')), null, 'confirmed shooting script recovery clears its session marker');
  await committedPage.close();

  const unchangedPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  unchangedPage.setDefaultTimeout(10000);
  unchangedPage.on('pageerror', (error) => errors.push(error.message));
  await unchangedPage.goto(`${base}/__qa?page=shooting&scriptSave=no-commit`);
  await unchangedPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  const unchangedDraft = unchangedPage.locator('.ProseMirror').first();
  await unchangedDraft.fill('尚未提交但要保留的成片剧本');
  let markerAtPut: string | null = null;
  await unchangedPage.route('**/api/workflow/shooting/301', async (route) => {
    if (route.request().method() === 'PUT') {
      markerAtPut = await unchangedPage.evaluate(() => sessionStorage.getItem('xmt:shooting-script-save-pending:v1:user:91:shooting:301'));
    }
    await route.continue();
  });
  await unchangedPage.getByRole('button', { name: '小版本保存', exact: true }).click();
  await unchangedPage.getByText('剧本版本尚未保存', { exact: true }).waitFor();
  assert.ok(markerAtPut, 'the recovery marker is persisted before the shooting version PUT begins');
  const unchangedState = await unchangedPage.request.get(`${base}/__qa/shooting-script-save-state`).then((response) => response.json());
  assert.equal(unchangedState.shootingVersions.filter((entry: { is_baseline: number }) => entry.is_baseline !== 1).length, 0, 'an uncommitted shooting script save does not create a version');
  assert.equal(await unchangedPage.getByRole('button', { name: '小版本保存', exact: true }).isDisabled(), false, 'confirmed unchanged shooting content allows only a deliberate user retry');
  assert.equal(await unchangedDraft.innerText(), '尚未提交但要保留的成片剧本', 'the exact shooting script draft is retained for review');
  await unchangedPage.getByRole('button', { name: '小版本保存', exact: true }).click();
  await unchangedPage.getByText('v1.0 · 小版本', { exact: true }).waitFor();
  const retriedState = await unchangedPage.request.get(`${base}/__qa/shooting-script-save-state`).then((response) => response.json());
  assert.equal(retriedState.shootingVersions.filter((entry: { is_baseline: number }) => entry.is_baseline !== 1).length, 1, 'only the explicit user retry creates the shooting version');
  assert.equal(retriedState.shootingVersionActionWriteCount, unchangedState.shootingVersionActionWriteCount + 1, 'the user-triggered retry sends exactly one additional version PUT');
  await unchangedPage.close();
  console.log('Shooting script save recovery assertions passed: ambiguous commit is verified on reload, writes stay locked during uncertainty, and unchanged content requires an explicit retry.');
}

const shooting = {
  id: 301,
  topic_id: 302,
  topic_title: '城市早餐探店拍摄计划',
  plan_date: '2026-10-08',
  location: '济南市历下区',
  equipment: '相机、麦克风、补光灯',
  status: 'in_progress',
  operator_name: user.name,
  script_content: null,
  script_source_production_id: null,
  script_source_version: null,
  created_at: '2026-10-07 10:00:00',
  updated_at: '2026-10-08 09:00:00',
  production: { id: 303, version: 'v2', content: '<p>拍摄用隔离稿件。</p>', content_markdown: '<p>拍摄用隔离稿件。</p>', status: 'approved', created_at: '2026-10-07 10:00:00', updated_at: '2026-10-08 08:30:00', version_timestamp: '2026-10-08 08:30:00', operator_name: user.name },
};
const publishing = {
  id: 501,
  topic_id: 302,
  topic_title: '城市早餐探店拍摄计划',
  topic_description: '记录本地早餐店的特色和制作过程。',
  topic_platform: '抖音',
  topic_deadline: '2026-10-10',
  topic_status: 'publishing',
  platform: '抖音',
  url: '',
  status: 'pending',
  publish_time: '',
  script_content: null,
  script_source_production_id: null,
  script_source_version: null,
  operator_name: user.name,
  created_at: '2026-10-07 10:00:00',
  updated_at: '2026-10-08 09:00:00',
  production: { id: 303, version: 'v2', content: '<p>发布用隔离稿件。</p>', content_markdown: '<p>发布用隔离稿件。</p>', status: 'approved', created_at: '2026-10-07 10:00:00', operator_name: user.name },
  shooting: { id: 301, plan_date: '2026-10-08', location: '济南市历下区', equipment: '相机、麦克风、补光灯', status: 'in_progress', operator_name: user.name, created_at: '2026-10-07 10:00:00' },
  topicHistory: [],
};
let rejectCollaborationUpdates = false;
let collaborationUpdateCount = 0;
let rejectedCollaborationUpdateCount = 0;
let rejectedScriptSaveCount = 0;
let failNextShootingRead = false;
let failNextShootingVersionsRead = false;
let failNextPublishingVersionsRead = false;
let shootingVersionReadCount = 0;
let publishingVersionReadCount = 0;
let shootingStatusWriteCount = 0;
let delayNextShootingStatusUpdate = false;
let shootingStatusUpdateStarted = false;
let shootingStatusUpdateGate: Promise<void> = Promise.resolve();
let releaseShootingStatusUpdate: (() => void) | null = null;
let historicalSourceEditable = false;
let delayNextProduction303Read = false;
let delayedProduction303Response: import('express').Response | null = null;
let production303HistoryPaginationEnabled = false;
let delayNextProduction303HistoryPage = false;
let delayedProduction303HistoryResponse: import('express').Response | null = null;
let materialDraftHtml = '';
let materialDraftRevision = 0;
let delayedMaterialDraftResponse: import('express').Response | null = null;
let delayMaterialDraft303 = false;
let delayNextMaterialSourceInsertion303 = false;
let delayedMaterialSourceInsertionResponse: import('express').Response | null = null;
const materialDraftWrites: Array<{ productionId: number; contentHtml: string }> = [];
let productionContentWriteCount = 0;
let publishedArchiveSyncPending = false;
let archiveSyncFailuresRemaining = 0;
let archiveSyncOnNextShootingSave = false;
let archiveSyncOnNextPublishingSave = false;
let delayNextArchiveSyncStage: 'shooting' | 'publishing' | null = null;
let archiveSyncRetryStarted = false;
let archiveSyncRetryGate: Promise<void> = Promise.resolve();
let releaseArchiveSyncRetry: (() => void) | null = null;
let shootingScriptWriteCount = 0;
let shootingVersionActionWriteCount = 0;
let publishingScriptWriteCount = 0;
let delayNextShootingScriptSave = false;
let shootingScriptSaveStarted = false;
let shootingScriptSaveGate: Promise<void> = Promise.resolve();
let releaseShootingScriptSave: (() => void) | null = null;
let delayNextPublishingScriptSave = false;
let publishingScriptSaveStarted = false;
let publishingScriptSaveGate: Promise<void> = Promise.resolve();
let releasePublishingScriptSave: (() => void) | null = null;
let failNextPublishingScriptSaveWithoutCommit = false;
let commitNextPublishingScriptSaveThenFail = false;
let failNextShootingScriptSaveWithoutCommit = false;
let commitNextShootingScriptSaveThenFail = false;
let failNextShootingScriptDetailRead = false;
let shootingScriptDetailReadCount = 0;
let failNextPublishingDetailRead = false;
let publishingDetailReadCount = 0;
let archiveSyncRetryCount = 0;
const shootingScriptVersions: Array<Record<string, unknown>> = [];
const publishingScriptVersions: Array<Record<string, unknown>> = [];
const shootingVersionRequests: Array<Record<string, unknown>> = [];
const publishingVersionRequests: Array<Record<string, unknown>> = [];

const app = express();
app.use(express.json({ limit: '2mb' }));
app.get('/__qa', (req, res) => {
  const page = req.query.page === 'publishing' ? 'publishing' : req.query.page === 'shooting-list' ? 'shooting-list' : req.query.page === 'achievements' ? 'achievements' : 'shooting';
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  const emptyDerivedScript = req.query.script === 'empty-derived';
  const historicalDerivedScript = req.query.script === 'historical-derived';
  const sourceSave = req.query.script === 'source-save';
  const archiveMode = String(req.query.archive || '');
  failNextShootingVersionsRead = req.query.versionRead === 'shooting';
  failNextPublishingVersionsRead = req.query.versionRead === 'publishing';
  failNextPublishingScriptSaveWithoutCommit = req.query.scriptSave === 'no-commit';
  commitNextPublishingScriptSaveThenFail = req.query.scriptSave === 'commit-read-fail';
  failNextShootingScriptSaveWithoutCommit = req.query.scriptSave === 'no-commit';
  commitNextShootingScriptSaveThenFail = req.query.scriptSave === 'commit-read-fail';
  failNextShootingScriptDetailRead = false;
  shootingScriptDetailReadCount = 0;
  failNextPublishingDetailRead = false;
  publishingDetailReadCount = 0;
  shootingVersionReadCount = 0;
  publishingVersionReadCount = 0;
  delayNextShootingStatusUpdate = false;
  shootingStatusUpdateStarted = false;
  shootingStatusUpdateGate = Promise.resolve();
  releaseShootingStatusUpdate = null;
  delayNextShootingScriptSave = false;
  shootingScriptSaveStarted = false;
  shootingScriptSaveGate = Promise.resolve();
  releaseShootingScriptSave = null;
  delayNextPublishingScriptSave = false;
  publishingScriptSaveStarted = false;
  publishingScriptSaveGate = Promise.resolve();
  releasePublishingScriptSave = null;
  delayNextArchiveSyncStage = null;
  archiveSyncRetryStarted = false;
  archiveSyncRetryGate = Promise.resolve();
  releaseArchiveSyncRetry = null;
  delayMaterialDraft303 = false;
  publishedArchiveSyncPending = archiveMode === 'pending';
  archiveSyncFailuresRemaining = archiveMode === 'pending' ? 1 : 0;
  archiveSyncOnNextShootingSave = archiveMode === 'after-shooting-save';
  archiveSyncOnNextPublishingSave = archiveMode === 'after-publishing-save';
  historicalSourceEditable = historicalDerivedScript;
  shooting.script_content = emptyDerivedScript || historicalDerivedScript ? '' : null;
  publishing.script_content = emptyDerivedScript || historicalDerivedScript ? '' : null;
  shooting.script_source_production_id = emptyDerivedScript || historicalDerivedScript ? 303 : null;
  shooting.script_source_version = emptyDerivedScript ? 'v2' : historicalDerivedScript ? 'v1.0' : null;
  shooting.script_source_production = emptyDerivedScript || historicalDerivedScript ? {
    id: 303,
    version: emptyDerivedScript ? 'v2' : 'v1.0',
    status: 'approved',
    created_at: emptyDerivedScript ? '2026-10-07 10:00:00' : '2026-09-30 10:00:00',
    version_timestamp: emptyDerivedScript ? '2026-10-08 08:30:00' : '2026-10-01 12:00:00',
    operator_name: user.name,
  } : null;
  publishing.script_source_production_id = emptyDerivedScript || historicalDerivedScript ? 303 : null;
  publishing.script_source_version = emptyDerivedScript ? 'v2' : historicalDerivedScript ? 'v1.0' : null;
  publishing.script_source_production = emptyDerivedScript || historicalDerivedScript ? {
    id: 303,
    version: emptyDerivedScript ? 'v2' : 'v1.0',
    status: 'approved',
    created_at: emptyDerivedScript ? '2026-10-07 10:00:00' : '2026-09-30 10:00:00',
    version_timestamp: emptyDerivedScript ? '2026-10-08 08:30:00' : '2026-10-01 12:00:00',
    operator_name: user.name,
  } : null;
  shootingScriptVersions.splice(0);
  publishingScriptVersions.splice(0);
  shootingVersionRequests.splice(0);
  publishingVersionRequests.splice(0);
  if (sourceSave) rejectCollaborationUpdates = false;
  const path = page === 'publishing' ? '/publishing/501' : page === 'shooting-list' ? '/shooting' : page === 'achievements' ? '/achievements' : '/shooting/301';
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','workflow-detail-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace(${JSON.stringify(path)});</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get('/api/users', (_req, res) => res.json({ data: [user], total: 1, page: 1, limit: 20 }));
app.get('/api/topics/302', (_req, res) => res.json({ data: {
  id: 302,
  title: '城市早餐探店拍摄计划',
  description: '选题说明隔离文本。',
  outline: '<p>当前选题大纲（不是来源历史）</p>',
  platform: '抖音',
  status: 'production',
  creator_id: user.id,
  creator_name: user.name,
  assignee_id: user.id,
  assignee_name: user.name,
  deadline: null,
  created_at: '2026-10-07 09:00:00',
  updated_at: '2026-10-08 09:00:00',
  history: [],
  stage_record_presence: { production: true, shooting: true, publishing: true },
} }));
app.get('/api/topics/302/versions', (_req, res) => res.json({ data: [
  { id: 3023, document_type: 'topic_outline', document_id: '302', version: 'v1.2', content: '<p>准确大纲版本正文 v1.2</p>', change_type: 'minor', is_baseline: 0, operator_id: user.id, operator_name: user.name, created_at: '2026-10-01 12:00:00' },
  { id: 3022, document_type: 'topic_outline', document_id: '302', version: 'v1.1', content: '<p>较早的大纲历史</p>', change_type: 'minor', is_baseline: 0, operator_id: user.id, operator_name: user.name, created_at: '2026-09-30 12:00:00' },
  { id: 3021, document_type: 'topic_outline', document_id: '302', version: 'baseline', content: '<p>未命名大纲基线</p>', change_type: 'baseline', is_baseline: 1, operator_id: null, operator_name: null, created_at: null },
] }));
app.get('/api/topics/302/resources', (_req, res) => res.json({ data: [] }));
app.get('/api/topics/302/asset-dimensions', (_req, res) => res.json({ data: [] }));
app.post('/__qa/reject-collaboration-updates', (_req, res) => {
  rejectCollaborationUpdates = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-shooting-read', (_req, res) => {
  failNextShootingRead = true;
  return res.json({ ok: true });
});
app.post('/__qa/delay-next-shooting-status-update', (_req, res) => {
  delayNextShootingStatusUpdate = true;
  shootingStatusUpdateStarted = false;
  shootingStatusUpdateGate = new Promise<void>((resolve) => { releaseShootingStatusUpdate = resolve; });
  return res.json({ delayed: true });
});
app.post('/__qa/release-shooting-status-update', (_req, res) => {
  releaseShootingStatusUpdate?.();
  releaseShootingStatusUpdate = null;
  return res.json({ released: true });
});
app.get('/__qa/shooting-status-write-count', (_req, res) => res.json({ count: shootingStatusWriteCount, started: shootingStatusUpdateStarted }));
app.get('/__qa/script-source-state', (_req, res) => res.json({
  shooting: { script_content: shooting.script_content, script_source_production_id: shooting.script_source_production_id, script_source_version: shooting.script_source_version },
}));
app.get('/__qa/collaboration-state', (_req, res) => res.json({ collaborationUpdateCount, rejectedCollaborationUpdateCount, rejectedScriptSaveCount }));
app.get('/__qa/workflow-version-state', (_req, res) => res.json({ shooting: shootingVersionRequests, publishing: publishingVersionRequests, shootingReadCount: shootingVersionReadCount, publishingReadCount: publishingVersionReadCount, shootingSaveStarted: shootingScriptSaveStarted, publishingSaveStarted: publishingScriptSaveStarted }));
app.get('/__qa/publishing-script-save-state', (_req, res) => res.json({ publishingDetailReadCount, publishingScriptWriteCount, publishingVersions: publishingScriptVersions }));
app.get('/__qa/shooting-script-save-state', (_req, res) => res.json({ shootingScriptDetailReadCount, shootingScriptWriteCount, shootingVersionActionWriteCount, shootingVersions: shootingScriptVersions }));
app.post('/__qa/delay-next-shooting-script-save', (_req, res) => {
  delayNextShootingScriptSave = true;
  shootingScriptSaveStarted = false;
  shootingScriptSaveGate = new Promise<void>((resolve) => { releaseShootingScriptSave = resolve; });
  return res.json({ delayed: true });
});
app.post('/__qa/release-shooting-script-save', (_req, res) => {
  releaseShootingScriptSave?.();
  releaseShootingScriptSave = null;
  return res.json({ released: true });
});
app.post('/__qa/delay-next-publishing-script-save', (_req, res) => {
  delayNextPublishingScriptSave = true;
  publishingScriptSaveStarted = false;
  publishingScriptSaveGate = new Promise<void>((resolve) => { releasePublishingScriptSave = resolve; });
  return res.json({ delayed: true });
});
app.post('/__qa/release-publishing-script-save', (_req, res) => {
  releasePublishingScriptSave?.();
  releasePublishingScriptSave = null;
  return res.json({ released: true });
});
app.post('/__qa/delay-next-archive-sync-retry/:stage', (req, res) => {
  if (req.params.stage !== 'shooting' && req.params.stage !== 'publishing') return res.status(400).json({ message: '无效的隔离阶段' });
  delayNextArchiveSyncStage = req.params.stage;
  archiveSyncRetryStarted = false;
  archiveSyncRetryGate = new Promise<void>((resolve) => { releaseArchiveSyncRetry = resolve; });
  return res.json({ delayed: true });
});
app.post('/__qa/release-archive-sync-retry', (_req, res) => {
  releaseArchiveSyncRetry?.();
  releaseArchiveSyncRetry = null;
  return res.json({ released: true });
});
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/achievements', (_req, res) => res.json({ data: [] }));
app.get('/api/achievements/me', (_req, res) => res.json({ data: [] }));
app.get('/api/achievements/progress', (_req, res) => res.json({ data: {} }));
app.get('/api/achievements/stats', (_req, res) => res.json({ data: { total: 1, earned: 1, totalPoints: 120, byCategory: [], byRarity: [] } }));
app.get('/api/achievements/leaderboard', (_req, res) => res.json({ data: [{ user_id: 1, user_name: '成就用户', avatar: null, achievement_count: 2, total_points: 120 }] }));
app.get('/api/achievements/recent', (_req, res) => res.json({ data: [{ id: 1, user_id: 1, user_name: '成就用户', achievement_name: '持续创作', icon: '🏆', points: 10, rarity: 'common', earned_at: '2026-10-08' }] }));
app.get('/api/workflow/shooting/301', (_req, res) => {
  shootingScriptDetailReadCount += 1;
  if (failNextShootingScriptDetailRead) {
    failNextShootingScriptDetailRead = false;
    return res.status(503).json({ message: '模拟成片剧本保存后的详情核实失败' });
  }
  if (failNextShootingRead) {
    failNextShootingRead = false;
    return res.status(503).json({ message: '模拟状态更新后的详情刷新失败' });
  }
  return res.json({ ...shooting, published_archive_script_sync_pending: publishedArchiveSyncPending, can_sync_published_archive: true });
});
app.get('/api/workflow/shooting/301/versions', (_req, res) => {
  shootingVersionReadCount += 1;
  if (failNextShootingVersionsRead) {
    failNextShootingVersionsRead = false;
    return res.status(503).json({ message: '模拟成片剧本历史读取失败' });
  }
  return res.json({ data: [...shootingScriptVersions].reverse() });
});
app.get('/api/workflow/shooting', (_req, res) => res.json({ data: [shooting], total: 1, page: 1, limit: 20 }));
app.put('/api/workflow/shooting/301', async (req, res) => {
  if (rejectCollaborationUpdates && Object.hasOwn(req.body, 'script_content')) {
    rejectedScriptSaveCount += 1;
    return res.status(503).json({ message: '隔离测试模拟保存失败' });
  }
  if (Object.hasOwn(req.body, 'status')) {
    shootingStatusWriteCount += 1;
    if (delayNextShootingStatusUpdate) {
      delayNextShootingStatusUpdate = false;
      shootingStatusUpdateStarted = true;
      const currentGate = shootingStatusUpdateGate;
      await currentGate;
    }
  }
  if (Object.hasOwn(req.body, 'script_content')) {
    shootingScriptWriteCount += 1;
    if (req.body.version_action === 'minor' || req.body.version_action === 'major') {
      shootingVersionActionWriteCount += 1;
      if (failNextShootingScriptSaveWithoutCommit) {
        failNextShootingScriptSaveWithoutCommit = false;
        return res.status(503).json({ message: '模拟成片剧本版本未提交但响应异常' });
      }
    }
    if (delayNextShootingScriptSave) {
      delayNextShootingScriptSave = false;
      shootingScriptSaveStarted = true;
      const currentGate = shootingScriptSaveGate;
      await currentGate;
    }
    if (req.body.version_action === 'minor' || req.body.version_action === 'major') {
      shootingVersionRequests.push({ ...req.body });
      const current = String(shooting.script_content ?? req.body.expected_content ?? '');
      if (shootingScriptVersions.length === 0) shootingScriptVersions.push({
        id: 1, document_type: 'shooting_script', document_id: '301', version: 'baseline', content: current,
        change_type: 'baseline', is_baseline: 1, operator_id: null, operator_name: null, created_at: null,
      });
      const previous = [...shootingScriptVersions].reverse().find((entry) => entry.is_baseline === 0);
      const match = String(previous?.version ?? '').match(/^v(\d+)\.(\d+)$/);
      const version = !match ? 'v1.0' : req.body.version_action === 'major' ? `v${Number(match[1]) + 1}.0` : `v${match[1]}.${Number(match[2]) + 1}`;
      shootingScriptVersions.push({ id: shootingScriptVersions.length + 1, document_type: 'shooting_script', document_id: '301', version, content: req.body.script_content, change_type: req.body.version_action, is_baseline: 0, operator_id: user.id, operator_name: user.name, source_production_id: req.body.script_source_production_id ?? null, source_production_version: req.body.script_source_version ?? null, created_at: '2026-10-13 09:00:00' });
    }
    if (archiveSyncOnNextShootingSave) {
      archiveSyncOnNextShootingSave = false;
      publishedArchiveSyncPending = true;
    }
  }
  Object.assign(shooting, req.body);
  if ((req.body.version_action === 'minor' || req.body.version_action === 'major') && commitNextShootingScriptSaveThenFail) {
    commitNextShootingScriptSaveThenFail = false;
    failNextShootingScriptDetailRead = true;
    return res.status(503).json({ message: '模拟成片剧本和版本已提交但响应异常' });
  }
  return res.json({ message: '更新成功', archiveSync: publishedArchiveSyncPending ? 'pending' : 'synced' });
});
app.post('/api/workflow/shooting/301/archive-sync', async (_req, res) => {
  archiveSyncRetryCount += 1;
  if (delayNextArchiveSyncStage === 'shooting') {
    delayNextArchiveSyncStage = null;
    archiveSyncRetryStarted = true;
    await archiveSyncRetryGate;
  }
  if (archiveSyncFailuresRemaining > 0) {
    archiveSyncFailuresRemaining -= 1;
    return res.status(503).json({ message: '隔离测试模拟归档写入失败', archiveSync: 'pending' });
  }
  publishedArchiveSyncPending = false;
  return res.json({ message: '发布归档已同步', archiveSync: 'synced' });
});
app.get('/api/workflow/publishing/501', (_req, res) => {
  publishingDetailReadCount += 1;
  if (failNextPublishingDetailRead) {
    failNextPublishingDetailRead = false;
    return res.status(503).json({ message: '模拟发布剧本保存后的详情核实失败' });
  }
  return res.json({ ...publishing, published_archive_script_sync_pending: publishedArchiveSyncPending, can_sync_published_archive: true });
});
app.get('/api/workflow/publishing/501/versions', (_req, res) => {
  publishingVersionReadCount += 1;
  if (failNextPublishingVersionsRead) {
    failNextPublishingVersionsRead = false;
    return res.status(503).json({ message: '模拟发布剧本历史读取失败' });
  }
  return res.json({ data: [...publishingScriptVersions].reverse() });
});
app.put('/api/workflow/publishing/501', async (req, res) => {
  if (Object.hasOwn(req.body, 'script_content')) {
    publishingScriptWriteCount += 1;
    if (failNextPublishingScriptSaveWithoutCommit) {
      failNextPublishingScriptSaveWithoutCommit = false;
      return res.status(503).json({ message: '模拟发布剧本未提交但响应异常' });
    }
    if (delayNextPublishingScriptSave) {
      delayNextPublishingScriptSave = false;
      publishingScriptSaveStarted = true;
      const currentGate = publishingScriptSaveGate;
      await currentGate;
    }
    if (req.body.version_action === 'minor' || req.body.version_action === 'major') {
      publishingVersionRequests.push({ ...req.body });
      const current = String(publishing.script_content ?? req.body.expected_content ?? '');
      if (publishingScriptVersions.length === 0) publishingScriptVersions.push({
        id: 1, document_type: 'publishing_script', document_id: '501', version: 'baseline', content: current,
        change_type: 'baseline', is_baseline: 1, operator_id: null, operator_name: null, created_at: null,
      });
      const previous = [...publishingScriptVersions].reverse().find((entry) => entry.is_baseline === 0);
      const match = String(previous?.version ?? '').match(/^v(\d+)\.(\d+)$/);
      const version = !match ? 'v1.0' : req.body.version_action === 'major' ? `v${Number(match[1]) + 1}.0` : `v${match[1]}.${Number(match[2]) + 1}`;
      publishingScriptVersions.push({ id: publishingScriptVersions.length + 1, document_type: 'publishing_script', document_id: '501', version, content: req.body.script_content, change_type: req.body.version_action, is_baseline: 0, operator_id: user.id, operator_name: user.name, source_production_id: req.body.script_source_production_id ?? null, source_production_version: req.body.script_source_version ?? null, created_at: '2026-10-13 09:00:00' });
    }
    if (archiveSyncOnNextPublishingSave) {
      archiveSyncOnNextPublishingSave = false;
      publishedArchiveSyncPending = true;
    }
  }
  Object.assign(publishing, req.body);
  if (Object.hasOwn(req.body, 'script_content') && commitNextPublishingScriptSaveThenFail) {
    commitNextPublishingScriptSaveThenFail = false;
    failNextPublishingDetailRead = true;
    return res.status(503).json({ message: '模拟发布剧本和版本已提交但响应异常' });
  }
  return res.json({ message: '更新成功', archiveSync: publishedArchiveSyncPending ? 'pending' : 'synced' });
});
app.post('/api/workflow/publishing/501/archive-sync', async (_req, res) => {
  archiveSyncRetryCount += 1;
  if (delayNextArchiveSyncStage === 'publishing') {
    delayNextArchiveSyncStage = null;
    archiveSyncRetryStarted = true;
    await archiveSyncRetryGate;
  }
  if (archiveSyncFailuresRemaining > 0) {
    archiveSyncFailuresRemaining -= 1;
    return res.status(503).json({ message: '隔离测试模拟归档写入失败', archiveSync: 'pending' });
  }
  publishedArchiveSyncPending = false;
  return res.json({ message: '发布归档已同步', archiveSync: 'synced' });
});
app.get('/__qa/archive-write-state', (_req, res) => res.json({ shootingScriptWriteCount, publishingScriptWriteCount, archiveSyncRetryCount, archiveSyncRetryStarted }));
app.get('/__qa/material-draft-state', (_req, res) => res.json({
  pendingOldRead: Boolean(delayedMaterialDraftResponse),
  pendingOldSourceInsertion: Boolean(delayedMaterialSourceInsertionResponse),
  pendingOldProductionRead: Boolean(delayedProduction303Response),
  pendingOldHistoryRead: Boolean(delayedProduction303HistoryResponse),
  writes: materialDraftWrites,
}));
app.post('/__qa/release-old-material-draft', (_req, res) => {
  delayedMaterialDraftResponse?.json({ data: { production_id: 303, content_html: materialDraftHtml, revision: materialDraftRevision, created_at: null, updated_at: null } });
  delayedMaterialDraftResponse = null;
  delayMaterialDraft303 = false;
  return res.json({ released: true });
});
app.post('/__qa/delay-next-material-draft-303', (_req, res) => {
  materialDraftHtml = '<p>第一条资料草稿的旧延迟响应</p>';
  materialDraftRevision = 11;
  delayMaterialDraft303 = true;
  return res.json({ delayed: true });
});
const productionFixture = (productionId: number) => {
  const otherProduction = productionId === 304;
  return {
    id: productionId,
    topic_id: otherProduction ? 305 : 302,
    topic_title: otherProduction ? '第二条隔离生产记录' : '城市早餐探店拍摄计划',
    topic_status: 'publishing',
    version: 'v2',
    content: otherProduction ? '<p>第二条正式稿</p>' : '<p>当前创作稿测试内容</p>',
    content_markdown: otherProduction ? '<p>第二条正式稿</p>' : '<p>当前创作稿测试内容</p>',
    content_json: null,
    status: otherProduction || historicalSourceEditable ? 'draft' : 'approved',
    operator_id: user.id,
    operator_name: user.name,
    created_at: '2026-10-07 10:00:00',
    updated_at: '2026-10-08 09:00:00',
    can_edit: historicalSourceEditable,
    origin_source_type: 'topic_outline',
    origin_source_content_snapshot: '<p>创建时的大纲来源快照测试</p>',
    origin_source_outline_version: otherProduction ? null : 'v1.2',
    origin_captured_at: '2026-10-07 09:00:00',
  };
};
app.post('/__qa/delay-next-production-303-read', (_req, res) => {
  delayNextProduction303Read = true;
  return res.json({ delayed: true });
});
app.post('/__qa/release-production-303-read', (_req, res) => {
  delayedProduction303Response?.json(productionFixture(303));
  delayedProduction303Response = null;
  return res.json({ released: true });
});
app.post('/__qa/enable-production-303-history-pagination', (_req, res) => {
  production303HistoryPaginationEnabled = true;
  return res.json({ enabled: true });
});
app.post('/__qa/delay-next-production-303-history-page', (_req, res) => {
  delayNextProduction303HistoryPage = true;
  return res.json({ delayed: true });
});
app.post('/__qa/release-production-303-history-page', (_req, res) => {
  delayedProduction303HistoryResponse?.json({ data: [{
    id: 3032,
    production_id: 303,
    version: 'v2.1',
    content: '<p>旧记录分页结果</p>',
    content_markdown: '<p>旧记录分页结果</p>',
    status: 'draft',
    change_type: 'minor',
    operator_id: user.id,
    operator_name: '旧记录分页操作者',
    created_at: '2026-10-07 09:00:00',
    version_state: 'historical',
  }], total: 1, page: 2, limit: 20 });
  delayedProduction303HistoryResponse = null;
  return res.json({ released: true });
});
app.post('/__qa/delay-next-material-source-insertion', (_req, res) => {
  delayNextMaterialSourceInsertion303 = true;
  return res.json({ delayed: true });
});
app.post('/__qa/release-material-source-insertion', (_req, res) => {
  delayedMaterialSourceInsertionResponse?.json({
    data: [{ resource_id: 9301, title: '隔离引用资料', content_html: '<p>只供自动化验证的资料正文。</p>' }],
    empty_resource_ids: [],
  });
  delayedMaterialSourceInsertionResponse = null;
  return res.json({ released: true });
});
app.get('/api/workflow/production/:id', (req, res) => {
  const productionId = Number(req.params.id);
  if (productionId === 303 && delayNextProduction303Read) {
    delayNextProduction303Read = false;
    delayedProduction303Response = res;
    return;
  }
  return res.json(productionFixture(productionId));
});
app.put('/api/workflow/production/:id', (_req, res) => {
  productionContentWriteCount += 1;
  return res.json({ message: '隔离正式稿保存成功' });
});
app.get('/api/topics/:id', (req, res) => {
  const topicId = Number(req.params.id);
  const otherProduction = topicId === 305;
  return res.json({ data: {
  id: topicId,
  title: otherProduction ? '第二条隔离生产记录' : '城市早餐探店拍摄计划',
  description: '记录本地早餐店的特色和制作过程。',
  platform: 'douyin',
  status: 'publishing',
  creator_id: user.id,
  assignee_id: user.id,
} });
});
app.get('/api/workflow/production/:id/history', (req, res) => {
  if (Number(req.params.id) === 303 && req.query.page === '2' && delayNextProduction303HistoryPage) {
    delayNextProduction303HistoryPage = false;
    delayedProduction303HistoryResponse = res;
    return;
  }
  const requestedHistoryVersion = String(req.query.version || '');
  if (['v1.0', 'v0.9', 'v0.8'].includes(requestedHistoryVersion)) {
    const isLegacyUnrecorded = requestedHistoryVersion === 'v0.9';
    const isRecordedEmpty = requestedHistoryVersion === 'v0.8';
    return res.json({ data: [{
      id: 3001,
      production_id: 303,
      version: requestedHistoryVersion,
      content: requestedHistoryVersion === 'v1.0' ? '<p>历史来源正文测试</p>' : `<p>${isLegacyUnrecorded ? '未记录快照的历史正文' : '空快照历史正文'}</p>`,
      content_markdown: requestedHistoryVersion === 'v1.0' ? '<p>历史来源正文测试</p>' : `<p>${isLegacyUnrecorded ? '未记录快照的历史正文' : '空快照历史正文'}</p>`,
      status: 'approved',
      change_type: 'major',
      operator_id: user.id,
      operator_name: user.name,
      created_at: '2026-10-01 09:00:00',
      version_state: 'historical',
      material_draft_snapshot_html: isLegacyUnrecorded ? null : isRecordedEmpty ? '' : '<p>v1.0资料快照测试</p>',
    }], total: 1, page: 1, limit: 1 });
  }
  if (Number(req.params.id) === 303 && production303HistoryPaginationEnabled) {
    return res.json({ data: [], total: 21, page: Number(req.query.page || 1), limit: 20 });
  }
  return res.json({ data: [], total: 0, page: Number(req.query.page || 1), limit: 20 });
});
app.get('/api/productions/:id/material-draft', (req, res) => {
  const productionId = Number(req.params.id);
  if (productionId === 303 && delayMaterialDraft303) {
    delayMaterialDraft303 = false;
    delayedMaterialDraftResponse = res;
    return;
  }
  return res.json({ data: {
    production_id: productionId,
    content_html: productionId === 304 ? '<p>第二条资料草稿</p>' : materialDraftHtml,
    revision: productionId === 304 ? 7 : materialDraftRevision,
    created_at: null,
    updated_at: null,
  } });
});
app.put('/api/productions/:id/material-draft', (req, res) => {
  const productionId = Number(req.params.id);
  const contentHtml = String(req.body.content_html ?? '');
  materialDraftWrites.push({ productionId, contentHtml });
  if (productionId === 303) {
    materialDraftHtml = contentHtml;
    materialDraftRevision += 1;
  }
  return res.json({ data: {
    production_id: productionId,
    content_html: contentHtml,
    revision: productionId === 304 ? 8 : materialDraftRevision,
    created_at: '2026-10-08 09:00:00',
    updated_at: '2026-10-08 09:01:00',
  } });
});
app.get('/api/resource-center/search', (_req, res) => res.json({ data: [{
  resource_id: 9301,
  title: '隔离引用资料',
  summary: '只供自动化验证的资料。',
  snippet: '只供自动化验证的资料正文。',
  library_type: 'knowledge',
  category: null,
}], total: 1 }));
app.post('/api/productions/:id/material-draft/resources', (req, res) => {
  if (Number(req.params.id) === 303 && delayNextMaterialSourceInsertion303) {
    delayNextMaterialSourceInsertion303 = false;
    delayedMaterialSourceInsertionResponse = res;
    return;
  }
  return res.json({
    data: [{ resource_id: 9301, title: '隔离引用资料', content_html: '<p>只供自动化验证的资料正文。</p>' }],
    empty_resource_ids: [],
  });
});
app.use('/api', (_req, res) => res.json({
  data: [],
  total: 0,
  page: 1,
  limit: 20,
  summary: { today: 0, pending: 0, published: 0, failed: 0 },
}));

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
    if (rejectCollaborationUpdates) {
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

if (process.env.XMT_WORKFLOW_DETAIL_QA_SERVE === '1') {
  console.log(`Isolated workflow detail QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const errors: string[] = [];
  await verifyShootingScriptSaveRecovery(browser, base, errors);
  const expectedVersionHistoryFailures: string[] = [];
  let expectedVersionHistoryConsoleErrors = 0;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(5000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text() === 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'
      && expectedVersionHistoryConsoleErrors < expectedVersionHistoryFailures.length) {
      expectedVersionHistoryConsoleErrors += 1;
      return;
    }
    errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() === 503 && (response.url().endsWith('/api/workflow/shooting/301/versions')
      || response.url().endsWith('/api/workflow/publishing/501/versions'))) expectedVersionHistoryFailures.push(response.url());
  });

  const assertButtonFits = async (button: import('playwright').Locator, label: string, physicalViewport: { width: number; height: number }, zoom: number) => {
    const expectedViewport = {
      width: Math.round(physicalViewport.width / zoom),
      height: Math.round(physicalViewport.height / zoom),
    };
    await button.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const geometry = await button.evaluate((element) => {
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
      return {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        display: getComputedStyle(element).display,
        visibility: getComputedStyle(element).visibility,
        clippedBy,
      };
    });
    assert.deepEqual({ width: geometry.viewportWidth, height: geometry.viewportHeight }, expectedViewport, `${label} checks the actual CSS viewport at physical ${physicalViewport.width}x${physicalViewport.height} / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.width > 0 && geometry.height > 0, `${label} has a layout box at ${physicalViewport.width}x${physicalViewport.height} / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
    assert.notEqual(geometry.display, 'none', `${label} is not hidden at ${physicalViewport.width}x${physicalViewport.height} / ${zoom * 100}%`);
    assert.notEqual(geometry.visibility, 'hidden', `${label} is not invisible at ${physicalViewport.width}x${physicalViewport.height} / ${zoom * 100}%`);
    assert.deepEqual(geometry.clippedBy, [], `${label} is not clipped at ${physicalViewport.width}x${physicalViewport.height} / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.x >= -1 && geometry.right <= geometry.viewportWidth + 1 && geometry.y >= -1 && geometry.bottom <= geometry.viewportHeight + 1, `${label} stays inside the viewport at ${physicalViewport.width}x${physicalViewport.height} / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
  };

  const assertMinimumTapTarget = async (button: import('playwright').Locator, label: string) => {
    const size = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    assert.ok(size.width >= 40 && size.height >= 40, `${label} is at least 40x40px: ${JSON.stringify(size)}`);
  };

  const assertPublishingDetailCopyContrast = async (theme: 'light' | 'dark') => {
    const fieldLabels = page.locator('.xmt-card .space-y-3 > div.flex > span.text-xs');
    assert.equal(await fieldLabels.count(), 14, `${theme} publishing detail exposes all expected information labels`);
    const workflowProgress = page.locator('.xmt-card').filter({
      has: page.getByRole('heading', { name: '选题流转进度', exact: true }),
    });
    assert.equal(await workflowProgress.count(), 1, `${theme} publishing detail exposes one workflow progress panel`);
    const currentWorkflowStep = workflowProgress.getByText('发布管理', { exact: true });
    assert.equal(await currentWorkflowStep.count(), 1, `${theme} workflow progress identifies the current publishing step unambiguously`);
    assert.ok(await contrastRatio(currentWorkflowStep) >= 4.5, `${theme} current workflow step label maintains at least 4.5:1 contrast`);
    for (let index = 0; index < await fieldLabels.count(); index += 1) {
      assert.ok(await contrastRatio(fieldLabels.nth(index)) >= 4.5, `${theme} publishing information label ${index + 1} maintains at least 4.5:1 contrast`);
    }
    for (const [label, copy] of [
      ['source metadata', page.locator('.xmt-card p.mt-1.text-xs').first()],
      ['editor scope note', page.locator('.xmt-card .border-t p.text-xs').first()],
    ] as const) {
      assert.ok(await contrastRatio(copy) >= 4.5, `${theme} publishing ${label} maintains at least 4.5:1 contrast`);
    }
    const historyText = page.locator('section[aria-label="发布剧本版本历史"] p.text-studio-text-secondary');
    assert.ok(await historyText.count() >= 1, `${theme} publishing detail shows version-history guidance`);
    for (let index = 0; index < await historyText.count(); index += 1) {
      assert.ok(await contrastRatio(historyText.nth(index)) >= 4.5, `${theme} publishing version-history text ${index + 1} maintains at least 4.5:1 contrast`);
    }
  };

  const writingMetricsPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  writingMetricsPage.setDefaultTimeout(5000);
  writingMetricsPage.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark'] as const) {
    await writingMetricsPage.goto(`${base}/__qa?page=shooting&theme=${theme}`);
    await writingMetricsPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
    assert.ok(await writingMetricsPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${theme} 390px shooting detail has no horizontal page overflow`);
    for (const [label, metric] of [
      ['当前字数', writingMetricsPage.getByLabel('当前字数 8')],
      ['目标字数说明', writingMetricsPage.getByText('目标', { exact: true })],
      ['预计阅读时间', writingMetricsPage.getByText('预计阅读 1 分钟', { exact: true })],
    ] as const) {
      assert.ok(await contrastRatio(metric) >= 4.5, `${theme} 390px ${label} text maintains at least 4.5:1 contrast`);
    }
  }
  await writingMetricsPage.close();

  const historyErrorContrastPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  historyErrorContrastPage.setDefaultTimeout(5000);
  historyErrorContrastPage.on('pageerror', (error) => errors.push(error.message));
  const historyErrorContrastWrites: string[] = [];
  historyErrorContrastPage.on('request', (request) => {
    const requestUrl = new URL(request.url());
    const isSocketIoTransport = requestUrl.pathname === '/socket.io' || requestUrl.pathname.startsWith('/socket.io/');
    if (!isSocketIoTransport && requestUrl.pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      historyErrorContrastWrites.push(`${request.method()} ${requestUrl.pathname}`);
    }
  });
  for (const theme of ['light', 'dark'] as const) {
    for (const [stage, testId] of [
      ['shooting', 'shooting-script-history-error'],
      ['publishing', 'publishing-script-history-error'],
    ] as const) {
      await historyErrorContrastPage.goto(`${base}/__qa?page=${stage}&versionRead=${stage}&theme=${theme}`);
      const historyReadError = historyErrorContrastPage.getByTestId(testId);
      const message = historyReadError.locator('span');
      await message.waitFor({ state: 'visible' });
      const ratio = await contrastRatio(message);
      assert.ok(ratio >= 4.5, `${theme} 390px ${stage} history-read error text has composited contrast ${ratio.toFixed(2)}:1`);
      assert.equal(await historyReadError.getByRole('button', { name: '重新加载版本历史', exact: true }).isVisible(), true,
        `${theme} ${stage} history-read error keeps its explicit read-only retry visible`);
    }
  }
  assert.deepEqual(historyErrorContrastWrites, [], 'checking workflow history error contrast does not issue business writes');
  await historyErrorContrastPage.close();

  const sidebarHoverPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  sidebarHoverPage.setDefaultTimeout(5000);
  sidebarHoverPage.on('pageerror', (error) => errors.push(error.message));
  const sidebarHoverWrites: string[] = [];
  sidebarHoverPage.on('request', (request) => {
    const requestUrl = new URL(request.url());
    const isSocketIoTransport = requestUrl.pathname === '/socket.io' || requestUrl.pathname.startsWith('/socket.io/');
    if (!isSocketIoTransport && requestUrl.pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      sidebarHoverWrites.push(`${request.method()} ${requestUrl.pathname}`);
    }
  });
  for (const theme of ['light', 'dark'] as const) {
    for (const collapsed of [false, true] as const) {
      await sidebarHoverPage.goto(`${base}/__qa?page=shooting&theme=${theme}`);
      await sidebarHoverPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
      await sidebarHoverPage.waitForFunction((expectedTheme) => document.documentElement.dataset.theme === expectedTheme, theme);
      assert.equal(await sidebarHoverPage.getByRole('navigation', { name: '移动主导航' }).count(), 0,
        `${theme} 1440px browser uses the desktop Layout, not MobileShell`);
      const desktopSidebar = sidebarHoverPage.locator('aside.sticky');
      assert.equal(await desktopSidebar.count(), 1, `${theme} 1440px page renders one desktop sidebar`);
      assert.equal(await desktopSidebar.isVisible(), true, `${theme} 1440px desktop sidebar is visible`);

      const sidebarToggle = desktopSidebar.getByRole('button', { name: /^(展开|收起)侧边栏$/ });
      const currentlyCollapsed = (await sidebarToggle.getAttribute('aria-label')) === '展开侧边栏';
      if (currentlyCollapsed !== collapsed) await sidebarToggle.click();
      await desktopSidebar.getByRole('button', { name: collapsed ? '展开侧边栏' : '收起侧边栏' }).waitFor();
      await sidebarHoverPage.waitForTimeout(350);

      const logoutButton = desktopSidebar.getByRole('button', { name: '退出登录', exact: true });
      await logoutButton.waitFor({ state: 'visible' });
      const backgroundBeforeHover = await logoutButton.evaluate((button) => getComputedStyle(button).backgroundColor);
      await logoutButton.hover();
      await sidebarHoverPage.waitForTimeout(250);
      const backgroundAfterHover = await logoutButton.evaluate((button) => getComputedStyle(button).backgroundColor);
      assert.notEqual(backgroundAfterHover, backgroundBeforeHover, `${theme} ${collapsed ? 'collapsed' : 'expanded'} sidebar logout hover renders its coral surface`);
      const ratio = await contrastRatio(logoutButton);
      assert.ok(ratio >= 4.5, `${theme} ${collapsed ? 'collapsed' : 'expanded'} sidebar logout hover text contrast is ${ratio.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(sidebarHoverWrites, [], 'hovering the desktop sidebar logout control issues no business write requests');
  await sidebarHoverPage.close();

  const shootingHistoryContrastPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  shootingHistoryContrastPage.setDefaultTimeout(5000);
  shootingHistoryContrastPage.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark'] as const) {
    await shootingHistoryContrastPage.goto(`${base}/__qa?page=shooting&theme=${theme}`);
    await shootingHistoryContrastPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
    const history = shootingHistoryContrastPage.getByRole('region', { name: '剧本版本历史' });
    await history.getByText('暂无已保存版本', { exact: true }).waitFor();

    const assertHistoryTextContrast = async (label: string, text: import('playwright').Locator) => {
      await text.waitFor({ state: 'visible' });
      const ratio = await contrastRatio(text);
      assert.ok(ratio >= 4.5, `${theme} 390px shooting history ${label} has composited text contrast ${ratio.toFixed(2)}:1`);
    };

    await assertHistoryTextContrast('guidance', history.getByText('自动保存更新当前稿；仅小版本和大版本操作会留档。', { exact: true }));
    await assertHistoryTextContrast('empty state', history.getByText('暂无已保存版本', { exact: true }));

    await shootingHistoryContrastPage.getByRole('button', { name: '小版本保存', exact: true }).click();
    const savedVersion = history.getByRole('listitem').filter({ hasText: 'v1.0 · 小版本' });
    await savedVersion.waitFor();
    const baselineVersion = history.getByRole('listitem').filter({ hasText: '历史原稿（时间未记录）' });
    await baselineVersion.waitFor();
    await assertHistoryTextContrast('version operator/time metadata', savedVersion.locator('p.mt-1.text-studio-text-secondary'));
    await assertHistoryTextContrast('baseline operator/time metadata', baselineVersion.locator('p.mt-1.text-studio-text-secondary'));
    await assertHistoryTextContrast('missing source information', baselineVersion.getByText('该版本的创作来源未记录', { exact: true }));
  }

  const shootingEditorForClipboard = shootingHistoryContrastPage.locator('.ProseMirror').first();
  await shootingEditorForClipboard.click();
  await shootingHistoryContrastPage.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await shootingHistoryContrastPage.evaluate(() => {
    type ClipboardQaWindow = Window & {
      __clipboardQa: { outcomes: Record<string, boolean>; calls: string[] };
    };
    const qaWindow = window as ClipboardQaWindow;
    qaWindow.__clipboardQa = { outcomes: { copy: false, cut: false, paste: false }, calls: [] };
    const clipboardQa = {
      execCommand(command: string) {
        qaWindow.__clipboardQa.calls.push(command);
        return qaWindow.__clipboardQa.outcomes[command] ?? false;
      },
    };
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: clipboardQa.execCommand,
    });
  });
  const clipboardContextMenuGeometry: Array<{
    viewport: { width: number; height: number; scrollX: number; scrollY: number };
    anchor: { x: number; y: number };
    style: { position: string; left: string; top: string; visibility: string; zIndex: string };
    bounds: { x: number; y: number; right: number; bottom: number; width: number; height: number };
  }> = [];
  const openEditorContextMenu = async () => {
    await shootingEditorForClipboard.scrollIntoViewIfNeeded();
    const editorViewportBounds = await shootingEditorForClipboard.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
      };
    });
    const pointer = {
      x: Math.round(editorViewportBounds.width / 2),
      y: Math.round(Math.min(editorViewportBounds.height / 2, 24)),
    };
    const expectedPageAnchor = {
      x: Math.round(editorViewportBounds.viewport.scrollX + editorViewportBounds.x + pointer.x),
      y: Math.round(editorViewportBounds.viewport.scrollY + editorViewportBounds.y + pointer.y),
    };
    await shootingEditorForClipboard.click({ button: 'right', position: pointer });
    const menu = shootingHistoryContrastPage.getByTestId('editor-context-menu');
    await menu.waitFor({ state: 'visible' });
    const geometry = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
        anchor: { x: Number(element.getAttribute('data-anchor-x')), y: Number(element.getAttribute('data-anchor-y')) },
        style: { position: style.position, left: style.left, top: style.top, visibility: style.visibility, zIndex: style.zIndex },
        bounds: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      };
    });
    const expectedAnchor = {
      x: Math.round(expectedPageAnchor.x - geometry.viewport.scrollX),
      y: Math.round(expectedPageAnchor.y - geometry.viewport.scrollY),
    };
    assert.ok(Math.abs(geometry.anchor.x - expectedAnchor.x) <= 1 && Math.abs(geometry.anchor.y - expectedAnchor.y) <= 1,
      `real right-click records the pointer viewport anchor after any auto-scroll: ${JSON.stringify({ expectedAnchor, expectedPageAnchor, editorViewportBounds, geometry })}`);
    assert.equal(geometry.style.position, 'fixed', `clipboard context menu uses viewport positioning: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.style.visibility, 'visible', `clipboard context menu is visible after each open: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.bounds.x >= 0 && geometry.bounds.y >= 0
      && geometry.bounds.right <= geometry.viewport.width
      && geometry.bounds.bottom <= geometry.viewport.height,
    `clipboard context menu stays inside its current viewport after every real right-click: ${JSON.stringify(geometry)}`);
    assert.ok(Math.abs(Number.parseFloat(geometry.style.left) - geometry.bounds.x) <= 1
      && Math.abs(Number.parseFloat(geometry.style.top) - geometry.bounds.y) <= 1,
    `clipboard menu inline position matches its rendered bounding box: ${JSON.stringify(geometry)}`);
    clipboardContextMenuGeometry.push(geometry);
    return menu;
  };
  const clipboardStateBefore = await shootingHistoryContrastPage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json());
  const clipboardCollaborationBefore = await shootingHistoryContrastPage.request.get(`${base}/__qa/collaboration-state`).then((response) => response.json());

  let clipboardMenu = await openEditorContextMenu();
  assert.equal(await clipboardMenu.getByRole('button', { name: /^复制/ }).isDisabled(), false, 'copy is available when editor text is selected');
  await clipboardMenu.getByRole('button', { name: /^复制/ }).click();
  await shootingHistoryContrastPage.getByText('浏览器未能复制所选内容，请检查剪贴板权限后重试。', { exact: true }).waitFor();
  assert.equal(await shootingHistoryContrastPage.getByTestId('editor-context-menu').count(), 0, 'the context menu closes after a failed clipboard action');

  await shootingHistoryContrastPage.evaluate(() => {
    (window as Window & { __clipboardQa: { outcomes: Record<string, boolean>; calls: string[] } }).__clipboardQa.outcomes.copy = true;
  });
  clipboardMenu = await openEditorContextMenu();
  await clipboardMenu.getByRole('button', { name: /^复制/ }).click();
  await shootingHistoryContrastPage.getByText('所选内容已复制到剪贴板。', { exact: true }).waitFor();

  clipboardMenu = await openEditorContextMenu();
  await clipboardMenu.getByRole('button', { name: /^剪切/ }).click();
  await shootingHistoryContrastPage.getByText('正文未确认变更；请检查剪贴板权限后重试。', { exact: false }).waitFor();

  clipboardMenu = await openEditorContextMenu();
  await clipboardMenu.getByRole('button', { name: /^粘贴/ }).click();
  await shootingHistoryContrastPage.getByText('浏览器未允许页面读取剪贴板，请使用系统粘贴快捷键或浏览器菜单。', { exact: true }).waitFor();

  const clipboardQaState = await shootingHistoryContrastPage.evaluate(() => (window as Window & {
    __clipboardQa: { outcomes: Record<string, boolean>; calls: string[] };
  }).__clipboardQa);
  assert.deepEqual(clipboardQaState.calls, ['copy', 'copy', 'cut', 'paste'], 'each editor clipboard menu action reaches the browser once');
  const clipboardStateAfter = await shootingHistoryContrastPage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json());
  assert.equal(clipboardStateAfter.shootingScriptWriteCount, clipboardStateBefore.shootingScriptWriteCount, 'clipboard result feedback does not save or mutate the shooting script');
  const clipboardCollaborationAfter = await shootingHistoryContrastPage.request.get(`${base}/__qa/collaboration-state`).then((response) => response.json());
  assert.equal(clipboardCollaborationAfter.collaborationUpdateCount, clipboardCollaborationBefore.collaborationUpdateCount, 'clipboard result feedback does not submit a collaborative script update');
  assert.equal(clipboardContextMenuGeometry.length, 4, 'clipboard menu geometry is captured for the initial open and all three reopen actions');
  console.log(`Clipboard context-menu viewport evidence: ${JSON.stringify(clipboardContextMenuGeometry)}`);
  await shootingHistoryContrastPage.close();

  await page.goto(`${base}/__qa?page=shooting&versionRead=shooting`);
  await page.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  const finishProduction = page.getByRole('button', { name: '完成制作', exact: true });
  const saveShootingMinor = page.getByRole('button', { name: '小版本保存', exact: true });
  const saveShootingMajor = page.getByRole('button', { name: '大版本保存', exact: true });
  const returnToShootingList = page.getByRole('button', { name: '返回制作列表', exact: true });
  const toggleShootingInfo = page.getByTestId('shooting-info-toggle');
  const shootingInfoPanel = page.getByRole('complementary', { name: '成片制作信息', exact: true });
  const copyShootingScript = page.getByRole('button', { name: '复制全文', exact: true });
  const shootingHistory = page.getByRole('region', { name: '剧本版本历史' });
  await shootingHistory.waitFor();
  const shootingHistoryError = page.getByTestId('shooting-script-history-error');
  await shootingHistoryError.waitFor();
  assert.equal(await shootingHistory.getByText('暂无已保存版本', { exact: true }).count(), 0, 'a failed history request is not presented as an empty history');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the shooting history error and retry fit at 390px');
  await shootingHistoryError.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/xmt-shooting-script-history-retry-390.png', fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  const shootingHistoryRetry = page.waitForResponse((response) => response.url().endsWith('/api/workflow/shooting/301/versions') && response.request().method() === 'GET' && response.status() === 200);
  await shootingHistoryError.getByRole('button', { name: '重新加载版本历史', exact: true }).click();
  await shootingHistoryRetry;
  await shootingHistory.getByText('暂无已保存版本', { exact: true }).waitFor();
  assert.equal((await page.request.get(`${base}/__qa/workflow-version-state`).then((response) => response.json())).shootingReadCount, 2, 'explicit retry reloads only the shooting version history');
  await saveShootingMinor.click();
  await page.waitForFunction(async () => (await (await fetch('/__qa/workflow-version-state')).json()).shooting.length > 0);
  const shootingVersionBody = await page.evaluate(async () => (await (await fetch('/__qa/workflow-version-state')).json()).shooting[0]);
  assert.equal(shootingVersionBody.version_action, 'minor', 'explicit shooting action reaches the API as a minor version');
  assert.equal(typeof shootingVersionBody.expected_content, 'string', 'explicit shooting action carries the concurrency baseline');
  assert.equal(shootingVersionBody.script_source_production_id, 303, 'shooting version records its exact source production');
  assert.equal(shootingVersionBody.script_source_version, 'v2', 'shooting version records its exact source production version');
  await page.getByText('v1.0 · 小版本', { exact: true }).waitFor();
  await page.getByText('历史原稿（时间未记录）', { exact: true }).waitFor();
  const shootingBaselineEntry = shootingHistory.getByRole('listitem').filter({ hasText: '历史原稿（时间未记录）' });
  await shootingBaselineEntry.getByText('该版本的创作来源未记录', { exact: true }).waitFor();
  const shootingVersionEntry = shootingHistory.getByRole('listitem').filter({ hasText: 'v1.0 · 小版本' });
  const shootingSourceVersionLink = shootingVersionEntry.getByRole('button', { name: '来源创作稿：v2 · 查看', exact: true });
  await shootingSourceVersionLink.waitFor();
  await shootingVersionEntry.getByText('查看此版本正文', { exact: true }).click();
  await shootingVersionEntry.getByText('拍摄用隔离稿件。', { exact: true }).waitFor();
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
      await setViewportAtBrowserZoom(page, viewport, zoom);
      await assertButtonFits(finishProduction, '拍摄详情完成制作', viewport, zoom);
      await assertButtonFits(saveShootingMinor, '拍摄详情小版本保存', viewport, zoom);
      await assertButtonFits(saveShootingMajor, '拍摄详情大版本保存', viewport, zoom);
      await assertButtonFits(shootingSourceVersionLink, '拍摄历史来源创作版本入口', viewport, zoom);
    }
  }
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    assert.equal(await shootingHistory.isVisible(), true, `${viewport.width}px shooting detail keeps version history available`);
    await assertButtonFits(finishProduction, `${viewport.width}px 拍摄详情完成制作`, viewport, 1);
    await assertButtonFits(saveShootingMinor, `${viewport.width}px 拍摄详情小版本保存`, viewport, 1);
    await assertButtonFits(saveShootingMajor, `${viewport.width}px 拍摄详情大版本保存`, viewport, 1);
    await assertButtonFits(shootingSourceVersionLink, `${viewport.width}px 拍摄历史来源创作版本入口`, viewport, 1);
    await assertButtonFits(returnToShootingList, `${viewport.width}px 拍摄详情返回列表`, viewport, 1);
    await assertButtonFits(toggleShootingInfo, `${viewport.width}px 拍摄详情信息栏开关`, viewport, 1);
    await assertButtonFits(copyShootingScript, `${viewport.width}px 拍摄剧本复制全文`, viewport, 1);
    await assertMinimumTapTarget(returnToShootingList, `${viewport.width}px 拍摄详情返回列表`);
    await assertMinimumTapTarget(toggleShootingInfo, `${viewport.width}px 拍摄详情信息栏开关`);
    await assertMinimumTapTarget(copyShootingScript, `${viewport.width}px 拍摄剧本复制全文`);
    assert.equal(await toggleShootingInfo.getAttribute('aria-expanded'), 'false', `${viewport.width}px information panel starts collapsed`);
    await toggleShootingInfo.click();
    assert.equal(await toggleShootingInfo.getAttribute('aria-expanded'), 'true', `${viewport.width}px information panel toggle reports expanded`);
    assert.equal(await toggleShootingInfo.getAttribute('aria-label'), '收起信息栏', `${viewport.width}px information panel toggle exposes its close action`);
    await shootingInfoPanel.getByText('设备清单', { exact: true }).waitFor();
    assert.equal(await shootingInfoPanel.getByText('相机、麦克风、补光灯', { exact: true }).count(), 1, `${viewport.width}px expanded information shows the equipment list`);
    const closeShootingInfo = shootingInfoPanel.getByRole('button', { name: '收起信息栏', exact: true });
    assert.equal(await closeShootingInfo.count(), 1, `${viewport.width}px panel close control has an accessible name`);
    const panelAndEditorGeometry = await page.evaluate(() => {
      const panelElement = document.querySelector('#shooting-info-panel');
      const editorElement = [...document.querySelectorAll('[contenteditable="true"]')].find((element) => element.textContent?.includes('拍摄用隔离稿件。'));
      const panel = panelElement?.getBoundingClientRect();
      const editor = editorElement?.getBoundingClientRect();
      return panel && editor && panelElement && editorElement
        ? {
            panelBottom: panel.bottom,
            editorTop: editor.top,
            panelPrecedesEditorInReadingOrder: Boolean(panelElement.compareDocumentPosition(editorElement) & Node.DOCUMENT_POSITION_FOLLOWING),
          }
        : null;
    });
    assert.ok(panelAndEditorGeometry && panelAndEditorGeometry.panelBottom <= panelAndEditorGeometry.editorTop + 1, `${viewport.width}px information appears before the editor: ${JSON.stringify(panelAndEditorGeometry)}`);
    assert.equal(panelAndEditorGeometry?.panelPrecedesEditorInReadingOrder, true, `${viewport.width}px information precedes the editor in the document reading order`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${viewport.width}px expanded information does not create horizontal page overflow`);
    await closeShootingInfo.click();
    assert.equal(await toggleShootingInfo.getAttribute('aria-expanded'), 'false', `${viewport.width}px information panel can be collapsed again`);
    assert.equal(await shootingInfoPanel.count(), 0, `${viewport.width}px collapsed information panel is removed from the accessibility tree`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${viewport.width}px shooting detail has no horizontal page overflow`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await shootingHistory.isVisible(), true, 'shooting version history is available on the detail page');
  assert.ok(await contrastRatio(finishProduction) >= 4.5, 'light-theme shooting completion action has accessible text contrast');
  await shootingSourceVersionLink.click();
  await page.waitForURL(/\/production\/303\?version=v2$/);
  await page.getByRole('button', { name: '当前版本查看 / 编辑', exact: true }).waitFor();
  await page.goto(`${base}/__qa?page=shooting&theme=dark`);
  await page.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  assert.ok(await contrastRatio(page.getByRole('button', { name: '完成制作', exact: true })) >= 4.5, 'dark-theme shooting completion action has accessible text contrast');

  await page.goto(`${base}/__qa?page=publishing&versionRead=publishing`);
  await page.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  const editScript = page.getByRole('button', { name: '编辑剧本', exact: true });
  const returnToPublishingList = page.getByRole('button', { name: '返回发布管理', exact: true });
  const publishingHistory = page.locator('[aria-label="发布剧本版本历史"]');
  const publishingHistoryError = page.getByTestId('publishing-script-history-error');
  await publishingHistoryError.waitFor();
  assert.equal(await publishingHistory.getByText('暂无已保存版本', { exact: true }).count(), 0, 'a failed publishing history request is not presented as empty');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the publishing history error and retry fit at 390px');
  await publishingHistoryError.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/xmt-publishing-script-history-retry-390.png', fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  const publishingHistoryRetry = page.waitForResponse((response) => response.url().endsWith('/api/workflow/publishing/501/versions') && response.request().method() === 'GET' && response.status() === 200);
  await publishingHistoryError.getByRole('button', { name: '重新加载版本历史', exact: true }).click();
  await publishingHistoryRetry;
  await publishingHistory.getByText('暂无已保存版本', { exact: true }).waitFor();
  assert.equal((await page.request.get(`${base}/__qa/workflow-version-state`).then((response) => response.json())).publishingReadCount, 2, 'explicit retry reloads only the publishing version history');
  await editScript.click();
  const savePublishingMinor = page.getByRole('button', { name: '小版本保存', exact: true });
  await savePublishingMinor.click();
  await page.waitForFunction(async () => (await (await fetch('/__qa/workflow-version-state')).json()).publishing.length > 0);
  const publishingVersionBody = await page.evaluate(async () => (await (await fetch('/__qa/workflow-version-state')).json()).publishing[0]);
  assert.equal(publishingVersionBody.version_action, 'minor', 'explicit publishing action reaches the API as a minor version');
  assert.equal(typeof publishingVersionBody.expected_content, 'string', 'explicit publishing action carries the concurrency baseline');
  assert.equal(publishingVersionBody.script_source_production_id, 303, 'publishing version records its exact source production');
  assert.equal(publishingVersionBody.script_source_version, 'v2', 'publishing version records its exact source production version');
  await page.getByText('v1.0 · 小版本', { exact: true }).waitFor();
  const publishingVersionEntry = publishingHistory.getByRole('listitem').filter({ hasText: 'v1.0 · 小版本' });
  const publishingSourceVersionLink = publishingVersionEntry.getByRole('button', { name: '来源创作稿：v2 · 查看', exact: true });
  await publishingSourceVersionLink.waitFor();
  await publishingVersionEntry.getByText('查看此版本正文', { exact: true }).click();
  await publishingVersionEntry.getByText('发布用隔离稿件。', { exact: true }).waitFor();
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
      await setViewportAtBrowserZoom(page, viewport, zoom);
      await assertButtonFits(editScript, '发布详情编辑剧本', viewport, zoom);
      await editScript.click();
      const cancelEdit = page.getByRole('button', { name: '取消', exact: true });
      const saveEdit = page.getByRole('button', { name: '保存', exact: true });
      await assertButtonFits(cancelEdit, '发布详情取消编辑', viewport, zoom);
      await assertButtonFits(saveEdit, '发布详情保存', viewport, zoom);
      await cancelEdit.click();
      await assertButtonFits(publishingSourceVersionLink, '发布历史来源创作版本入口', viewport, zoom);
    }
  }
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    assert.equal(await publishingHistory.isVisible(), true, `${viewport.width}px publishing detail keeps version history available`);
    await assertButtonFits(editScript, `${viewport.width}px 发布详情编辑剧本`, viewport, 1);
    await assertButtonFits(returnToPublishingList, `${viewport.width}px 发布详情返回列表`, viewport, 1);
    await assertMinimumTapTarget(editScript, `${viewport.width}px 发布详情编辑剧本`);
    await editScript.click();
    const cancelEdit = page.getByRole('button', { name: '取消', exact: true });
    const saveEdit = page.getByRole('button', { name: '保存', exact: true });
    const copyPublishingScript = page.getByRole('button', { name: '复制全文', exact: true });
    await assertButtonFits(cancelEdit, `${viewport.width}px 发布详情取消编辑`, viewport, 1);
    await assertButtonFits(saveEdit, `${viewport.width}px 发布详情保存`, viewport, 1);
    await assertButtonFits(copyPublishingScript, `${viewport.width}px 发布详情复制全文`, viewport, 1);
    await assertMinimumTapTarget(cancelEdit, `${viewport.width}px 发布详情取消编辑`);
    await assertMinimumTapTarget(saveEdit, `${viewport.width}px 发布详情保存`);
    await assertMinimumTapTarget(returnToPublishingList, `${viewport.width}px 发布详情返回列表`);
    await assertMinimumTapTarget(copyPublishingScript, `${viewport.width}px 发布详情复制全文`);
    await cancelEdit.click();
    await assertButtonFits(publishingSourceVersionLink, `${viewport.width}px 发布历史来源创作版本入口`, viewport, 1);
    await assertMinimumTapTarget(publishingSourceVersionLink, `${viewport.width}px 发布历史来源创作版本入口`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${viewport.width}px publishing detail has no horizontal page overflow`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'light 390px publishing detail has no horizontal overflow');
  await assertPublishingDetailCopyContrast('light');
  await page.setViewportSize({ width: 1440, height: 900 });

  const approvedStatus = page.getByText('已通过', { exact: true });
  assert.ok(await contrastRatio(approvedStatus) >= 4.5, 'light-theme approved status has accessible text contrast');
  const completedMarkers = page.locator('div.bg-studio-success-soft.text-studio-success-contrast');
  assert.ok(await completedMarkers.count() >= 2, 'publishing progress shows completed stage markers');
  assert.ok(await contrastRatio(completedMarkers.first().locator('svg')) >= 4.5, 'light-theme completed workflow icon has accessible contrast');
  await publishingSourceVersionLink.click();
  await page.waitForURL(/\/production\/303\?version=v2$/);
  await page.getByRole('button', { name: '当前版本查看 / 编辑', exact: true }).waitFor();
  await page.goto(`${base}/__qa?page=publishing&theme=dark`);
  await page.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'dark 390px publishing detail has no horizontal overflow');
  await assertPublishingDetailCopyContrast('dark');
  assert.ok(await contrastRatio(page.getByText('已通过', { exact: true })) >= 4.5, 'dark-theme approved status has accessible text contrast');
  const darkCompletedMarkers = page.locator('div.bg-studio-success-soft.text-studio-success-contrast');
  assert.ok(await darkCompletedMarkers.count() >= 2, 'dark publishing progress shows completed stage markers');
  assert.ok(await contrastRatio(darkCompletedMarkers.first().locator('svg')) >= 4.5, 'dark-theme completed workflow icon has accessible contrast');
  const darkEditScript = page.getByRole('button', { name: '编辑剧本', exact: true });
  await darkEditScript.click();
  for (const [label, metric] of [
    ['current word count', page.getByLabel('当前字数 8')],
    ['word goal', page.getByText('目标', { exact: true })],
    ['estimated reading time', page.getByText('预计阅读 1 分钟', { exact: true })],
  ] as const) {
    assert.ok(await contrastRatio(metric) >= 4.5, `dark 390px publishing ${label} maintains at least 4.5:1 contrast`);
  }
  const darkSave = page.getByRole('button', { name: '保存', exact: true });
  assert.ok(await darkSave.evaluate((element) => element.classList.contains('xmt-btn-primary')), 'dark-theme publish save action uses the contrast-safe brand button');
  await page.screenshot({ path: '/tmp/xmt-workflow-detail-dark-publishing.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  const archiveRetryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  archiveRetryPage.setDefaultTimeout(10000);
  archiveRetryPage.on('pageerror', (error) => errors.push(error.message));
  archiveRetryPage.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('503')) errors.push(message.text()); });
  await archiveRetryPage.goto(`${base}/__qa?page=publishing&archive=pending`);
  await archiveRetryPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  const publishingArchiveStatus = archiveRetryPage.getByRole('status').filter({ hasText: '发布剧本已保存，但发布归档尚未更新' });
  await publishingArchiveStatus.waitFor();
  await archiveRetryPage.screenshot({ path: '/tmp/xmt-published-archive-sync-warning-mobile.png', fullPage: true });
  const beforeArchiveRetry = await archiveRetryPage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json());
  const failedArchiveRetryResponse = archiveRetryPage.waitForResponse((response) => response.url().endsWith('/api/workflow/publishing/501/archive-sync') && response.request().method() === 'POST' && response.status() === 503);
  await publishingArchiveStatus.getByRole('button', { name: '重试同步归档', exact: true }).click();
  await failedArchiveRetryResponse;
  await publishingArchiveStatus.waitFor();
  assert.equal(await archiveRetryPage.getByRole('button', { name: '编辑剧本', exact: true }).count(), 1, 'retrying an archive does not reopen or rewrite the publishing script');
  const recoveredArchiveRetryResponse = archiveRetryPage.waitForResponse((response) => response.url().endsWith('/api/workflow/publishing/501/archive-sync') && response.request().method() === 'POST' && response.status() === 200);
  await publishingArchiveStatus.getByRole('button', { name: '重试同步归档', exact: true }).click();
  await recoveredArchiveRetryResponse;
  await publishingArchiveStatus.waitFor({ state: 'hidden' });
  const afterArchiveRetry = await archiveRetryPage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json());
  assert.equal(afterArchiveRetry.publishingScriptWriteCount, beforeArchiveRetry.publishingScriptWriteCount, 'archive retry never resubmits the confirmed publishing mutation');
  assert.equal(afterArchiveRetry.archiveSyncRetryCount - beforeArchiveRetry.archiveSyncRetryCount, 2, 'one failed retry and one successful retry are each explicit user actions');
  assert.ok(await archiveRetryPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the persistent archive warning fits a 390px screen');
  await archiveRetryPage.screenshot({ path: '/tmp/xmt-published-archive-sync-recovered-mobile.png', fullPage: true });
  await archiveRetryPage.close();

  const shootingArchiveSavePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  shootingArchiveSavePage.setDefaultTimeout(10000);
  shootingArchiveSavePage.on('pageerror', (error) => errors.push(error.message));
  shootingArchiveSavePage.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('503')) errors.push(message.text()); });
  await shootingArchiveSavePage.goto(`${base}/__qa?page=shooting&archive=after-shooting-save`);
  await shootingArchiveSavePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  const shootingArchiveEditor = shootingArchiveSavePage.locator('.ProseMirror').first();
  const shootingArchiveSaveResponse = shootingArchiveSavePage.waitForResponse((response) => response.url().endsWith('/api/workflow/shooting/301') && response.request().method() === 'PUT' && response.status() === 200);
  await shootingArchiveEditor.click();
  await shootingArchiveSavePage.keyboard.press('End');
  await shootingArchiveSavePage.keyboard.type('归档反馈测试');
  const confirmedShootingArchiveSave = await shootingArchiveSaveResponse;
  assert.equal((await confirmedShootingArchiveSave.json()).archiveSync, 'pending', 'shooting autosave remains confirmed while the separate archive refresh reports pending');
  const shootingArchiveStatus = shootingArchiveSavePage.getByRole('status').filter({ hasText: '成片剧本已保存，但发布归档尚未更新' });
  await shootingArchiveStatus.waitFor();
  await shootingArchiveSavePage.reload();
  await shootingArchiveSavePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await shootingArchiveSavePage.getByRole('status').filter({ hasText: '成片剧本已保存，但发布归档尚未更新' }).waitFor();
  const shootingArchiveSyncResponse = shootingArchiveSavePage.waitForResponse((response) => response.url().endsWith('/api/workflow/shooting/301/archive-sync') && response.request().method() === 'POST' && response.status() === 200);
  await shootingArchiveSavePage.getByRole('button', { name: '重试同步归档', exact: true }).click();
  await shootingArchiveSyncResponse;
  await shootingArchiveSavePage.getByRole('status').filter({ hasText: '成片剧本已保存，但发布归档尚未更新' }).waitFor({ state: 'hidden' });
  await shootingArchiveSavePage.screenshot({ path: '/tmp/xmt-shooting-archive-sync-recovered-desktop.png', fullPage: true });
  await shootingArchiveSavePage.close();

  const publishingArchiveSavePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  publishingArchiveSavePage.setDefaultTimeout(10000);
  publishingArchiveSavePage.on('pageerror', (error) => errors.push(error.message));
  publishingArchiveSavePage.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('503')) errors.push(message.text()); });
  await publishingArchiveSavePage.goto(`${base}/__qa?page=publishing&archive=after-publishing-save`);
  await publishingArchiveSavePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await publishingArchiveSavePage.getByRole('button', { name: '编辑剧本', exact: true }).click();
  const publishingArchiveEditor = publishingArchiveSavePage.locator('.ProseMirror').first();
  const publishingArchiveEditorBounds = await publishingArchiveEditor.boundingBox();
  assert.ok(publishingArchiveEditorBounds, 'publishing archive editor has an editable layout box');
  await publishingArchiveEditor.click({
    position: {
      x: Math.round(publishingArchiveEditorBounds.width / 2),
      y: Math.max(1, Math.round(publishingArchiveEditorBounds.height - 8)),
    },
  });
  await publishingArchiveSavePage.keyboard.press('Control+A');
  await publishingArchiveSavePage.keyboard.type('归档反馈测试发布稿');
  const publishingArchiveSaveResponse = publishingArchiveSavePage.waitForResponse((response) => response.url().endsWith('/api/workflow/publishing/501') && response.request().method() === 'PUT' && response.status() === 200);
  await publishingArchiveSavePage.getByRole('button', { name: '保存', exact: true }).click();
  const confirmedPublishingArchiveSave = await publishingArchiveSaveResponse;
  assert.equal((await confirmedPublishingArchiveSave.json()).archiveSync, 'pending', 'publishing response independently reports the archive failure after its primary write');
  await publishingArchiveSavePage.getByText('剧本已保存，归档待同步', { exact: true }).waitFor();
  const publishingSaveArchiveStatus = publishingArchiveSavePage.getByRole('status').filter({ hasText: '发布剧本已保存，但发布归档尚未更新' });
  await publishingSaveArchiveStatus.waitFor();
  assert.equal(await publishingArchiveSavePage.getByRole('button', { name: '编辑剧本', exact: true }).count(), 1, 'a confirmed publishing save returns to the read view even when archive synchronization is pending');
  const publishingSaveRetryResponse = publishingArchiveSavePage.waitForResponse((response) => response.url().endsWith('/api/workflow/publishing/501/archive-sync') && response.request().method() === 'POST' && response.status() === 200);
  await publishingSaveArchiveStatus.getByRole('button', { name: '重试同步归档', exact: true }).click();
  await publishingSaveRetryResponse;
  await publishingSaveArchiveStatus.waitFor({ state: 'hidden' });
  assert.ok(await publishingArchiveSavePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the publishing archive feedback fits a 390px screen');
  await publishingArchiveSavePage.screenshot({ path: '/tmp/xmt-publishing-archive-sync-recovered-mobile.png', fullPage: true });
  await publishingArchiveSavePage.close();

  for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/__qa?page=shooting-list&theme=${theme}`);
    await page.getByRole('heading', { name: '成片制作', exact: true }).waitFor();
    const icons = page.getByTestId('metric-card-icon');
    assert.equal(await icons.count(), 4, `${theme} shooting metrics render all four icon tiles`);
    const expectedStarts = theme === 'light'
      ? ['from-studio-cyan-contrast', 'from-studio-primary-contrast', 'from-studio-amber-contrast', 'from-studio-success-contrast']
      : ['from-studio-cyan/95', 'from-studio-primary/95', 'from-studio-amber/95', 'from-studio-success/95'];
    const endpointTokens = theme === 'light'
      ? [['--xmt-cyan-contrast', '--xmt-primary-contrast'], ['--xmt-primary-contrast', '--xmt-violet-contrast'], ['--xmt-amber-contrast', '--xmt-coral-contrast'], ['--xmt-success-contrast', '--xmt-cyan-contrast']]
      : [['--xmt-cyan', '--xmt-primary'], ['--xmt-primary', '--xmt-violet'], ['--xmt-amber', '--xmt-coral'], ['--xmt-success', '--xmt-cyan']];
    for (let index = 0; index < expectedStarts.length; index += 1) {
      const icon = icons.nth(index);
      const style = await icon.evaluate((element) => ({
        foreground: getComputedStyle(element.querySelector('svg')).color,
        classes: element.className,
      }));
      assert.ok(style.classes.includes(expectedStarts[index]), `${theme} metric tile ${index + 1} uses a contrast-safe theme token: ${style.classes}`);
      assert.equal(style.foreground, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(8, 11, 18)', `${theme} metric icon foreground follows the active theme`);
      const foreground = parseCssColor(style.foreground)?.rgb;
      const tokenColors = await page.evaluate((names) => names.map((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()), endpointTokens[index]);
      assert.ok(foreground, `${theme} metric icon foreground parses`);
      for (const [endpointIndex, rawColor] of tokenColors.entries()) {
        const endpoint = parseCssColor(rawColor)?.rgb;
        assert.ok(endpoint, `${theme} metric gradient endpoint ${endpointIndex + 1} token ${endpointTokens[index][endpointIndex]} parses`);
        const foregroundLuminance = relativeLuminance(foreground!);
        const endpointLuminance = relativeLuminance(endpoint!);
        const ratio = (Math.max(foregroundLuminance, endpointLuminance) + 0.05) / (Math.min(foregroundLuminance, endpointLuminance) + 0.05);
        assert.ok(ratio >= 4.5, `${theme} metric tile ${index + 1} endpoint contrast=${ratio.toFixed(2)} expected>=4.5`);
      }
    }

    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByRole('heading', { name: '确认完成', exact: true }).waitFor();
    const warningConfirm = page.getByRole('button', { name: '确认完成', exact: true });
    assert.ok((await warningConfirm.getAttribute('class'))?.includes('xmt-btn-warning'), `${theme} warning confirmation uses the shared warning action token`);
    const warningForeground = await warningConfirm.evaluate((element) => getComputedStyle(element).color);
    const expectedWarningForeground = await page.evaluate(() => {
      const sample = document.createElement('span');
      sample.style.color = 'var(--xmt-amber-contrast)';
      document.body.append(sample);
      const color = getComputedStyle(sample).color;
      sample.remove();
      return color;
    });
    assert.equal(warningForeground, expectedWarningForeground, `${theme} warning action uses the semantic amber contrast token`);
    assert.ok(await contrastRatio(warningConfirm) >= 4.5, `${theme} warning confirmation text contrast is at least 4.5:1`);
    await page.screenshot({ path: `/tmp/xmt-confirm-modal-warning-${theme}.png` });
    await page.getByRole('button', { name: '取消', exact: true }).click();
  }

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?page=achievements&theme=${theme}`);
    await page.getByRole('heading', { name: '成就系统', exact: true }).waitFor();
    await page.locator('button[title="排行榜"]').click();
    assert.ok(await contrastRatio(page.getByTestId('achievement-leaderboard-avatar')) >= 4.5, `${theme} leaderboard avatar foreground remains readable`);
    await page.locator('button[title="动态"]').click();
    assert.ok(await contrastRatio(page.getByTestId('achievement-feed-avatar')) >= 4.5, `${theme} achievement feed avatar foreground remains readable`);
  }

  for (const theme of ['light', 'dark'] as const) {
    const leavePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    leavePage.setDefaultTimeout(10000);
    leavePage.on('pageerror', (error) => errors.push(error.message));
    await leavePage.goto(`${base}/__qa?page=shooting&theme=${theme}`);
    await leavePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
    const editor = leavePage.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible' });
    await leavePage.request.post(`${base}/__qa/reject-collaboration-updates`);
    await editor.click();
    await leavePage.keyboard.press('End');
    await leavePage.keyboard.type('离开保护测试');
    await leavePage.waitForFunction(async () => {
      const response = await fetch('/__qa/collaboration-state');
      return (await response.json()).rejectedCollaborationUpdateCount > 0;
    });
    const failedLeaveSave = leavePage.waitForResponse((response) => response.url().endsWith('/api/workflow/shooting/301') && response.request().method() === 'PUT' && response.status() === 503);
    await leavePage.getByRole('button', { name: '返回制作列表', exact: true }).click();
    await failedLeaveSave;
    await leavePage.getByRole('heading', { name: '未能确认保存', exact: true }).waitFor();
    const leaveWarning = leavePage.getByText('放弃离开会停止本次保存。最后一处尚未确认的修改可能无法恢复。', { exact: true });
    await leaveWarning.waitFor();
    assert.equal(await leavePage.getByText(/保存协调|运行时|Runtime|dispose/i).count(), 0, 'leave dialog copy should explain data risk without implementation terms');
    const retry = leavePage.getByRole('button', { name: '重试保存', exact: true });
    const discard = leavePage.getByRole('button', { name: '放弃离开', exact: true });
    assert.ok((await retry.getAttribute('class'))?.includes('xmt-btn-primary'), `${theme} leave-failure retry uses the primary action token`);
    assert.ok((await discard.getAttribute('class'))?.includes('xmt-btn-danger'), `${theme} leave-failure discard uses the danger action token`);
    const dangerForeground = await discard.evaluate((element) => getComputedStyle(element).color);
    const expectedDangerForeground = await leavePage.evaluate(() => {
      const sample = document.createElement('span');
      sample.style.color = 'var(--xmt-coral-contrast)';
      document.body.append(sample);
      const color = getComputedStyle(sample).color;
      sample.remove();
      return color;
    });
    assert.equal(dangerForeground, expectedDangerForeground, `${theme} discard action uses the semantic danger contrast token`);
    assert.ok(await contrastRatio(discard) >= 4.5, `${theme} leave-failure danger action text contrast is at least 4.5:1`);
    await leavePage.getByRole('button', { name: '继续编辑', exact: true }).click();
    await leavePage.getByRole('heading', { name: '未能确认保存', exact: true }).waitFor({ state: 'hidden' });
    await leavePage.close();
  }

  shooting.status = 'in_progress';
  shootingStatusWriteCount = 0;
  const statusRefreshPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  statusRefreshPage.setDefaultTimeout(10000);
  const statusRefreshErrors: string[] = [];
  statusRefreshPage.on('pageerror', (error) => statusRefreshErrors.push(error.message));
  statusRefreshPage.on('console', (message) => {
    if (message.type() === 'error') statusRefreshErrors.push(message.text());
  });
  await statusRefreshPage.goto(`${base}/__qa?page=shooting`);
  await statusRefreshPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await statusRefreshPage.request.post(`${base}/__qa/fail-next-shooting-read`);
  await statusRefreshPage.request.post(`${base}/__qa/delay-next-shooting-status-update`);
  const statusWrite = statusRefreshPage.waitForResponse((response) => response.url().endsWith('/api/workflow/shooting/301') && response.request().method() === 'PUT' && response.status() === 200);
  const failedStatusRefresh = statusRefreshPage.waitForResponse((response) => response.url().endsWith('/api/workflow/shooting/301') && response.request().method() === 'GET' && response.status() === 503);
  await statusRefreshPage.getByRole('button', { name: '完成制作', exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await statusRefreshPage.waitForFunction(async () => {
    const state = await (await fetch('/__qa/shooting-status-write-count')).json();
    return state.count === 1 && state.started;
  });
  await statusRefreshPage.waitForTimeout(100);
  assert.equal((await (await statusRefreshPage.request.get(`${base}/__qa/shooting-status-write-count`)).json()).count, 1, 'same-task duplicate status activation starts only one update request');
  const completingButton = statusRefreshPage.getByRole('button', { name: '正在完成制作…', exact: true });
  assert.equal(await completingButton.isDisabled(), true, 'status transition remains disabled until the confirmed response and refresh finish');
  await statusRefreshPage.request.post(`${base}/__qa/release-shooting-status-update`);
  await Promise.all([statusWrite, failedStatusRefresh]);
  await statusRefreshPage.getByText('服务端已确认更新，但页面刷新失败。请重新加载确认，不要重复操作。', { exact: false }).waitFor();
  assert.equal(await statusRefreshPage.getByRole('button', { name: '完成制作', exact: true }).count(), 0, 'confirmed completion is reflected locally after the detail refresh fails');
  assert.ok(await statusRefreshPage.getByText('已完成', { exact: true }).count() >= 1, 'confirmed completion status remains visible after the detail refresh fails');
  assert.equal((await (await statusRefreshPage.request.get(`${base}/__qa/shooting-status-write-count`)).json()).count, 1, 'completion mutation was submitted once before reload');
  await statusRefreshPage.reload();
  await statusRefreshPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  assert.ok(await statusRefreshPage.getByText('已完成', { exact: true }).count() >= 1, 'reload confirms the server-persisted completed status');
  assert.equal(await statusRefreshPage.getByRole('button', { name: '完成制作', exact: true }).count(), 0, 'reload does not offer a duplicate completion action');
  assert.equal((await (await statusRefreshPage.request.get(`${base}/__qa/shooting-status-write-count`)).json()).count, 1, 'reload does not repeat the completion mutation');
  assert.ok(statusRefreshErrors.length <= 1 && statusRefreshErrors.every((message) => /503/.test(message)), `shooting status refresh failure produces no unexpected browser errors: ${statusRefreshErrors.join(' | ')}`);
  await statusRefreshPage.close();

  shooting.status = 'in_progress';
  shootingStatusWriteCount = 0;
  const shootingListConfirmPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  shootingListConfirmPage.setDefaultTimeout(10000);
  shootingListConfirmPage.on('pageerror', (error) => errors.push(error.message));
  await shootingListConfirmPage.goto(`${base}/__qa?page=shooting-list&theme=light`);
  await shootingListConfirmPage.getByRole('heading', { name: '成片制作', exact: true }).waitFor();
  await shootingListConfirmPage.request.post(`${base}/__qa/delay-next-shooting-status-update`);
  await shootingListConfirmPage.getByRole('button', { name: '完成', exact: true }).click();
  const shootingListConfirm = shootingListConfirmPage.getByRole('button', { name: '确认完成', exact: true });
  await shootingListConfirm.waitFor();
  await shootingListConfirm.evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await shootingListConfirmPage.waitForFunction(async () => {
    const state = await (await fetch('/__qa/shooting-status-write-count')).json();
    return state.count === 1 && state.started;
  });
  await shootingListConfirmPage.waitForTimeout(50);
  assert.equal((await shootingListConfirmPage.request.get(`${base}/__qa/shooting-status-write-count`).then((response) => response.json())).count, 1, 'same-task confirmation activation sends only one shooting list mutation');
  assert.equal(await shootingListConfirm.isDisabled(), true, 'duplicate confirmation activation cannot clear the in-flight disabled state');
  // Start the response timeout only after the fixture confirms the request is held at the gate.
  const shootingListStatusWrite = shootingListConfirmPage.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/workflow/shooting/301'
    && response.request().method() === 'PUT'
    && response.status() === 200
  ));
  await shootingListConfirmPage.request.post(`${base}/__qa/release-shooting-status-update`);
  const shootingListStatusResponse = await shootingListStatusWrite;
  assert.equal(shootingListStatusResponse.status(), 200, 'the single delayed shooting status update completes successfully after release');
  await shootingListConfirmPage.getByRole('heading', { name: '确认完成', exact: true }).waitFor({ state: 'hidden' });
  assert.equal((await shootingListConfirmPage.request.get(`${base}/__qa/shooting-status-write-count`).then((response) => response.json())).count, 1, 'confirmed completion remains a single write');
  await shootingListConfirmPage.close();

  const emptyDerivedPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  emptyDerivedPage.setDefaultTimeout(10000);
  await emptyDerivedPage.goto(`${base}/__qa?page=shooting&script=empty-derived`);
  await emptyDerivedPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  assert.ok(await emptyDerivedPage.getByText('本地编辑版', { exact: true }).count() >= 1, 'an explicitly blank shooting script remains identified as an independent local version');
  assert.ok(await emptyDerivedPage.getByText('本地衍生自创作 v2', { exact: true }).count() >= 1, 'a linked shooting script identifies its exact source version');
  const shootingSourceTimeText = await emptyDerivedPage.locator('body').innerText();
  assert.match(shootingSourceTimeText, /创作版本时间[\s\S]*08:30/, `shooting detail should show the source-version time, not only the shooting update time: ${shootingSourceTimeText.slice(0, 1800)}`);
  await emptyDerivedPage.getByText('时间轴 1 个节点', { exact: true }).waitFor();
  assert.equal(await emptyDerivedPage.getByText('拍摄用隔离稿件。', { exact: true }).count(), 0, 'an explicitly blank shooting script does not fall back to the approved manuscript');
  await emptyDerivedPage.screenshot({ path: '/tmp/xmt-shooting-source-version-timeline.png', fullPage: false });

  await emptyDerivedPage.goto(`${base}/__qa?page=publishing&script=empty-derived`);
  await emptyDerivedPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  assert.ok(await emptyDerivedPage.getByText('本地编辑版', { exact: true }).count() >= 1, 'an explicitly blank publishing script remains identified as an independent local version');
  assert.ok(await emptyDerivedPage.getByText(/本地衍生自创作 v2/).count() >= 1, 'a linked publishing script identifies its exact source version alongside its source timestamp');
  await emptyDerivedPage.getByText(/创作版本时间.*08:30/).waitFor();
  assert.ok(await emptyDerivedPage.getByText('暂无剧本内容', { exact: true }).count() >= 1, 'an explicitly blank publishing script shows an empty-script state');
  assert.equal(await emptyDerivedPage.getByText('发布用隔离稿件。', { exact: true }).count(), 0, 'an explicitly blank publishing script does not fall back to the approved manuscript');
  await emptyDerivedPage.close();

  const sourceHistoryPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  sourceHistoryPage.setDefaultTimeout(10000);
  sourceHistoryPage.on('pageerror', (error) => errors.push(error.message));
  sourceHistoryPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  let historicalMaterialDraftReads = 0;
  sourceHistoryPage.on('request', (request) => {
    if (request.method() === 'GET' && /\/api\/production-resources\/drafts\/303(?:\?|$)/.test(request.url())) historicalMaterialDraftReads += 1;
  });
  await sourceHistoryPage.goto(`${base}/__qa?page=publishing&script=historical-derived`);
  await sourceHistoryPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await sourceHistoryPage.getByText(/创作版本时间.*12:00/).waitFor();
  await sourceHistoryPage.getByRole('button', { name: '查看引用创作版本 v1.0', exact: true }).click();
  await sourceHistoryPage.waitForURL(/\/production\/303\?version=v1\.0$/);
  await sourceHistoryPage.getByText('历史来源正文测试', { exact: true }).waitFor();
  const sourceMaterialSnapshot = sourceHistoryPage.getByTestId('production-material-history-snapshot');
  await sourceMaterialSnapshot.getByText('v1.0资料快照测试', { exact: true }).waitFor();
  assert.equal(await sourceHistoryPage.getByTestId('production-resources-panel').count(), 0, 'historical versions never fetch or display the current material draft panel');
  await sourceHistoryPage.getByText('初稿创建时引用了选题大纲').waitFor();
  await sourceHistoryPage.getByText('来源版本：v1.2', { exact: true }).waitFor();
  await sourceHistoryPage.getByText('来源版本：v1.2', { exact: true }).scrollIntoViewIfNeeded();
  await sourceHistoryPage.screenshot({ path: '/tmp/xmt-production-origin-version-desktop.png', fullPage: false });
  await sourceHistoryPage.getByText('查看创建时的大纲快照', { exact: true }).click();
  await sourceHistoryPage.getByText('创建时的大纲来源快照测试', { exact: true }).waitFor();
  assert.ok(await sourceHistoryPage.getByText('v1.0', { exact: true }).count() >= 1, 'the source link opens its exact older history version');
  assert.ok(await sourceHistoryPage.getByText('历史版本', { exact: true }).count() >= 1, 'the linked historical version is visible in the version history sidebar');
  assert.equal(await sourceHistoryPage.getByRole('button', { name: '提交审核', exact: true }).count(), 0, 'desktop historical versions do not expose current-version review actions');
  assert.equal(await sourceHistoryPage.getByRole('button', { name: '小修保存', exact: true }).count(), 0, 'desktop historical versions do not expose minor-version writes');
  assert.equal(await sourceHistoryPage.getByRole('button', { name: '另开新版', exact: true }).count(), 0, 'desktop historical versions do not expose major-version writes');
  assert.equal(historicalMaterialDraftReads, 0, 'the publishing source link never requests the current material draft for a historical version');
  await sourceHistoryPage.goto(`${base}/__qa?page=shooting&script=historical-derived`);
  await sourceHistoryPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await sourceHistoryPage.getByRole('button', { name: '展开信息栏', exact: true }).click();
  await sourceHistoryPage.getByRole('button', { name: '收起信息栏', exact: true }).waitFor();
  await sourceHistoryPage.getByRole('button', { name: '查看创作版本 v1.0', exact: true }).click();
  await sourceHistoryPage.waitForURL(/\/production\/303\?version=v1\.0$/);
  await sourceHistoryPage.getByText('历史来源正文测试', { exact: true }).waitFor();
  await sourceHistoryPage.getByTestId('production-material-history-snapshot').getByText('v1.0资料快照测试', { exact: true }).waitFor();
  assert.equal(await sourceHistoryPage.getByTestId('production-resources-panel').count(), 0, 'the shooting source link also opens a read-only historical material snapshot');
  assert.equal(historicalMaterialDraftReads, 0, 'the shooting source link never requests the current material draft for a historical version');
  await sourceHistoryPage.goto(`${base}/production/303?version=v0.9`);
  await sourceHistoryPage.getByText('未记录快照的历史正文', { exact: true }).waitFor();
  await sourceHistoryPage.getByTestId('production-material-history-snapshot').getByText('该历史版本没有材料快照记录', { exact: true }).waitFor();
  assert.equal(await sourceHistoryPage.getByTestId('production-resources-panel').count(), 0, 'legacy history without a captured snapshot never substitutes the current draft');
  await sourceHistoryPage.goto(`${base}/production/303?version=v0.8`);
  await sourceHistoryPage.getByText('空快照历史正文', { exact: true }).waitFor();
  await sourceHistoryPage.getByTestId('production-material-history-snapshot').getByText('该版本保存时资料草稿为空', { exact: true }).waitFor();
  await sourceHistoryPage.close();

  const outlineSourceDesktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  outlineSourceDesktopPage.setDefaultTimeout(10000);
  outlineSourceDesktopPage.on('pageerror', (error) => errors.push(error.message));
  outlineSourceDesktopPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await outlineSourceDesktopPage.goto(`${base}/__qa?page=publishing&script=historical-derived`);
  await outlineSourceDesktopPage.getByRole('button', { name: '查看引用创作版本 v1.0', exact: true }).click();
  await outlineSourceDesktopPage.waitForURL(/\/production\/303\?version=v1\.0$/);
  const outlineSourceLink = outlineSourceDesktopPage.getByRole('link', { name: '查看来源大纲版本', exact: true });
  await outlineSourceLink.waitFor();
  assert.match(await outlineSourceLink.getAttribute('href') || '', /^\/topics\/302\?outlineVersion=v1\.2$/);
  await outlineSourceLink.click();
  await outlineSourceDesktopPage.waitForURL(/\/topics\/302\?outlineVersion=v1\.2$/);
  await outlineSourceDesktopPage.getByText('准确大纲版本正文 v1.2', { exact: true }).waitFor();
  await outlineSourceDesktopPage.getByText('正在查看创作初稿引用的大纲版本 v1.2。', { exact: true }).waitFor();
  assert.equal(await outlineSourceDesktopPage.getByRole('region', { name: '大纲版本历史' }).locator('li').filter({ hasText: 'v1.2' }).locator('details').evaluate((element) => (element as HTMLDetailsElement).open), true, 'the exact outline version from the production source opens expanded');
  assert.equal(await outlineSourceDesktopPage.getByRole('button', { name: '开始创作', exact: true }).count(), 0, 'opening an outline source snapshot does not expose current-topic workflow actions');
  await outlineSourceDesktopPage.screenshot({ path: '/tmp/xmt-outline-source-link-desktop.png', fullPage: false });
  await outlineSourceDesktopPage.goto(`${base}/topics/302?outlineVersion=v0.0`);
  await outlineSourceDesktopPage.getByText('来源大纲版本 v0.0 当前无法定位；没有回退到最新大纲。', { exact: true }).waitFor();
  await outlineSourceDesktopPage.close();

  const mobileSourceHistoryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobileSourceHistoryPage.setDefaultTimeout(10000);
  mobileSourceHistoryPage.on('pageerror', (error) => errors.push(error.message));
  mobileSourceHistoryPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  let mobileHistoricalMaterialDraftReads = 0;
  mobileSourceHistoryPage.on('request', (request) => {
    if (request.method() === 'GET' && /\/api\/production-resources\/drafts\/303(?:\?|$)/.test(request.url())) mobileHistoricalMaterialDraftReads += 1;
  });
  await mobileSourceHistoryPage.goto(`${base}/__qa?page=publishing&script=historical-derived`);
  await mobileSourceHistoryPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await mobileSourceHistoryPage.getByRole('button', { name: '查看引用创作版本 v1.0', exact: true }).click();
  await mobileSourceHistoryPage.waitForURL(/\/production\/303\?version=v1\.0$/);
  await mobileSourceHistoryPage.getByText('历史来源正文测试', { exact: true }).waitFor();
  const mobileMaterialSnapshot = mobileSourceHistoryPage.getByTestId('production-material-history-snapshot');
  await mobileMaterialSnapshot.getByText('v1.0资料快照测试', { exact: true }).waitFor();
  assert.equal(await mobileSourceHistoryPage.getByTestId('production-resources-panel').count(), 0, 'mobile web shows the historical snapshot without mounting the editable current material panel');
  await mobileSourceHistoryPage.getByText('初稿创建时引用了选题大纲').waitFor();
  await mobileSourceHistoryPage.getByText('来源版本：v1.2', { exact: true }).waitFor();
  await mobileSourceHistoryPage.getByText('来源版本：v1.2', { exact: true }).scrollIntoViewIfNeeded();
  await mobileSourceHistoryPage.screenshot({ path: '/tmp/xmt-production-origin-version-mobile.png', fullPage: false });
  await mobileSourceHistoryPage.getByText('查看创建时的大纲快照', { exact: true }).click();
  await mobileSourceHistoryPage.getByText('创建时的大纲来源快照测试', { exact: true }).waitFor();
  assert.equal(await mobileSourceHistoryPage.getByText('当前创作稿测试内容', { exact: true }).count(), 0, 'the mobile source link does not substitute the current manuscript for its historical source');
  assert.ok(await mobileSourceHistoryPage.getByText('历史版本 v1.0 · 只读', { exact: true }).count() >= 1, 'mobile displays the exact historical version as read-only');
  assert.equal(await mobileSourceHistoryPage.getByRole('button', { name: '提交审核', exact: true }).count(), 0, 'mobile historical versions do not expose submit actions');
  await mobileSourceHistoryPage.getByRole('button', { name: '返回当前版本', exact: true }).click();
  await mobileSourceHistoryPage.waitForURL(/\/production\/303$/);
  try {
    await mobileSourceHistoryPage.getByText('当前创作稿测试内容', { exact: true }).waitFor();
  } catch (error) {
    const observed = await mobileSourceHistoryPage.locator('body').innerText().catch(() => '页面正文读取失败');
    const fetched = await mobileSourceHistoryPage.request.get(`${base}/api/workflow/production/303`).then((response) => response.json()).catch(() => null);
    console.error('Return-current diagnostic:', JSON.stringify({ url: mobileSourceHistoryPage.url(), body: observed.slice(0, 2400), production: fetched && { version: fetched.version, content: fetched.content, can_edit: fetched.can_edit }, errors }));
    throw error;
  }
  assert.equal(await mobileSourceHistoryPage.getByText('历史来源正文测试', { exact: true }).count(), 0, 'returning to the current version replaces the historical snapshot explicitly');
  assert.ok(await mobileSourceHistoryPage.getByRole('button', { name: '保存草稿', exact: true }).count() >= 1, 'the current editable version retains its normal editing action after leaving history');
  await mobileSourceHistoryPage.getByRole('button', { name: '返回发布管理', exact: true }).click();
  await mobileSourceHistoryPage.waitForURL(/\/publishing\/501$/);
  await mobileSourceHistoryPage.goto(`${base}/__qa?page=shooting&script=historical-derived`);
  await mobileSourceHistoryPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await mobileSourceHistoryPage.getByRole('region', { name: '创作来源版本' }).waitFor();
  await mobileSourceHistoryPage.screenshot({ path: '/tmp/xmt-shooting-source-card-390.png', fullPage: false });
  await mobileSourceHistoryPage.getByRole('button', { name: '查看创作版本 v1.0', exact: true }).click();
  await mobileSourceHistoryPage.waitForURL(/\/production\/303\?version=v1\.0$/);
  await mobileSourceHistoryPage.getByText('历史来源正文测试', { exact: true }).waitFor();
  await mobileSourceHistoryPage.getByText('历史版本 v1.0 · 只读', { exact: true }).waitFor();
  const mobileShootingMaterialSnapshot = mobileSourceHistoryPage.getByTestId('production-material-history-snapshot');
  await mobileShootingMaterialSnapshot.getByText('v1.0资料快照测试', { exact: true }).waitFor();
  await mobileShootingMaterialSnapshot.scrollIntoViewIfNeeded();
  await mobileSourceHistoryPage.screenshot({ path: '/tmp/xmt-shooting-source-history-390.png', fullPage: false });
  assert.equal(await mobileSourceHistoryPage.getByText('当前创作稿测试内容', { exact: true }).count(), 0, 'the mobile shooting source link does not substitute the current manuscript');
  assert.equal(await mobileSourceHistoryPage.getByRole('button', { name: '保存草稿', exact: true }).count(), 0, 'the mobile historical source remains read-only');
  assert.equal(mobileHistoricalMaterialDraftReads, 0, 'the mobile shooting source link never requests the current material draft');
  await mobileSourceHistoryPage.close();

  const outlineSourceMobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  outlineSourceMobilePage.setDefaultTimeout(10000);
  outlineSourceMobilePage.on('pageerror', (error) => errors.push(error.message));
  outlineSourceMobilePage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await outlineSourceMobilePage.goto(`${base}/__qa?page=publishing&script=historical-derived`);
  await outlineSourceMobilePage.getByRole('button', { name: '查看引用创作版本 v1.0', exact: true }).click();
  await outlineSourceMobilePage.waitForURL(/\/production\/303\?version=v1\.0$/);
  const mobileOutlineSourceLink = outlineSourceMobilePage.getByRole('link', { name: '查看来源大纲版本', exact: true });
  await mobileOutlineSourceLink.waitFor();
  await mobileOutlineSourceLink.scrollIntoViewIfNeeded();
  await outlineSourceMobilePage.setViewportSize({ width: 320, height: 740 });
  const outlineSourceLinkGeometry = await mobileOutlineSourceLink.boundingBox();
  const outlineSourcePageWidth = await outlineSourceMobilePage.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(outlineSourceLinkGeometry && outlineSourceLinkGeometry.x >= 0 && outlineSourceLinkGeometry.x + outlineSourceLinkGeometry.width <= 320, 'the outline source link remains reachable at 320px');
  assert.ok(outlineSourcePageWidth <= 320, `320px source link page does not overflow horizontally (${outlineSourcePageWidth}px)`);
  assert.match(await mobileOutlineSourceLink.getAttribute('href') || '', /^\/topics\/302\?outlineVersion=v1\.2$/);
  await mobileOutlineSourceLink.click();
  await outlineSourceMobilePage.waitForURL(/\/topics\/302\?outlineVersion=v1\.2$/);
  await outlineSourceMobilePage.getByRole('region', { name: '来源大纲版本' }).getByText('准确来源版本：v1.2 · 只读', { exact: true }).waitFor();
  await outlineSourceMobilePage.getByText('准确大纲版本正文 v1.2', { exact: true }).waitFor();
  assert.ok(await outlineSourceMobilePage.evaluate(() => document.documentElement.scrollWidth) <= 320, 'the 320px exact outline snapshot has no horizontal overflow');
  await outlineSourceMobilePage.screenshot({ path: '/tmp/xmt-outline-source-link-320.png', fullPage: false });
  assert.equal(await outlineSourceMobilePage.getByRole('button', { name: '保存修改', exact: true }).count(), 0, 'mobile outline history is read-only');
  assert.equal(await outlineSourceMobilePage.getByRole('button', { name: '进入创作', exact: true }).count(), 0, 'mobile outline history hides current-topic workflow actions');
  await outlineSourceMobilePage.screenshot({ path: '/tmp/xmt-outline-source-link-mobile.png', fullPage: false });
  await outlineSourceMobilePage.goto(`${base}/topics/302?outlineVersion=v0.0`);
  await outlineSourceMobilePage.getByText('来源大纲版本 v0.0 当前无法定位；没有回退到最新大纲。', { exact: true }).waitFor();
  assert.equal(await outlineSourceMobilePage.getByText('当前选题大纲（不是来源历史）', { exact: true }).count(), 0, 'mobile never substitutes the current outline for an unavailable historical source');
  await outlineSourceMobilePage.close();

  const mobileSnapshotEdgePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobileSnapshotEdgePage.setDefaultTimeout(10000);
  await mobileSnapshotEdgePage.goto(`${base}/__qa?page=publishing&script=historical-derived`);
  await mobileSnapshotEdgePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await mobileSnapshotEdgePage.goto(`${base}/production/303?version=v0.9`);
  await mobileSnapshotEdgePage.getByText('未记录快照的历史正文', { exact: true }).waitFor();
  await mobileSnapshotEdgePage.getByTestId('production-material-history-snapshot').getByText('该历史版本没有材料快照记录', { exact: true }).waitFor();
  await mobileSnapshotEdgePage.goto(`${base}/production/303?version=v0.8`);
  await mobileSnapshotEdgePage.getByText('空快照历史正文', { exact: true }).waitFor();
  await mobileSnapshotEdgePage.getByTestId('production-material-history-snapshot').getByText('该版本保存时资料草稿为空', { exact: true }).waitFor();
  await mobileSnapshotEdgePage.close();

  const missingMobileSourcePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  missingMobileSourcePage.setDefaultTimeout(10000);
  missingMobileSourcePage.on('pageerror', (error) => errors.push(error.message));
  missingMobileSourcePage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await missingMobileSourcePage.goto(`${base}/__qa?page=publishing&script=historical-derived`);
  await missingMobileSourcePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await missingMobileSourcePage.goto(`${base}/production/303?version=v0.0`);
  await missingMobileSourcePage.getByText('引用的历史版本 v0.0 不可用；未用当前稿替代。', { exact: true }).waitFor();
  assert.equal(await missingMobileSourcePage.getByText('当前创作稿测试内容', { exact: true }).count(), 0, 'mobile fails closed instead of replacing an unavailable historical source with current content');
  assert.equal(await missingMobileSourcePage.getByRole('button', { name: '保存草稿', exact: true }).count(), 0, 'an unavailable historical source remains non-editable');
  await missingMobileSourcePage.close();

  const missingDesktopSourcePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  missingDesktopSourcePage.setDefaultTimeout(10000);
  missingDesktopSourcePage.on('pageerror', (error) => errors.push(error.stack || error.message));
  missingDesktopSourcePage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await missingDesktopSourcePage.goto(`${base}/__qa?page=publishing&script=historical-derived`);
  await missingDesktopSourcePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await missingDesktopSourcePage.goto(`${base}/production/303?version=v0.0`);
  await missingDesktopSourcePage.getByText('引用的历史版本 v0.0 暂不可用', { exact: true }).waitFor();
  assert.equal(await missingDesktopSourcePage.getByText('当前创作稿测试内容', { exact: true }).count(), 0, 'desktop fails closed instead of replacing an unavailable historical source with the current manuscript');
  assert.equal(await missingDesktopSourcePage.getByRole('button', { name: '提交审核', exact: true }).count(), 0, 'desktop history errors do not offer current-version edit actions');
  await missingDesktopSourcePage.getByRole('button', { name: '返回当前版本', exact: true }).click();
  await missingDesktopSourcePage.waitForURL(/\/production\/303$/);
  try {
    await missingDesktopSourcePage.getByText('当前创作稿测试内容', { exact: true }).waitFor();
  } catch (error) {
    const observed = await missingDesktopSourcePage.locator('body').innerText().catch(() => '页面正文读取失败');
    const fetched = await missingDesktopSourcePage.request.get(`${base}/api/workflow/production/303`).then((response) => response.json()).catch(() => null);
    console.error('Desktop return-current diagnostic:', JSON.stringify({ url: missingDesktopSourcePage.url(), body: observed.slice(0, 2400), production: fetched && { version: fetched.version, content: fetched.content, can_edit: fetched.can_edit }, errors }));
    throw error;
  }
  await missingDesktopSourcePage.close();

  const sourceSavePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  sourceSavePage.setDefaultTimeout(10000);
  const sourceNavigations: string[] = [];
  const sourceHttpFailures: Array<{ path: string; status: number }> = [];
  sourceSavePage.on('framenavigated', (frame) => {
    if (frame === sourceSavePage.mainFrame()) sourceNavigations.push(new URL(frame.url()).pathname);
  });
  sourceSavePage.on('response', (response) => {
    if (response.status() >= 400) sourceHttpFailures.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
  await sourceSavePage.goto(`${base}/__qa?page=shooting&script=source-save`);
  await sourceSavePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  const sourceEditor = sourceSavePage.locator('.ProseMirror').first();
  const sourceSave = sourceSavePage.waitForResponse((response) => response.url().endsWith('/api/workflow/shooting/301') && response.request().method() === 'PUT' && response.status() === 200);
  await sourceEditor.click();
  await sourceSavePage.keyboard.press('End');
  await sourceSavePage.keyboard.type('来源绑定测试');
  await sourceSavePage.getByRole('button', { name: '返回制作列表', exact: true }).click();
  await sourceSave;
  await sourceSavePage.waitForURL('**/shooting');
  await sourceSavePage.getByRole('heading', { name: '成片制作', exact: true }).waitFor();
  const scriptSourceState = await sourceSavePage.request.get(`${base}/__qa/script-source-state`).then((response) => response.json());
  assert.match(scriptSourceState.shooting.script_content, /来源绑定测试/, 'the editor content is persisted');
  assert.equal(scriptSourceState.shooting.script_source_production_id, 303);
  assert.equal(scriptSourceState.shooting.script_source_version, 'v2');
  await sourceSavePage.goto(`${base}/shooting/301`);
  try {
    await sourceSavePage.getByText('本地衍生自创作 v2', { exact: true }).waitFor();
  } catch (error) {
    const observed = await sourceSavePage.locator('body').innerText().catch(() => '页面正文读取失败');
    const fetched = await sourceSavePage.request.get(`${base}/api/workflow/shooting/301`).then((response) => response.json()).catch(() => null);
    const authState = await sourceSavePage.evaluate(() => ({ localTokenPresent: Boolean(localStorage.getItem('xmt_token')), sessionTokenPresent: Boolean(sessionStorage.getItem('xmt_token')), localUserPresent: Boolean(localStorage.getItem('xmt_user')), sessionUserPresent: Boolean(sessionStorage.getItem('xmt_user')) }));
    console.error('Source label diagnostic:', JSON.stringify({ url: sourceSavePage.url(), body: observed.slice(0, 2400), authState, sourceNavigations, sourceHttpFailures, shooting: fetched && { script_content: fetched.script_content, script_source_production_id: fetched.script_source_production_id, script_source_version: fetched.script_source_version } }));
    throw error;
  }
  await sourceSavePage.close();

  const materialLineagePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  materialLineagePage.setDefaultTimeout(10000);
  materialLineagePage.on('pageerror', (error) => errors.push(error.message));
  materialLineagePage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await materialLineagePage.goto(`${base}/__qa?script=historical-derived`);
  await materialLineagePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await materialLineagePage.goto(`${base}/production/303`);
  const materialLineagePanel = materialLineagePage.getByTestId('production-resources-panel');
  await materialLineagePanel.getByRole('heading', { name: '创作资料', exact: true }).waitFor();
  await materialLineagePanel.getByText('这是独立保存的资料草稿，不会自动修改正式正文；“加入草稿”和“引用到正文”是两项独立操作。原资料更新或移入回收站后，已复制内容仍会保留；回收的资料可能无法打开。', { exact: true }).waitFor();
  assert.ok(await materialLineagePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the clarified material-draft panel fits its desktop viewport');
  await materialLineagePanel.getByRole('button', { name: '添加资料', exact: true }).click();
  await materialLineagePage.getByPlaceholder('搜索资料标题或正文').fill('隔离引用资料');
  await materialLineagePage.getByRole('button', { name: '搜索', exact: true }).click();
  const materialSource = materialLineagePage.getByRole('button', { name: /隔离引用资料/ });
  await materialSource.waitFor();
  await materialSource.click();
  const draftInsert = materialLineagePage.getByRole('button', { name: /加入资料草稿/ });
  const savedMaterialResponse = materialLineagePage.waitForResponse((response) => response.url().endsWith('/api/productions/303/material-draft') && response.request().method() === 'PUT' && response.status() === 200);
  await draftInsert.click();
  await savedMaterialResponse;
  await materialLineagePanel.getByText('已保存', { exact: true }).waitFor();
  assert.match(materialDraftHtml, /只供自动化验证的资料正文/);
  assert.match(materialDraftHtml, /href="\/asset-center\/resources\/9301"/);
  assert.match(materialDraftHtml, /来源：隔离引用资料/);
  assert.equal(productionContentWriteCount, 0, 'adding reference material to its scratchpad never writes the formal manuscript');
  await materialLineagePage.getByRole('button', { name: '添加资料', exact: true }).click();
  await materialLineagePage.getByPlaceholder('搜索资料标题或正文').fill('隔离引用资料');
  await materialLineagePage.getByRole('button', { name: '搜索', exact: true }).click();
  await materialLineagePage.getByText('已加入资料草稿', { exact: true }).waitFor();
  assert.equal(productionContentWriteCount, 0, 'checking source usage remains read-only');
  await materialLineagePage.screenshot({ path: '/tmp/xmt-material-source-lineage-desktop.png', fullPage: false });
  await materialLineagePage.close();

  const materialScopePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  materialScopePage.setDefaultTimeout(10000);
  materialScopePage.on('pageerror', (error) => errors.push(error.message));
  materialScopePage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await materialScopePage.goto(`${base}/__qa?script=historical-derived`);
  await materialScopePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await materialScopePage.goto(`${base}/production/304`);
  await materialScopePage.getByRole('heading', { name: '第二条隔离生产记录' }).waitFor();
  await materialScopePage.getByText('创建时没有可唯一对应的显式大纲版本，快照保留但不推断版本号。', { exact: true }).waitFor();
  await materialScopePage.request.post(`${base}/__qa/delay-next-production-303-read`);
  await materialScopePage.evaluate(() => {
    window.history.pushState({}, '', '/production/303');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await materialScopePage.waitForFunction(async () => (await (await fetch('/__qa/material-draft-state')).json()).pendingOldProductionRead);
  await materialScopePage.evaluate(() => {
    window.history.pushState({}, '', '/production/304');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await materialScopePage.getByRole('heading', { name: '第二条隔离生产记录' }).waitFor();
  await materialScopePage.request.post(`${base}/__qa/release-production-303-read`);
  await materialScopePage.waitForTimeout(200);
  assert.equal(await materialScopePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).count(), 0, 'a late parent-detail response for the previous production cannot replace the current route');

  await materialScopePage.request.post(`${base}/__qa/enable-production-303-history-pagination`);
  await materialScopePage.request.post(`${base}/__qa/delay-next-production-303-history-page`);
  await materialScopePage.evaluate(() => {
    window.history.pushState({}, '', '/production/303');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await materialScopePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await materialScopePage.getByRole('button', { name: '查看更多历史版本' }).click();
  await materialScopePage.waitForFunction(async () => (await (await fetch('/__qa/material-draft-state')).json()).pendingOldHistoryRead);
  await materialScopePage.evaluate(() => {
    window.history.pushState({}, '', '/production/304');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await materialScopePage.getByRole('heading', { name: '第二条隔离生产记录' }).waitFor();
  await materialScopePage.request.post(`${base}/__qa/release-production-303-history-page`);
  await materialScopePage.waitForTimeout(200);
  assert.equal(await materialScopePage.getByText('旧记录分页操作者', { exact: true }).count(), 0, 'a late history page for the previous production cannot append to the current route');

  await materialScopePage.request.post(`${base}/__qa/delay-next-material-draft-303`);
  await materialScopePage.evaluate(() => {
    window.history.pushState({}, '', '/production/303');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await materialScopePage.waitForFunction(async () => (await (await fetch('/__qa/material-draft-state')).json()).pendingOldRead);
  await materialScopePage.evaluate(() => {
    window.history.pushState({}, '', '/production/304');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await materialScopePage.getByRole('heading', { name: '第二条隔离生产记录' }).waitFor();
  let scopedMaterialPanel = materialScopePage.getByTestId('production-resources-panel');
  await scopedMaterialPanel.getByText('第二条资料草稿', { exact: true }).waitFor();
  await materialScopePage.request.post(`${base}/__qa/release-old-material-draft`);
  await scopedMaterialPanel.getByText('第二条资料草稿', { exact: true }).waitFor();
  assert.equal(await scopedMaterialPanel.getByText('第一条资料草稿的旧延迟响应', { exact: true }).count(), 0, 'a late response for the previous production cannot replace the newly selected material draft');

  await materialScopePage.evaluate(() => {
    window.history.pushState({}, '', '/production/303');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await materialScopePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  scopedMaterialPanel = materialScopePage.getByTestId('production-resources-panel');
  try {
    await scopedMaterialPanel.getByText('第一条资料草稿的旧延迟响应', { exact: true }).waitFor();
  } catch (error) {
    const state = await materialScopePage.request.get(`${base}/__qa/material-draft-state`).then((response) => response.json());
    const body = await materialScopePage.locator('body').innerText().catch(() => '页面正文读取失败');
    console.error('Material scope diagnostic:', JSON.stringify({ url: materialScopePage.url(), state, body: body.slice(0, 2400) }));
    throw error;
  }
  await scopedMaterialPanel.locator('.ProseMirror[contenteditable="true"]').waitFor();
  await scopedMaterialPanel.locator('.ProseMirror[contenteditable="true"]').fill('切换前待保存的旧记录资料草稿');
  const oldScopeSave = materialScopePage.waitForResponse((response) => response.url().endsWith('/api/productions/303/material-draft') && response.request().method() === 'PUT' && response.status() === 200);
  await materialScopePage.evaluate(() => {
    window.history.pushState({}, '', '/production/304');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await oldScopeSave;
  await materialScopePage.getByRole('heading', { name: '第二条隔离生产记录' }).waitFor();
  scopedMaterialPanel = materialScopePage.getByTestId('production-resources-panel');
  await scopedMaterialPanel.getByText('第二条资料草稿', { exact: true }).waitFor();
  const materialScopeState = await materialScopePage.request.get(`${base}/__qa/material-draft-state`).then((response) => response.json());
  assert.ok(materialScopeState.writes.some((write: { productionId: number; contentHtml: string }) => write.productionId === 303 && write.contentHtml.includes('切换前待保存的旧记录资料草稿')), 'an unsaved draft is flushed to its original production before the next production is shown');
  assert.ok(materialScopeState.writes.every((write: { productionId: number }) => write.productionId !== 304), 'switching production never writes the previous draft into the new production');
  assert.equal(await scopedMaterialPanel.getByText('切换前待保存的旧记录资料草稿', { exact: true }).count(), 0, 'the previous draft text is isolated from the newly selected production');

  await materialScopePage.request.post(`${base}/__qa/delay-next-material-source-insertion`);
  await materialScopePage.evaluate(() => {
    window.history.pushState({}, '', '/production/303');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await materialScopePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  scopedMaterialPanel = materialScopePage.getByTestId('production-resources-panel');
  await scopedMaterialPanel.getByRole('button', { name: '添加资料', exact: true }).click();
  await materialScopePage.getByPlaceholder('搜索资料标题或正文').fill('隔离引用资料');
  await materialScopePage.getByRole('button', { name: '搜索', exact: true }).click();
  await materialScopePage.getByRole('button', { name: /隔离引用资料/ }).waitFor();
  await materialScopePage.getByRole('button', { name: /隔离引用资料/ }).click();
  await materialScopePage.getByRole('button', { name: '引用到正文', exact: true }).click();
  await materialScopePage.waitForFunction(async () => (await (await fetch('/__qa/material-draft-state')).json()).pendingOldSourceInsertion);
  await materialScopePage.evaluate(() => {
    window.history.pushState({}, '', '/production/304');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await materialScopePage.getByRole('heading', { name: '第二条隔离生产记录' }).waitFor();
  await materialScopePage.request.post(`${base}/__qa/release-material-source-insertion`);
  await materialScopePage.waitForTimeout(900);
  assert.equal(await materialScopePage.locator('.ProseMirror').filter({ hasText: '隔离引用资料' }).count(), 0, 'a source lookup that finishes after navigation cannot insert into the newly selected manuscript');
  assert.equal(productionContentWriteCount, 0, 'a late source lookup cannot trigger a write to the newly selected manuscript');
  await materialScopePage.screenshot({ path: '/tmp/xmt-production-material-scope-isolation.png', fullPage: false });
  await materialScopePage.close();

  const shootingDuplicateSavePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  shootingDuplicateSavePage.setDefaultTimeout(10000);
  shootingDuplicateSavePage.on('pageerror', (error) => errors.push(error.message));
  await shootingDuplicateSavePage.goto(`${base}/__qa?page=shooting`);
  await shootingDuplicateSavePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await shootingDuplicateSavePage.locator('.ProseMirror').first().waitFor();
  const shootingWriteCountBeforeDuplicate = await shootingDuplicateSavePage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json()).then((state) => state.shootingScriptWriteCount);
  const shootingVersionCountBeforeDuplicate = await shootingDuplicateSavePage.request.get(`${base}/__qa/workflow-version-state`).then((response) => response.json()).then((state) => state.shooting.length);
  await shootingDuplicateSavePage.request.post(`${base}/__qa/delay-next-shooting-script-save`);
  await shootingDuplicateSavePage.evaluate(() => {
    const saveButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === '小版本保存');
    if (!saveButton) throw new Error('找不到小版本保存按钮');
    saveButton.click();
    saveButton.click();
  });
  await shootingDuplicateSavePage.waitForFunction(async () => (await (await fetch('/__qa/workflow-version-state')).json()).shootingSaveStarted);
  const shootingWritesWhileSaving = await shootingDuplicateSavePage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json()).then((state) => state.shootingScriptWriteCount);
  assert.equal(shootingWritesWhileSaving - shootingWriteCountBeforeDuplicate, 1, 'same-task double activation starts only one shooting script write');
  await shootingDuplicateSavePage.request.post(`${base}/__qa/release-shooting-script-save`);
  await shootingDuplicateSavePage.getByText('v1.0 · 小版本', { exact: true }).waitFor();
  const finalShootingDuplicateState = await shootingDuplicateSavePage.request.get(`${base}/__qa/workflow-version-state`).then((response) => response.json());
  const finalShootingDuplicateWriteCount = await shootingDuplicateSavePage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json()).then((state) => state.shootingScriptWriteCount);
  assert.equal(finalShootingDuplicateWriteCount - shootingWriteCountBeforeDuplicate, 1, 'only one shooting script write is confirmed');
  assert.equal(finalShootingDuplicateState.shooting.length - shootingVersionCountBeforeDuplicate, 1, 'same-task double activation creates exactly one shooting version');
  await shootingDuplicateSavePage.close();

  const publishingDuplicateSavePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  publishingDuplicateSavePage.setDefaultTimeout(10000);
  publishingDuplicateSavePage.on('pageerror', (error) => errors.push(error.message));
  await publishingDuplicateSavePage.goto(`${base}/__qa?page=publishing`);
  await publishingDuplicateSavePage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await publishingDuplicateSavePage.getByRole('button', { name: '编辑剧本', exact: true }).click();
  const duplicatePublishingEditor = publishingDuplicateSavePage.locator('.ProseMirror').first();
  await duplicatePublishingEditor.click();
  await publishingDuplicateSavePage.keyboard.press('Control+A');
  await publishingDuplicateSavePage.keyboard.type('重复提交隔离发布稿');
  const publishingWriteCountBeforeDuplicate = await publishingDuplicateSavePage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json()).then((state) => state.publishingScriptWriteCount);
  const publishingVersionCountBeforeDuplicate = await publishingDuplicateSavePage.request.get(`${base}/__qa/workflow-version-state`).then((response) => response.json()).then((state) => state.publishing.length);
  await publishingDuplicateSavePage.request.post(`${base}/__qa/delay-next-publishing-script-save`);
  await publishingDuplicateSavePage.evaluate(() => {
    const saveButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === '小版本保存');
    if (!saveButton) throw new Error('找不到小版本保存按钮');
    saveButton.click();
    saveButton.click();
  });
  await publishingDuplicateSavePage.waitForFunction(async () => (await (await fetch('/__qa/workflow-version-state')).json()).publishingSaveStarted);
  const publishingWritesWhileSaving = await publishingDuplicateSavePage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json()).then((state) => state.publishingScriptWriteCount);
  assert.equal(publishingWritesWhileSaving - publishingWriteCountBeforeDuplicate, 1, 'same-task double activation starts only one publishing script write');
  await publishingDuplicateSavePage.request.post(`${base}/__qa/release-publishing-script-save`);
  await publishingDuplicateSavePage.getByText('v1.0 · 小版本', { exact: true }).waitFor();
  const finalPublishingDuplicateState = await publishingDuplicateSavePage.request.get(`${base}/__qa/workflow-version-state`).then((response) => response.json());
  const finalPublishingDuplicateWriteCount = await publishingDuplicateSavePage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json()).then((state) => state.publishingScriptWriteCount);
  assert.equal(finalPublishingDuplicateWriteCount - publishingWriteCountBeforeDuplicate, 1, 'only one publishing script write is confirmed');
  assert.equal(finalPublishingDuplicateState.publishing.length - publishingVersionCountBeforeDuplicate, 1, 'same-task double activation creates exactly one publishing version');
  await publishingDuplicateSavePage.close();

  const publishingCommitRecoveryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  publishingCommitRecoveryPage.setDefaultTimeout(10000);
  publishingCommitRecoveryPage.on('pageerror', (error) => errors.push(error.message));
  await publishingCommitRecoveryPage.goto(`${base}/__qa?page=publishing&scriptSave=commit-read-fail`);
  await publishingCommitRecoveryPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await publishingCommitRecoveryPage.getByRole('button', { name: '编辑剧本', exact: true }).click();
  const committedPublishingDraft = publishingCommitRecoveryPage.locator('.ProseMirror').first();
  await committedPublishingDraft.click();
  await publishingCommitRecoveryPage.keyboard.press('Control+A');
  await publishingCommitRecoveryPage.keyboard.type('已提交但响应丢失的发布剧本');
  await publishingCommitRecoveryPage.getByRole('button', { name: '小版本保存', exact: true }).click();
  const pendingPublishingScriptRecovery = publishingCommitRecoveryPage.getByRole('alert').filter({ hasText: '剧本保存结果尚未确认' });
  await pendingPublishingScriptRecovery.waitFor();
  assert.equal(await publishingCommitRecoveryPage.getByRole('button', { name: '小版本保存', exact: true }).isDisabled(), true, 'a publishing version write stays locked while its result is unknown');
  const committedPublishingState = await publishingCommitRecoveryPage.request.get(`${base}/__qa/publishing-script-save-state`).then((response) => response.json());
  assert.equal(committedPublishingState.publishingVersions.filter((entry: { is_baseline: number }) => entry.is_baseline !== 1).length, 1, 'the ambiguous server commit produced exactly one explicit version');
  await publishingCommitRecoveryPage.reload();
  await publishingCommitRecoveryPage.getByText('版本保存结果已核实', { exact: true }).waitFor();
  await publishingCommitRecoveryPage.getByText('v1.0 · 小版本', { exact: true }).waitFor();
  const recoveredPublishingState = await publishingCommitRecoveryPage.request.get(`${base}/__qa/publishing-script-save-state`).then((response) => response.json());
  assert.equal(recoveredPublishingState.publishingScriptWriteCount, committedPublishingState.publishingScriptWriteCount, 'refresh recovery verifies a committed publishing script without another PUT');
  assert.equal(recoveredPublishingState.publishingVersions.filter((entry: { is_baseline: number }) => entry.is_baseline !== 1).length, 1, 'refresh recovery does not create a duplicate publishing version');
  assert.equal(await publishingCommitRecoveryPage.evaluate(() => sessionStorage.getItem('xmt:publishing-script-save-pending:v1:user:91:publishing:501')), null, 'confirmed publishing script recovery clears its session marker');
  assert.ok(await publishingCommitRecoveryPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'publishing script recovery alert fits a 390px viewport');
  await publishingCommitRecoveryPage.close();

  const publishingUnchangedRecoveryPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  publishingUnchangedRecoveryPage.setDefaultTimeout(10000);
  publishingUnchangedRecoveryPage.on('pageerror', (error) => errors.push(error.message));
  await publishingUnchangedRecoveryPage.goto(`${base}/__qa?page=publishing&scriptSave=no-commit`);
  await publishingUnchangedRecoveryPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
  await publishingUnchangedRecoveryPage.getByRole('button', { name: '编辑剧本', exact: true }).click();
  const unchangedPublishingDraft = publishingUnchangedRecoveryPage.locator('.ProseMirror').first();
  await unchangedPublishingDraft.click();
  await publishingUnchangedRecoveryPage.keyboard.press('Control+A');
  await publishingUnchangedRecoveryPage.keyboard.type('尚未提交但要保留的发布剧本');
  await publishingUnchangedRecoveryPage.getByRole('button', { name: '小版本保存', exact: true }).click();
  await publishingUnchangedRecoveryPage.getByText('剧本尚未保存', { exact: true }).waitFor();
  const unchangedPublishingState = await publishingUnchangedRecoveryPage.request.get(`${base}/__qa/publishing-script-save-state`).then((response) => response.json());
  assert.equal(unchangedPublishingState.publishingVersions.length, 0, 'a failed publishing script save does not create a version');
  assert.equal(await publishingUnchangedRecoveryPage.getByRole('button', { name: '小版本保存', exact: true }).isDisabled(), false, 'the restored publishing draft allows an explicit user retry');
  assert.equal(await publishingUnchangedRecoveryPage.locator('.ProseMirror').first().innerText(), '尚未提交但要保留的发布剧本', 'the exact publishing script draft is retained for review');
  await publishingUnchangedRecoveryPage.getByRole('button', { name: '小版本保存', exact: true }).click();
  await publishingUnchangedRecoveryPage.getByText('v1.0 · 小版本', { exact: true }).waitFor();
  const retriedPublishingState = await publishingUnchangedRecoveryPage.request.get(`${base}/__qa/publishing-script-save-state`).then((response) => response.json());
  assert.equal(retriedPublishingState.publishingVersions.filter((entry: { is_baseline: number }) => entry.is_baseline !== 1).length, 1, 'only the explicit user retry creates the publishing version');
  assert.equal(retriedPublishingState.publishingScriptWriteCount, unchangedPublishingState.publishingScriptWriteCount + 1, 'the user-triggered retry sends exactly one additional PUT');
  await publishingUnchangedRecoveryPage.close();

  for (const stage of ['shooting', 'publishing'] as const) {
    const archiveRetryPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    archiveRetryPage.setDefaultTimeout(10000);
    archiveRetryPage.on('pageerror', (error) => errors.push(error.message));
    await archiveRetryPage.goto(`${base}/__qa?page=${stage}&archive=pending`);
    await archiveRetryPage.getByRole('heading', { name: '城市早餐探店拍摄计划' }).waitFor();
    const statusText = stage === 'shooting' ? '成片剧本已保存，但发布归档尚未更新' : '发布剧本已保存，但发布归档尚未更新';
    const archiveStatus = archiveRetryPage.getByRole('status').filter({ hasText: statusText });
    await archiveStatus.waitFor();
    const archiveRetryCountBeforeDuplicate = await archiveRetryPage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json()).then((state) => state.archiveSyncRetryCount);
    await archiveRetryPage.request.post(`${base}/__qa/delay-next-archive-sync-retry/${stage}`);
    await archiveRetryPage.evaluate(() => {
      const retryButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === '重试同步归档');
      if (!retryButton) throw new Error('找不到重试同步归档按钮');
      retryButton.click();
      retryButton.click();
    });
    await archiveRetryPage.waitForFunction(async () => (await (await fetch('/__qa/archive-write-state')).json()).archiveSyncRetryStarted);
    await archiveRetryPage.waitForTimeout(100);
    const retriesWhileHeld = await archiveRetryPage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json()).then((state) => state.archiveSyncRetryCount);
    assert.equal(retriesWhileHeld - archiveRetryCountBeforeDuplicate, 1, `${stage} same-task double activation starts only one archive retry`);
    const failedArchiveRetryResponse = archiveRetryPage.waitForResponse((response) => response.url().endsWith(`/api/workflow/${stage}/${stage === 'shooting' ? 301 : 501}/archive-sync`) && response.request().method() === 'POST' && response.status() === 503);
    await archiveRetryPage.request.post(`${base}/__qa/release-archive-sync-retry`);
    await failedArchiveRetryResponse;
    await archiveStatus.waitFor();
    const explicitRetryResponse = archiveRetryPage.waitForResponse((response) => response.url().endsWith(`/api/workflow/${stage}/${stage === 'shooting' ? 301 : 501}/archive-sync`) && response.request().method() === 'POST' && response.status() === 200);
    await archiveStatus.getByRole('button', { name: '重试同步归档', exact: true }).click();
    await explicitRetryResponse;
    await archiveStatus.waitFor({ state: 'hidden' });
    const finalArchiveRetryCount = await archiveRetryPage.request.get(`${base}/__qa/archive-write-state`).then((response) => response.json()).then((state) => state.archiveSyncRetryCount);
    assert.equal(finalArchiveRetryCount - archiveRetryCountBeforeDuplicate, 2, `${stage} has only the held failure and one explicit recovery retry`);
    await archiveRetryPage.close();
  }

  assert.equal(expectedVersionHistoryFailures.length, 2, 'only the two deliberately injected version-history 503 responses are expected');
  assert.equal(expectedVersionHistoryConsoleErrors, 2, 'only the two known version-history 503 browser resource errors are expected');
  assert.deepEqual(errors, [], 'shooting and publishing detail pages render without unexpected browser errors');
  console.log('Workflow detail responsive browser test passed: archive-sync partial-save feedback and retry, light/dark workflow contrast, desktop/320/390px detail actions, exact history routing, and stale route/material requests cannot cross production scopes.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
