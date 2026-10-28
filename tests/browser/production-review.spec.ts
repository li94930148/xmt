import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as Y from 'yjs';
import { productionStatusLabel } from '../../src/components/production/productionStatusLabel';
import { COLLABORATOR_COLORS } from '../../src/collaboration/core/collaboratorColors';

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
let fixturePermissions: string[] = [];
let productionCanEdit = true;
let exposeHistoryFixture = false;
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
  const value = raw.trim();
  if (value.startsWith('color(srgb ')) {
    const channels = value.match(/[\d.]+/g)?.map(Number) || [];
    return channels.length >= 3
      ? { rgb: channels.slice(0, 3).map((channel) => channel * 255), alpha: channels[3] ?? 1 }
      : null;
  }
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
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
async function setViewportAtBrowserZoom(
  page: import('playwright').Page,
  physicalViewport: { width: number; height: number },
  zoom: number,
) {
  // Browser zoom reduces the CSS layout viewport; keep the physical viewport fixed and emulate that reflow.
  const effectiveViewport = {
    width: Math.round(physicalViewport.width / zoom),
    height: Math.round(physicalViewport.height / zoom),
  };
  await page.setViewportSize(effectiveViewport);
  const actualViewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  assert.deepEqual(actualViewport, effectiveViewport, `browser zoom ${zoom * 100}% uses the equivalent CSS layout viewport for ${physicalViewport.width}x${physicalViewport.height}`);
  return effectiveViewport;
}

async function assertMinimumTapTarget(button: import('playwright').Locator, label: string) {
  const size = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert.ok(size.width >= 40 && size.height >= 40, `${label} is at least 40x40px: ${JSON.stringify(size)}`);
}
const savedContents: string[] = [];
const threads: Array<Record<string, unknown> & { id: number; replies: Array<Record<string, unknown>> }> = [];
let nextThreadId = 1;
let nextReplyId = 1;
let content = '<p>第一段文字需要审阅。</p>';
let productionStatus = 'draft';
let productionVersion = 'v1.0';
let productionDetailReadAttempts = 0;
let failNextProductionDetailRead = false;
let productionDetailReadGate: Promise<void> | null = null;
let releaseProductionDetailRead: (() => void) | null = null;
let productionHistoryReadAttempts = 0;
let failNextProductionHistoryRead = false;
let productionSaveAttempts = 0;
let productionSaveFailuresRemaining = 0;
let productionReviewAttempts = 0;
let productionReviewRequestContent = '';
let failNextProductionReview = false;
let failNextProductionReviewAfterCommit = false;
let failNextProductionStatusAfterCommit = false;
let productionReviewGate: Promise<void> | null = null;
let releaseProductionReview: (() => void) | null = null;
let productionSaveGate: Promise<void> | null = null;
let releaseProductionSave: (() => void) | null = null;
let reviewThreadCreateAttempts = 0;
let failNextReviewThreadCreate = false;
let failNextReviewThreadCreateAfterCommit = false;
let failNextReviewThreadStatusRead = false;
let reviewThreadStatusReadAttempts = 0;
const reviewThreadRequestIds: string[] = [];
let reviewThreadCreateGate: Promise<void> | null = null;
let releaseReviewThreadCreate: (() => void) | null = null;
const reviewThreadRequests = new Map<string, { actorId: number; productionId: number; threadId: number; fingerprint: string }>();
let reviewReplyAttempts = 0;
let reviewReplyStatusReadAttempts = 0;
const reviewReplyRequestIds: string[] = [];
let failNextReviewReply = false;
let failNextReviewReplyAfterCommit = false;
let failNextReviewReplyStatusRead = false;
let reviewReplyGate: Promise<void> | null = null;
let releaseReviewReply: (() => void) | null = null;
const reviewReplyRequests = new Map<string, { actorId: number; productionId: number; threadId: number; replyId: number; content: string }>();
let reviewStatusAttempts = 0;
let reviewStatusStatusReadAttempts = 0;
let failNextReviewStatusAfterCommit = false;
let failNextReviewStatusStatusRead = false;
const reviewStatusRequestIds: string[] = [];
const reviewStatusRequests = new Map<string, { actorId: number; productionId: number; threadId: number; status: 'resolved' | 'accepted' | 'rejected' }>();
let productionStatusUpdateAttempts = 0;
let productionStatusUpdateContent = '';
let productionVersionSaveAttempts = 0;
let productionVersionSaveContent = '';
let failNextProductionVersionSave = false;
let failNextProductionVersionAfterCommit = false;
let productionDeleteAttempts = 0;
let productionExists = true;
let failNextProductionDelete = false;
let failNextProductionDeleteAfterCommit = false;
let shootingListReadAttempts = 0;
let topicListReadAttempts = 0;
let topicDetailReadAttempts = 0;
let apiMutationAttempts = 0;
let collaborationUpdatesToReject = 0;
let collaborationUpdateCount = 0;
let rejectedCollaborationUpdateCount = 0;
let exposeCollaboratorColorFixture = false;
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
app.use('/api', (req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) apiMutationAttempts += 1;
  next();
});
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','review-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/production/content/${productionId}');</script>`);
});
app.get('/__qa/state', (_req, res) => res.json({ content, savedContents, threads, productionStatus, productionVersion, productionDetailReadAttempts, productionHistoryReadAttempts, productionSaveAttempts, productionReviewAttempts, productionReviewRequestContent, reviewThreadCreateAttempts, reviewThreadStatusReadAttempts, reviewThreadRequestIds, reviewReplyAttempts, reviewReplyStatusReadAttempts, reviewReplyRequestIds, reviewStatusAttempts, reviewStatusStatusReadAttempts, reviewStatusRequestIds, productionStatusUpdateAttempts, productionStatusUpdateContent, productionVersionSaveAttempts, productionVersionSaveContent, productionDeleteAttempts, productionExists, shootingListReadAttempts, topicListReadAttempts, topicDetailReadAttempts, apiMutationAttempts, collaborationUpdateCount, rejectedCollaborationUpdateCount }));
app.post('/__qa/reset-review-fixture', (_req, res) => {
  user.role = 'admin';
  fixturePermissions = [];
  productionCanEdit = true;
  exposeHistoryFixture = false;
  content = '<p>第一段文字需要审阅。</p>';
  productionStatus = 'draft';
  productionVersion = 'v1.0';
  productionDetailReadAttempts = 0;
  failNextProductionDetailRead = false;
  releaseProductionDetailRead?.();
  releaseProductionDetailRead = null;
  productionDetailReadGate = null;
  productionHistoryReadAttempts = 0;
  failNextProductionHistoryRead = false;
  productionSaveAttempts = 0;
  productionSaveFailuresRemaining = 0;
  productionReviewAttempts = 0;
  productionReviewRequestContent = '';
  failNextProductionReview = false;
  failNextProductionReviewAfterCommit = false;
  failNextProductionStatusAfterCommit = false;
  releaseProductionReview?.();
  releaseProductionReview = null;
  productionReviewGate = null;
  releaseProductionSave?.();
  releaseProductionSave = null;
  productionSaveGate = null;
  reviewThreadCreateAttempts = 0;
  failNextReviewThreadCreate = false;
  failNextReviewThreadCreateAfterCommit = false;
  failNextReviewThreadStatusRead = false;
  reviewThreadStatusReadAttempts = 0;
  reviewThreadRequestIds.length = 0;
  releaseReviewThreadCreate?.();
  releaseReviewThreadCreate = null;
  reviewThreadCreateGate = null;
  reviewReplyAttempts = 0;
  reviewReplyStatusReadAttempts = 0;
  reviewReplyRequestIds.length = 0;
  failNextReviewReply = false;
  failNextReviewReplyAfterCommit = false;
  failNextReviewReplyStatusRead = false;
  reviewStatusAttempts = 0;
  reviewStatusStatusReadAttempts = 0;
  failNextReviewStatusAfterCommit = false;
  failNextReviewStatusStatusRead = false;
  reviewStatusRequestIds.length = 0;
  releaseReviewReply?.();
  releaseReviewReply = null;
  reviewReplyGate = null;
  productionStatusUpdateAttempts = 0;
  productionStatusUpdateContent = '';
  productionVersionSaveAttempts = 0;
  productionVersionSaveContent = '';
  failNextProductionVersionSave = false;
  failNextProductionVersionAfterCommit = false;
  productionDeleteAttempts = 0;
  productionExists = true;
  failNextProductionDelete = false;
  failNextProductionDeleteAfterCommit = false;
  shootingListReadAttempts = 0;
  topicListReadAttempts = 0;
  topicDetailReadAttempts = 0;
  apiMutationAttempts = 0;
  savedContents.length = 0;
  threads.length = 0;
  reviewThreadRequests.clear();
  reviewReplyRequests.clear();
  reviewStatusRequests.clear();
  nextThreadId = 1;
  nextReplyId = 1;
  return res.json({ ok: true });
});
app.post('/__qa/set-readonly-mode/:mode', (req, res) => {
  user.role = 'director';
  fixturePermissions = req.params.mode === 'missing-update' ? ['production:view'] : ['production:view', 'production:update'];
  productionCanEdit = req.params.mode !== 'outside-scope';
  exposeHistoryFixture = req.params.mode === 'history';
  if (exposeHistoryFixture) productionVersion = 'v2.0';
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-detail-read', (_req, res) => {
  failNextProductionDetailRead = true;
  return res.json({ ok: true });
});
app.post('/__qa/hold-next-production-detail-read', (_req, res) => {
  productionDetailReadGate = new Promise<void>((resolve) => { releaseProductionDetailRead = resolve; });
  return res.json({ ok: true });
});
app.post('/__qa/release-production-detail-read', (_req, res) => {
  releaseProductionDetailRead?.();
  releaseProductionDetailRead = null;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-history-read', (_req, res) => {
  failNextProductionHistoryRead = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-saves', (_req, res) => {
  productionSaveFailuresRemaining = 2;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-version-save', (_req, res) => {
  failNextProductionVersionSave = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-version-after-commit', (_req, res) => {
  failNextProductionVersionAfterCommit = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-delete', (_req, res) => {
  failNextProductionDelete = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-delete-after-commit', (_req, res) => {
  failNextProductionDeleteAfterCommit = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-review', (_req, res) => {
  failNextProductionReview = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-review-after-commit', (_req, res) => {
  failNextProductionReviewAfterCommit = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-production-status-after-commit', (_req, res) => {
  failNextProductionStatusAfterCommit = true;
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
app.post('/__qa/fail-next-review-thread-create', (_req, res) => {
  failNextReviewThreadCreate = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-review-thread-create-after-commit', (_req, res) => {
  failNextReviewThreadCreateAfterCommit = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-review-thread-status-read', (_req, res) => {
  failNextReviewThreadStatusRead = true;
  return res.json({ ok: true });
});
app.post('/__qa/hold-next-review-thread-create', (_req, res) => {
  reviewThreadCreateGate = new Promise<void>((resolve) => { releaseReviewThreadCreate = resolve; });
  return res.json({ ok: true });
});
app.post('/__qa/release-review-thread-create', (_req, res) => {
  releaseReviewThreadCreate?.();
  releaseReviewThreadCreate = null;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-review-reply', (_req, res) => {
  failNextReviewReply = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-review-reply-after-commit', (_req, res) => {
  failNextReviewReplyAfterCommit = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-review-reply-status-read', (_req, res) => {
  failNextReviewReplyStatusRead = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-review-status-after-commit', (_req, res) => {
  failNextReviewStatusAfterCommit = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-review-status-status-read', (_req, res) => {
  failNextReviewStatusStatusRead = true;
  return res.json({ ok: true });
});
app.post('/__qa/hold-next-review-reply', (_req, res) => {
  reviewReplyGate = new Promise<void>((resolve) => { releaseReviewReply = resolve; });
  return res.json({ ok: true });
});
app.post('/__qa/release-review-reply', (_req, res) => {
  releaseReviewReply?.();
  releaseReviewReply = null;
  return res.json({ ok: true });
});
app.post('/__qa/set-production-rejected-state', (_req, res) => {
  productionStatus = 'rejected';
  return res.json({ ok: true });
});
app.post('/__qa/set-production-approved-state', (_req, res) => {
  productionStatus = 'approved';
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-collaboration-update', (_req, res) => {
  collaborationUpdatesToReject = 2;
  return res.json({ ok: true });
});
app.post('/__qa/collaborator-color-fixture', (req, res) => {
  exposeCollaboratorColorFixture = req.body.enabled === true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-material-draft-update', (_req, res) => {
  failNextMaterialDraftUpdate = true;
  return res.json({ ok: true });
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(fixturePermissions));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/topics', (_req, res) => {
  topicListReadAttempts += 1;
  return res.json({ success: true, data: [], pagination: { total: 1, page: 1, limit: 10 } });
});
app.get('/api/workflow/shooting', (_req, res) => {
  shootingListReadAttempts += 1;
  return res.json({ data: [], total: 0, page: 1, limit: 50 });
});
app.post('/api/workflow/shooting', (_req, res) => res.json({ message: '制作计划已添加', shootingId: 9901 }));
app.get('/api/resource-center/search', (_req, res) => res.json({ data: [{
  resource_id: 88, title: '隔离参考资料', summary: null, snippet: '仅用于检查资料选中态。', library_type: 'project', category: null,
}], total: 1 }));
app.get('/api/topics/:id', (_req, res) => {
  topicDetailReadAttempts += 1;
  return res.json({ success: true, data: { id: topicId, title: '协作审阅稿件', outline: '', creator_id: user.id, assignee_id: user.id, status: 'production', platform: 'douyin' } });
});
app.get(`/api/workflow/production/${productionId}`, async (_req, res) => {
  productionDetailReadAttempts += 1;
  const gate = productionDetailReadGate;
  productionDetailReadGate = null;
  if (gate) await gate;
  if (failNextProductionDetailRead) {
    failNextProductionDetailRead = false;
    return res.status(503).json({ message: '隔离测试模拟创作详情读取失败' });
  }
  if (!productionExists) return res.status(404).json({ message: '创作记录不存在' });
  return res.json({
    id: productionId, topic_id: topicId, topic_title: '协作审阅稿件', version: productionVersion, status: productionStatus,
    content, contentMarkdown: content, content_markdown: content, content_json: content,
    operator_id: user.id, operator_name: user.name, can_edit: productionCanEdit, created_at: '2026-09-29 09:00:00', updated_at: '2026-09-29 09:00:00',
  });
});
app.get(`/api/workflow/production/${productionId}/history`, (_req, res) => {
  productionHistoryReadAttempts += 1;
  if (failNextProductionHistoryRead) {
    failNextProductionHistoryRead = false;
    return res.status(503).json({ message: '隔离测试模拟创作历史读取失败' });
  }
  const data = exposeHistoryFixture ? [{
    id: 770, production_id: productionId, version: 'v1.0', content: '<p>历史只读版本正文。</p>',
    content_markdown: '<p>历史只读版本正文。</p>', status: 'draft', change_type: 'major',
    operator_id: user.id, operator_name: '历史版本作者', created_at: '2026-10-01 09:00:00', version_state: 'historical',
  }] : [];
  return res.json({ data, total: data.length, page: 1, limit: 20 });
});
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
  let failAfterCommit = false;
  if (req.body.status === 'review') {
    productionReviewAttempts += 1;
    productionReviewRequestContent = String(req.body.content ?? '');
    const gate = productionReviewGate;
    productionReviewGate = null;
    if (gate) await gate;
    if (failNextProductionReview) {
      failNextProductionReview = false;
      return res.status(503).json({ message: '隔离测试模拟审核提交失败，请重试' });
    }
    failAfterCommit = failNextProductionReviewAfterCommit;
    failNextProductionReviewAfterCommit = false;
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
        if (failNextProductionVersionSave) {
          failNextProductionVersionSave = false;
          return res.status(503).json({ message: '隔离测试模拟新版保存前服务端失败' });
        }
        if (req.body.version_action === 'major') {
          const currentMajor = Number(productionVersion.match(/^v?(\d+)/)?.[1] || 1);
          productionVersion = `v${currentMajor + 1}.0`;
        } else {
          const [, major = '1', minor = '0'] = productionVersion.match(/^v?(\d+)\.(\d+)$/) || [];
          productionVersion = `v${major}.${Number(minor) + 1}`;
        }
        failAfterCommit = failNextProductionVersionAfterCommit;
        failNextProductionVersionAfterCommit = false;
      } else if (productionStatus !== 'draft') {
        productionStatusUpdateAttempts += 1;
        productionStatusUpdateContent = String(req.body.content ?? '');
        productionStatus = 'draft';
        failAfterCommit = failNextProductionStatusAfterCommit;
        failNextProductionStatusAfterCommit = false;
      }
    }
  }
  content = String(req.body.content ?? content);
  savedContents.push(content);
  if (failAfterCommit) return res.status(503).json({ message: '隔离测试模拟服务端已提交但响应丢失' });
  return res.json({ message: '保存成功', version: productionVersion });
});
app.delete(`/api/workflow/production/${productionId}`, (_req, res) => {
  productionDeleteAttempts += 1;
  if (failNextProductionDelete) {
    failNextProductionDelete = false;
    return res.status(503).json({ message: '隔离测试模拟创作删除未提交' });
  }
  productionExists = false;
  if (failNextProductionDeleteAfterCommit) {
    failNextProductionDeleteAfterCommit = false;
    return res.status(503).json({ message: '隔离测试模拟创作已删除但响应丢失' });
  }
  return res.json({ message: '创作记录删除成功' });
});
function reviewThreadFingerprint(input: Record<string, unknown>) {
  const anchor = input.anchor && typeof input.anchor === 'object' ? input.anchor as Record<string, unknown> : {};
  return createHash('sha256').update(JSON.stringify({
    version: input.version,
    kind: input.kind,
    anchor: {
      quote: String(anchor.quote ?? '').trim(),
      context: String(anchor.context ?? '').trim(),
      from: Number(anchor.from),
      to: Number(anchor.to),
    },
    summary: String(input.summary ?? '').trim(),
    proposed_text: input.kind === 'suggestion' ? typeof input.proposed_text === 'string' ? input.proposed_text : '' : null,
  })).digest('hex');
}
app.get(`/api/workflow/production/${productionId}/review-threads/requests/:requestId`, (req, res) => {
  reviewThreadStatusReadAttempts += 1;
  res.setHeader('Cache-Control', 'no-store');
  if (failNextReviewThreadStatusRead) {
    failNextReviewThreadStatusRead = false;
    return res.status(503).json({ message: '隔离测试模拟批注状态读取失败' });
  }
  const request = reviewThreadRequests.get(req.params.requestId);
  if (!request || request.actorId !== user.id || request.productionId !== productionId) {
    return res.json({ status: 'not_found' });
  }
  if (req.query.fingerprint !== request.fingerprint) return res.status(409).json({ message: '批注载荷指纹不匹配' });
  return res.json({ status: 'applied', threadId: request.threadId });
});
app.get(`/api/workflow/production/${productionId}/review-threads`, (_req, res) => res.json({ data: threads }));
app.get(`/api/workflow/production/${productionId}/review-threads/:threadId/replies/requests/:requestId`, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  reviewReplyStatusReadAttempts += 1;
  if (failNextReviewReplyStatusRead) {
    failNextReviewReplyStatusRead = false;
    return res.status(503).json({ message: '隔离测试模拟回复状态读取失败' });
  }
  const request = reviewReplyRequests.get(req.params.requestId);
  if (!request || request.actorId !== user.id || request.productionId !== productionId || request.threadId !== Number(req.params.threadId)) {
    return res.json({ status: 'not_found' });
  }
  const fingerprint = createHash('sha256').update(request.content).digest('hex');
  if (req.query.fingerprint !== fingerprint) return res.status(409).json({ message: '回复载荷指纹不匹配' });
  return res.json({ status: 'applied', replyId: request.replyId });
});
app.post(`/api/workflow/production/${productionId}/review-threads`, async (req, res) => {
  reviewThreadCreateAttempts += 1;
  reviewThreadRequestIds.push(typeof req.body.client_request_id === 'string' ? req.body.client_request_id : '');
  const gate = reviewThreadCreateGate;
  reviewThreadCreateGate = null;
  if (gate) await gate;
  if (failNextReviewThreadCreate) {
    failNextReviewThreadCreate = false;
    return res.status(503).json({ message: '隔离测试模拟批注保存失败，请重试' });
  }
  const requestId = typeof req.body.client_request_id === 'string' ? req.body.client_request_id : '';
  const fingerprint = reviewThreadFingerprint(req.body);
  if (requestId) {
    const previous = reviewThreadRequests.get(requestId);
    if (previous) {
      if (previous.actorId !== user.id || previous.productionId !== productionId || previous.fingerprint !== fingerprint) {
        return res.status(409).json({ message: '请求编号冲突' });
      }
      return res.status(200).json({ id: previous.threadId, message: '已创建', replayed: true });
    }
  }
  const id = nextThreadId++;
  threads.push({
    id, production_id: productionId, version: 'v1.0', kind: req.body.kind,
    anchor_quote: req.body.anchor.quote, anchor_context: req.body.anchor.context,
    anchor_from: req.body.anchor.from, anchor_to: req.body.anchor.to,
    summary: req.body.summary, proposed_text: req.body.proposed_text ?? null,
    status: 'open', author_id: user.id, author_name: user.name, reviewed_by: null,
    reviewer_name: null, created_at: '2026-09-29 09:10:00', updated_at: '2026-09-29 09:10:00', replies: [],
  });
  if (requestId) reviewThreadRequests.set(requestId, { actorId: user.id, productionId, threadId: id, fingerprint });
  if (failNextReviewThreadCreateAfterCommit) {
    failNextReviewThreadCreateAfterCommit = false;
    return res.status(503).json({ message: '隔离测试模拟批注已保存但响应丢失' });
  }
  return res.status(201).json({ id, message: '已创建' });
});
app.post(`/api/workflow/production/${productionId}/review-threads/:threadId/replies`, async (req, res) => {
  reviewReplyAttempts += 1;
  reviewReplyRequestIds.push(typeof req.body.client_request_id === 'string' ? req.body.client_request_id : '');
  const gate = reviewReplyGate;
  reviewReplyGate = null;
  if (gate) await gate;
  if (failNextReviewReply) {
    failNextReviewReply = false;
    return res.status(503).json({ message: '隔离测试模拟回复保存失败，请重试' });
  }
  const thread = threads.find((item) => item.id === Number(req.params.threadId));
  if (!thread) return res.status(404).json({ message: '不存在' });
  const requestId = typeof req.body.client_request_id === 'string' ? req.body.client_request_id : '';
  if (requestId) {
    const previous = reviewReplyRequests.get(requestId);
    if (previous) {
      if (previous.actorId !== user.id || previous.productionId !== productionId || previous.threadId !== thread.id || previous.content !== req.body.content) {
        return res.status(409).json({ message: '请求编号冲突' });
      }
      return res.status(200).json({ id: previous.replyId, message: '已回复', replayed: true });
    }
  }
  const reply = { id: nextReplyId++, thread_id: thread.id, content: req.body.content, author_id: user.id, author_name: user.name, created_at: '2026-09-29 09:11:00' };
  thread.replies.push(reply);
  if (requestId) reviewReplyRequests.set(requestId, { actorId: user.id, productionId, threadId: thread.id, replyId: reply.id, content: reply.content });
  if (failNextReviewReplyAfterCommit) {
    failNextReviewReplyAfterCommit = false;
    return res.status(503).json({ message: '隔离测试模拟回复已保存但响应丢失' });
  }
  return res.status(201).json({ id: reply.id, message: '已回复' });
});
app.get(`/api/workflow/production/${productionId}/review-threads/:threadId/status-requests/:requestId`, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  reviewStatusStatusReadAttempts += 1;
  if (failNextReviewStatusStatusRead) {
    failNextReviewStatusStatusRead = false;
    return res.status(503).json({ message: '隔离测试模拟批注状态读取失败' });
  }
  const request = reviewStatusRequests.get(req.params.requestId);
  if (!request || request.actorId !== user.id || request.productionId !== productionId || request.threadId !== Number(req.params.threadId)) {
    return res.json({ status: 'not_found' });
  }
  if (req.query.status !== request.status) return res.status(409).json({ message: '状态请求目标不匹配' });
  return res.json({ status: 'applied', appliedStatus: request.status });
});
app.patch(`/api/workflow/production/${productionId}/review-threads/:threadId/status`, (req, res) => {
  reviewStatusAttempts += 1;
  reviewStatusRequestIds.push(typeof req.body.client_request_id === 'string' ? req.body.client_request_id : '');
  const thread = threads.find((item) => item.id === Number(req.params.threadId));
  if (!thread) return res.status(404).json({ message: '不存在' });
  const requestId = typeof req.body.client_request_id === 'string' ? req.body.client_request_id : '';
  if (requestId) {
    const previous = reviewStatusRequests.get(requestId);
    if (previous) {
      if (previous.actorId !== user.id || previous.productionId !== productionId || previous.threadId !== thread.id || previous.status !== req.body.status) {
        return res.status(409).json({ message: '状态请求编号冲突' });
      }
      return res.json({ message: '已处理', replayed: true });
    }
  }
  if (thread.status !== 'open') return res.status(409).json({ message: '已处理' });
  thread.status = req.body.status;
  if (requestId) reviewStatusRequests.set(requestId, { actorId: user.id, productionId, threadId: thread.id, status: req.body.status });
  if (failNextReviewStatusAfterCommit) {
    failNextReviewStatusAfterCommit = false;
    return res.status(503).json({ message: '隔离测试模拟状态已保存但响应丢失' });
  }
  return res.json({ message: '已处理' });
});
app.use('/api', (_req, res) => res.json({ data: [] }));

