import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Locator } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 96, username: 'publishing-contrast-qa', role: 'admin', name: '发布对比度验收', enabled: true, force_change_password: false };
const publishing = {
  id: 961,
  topic_id: 962,
  platform: 'douyin',
  url: 'https://example.invalid/qa',
  status: 'published',
  publish_time: '2026-10-07 09:00:00',
  operator_id: user.id,
  operator_name: user.name,
  topic_title: '发布列表主题对比度验收',
  views: 1234,
  likes: 12,
  shares: 3,
  comments: 4,
  views_source: 'douyin_official_export',
  likes_source: 'manual',
  shares_source: 'unavailable',
  comments_source: 'douyin_creator_collection',
  douyin_work_id: 963,
  douyin_title: '发布列表作品标题验收',
  data_source: 'douyin',
  script_content: '<p>初始发布剧本</p>',
  script_source_production_id: null,
  script_source_version: null,
  script_source_production: null,
  production: null,
  shooting: null,
  topicHistory: [],
  topic_description: '发布剧本保存状态验收',
  topic_platform: 'douyin',
  topic_deadline: '',
  created_at: '2026-10-07 09:00:00',
  updated_at: '2026-10-07 09:00:00',
};
const createdPublishing = {
  ...publishing,
  id: 964,
  platform: '视频号',
  status: 'pending',
  publish_time: '',
  topic_title: '发布记录创建刷新反馈验收',
  data_source: 'publishing',
  douyin_work_id: null,
  douyin_title: null,
};
let publishingExists = true;
let createdPublishingExists = false;
let failNextPublishingDelete = false;
let commitNextPublishingDeleteThenFail = false;
let failNextPublishingDetailRead = false;
let delayNextPublishingDelete = false;
let delayNextDouyinReconcile = false;
let delayNextDouyinLink = false;
let commitNextDouyinLinkThenFail = false;
let failNextDouyinLinkWithoutCommit = false;
let failNextPublishingListRead = false;
let delayNextPublishingCreate = false;
let commitNextPublishingCreateThenFail = false;
let failNextPublishingCreateStatusRead = false;
let commitNextPublishingUpdateThenFail = false;
let failNextPublishingUpdateWithoutCommit = false;
let delayNextPublishingScriptSave = false;
let failNextPublishingScriptSaveWithoutCommit = false;
let publishingDeleteRequests = 0;
let publishingDetailRequests = 0;
let publishingCreateRequests = 0;
let publishingCreateStatusRequests = 0;
let publishingUpdateRequests = 0;
const publishingUpdatePayloads: Array<{ id: number; payload: Record<string, unknown> }> = [];
let publishingListRequests = 0;
let douyinReconcileRequests = 0;
let douyinReconcileArchiveSyncPending = 0;
let douyinLinkRequests = 0;
let douyinLinkTargets: Array<{ publishingId: number; workId: number | null }> = [];
let currentDouyinWorkId: number | null = 963;
let createdDouyinWorkId: number | null = null;
const publishingCreateRequestKeys = new Map<string, { publishingId: number; fingerprint: string }>();
const heldDouyinCandidateTargets = new Set<number>();
const pendingDouyinCandidateResponses = new Map<number, Array<() => void>>();
const douyinCandidateRequestCounts = new Map<number, number>();
const sequencedDouyinCandidateTargets = new Set<number>();
const sequencedDouyinCandidateIndexes = new Map<number, number>();

function luminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

async function contrast(locator: Locator) {
  return locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    const row = element.closest('tr');
    const background = (row ? getComputedStyle(row).backgroundColor : getComputedStyle(element.parentElement || element).backgroundColor).match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    return { foreground, background, backgroundColor: row ? getComputedStyle(row).backgroundColor : getComputedStyle(element.parentElement || element).backgroundColor };
  }).then(({ foreground, background, backgroundColor }) => {
    if (foreground.length !== 3 || background.length !== 3) return { ratio: 0, backgroundColor };
    const weights = [0.2126, 0.7152, 0.0722];
    const textLum = foreground.reduce((sum, channel, index) => sum + weights[index] * luminance(channel), 0);
    const backgroundLum = background.reduce((sum, channel, index) => sum + weights[index] * luminance(channel), 0);
    return { ratio: (Math.max(textLum, backgroundLum) + 0.05) / (Math.min(textLum, backgroundLum) + 0.05), backgroundColor };
  });
}

async function contrastOnGlassCard(locator: Locator) {
  const colors = await locator.evaluate((element) => {
    const card = element.closest('.studio-sheen');
    return {
      foreground: getComputedStyle(element).color,
      cardBackground: card ? getComputedStyle(card).backgroundColor : '',
      pageBackground: getComputedStyle(document.body).backgroundColor,
    };
  });
  const parse = (color: string) => {
    const values = color.match(/[\d.]+/g)?.map(Number) || [];
    return { rgb: values.slice(0, 3), alpha: values.length > 3 ? values[3] : 1 };
  };
  const foreground = parse(colors.foreground).rgb;
  const cardBackground = parse(colors.cardBackground);
  const pageBackground = parse(colors.pageBackground).rgb;
  if (foreground.length !== 3 || cardBackground.rgb.length !== 3 || pageBackground.length !== 3) {
    return { ratio: 0, backgroundColor: colors.cardBackground };
  }
  const background = cardBackground.rgb.map((channel, index) => channel * cardBackground.alpha + pageBackground[index] * (1 - cardBackground.alpha));
  const textLum = foreground.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
  const backgroundLum = background.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
  return {
    ratio: (Math.max(textLum, backgroundLum) + 0.05) / (Math.min(textLum, backgroundLum) + 0.05),
    backgroundColor: `rgba(${background.map(Math.round).join(', ')}, 1)`,
  };
}

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.get('/__qa/state', (_req, res) => res.json({
  publishingExists,
  createdPublishingExists,
  publishingDeleteRequests,
  publishingDetailRequests,
  publishingCreateRequests,
  publishingCreateStatusRequests,
  publishingUpdateRequests,
  publishingUpdatePayloads,
  publishingScriptContent: publishing.script_content,
  publishingListRequests,
  douyinReconcileRequests,
  douyinLinkRequests,
  douyinLinkTargets,
  currentDouyinWorkId,
  heldDouyinCandidateTargets: [...heldDouyinCandidateTargets],
  douyinCandidateRequestCounts: Object.fromEntries(douyinCandidateRequestCounts),
  pendingDouyinCandidateResponseCounts: Object.fromEntries([...pendingDouyinCandidateResponses].map(([id, responses]) => [id, responses.length])),
}));
app.post('/__qa/hold-douyin-candidates/:id', (req, res) => {
  heldDouyinCandidateTargets.add(Number(req.params.id));
  return res.json({ ok: true });
});
app.post('/__qa/release-douyin-candidates/:id', (req, res) => {
  const id = Number(req.params.id);
  const responses = pendingDouyinCandidateResponses.get(id) || [];
  const responseIndex = req.body.latest ? responses.length - 1 : 0;
  const [send] = responseIndex >= 0 ? responses.splice(responseIndex, 1) : [];
  if (!req.body.keepHeld) heldDouyinCandidateTargets.delete(id);
  if (responses.length === 0) pendingDouyinCandidateResponses.delete(id);
  send?.();
  return res.json({ released: send ? 1 : 0, pending: responses.length });
});
app.post('/__qa/sequence-douyin-candidates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (req.body.enabled === false) {
    sequencedDouyinCandidateTargets.delete(id);
    sequencedDouyinCandidateIndexes.delete(id);
  } else {
    sequencedDouyinCandidateTargets.add(id);
    sequencedDouyinCandidateIndexes.set(id, 0);
  }
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-list-read', (_req, res) => {
  failNextPublishingListRead = true;
  return res.json({ ok: true });
});
app.post('/__qa/commit-next-publishing-create-and-fail', (_req, res) => {
  commitNextPublishingCreateThenFail = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-publishing-create-status-read', (_req, res) => {
  failNextPublishingCreateStatusRead = true;
  return res.json({ ok: true });
});
app.post('/__qa/commit-next-publishing-update-and-fail', (_req, res) => {
  commitNextPublishingUpdateThenFail = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-publishing-update-without-commit', (_req, res) => {
  failNextPublishingUpdateWithoutCommit = true;
  return res.json({ ok: true });
});
app.post('/__qa/delay-next-publishing-script-save', (_req, res) => {
  delayNextPublishingScriptSave = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-publishing-script-save-without-commit', (_req, res) => {
  failNextPublishingScriptSaveWithoutCommit = true;
  return res.json({ ok: true });
});
app.post('/__qa/commit-next-douyin-link-and-fail', (_req, res) => {
  commitNextDouyinLinkThenFail = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-douyin-link-without-commit', (_req, res) => {
  failNextDouyinLinkWithoutCommit = true;
  return res.json({ ok: true });
});
app.post('/__qa/commit-next-publishing-delete-and-fail', (_req, res) => {
  commitNextPublishingDeleteThenFail = true;
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-publishing-detail-read', (_req, res) => {
  failNextPublishingDetailRead = true;
  return res.json({ ok: true });
});
app.post('/__qa/reset', (_req, res) => {
  publishingExists = true;
  createdPublishingExists = false;
  failNextPublishingDelete = false;
  commitNextPublishingDeleteThenFail = false;
  failNextPublishingDetailRead = false;
  delayNextPublishingDelete = false;
  delayNextDouyinReconcile = false;
  delayNextDouyinLink = false;
  commitNextDouyinLinkThenFail = false;
  failNextDouyinLinkWithoutCommit = false;
  failNextPublishingListRead = false;
  delayNextPublishingCreate = false;
  commitNextPublishingCreateThenFail = false;
  failNextPublishingCreateStatusRead = false;
  delayNextPublishingScriptSave = false;
  failNextPublishingScriptSaveWithoutCommit = false;
  publishingCreateRequestKeys.clear();
  douyinReconcileRequests = 0;
  douyinReconcileArchiveSyncPending = 0;
  douyinLinkRequests = 0;
  douyinLinkTargets = [];
  currentDouyinWorkId = 963;
  createdDouyinWorkId = null;
  heldDouyinCandidateTargets.clear();
  pendingDouyinCandidateResponses.clear();
  douyinCandidateRequestCounts.clear();
  sequencedDouyinCandidateTargets.clear();
  sequencedDouyinCandidateIndexes.clear();
  return res.json({ ok: true });
});
app.get('/__qa', (req, res) => {
  if (typeof req.query.archive_sync_pending === 'string') {
    const pending = Number(req.query.archive_sync_pending);
    if (Number.isSafeInteger(pending) && pending >= 0) douyinReconcileArchiveSyncPending = pending;
  }
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','publishing-contrast-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/publishing');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/workflow/publishing', (_req, res) => {
  publishingListRequests += 1;
  if (failNextPublishingListRead) {
    failNextPublishingListRead = false;
    return res.status(503).json({ message: '模拟列表刷新失败' });
  }
  const records = [
    ...(publishingExists ? [{ ...publishing, douyin_work_id: currentDouyinWorkId }] : []),
    ...(createdPublishingExists ? [{ ...createdPublishing, douyin_work_id: createdDouyinWorkId }] : []),
  ];
  return res.json({ data: records, page: 1, limit: 50, total: records.length, summary: { today: 0, pending: createdPublishingExists ? 1 : 0, published: publishingExists ? 1 : 0, failed: 0 } });
});
app.get('/api/workflow/publishing/:id', (req, res) => {
  publishingDetailRequests += 1;
  if (failNextPublishingDetailRead) {
    failNextPublishingDetailRead = false;
    return res.status(503).json({ message: '模拟发布详情读取失败' });
  }
  const id = Number(req.params.id);
  if (id === publishing.id && publishingExists) return res.json({ ...publishing, id, douyin_work_id: currentDouyinWorkId });
  if (id === createdPublishing.id && createdPublishingExists) return res.json({ ...createdPublishing, id, douyin_work_id: createdDouyinWorkId });
  return res.status(404).json({ message: '发布记录不存在' });
});
app.get('/api/workflow/publishing/:id/versions', (_req, res) => res.json({ data: [] }));
app.get('/api/workflow/publishing/create-request/:requestId', (req, res) => {
  publishingCreateStatusRequests += 1;
  if (failNextPublishingCreateStatusRead) {
    failNextPublishingCreateStatusRead = false;
    return res.status(503).json({ message: '模拟发布创建状态读取失败' });
  }
  const request = publishingCreateRequestKeys.get(String(req.params.requestId));
  if (!request) return res.status(404).json({ message: '尚未找到对应发布记录' });
  if (request.publishingId === createdPublishing.id && !createdPublishingExists) {
    return res.status(410).json({ deleted: true, message: '对应发布记录已删除' });
  }
  return res.json({ publishingId: request.publishingId });
});
app.post('/api/workflow/publishing/douyin/reconcile', (_req, res) => {
  douyinReconcileRequests += 1;
  const sendConfirmed = () => res.json({ message: '抖音关联已刷新', linked: 1, reviewed: 1, ambiguous: 0, unmatched: 0, archiveSyncPending: douyinReconcileArchiveSyncPending });
  if (delayNextDouyinReconcile) {
    delayNextDouyinReconcile = false;
    setTimeout(sendConfirmed, 300);
    return;
  }
  return sendConfirmed();
});
app.get('/api/workflow/publishing/:id/douyin-candidates', (req, res) => {
  const publishingId = Number(req.params.id);
  douyinCandidateRequestCounts.set(publishingId, (douyinCandidateRequestCounts.get(publishingId) || 0) + 1);
  const sequenceIndex = sequencedDouyinCandidateIndexes.get(publishingId) || 0;
  if (sequencedDouyinCandidateTargets.has(publishingId)) sequencedDouyinCandidateIndexes.set(publishingId, sequenceIndex + 1);
  const candidate = sequencedDouyinCandidateTargets.has(publishingId)
    ? sequenceIndex === 0
      ? { id: 967, title: '旧候选响应', publish_time: '2026-10-07 08:00:00', play_count: 900, like_count: 9, match_score: 0.9, match_method: 'exact', linked_publishing_id: null }
      : { id: 968, title: '重新打开后的候选', publish_time: '2026-10-07 11:00:00', play_count: 1800, like_count: 18, match_score: 0.93, match_method: 'exact', linked_publishing_id: null }
    : publishingId === publishing.id
      ? { id: 965, title: '人工关联作品候选', publish_time: '2026-10-07 09:00:00', play_count: 1200, like_count: 30, match_score: 0.95, match_method: 'exact', linked_publishing_id: null }
      : { id: 966, title: '第二发布记录候选', publish_time: '2026-10-07 10:00:00', play_count: 2400, like_count: 60, match_score: 0.92, match_method: 'containment', linked_publishing_id: null };
  const send = () => res.json({
    publishing: { id: publishingId, title: publishingId === publishing.id ? publishing.topic_title : createdPublishing.topic_title },
    candidates: [candidate],
  });
  if (heldDouyinCandidateTargets.has(publishingId)) {
    const pending = pendingDouyinCandidateResponses.get(publishingId) || [];
    pending.push(send);
    pendingDouyinCandidateResponses.set(publishingId, pending);
    return;
  }
  return send();
});
app.put('/api/workflow/publishing/:id/douyin-link', (req, res) => {
  douyinLinkRequests += 1;
  const publishingId = Number(req.params.id);
  const workId = req.body.douyin_work_id ?? null;
  douyinLinkTargets.push({ publishingId, workId });
  if (failNextDouyinLinkWithoutCommit) {
    failNextDouyinLinkWithoutCommit = false;
    return res.status(503).json({ message: '模拟关联未提交但响应异常' });
  }
  if (publishingId === publishing.id) currentDouyinWorkId = workId;
  if (publishingId === createdPublishing.id) createdDouyinWorkId = workId;
  if (commitNextDouyinLinkThenFail) {
    commitNextDouyinLinkThenFail = false;
    return res.status(503).json({ message: '模拟关联已提交但响应异常' });
  }
  const sendConfirmed = () => res.json({ message: workId === null ? '已解除关联' : '已关联抖音作品' });
  if (delayNextDouyinLink) {
    delayNextDouyinLink = false;
    setTimeout(sendConfirmed, 300);
    return;
  }
  return sendConfirmed();
});
app.post('/api/workflow/publishing', (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const requestId = typeof body.client_request_id === 'string' ? body.client_request_id : null;
  const fingerprint = JSON.stringify(body);
  const existingRequest = requestId ? publishingCreateRequestKeys.get(requestId) : null;
  if (existingRequest) {
    if (existingRequest.fingerprint !== fingerprint) return res.status(409).json({ message: '发布请求编号已用于其他内容' });
    return res.status(200).json({ message: '发布记录添加成功', publishingId: existingRequest.publishingId, idempotent_replay: true });
  }
  publishingCreateRequests += 1;
  createdPublishingExists = true;
  if (requestId) publishingCreateRequestKeys.set(requestId, { publishingId: createdPublishing.id, fingerprint });
  const sendConfirmed = () => res.status(201).json({ message: '发布记录已添加', publishingId: createdPublishing.id, idempotent_replay: false });
  if (commitNextPublishingCreateThenFail) {
    commitNextPublishingCreateThenFail = false;
    return res.status(503).json({ message: '模拟发布已创建但响应异常' });
  }
  if (delayNextPublishingCreate) {
    delayNextPublishingCreate = false;
    setTimeout(sendConfirmed, 300);
    return;
  }
  return sendConfirmed();
});
app.put('/api/workflow/publishing/:id', (req, res) => {
  publishingUpdateRequests += 1;
  const id = Number(req.params.id);
  const record = id === publishing.id ? publishing : id === createdPublishing.id ? createdPublishing : null;
  if (!record || (record === publishing && !publishingExists) || (record === createdPublishing && !createdPublishingExists)) {
    return res.status(404).json({ message: '发布记录不存在' });
  }
  const payload = (req.body || {}) as Record<string, unknown>;
  publishingUpdatePayloads.push({ id, payload: { ...payload } });
  if (failNextPublishingUpdateWithoutCommit) {
    failNextPublishingUpdateWithoutCommit = false;
    return res.status(503).json({ message: '模拟发布更新未提交但响应异常' });
  }
  if (typeof payload.script_content === 'string' && failNextPublishingScriptSaveWithoutCommit) {
    failNextPublishingScriptSaveWithoutCommit = false;
    return res.status(503).json({ message: '模拟剧本未保存但响应异常' });
  }
  if (typeof payload.platform === 'string') {
    record.platform = payload.platform;
    record.publishing_platform = payload.platform;
  }
  if (typeof payload.url === 'string') record.url = payload.url;
  if (typeof payload.status === 'string') {
    record.status = payload.status;
    record.publishing_status = payload.status;
  }
  if (typeof payload.publish_time === 'string') {
    record.publish_time = payload.publish_time;
    record.publishing_publish_time = payload.publish_time;
  }
  for (const field of ['views', 'likes', 'shares', 'comments'] as const) {
    if (payload[field] !== undefined) {
      record[`manual_${field}`] = payload[field];
      record[field] = payload[field];
    }
  }
  if (typeof payload.script_content === 'string') record.script_content = payload.script_content;
  if (commitNextPublishingUpdateThenFail) {
    commitNextPublishingUpdateThenFail = false;
    return res.status(503).json({ message: '模拟更新已提交但响应异常' });
  }
  const sendConfirmed = () => res.json({ message: '发布记录已更新' });
  if (typeof payload.script_content === 'string' && delayNextPublishingScriptSave) {
    delayNextPublishingScriptSave = false;
    setTimeout(sendConfirmed, 5000);
    return;
  }
  return sendConfirmed();
});
app.delete('/api/workflow/publishing/:id', (_req, res) => {
  publishingDeleteRequests += 1;
  if (failNextPublishingDelete) {
    failNextPublishingDelete = false;
    return res.status(503).json({ message: '模拟删除失败' });
  }
  publishingExists = false;
  if (commitNextPublishingDeleteThenFail) {
    commitNextPublishingDeleteThenFail = false;
    return res.status(503).json({ message: '模拟服务端已删除但响应异常' });
  }
  const sendConfirmed = () => res.json({ message: '发布记录已删除' });
  if (delayNextPublishingDelete) {
    delayNextPublishingDelete = false;
    setTimeout(sendConfirmed, 300);
    return;
  }
  return sendConfirmed();
});
app.get('/api/topics', (_req, res) => res.json({ data: [{ id: 962, title: '发布记录反馈验收选题', status: 'publishing' }], page: 1, limit: 20, total: 1 }));
app.use('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

const setCandidateResponseHold = async (publishingId: number, hold: boolean, options: { latest?: boolean; keepHeld?: boolean } = {}) => {
  const action = hold ? 'hold' : 'release';
  const response = await fetch(`${base}/__qa/${action}-douyin-candidates/${publishingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  assert.equal(response.ok, true, `the fixture can ${action} candidate responses for publishing ${publishingId}`);
  return response.json() as Promise<{ released?: number }>;
};

const waitForPendingCandidateResponse = async (publishingId: number, expectedCount = 1) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const response = await fetch(`${base}/__qa/state`);
    const state = await response.json() as {
      pendingDouyinCandidateResponseCounts: Record<string, number>;
      douyinCandidateRequestCounts: Record<string, number>;
      heldDouyinCandidateTargets: number[];
    };
    if ((state.pendingDouyinCandidateResponseCounts[String(publishingId)] || 0) >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const response = await fetch(`${base}/__qa/state`);
  const state = await response.json() as {
    pendingDouyinCandidateResponseCounts: Record<string, number>;
    douyinCandidateRequestCounts: Record<string, number>;
    heldDouyinCandidateTargets: number[];
  };
  assert.fail(`publishing ${publishingId} candidate response count did not reach ${expectedCount}: pending=${state.pendingDouyinCandidateResponseCounts[String(publishingId)] || 0}, requests=${state.douyinCandidateRequestCounts[String(publishingId)] || 0}, held=${state.heldDouyinCandidateTargets.includes(publishingId)}`);
};

const waitForEnabledAction = async (locator: Locator, description: string) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await locator.isEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`${description} did not become enabled`);
};

const setCandidateResponseSequence = async (publishingId: number, enabled: boolean) => {
  const response = await fetch(`${base}/__qa/sequence-douyin-candidates/${publishingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  assert.equal(response.ok, true, `the fixture can ${enabled ? 'enable' : 'disable'} candidate response sequencing for ${publishingId}`);
};

if (process.env.XMT_PUBLISHING_CONTRAST_QA_SERVE === '1') {
  console.log(`Isolated publishing contrast QA fixture: ${base}/__qa`);
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(0);
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  const expectedHttpErrorResponses: string[] = [];
  const expectedHttpNotFoundResponses: string[] = [];
  const consoleNotFoundMessages: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else if (message.text().includes('404 (Not Found)')) consoleNotFoundMessages.push(message.text());
    else errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() === 503) expectedHttpErrorResponses.push(`${response.request().method()} ${new URL(response.url()).pathname}`);
    if (response.status() === 404 && /^\/api\/workflow\/publishing\/\d+$/.test(new URL(response.url()).pathname)) {
      expectedHttpNotFoundResponses.push(response.url());
    } else if (response.status() >= 400 && response.status() !== 503) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?theme=${theme}`);
    await page.getByRole('heading', { name: '发布管理' }).waitFor();
    const row = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
    await row.waitFor();
    assert.equal(await row.getByText('douyin', { exact: true }).count(), 0, `${theme} publishing list does not expose the platform identifier`);
    assert.equal(await row.getByText('抖音', { exact: true }).count(), 1, `${theme} publishing list uses the shared platform label`);
    const desktopActionTargets = await row.locator('td').last().locator('button[aria-label], a[aria-label]').evaluateAll((actions) => actions.map((action) => {
      const rect = action.getBoundingClientRect();
      return { label: action.getAttribute('aria-label') || '', width: rect.width, height: rect.height, top: rect.top };
    }));
    assert.equal(desktopActionTargets.length, 4, `${theme} desktop publishing rows keep all four permitted actions`);
    for (const action of desktopActionTargets) {
      assert.ok(action.width >= 40 && action.height >= 40, `${action.label} has a 40px target on desktop: ${JSON.stringify(action)}`);
    }
    assert.ok(Math.max(...desktopActionTargets.map((action) => action.top)) - Math.min(...desktopActionTargets.map((action) => action.top)) <= 1,
      `${theme} desktop publishing actions stay on one row: ${JSON.stringify(desktopActionTargets)}`);
    await row.hover();
    for (const title of ['今日待发布', '待确认', '已发布', '发布异常']) {
      const label = page.locator('.studio-sheen p').filter({ hasText: title });
      const result = await contrastOnGlassCard(label);
      assert.ok(result.ratio >= 4.5, `${theme} 发布管理“${title}”统计标签对比度为 ${result.ratio.toFixed(2)}:1 on ${result.backgroundColor}，应不低于 4.5:1`);
    }
    const headerCells = page.locator('table thead th');
    for (let index = 0; index < await headerCells.count(); index += 1) {
      const header = headerCells.nth(index);
      const result = await contrast(header);
      assert.ok(result.ratio >= 4.5, `${theme} 发布管理表头“${(await header.innerText()).trim()}”对比度为 ${result.ratio.toFixed(2)}:1 on ${result.backgroundColor}，应不低于 4.5:1`);
    }
    const operator = row.locator('td').first().locator('span.mt-1.flex');
    const operatorContrast = await contrast(operator);
    assert.ok(operatorContrast.ratio >= 4.5, `${theme} 发布管理负责人副标题对比度为 ${operatorContrast.ratio.toFixed(2)}:1 on ${operatorContrast.backgroundColor}，应不低于 4.5:1`);
    const title = row.locator('td').first().locator('span.line-clamp-2');
    await title.hover();
    for (const [label, locator] of [
      ['发布标题悬停', title],
      ['抖音作品副标题', row.locator('td').first().locator('span.text-xs.text-studio-cyan-contrast')],
      ['播放量指标文字', row.locator('[title^="播放量"]')],
      ['播放量来源小字', row.locator('[title^="播放量"] > span')],
    ] as const) {
      const result = await contrast(locator);
      assert.ok(result.ratio >= 4.5, `${theme} 发布管理${label}对比度为 ${result.ratio.toFixed(2)}:1 on ${result.backgroundColor}，应不低于 4.5:1`);
    }
    for (const [label, locator] of [
      ['点赞指标文字', row.locator('[title^="点赞量"]')],
      ['点赞来源小字', row.locator('[title^="点赞量"] > span')],
      ['分享指标文字', row.locator('[title^="分享量"]')],
      ['分享来源小字', row.locator('[title^="分享量"] > span')],
      ['评论指标文字', row.locator('[title^="评论量"]')],
      ['评论来源小字', row.locator('[title^="评论量"] > span')],
    ] as const) {
      const result = await contrast(locator);
      assert.ok(result.ratio >= 4.5, `${theme} 发布管理${label}对比度为 ${result.ratio.toFixed(2)}:1 on ${result.backgroundColor}，应不低于 4.5:1`);
    }
    await page.screenshot({ path: `/tmp/xmt-publishing-metrics-${theme}.png` });
  }

  await page.goto(`${base}/__qa?theme=light`);
  await page.setViewportSize({ width: 390, height: 844 });
  const publishingSearch = page.getByRole('textbox', { name: '搜索发布记录' });
  assert.equal(await publishingSearch.getAttribute('id'), 'publishing-search', 'the publishing list search has a stable id and accessible name');
  await page.setViewportSize({ width: 320, height: 844 });
  const narrowPublishingRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await narrowPublishingRow.scrollIntoViewIfNeeded();
  const narrowPublishingActionCell = narrowPublishingRow.locator('td').last();
  const narrowPublishingActions = await narrowPublishingActionCell.evaluate((cell) => {
    const actionSelector = 'button[aria-label^="关联抖音作品"], button[aria-label^="调整抖音作品关联"], button[aria-label^="编辑发布记录"], a[aria-label^="打开发布链接"], button[aria-label^="删除发布记录"]';
    const actions = Array.from(cell.querySelectorAll(actionSelector), (action) => {
      const rect = action.getBoundingClientRect();
      return {
        label: action.getAttribute('aria-label') || '',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    const deleteAction = actions.find((action) => action.label.startsWith('删除发布记录'));
    const table = cell.closest('table');
    const scrollport = table?.parentElement;
    const scrollportRect = scrollport?.getBoundingClientRect();
    const actionCellRect = cell.getBoundingClientRect();
    const title = table?.querySelector('tbody tr td:first-child span.line-clamp-2');
    const titleRect = title?.getBoundingClientRect();
    const visibleTitleRight = Math.min(titleRect?.right ?? -1, actionCellRect.left, scrollportRect?.right ?? -1);
    return {
      position: getComputedStyle(cell).position,
      scrollWidth: scrollport?.scrollWidth ?? 0,
      clientWidth: scrollport?.clientWidth ?? 0,
      deleteLeft: deleteAction?.left ?? -1,
      deleteRight: deleteAction?.right ?? -1,
      deleteTop: deleteAction?.top ?? -1,
      deleteBottom: deleteAction?.bottom ?? -1,
      actions,
      visibleTitleWidth: titleRect && scrollportRect ? visibleTitleRight - Math.max(titleRect.left, scrollportRect.left) : 0,
    };
  });
  assert.equal(narrowPublishingActions.position, 'sticky', 'publishing actions stay fixed to the right edge of the horizontal scrollport');
  assert.ok(narrowPublishingActions.scrollWidth > narrowPublishingActions.clientWidth, 'the publication list retains horizontal scrolling for secondary fields');
  assert.equal(narrowPublishingActions.actions.length, 4, 'the narrow publishing row keeps all four permitted actions visible');
  for (const action of narrowPublishingActions.actions) {
    assert.ok(action.width >= 40 && action.height >= 40, `${action.label} has a 40px target at 320px: ${JSON.stringify(action)}`);
    assert.ok(action.left >= 0 && action.right <= 320, `${action.label} stays reachable at 320px: ${JSON.stringify(action)}`);
    assert.ok(action.top >= 0 && action.bottom <= 844, `${action.label} is fully visible when its row is in view: ${JSON.stringify(action)}`);
  }
  assert.ok(narrowPublishingActions.visibleTitleWidth >= 110, `the sticky action controls leave enough room to read the topic title: ${JSON.stringify(narrowPublishingActions)}`);
  assert.equal(await narrowPublishingRow.getByRole('button', { name: `删除发布记录 ${publishing.topic_title}` }).isVisible(), true, 'row actions expose a descriptive accessible name');
  await page.screenshot({ path: '/tmp/xmt-publishing-list-actions-light-320.png' });
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto(`${base}/__qa?theme=dark`);
  await page.getByRole('heading', { name: '发布管理' }).waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.setViewportSize({ width: 320, height: 844 });
  const darkNarrowPublishingRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await darkNarrowPublishingRow.scrollIntoViewIfNeeded();
  const darkActionTargets = await darkNarrowPublishingRow.locator('td').last().locator('button[aria-label], a[aria-label]').evaluateAll((actions) => actions.map((action) => {
    const rect = action.getBoundingClientRect();
    return { label: action.getAttribute('aria-label') || '', width: rect.width, height: rect.height, left: rect.left, right: rect.right };
  }));
  assert.equal(darkActionTargets.length, 4, 'the dark mobile action column keeps all four permitted actions visible');
  for (const action of darkActionTargets) {
    assert.ok(action.width >= 40 && action.height >= 40, `${action.label} keeps a 40px target in dark mode: ${JSON.stringify(action)}`);
    assert.ok(action.left >= 0 && action.right <= 320, `${action.label} remains visible in dark mode: ${JSON.stringify(action)}`);
  }
  const darkStickySurface = await darkNarrowPublishingRow.locator('td').last().evaluate((cell) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--xmt-surface)';
    document.body.append(probe);
    const tokenSurface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { actual: getComputedStyle(cell).backgroundColor, token: tokenSurface, position: getComputedStyle(cell).position };
  });
  assert.equal(darkStickySurface.actual, darkStickySurface.token, 'the dark sticky action surface follows the current Studio surface token');
  assert.equal(darkStickySurface.position, 'sticky', 'the dark mobile action column remains fixed');
  assert.ok(await darkNarrowPublishingRow.getByRole('button', { name: `删除发布记录 ${publishing.topic_title}` }).isVisible(), 'the dark theme keeps the row action visible');
  await page.screenshot({ path: '/tmp/xmt-publishing-list-actions-dark-320.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const refreshFailureRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await refreshFailureRow.getByRole('button', { name: '删除' }).click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  const deleteRequestsBeforeRefreshFailure = publishingDeleteRequests;
  delayNextPublishingDelete = true;
  failNextPublishingListRead = true;
  const deleteResponse = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}`));
  await page.getByRole('button', { name: '确认删除', exact: true }).dblclick();
  const pendingDeleteButton = page.getByRole('button', { name: '处理中...', exact: true });
  await pendingDeleteButton.waitFor();
  assert.equal(await pendingDeleteButton.isDisabled(), true, 'the delete confirmation cannot be submitted again while its write is pending');
  assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isDisabled(), true, 'the confirmed delete cannot be dismissed while the request is pending');
  await deleteResponse;
  await page.getByText('删除成功', { exact: true }).waitFor();
  const refreshFailureAlert = page.getByRole('alert').filter({ hasText: '服务端已确认发布记录删除' });
  await refreshFailureAlert.waitFor();
  assert.equal(await page.getByText('获取数据失败', { exact: true }).count(), 0, 'a single persistent list alert replaces a duplicate generic toast after the confirmed delete');
  const refreshAlertLayout = await refreshFailureAlert.evaluate((element) => {
    const message = element.querySelector('p');
    const button = element.querySelector('button');
    return {
      direction: getComputedStyle(element).flexDirection,
      messageWidth: message?.getBoundingClientRect().width ?? 0,
      messageBottom: message?.getBoundingClientRect().bottom ?? 0,
      buttonTop: button?.getBoundingClientRect().top ?? 0,
    };
  });
  assert.equal(refreshAlertLayout.direction, 'column', 'the 390px feedback alert stacks its action below the message');
  assert.ok(refreshAlertLayout.messageWidth > 280 && refreshAlertLayout.buttonTop >= refreshAlertLayout.messageBottom, `the mobile alert gives the Chinese message a readable line width: ${JSON.stringify(refreshAlertLayout)}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the confirmed-delete refresh alert remains within a 390px viewport');
  assert.equal(publishingExists, false, 'the delete mutation is confirmed before the isolated refresh fails');
  assert.equal(publishingDeleteRequests, deleteRequestsBeforeRefreshFailure + 1, 'rapid confirmation submits exactly one DELETE');
  assert.equal(await refreshFailureRow.count(), 0, 'a confirmed deleted row is removed locally rather than left available for duplicate deletion');
  assert.equal(await page.getByRole('heading', { name: '确认删除', exact: true }).count(), 0, 'a confirmed delete closes its confirmation even when the later list read fails');
  await page.screenshot({ path: '/tmp/xmt-v7-7-publishing-delete-refresh-error.png', fullPage: false });
  const listRequestsBeforeRetry = publishingListRequests;
  await refreshFailureAlert.getByRole('button', { name: '重新加载列表' }).click();
  await page.getByText('暂无发布记录', { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the recovered empty state remains within a 390px viewport');
  await page.screenshot({ path: '/tmp/xmt-v7-7-publishing-delete-refresh-recovered.png', fullPage: false });
  assert.equal(publishingListRequests, listRequestsBeforeRetry + 1, 'list retry performs one GET');
  assert.equal(publishingDeleteRequests, deleteRequestsBeforeRefreshFailure + 1, 'list retry does not repeat the confirmed DELETE');

  publishingExists = true;
  await page.goto(`${base}/__qa?theme=light`);
  const deleteRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await deleteRow.getByRole('button', { name: '删除' }).click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  const deleteRequestsBeforeKnownFailure = publishingDeleteRequests;
  const detailReadsBeforeKnownFailure = publishingDetailRequests;
  failNextPublishingDelete = true;
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  const stillExistsNotice = page.getByRole('status').filter({ hasText: '服务器确认发布记录' });
  await stillExistsNotice.waitFor();
  assert.equal(publishingExists, true, 'failed publishing deletion leaves the isolated record intact');
  assert.equal(publishingDetailRequests, detailReadsBeforeKnownFailure + 1, 'an uncertain DELETE is resolved with one read-only detail request');
  assert.equal(publishingDeleteRequests, deleteRequestsBeforeKnownFailure + 1, 'the failed delete is not retried automatically');
  assert.equal(await page.getByRole('heading', { name: '确认删除', exact: true }).count(), 0, 'the original confirmation closes while the user reviews the authoritative state');
  await deleteRow.getByRole('button', { name: '删除' }).click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除成功', { exact: true }).waitFor();
  assert.equal(publishingExists, false, 'successful publishing deletion removes the isolated record');
  assert.equal(publishingDeleteRequests, deleteRequestsBeforeKnownFailure + 2, 'a second DELETE occurs only after the user explicitly confirms again');

  publishingExists = true;
  await page.goto(`${base}/__qa?theme=light`);
  const uncertainDeleteRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await uncertainDeleteRow.getByRole('button', { name: '删除' }).click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  const deleteRequestsBeforeUnknownResult = publishingDeleteRequests;
  const detailReadsBeforeUnknownResult = publishingDetailRequests;
  await fetch(`${base}/__qa/commit-next-publishing-delete-and-fail`, { method: 'POST' });
  await fetch(`${base}/__qa/fail-next-publishing-detail-read`, { method: 'POST' });
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '删除请求未获确认' }).waitFor();
  assert.equal(publishingExists, false, 'the fixture commits the delete before returning an uncertain server error');
  assert.equal(publishingDeleteRequests, deleteRequestsBeforeUnknownResult + 1, 'the uncertain server response causes only one DELETE');
  assert.equal(publishingDetailRequests, detailReadsBeforeUnknownResult + 1, 'the first status check is read-only and fails as injected');
  assert.equal(await page.evaluate(() => Boolean(sessionStorage.getItem('xmt:publishing-delete-pending:v1:user:96'))), true, 'the unresolved delete identity is retained in the current tab session');
  assert.equal(await uncertainDeleteRow.getByRole('button', { name: '删除' }).isDisabled(), true, 'publishing mutations remain locked while the delete status is unknown');
  assert.equal(await uncertainDeleteRow.locator('td').first().getByRole('button').isDisabled(), true, 'the detail page cannot be opened from the unresolved row');
  await page.reload();
  await page.getByRole('heading', { name: '发布管理' }).waitFor();
  await page.getByText('暂无发布记录', { exact: true }).waitFor();
  assert.equal(publishingDetailRequests, detailReadsBeforeUnknownResult + 2, 'refresh resumes with a second read-only check by record id');
  assert.equal(publishingDeleteRequests, deleteRequestsBeforeUnknownResult + 1, 'refresh recovery does not repeat the DELETE');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:publishing-delete-pending:v1:user:96')), null, 'the recovery marker is removed after the server confirms deletion');

  await page.goto(`${base}/__qa?theme=light`);
  await page.getByRole('button', { name: '添加发布记录', exact: true }).first().click();
  await page.getByLabel('关联选题 *', { exact: true }).selectOption(String(createdPublishing.topic_id));
  const createRequestsBeforeLostResponse = publishingCreateRequests;
  const createStatusReadsBeforeLostResponse = publishingCreateStatusRequests;
  await fetch(`${base}/__qa/commit-next-publishing-create-and-fail`, { method: 'POST' });
  await fetch(`${base}/__qa/fail-next-publishing-create-status-read`, { method: 'POST' });
  const lostCreateResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/workflow/publishing'));
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await lostCreateResponse;
  const uncertainCreateAlert = page.getByRole('alert').filter({ hasText: '发布记录创建结果尚未确认' });
  await uncertainCreateAlert.waitFor();
  assert.equal(createdPublishingExists, true, 'the create fixture commits the publication before losing its response');
  assert.equal(publishingCreateRequests, createRequestsBeforeLostResponse + 1, 'the uncertain create submits exactly one POST');
  assert.equal(publishingCreateStatusRequests, createStatusReadsBeforeLostResponse + 1, 'the first result check is read-only and fails as injected');
  assert.equal(await page.evaluate(() => Boolean(sessionStorage.getItem('xmt:publishing-create-pending:v1:user:96'))), true, 'the create payload and request key survive in the tab session');
  assert.equal(await page.getByRole('button', { name: '添加发布记录', exact: true }).first().isDisabled(), true, 'a second create is locked while the first result is unknown');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the uncertain-create alert remains within the mobile viewport');
  await page.reload();
  await page.getByRole('heading', { name: '发布管理' }).waitFor();
  await page.getByText(createdPublishing.topic_title, { exact: true }).waitFor();
  assert.equal(publishingCreateStatusRequests, createStatusReadsBeforeLostResponse + 2, 'refresh resumes with one read-only status request');
  assert.equal(publishingCreateRequests, createRequestsBeforeLostResponse + 1, 'refresh recovery never resends the POST');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:publishing-create-pending:v1:user:96')), null, 'the recovery marker is cleared after status confirmation');

  await fetch(`${base}/__qa/reset`, { method: 'POST' });
  publishingExists = true;
  createdPublishingExists = false;
  await page.goto(`${base}/__qa?theme=light`);
  await page.getByRole('button', { name: '添加发布记录', exact: true }).first().click();
  for (const [label, id, name] of [
    ['关联选题 *', 'publishing-topic-id', 'topic_id'],
    ['发布平台', 'publishing-platform', 'platform'],
    ['发布链接', 'publishing-url', 'url'],
    ['发布时间', 'publishing-publish-time', 'publish_time'],
    ['状态', 'publishing-status', 'status'],
    ['手工补充播放量', 'publishing-metric-views', 'views'],
    ['手工补充点赞量', 'publishing-metric-likes', 'likes'],
    ['手工补充分享量', 'publishing-metric-shares', 'shares'],
    ['手工补充评论量', 'publishing-metric-comments', 'comments'],
  ] as const) {
    const field = page.getByLabel(label, { exact: true });
    assert.equal(await field.count(), 1, `${label} is associated with exactly one publishing form control`);
    assert.equal(await field.getAttribute('id'), id, `${label} has a stable id linked from its label`);
    assert.equal(await field.getAttribute('name'), name, `${label} has a stable form name`);
  }
  await page.getByLabel('关联选题 *', { exact: true }).selectOption(String(createdPublishing.topic_id));
  const createRequestsBeforeRefreshFailure = publishingCreateRequests;
  delayNextPublishingCreate = true;
  failNextPublishingListRead = true;
  const createSaveButton = page.getByRole('button', { name: '保存', exact: true });
  const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/workflow/publishing'));
  await createSaveButton.dblclick();
  const pendingSaveButton = page.getByRole('button', { name: '提交中...', exact: true });
  await pendingSaveButton.waitFor();
  assert.equal(await pendingSaveButton.isDisabled(), true, 'the publishing save button is disabled while its write is pending');
  assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isDisabled(), true, 'the publishing form cannot be dismissed while its confirmed write is pending');
  assert.equal(await page.getByLabel('关联选题 *', { exact: true }).isDisabled(), true, 'publishing fields cannot change while the submitted values are being saved');
  await createResponse;
  await page.getByText('创建成功', { exact: true }).waitFor();
  const createRefreshFailureAlert = page.getByRole('alert').filter({ hasText: '服务端已确认发布记录创建' });
  await createRefreshFailureAlert.waitFor();
  assert.equal(createdPublishingExists, true, 'the isolated create mutation is confirmed before its list read fails');
  assert.equal(publishingCreateRequests, createRequestsBeforeRefreshFailure + 1, 'the create request is submitted exactly once');
  const createListRequestsBeforeRetry = publishingListRequests;
  await createRefreshFailureAlert.getByRole('button', { name: '重新加载列表' }).click();
  await page.getByText(createdPublishing.topic_title, { exact: true }).waitFor();
  assert.equal(publishingListRequests, createListRequestsBeforeRetry + 1, 'creation recovery performs one additional list GET');
  assert.equal(publishingCreateRequests, createRequestsBeforeRefreshFailure + 1, 'creation recovery does not repeat the confirmed POST');

  await page.setViewportSize({ width: 1440, height: 900 });
  failNextPublishingListRead = true;
  const reconcileRequestsBeforeRefreshFailure = douyinReconcileRequests;
  delayNextDouyinReconcile = true;
  const reconcileResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/workflow/publishing/douyin/reconcile'));
  await page.getByRole('button', { name: '刷新抖音关联' }).dblclick();
  const pendingReconcileButton = page.getByRole('button', { name: '正在关联', exact: true });
  await pendingReconcileButton.waitFor();
  assert.equal(await pendingReconcileButton.isDisabled(), true, 'Douyin reconciliation cannot be submitted again while its write is pending');
  await reconcileResponse;
  await page.getByText('抖音数据关联已刷新', { exact: true }).waitFor();
  const reconcileRefreshAlert = page.getByRole('alert').filter({ hasText: '服务端已确认抖音数据关联刷新' });
  await reconcileRefreshAlert.waitFor();
  assert.equal(douyinReconcileRequests, reconcileRequestsBeforeRefreshFailure + 1, 'Douyin reconciliation is confirmed once before list refresh');
  const reconcileListRequestsBeforeRetry = publishingListRequests;
  await reconcileRefreshAlert.getByRole('button', { name: '重新加载列表' }).click();
  await page.locator('tbody tr').filter({ hasText: createdPublishing.topic_title }).waitFor();
  assert.equal(publishingListRequests, reconcileListRequestsBeforeRetry + 1, 'reconciliation recovery performs one read-only list request');
  assert.equal(douyinReconcileRequests, reconcileRequestsBeforeRefreshFailure + 1, 'read-only list recovery does not repeat reconciliation');

  douyinReconcileArchiveSyncPending = 2;
  const partialReconcileRequestsBefore = douyinReconcileRequests;
  const partialReconcileResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/workflow/publishing/douyin/reconcile'));
  await page.getByRole('button', { name: '刷新抖音关联' }).click();
  await partialReconcileResponse;
  await page.getByText('抖音关联已刷新，归档待同步', { exact: true }).waitFor();
  await page.getByText(/2 个选题的发布归档暂未同步，可在对应发布详情页重试。/).waitFor();
  assert.equal(douyinReconcileRequests, partialReconcileRequestsBefore + 1, 'partial archive synchronization is reported without repeating the reconciliation request');
  douyinReconcileArchiveSyncPending = 0;

  const linkedPublishingRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  const secondPublishingRow = page.locator('tbody tr').filter({ hasText: createdPublishing.topic_title });
  const douyinLinkRequestsBeforeCandidateRace = douyinLinkRequests;
  await setCandidateResponseHold(publishing.id, true);
  const firstCandidateRequest = page.waitForRequest((request) => request.method() === 'GET' && new URL(request.url()).pathname.endsWith(`/api/workflow/publishing/${publishing.id}/douyin-candidates`));
  await linkedPublishingRow.getByTitle('调整抖音作品关联').click();
  await page.getByRole('heading', { name: '关联抖音作品' }).waitFor();
  await firstCandidateRequest;
  await waitForPendingCandidateResponse(publishing.id);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('heading', { name: '关联抖音作品' }).waitFor({ state: 'detached' });

  await setCandidateResponseHold(createdPublishing.id, true);
  const secondCandidateRequest = page.waitForRequest((request) => request.method() === 'GET' && new URL(request.url()).pathname.endsWith(`/api/workflow/publishing/${createdPublishing.id}/douyin-candidates`));
  await secondPublishingRow.getByTitle('关联抖音作品').click();
  await page.getByRole('heading', { name: '关联抖音作品' }).waitFor();
  await secondCandidateRequest;
  await waitForPendingCandidateResponse(createdPublishing.id);
  const releasedSecondCandidates = await setCandidateResponseHold(createdPublishing.id, false);
  assert.equal(releasedSecondCandidates.released, 1, 'the second publishing candidate response is released first');
  await page.getByText('第二发布记录候选', { exact: true }).waitFor();
  const staleFirstCandidateResponse = page.waitForResponse((response) => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith(`/api/workflow/publishing/${publishing.id}/douyin-candidates`));
  const releasedFirstCandidates = await setCandidateResponseHold(publishing.id, false);
  assert.equal(releasedFirstCandidates.released, 1, 'the original publishing candidate response is released after the current target loads');
  await staleFirstCandidateResponse;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  assert.equal(await page.getByText('第二发布记录候选', { exact: true }).count(), 1, 'the current target candidate remains after a stale response arrives');
  assert.equal(await page.getByText('人工关联作品候选', { exact: true }).count(), 0, 'the stale first-target candidate is not shown in the second target dialog');
  assert.equal(douyinLinkRequests, douyinLinkRequestsBeforeCandidateRace, 'stale candidate responses do not trigger a link write');
  const secondTargetLinkResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${createdPublishing.id}/douyin-link`));
  await page.getByRole('button', { name: '关联此作品', exact: true }).click();
  await secondTargetLinkResponse;
  await page.getByText('关联成功', { exact: true }).waitFor();
  await page.getByRole('heading', { name: '关联抖音作品' }).waitFor({ state: 'detached' });
  assert.deepEqual(douyinLinkTargets.at(-1), { publishingId: createdPublishing.id, workId: 966 }, 'the second target can only be linked to its own candidate');

  await setCandidateResponseSequence(publishing.id, true);
  await setCandidateResponseHold(publishing.id, true);
  await waitForEnabledAction(linkedPublishingRow.getByTitle('调整抖音作品关联'), 'the linked publishing candidate action');
  const firstSameTargetRequest = page.waitForRequest((request) => request.method() === 'GET' && new URL(request.url()).pathname.endsWith(`/api/workflow/publishing/${publishing.id}/douyin-candidates`));
  await linkedPublishingRow.getByTitle('调整抖音作品关联').click();
  await firstSameTargetRequest;
  await waitForPendingCandidateResponse(publishing.id);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('heading', { name: '关联抖音作品' }).waitFor({ state: 'detached' });
  await waitForEnabledAction(linkedPublishingRow.getByTitle('调整抖音作品关联'), 'the linked publishing candidate action after closing the dialog');
  await linkedPublishingRow.getByTitle('调整抖音作品关联').click();
  await page.getByRole('heading', { name: '关联抖音作品' }).waitFor();
  const reopenedSameTargetRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return request.method() === 'GET'
      && url.pathname.endsWith(`/api/workflow/publishing/${publishing.id}/douyin-candidates`)
      && url.searchParams.get('query') === '重新打开';
  });
  await page.getByRole('textbox', { name: '搜索抖音作品标题关键词' }).fill('重新打开');
  await page.getByRole('button', { name: '搜索候选', exact: true }).click();
  await reopenedSameTargetRequest;
  await waitForPendingCandidateResponse(publishing.id, 2);
  const reopenedCandidate = await setCandidateResponseHold(publishing.id, false, { latest: true, keepHeld: true });
  assert.equal(reopenedCandidate.released, 1, 'the reopened same-target candidate response is released before the prior request');
  await page.getByText('重新打开后的候选', { exact: true }).waitFor();
  const oldSameTargetResponse = page.waitForResponse((response) => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith(`/api/workflow/publishing/${publishing.id}/douyin-candidates`));
  const oldCandidate = await setCandidateResponseHold(publishing.id, false);
  assert.equal(oldCandidate.released, 1, 'the earlier same-target response is released last');
  await oldSameTargetResponse;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  assert.equal(await page.getByText('重新打开后的候选', { exact: true }).count(), 1, 'reopening the same target keeps the newest candidate result');
  assert.equal(await page.getByText('旧候选响应', { exact: true }).count(), 0, 'the earlier same-target response cannot replace the reopened result');
  assert.equal(douyinLinkRequests, douyinLinkRequestsBeforeCandidateRace + 1, 'stale same-target results do not trigger an additional link write');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('heading', { name: '关联抖音作品' }).waitFor({ state: 'detached' });
  await setCandidateResponseSequence(publishing.id, false);

  await linkedPublishingRow.getByTitle('调整抖音作品关联').click();
  await page.getByRole('heading', { name: '关联抖音作品' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '搜索抖音作品标题关键词' }).getAttribute('id'), 'douyin-candidate-search', 'the Douyin candidate search has a stable id and accessible name');
  await page.getByText('人工关联作品候选', { exact: true }).waitFor();
  failNextPublishingListRead = true;
  delayNextDouyinLink = true;
  const douyinLinkRequestsBeforeRefreshFailure = douyinLinkRequests;
  const douyinLinkResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}/douyin-link`));
  await page.getByRole('button', { name: '关联此作品' }).dblclick();
  assert.equal(await page.getByRole('button', { name: '关闭', exact: true }).isDisabled(), true, 'the Douyin link dialog cannot be dismissed while its write is pending');
  await douyinLinkResponse;
  await page.getByText('关联成功', { exact: true }).waitFor();
  const linkRefreshAlert = page.getByRole('alert').filter({ hasText: '服务端已确认抖音作品关联，但发布列表刷新失败' });
  await linkRefreshAlert.waitFor();
  assert.equal(currentDouyinWorkId, 965, 'the isolated manual Douyin link is persisted before list refresh');
  assert.equal(douyinLinkRequests, douyinLinkRequestsBeforeRefreshFailure + 1, 'manual Douyin linking is confirmed once');
  const linkListRequestsBeforeRetry = publishingListRequests;
  await linkRefreshAlert.getByRole('button', { name: '重新加载列表' }).click();
  await page.locator('tbody tr').filter({ hasText: publishing.topic_title }).waitFor();
  assert.equal(publishingListRequests, linkListRequestsBeforeRetry + 1, 'manual-link recovery performs one read-only list request');
  assert.equal(douyinLinkRequests, douyinLinkRequestsBeforeRefreshFailure + 1, 'read-only list recovery does not repeat manual linking');

  await page.request.post(`${base}/__qa/commit-next-douyin-link-and-fail`);
  await page.request.post(`${base}/__qa/fail-next-publishing-detail-read`);
  const douyinUnlinkRequestsBeforeAmbiguousCommit = douyinLinkRequests;
  const refreshedLinkedRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await refreshedLinkedRow.getByTitle('调整抖音作品关联').click();
  await page.getByRole('heading', { name: '关联抖音作品' }).waitFor();
  const unlinkResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}/douyin-link`));
  await page.getByRole('button', { name: '解除当前关联' }).click();
  assert.equal((await unlinkResponse).status(), 503, 'the committed unlink loses its response');
  await page.getByRole('alert').filter({ hasText: '抖音关联结果尚未确认' }).waitFor();
  assert.equal(douyinLinkRequests, douyinUnlinkRequestsBeforeAmbiguousCommit + 1, 'the ambiguous unlink is sent once');
  assert.equal(await page.getByRole('button', { name: '添加发布记录' }).isDisabled(), true, 'list writes are locked while the Douyin relation is uncertain');
  const douyinLinkMarker = await page.evaluate((userId) => sessionStorage.getItem(`xmt:publishing-douyin-link-pending:v1:user:${userId}`), user.id);
  assert.ok(douyinLinkMarker, 'the exact Douyin relation change is saved in the tab session before the write');

  await page.reload();
  await page.getByRole('heading', { name: '发布管理' }).waitFor();
  await page.getByText('关联结果已核实', { exact: true }).waitFor();
  assert.equal(currentDouyinWorkId, null, 'read-only recovery confirms the committed unlink');
  assert.equal(douyinLinkRequests, douyinUnlinkRequestsBeforeAmbiguousCommit + 1, 'refresh confirms the committed unlink without another PUT');
  assert.equal(await page.evaluate((userId) => sessionStorage.getItem(`xmt:publishing-douyin-link-pending:v1:user:${userId}`), user.id), null, 'confirmed unlink recovery clears its tab-session marker');

  const unlinkedPublishingRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await unlinkedPublishingRow.getByTitle('关联抖音作品').click();
  await page.getByText('人工关联作品候选', { exact: true }).waitFor();
  await page.request.post(`${base}/__qa/fail-next-douyin-link-without-commit`);
  const douyinRequestsBeforeNotApplied = douyinLinkRequests;
  const notAppliedDouyinResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}/douyin-link`));
  await page.getByRole('button', { name: '关联此作品', exact: true }).click();
  assert.equal((await notAppliedDouyinResponse).status(), 503, 'the uncommitted link response is ambiguous');
  await page.getByText('关联尚未应用', { exact: true }).waitFor();
  assert.equal(currentDouyinWorkId, null, 'readback confirms the original unlinked state');
  assert.equal(douyinLinkRequests, douyinRequestsBeforeNotApplied + 1, 'an unchanged readback does not automatically repeat the link PUT');
  const explicitDouyinRetry = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}/douyin-link`));
  await page.getByRole('button', { name: '关联此作品', exact: true }).click();
  assert.equal((await explicitDouyinRetry).status(), 200, 'manual linking can be retried only by an explicit user action');
  assert.equal(douyinLinkRequests, douyinRequestsBeforeNotApplied + 2, 'only the explicit action sends the second link PUT');
  assert.equal(currentDouyinWorkId, 965, 'the explicit retry updates the Douyin relation');
  await page.getByText('关联成功', { exact: true }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  const editRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await editRow.getByTitle('编辑').click();
  await page.getByRole('heading', { name: '编辑发布记录' }).waitFor();
  assert.equal(await page.locator('#publishing-publish-time').inputValue(), '2026-10-07', 'editing uses a valid date value for the date input');
  await page.locator('#publishing-metric-views').fill('4321');
  await page.request.post(`${base}/__qa/commit-next-publishing-update-and-fail`);
  await page.request.post(`${base}/__qa/fail-next-publishing-detail-read`);
  const updateRequestsBeforeAmbiguousCommit = publishingUpdateRequests;
  const updateResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}`));
  await page.getByRole('button', { name: '更新', exact: true }).click();
  assert.equal((await updateResponse).status(), 503, 'the committed publishing update loses its response');
  await page.getByRole('alert').filter({ hasText: '发布记录更新结果尚未确认' }).waitFor();
  assert.equal(publishingUpdateRequests, updateRequestsBeforeAmbiguousCommit + 1, 'the ambiguous update is sent once');
  assert.equal(await page.getByRole('button', { name: '添加发布记录' }).isDisabled(), true, 'writes are locked while update outcome remains unknown');
  assert.equal(await page.getByRole('button', { name: '编辑发布记录 发布列表主题对比度验收' }).isDisabled(), true, 'editing is locked while update outcome remains unknown');
  const pendingUpdateWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  assert.ok(pendingUpdateWidth.scroll <= pendingUpdateWidth.viewport, 'the pending update recovery banner does not overflow at 390px');
  const updateMarker = await page.evaluate((userId) => sessionStorage.getItem(`xmt:publishing-update-pending:v1:user:${userId}`), user.id);
  assert.ok(updateMarker, 'the exact update request is preserved in the tab session before reload');

  await page.reload();
  await page.getByRole('heading', { name: '发布管理' }).waitFor();
  await page.getByText('更新结果已核实', { exact: true }).waitFor();
  assert.equal(publishingUpdateRequests, updateRequestsBeforeAmbiguousCommit + 1, 'refresh verifies the committed update with GET and never repeats PUT');
  assert.equal(publishing.manual_views, 4321, 'the confirmed manual metric is reflected in the server record');
  assert.equal(await page.evaluate((userId) => sessionStorage.getItem(`xmt:publishing-update-pending:v1:user:${userId}`), user.id), null, 'confirmed recovery clears its tab-session marker');

  const editRowAfterRecovery = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await editRowAfterRecovery.getByTitle('编辑').click();
  await page.getByRole('heading', { name: '编辑发布记录' }).waitFor();
  await page.locator('#publishing-metric-views').fill('9876');
  await page.request.post(`${base}/__qa/fail-next-publishing-update-without-commit`);
  const updateRequestsBeforeNotApplied = publishingUpdateRequests;
  const notAppliedResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}`));
  await page.getByRole('button', { name: '更新', exact: true }).click();
  assert.equal((await notAppliedResponse).status(), 503, 'the non-committed update response is ambiguous');
  await page.getByText('更新尚未应用', { exact: true }).waitFor();
  assert.equal(await page.locator('#publishing-metric-views').inputValue(), '9876', 'the unchanged server state preserves the user edit draft');
  assert.equal(await page.locator('#publishing-publish-time').inputValue(), '2026-10-07', 'the restored date input retains its Beijing calendar day');
  assert.equal(publishingUpdateRequests, updateRequestsBeforeNotApplied + 1, 'an unchanged readback does not automatically repeat PUT');
  const explicitUpdateRetry = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}`));
  await page.getByRole('button', { name: '更新', exact: true }).click();
  assert.equal((await explicitUpdateRetry).status(), 200, 'the user can explicitly retry from the restored form');
  assert.equal(publishingUpdateRequests, updateRequestsBeforeNotApplied + 2, 'only the explicit user action sends the second PUT');
  await page.getByText('更新成功', { exact: true }).waitFor();

  await page.goto(`${base}/publishing/${publishing.id}`);
  await page.getByRole('heading', { name: '剧本内容' }).waitFor();
  const topicInformation = page.getByRole('heading', { name: '选题信息' }).locator('xpath=..');
  const publishingInformation = page.getByRole('heading', { name: '发布信息' }).locator('xpath=..');
  assert.equal(await topicInformation.getByText('douyin', { exact: true }).count(), 0, 'topic platform identifiers are not shown as raw codes');
  assert.equal(await topicInformation.getByText('抖音', { exact: true }).count(), 1, 'topic platform identifiers use the shared business label');
  assert.equal(await publishingInformation.getByText('douyin', { exact: true }).count(), 0, 'publishing platform identifiers are not shown as raw codes');
  assert.equal(await publishingInformation.getByText('抖音', { exact: true }).count(), 1, 'publishing platform identifiers use the shared business label');
  await page.getByRole('button', { name: '编辑剧本' }).click();
  const scriptEditor = page.locator('.ProseMirror[contenteditable="true"]').first();
  await scriptEditor.fill('异步成功稿');
  await page.request.post(`${base}/__qa/delay-next-publishing-script-save`);
  const scriptSaveRequestsBefore = publishingUpdateRequests;
  const delayedScriptSave = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}`), { timeout: 15_000 });
  await scriptEditor.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await page.locator('.save-status').getByText('保存中...', { exact: true }).waitFor();
  assert.equal(await page.locator('.save-status').getByText('已同步', { exact: true }).count(), 0,
    'the editor must not show success while the server-owned save is still pending');
  assert.equal((await delayedScriptSave).status(), 200, 'the delayed server-owned script save eventually confirms');
  await page.getByText('保存成功', { exact: true }).waitFor();
  assert.equal(publishingUpdateRequests, scriptSaveRequestsBefore + 1, 'a successful manual save sends exactly one PUT');
  const confirmedScript = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.ok(String(confirmedScript.publishingScriptContent).includes('异步成功稿'), 'the confirmed script is reflected in the isolated server state');

  await page.getByRole('button', { name: '编辑剧本' }).click();
  const unconfirmedScriptEditor = page.locator('.ProseMirror[contenteditable="true"]').first();
  await unconfirmedScriptEditor.fill('未提交保留稿');
  await page.request.post(`${base}/__qa/fail-next-publishing-script-save-without-commit`);
  const notCommittedScriptSave = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}`));
  await unconfirmedScriptEditor.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  assert.equal((await notCommittedScriptSave).status(), 503, 'the fixture rejects the uncommitted script save');
  await page.getByText('剧本尚未保存', { exact: true }).waitFor();
  await page.locator('.save-status').getByText('存在冲突', { exact: true }).waitFor();
  assert.ok((await unconfirmedScriptEditor.innerText()).includes('未提交保留稿'), 'the unconfirmed script draft remains editable');
  assert.equal(publishingUpdateRequests, scriptSaveRequestsBefore + 2, 'an unconfirmed save is never retried automatically');
  const unchangedScript = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.ok(String(unchangedScript.publishingScriptContent).includes('异步成功稿'), 'read-only verification preserves the last server-confirmed script');
  assert.ok(!String(unchangedScript.publishingScriptContent).includes('未提交保留稿'), 'the unsaved text is not presented as server-confirmed');

  assert.deepEqual(errors, [], 'publishing light/dark contrast fixture renders without browser errors');
  assert.equal(expectedHttpNotFoundResponses.length, 1, 'the only publishing-detail 404 is the read-only check confirming a deleted record');
  assert.equal(consoleNotFoundMessages.length, expectedHttpNotFoundResponses.length, 'each expected deleted-record 404 has exactly one browser console message');
  assert.equal(expectedHttpErrors.length, 16, `the isolated fixture returns only its intentional 503 responses: ${JSON.stringify(expectedHttpErrorResponses)}`);
  assert.equal(expectedHttpErrorResponses.length, expectedHttpErrors.length, 'every expected 503 console message corresponds to exactly one isolated fixture response');
  console.log('Publishing browser test passed: responsive contrast and confirmed/ambiguous publishing writes, including asynchronous manual script save, retain safe state without automatic retries.');
} finally {
  await browser?.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