const server = http.createServer(app);
const io = new SocketServer(server);
app.post('/__qa/announce-superseded', (_req, res) => {
  io.emit('version:superseded', {
    productionId,
    topicId,
    fromVersion: 'v1.0',
    toVersion: 'v2.0',
    toVersionId: 770,
    createdBy: { id: 92, name: '另一位协作者' },
    createdAt: '2026-10-24T09:00:00+08:00',
  });
  return res.json({ ok: true });
});
const emptyUpdate = Array.from(Y.encodeStateAsUpdate(new Y.Doc()));
io.on('connection', (socket) => {
  socket.on('collaboration:join', ({ roomId }: { roomId: string }) => {
    socket.emit('collaboration:sync', { roomId, update: emptyUpdate });
    const users = exposeCollaboratorColorFixture
      ? COLLABORATOR_COLORS.map((color, index) => ({ id: 200 + index, name: `协作色板 ${index + 1}`, color }))
      : [];
    socket.emit('collaboration:users', { roomId, users });
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
const reviewRefreshRecoveryOnlyComplete = Symbol('review-refresh-recovery-only-complete');
const statusRefreshRecoveryOnlyComplete = Symbol('status-refresh-recovery-only-complete');
try {
  let context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  if (process.env.XMT_MATERIAL_PROTECTION_QA_ONLY !== '1') {
  const errors: string[] = [];
  const consoleProblems: string[] = [];
  const failedRequests: string[] = [];
  const apiNetworkWarnings: string[] = [];
  let expectedReview503ConsoleErrors = 0;
  let expectedProduction404ConsoleErrors = 0;
  let page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || 'failed'}`));
  page.on('console', (message) => {
    if (message.type() === 'warning' && /"event":"api\.network_error"/.test(message.text())) {
      apiNetworkWarnings.push(message.text());
      return;
    }
    if (message.type() === 'error' && /Failed to load resource.*503/.test(message.text()) && expectedReview503ConsoleErrors > 0) {
      expectedReview503ConsoleErrors -= 1;
      return;
    }
    if (message.type() === 'error' && /Failed to load resource.*404/.test(message.text()) && expectedProduction404ConsoleErrors > 0) {
      expectedProduction404ConsoleErrors -= 1;
      return;
    }
    if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  await page.getByText('草稿', { exact: true }).first().waitFor();
  assert.equal(await page.getByText('draft', { exact: true }).count(), 0, 'production detail should not show raw status codes');
  await page.getByText('这个版本还没有批注或修改建议').waitFor();

  let productionDetailReturn = page.getByRole('button', { name: '返回创作管理', exact: true });
  let productionTopicLinks = page.getByRole('button', { name: '协作审阅稿件', exact: true });
  let productionHistorySidebarToggle = page.locator('button[title="收起版本历史"]').last();
  assert.equal(await productionHistorySidebarToggle.getAttribute('aria-label'), '收起版本历史', 'history sidebar toggle exposes its current action to assistive technology');
  for (const viewport of [
    { width: 320, height: 812 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [button, label] of [
      [productionDetailReturn, '创作详情返回管理'],
      [productionTopicLinks.first(), '创作详情顶部关联选题'],
      [productionTopicLinks.last(), '创作详情侧栏关联选题'],
      [productionHistorySidebarToggle, '创作详情历史侧栏开关'],
    ] as const) {
      await button.scrollIntoViewIfNeeded();
      await assertMinimumTapTarget(button, `${viewport.width}px ${label}`);
      const bounds = await button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, viewportWidth: innerWidth };
      });
      assert.ok(bounds.left >= -1 && bounds.right <= bounds.viewportWidth + 1, `${viewport.width}px ${label} stays within the viewport: ${JSON.stringify(bounds)}`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), `${viewport.width}px production detail has no horizontal overflow`);
  }
  await page.setViewportSize({ width: 1440, height: 960 });

  await page.getByRole('button', { name: '收起版本历史', exact: true }).last().click();
  await page.getByRole('button', { name: '展开版本历史', exact: true }).last().waitFor();
  await page.getByRole('button', { name: '展开版本历史', exact: true }).last().click();
  await page.getByRole('button', { name: '收起版本历史', exact: true }).last().waitFor();

  await page.request.post(`${base}/__qa/fail-next-production-review-after-commit`);
  expectedReview503ConsoleErrors += 1;
  const committedReview503 = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  const committedReviewReadback = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 200);
  await page.getByRole('button', { name: '提交审核', exact: true }).first().click();
  await Promise.all([committedReview503, committedReviewReadback]);
  await page.getByText('审核中', { exact: true }).first().waitFor();
  let transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionStatus, 'review', 'a review that committed before a 503 is reconciled from the server');
  assert.equal(transitionRecoveryState.productionReviewAttempts, 1, 'ambiguous review completion is never automatically resubmitted');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77')), null, 'confirmed review completion clears its local recovery marker');

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.reload();
  await page.getByRole('button', { name: '提交审核', exact: true }).first().waitFor();
  await page.request.post(`${base}/__qa/fail-next-production-review`);
  expectedReview503ConsoleErrors += 1;
  const unchangedReview503 = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  const unchangedReviewReadback = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 200);
  await page.getByRole('button', { name: '提交审核', exact: true }).first().click();
  await Promise.all([unchangedReview503, unchangedReviewReadback]);
  const confirmReviewRetry = page.getByTestId('production-status-transition-confirm-retry');
  await confirmReviewRetry.waitFor();
  await page.waitForTimeout(120);
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionReviewAttempts, 1, 'an unchanged review is not automatically retried');
  assert.equal(await page.locator('.ProseMirror').last().getAttribute('contenteditable'), 'false', 'an unresolved review status keeps the editor read-only');
  assert.equal(JSON.parse(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77') || 'null'))?.phase, 'ready', 'the verified unchanged state stores an explicit-retry marker');
  const confirmedReviewRetryWrite = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 200);
  await confirmReviewRetry.click();
  await confirmedReviewRetryWrite;
  await page.getByText('审核中', { exact: true }).first().waitFor();
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionReviewAttempts, 2, 'the review is sent again only after the user confirms');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77')), null, 'successful explicit retry clears the recovery marker');

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.reload();
  await page.getByRole('button', { name: '提交审核', exact: true }).first().waitFor();
  await page.request.post(`${base}/__qa/fail-next-production-review-after-commit`);
  await page.request.post(`${base}/__qa/fail-next-production-detail-read`);
  expectedReview503ConsoleErrors += 2;
  const reviewWriteWithFailedReadback = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  const failedTransitionReadback = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  await page.getByRole('button', { name: '提交审核', exact: true }).first().click();
  await Promise.all([reviewWriteWithFailedReadback, failedTransitionReadback]);
  await page.getByTestId('production-status-transition-verify').waitFor();
  assert.ok(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77')), 'a failed readback preserves the local recovery marker');
  await page.reload();
  await page.getByText('审核中', { exact: true }).first().waitFor();
  await page.waitForFunction(() => sessionStorage.getItem('xmt:production-transition-recovery:77') === null);
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionStatus, 'review', 'reload performs a read-only reconciliation from the persisted marker');
  assert.equal(transitionRecoveryState.productionReviewAttempts, 1, 'reload recovery never repeats the ambiguous review PUT');

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.request.post(`${base}/__qa/set-production-rejected-state`);
  await page.reload();
  await page.getByRole('button', { name: '重新编辑', exact: true }).waitFor();
  await page.request.post(`${base}/__qa/fail-next-production-status-after-commit`);
  expectedReview503ConsoleErrors += 1;
  const committedStatus503 = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  const committedStatusReadback = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 200);
  await page.getByRole('button', { name: '重新编辑', exact: true }).click();
  await Promise.all([committedStatus503, committedStatusReadback]);
  await page.getByText('草稿', { exact: true }).first().waitFor();
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionStatusUpdateAttempts, 1, 'an applied status transition is reconciled without a second PUT');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77')), null, 'confirmed status completion clears its recovery marker');

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.reload();
  await page.getByRole('button', { name: '小修保存', exact: true }).waitFor();
  await page.request.post(`${base}/__qa/fail-next-production-version-after-commit`);
  expectedReview503ConsoleErrors += 1;
  const committedVersion503 = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  const committedVersionReadback = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 200);
  await page.getByRole('button', { name: '小修保存', exact: true }).click();
  await Promise.all([committedVersion503, committedVersionReadback]);
  await page.getByText('v1.1', { exact: true }).first().waitFor();
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionVersion, 'v1.1', 'a minor version saved before a 503 is adopted from the server');
  assert.equal(transitionRecoveryState.productionVersionSaveAttempts, 1, 'an ambiguous version save is never automatically repeated');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77')), null, 'confirmed version creation clears its recovery marker');

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.reload();
  await page.getByRole('button', { name: '小修保存', exact: true }).waitFor();
  await page.request.post(`${base}/__qa/fail-next-production-version-save`);
  expectedReview503ConsoleErrors += 1;
  const unchangedVersion503 = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  const unchangedVersionReadback = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 200);
  await page.getByRole('button', { name: '小修保存', exact: true }).click();
  await Promise.all([unchangedVersion503, unchangedVersionReadback]);
  const explicitVersionRetry = page.getByTestId('production-status-transition-confirm-retry');
  await explicitVersionRetry.waitFor();
  await page.waitForTimeout(120);
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionVersion, 'v1.0', 'a rejected version save keeps the original version');
  assert.equal(transitionRecoveryState.productionVersionSaveAttempts, 1, 'an unchanged version is not automatically retried');
  assert.equal(await page.locator('.ProseMirror').last().getAttribute('contenteditable'), 'false', 'an unresolved version save keeps the editor read-only');
  const confirmedVersionRetryWrite = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 200);
  await explicitVersionRetry.click();
  await confirmedVersionRetryWrite;
  await page.getByText('v1.1', { exact: true }).first().waitFor();
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionVersionSaveAttempts, 2, 'a version is created again only after the user confirms');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77')), null, 'successful explicit version retry clears the recovery marker');

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.reload();
  await page.getByRole('button', { name: '小修保存', exact: true }).waitFor();
  await page.request.post(`${base}/__qa/fail-next-production-version-after-commit`);
  await page.request.post(`${base}/__qa/fail-next-production-detail-read`);
  expectedReview503ConsoleErrors += 2;
  const versionWriteWithFailedReadback = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  const failedVersionReadback = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  await page.getByRole('button', { name: '小修保存', exact: true }).click();
  await Promise.all([versionWriteWithFailedReadback, failedVersionReadback]);
  await page.getByTestId('production-status-transition-verify').waitFor();
  assert.ok(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77')), 'failed version readback preserves the local recovery marker');
  await page.reload();
  await page.getByText('v1.1', { exact: true }).first().waitFor();
  await page.waitForFunction(() => sessionStorage.getItem('xmt:production-transition-recovery:77') === null);
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionVersionSaveAttempts, 1, 'reload recovery does not duplicate the version creation');

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.goto(`${base}/__qa`);
  await page.locator('button[title="删除创作记录"]').waitFor();
  await page.request.post(`${base}/__qa/fail-next-production-delete-after-commit`);
  expectedReview503ConsoleErrors += 1;
  expectedProduction404ConsoleErrors += 1;
  const committedDelete503 = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  const deletedProductionReadback = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 404);
  await page.locator('button[title="删除创作记录"]').click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await Promise.all([committedDelete503, deletedProductionReadback]);
  await page.waitForURL('**/production');
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionExists, false, 'a committed deletion is confirmed from the not-found readback');
  assert.equal(transitionRecoveryState.productionDeleteAttempts, 1, 'a committed deletion is never repeated after a lost response');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77')), null, 'confirmed deletion clears its recovery marker');

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.goto(`${base}/__qa`);
  await page.locator('button[title="删除创作记录"]').waitFor();
  await page.request.post(`${base}/__qa/fail-next-production-delete`);
  expectedReview503ConsoleErrors += 1;
  const rejectedDelete503 = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  const existingProductionReadback = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 200);
  await page.locator('button[title="删除创作记录"]').click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await Promise.all([rejectedDelete503, existingProductionReadback]);
  const explicitDeleteRetry = page.getByTestId('production-status-transition-confirm-retry');
  await explicitDeleteRetry.waitFor();
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionExists, true, 'a pre-commit failure leaves the record available');
  assert.equal(transitionRecoveryState.productionDeleteAttempts, 1, 'an unchanged record is not automatically deleted again');
  assert.equal(await page.locator('.ProseMirror').last().getAttribute('contenteditable'), 'false', 'an unresolved delete keeps the editor read-only');
  const confirmedDeleteRetryWrite = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 200);
  await explicitDeleteRetry.click();
  await confirmedDeleteRetryWrite;
  await page.waitForURL('**/production');
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionExists, false, 'the explicitly confirmed retry deletes the unchanged record');
  assert.equal(transitionRecoveryState.productionDeleteAttempts, 2, 'the second delete is sent only after the user confirms');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77')), null, 'successful explicit delete retry clears its marker');

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.goto(`${base}/__qa`);
  await page.locator('button[title="删除创作记录"]').waitFor();
  await page.request.post(`${base}/__qa/fail-next-production-delete-after-commit`);
  await page.request.post(`${base}/__qa/fail-next-production-detail-read`);
  expectedReview503ConsoleErrors += 2;
  const deleteWithFailedReadback = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  const failedDeleteReadback = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`) && response.status() === 503);
  await page.locator('button[title="删除创作记录"]').click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await Promise.all([deleteWithFailedReadback, failedDeleteReadback]);
  await page.getByTestId('production-status-transition-verify').waitFor();
  assert.ok(await page.evaluate(() => sessionStorage.getItem('xmt:production-transition-recovery:77')), 'a failed delete readback preserves the recovery marker');
  expectedProduction404ConsoleErrors += 1;
  await page.reload();
  await page.waitForURL('**/production');
  await page.waitForFunction(() => sessionStorage.getItem('xmt:production-transition-recovery:77') === null);
  transitionRecoveryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(transitionRecoveryState.productionExists, false, 'reload recovery confirms the deleted record from a read-only 404');
  assert.equal(transitionRecoveryState.productionDeleteAttempts, 1, 'reload recovery does not repeat the delete request');
  assert.equal(expectedProduction404ConsoleErrors, 0, 'both expected deleted-record 404 responses are accounted for');

  for (const refreshFailure of [
    { kind: 'detail', failPath: '/__qa/fail-next-production-detail-read', readPath: `/api/workflow/production/${productionId}` },
    { kind: 'history', failPath: '/__qa/fail-next-production-history-read', readPath: `/api/workflow/production/${productionId}/history` },
  ]) {
    await page.request.post(`${base}/__qa/reset-review-fixture`);
    await page.goto(`${base}/__qa`);
    await page.getByRole('button', { name: '提交审核', exact: true }).first().waitFor();
    const reviewRecoveryEditor = page.locator('.ProseMirror').last();
    const reviewRecoveryMarker = `审核提交后${refreshFailure.kind}刷新失败仍保留正文`;
    const confirmedManuscriptSave = page.waitForResponse((response) => response.request().method() === 'PUT'
      && response.url().endsWith(`/api/workflow/production/${productionId}`)
      && response.status() === 200);
    await reviewRecoveryEditor.click();
    await reviewRecoveryEditor.press('End');
    await reviewRecoveryEditor.pressSequentially(reviewRecoveryMarker, { delay: 1 });
    await Promise.all([confirmedManuscriptSave, page.waitForFunction((marker: string) => fetch('/__qa/state')
      .then((response) => response.json())
      .then((state) => String(state.content).includes(marker)), reviewRecoveryMarker)]);

    await page.request.post(`${base}${refreshFailure.failPath}`);
    expectedReview503ConsoleErrors += 1;
    const confirmedReviewWrite = page.waitForResponse((response) => response.request().method() === 'PUT'
      && response.url().endsWith(`/api/workflow/production/${productionId}`)
      && response.status() === 200);
    const failedReviewRefresh = page.waitForResponse((response) => response.request().method() === 'GET'
      && new URL(response.url()).pathname === refreshFailure.readPath
      && response.status() === 503);
    await page.getByRole('button', { name: '提交审核', exact: true }).first().click();
    await Promise.all([confirmedReviewWrite, failedReviewRefresh]);

    const confirmedReviewWarning = page.getByRole('alert').filter({ hasText: '服务端已确认提交审核' });
    await confirmedReviewWarning.waitFor();
    await page.getByText('审核中', { exact: true }).first().waitFor();
    assert.match(await reviewRecoveryEditor.innerText(), /审核提交后(?:detail|history)刷新失败仍保留正文/,
      'the confirmed review status and submitted manuscript remain visible after the follow-up read fails');
    const failedRefreshState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
    assert.equal(failedRefreshState.productionStatus, 'review', 'the fixture confirms the review write before failing a read');
    assert.match(failedRefreshState.content, /审核提交后(?:detail|history)刷新失败仍保留正文/,
      'the server retains the submitted manuscript independently of the failed refresh');
    assert.equal(failedRefreshState.productionReviewAttempts, 1, 'the review write is sent exactly once despite the failed refresh');
    const reviewWritesBeforeRetry = failedRefreshState.productionReviewAttempts;
    const draftWritesBeforeRetry = failedRefreshState.productionSaveAttempts;
    const savedContentCountBeforeRetry = failedRefreshState.savedContents.length;
    const detailReadsBeforeRetry = failedRefreshState.productionDetailReadAttempts;
    const historyReadsBeforeRetry = failedRefreshState.productionHistoryReadAttempts;

    assert.equal(await reviewRecoveryEditor.getAttribute('contenteditable'), 'false', 'a confirmed review with stale detail keeps the manuscript read-only');
    for (const lockedAction of [
      page.getByRole('button', { name: '审核通过', exact: true }),
      page.getByRole('button', { name: '小修保存', exact: true }),
      page.getByRole('button', { name: '另开新版', exact: true }),
      page.locator('button[title="删除创作记录"]'),
    ]) {
      assert.equal(await lockedAction.isDisabled(), true, 'all production mutation entry points stay disabled while confirmed review data awaits refresh');
    }
    const blockedReviewWrites: string[] = [];
    const recordBlockedReviewWrite = (request: import('playwright').Request) => {
      if (request.url().endsWith(`/api/workflow/production/${productionId}`) && request.method() !== 'GET') {
        blockedReviewWrites.push(request.method());
      }
    };
    page.on('request', recordBlockedReviewWrite);
    for (const lockedAction of [
      page.getByRole('button', { name: '审核通过', exact: true }),
      page.getByRole('button', { name: '小修保存', exact: true }),
    ]) {
      await lockedAction.evaluate((element) => {
        const button = element as HTMLButtonElement;
        button.disabled = false;
        button.click();
        button.disabled = true;
      });
    }
    await page.waitForTimeout(100);
    page.off('request', recordBlockedReviewWrite);
    assert.deepEqual(blockedReviewWrites, [], 'status and version writes are rejected while a confirmed review awaits read recovery');

    const retryDetailRead = page.waitForResponse((response) => response.request().method() === 'GET'
      && response.url().endsWith(`/api/workflow/production/${productionId}`)
      && response.status() === 200);
    const retryHistoryRead = page.waitForResponse((response) => response.request().method() === 'GET'
      && new URL(response.url()).pathname === `/api/workflow/production/${productionId}/history`
      && response.status() === 200);
    const retryMutationRequests: string[] = [];
    const recordRetryMutation = (request: import('playwright').Request) => {
      if (request.url().endsWith(`/api/workflow/production/${productionId}`) && request.method() !== 'GET') {
        retryMutationRequests.push(`${request.method()} ${request.url()}`);
      }
    };
    page.on('request', recordRetryMutation);
    await confirmedReviewWarning.getByRole('button', { name: '只重试读取详情', exact: true }).click();
    await Promise.all([retryDetailRead, retryHistoryRead]);
    await confirmedReviewWarning.waitFor({ state: 'detached' });
    page.off('request', recordRetryMutation);
    assert.deepEqual(retryMutationRequests, [], 'the explicit recovery action performs no production write');
    await page.getByText('审核中', { exact: true }).first().waitFor();
    assert.match(await reviewRecoveryEditor.innerText(), /审核提交后(?:detail|history)刷新失败仍保留正文/,
      'the submitted manuscript remains visible after read-only recovery');
    const recoveredReviewState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
    assert.equal(recoveredReviewState.productionReviewAttempts, reviewWritesBeforeRetry, 'read recovery does not resubmit the review PUT');
    assert.equal(recoveredReviewState.productionSaveAttempts, draftWritesBeforeRetry, 'read recovery does not repeat an autosave PUT');
    assert.equal(recoveredReviewState.savedContents.length, savedContentCountBeforeRetry, 'read recovery does not append another saved manuscript');
    assert.equal(recoveredReviewState.productionDetailReadAttempts, detailReadsBeforeRetry + 1, 'review recovery rereads the production detail exactly once');
    assert.equal(recoveredReviewState.productionHistoryReadAttempts, historyReadsBeforeRetry + 1, 'review recovery rereads history exactly once');
  }

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.reload();
  await page.getByRole('button', { name: '提交审核', exact: true }).first().waitFor();
  if (process.env.XMT_PRODUCTION_REVIEW_RECOVERY_ONLY === '1') {
    assert.equal(expectedReview503ConsoleErrors, 0, 'both injected GET failures are accounted for as expected');
    assert.deepEqual(errors, [], 'review refresh recovery does not cause page errors');
    assert.deepEqual(consoleProblems, [], 'review refresh recovery does not cause unexpected console errors or warnings');
    throw reviewRefreshRecoveryOnlyComplete;
  }

  await context.close();
  context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || 'failed'}`));
  page.on('console', (message) => {
    if (message.type() === 'warning' && /"event":"api\.network_error"/.test(message.text())) {
      apiNetworkWarnings.push(message.text());
      return;
    }
    if (message.type() === 'error' && /Failed to load resource.*503/.test(message.text()) && expectedReview503ConsoleErrors > 0) {
      expectedReview503ConsoleErrors -= 1;
      return;
    }
    if (message.type() === 'error' && /Failed to load resource.*404/.test(message.text()) && expectedProduction404ConsoleErrors > 0) {
      expectedProduction404ConsoleErrors -= 1;
      return;
    }
    if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(`${base}/__qa`);
  await page.getByRole('button', { name: '提交审核', exact: true }).first().waitFor();
  productionDetailReturn = page.getByRole('button', { name: '返回创作管理', exact: true });
  productionTopicLinks = page.getByRole('button', { name: '协作审阅稿件', exact: true });
  productionHistorySidebarToggle = page.locator('button[title="收起版本历史"]').last();

  const collaboratorOverflow = page.locator('.xmt-collaboration-cursor-overflow');
  await collaboratorOverflow.waitFor({ state: 'attached' });
  assert.equal(await collaboratorOverflow.getAttribute('role'), 'group', 'the additional collaborator avatars expose a named semantic group');
  assert.equal(await collaboratorOverflow.getAttribute('aria-label'), '其他协作者', 'the collaborator avatar group has an accessible name');
  assert.equal(await collaboratorOverflow.getAttribute('aria-hidden'), 'true', 'an empty collaborator avatar group stays out of the accessibility tree');
  await page.request.post(`${base}/__qa/collaborator-color-fixture`, { data: { enabled: true } });
  const collaboratorColorPage = await context.newPage();
  collaboratorColorPage.setDefaultTimeout(5000);
  for (const theme of ['light', 'dark']) {
    await collaboratorColorPage.goto(`${base}/__qa?theme=${theme}`);
    await collaboratorColorPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
    await collaboratorColorPage.waitForFunction(() => document.querySelectorAll('.flex.-space-x-1 > span[title^="协作色板 "]').length === 5);
    const collaborationStatus = collaboratorColorPage.getByText('当前没有协作者正在编辑正文。', { exact: true });
    await collaborationStatus.waitFor();
    assert.equal(await collaboratorColorPage.getByText('系统正在同步文档状态', { exact: true }).count(), 0, 'an idle collaboration hint does not claim that synchronization is in progress');
    const statusContrast = await textContrastRatio(collaborationStatus);
    assert.ok(statusContrast >= 4.5, `${theme}-theme collaborative document status meets 4.5:1 contrast; actual ${statusContrast.toFixed(2)}:1`);
    const collaboratorAvatars = collaboratorColorPage.locator('.flex.-space-x-1 > span[title^="协作色板 "]');
    for (let index = 0; index < 5; index += 1) {
      const avatar = collaboratorAvatars.nth(index);
      const contrast = await textContrastRatio(avatar);
      assert.ok(contrast >= 4.5, `${theme}-theme collaborator avatar ${index + 1} meets 4.5:1 contrast; actual ${contrast.toFixed(2)}:1`);
    }
  }
  await collaboratorColorPage.close();
  await page.request.post(`${base}/__qa/collaborator-color-fixture`, { data: { enabled: false } });
  await page.request.post(`${base}/__qa/fail-next-production-saves`);
  expectedReview503ConsoleErrors += 3;
  const mainDraftEditor = page.locator('.ProseMirror').last();
  const firstDraftSaveFailure = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 503);
  await mainDraftEditor.click();
  await mainDraftEditor.press('End');
  await mainDraftEditor.pressSequentially('正文保护验证', { delay: 1 });
  assert.match(await mainDraftEditor.innerText(), /正文保护验证/, 'the live editor reflects the new manuscript text before autosave');
  await firstDraftSaveFailure;
  assert.match(await mainDraftEditor.innerText(), /正文保护验证/, 'a failed autosave keeps the edited manuscript in the live editor');

  const submitReviewButtons = page.getByRole('button', { name: '提交审核', exact: true });
  const submitReviewTop = submitReviewButtons.first();
  const submitReviewPanel = submitReviewButtons.last();
  const flushedDraftSaveFailure = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 503);
  await submitReviewTop.click();
  await flushedDraftSaveFailure;
  await page.getByText('正文保存未确认，请检查编辑器提示并重试后再提交审核。', { exact: true }).waitFor();
  const editorsAfterFailedFlush = await page.locator('.ProseMirror').allInnerTexts();
  assert.match(await mainDraftEditor.innerText(), /正文保护验证/, `a failed submit flush keeps the edited manuscript in the live editor; editors=${JSON.stringify(editorsAfterFailedFlush)}`);
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
  const failedReviewWriteResponse = await failedReviewResponse;
  assert.equal(failedReviewWriteResponse.status(), 503, 'the isolated review failure reached the server');
  reviewState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(reviewState.productionReviewRequestContent, reviewState.content, 'the server received the same current content it confirms was saved');
  const explicitReviewRetry = page.getByTestId('production-status-transition-confirm-retry');
  await explicitReviewRetry.waitFor();
  await submitReviewTop.waitFor({ state: 'visible' });
  assert.equal(await submitReviewTop.isEnabled(), false, 'an uncertain review request blocks the ordinary submit action');
  reviewState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(reviewState.productionStatus, 'draft', 'failed review submission keeps the confirmed draft state');
  assert.match(reviewState.content, /正文保护验证/, 'autosave recovery preserves the edited manuscript before the review attempt');
  assert.equal(reviewState.productionReviewAttempts, 1, 'a failed review request is recorded once and waits for explicit retry');

  await page.request.post(`${base}/__qa/hold-next-production-review`);
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-testid="production-status-transition-confirm-retry"]');
    if (!button) throw new Error('Expected the explicit review retry confirmation button');
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const pendingReviewSubmit = page.getByRole('button', { name: '正在提交审核…', exact: true });
  await pendingReviewSubmit.first().waitFor();
  await page.waitForFunction((expectedAttempts: number) => fetch('/__qa/state')
    .then((response) => response.json())
    .then((state) => state.productionReviewAttempts === expectedAttempts), 2);
  assert.ok(await pendingReviewSubmit.count() >= 2, 'all visible review submission entry points report the same in-flight review');
  for (const button of await pendingReviewSubmit.all()) {
    assert.equal(await button.isDisabled(), true, 'every review submission entry point stays locked until the server confirms');
  }
  assert.equal(await mainDraftEditor.getAttribute('contenteditable'), 'false', 'the submitted manuscript cannot change while its review request is in flight');
  for (const button of [
    page.getByRole('button', { name: '小修保存', exact: true }),
    page.getByRole('button', { name: '另开新版', exact: true }),
    page.getByRole('button', { name: '当前版本查看 / 编辑', exact: true }),
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

  await page.waitForFunction(() => {
    const editors = document.querySelectorAll('.ProseMirror');
    return editors[editors.length - 1]?.getAttribute('contenteditable') === 'true';
  });
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

  // The fixture resets version to v1.0; use a fresh browser context so its
  // IndexedDB Yjs outbox cannot replay the earlier v1.1 test document.
  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await context.close();
  context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Failed to load resource.*503/.test(message.text()) && expectedReview503ConsoleErrors > 0) {
      expectedReview503ConsoleErrors -= 1;
      return;
    }
    if (message.type() === 'error' && /Failed to load resource.*404/.test(message.text()) && expectedProduction404ConsoleErrors > 0) {
      expectedProduction404ConsoleErrors -= 1;
      return;
    }
    if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(`${base}/__qa`);
  await page.getByRole('button', { name: '提交审核', exact: true }).first().waitFor();
  productionDetailReturn = page.getByRole('button', { name: '返回创作管理', exact: true });
  productionTopicLinks = page.getByRole('button', { name: '协作审阅稿件', exact: true });
  productionHistorySidebarToggle = page.locator('button[title="收起版本历史"]').last();
  await page.getByRole('button', { name: '提交审核', exact: true }).first().waitFor();
  const confirmedVersionEditor = page.locator('.ProseMirror').last();
  await confirmedVersionEditor.click();
  await confirmedVersionEditor.press('End');
  await confirmedVersionEditor.pressSequentially('刷新失败后保留已保存版本正文', { delay: 1 });
  await page.waitForFunction(() => fetch('/__qa/state')
    .then((response) => response.json())
    .then((state) => String(state.content).includes('刷新失败后保留已保存版本正文')));
  await page.request.post(`${base}/__qa/fail-next-production-detail-read`);
  expectedReview503ConsoleErrors += 1;
  const successfulProductionPutResponse = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 200);
  const failedConfirmedVersionRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 503);
  await page.getByRole('button', { name: '小修保存', exact: true }).click();
  await Promise.all([successfulProductionPutResponse, failedConfirmedVersionRead]);
  const confirmedVersionWarning = page.getByRole('alert').filter({ hasText: '服务端已确认版本 v1.1' });
  await confirmedVersionWarning.waitFor();
  await page.getByText('正在查看当前最新版本 v1.1', { exact: true }).waitFor();
  let confirmedVersionState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(confirmedVersionState.productionVersion, 'v1.1', 'the fixture confirms the version write before making its follow-up detail read fail');
  assert.equal(confirmedVersionState.productionVersionSaveAttempts, 1, 'the confirmed version write is sent exactly once');
  assert.match(confirmedVersionState.productionVersionSaveContent, /刷新失败后保留已保存版本正文/, 'the confirmed version write includes the edited manuscript');
  await confirmedVersionEditor.getByText('刷新失败后保留已保存版本正文', { exact: false }).waitFor();
  assert.match(await confirmedVersionEditor.innerText(), /刷新失败后保留已保存版本正文/, 'the read-only page reflects the confirmed manuscript after the new version editor hydrates');
  assert.ok(confirmedVersionState.productionDetailReadAttempts >= 2, 'the post-write detail refresh is observed after the initial detail load');
  const confirmedVersionWrites = confirmedVersionState.productionSaveAttempts;
  const confirmedVersionReads = confirmedVersionState.productionDetailReadAttempts;

  assert.equal(await confirmedVersionEditor.getAttribute('contenteditable'), 'false', 'a confirmed version with stale detail remains read-only until refresh succeeds');
  for (const lockedAction of [
    ...await page.getByRole('button', { name: '提交审核', exact: true }).all(),
    page.getByRole('button', { name: '小修保存', exact: true }),
    page.getByRole('button', { name: '另开新版', exact: true }),
    page.locator('button[title="删除创作记录"]'),
  ]) {
    assert.equal(await lockedAction.isDisabled(), true, 'all production mutation entry points stay disabled while confirmed version data awaits refresh');
  }
  for (const lockedAction of [
    page.getByRole('button', { name: '提交审核', exact: true }).first(),
    page.getByRole('button', { name: '小修保存', exact: true }),
  ]) {
    await lockedAction.evaluate((element) => {
      const button = element as HTMLButtonElement;
      button.disabled = false;
      button.click();
      button.disabled = true;
    });
  }
  await page.waitForTimeout(100);
  confirmedVersionState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(confirmedVersionState.productionVersionSaveAttempts, 1, 'a synthetic duplicate version action is rejected while confirmed data awaits refresh');
  assert.equal(confirmedVersionState.productionReviewAttempts, 0, 'a synthetic review action is rejected while confirmed version data awaits refresh');
  assert.equal(confirmedVersionState.productionSaveAttempts, confirmedVersionWrites, 'no manuscript autosave slips through the pending refresh lock');

  await page.request.post(`${base}/__qa/hold-next-production-detail-read`);
  const retryDetailRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 200);
  await page.getByRole('button', { name: '只重试读取详情', exact: true }).click();
  await page.waitForFunction((attempts: number) => fetch('/__qa/state')
    .then((response) => response.json())
    .then((state) => state.productionDetailReadAttempts === attempts + 1), confirmedVersionReads);
  await page.waitForTimeout(100);
  assert.equal(await confirmedVersionWarning.isVisible(), true, 'the warning and known-good manuscript stay visible during a held GET');
  assert.equal(await confirmedVersionEditor.getAttribute('contenteditable'), 'false', 'the editor cannot accept new input while the recovery GET is in flight');
  for (const lockedAction of [
    ...await page.getByRole('button', { name: '提交审核', exact: true }).all(),
    page.getByRole('button', { name: '小修保存', exact: true }),
    page.getByRole('button', { name: '另开新版', exact: true }),
  ]) {
    assert.equal(await lockedAction.isDisabled(), true, 'production actions remain locked for the entire recovery GET');
  }
  const contentBeforeHeldReadAttempt = await confirmedVersionEditor.innerText();
  await confirmedVersionEditor.pressSequentially('不应覆盖已确认正文', { delay: 1 });
  assert.equal(await confirmedVersionEditor.innerText(), contentBeforeHeldReadAttempt, 'typing cannot create an unsaved edit that the recovery GET could overwrite');
  confirmedVersionState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(confirmedVersionState.productionSaveAttempts, confirmedVersionWrites, 'no editor write is sent while the recovery GET is held');
  await page.request.post(`${base}/__qa/release-production-detail-read`);
  await retryDetailRead;
  await confirmedVersionWarning.waitFor({ state: 'detached' });
  await page.getByText('正在编辑当前最新版本 v1.1', { exact: true }).waitFor();
  assert.equal(await confirmedVersionEditor.getAttribute('contenteditable'), 'true', 'a successful recovery read restores the editor');
  assert.equal(await page.getByRole('button', { name: '小修保存', exact: true }).isEnabled(), true, 'successful recovery restores version actions');
  confirmedVersionState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(confirmedVersionState.productionVersionSaveAttempts, 1, 'retrying refresh performs no second version write');
  assert.equal(confirmedVersionState.productionDetailReadAttempts, confirmedVersionReads + 1, 'the explicit retry only reads the confirmed production detail');
  assert.equal(confirmedVersionState.productionSaveAttempts, confirmedVersionWrites, 'retrying the confirmed save performs no production write');
  assert.match(await confirmedVersionEditor.innerText(), /刷新失败后保留已保存版本正文/, 'successful read recovery keeps the saved manuscript visible');

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.request.post(`${base}/__qa/set-production-rejected-state`);
  await page.reload();
  await page.getByRole('button', { name: '重新编辑', exact: true }).waitFor();
  const confirmedStatusEditor = page.locator('.ProseMirror').last();
  await page.request.post(`${base}/__qa/fail-next-production-detail-read`);
  expectedReview503ConsoleErrors += 1;
  const confirmedStatusPut = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 200);
  const failedConfirmedStatusRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 503);
  await page.getByRole('button', { name: '重新编辑', exact: true }).click();
  await Promise.all([confirmedStatusPut, failedConfirmedStatusRead]);
  const confirmedStatusWarning = page.getByRole('alert').filter({ hasText: '服务端已确认状态更新为“草稿”' });
  await confirmedStatusWarning.waitFor();
  await page.getByText('草稿', { exact: true }).first().waitFor();
  let confirmedStatusState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(confirmedStatusState.productionStatus, 'draft', 'the confirmed status remains visible despite the failed detail refresh');
  assert.equal(confirmedStatusState.productionStatusUpdateAttempts, 1, 'the status mutation is recorded once before its follow-up GET fails');
  assert.equal(await confirmedStatusEditor.getAttribute('contenteditable'), 'false', 'the editor stays read-only while the confirmed status awaits refresh');
  for (const lockedAction of [
    ...await page.getByRole('button', { name: '提交审核', exact: true }).all(),
    page.getByRole('button', { name: '小修保存', exact: true }),
    page.getByRole('button', { name: '另开新版', exact: true }),
  ]) {
    assert.equal(await lockedAction.isDisabled(), true, 'production mutations stay disabled while confirmed status awaits refresh');
  }
  const confirmedStatusWrites = confirmedStatusState.productionSaveAttempts;
  const confirmedStatusDetailReads = confirmedStatusState.productionDetailReadAttempts;
  const recoveryWrites: string[] = [];
  const recordStatusRecoveryWrite = (request: import('playwright').Request) => {
    if (request.url().endsWith(`/api/workflow/production/${productionId}`) && request.method() !== 'GET') {
      recoveryWrites.push(request.method());
    }
  };
  page.on('request', recordStatusRecoveryWrite);
  for (const lockedAction of [
    page.getByRole('button', { name: '提交审核', exact: true }).first(),
    page.getByRole('button', { name: '小修保存', exact: true }),
  ]) {
    await lockedAction.evaluate((element) => {
      const button = element as HTMLButtonElement;
      button.disabled = false;
      button.click();
      button.disabled = true;
    });
  }
  await page.waitForTimeout(100);
  confirmedStatusState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(confirmedStatusState.productionStatusUpdateAttempts, 1, 'duplicate production actions cannot repeat the confirmed status update');
  assert.equal(confirmedStatusState.productionSaveAttempts, confirmedStatusWrites, 'duplicate actions do not trigger another production PUT');

  await page.request.post(`${base}/__qa/hold-next-production-detail-read`);
  const confirmedStatusRetryRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 200);
  await confirmedStatusWarning.getByRole('button', { name: '只重试读取详情', exact: true }).click();
  await page.waitForFunction((attempts: number) => fetch('/__qa/state')
    .then((response) => response.json())
    .then((state) => state.productionDetailReadAttempts === attempts + 1), confirmedStatusDetailReads);
  assert.equal(await confirmedStatusEditor.getAttribute('contenteditable'), 'false', 'the editor stays read-only during the held status recovery GET');
  assert.equal(await page.getByRole('button', { name: '提交审核', exact: true }).first().isDisabled(), true, 'status recovery locks subsequent production mutations until the GET succeeds');
  const confirmedStatusContentBeforeHeldReadInput = await confirmedStatusEditor.innerText();
  await confirmedStatusEditor.pressSequentially('不应写入恢复中的详情', { delay: 1 });
  assert.equal(await confirmedStatusEditor.innerText(), confirmedStatusContentBeforeHeldReadInput, 'the held status recovery GET cannot overwrite user input because the editor is locked');
  confirmedStatusState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(confirmedStatusState.productionSaveAttempts, confirmedStatusWrites, 'no manuscript PUT is sent during the held status recovery GET');
  await page.request.post(`${base}/__qa/release-production-detail-read`);
  await confirmedStatusRetryRead;
  await confirmedStatusWarning.waitFor({ state: 'detached' });
  page.off('request', recordStatusRecoveryWrite);
  assert.deepEqual(recoveryWrites, [], 'the status recovery action performs GET only, never repeating the confirmed PUT');
  assert.equal(await confirmedStatusEditor.getAttribute('contenteditable'), 'true', 'a successful status recovery read restores editor controls');
  assert.equal(await page.getByRole('button', { name: '提交审核', exact: true }).first().isEnabled(), true, 'a successful status recovery read restores production actions');
  confirmedStatusState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(confirmedStatusState.productionStatusUpdateAttempts, 1, 'GET-only recovery leaves the confirmed status write count unchanged');
  assert.equal(confirmedStatusState.productionDetailReadAttempts, confirmedStatusDetailReads + 1, 'status recovery performs exactly one detail GET');

  if (process.env.XMT_PRODUCTION_STATUS_RECOVERY_ONLY === '1') {
    assert.equal(expectedReview503ConsoleErrors, 0, 'all injected refresh failures are accounted for');
    assert.equal(expectedProduction404ConsoleErrors, 0, 'deleted-record readbacks are accounted for as expected');
    assert.deepEqual(errors, [], 'status refresh recovery does not cause page errors');
    throw statusRefreshRecoveryOnlyComplete;
  }

  await page.request.post(`${base}/__qa/reset-review-fixture`);
  await page.reload();
  await page.getByRole('button', { name: '提交审核', exact: true }).first().waitFor();

  const toolbarContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const toolbarPage = await toolbarContext.newPage();
  toolbarPage.setDefaultTimeout(5000);
  const toolbarErrors: string[] = [];
  const nativeDialogTypes: string[] = [];
  toolbarPage.on('dialog', (dialog) => {
    nativeDialogTypes.push(dialog.type());
    void dialog.dismiss();
  });
  toolbarPage.on('pageerror', (error) => toolbarErrors.push(error.message));
  toolbarPage.on('console', (message) => { if (message.type() === 'error') toolbarErrors.push(message.text()); });
  await toolbarPage.goto(`${base}/__qa`);
  await toolbarPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  const editorToolbar = toolbarPage.locator('.editor-toolbar').filter({ has: toolbarPage.locator('button[title^="格式刷"]') }).first();
  await editorToolbar.waitFor({ state: 'visible' });

  const findReplaceTrigger = toolbarPage.getByRole('button', { name: '查找替换', exact: true }).last();
  const findReplacePanel = toolbarPage.getByRole('search', { name: '编辑器查找替换' });
  const waitForFocus = async (locator: import('playwright').Locator) => {
    const target = await locator.elementHandle();
    assert.ok(target, 'the focus return target remains mounted');
    await toolbarPage.waitForFunction((element) => document.activeElement === element, target);
  };
  await findReplaceTrigger.click();
  await findReplacePanel.waitFor({ state: 'visible' });
  await toolbarPage.getByLabel('查找内容').press('Escape');
  await findReplacePanel.waitFor({ state: 'hidden' });
  await waitForFocus(findReplaceTrigger);
  assert.equal(await findReplaceTrigger.evaluate((button) => button === document.activeElement), true, 'Escape returns focus to the toolbar trigger without editing the manuscript');

  await findReplaceTrigger.click();
  await findReplacePanel.waitFor({ state: 'visible' });
  await toolbarPage.getByRole('button', { name: '关闭查找替换', exact: true }).click();
  await findReplacePanel.waitFor({ state: 'hidden' });
  await waitForFocus(findReplaceTrigger);
  assert.equal(await findReplaceTrigger.evaluate((button) => button === document.activeElement), true, 'the close button returns focus to the toolbar trigger');

  const manuscriptEditor = toolbarPage.locator('.ProseMirror').filter({ hasText: '第一段文字需要审阅。' }).first();
  await manuscriptEditor.focus();
  await manuscriptEditor.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
  await findReplacePanel.waitFor({ state: 'visible' });
  await toolbarPage.getByLabel('查找内容').press('Escape');
  await findReplacePanel.waitFor({ state: 'hidden' });
  await waitForFocus(manuscriptEditor);
  assert.equal(await manuscriptEditor.evaluate((element) => element === document.activeElement), true, 'the keyboard shortcut returns focus to the manuscript editor');
  assert.deepEqual((await toolbarPage.request.get(`${base}/__qa/state`).then((response) => response.json())).savedContents, [], 'find/replace focus handling does not save or modify the manuscript');

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
      await setViewportAtBrowserZoom(page, viewport, zoom);
      await setViewportAtBrowserZoom(toolbarPage, viewport, zoom);

      for (const [control, label] of [
        [productionDetailReturn, '创作详情返回管理'],
        [productionTopicLinks.first(), '创作详情顶部关联选题'],
        [productionTopicLinks.last(), '创作详情侧栏关联选题'],
        [productionHistorySidebarToggle, '创作详情历史侧栏开关'],
      ] as const) {
        await assertMinimumTapTarget(control, `${viewport.width}px / ${zoom * 100}% ${label}`);
      }

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
  await page.setViewportSize({ width: 1440, height: 960 });

  const themeContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const themePage = await themeContext.newPage();
  themePage.setDefaultTimeout(5000);
  for (const theme of ['light', 'dark'] as const) {
    await themePage.goto(`${base}/__qa?theme=${theme}`);
    await themePage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
    for (const [label, locator] of [
      ['Studio 品牌字标', themePage.getByRole('complementary').getByText('Studio', { exact: true })],
      ['侧栏未激活分组', themePage.getByRole('complementary').getByRole('button', { name: '工作台' }).first()],
      ['编辑器工具分组', themePage.getByText('文件', { exact: true })],
      ['审阅说明', themePage.getByText('讨论和审阅建议绑定到稿件版本，不会自动覆盖正文。', { exact: true })],
      ['关联选题分区标题', themePage.getByText('关联选题', { exact: true })],
    ] as const) {
      const ratio = await renderedTextContrastRatio(locator);
      assert.ok(ratio >= 4.5, `${label} 在 ${theme} 主题的实际合成对比度应至少 4.5:1，实际 ${ratio.toFixed(2)}:1`);
    }
    const topicLink = themePage.getByRole('button', { name: '协作审阅稿件', exact: true }).first();
    await topicLink.hover();
    await themePage.waitForTimeout(350);
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

  const toolbarZoomViewport = await setViewportAtBrowserZoom(toolbarPage, { width: 1024, height: 900 }, 1.25);
  await toolbarPage.waitForTimeout(100);
  await editorToolbar.evaluate((element) => element.scrollIntoView({ block: 'end', inline: 'nearest' }));
  const moreTools = editorToolbar.locator('button[title="更多操作"]');
  await moreTools.waitFor({ state: 'visible' });
  const toolbarAccess = await moreTools.last().evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const topbarRect = document.querySelector('header')?.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(buttonRect.x + buttonRect.width / 2, buttonRect.y + buttonRect.height / 2);
    return {
      buttonTop: buttonRect.top,
      topbarBottom: topbarRect?.bottom ?? 0,
      receivesPointer: hitTarget === button || button.contains(hitTarget),
      hitTag: hitTarget?.tagName,
      hitLabel: hitTarget?.textContent?.trim().slice(0, 48),
    };
  });
  assert.ok(toolbarAccess.buttonTop >= toolbarAccess.topbarBottom - 1 && toolbarAccess.receivesPointer,
    `editor toolbar remains reachable below the sticky app header at 1024px / 125%: ${JSON.stringify(toolbarAccess)}`);
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
  assert.ok(compactActionBounds && compactActionBounds.x >= 0 && compactActionBounds.x + compactActionBounds.width <= toolbarZoomViewport.width && compactActionBounds.y >= 0 && compactActionBounds.y + compactActionBounds.height <= toolbarZoomViewport.height, `collapsed toolbar menu action stays in the effective ${toolbarZoomViewport.width}x${toolbarZoomViewport.height} CSS viewport: ${JSON.stringify(compactActionBounds)}`);
  await toolbarPage.screenshot({ path: '/tmp/xmt-production-editor-toolbar-1024.png', fullPage: true });
  await toolbarPage.keyboard.press('Escape');

  await toolbarPage.setViewportSize({ width: 320, height: 812 });
  await moreTools.last().scrollIntoViewIfNeeded();
  await moreTools.last().click();
  const narrowMoreMenu = editorToolbar.locator('div.absolute.w-56').last();
  await narrowMoreMenu.waitFor({ state: 'visible' });
  const narrowMoreMenuBounds = await narrowMoreMenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.ok(narrowMoreMenuBounds.x >= 0 && narrowMoreMenuBounds.right <= narrowMoreMenuBounds.viewportWidth,
    `collapsed toolbar menu stays horizontally inside a 320px viewport: ${JSON.stringify(narrowMoreMenuBounds)}`);
  assert.ok(narrowMoreMenuBounds.y >= 0 && narrowMoreMenuBounds.bottom <= narrowMoreMenuBounds.viewportHeight,
    `collapsed toolbar menu stays vertically inside a 320x812px viewport: ${JSON.stringify(narrowMoreMenuBounds)}`);
  await editorToolbar.getByRole('button', { name: '左对齐', exact: true }).waitFor({ state: 'visible' });
  await moreTools.last().click();

  await toolbarPage.setViewportSize({ width: 1200, height: 839 });
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
  const dropdownCases = [
    { trigger: 'button[title="标题层级"]', menuText: '标题 1', name: '标题层级' },
    { trigger: 'button[title="文字颜色"]', menuText: '文字颜色', name: '文字颜色' },
    { trigger: 'button[title="高亮颜色"]', menuText: '高亮颜色', name: '高亮颜色' },
    { trigger: 'button[title="更多操作"]', menuText: '左对齐', name: '更多操作' },
  ];
  for (const { viewport, zoom, label } of [
    { viewport: { width: 1024, height: 600 }, zoom: 1.25, label: '1024x600 at 125% zoom' },
    { viewport: { width: 320, height: 812 }, zoom: 1, label: '320x812' },
  ]) {
    await setViewportAtBrowserZoom(toolbarPage, viewport, zoom);
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
          toolbarLeft: element.closest('.editor-toolbar')?.getBoundingClientRect().left ?? 0,
          toolbarRight: element.closest('.editor-toolbar')?.getBoundingClientRect().right ?? innerWidth,
          clippedBy,
        };
      });
      assert.ok(geometry.x >= -1 && geometry.right <= geometry.viewportWidth + 1 && geometry.y >= -1 && geometry.bottom <= geometry.viewportHeight + 1, `${name} menu stays in the ${label} CSS viewport: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.x >= Math.max(8, geometry.toolbarLeft) - 1 && geometry.right <= Math.min(geometry.viewportWidth - 8, geometry.toolbarRight) + 1,
        `${name} menu stays inside the editor toolbar column and clear of the navigation sidebar in the ${label} CSS viewport: ${JSON.stringify(geometry)}`);
      assert.deepEqual(geometry.clippedBy, [], `${name} menu is not clipped by an ancestor in the ${label} CSS viewport: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.bottom <= (geometry.triggerTop ?? 0) + 1 || geometry.y >= (geometry.triggerBottom ?? 0) - 1, `${name} menu stays adjacent to its trigger: ${JSON.stringify(geometry)}`);
      if (name === '文字颜色') {
        const swatchTargets = await menu.locator('button[title]').evaluateAll((elements) => elements.map((element) => {
          const rect = element.getBoundingClientRect();
          const hitTarget = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return { name: element.getAttribute('title'), receivesPointer: hitTarget === element || element.contains(hitTarget) };
        }));
        assert.ok(swatchTargets.length > 0 && swatchTargets.every((swatch) => swatch.receivesPointer),
          `all ${name} swatches remain clickable above the navigation sidebar in the ${label} CSS viewport: ${JSON.stringify(swatchTargets)}`);
      }
      await trigger.click();
    }
  }

  await toolbarPage.setViewportSize({ width: 1440, height: 960 });
  for (const theme of ['light', 'dark'] as const) {
    await toolbarPage.goto(`${base}/__qa?theme=${theme}`);
    await toolbarPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor().catch(async (error) => {
      const pageState = {
        url: toolbarPage.url(),
        title: await toolbarPage.title(),
        text: (await toolbarPage.locator('body').innerText().catch(() => '')).slice(0, 1200),
      };
      throw new Error(`toolbar theme page did not load: ${error instanceof Error ? error.message : String(error)}; ${JSON.stringify(pageState)}`);
    });
    for (const { triggerTitle, panelTitle } of [
      { triggerTitle: '文字颜色', panelTitle: '文字颜色' },
      { triggerTitle: '高亮颜色', panelTitle: '高亮颜色' },
    ]) {
      const trigger = toolbarPage.locator(`.editor-toolbar button[title="${triggerTitle}"]`).last();
      await trigger.click();
      const popover = toolbarPage.locator('.editor-toolbar div.absolute.z-50').filter({ hasText: panelTitle }).last();
      await popover.waitFor({ state: 'visible' });
      const label = popover.getByText(panelTitle, { exact: true });
      const labelClass = await label.getAttribute('class');
      const contrast = await renderedTextContrastRatio(label);
      assert.ok(labelClass?.includes('text-studio-text-secondary'), `${theme} ${panelTitle} toolbar title uses the shared Studio secondary-text token`);
      assert.ok(contrast >= 4.5, `${theme} ${panelTitle} toolbar title meets 4.5:1 contrast; actual ${contrast.toFixed(2)}:1`);
      await trigger.click();
    }
  }

  const bubbleEditor = toolbarPage.locator('.ProseMirror').filter({ hasText: '第一段文字需要审阅。' }).first();
  const selectToolbarParagraph = async (editor: typeof bubbleEditor) => {
    const reviewParagraph = '第一段文字需要审阅。';
    await toolbarPage.getByText('当前没有协作者正在编辑正文。', { exact: true }).waitFor();
    await toolbarPage.waitForTimeout(250);
    await toolbarPage.waitForFunction(() => Array.from(document.querySelectorAll('.ProseMirror p')).some((paragraph) => {
      if (!paragraph.textContent?.includes('第一段文字需要审阅。')) return false;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const rect = range.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }));
    await editor.waitFor({ state: 'visible' });
    const paragraph = editor.locator('p').filter({ hasText: reviewParagraph }).first();
    await paragraph.scrollIntoViewIfNeeded();
    await paragraph.click({ position: { x: 1, y: 1 } });
    await toolbarPage.keyboard.press('Home');
    for (let index = 0; index < reviewParagraph.length; index += 1) {
      await toolbarPage.keyboard.press('Shift+ArrowRight');
    }
  };

  const responsiveBubbleContext = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const responsiveBubblePage = await responsiveBubbleContext.newPage();
  responsiveBubblePage.setDefaultTimeout(5000);
  const responsiveBubbleStateBefore = await responsiveBubblePage.request.get(`${base}/__qa/state`).then((response) => response.json());
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390]) {
      await responsiveBubblePage.setViewportSize({ width, height: 844 });
      await responsiveBubblePage.goto(`${base}/__qa?theme=${theme}`);
      const editor = responsiveBubblePage.locator('.ProseMirror').filter({ hasText: '第一段文字需要审阅。' }).first();
      await editor.waitFor({ state: 'visible' });
      await responsiveBubblePage.getByText('当前没有协作者正在编辑正文。', { exact: true }).waitFor();
      await responsiveBubblePage.waitForTimeout(250);
      await editor.waitFor({ state: 'visible' });
      const paragraph = editor.locator('p').filter({ hasText: '第一段文字需要审阅。' }).first();
      await paragraph.scrollIntoViewIfNeeded();
      await paragraph.click({ position: { x: 1, y: 1 } });
      await responsiveBubblePage.keyboard.press('Home');
      for (let index = 0; index < '第一段文字需要审阅。'.length; index += 1) await responsiveBubblePage.keyboard.press('Shift+ArrowRight');
      const menu = responsiveBubblePage.locator('.z-editor-menu');
      await menu.waitFor({ state: 'visible' });
      const menuGeometry = await menu.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      assert.ok(menuGeometry.x >= 0 && menuGeometry.right <= width && menuGeometry.y >= 0 && menuGeometry.bottom <= 844,
        `${theme} BubbleMenu stays inside ${width}x844 after selecting text: ${JSON.stringify(menuGeometry)}`);
      const menuButtons = await menu.locator('button').evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const hitTarget = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { name: element.getAttribute('title') || element.textContent?.trim(), x: rect.x, right: rect.right, width: rect.width, height: rect.height, receivesPointer: hitTarget === element || element.contains(hitTarget) };
      }));
      assert.ok(menuButtons.length >= 14 && menuButtons.every((button) => button.x >= 0 && button.right <= width && button.width >= 40 && button.height >= 40 && button.receivesPointer),
        `${theme} BubbleMenu controls remain fully visible and touchable at ${width}px: ${JSON.stringify(menuButtons)}`);
      const hoverTrigger = menu.locator('button[title="高亮"]');
      await hoverTrigger.hover();
      const hoverContrast = await renderedTextContrastRatio(hoverTrigger);
      assert.ok(hoverContrast >= 4.5, `${theme} BubbleMenu hover icon contrast stays at least 4.5:1; actual ${hoverContrast.toFixed(2)}:1`);
      const colorTrigger = menu.locator('button[title="文字颜色"]');
      await colorTrigger.click();
      const colorPopover = responsiveBubblePage.locator('.z-editor-menu div.absolute.z-50').filter({ hasText: '文字颜色' }).last();
      await colorPopover.waitFor({ state: 'visible' });
      const colorPopoverGeometry = await colorPopover.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      assert.ok(colorPopoverGeometry.x >= 0 && colorPopoverGeometry.right <= width && colorPopoverGeometry.y >= 0 && colorPopoverGeometry.bottom <= 844,
        `${theme} BubbleMenu color popover stays inside ${width}x844: ${JSON.stringify(colorPopoverGeometry)}`);
      assert.ok(await renderedTextContrastRatio(colorPopover.getByText('文字颜色', { exact: true })) >= 4.5,
        `${theme} BubbleMenu color popover label remains readable at ${width}px`);
      const swatchBounds = await colorPopover.locator('button').evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, x: rect.x, right: rect.right };
      }));
      assert.ok(swatchBounds.every((bounds) => bounds.width >= 40 && bounds.height >= 40 && bounds.x >= 0 && bounds.right <= width),
        `${theme} BubbleMenu color swatches remain touchable at ${width}px: ${JSON.stringify(swatchBounds)}`);
      await colorTrigger.click();
      const highlightTrigger = menu.locator('button[title="高亮"]');
      await highlightTrigger.click();
      const highlightPopover = responsiveBubblePage.locator('.z-editor-menu div.absolute.z-50').filter({ hasText: '高亮颜色' }).last();
      await highlightPopover.waitFor({ state: 'visible' });
      const highlightPopoverGeometry = await highlightPopover.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      assert.ok(highlightPopoverGeometry.x >= 0 && highlightPopoverGeometry.right <= width && highlightPopoverGeometry.y >= 0 && highlightPopoverGeometry.bottom <= 844,
        `${theme} BubbleMenu highlight popover stays inside ${width}x844: ${JSON.stringify(highlightPopoverGeometry)}`);
      assert.ok(await renderedTextContrastRatio(highlightPopover.getByText('高亮颜色', { exact: true })) >= 4.5,
        `${theme} BubbleMenu highlight popover label remains readable at ${width}px`);
      const highlightSwatchBounds = await highlightPopover.locator('button').evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, x: rect.x, right: rect.right };
      }));
      assert.ok(highlightSwatchBounds.every((bounds) => bounds.width >= 40 && bounds.height >= 40 && bounds.x >= 0 && bounds.right <= width),
        `${theme} BubbleMenu highlight swatches remain touchable at ${width}px: ${JSON.stringify(highlightSwatchBounds)}`);
      await highlightTrigger.click();
      assert.ok(await responsiveBubblePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth),
        `${theme} BubbleMenu interactions do not introduce horizontal page overflow at ${width}px`);
    }
  }
  const responsiveBubbleStateAfter = await responsiveBubblePage.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.deepEqual(responsiveBubbleStateAfter.savedContents, responsiveBubbleStateBefore.savedContents, 'BubbleMenu responsive checks do not save the manuscript');
  assert.equal(responsiveBubbleStateAfter.content, responsiveBubbleStateBefore.content, 'BubbleMenu responsive checks do not modify manuscript content');
  await responsiveBubbleContext.close();

  await selectToolbarParagraph(bubbleEditor);
  assert.equal(await toolbarPage.evaluate(() => window.getSelection()?.toString()), '第一段文字需要审阅。');
  for (const { triggerTitle, panelTitle } of [
    { triggerTitle: '高亮', panelTitle: '高亮颜色' },
    { triggerTitle: '文字颜色', panelTitle: '文字颜色' },
  ]) {
    const trigger = toolbarPage.locator(`button[title="${triggerTitle}"]`).last();
    await trigger.waitFor({ state: 'visible' });
    await trigger.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }));
    const triggerBounds = await trigger.boundingBox();
    const triggerViewport = await toolbarPage.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.ok(triggerBounds
      && triggerBounds.x >= 0
      && triggerBounds.y >= 0
      && triggerBounds.x + triggerBounds.width <= triggerViewport.width
      && triggerBounds.y + triggerBounds.height <= triggerViewport.height,
    `${triggerTitle} bubble trigger is inside the viewport before click: ${JSON.stringify({ bounds: triggerBounds, viewport: triggerViewport })}`);
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
    await trigger.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }));
    const triggerBounds = await trigger.boundingBox();
    const triggerViewport = await toolbarPage.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.ok(triggerBounds
      && triggerBounds.x >= 0
      && triggerBounds.y >= 0
      && triggerBounds.x + triggerBounds.width <= triggerViewport.width
      && triggerBounds.y + triggerBounds.height <= triggerViewport.height,
    `${triggerTitle} dark bubble trigger is inside the viewport before click: ${JSON.stringify({ bounds: triggerBounds, viewport: triggerViewport })}`);
    await trigger.click();
    const popover = trigger.locator('xpath=..').locator('div.absolute.z-50').filter({ hasText: panelTitle }).last();
    await popover.waitFor({ state: 'visible' });
    const labelContrast = await renderedTextContrastRatio(popover.getByText(panelTitle, { exact: true }));
    assert.ok(labelContrast >= 4.5, `${panelTitle} bubble popover label meets 4.5:1 contrast in dark theme; actual ${labelContrast.toFixed(2)}:1`);
    await trigger.click();
  }

  const exportZoomViewport = await setViewportAtBrowserZoom(toolbarPage, { width: 1920, height: 600 }, 1.25);
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
  assert.ok(exportGeometry.x >= -1 && exportGeometry.right <= exportGeometry.viewportWidth + 1 && exportGeometry.y >= -1 && exportGeometry.bottom <= exportGeometry.viewportHeight + 1, `export menu stays in the effective ${exportZoomViewport.width}x${exportZoomViewport.height} CSS viewport for 1920x600 at 125% zoom: ${JSON.stringify(exportGeometry)}`);
  assert.ok(exportGeometry.bottom <= (exportGeometry.triggerTop ?? 0) + 1 || exportGeometry.y >= (exportGeometry.triggerBottom ?? 0) - 1, `export menu stays adjacent to its trigger: ${JSON.stringify(exportGeometry)}`);
  await exportTrigger.click();

  await toolbarPage.setViewportSize({ width: 1440, height: 960 });
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
  await contextColorSubmenu.waitFor({ state: 'hidden' });
  await contextMenu.waitFor({ state: 'visible' });
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
  await contextHighlightSubmenu.waitFor({ state: 'hidden' });
  await contextMenu.waitFor({ state: 'visible' });
  await toolbarPage.keyboard.press('Escape');
  await contextMenu.waitFor({ state: 'hidden' });

  const contextKeyboardEditor = toolbarPage.locator('.ProseMirror').filter({ hasText: '第一段文字需要审阅' }).first();
  const contextKeyboardBefore = await toolbarPage.request.get(`${base}/__qa/state`).then((response) => response.json());
  await contextKeyboardEditor.focus();
  await toolbarPage.keyboard.press('Shift+F10');
  await contextMenu.waitFor({ state: 'visible' });
  const initialKeyboardFocus = await contextMenu.evaluate((menu) => (menu.ownerDocument.activeElement as HTMLElement | null)?.textContent?.trim());
  assert.ok(initialKeyboardFocus?.includes('粘贴'), `keyboard context-menu invocation moves focus into the menu: ${initialKeyboardFocus}`);
  await toolbarPage.mouse.move(0, 0);
  for (let index = 0; index < 5; index += 1) await toolbarPage.keyboard.press('Tab');
  const textColorTrigger = contextMenu.getByRole('button', { name: '文字颜色', exact: true });
  assert.equal(await textColorTrigger.getAttribute('aria-expanded'), 'true', 'tabbing to the text-color button opens its accessible color group');
  const textColorPanel = contextMenu.getByTestId('editor-context-color-submenu');
  await textColorPanel.waitFor({ state: 'visible' });
  await toolbarPage.keyboard.press('ArrowRight');
  const defaultTextColor = contextMenu.getByRole('button', { name: '文字颜色：默认' });
  await defaultTextColor.waitFor({ state: 'visible' });
  assert.equal(await defaultTextColor.evaluate((button) => button === document.activeElement), true, 'ArrowRight moves focus into the text-color choices');
  await toolbarPage.keyboard.press('Escape');
  assert.equal(await textColorTrigger.getAttribute('aria-expanded'), 'false', 'Escape closes the focused text-color group');
  assert.equal(await textColorTrigger.evaluate((button) => button === document.activeElement), true, 'closing the color group restores focus to its trigger');
  await toolbarPage.keyboard.press('Tab');
  const highlightColorTrigger = contextMenu.getByRole('button', { name: '高亮颜色', exact: true });
  assert.equal(await highlightColorTrigger.evaluate((button) => button === document.activeElement), true, 'the next keyboard stop after the closed palette is the highlight button');
  assert.equal(await highlightColorTrigger.getAttribute('aria-expanded'), 'true', 'the highlight button exposes its expanded state when focused');
  await toolbarPage.keyboard.press('ArrowRight');
  const firstHighlightColor = contextMenu.getByRole('button', { name: '高亮颜色：黄色' });
  await firstHighlightColor.waitFor({ state: 'visible' });
  assert.equal(await firstHighlightColor.evaluate((button) => button === document.activeElement), true, 'ArrowRight moves focus into the highlight choices');
  await toolbarPage.keyboard.press('Escape');
  assert.equal(await highlightColorTrigger.evaluate((button) => button === document.activeElement), true, 'closing the highlight group restores focus to its trigger');
  await toolbarPage.keyboard.press('Escape');
  await contextMenu.waitFor({ state: 'hidden' });
  assert.equal(await contextKeyboardEditor.evaluate((editor) => editor === document.activeElement), true, 'Escape from the context menu restores focus to the editor');
  await contextKeyboardEditor.focus();
  await toolbarPage.keyboard.press('ContextMenu');
  await contextMenu.waitFor({ state: 'visible' });
  const contextKeyFocus = await contextMenu.evaluate((menu) => (menu.ownerDocument.activeElement as HTMLElement | null)?.textContent?.trim());
  assert.ok(contextKeyFocus?.includes('粘贴'), `ContextMenu key opens the menu and moves focus into it: ${contextKeyFocus}`);
  await toolbarPage.keyboard.press('Escape');
  await contextMenu.waitFor({ state: 'hidden' });
  assert.equal(await contextKeyboardEditor.evaluate((editor) => editor === document.activeElement), true, 'Escape after the ContextMenu key restores focus to the editor');
  const contextKeyboardAfter = await toolbarPage.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(contextKeyboardAfter.content, contextKeyboardBefore.content, 'keyboard navigation leaves the manuscript content unchanged');
  assert.equal(contextKeyboardAfter.apiMutationAttempts, contextKeyboardBefore.apiMutationAttempts, 'keyboard navigation sends no business write requests');

  await toolbarPage.setViewportSize({ width: 1440, height: 960 });
  await toolbarPage.goto(`${base}/__qa?theme=light`);
  await toolbarPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  const commentEditor = toolbarPage.locator('.ProseMirror').filter({ hasText: '第一段文字需要审阅。' }).first();
  await toolbarPage.getByText('当前没有协作者正在编辑正文。', { exact: true }).waitFor();
  await toolbarPage.waitForTimeout(250);
  await commentEditor.waitFor({ state: 'visible' });

  const imagePromptBefore = await toolbarPage.request.get(`${base}/__qa/state`).then((response) => response.json());
  const commentEditorToolbar = toolbarPage.locator('.editor-toolbar').filter({ has: toolbarPage.locator('button[title^="格式刷"]') }).last();
  await commentEditorToolbar.locator('button[title="更多操作"]').click();
  const imageMenu = toolbarPage.locator('.editor-toolbar div.absolute.z-50').filter({ hasText: '图片' }).last();
  await imageMenu.getByRole('button', { name: '图片', exact: true }).click();
  const imagePrompt = toolbarPage.getByRole('dialog', { name: '插入图片' });
  await imagePrompt.waitFor({ state: 'visible' });
  assert.equal(await imagePrompt.getAttribute('aria-modal'), 'true', 'image URL entry uses an accessible in-app modal');
  await imagePrompt.getByLabel('图片 URL').fill('https://example.invalid/image.png');
  await imagePrompt.getByRole('button', { name: '取消', exact: true }).click();
  await imagePrompt.waitFor({ state: 'hidden' });
  assert.equal(await commentEditor.locator('img').count(), 0, 'canceling image URL entry leaves the manuscript unchanged');
  const imagePromptAfter = await toolbarPage.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(imagePromptAfter.content, imagePromptBefore.content, 'canceling image URL entry preserves the saved draft');
  assert.equal(imagePromptAfter.apiMutationAttempts, imagePromptBefore.apiMutationAttempts, 'canceling image URL entry sends no business write');

  await selectToolbarParagraph(commentEditor);
  await commentEditorToolbar.locator('button[title="更多操作"]').click();
  const linkMenu = toolbarPage.locator('.editor-toolbar div.absolute.z-50').filter({ hasText: '链接' }).last();
  await linkMenu.getByRole('button', { name: '链接', exact: true }).click();
  const linkPrompt = toolbarPage.getByRole('dialog', { name: '插入链接' });
  await linkPrompt.waitFor({ state: 'visible' });
  assert.equal(await linkPrompt.evaluate((dialog) => dialog.parentElement === document.body), true, 'link URL dialog escapes editor clipping and transform containers');
  const linkInput = linkPrompt.getByLabel('链接 URL');
  await linkInput.fill('https://example.invalid/review');
  await linkInput.press('Enter');
  await linkPrompt.waitFor({ state: 'hidden' });
  await commentEditor.locator('a[href="https://example.invalid/review"]').waitFor({ state: 'visible' });
  assert.deepEqual(nativeDialogTypes, [], 'link and image URL entry does not open blocking browser dialogs');

  await toolbarPage.request.post(`${base}/__qa/reset-review-fixture`);
  await toolbarPage.goto(`${base}/__qa?theme=light`);
  await toolbarPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  const cleanCommentEditor = toolbarPage.locator('.ProseMirror').filter({ hasText: '第一段文字需要审阅。' }).first();
  await toolbarPage.locator('.editor-toolbar button[title="更多操作"]').last().click();
  await toolbarPage.getByRole('button', { name: '批注', exact: true }).last().click();
  await toolbarPage.getByText('选中要添加批注的文字后，再选择添加批注。', { exact: true }).waitFor({ state: 'visible' });
  assert.deepEqual(nativeDialogTypes, [], 'requesting a comment without a selection does not open a browser alert');

  await selectToolbarParagraph(cleanCommentEditor);
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
  const commentPopupAction = toolbarPage.getByRole('button', { name: '编辑批注', exact: true });
  const commentPopup = commentPopupAction.locator('..');
  await commentPopupAction.waitFor({ state: 'visible' });
  assert.equal(await commentPopup.evaluate((menu) => menu.parentElement === document.body), true, 'inline comment actions escape transformed page and editor ancestors');
  await toolbarPage.keyboard.press('Escape');
  await commentPopup.waitFor({ state: 'hidden' });
  await toolbarPage.setViewportSize({ width: 320, height: 568 });
  await inlineComment.evaluate((element) => element.scrollIntoView({ block: 'end' }));
  await inlineComment.click();
  await commentPopupAction.waitFor({ state: 'visible' });
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
  assert.deepEqual(nativeDialogTypes, [], 'the editor never opens native prompt or alert dialogs');
  assert.deepEqual(toolbarErrors, [], 'editor toolbar and comment dialogs render without browser errors or warnings');
  await toolbarContext.close();

  const paragraph = page.locator('.ProseMirror p').filter({ hasText: '第一段文字需要审阅。' }).first();
  const selectRange = async (from: number, to: number) => {
    await paragraph.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await paragraph.evaluate((element) => {
      const text = element.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected a plain-text review paragraph');
    });
    await paragraph.click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('Home');
    for (let index = 0; index < from; index += 1) {
      await page.keyboard.press('ArrowRight');
    }
    for (let index = from; index < to; index += 1) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.waitForFunction((expected) => window.getSelection()?.toString() === expected, '第一段文字需要审阅。'.slice(from, to));
  };

  await selectRange(0, 3);
  assert.equal(await page.evaluate(() => window.getSelection()?.toString()), '第一段'.slice(0, 3));
  await page.getByRole('button', { name: '给选中文字加批注' }).click();
  const reviewCommentInput = page.getByLabel('批注内容');
  const submitComment = page.getByRole('button', { name: '提交', exact: true });
  await reviewCommentInput.fill('请补充这段的依据。');
  await page.request.post(`${base}/__qa/fail-next-review-thread-create`);
  expectedReview503ConsoleErrors += 1;
  await submitComment.click();
  await page.getByText('服务端尚未找到这条批注请求。原内容已锁定，可使用同一请求编号安全重试。', { exact: true }).waitFor();
  assert.equal(await reviewCommentInput.inputValue(), '请补充这段的依据。', 'a failed review-thread write preserves the form for explicit retry');
  assert.equal(await reviewCommentInput.isDisabled(), true, 'a failed review-thread write locks the exact original payload until retry');
  const failedThreadRequestId = await page.evaluate((key) => {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value).requestId : null;
  }, `xmt:production-review-thread:v1:${user.id}:${productionId}`);
  assert.equal(typeof failedThreadRequestId, 'string', 'thread request recovery is stored before the first POST');

  await page.request.post(`${base}/__qa/hold-next-review-thread-create`);
  const createThreadResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith(`/api/workflow/production/${productionId}/review-threads`)
    && response.status() === 201);
  await page.getByRole('button', { name: '使用原请求重试', exact: true }).click();
  await page.getByRole('button', { name: '正在保存…', exact: true }).waitFor();
  assert.equal(await reviewCommentInput.isDisabled(), true, 'thread summary is locked until the server confirms the write');
  assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isDisabled(), true, 'the composer cannot be discarded while its write is pending');
  assert.equal(await page.getByRole('button', { name: '取消编辑', exact: true }).isDisabled(), true, 'the composer close action is locked while its write is pending');
  assert.equal(await page.getByRole('button', { name: '给选中文字加批注' }).isDisabled(), true, 'another composer cannot replace the pending form');
  await page.waitForFunction(async () => (await fetch('/__qa/state').then((response) => response.json())).reviewThreadCreateAttempts === 2);
  const pendingThreadState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(pendingThreadState.threads.length, 0, 'a pending request is not presented as a confirmed thread');
  assert.equal(pendingThreadState.reviewThreadRequestIds[0], pendingThreadState.reviewThreadRequestIds[1],
    'the explicit retry reuses the exact request ID from the failed attempt');
  await page.request.post(`${base}/__qa/release-review-thread-create`);
  await createThreadResponse;
  await page.getByText('请补充这段的依据。').waitFor();
  const replyInput = page.getByLabel('回复内容').first();
  const replyButton = page.getByRole('button', { name: /^(回复|使用原编号安全重试|重新核实结果)$/ });
  await replyInput.fill('我会补充来源说明。');
  await page.request.post(`${base}/__qa/fail-next-review-reply`);
  expectedReview503ConsoleErrors += 1;
  await replyButton.click();
  await page.getByText('尚未找到原请求；可安全地使用同一编号重试。', { exact: true }).waitFor();
  assert.equal(await replyInput.inputValue(), '我会补充来源说明。', 'a failed reply preserves its draft for explicit retry');
  assert.equal(await replyInput.isDisabled(), true, 'an uncertain reply keeps its original content locked until resolution');
  assert.equal(await page.getByRole('button', { name: '使用原编号安全重试', exact: true }).isEnabled(), true, 'a confirmed not-found result allows an explicit same-request retry');

  await page.request.post(`${base}/__qa/hold-next-review-reply`);
  const replyResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith(`/api/workflow/production/${productionId}/review-threads/1/replies`)
    && response.status() === 201);
  await replyButton.click();
  await page.getByRole('button', { name: '正在回复…', exact: true }).waitFor();
  assert.equal(await replyInput.isDisabled(), true, 'reply text is locked until the server confirms the write');
  assert.equal(await page.getByRole('button', { name: '结束讨论', exact: true }).isDisabled(), true, 'thread status cannot race a pending reply');
  await page.waitForFunction(async () => (await fetch('/__qa/state').then((response) => response.json())).reviewReplyAttempts === 2);
  const pendingReplyState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(pendingReplyState.threads[0].replies.length, 0, 'the pending reply is not presented as confirmed');
  assert.equal(pendingReplyState.reviewReplyRequestIds[0], pendingReplyState.reviewReplyRequestIds[1],
    'the explicit retry reuses the exact request ID from the failed attempt');
  await page.request.post(`${base}/__qa/release-review-reply`);
  await replyResponse;
  await page.getByText('我会补充来源说明。').waitFor();
  assert.equal(await replyInput.inputValue(), '', 'the confirmed reply is cleared only after its exact draft has been saved');

  await replyInput.fill('需要恢复核实的回复。');
  await page.request.post(`${base}/__qa/fail-next-review-reply-after-commit`);
  await page.request.post(`${base}/__qa/fail-next-review-reply-status-read`);
  expectedReview503ConsoleErrors += 2;
  await replyButton.click();
  await page.getByText('回复结果暂时无法核实。原内容已锁定，请重新核实后再操作。', { exact: true }).waitFor();
  assert.equal(await replyInput.inputValue(), '需要恢复核实的回复。', 'an unavailable status read preserves the original reply draft');
  assert.equal(await replyInput.isDisabled(), true, 'an unavailable status read never unlocks the reply for a new request');
  const replyBeforeReload = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(replyBeforeReload.threads[0].replies.filter((reply: { content: string }) => reply.content === '需要恢复核实的回复。').length, 1, 'a committed response-loss fixture stores the reply exactly once');
  const replyRecoveryStorageKey = `xmt:production-review-reply:v1:${user.id}:${productionId}:1`;
  assert.notEqual(await page.evaluate((key) => sessionStorage.getItem(key), replyRecoveryStorageKey), null, 'an unverified reply keeps its same-request recovery marker across refresh');
  await page.reload();
  await page.getByText('需要恢复核实的回复。').waitFor();
  const replyInputAfterRecovery = page.getByLabel('回复内容').first();
  await page.waitForFunction(async ({ previousStatusReads, storageKey }: { previousStatusReads: number; storageKey: string }) => {
    const state = await (await fetch('/__qa/state')).json();
    return state.reviewReplyStatusReadAttempts > previousStatusReads && sessionStorage.getItem(storageKey) === null;
  }, { previousStatusReads: replyBeforeReload.reviewReplyStatusReadAttempts, storageKey: replyRecoveryStorageKey });
  assert.equal(await replyInputAfterRecovery.inputValue(), '', 'refresh confirms an already-saved reply and clears only its stored draft');
  const replyAfterRecovery = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(replyAfterRecovery.threads[0].replies.filter((reply: { content: string }) => reply.content === '需要恢复核实的回复。').length, 1, 'refresh recovery shows the committed reply exactly once');
  assert.equal(replyAfterRecovery.reviewReplyAttempts, 3, 'refresh verification performs no second reply POST');

  await selectRange(3, 7);
  await page.getByRole('button', { name: '提出修改建议' }).click();
  await page.getByLabel('建议替换为（留空表示建议删除）').fill('表达更清楚');
  await page.getByLabel('修改理由').fill('让表达更直接。');
  await page.getByRole('button', { name: '提交', exact: true }).click();
  await page.getByText('让表达更直接。').waitFor();
  await page.request.post(`${base}/__qa/hold-next-production-save`);
  const suggestionSaveResponse = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 200);
  await page.request.post(`${base}/__qa/fail-next-review-status-after-commit`);
  await page.request.post(`${base}/__qa/fail-next-review-status-status-read`);
  expectedReview503ConsoleErrors += 2;
  await page.getByRole('button', { name: '接受并保存' }).click();
  await page.getByRole('button', { name: '正在应用并保存…', exact: true }).waitFor();
  const editableManuscript = page.locator('.ProseMirror').filter({ hasText: '表达更清楚' }).first();
  await page.waitForFunction(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'false');
  assert.equal(await page.getByRole('button', { name: '小修保存' }).isDisabled(), true, 'version writes stay locked while accepting a suggestion saves manuscript text');
  assert.equal(await page.getByRole('button', { name: '正在应用并保存…', exact: true }).isDisabled(), true, 'suggestion acceptance is visibly locked during autosave');
  await page.waitForFunction(async () => (await fetch('/__qa/state').then((response) => response.json())).productionSaveAttempts > 0);
  const pendingSuggestionState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(pendingSuggestionState.threads[1].status, 'open', 'a suggestion is not marked accepted before the manuscript save is confirmed');
  await editableManuscript.screenshot({ path: '/tmp/xmt-production-review-suggestion-save-pending.png' });
  await page.request.post(`${base}/__qa/release-production-save`);
  await suggestionSaveResponse;
  await page.getByText('处理结果暂时无法核实。请先重新核实，勿再次执行正文替换或创建新请求。', { exact: true }).waitFor();
  const uncertainStatusState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(uncertainStatusState.threads[1].status, 'accepted', 'the isolated lost-response fixture committed the suggestion state before losing its reply');
  const statusRecoveryStorageKey = `xmt:production-review-status:v1:${user.id}:${productionId}:2`;
  const statusRecoveryRequestId = JSON.parse(await page.evaluate((key) => sessionStorage.getItem(key), statusRecoveryStorageKey) || 'null')?.requestId;
  assert.equal(typeof statusRecoveryRequestId, 'string', 'an uncertain status write keeps its request ID in session storage');
  const savesBeforeStatusVerification = uncertainStatusState.productionSaveAttempts;
  await page.getByRole('button', { name: '重新核实', exact: true }).click();
  await page.getByText('已采纳').waitFor();
  await page.locator('.ProseMirror').getByText('表达更清楚').waitFor();

  const state = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(state.threads.length, 2);
  assert.equal(state.threads[0].replies.length, 2, 'the confirmed reply and the response-loss recovery reply both appear exactly once');
  assert.equal(state.threads[0].replies.filter((reply: { content: string }) => reply.content === '我会补充来源说明。').length, 1);
  assert.equal(state.threads[0].replies.filter((reply: { content: string }) => reply.content === '需要恢复核实的回复。').length, 1);
  assert.equal(state.threads[1].status, 'accepted');
  assert.equal(state.reviewStatusAttempts, 1, 'recovery verifies the committed status without a second status mutation');
  assert.equal(state.reviewStatusStatusReadAttempts, 2, 'a failed status lookup can be retried explicitly and verified');
  assert.equal(state.productionSaveAttempts, savesBeforeStatusVerification, 'status recovery never reapplies or resaves the accepted suggestion body');
  assert.equal(state.reviewStatusRequestIds[0], statusRecoveryRequestId, 'the original status mutation uses its persisted request ID');
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), statusRecoveryStorageKey), null, 'verified status recovery clears its session marker');
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
  assert.equal(apiNetworkWarnings.length, failedRequests.filter((request) => request.includes('/api/') && request.endsWith('net::ERR_ABORTED')).length,
    'client network warnings correspond only to API requests intentionally aborted by browser navigation');
  assert.deepEqual(consoleProblems, [], `unexpected browser console problems; failed requests: ${JSON.stringify(failedRequests)}`);

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
  const narrowMobileToolbar = narrowMobilePage.locator('.editor-toolbar').first();
  const narrowMobileToolbarButton = narrowMobileToolbar.locator('button').first();
  await narrowMobileToolbarButton.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
  const narrowMobileToolbarAccess = await narrowMobileToolbarButton.evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const headerRect = document.querySelector('header')?.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(buttonRect.x + buttonRect.width / 2, buttonRect.y + buttonRect.height / 2);
    return {
      buttonTop: buttonRect.top,
      headerBottom: headerRect?.bottom ?? 0,
      receivesPointer: hitTarget === button || button.contains(hitTarget),
      hitTag: hitTarget?.tagName,
    };
  });
  assert.ok(narrowMobileToolbarAccess.buttonTop >= narrowMobileToolbarAccess.headerBottom - 1 && narrowMobileToolbarAccess.receivesPointer,
    `mobile editor toolbar remains reachable below the mobile app header at 320px: ${JSON.stringify(narrowMobileToolbarAccess)}`);
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
    if (name === '保存草稿' || name === '提交审核') {
      const navigation = await narrowMobilePage.locator('nav[aria-label="移动主导航"]').boundingBox();
      assert.ok(!navigation || bounds.bottom <= navigation.y + 1 || bounds.y >= navigation.y + navigation.height - 1,
        `${name} remains clear of the fixed mobile navigation: action=${JSON.stringify(bounds)}, navigation=${JSON.stringify(navigation)}`);
    }
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
  for (const name of ['保存草稿', '提交审核']) {
    const button = mobilePage.getByRole('button', { name, exact: true }).last();
    await button.scrollIntoViewIfNeeded();
    const geometry = await button.evaluate((element) => {
      const action = element.getBoundingClientRect();
      const navigation = document.querySelector('nav[aria-label="移动主导航"]')?.getBoundingClientRect();
      return { action: { top: action.top, bottom: action.bottom }, navigation: navigation ? { top: navigation.top, bottom: navigation.bottom } : null };
    });
    assert.ok(!geometry.navigation || geometry.action.bottom <= geometry.navigation.top + 1 || geometry.action.top >= geometry.navigation.bottom - 1,
      `${name} remains clear of the fixed mobile navigation at 390px: ${JSON.stringify(geometry)}`);
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

  const mobileSuggestionContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobileSuggestionErrors: string[] = [];
  const mobileSuggestionPage = await mobileSuggestionContext.newPage();
  mobileSuggestionPage.on('pageerror', (error) => mobileSuggestionErrors.push(error.message));
  mobileSuggestionPage.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') mobileSuggestionErrors.push(`${message.type()}: ${message.text()}`);
  });
  mobileSuggestionPage.setDefaultTimeout(5000);
  await mobileSuggestionPage.goto(`${base}/__qa?theme=light`);
  await mobileSuggestionPage.getByRole('heading', { name: '批注与修改建议' }).waitFor();
  const mobileSuggestionEditor = mobileSuggestionPage.locator('.ProseMirror').filter({ hasText: '第一段' }).first();
  await mobileSuggestionEditor.waitFor({ state: 'visible' });
  await mobileSuggestionEditor.locator('p').first().click({ position: { x: 2, y: 8 } });
  await mobileSuggestionEditor.press('Home');
  await mobileSuggestionEditor.press('Shift+ArrowRight');
  await mobileSuggestionEditor.press('Shift+ArrowRight');
  assert.equal(await mobileSuggestionPage.evaluate(() => window.getSelection()?.toString()), '第一');
  await mobileSuggestionPage.getByRole('button', { name: '提出修改建议' }).click();
  await mobileSuggestionPage.getByLabel('建议替换为（留空表示建议删除）').fill('这篇');
  await mobileSuggestionPage.getByLabel('修改理由').fill('移动端接受过程锁定验收');
  await mobileSuggestionPage.getByRole('button', { name: '提交', exact: true }).click();
  await mobileSuggestionPage.getByText('移动端接受过程锁定验收').waitFor();
  await mobileSuggestionPage.request.post(`${base}/__qa/hold-next-production-save`);
  const mobileSuggestionSave = mobileSuggestionPage.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/production/${productionId}`)
    && response.status() === 200, { timeout: 15_000 });
  await mobileSuggestionPage.getByRole('button', { name: '接受并保存' }).click();
  await mobileSuggestionPage.getByRole('button', { name: '正在应用并保存…', exact: true }).waitFor();
  const applyingSuggestionEditor = mobileSuggestionPage.locator('.ProseMirror').filter({ hasText: '这篇段' }).first();
  assert.equal(await applyingSuggestionEditor.getAttribute('contenteditable'), 'false', 'mobile manuscript remains read-only while suggestion acceptance is saving');
  assert.equal(await mobileSuggestionPage.getByRole('button', { name: '保存草稿', exact: true }).isDisabled(), true, 'mobile draft save cannot race suggestion acceptance');
  assert.equal(await mobileSuggestionPage.getByRole('button', { name: '提交审核', exact: true }).isDisabled(), true, 'mobile review submission cannot race suggestion acceptance');
  await mobileSuggestionPage.getByRole('button', { name: '返回创作', exact: true }).click();
  await mobileSuggestionPage.getByText('修改建议正在应用并保存，请稍候后再离开。').waitFor();
  assert.equal(new URL(mobileSuggestionPage.url()).pathname, `/production/content/${productionId}`, 'mobile navigation stays on the manuscript until its suggestion save completes');
  const pendingMobileSuggestion = await mobileSuggestionPage.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(pendingMobileSuggestion.threads.at(-1).status, 'open', 'mobile suggestion stays pending until the manuscript save is confirmed');
  await mobileSuggestionPage.screenshot({ path: '/tmp/xmt-production-review-mobile-suggestion-save-pending.png' });
  await mobileSuggestionPage.request.post(`${base}/__qa/release-production-save`);
  await mobileSuggestionSave;
  await mobileSuggestionPage.getByText('已采纳').last().waitFor();
  assert.deepEqual(mobileSuggestionErrors, [], 'mobile suggestion acceptance does not produce browser errors or warnings');
  await mobileSuggestionContext.close();

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
  const materialGeometry = await materialPanel.evaluate((panel) => {
    const toolbar = [...panel.querySelectorAll<HTMLElement>('*')].find((element) => getComputedStyle(element).position === 'sticky');
    const paragraph = panel.querySelector('.ProseMirror p');
    if (!toolbar || !paragraph) return null;
    const toolbarBounds = toolbar.getBoundingClientRect();
    const paragraphBounds = paragraph.getBoundingClientRect();
    return {
      overlap: Math.max(0, Math.min(toolbarBounds.bottom, paragraphBounds.bottom) - Math.max(toolbarBounds.top, paragraphBounds.top)),
      hitTarget: document.elementFromPoint(paragraphBounds.left + 100, paragraphBounds.top + 8),
      paragraph,
    };
  });
  assert.ok(materialGeometry, 'the material editor paragraph and toolbar are available for geometry verification');
  assert.equal(materialGeometry.overlap, 0, 'the nested sticky toolbar does not overlap the first material paragraph');
  assert.equal(materialGeometry.hitTarget, materialGeometry.paragraph, 'the first material paragraph remains the real pointer hit target');
  await materialPage.request.post(`${base}/__qa/fail-next-material-draft-update`);
  await materialEditor.click();
  await materialEditor.press('End');
  await materialEditor.pressSequentially('资料保存失败重试验收');
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
  await protectedMaterialPage.request.post(`${base}/__qa/reset-review-fixture`);
  await protectedMaterialContext.close();

  const threadRecoveryContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const threadRecoveryPage = await threadRecoveryContext.newPage();
  threadRecoveryPage.setDefaultTimeout(10000);
  await threadRecoveryPage.goto(`${base}/__qa?theme=light`);
  await threadRecoveryPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  const recoveryParagraph = threadRecoveryPage.locator('.ProseMirror p').filter({ hasText: '第一段文字需要审阅。' }).first();
  await recoveryParagraph.click({ position: { x: 1, y: 1 } });
  await threadRecoveryPage.keyboard.press('Home');
  for (let index = 0; index < 3; index += 1) await threadRecoveryPage.keyboard.press('Shift+ArrowRight');
  await threadRecoveryPage.waitForFunction(() => window.getSelection()?.toString() === '第一段');
  await threadRecoveryPage.getByRole('button', { name: '给选中文字加批注' }).click();
  const threadRecoveryInput = threadRecoveryPage.getByLabel('批注内容');
  await threadRecoveryInput.fill('提交后响应丢失的批注。');
  await threadRecoveryPage.request.post(`${base}/__qa/fail-next-review-thread-create-after-commit`);
  await threadRecoveryPage.request.post(`${base}/__qa/fail-next-review-thread-status-read`);
  await threadRecoveryPage.getByRole('button', { name: '提交', exact: true }).click();
  await threadRecoveryPage.getByText('批注结果暂时无法核实。原内容已锁定，请重新核实后再操作。', { exact: true }).waitFor();
  assert.equal(await threadRecoveryInput.isDisabled(), true, 'a committed but unconfirmed thread stays locked against duplicate submission');
  const threadRecoveryStorageKey = `xmt:production-review-thread:v1:${user.id}:${productionId}`;
  assert.notEqual(await threadRecoveryPage.evaluate((key) => sessionStorage.getItem(key), threadRecoveryStorageKey), null,
    'an unverified thread keeps its exact request and payload across refresh');
  const threadBeforeReload = await threadRecoveryPage.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(threadBeforeReload.reviewThreadCreateAttempts, 1);
  assert.equal(threadBeforeReload.threads.filter((thread: { summary: string }) => thread.summary === '提交后响应丢失的批注。').length, 1,
    'the isolated fixture commits the request exactly once before dropping its response');
  await threadRecoveryPage.reload();
  await threadRecoveryPage.getByText('提交后响应丢失的批注。', { exact: true }).waitFor();
  await threadRecoveryPage.waitForFunction(async ({ previousStatusReads, storageKey }: { previousStatusReads: number; storageKey: string }) => {
    const state = await (await fetch('/__qa/state')).json();
    return state.reviewThreadStatusReadAttempts > previousStatusReads && sessionStorage.getItem(storageKey) === null;
  }, { previousStatusReads: threadBeforeReload.reviewThreadStatusReadAttempts, storageKey: threadRecoveryStorageKey });
  const threadAfterReload = await threadRecoveryPage.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(threadAfterReload.reviewThreadCreateAttempts, 1, 'refresh recovery uses a read-only status check and does not POST again');
  assert.equal(threadAfterReload.threads.filter((thread: { summary: string }) => thread.summary === '提交后响应丢失的批注。').length, 1,
    'refresh recovery displays the saved thread exactly once');
  await threadRecoveryPage.request.post(`${base}/__qa/reset-review-fixture`);
  await threadRecoveryPage.request.post(`${base}/__qa/set-production-approved-state`);
  await threadRecoveryContext.close();

  const shootingHandoffContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const shootingHandoffPage = await shootingHandoffContext.newPage();
  shootingHandoffPage.setDefaultTimeout(10000);
  const shootingHandoffErrors: string[] = [];
  shootingHandoffPage.on('pageerror', (error) => shootingHandoffErrors.push(error.message));
  await shootingHandoffPage.goto(`${base}/__qa?theme=light`);
  await shootingHandoffPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  const shootingHandoffButton = shootingHandoffPage.getByRole('button', { name: '成片制作', exact: true }).last();
  await shootingHandoffButton.waitFor();
  const shootingHandoffNavigation = shootingHandoffPage.waitForURL((url) =>
    url.pathname === '/shooting' && url.searchParams.get('topicId') === String(topicId));
  await shootingHandoffButton.click();
  await shootingHandoffNavigation;
  const shootingCreateDialog = shootingHandoffPage.getByRole('dialog');
  await shootingCreateDialog.waitFor();
  const handoffTopicSelect = shootingCreateDialog.locator('select').first();
  await shootingHandoffPage.waitForFunction((expectedTopicId) => {
    const select = document.querySelector('[role="dialog"] select') as HTMLSelectElement | null;
    return select?.value === String(expectedTopicId);
  }, topicId);
  assert.equal(await handoffTopicSelect.inputValue(), String(topicId), 'the production topic is selected in the shooting creation form');
  await shootingHandoffPage.waitForFunction(() => location.pathname === '/shooting' && !location.search.includes('topicId='));
  const shootingHandoffState = await shootingHandoffPage.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.ok(shootingHandoffState.shootingListReadAttempts > 0, 'the handoff only reads the current shooting list');
  assert.ok(shootingHandoffState.topicListReadAttempts > 0, 'the handoff only reads eligible topics before pre-filling');
  assert.ok(shootingHandoffState.topicDetailReadAttempts >= 2, 'a topic omitted from the first topic-list page is read directly before pre-filling');
  assert.equal(shootingHandoffState.apiMutationAttempts, 0, 'opening the pre-filled form does not send any business write');
  assert.deepEqual(shootingHandoffErrors, [], 'the direct handoff renders without runtime errors');
  await shootingHandoffContext.close();

  const readOnlyControlContext = await browser.newContext();
  const fixtureControl = readOnlyControlContext.request;
  await context.close();
  const readOnlyScenarios: Array<{ mode: string; expectedReason: string; expectedSaveMethod: string; versionUrl?: string; expectedBody: string }> = [
    {
      mode: 'missing-update',
      expectedReason: '当前账号缺少创作更新权限',
      expectedSaveMethod: '只读查看',
      expectedBody: '第一段文字需要审阅。',
    },
    {
      mode: 'outside-scope',
      expectedReason: '当前账号不在这篇稿件的编辑范围内',
      expectedSaveMethod: '只读查看',
      expectedBody: '第一段文字需要审阅。',
    },
    {
      mode: 'history',
      expectedReason: '当前显示的是历史版本，仅供查看',
      expectedSaveMethod: '历史只读预览',
      versionUrl: `/production/content/${productionId}?version=v1.0`,
      expectedBody: '历史只读版本正文。',
    },
  ];
  for (const scenario of readOnlyScenarios) {
    await fixtureControl.post(`${base}/__qa/reset-review-fixture`);
    await fixtureControl.post(`${base}/__qa/set-readonly-mode/${scenario.mode}`);
    const readOnlyContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const readOnlyPage = await readOnlyContext.newPage();
    readOnlyPage.setDefaultTimeout(10000);
    await readOnlyPage.goto(`${base}/__qa?theme=light`);
    await readOnlyPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
    if (scenario.versionUrl) await readOnlyPage.goto(`${base}${scenario.versionUrl}`);
    const reason = readOnlyPage.getByTestId('production-readonly-reason');
    await reason.getByText(scenario.expectedReason, { exact: false }).waitFor();
    const preview = readOnlyPage.locator('.production-preview .ProseMirror').first();
    await preview.getByText(scenario.expectedBody, { exact: false }).waitFor();
    assert.equal(await preview.getAttribute('contenteditable'), 'false', `${scenario.mode} renders readable but non-editable manuscript content`);
    assert.equal(await readOnlyPage.getByTestId('production-save-method').innerText(), scenario.expectedSaveMethod,
      `${scenario.mode} does not claim that a read-only user is collaborating or auto-saving`);
    assert.equal(await readOnlyPage.getByText('协同自动同步', { exact: true }).count(), 0, 'read-only content never shows the misleading legacy save label');
    for (const label of ['小修保存', '另开新版', '提交审核']) {
      assert.equal(await readOnlyPage.getByRole('button', { name: label, exact: true }).count(), 0,
        `${scenario.mode} does not expose the ${label} write action`);
    }
    assert.equal(await readOnlyPage.locator('button[title="删除创作记录"]').count(), 0, `${scenario.mode} does not expose delete as a read-only action`);
    await readOnlyPage.waitForTimeout(100);
    const readOnlyState = await readOnlyPage.request.get(`${base}/__qa/state`).then((response) => response.json());
    assert.equal(readOnlyState.apiMutationAttempts, 0, `${scenario.mode} remains free of API business writes`);
    assert.equal(readOnlyState.productionSaveAttempts, 0, `${scenario.mode} does not save the manuscript in the background`);
    assert.equal(readOnlyState.productionVersionSaveAttempts, 0, `${scenario.mode} does not create a version`);
    assert.equal(readOnlyState.productionReviewAttempts, 0, `${scenario.mode} does not submit for review`);
    await readOnlyContext.close();
  }

  await fixtureControl.post(`${base}/__qa/reset-review-fixture`);
  await fixtureControl.post(`${base}/__qa/set-readonly-mode/outside-scope`);
  const supersededContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const supersededPage = await supersededContext.newPage();
  supersededPage.setDefaultTimeout(10000);
  await supersededPage.goto(`${base}/__qa?theme=light`);
  await supersededPage.getByRole('heading', { name: '协作审阅稿件' }).waitFor();
  await supersededPage.request.post(`${base}/__qa/announce-superseded`);
  const supersededNotice = supersededPage.getByRole('status').filter({ hasText: '这份稿件已有更新版本' });
  await supersededNotice.waitFor();
  await supersededNotice.getByText('当前 v1.0 已转为只读', { exact: false }).waitFor();
  assert.equal(await supersededPage.getByTestId('production-save-method').innerText(), '当前版本已被替代，仅可查看');
  assert.equal(await supersededPage.getByRole('button', { name: '提交审核', exact: true }).count(), 0,
    'a superseded collaboration version does not expose review submission');
  assert.equal(await supersededPage.getByRole('button', { name: '另开新版', exact: true }).count(), 0,
    'a superseded collaboration version does not expose version writes');
  await supersededContext.close();
  await readOnlyControlContext.close();

  console.log(`${process.env.XMT_MATERIAL_PROTECTION_QA_ONLY === '1' ? 'Material protection' : 'Production review'} browser test passed: materials require a confirmed draft and ready editor, preserve content through read/reference failures, and insert once with protected in-flight controls; expected reduced-motion notices: ${expectedReducedMotionWarnings}.`);
} catch (error) {
  if (error === reviewRefreshRecoveryOnlyComplete) {
    console.log('Production review refresh recovery browser test passed: both detail and history GET failures preserve the confirmed review and recover with GET requests only.');
  } else if (error === statusRefreshRecoveryOnlyComplete) {
    console.log('Production status refresh recovery browser test passed: confirmed status remains visible after GET failure, mutation controls stay locked, and successful retry performs GET only.');
  } else {
    throw error;
  }
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
