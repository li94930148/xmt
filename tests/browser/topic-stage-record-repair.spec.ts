import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

async function renderedTextContrastRatio(locator: import('playwright').Locator) {
  return locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    context.fillStyle = getComputedStyle(element).color;
    context.fillRect(0, 0, 1, 1);
    const foreground = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    const background = [255, 255, 255];
    const layers = [getComputedStyle(document.documentElement).backgroundColor];
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    for (const ancestor of ancestors.reverse()) layers.push(getComputedStyle(ancestor).backgroundColor);
    for (const color of layers) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const layer = Array.from(context.getImageData(0, 0, 1, 1).data);
      const alpha = layer[3] / 255;
      for (let index = 0; index < 3; index += 1) background[index] = layer[index] * alpha + background[index] * (1 - alpha);
    }
    let textLuminance = 0;
    let backgroundLuminance = 0;
    const weights = [0.2126, 0.7152, 0.0722];
    for (let index = 0; index < 3; index += 1) {
      const textValue = foreground[index] / 255;
      const backgroundValue = background[index] / 255;
      textLuminance += weights[index] * (textValue <= 0.04045 ? textValue / 12.92 : ((textValue + 0.055) / 1.055) ** 2.4);
      backgroundLuminance += weights[index] * (backgroundValue <= 0.04045 ? backgroundValue / 12.92 : ((backgroundValue + 0.055) / 1.055) ** 2.4);
    }
    return (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05);
  });
}

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const editor = { id: 93, username: 'topic-stage-qa', role: 'editor', name: '阶段记录验收', enabled: true, force_change_password: false };
const viewer = { id: 94, username: 'topic-stage-viewer-qa', role: 'member', name: '只读验收', enabled: true, force_change_password: false };
const manager = { id: 95, username: 'topic-stage-manager-qa', role: 'director', name: '负责人验收', enabled: true, force_change_password: false };
const creator = { id: 96, username: 'topic-stage-creator-qa', role: 'member', name: '创作者验收', enabled: true, force_change_password: false };
const actionableManagerMessage = { id: 951, user_id: manager.id, title: '需要确认发布安排', content: '发布安排仍待跟进。', type: 'warning', read: false, link: '/publishing/941', created_at: '2026-10-09 10:00:00' };
const managerSyncAccountUid = 'manager-sync-anomaly-uid';
const managerSecondarySyncAccountUid = 'manager-secondary-sync-uid';
const managerSyncAnomaly = { id: 981, platform: 'douyin', account_name: '负责人验收账号', account_uid: managerSyncAccountUid, status: 'partial_success', start_time: '2026-10-09 11:00:00', success_count: 3, failed_count: 2, owner_name: editor.name };
const managerCreatorAgentA = { id: 1, device_id: 'manager-device-a', device_name: '采集设备 A', browser_type: '浏览器 A', browser_version: 'A-浏览器版本', browser_login_status: 'invalid', browser_compatibility: 'A-兼容状态', status: 'active', account_id: managerSyncAccountUid, online: 1 };
const managerProductionReview = { id: 942, topic_id: 934, topic_title: '待审核稿件浏览器验收', version: 'v1.0', updated_at: '2026-10-09 08:30:00', operator_name: editor.name, assignee_name: editor.name };
let managerProductionReviewStatus = 'review';
let managerProductionReviewContent = '<p>隔离验收稿件正文</p>';
let managerProductionApprovalWrites = 0;
const productionTopic = {
  id: 931,
  title: '缺失创作稿的选题',
  description: '浏览器隔离验收',
  outline: '阶段记录浏览器验收大纲',
  outline_markdown: '阶段记录浏览器验收大纲',
  outline_json: '阶段记录浏览器验收大纲',
  status: 'production',
  platform: '抖音',
  deadline: '2026-10-10',
  creator_id: editor.id,
  assignee_id: editor.id,
  creator_name: editor.name,
  assignee_name: editor.name,
  history: [],
  stage_record_presence: { production: false, shooting: false, publishing: false },
};
const approvedPipelineTopic = {
  ...productionTopic,
  id: 953,
  title: '内容流已通过待开始创作',
  description: '隔离首页内容流验收',
  status: 'approved',
  created_at: '2026-10-09 09:30:00',
};
let approvedPipelineStageEnteredAt: string | null | undefined = '2026-10-06 12:00:00';
const completedTopic = {
  ...productionTopic,
  id: 932,
  title: '已完成但缺发布记录',
  status: 'completed',
  history: [],
  stage_record_presence: { production: true, shooting: true, publishing: false },
};
const auditTopic = {
  ...productionTopic,
  id: 934,
  title: '审核状态对比度验收选题',
  status: 'pending',
  created_at: '2026-10-09 09:00:00',
  updated_at: '2026-10-09 09:30:00',
  stage_entered_at: '2026-10-08 10:00:00',
  stage_record_presence: { production: true, shooting: true, publishing: false },
};
const secondPendingTopic = { ...auditTopic, id: 937, title: '内容流第二条待审选题', created_at: '2026-10-09 08:00:00', updated_at: '2026-10-09 09:20:00', stage_entered_at: '2026-10-09 11:30:00' };
const thirdPendingTopic = { ...auditTopic, id: 938, title: '内容流第三条待审选题', created_at: '2026-10-09 07:00:00', updated_at: '2026-10-09 09:10:00', stage_entered_at: '2026-10-07 12:00:00' };
const fourthPendingTopic = { ...auditTopic, id: 939, title: '内容流第四条待审选题', created_at: '2026-10-09 06:00:00', updated_at: '2026-10-09 09:40:00', stage_entered_at: '2026-10-06 08:00:00' };
const leaveGuardTopic = {
  ...productionTopic,
  id: 935,
  title: '选题离开确认对比度验收',
  status: 'shooting',
  stage_record_presence: { production: true, shooting: true, publishing: false },
};
const missingAdvanceTopic = {
  ...leaveGuardTopic,
  id: 945,
  title: '缺少成片记录时不可推进',
  stage_record_presence: { production: true, shooting: false, publishing: false },
};
const mobileMissingAdvanceTopic = {
  ...missingAdvanceTopic,
  id: 946,
  title: '移动端缺少成片记录时不可推进',
  stage_record_presence: { production: true, shooting: false, publishing: false },
};
const desktopDelayedAdvanceTopic = {
  ...leaveGuardTopic,
  id: 947,
  title: '桌面阶段推进重复提交保护验收',
};
const desktopCommittedAdvanceTopic = {
  ...leaveGuardTopic,
  id: 960,
  title: '桌面阶段推进响应丢失恢复验收',
};
const desktopReadbackRetryAdvanceTopic = {
  ...leaveGuardTopic,
  id: 961,
  title: '桌面阶段推进只读恢复与明确重试验收',
};
const mobileDelayedAdvanceTopic = {
  ...leaveGuardTopic,
  id: 948,
  title: '移动阶段推进重复提交保护验收',
};
const mobileDelayedSaveTopic = {
  ...productionTopic,
  id: 950,
  title: '移动端保存重复提交保护验收',
  stage_record_presence: { production: true, shooting: true, publishing: true },
};
const mobileEditCommittedTopic = {
  ...productionTopic,
  id: 956,
  title: '移动端内容保存响应丢失验收',
  description: '服务端原始说明',
  stage_record_presence: { production: true, shooting: true, publishing: true },
};
const mobileEditRetryTopic = {
  ...mobileEditCommittedTopic,
  id: 957,
  title: '移动端内容保存明确重试验收',
};
const mobileEditReadFailureTopic = {
  ...mobileEditCommittedTopic,
  id: 958,
  title: '移动端内容保存只读恢复验收',
};
const mobileEditConflictTopic = {
  ...mobileEditCommittedTopic,
  id: 959,
  title: '移动端内容保存并发变化验收',
};
const mobileDelayedRepairTopic = {
  ...leaveGuardTopic,
  id: 951,
  title: '移动端补齐记录重复提交保护验收',
  stage_record_presence: { production: true, shooting: false, publishing: false },
};
const mobileTopic = {
  ...productionTopic,
  id: 933,
  title: '移动端缺失创作稿',
  history: [{
    id: 1,
    action: 'production_status_changed',
    comment: '创作记录 #18 状态由「草稿」变更为「审核中」',
    operator_name: editor.name,
    created_at: '2026-09-30 09:00:00',
  }],
  stage_record_presence: { production: false, shooting: false, publishing: false },
};
const saveTopic = {
  ...productionTopic,
  id: 936,
  title: '保存结果边界验收选题',
  stage_record_presence: { production: true, shooting: true, publishing: false },
};
const manualSaveTopic = {
  ...productionTopic,
  id: 940,
  title: '手动保存失败反馈验收选题',
  description: '【项目背景】\n手动保存反馈验收',
  stage_record_presence: { production: true, shooting: true, publishing: false },
};
const topics = new Map([[productionTopic.id, productionTopic], [approvedPipelineTopic.id, approvedPipelineTopic], [completedTopic.id, completedTopic], [mobileTopic.id, mobileTopic], [auditTopic.id, auditTopic], [secondPendingTopic.id, secondPendingTopic], [thirdPendingTopic.id, thirdPendingTopic], [fourthPendingTopic.id, fourthPendingTopic], [leaveGuardTopic.id, leaveGuardTopic], [missingAdvanceTopic.id, missingAdvanceTopic], [mobileMissingAdvanceTopic.id, mobileMissingAdvanceTopic], [desktopDelayedAdvanceTopic.id, desktopDelayedAdvanceTopic], [desktopCommittedAdvanceTopic.id, desktopCommittedAdvanceTopic], [desktopReadbackRetryAdvanceTopic.id, desktopReadbackRetryAdvanceTopic], [mobileDelayedAdvanceTopic.id, mobileDelayedAdvanceTopic], [mobileDelayedSaveTopic.id, mobileDelayedSaveTopic], [mobileEditCommittedTopic.id, mobileEditCommittedTopic], [mobileEditRetryTopic.id, mobileEditRetryTopic], [mobileEditReadFailureTopic.id, mobileEditReadFailureTopic], [mobileEditConflictTopic.id, mobileEditConflictTopic], [mobileDelayedRepairTopic.id, mobileDelayedRepairTopic], [saveTopic.id, saveTopic], [manualSaveTopic.id, manualSaveTopic]]);
const repairedStages: string[] = [];
const auditWrites: Array<{ topicId: number; status: string }> = [];
const statusWrites: Array<{ topicId: number; status: string }> = [];
const managerMessageQueries: Array<{ read: string | undefined; link: string | undefined }> = [];
const creatorDashboardAccountQueries: Array<string | undefined> = [];
let failNextCreatorDashboard = false;
let hideCreatorMetricsForHome = false;
let creatorDashboardMetricsVariant: 'snapshot' | 'official' | 'official-no-time' = 'snapshot';
let failNextCreatorSyncLogs = false;
let failNextCreatorAgentStatus = false;
let creatorAgentStatusAgents: Array<Record<string, unknown>> = [managerCreatorAgentA];
let failNextAuditSave: string | null = null;
let commitNextAuditThenFailResponse = false;
let failNextAuditStatusReadAfterCommit = false;
let failNextAuditStatusRead = false;
let failNextAuditStatusReadAfterAuditFailure = false;
let holdNextAuditStatusRead = false;
let auditStatusReadStartedCallback: (() => void) | null = null;
let releaseAuditStatusRead: (() => void) | null = null;
let holdNextAuditSave = false;
let auditSaveStartedCallback: (() => void) | null = null;
let releaseAuditSave: (() => void) | null = null;
let auditSaveAttempts = 0;
let holdNextTopicStatusSave = false;
let topicStatusSaveStartedCallback: (() => void) | null = null;
let releaseTopicStatusSave: (() => void) | null = null;
let topicStatusSaveAttempts = 0;
const desktopTopicStatusFixtureOutcomes = new Map<number, 'committed-response-lost' | 'uncommitted-response-lost-once'>();
const desktopTopicStatusFixtureAttempts = new Map<number, number>();
const desktopTopicStatusFixtureReads = new Map<number, number>();
let failNextDesktopTopicStatusReadForId: number | null = null;
let holdNextMobileTopicSave = false;
let mobileTopicSaveStartedCallback: (() => void) | null = null;
let releaseMobileTopicSave: (() => void) | null = null;
let mobileTopicSaveAttempts = 0;
const mobileTopicEditOutcomes = new Map<number, 'committed-response-lost' | 'unchanged-once' | 'read-fails-once' | 'concurrent-change'>();
const mobileTopicEditSaveAttempts = new Map<number, number>();
const mobileTopicEditReadAttempts = new Map<number, number>();
const mobileTopicEditWrites = new Map<number, number>();
let failNextMobileTopicEditReadForId: number | null = null;
let holdNextMobileStageRepair = false;
let mobileStageRepairStartedCallback: (() => void) | null = null;
let releaseMobileStageRepair: (() => void) | null = null;
let mobileStageRepairAttempts = 0;
let failNextTopicUserDirectoryRead = false;
let topicUserDirectoryReads = 0;
const linkedResource = { id: 991, title: '解除关联反馈验收资料', summary: '隔离浏览器资料', library_type: 'knowledge', category: { id: 1, name: '验收资料', path: '验收资料' } };
let isResourceLinked = true;
let topicResourceListReads = 0;
let failNextTopicResourceRead = false;
let topicResourceSearchReads = 0;
let holdNextTopicResourceSearch = false;
let topicResourceSearchStartedCallback: (() => void) | null = null;
let releaseTopicResourceSearchCallback: (() => void) | null = null;
const topicResourceWrites = { add: 0, remove: 0 };
let commitNextTopicResourceAddThenFail = false;
let commitNextTopicResourceRemoveThenFail = false;
let failNextTopicRefreshForTopicId: number | null = null;
let topicSaveWrites = 0;
let failNextManualTopicSave = false;
let failNextManualTopicVersionsRead = false;
let manualTopicVersionReads = 0;
let manualTopicSaveWrites = 0;
const manualTopicVersions: Array<Record<string, unknown>> = [];
let failNextHomeAttention = false;
let returnMalformedNextHomeAttention = false;
let failNextHomeActivity = false;
let holdNextViewerHomeActivity = false;
let homeActivityReadStartedCallback: (() => void) | null = null;
let heldHomeActivityResponse: (() => void) | null = null;
let holdNextViewerHomeAttention = false;
let heldViewerHomeAttentionResponse: (() => void) | null = null;
let holdNextEditorHomeAttention = false;
let heldEditorHomeAttentionResponse: (() => void) | null = null;
let failNextHomeRetrospectives = false;
let failNextHomeActionableMessages = false;
let delayNextHomeActionableMessages = 0;
let emptyHomeTasks = false;
let missingActiveTopicPreviews = false;
let mobileHomeTaskVariant: 'default' | 'attention-only' = 'default';
let homeUnknownStageTimeCount = 0;
let homeTopicListReads = 0;
let homeProductionListReads = 0;
let allowHomeCreate = false;
let holdOldHomeReads = false;
const heldOldHomeReplies: Array<() => void> = [];
const app = express();
app.use(express.json());
app.get('/__qa/:topicId', (req, res) => {
  const topicId = Number(req.params.topicId);
  const editOutcome = String(req.query.editOutcome ?? '');
  const mobileEditFixtures = [mobileEditCommittedTopic, mobileEditRetryTopic, mobileEditReadFailureTopic, mobileEditConflictTopic];
  if (mobileEditFixtures.some((fixture) => fixture.id === topicId)
    && ['committed-response-lost', 'unchanged-once', 'read-fails-once', 'concurrent-change'].includes(editOutcome)) {
    const fixture = topics.get(topicId);
    if (fixture) {
      fixture.title = mobileEditFixtures.find((candidate) => candidate.id === topicId)?.title ?? fixture.title;
      fixture.description = '服务端原始说明';
      mobileTopicEditOutcomes.set(topicId, editOutcome as 'committed-response-lost' | 'unchanged-once' | 'read-fails-once' | 'concurrent-change');
      mobileTopicEditSaveAttempts.set(topicId, 0);
      mobileTopicEditReadAttempts.set(topicId, 0);
      mobileTopicEditWrites.set(topicId, 0);
      failNextMobileTopicEditReadForId = null;
    }
  }
  const statusOutcome = String(req.query.statusOutcome ?? '');
  const desktopStatusFixtures = [desktopCommittedAdvanceTopic, desktopReadbackRetryAdvanceTopic];
  if (desktopStatusFixtures.some((fixture) => fixture.id === topicId)
    && ['committed-response-lost', 'uncommitted-response-lost-once'].includes(statusOutcome)) {
    const fixture = topics.get(topicId);
    if (fixture) {
      fixture.status = 'shooting';
      fixture.stage_record_presence = { production: true, shooting: true, publishing: false };
      desktopTopicStatusFixtureOutcomes.set(topicId, statusOutcome as 'committed-response-lost' | 'uncommitted-response-lost-once');
      desktopTopicStatusFixtureAttempts.set(topicId, 0);
      desktopTopicStatusFixtureReads.set(topicId, 0);
      failNextDesktopTopicStatusReadForId = null;
      for (let index = statusWrites.length - 1; index >= 0; index -= 1) {
        if (statusWrites[index]?.topicId === topicId) statusWrites.splice(index, 1);
      }
    }
  }
  if (req.query.auditOutcome === 'committed-response-lost' || req.query.auditOutcome === 'readback-fails') {
    auditTopic.status = 'pending';
    auditWrites.length = 0;
    if (req.query.auditOutcome === 'committed-response-lost') commitNextAuditThenFailResponse = true;
    if (req.query.auditOutcome === 'readback-fails') {
      failNextAuditSave = '隔离验收：审核暂不可用';
      failNextAuditStatusReadAfterAuditFailure = true;
    }
  }
  const action = req.query.action === 'audit' ? '?action=audit' : '';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(editor))});localStorage.setItem('xmt_token','topic-stage-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(req.query.theme === 'dark' ? 'dark' : 'light')});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics/${req.params.topicId}${action}');</script>`);
});
app.get('/__qa-viewer/:topicId', (req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(viewer))});localStorage.setItem('xmt_token','topic-stage-viewer-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics/${req.params.topicId}');</script>`);
});
app.get('/__qa-production-viewer', (_req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(viewer))});localStorage.setItem('xmt_token','topic-stage-viewer-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/production/${managerProductionReview.id}?action=review');</script>`);
});
app.get('/__qa-audit-viewer/:topicId', (req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(viewer))});localStorage.setItem('xmt_token','topic-stage-viewer-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics/${req.params.topicId}?action=audit');</script>`);
});
app.get('/__qa-stale-audit/:topicId', (req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(editor))});localStorage.setItem('xmt_token','topic-stage-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics/${req.params.topicId}?action=audit');</script>`);
});
app.get('/__qa-home', (req, res) => {
  if (req.query.fail_retrospectives === 'true') failNextHomeRetrospectives = true;
  if (req.query.fail_attention === 'true') {
    failNextHomeAttention = true;
    emptyHomeTasks = true;
  }
  if (req.query.fail_activity === 'true') failNextHomeActivity = true;
  if (req.query.hold_viewer_activity === 'true') holdNextViewerHomeActivity = true;
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(editor))});localStorage.setItem('xmt_token','topic-stage-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/');</script>`);
});
app.post('/__qa/release-home-activity', (_req, res) => {
  const release = heldHomeActivityResponse;
  heldHomeActivityResponse = null;
  release?.();
  return res.json({ released: Boolean(release) });
});
app.get('/__qa-manager-home', (req, res) => {
  if (req.query.fail_actionable === 'true') {
    emptyHomeTasks = true;
    failNextHomeActionableMessages = true;
  }
  creatorDashboardMetricsVariant = req.query.metrics === 'official'
    ? 'official'
    : req.query.metrics === 'official-no-time' ? 'official-no-time' : 'snapshot';
  missingActiveTopicPreviews = req.query.active_preview === 'missing';
  mobileHomeTaskVariant = req.query.tasks === 'attention-only' ? 'attention-only' : 'default';
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(manager))});localStorage.setItem('xmt_token','topic-stage-manager-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/');</script>`);
});
app.get('/__qa-creator-home', (_req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(creator))});localStorage.setItem('xmt_token','topic-stage-creator-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/');</script>`);
});
app.get('/api/auth/me', (req, res) => res.json(req.get('authorization') === 'Bearer topic-stage-viewer-fixture' ? viewer : req.get('authorization') === 'Bearer topic-stage-manager-fixture' ? manager : req.get('authorization') === 'Bearer topic-stage-creator-fixture' ? creator : editor));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get('/api/messages', (req, res) => {
  const isManager = req.get('authorization') === 'Bearer topic-stage-manager-fixture';
  if (isManager) managerMessageQueries.push({ read: typeof req.query.read === 'string' ? req.query.read : undefined, link: typeof req.query.link === 'string' ? req.query.link : undefined });
  const isHomeActionableRead = isManager && req.query.link === 'present';
  const delayMs = isHomeActionableRead ? delayNextHomeActionableMessages : 0;
  if (isHomeActionableRead) delayNextHomeActionableMessages = 0;
  if (isManager && req.query.link === 'present' && failNextHomeActionableMessages) {
    failNextHomeActionableMessages = false;
    if (delayMs > 0) return setTimeout(() => res.status(503).json({ message: '待处理消息服务暂不可用，请稍后重试。' }), delayMs);
    return res.status(503).json({ message: '待处理消息服务暂不可用，请稍后重试。' });
  }
  const data = isManager && !emptyHomeTasks && mobileHomeTaskVariant !== 'attention-only' ? [actionableManagerMessage] : [];
  const sendResponse = () => res.json({ data, total: data.length, page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 20, summary: { total: data.length, unread: data.length, actionable: data.length } });
  if (delayMs > 0) return setTimeout(sendResponse, delayMs);
  return sendResponse();
});
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/permissions/my', (req, res) => {
  const authorization = req.get('authorization');
  const codes = authorization === 'Bearer topic-stage-viewer-fixture' ? []
    : authorization === 'Bearer topic-stage-creator-fixture' ? ['topic:create', 'workflow:publishing']
      : authorization === 'Bearer topic-stage-manager-fixture' ? ['topic:update', 'topic:audit', 'production:update', 'workflow:publishing', 'resource:view', 'creator:data:view', 'analytics:retro:view']
        : ['topic:update', 'topic:audit', 'production:update', 'workflow:publishing', 'resource:view', 'analytics:retro:view'];
  if (allowHomeCreate && authorization !== 'Bearer topic-stage-viewer-fixture' && authorization !== 'Bearer topic-stage-creator-fixture') codes.push('topic:create');
  if (holdOldHomeReads && authorization !== 'Bearer topic-stage-viewer-fixture' && authorization !== 'Bearer topic-stage-creator-fixture') {
    heldOldHomeReplies.push(() => res.json(codes));
    return;
  }
  return res.json(codes);
});
app.get('/api/inspirations', (req, res) => {
  const isViewer = req.get('authorization') === 'Bearer topic-stage-viewer-fixture';
  return res.json({ data: [1, 2, 3, 4].map((id) => ({ id, title: `${isViewer ? '当前账号灵感预览' : '首页灵感预览'} ${id}`, content: '', creator_id: isViewer ? viewer.id : editor.id, created_at: '2026-10-09 12:00:00' })), total: 4 });
});
app.get('/api/dashboard/home-attention', (req, res) => {
  if (failNextHomeAttention) {
    failNextHomeAttention = false;
    return res.status(503).json({ message: 'Failed to fetch' });
  }
  if (returnMalformedNextHomeAttention) {
    returnMalformedNextHomeAttention = false;
    return res.json({ scope: 'all-visible-content' });
  }
  const retrospectiveSummary = failNextHomeRetrospectives
    ? { available: false, total: 0, tasks: [] }
    : {
      available: true,
      total: 5,
      tasks: [
        { id: 951, title: '团队周复盘', period_start: '2026-10-06', period_end: '2026-10-09', status: 'published', updated_at: '2026-10-09 11:00:00' },
        { id: 952, title: '选题专项复盘', period_start: '2026-10-01', period_end: '2026-10-05', status: 'draft', updated_at: '2026-10-08 11:00:00' },
        { id: 953, title: '渠道复盘', period_start: '2026-09-24', period_end: '2026-09-30', status: 'archived', updated_at: '2026-10-07 11:00:00' },
      ],
    };
  failNextHomeRetrospectives = false;
  const payload = {
    scope: req.get('authorization') === 'Bearer topic-stage-creator-fixture' ? 'personal' : 'all-visible-content',
    generated_at: '2026-10-09 12:00:00',
    stale_stage_days: 2,
    active_topics: missingActiveTopicPreviews && req.get('authorization') === 'Bearer topic-stage-manager-fixture'
      ? { total: 47, topics: [] }
      : req.get('authorization') === 'Bearer topic-stage-creator-fixture'
      ? { total: 2, topics: [{ id: leaveGuardTopic.id, title: '创作者自己的选题', status: 'shooting' }] }
      : req.get('authorization') === 'Bearer topic-stage-viewer-fixture'
      ? { total: 2, topics: [{ id: mobileTopic.id, title: '当前账号进行中选题', status: 'approved' }] }
      : { total: 47, topics: [auditTopic, secondPendingTopic, thirdPendingTopic].map((topic, index) => ({ id: topic.id, title: topic.title, status: index === 0 ? 'approved' : 'pending' })) },
    counts: { overdue: 1, due_soon: 1, stalled: 1, stage_time_unknown: homeUnknownStageTimeCount, total: 2 },
    topics: req.get('authorization') === 'Bearer topic-stage-creator-fixture'
      ? [{ id: leaveGuardTopic.id, title: '我的临近选题', status: 'production', deadline: '2026-10-10', stage_entered_at: '2026-10-09 12:00:00', assignee_name: creator.name, is_overdue: false, is_due_soon: true, is_stalled: false }]
      : [{ id: leaveGuardTopic.id, title: leaveGuardTopic.title, status: 'shooting', deadline: '2026-10-07', stage_entered_at: '2026-10-04 12:00:00', assignee_name: editor.name, is_overdue: true, is_due_soon: false, is_stalled: true }],
    today_publishing: {
      total: 1,
      tasks: [{ id: 941, topic_id: 934, topic_title: '今日待发布验收', platform: '抖音', publish_time: '2026-10-09 15:00:00', status: 'pending', operator_name: editor.name }],
    },
    sync_anomalies: req.get('authorization') === 'Bearer topic-stage-manager-fixture'
      ? { available: true, total: 1, tasks: [managerSyncAnomaly] }
      : { available: false, total: 0, tasks: [] },
    production_reviews: req.get('authorization') === 'Bearer topic-stage-viewer-fixture' || req.get('authorization') === 'Bearer topic-stage-creator-fixture'
      ? { available: false, total: 0, tasks: [] }
      : { available: true, total: 1, tasks: [managerProductionReview] },
    retrospectives: retrospectiveSummary,
    my_retro_actions: { available: true, total: 0, tasks: [] },
    topic_stages: {
      pending: { total: 4, topics: [auditTopic, secondPendingTopic, thirdPendingTopic].map((topic) => ({ id: topic.id, title: topic.title, status: 'pending', created_at: topic.created_at, stage_entered_at: topic.stage_entered_at, creator_name: topic.creator_name, assignee_name: topic.assignee_name })) },
      production: { total: 2, topics: [
        { id: approvedPipelineTopic.id, title: approvedPipelineTopic.title, status: 'approved', created_at: approvedPipelineTopic.created_at, stage_entered_at: approvedPipelineStageEnteredAt, creator_name: editor.name, assignee_name: editor.name },
        { id: productionTopic.id, title: productionTopic.title, status: 'production', created_at: '2026-10-09 08:00:00', stage_entered_at: '2026-10-09 08:00:00', creator_name: editor.name, assignee_name: editor.name },
      ] },
      shooting: { total: 2, topics: [leaveGuardTopic, missingAdvanceTopic].map((topic) => ({ id: topic.id, title: topic.title, status: 'shooting', created_at: '2026-10-08 08:00:00', stage_entered_at: '2026-10-08 08:00:00', creator_name: editor.name, assignee_name: editor.name })) },
      publishing: { total: 1, topics: [{ id: 941, title: '今日待发布验收', status: 'publishing', created_at: '2026-10-09 08:00:00', stage_entered_at: '2026-10-09 08:00:00', creator_name: editor.name, assignee_name: editor.name }] },
      completed: { total: 1, topics: [{ id: completedTopic.id, title: completedTopic.title, status: 'completed', created_at: '2026-10-08 08:00:00', stage_entered_at: null, creator_name: editor.name, assignee_name: editor.name }] },
    },
    my_drafts: { tasks: [
      { id: 943, topic_id: productionTopic.id, topic_title: '我的待续写稿件', status: 'draft', version: 'v1.1', updated_at: '2026-10-09 09:10:00' },
      { id: 944, topic_id: productionTopic.id, topic_title: '我的退回稿件', status: 'rejected', version: 'v1.2', updated_at: '2026-10-09 10:10:00' },
    ] },
  };
  if (emptyHomeTasks) {
    payload.sync_anomalies = { available: true, total: 0, tasks: [] };
    payload.production_reviews = { available: true, total: 0, tasks: [] };
    payload.today_publishing = { total: 0, tasks: [] };
    payload.my_drafts = { tasks: [] };
    payload.topic_stages.pending = { total: 0, topics: [] };
    payload.topics = [];
    payload.counts = { overdue: 0, due_soon: 0, stalled: 0, stage_time_unknown: homeUnknownStageTimeCount, total: 0 };
  }
  if (mobileHomeTaskVariant === 'attention-only' && req.get('authorization') === 'Bearer topic-stage-manager-fixture') {
    payload.topics = Array.from({ length: 8 }, (_, index) => ({
      id: 980 + index,
      title: `移动首页第 ${index + 1} 条关注事项`,
      status: 'shooting',
      deadline: '2026-10-09',
      stage_entered_at: '2026-10-08 12:00:00',
      assignee_name: manager.name,
      is_overdue: true,
      is_due_soon: false,
      is_stalled: false,
    }));
    payload.sync_anomalies = { available: true, total: 0, tasks: [] };
    payload.production_reviews = { available: true, total: 0, tasks: [] };
    payload.today_publishing = { total: 0, tasks: [] };
    payload.my_drafts = { tasks: [] };
    payload.topic_stages.pending = { total: 0, topics: [] };
  }
  if (req.get('authorization') === 'Bearer topic-stage-viewer-fixture') {
    payload.active_topics = { total: 1, topics: [{ id: mobileTopic.id, title: '当前账号进行中选题', status: 'production' }] };
    payload.counts = { overdue: 0, due_soon: 0, stalled: 0, stage_time_unknown: 0, total: 0 };
    payload.topics = [];
    payload.today_publishing = { total: 0, tasks: [] };
    payload.sync_anomalies = { available: true, total: 0, tasks: [] };
    payload.production_reviews = { available: false, total: 0, tasks: [] };
    payload.retrospectives = { available: true, total: 0, tasks: [] };
    payload.my_retro_actions = { available: true, total: 0, tasks: [] };
    payload.topic_stages = {
      pending: { total: 0, topics: [] },
      production: { total: 1, topics: [{ id: mobileTopic.id, title: '当前账号进行中选题', status: 'production', created_at: '2026-10-09 08:00:00', stage_entered_at: '2026-10-09 08:00:00', creator_name: viewer.name, assignee_name: viewer.name }] },
      shooting: { total: 0, topics: [] },
      publishing: { total: 0, topics: [] },
      completed: { total: 0, topics: [] },
    };
    payload.my_drafts = { tasks: [] };
  }
  if (holdOldHomeReads && req.get('authorization') !== 'Bearer topic-stage-viewer-fixture' && req.get('authorization') !== 'Bearer topic-stage-creator-fixture') {
    payload.active_topics = { total: 99, topics: [{ id: mobileTopic.id, title: '迟到的旧账号选题', status: 'approved' }] };
    heldOldHomeReplies.push(() => res.json(payload));
    return;
  }
  if (holdNextViewerHomeAttention && req.get('authorization') === 'Bearer topic-stage-viewer-fixture') {
    holdNextViewerHomeAttention = false;
    heldViewerHomeAttentionResponse = () => res.json(payload);
    return;
  }
  if (holdNextEditorHomeAttention && req.get('authorization') === 'Bearer topic-stage-fixture') {
    holdNextEditorHomeAttention = false;
    heldEditorHomeAttentionResponse = () => res.json(payload);
    return;
  }
  return res.json(payload);
});
app.get('/api/dashboard/home-activity', (req, res) => {
  if (failNextHomeActivity) {
    failNextHomeActivity = false;
    return res.status(503).json({ message: 'Failed to fetch' });
  }
  const isViewer = req.get('authorization') === 'Bearer topic-stage-viewer-fixture';
  const payload = {
    scope: 'personal',
    generated_at: '2026-10-09 12:00:00',
    events: isViewer ? [
      { id: 'viewer-current-activity', kind: 'version', label: '稿件版本', title: '当前账号最近变化', detail: '小修 · 基于 v1.0', occurred_at: '2026-10-09 11:30:00', path: '/production/943' },
    ] : [
      { id: 'version-943', kind: 'version', label: '稿件版本', title: '最近变化验收稿件', detail: '小修 · 基于 v1.0', occurred_at: '2026-10-09 11:00:00', path: '/production/943' },
      { id: 'topic-status-934', kind: 'topic_status', label: '选题状态', title: auditTopic.title, detail: '阶段更新至待审核', occurred_at: '2026-10-09 10:00:00', path: `/topics/${auditTopic.id}` },
    ],
  };
  if (isViewer && holdNextViewerHomeActivity) {
    holdNextViewerHomeActivity = false;
    homeActivityReadStartedCallback?.();
    homeActivityReadStartedCallback = null;
    heldHomeActivityResponse = () => res.json(payload);
    return;
  }
  return res.json(payload);
});
app.get('/api/creator-agent/douyin/dashboard', (req, res) => {
  const accountUid = typeof req.query.account_id === 'string' ? req.query.account_id : undefined;
  const usesOfficialMetrics = creatorDashboardMetricsVariant !== 'snapshot';
  creatorDashboardAccountQueries.push(accountUid);
  if (failNextCreatorDashboard) {
    failNextCreatorDashboard = false;
    return res.status(503).json({ message: 'Internal Server Error' });
  }
  return res.json({
    account: { nickname: accountUid === managerSecondarySyncAccountUid ? '负责人验收账号 B' : '负责人验收账号', douyin_uid: accountUid || managerSyncAccountUid },
    metrics: {
      fans_count: hideCreatorMetricsForHome ? null : 120,
      fans_observed_on: hideCreatorMetricsForHome || creatorDashboardMetricsVariant === 'official-no-time' ? null : '2026-10-08',
      works_count: 4, play_count: 2400, interaction_count: 120, interaction_rate: 0.05, share_rate: 0.01, viral_works_count: 0,
    },
    health: { score: 90, level: 'healthy', available_weight: 1, dimensions: {}, data_notes: [] },
    growth_7d: hideCreatorMetricsForHome
      ? { fans: null, plays: null, interactions: null, collected_at: null, observed_through_date: null }
      : {
        fans: 2,
        plays: 200,
        interactions: 10,
        collected_at: usesOfficialMetrics && creatorDashboardMetricsVariant === 'official' ? '2026-10-09T10:30:00.000Z' : null,
        observed_through_date: usesOfficialMetrics ? '2026-10-08' : '2026-10-09',
      },
    growth_30d: { fans: 5, plays: 800, interactions: 40 },
    top_works: [], snapshot_count: 2, snapshot_start_date: '2026-10-07', data_status: 'ready',
    data_source: usesOfficialMetrics ? 'douyin_official_export' : 'douyin_creator_center_collection', official_snapshot_at: null, last_success_at: '2026-10-09 10:00:00', missing_fields: [], warnings: [],
    access_level: 'manage', metric_sources: {}, formulas: {},
  });
});
app.get('/api/creator-agent/douyin/sync-logs', (req, res) => {
  if (typeof req.query.account_id === 'string') creatorDashboardAccountQueries.push(req.query.account_id);
  if (failNextCreatorSyncLogs) {
    failNextCreatorSyncLogs = false;
    return res.status(503).json({ message: '同步记录暂不可用，请重试。' });
  }
  return res.json([]);
});
app.get('/api/creator-agent/status', (_req, res) => {
  if (failNextCreatorAgentStatus) {
    failNextCreatorAgentStatus = false;
    return res.status(503).json({ message: '采集端状态暂不可用，请重试。' });
  }
  return res.json({ agents: creatorAgentStatusAgents, protocol_version: 1 });
});
app.get('/api/topics', (req, res) => {
  if (typeof req.query.status === 'string') homeTopicListReads += 1;
  const matches = Array.from(topics.values())
    .filter((topic) => !req.query.status || (req.query.status === 'creation' ? topic.status === 'approved' || topic.status === 'production' : topic.status === req.query.status))
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  const limit = Number(req.query.limit) || 5;
  return res.json({ success: true, data: matches.slice(0, limit), pagination: { total: matches.length, page: 1, limit } });
});
app.get('/api/workflow/production', (_req, res) => { homeProductionListReads += 1; return res.json({ data: [], total: 0, page: 1, limit: 12 }); });
app.get('/api/workflow/publishing', (_req, res) => res.json({ data: [{ id: 941, topic_id: 934, topic_title: '今日待发布验收', status: 'pending', platform: '抖音', publish_time: '2026-10-09 15:00:00', updated_at: '2026-10-09 09:00:00' }], total: 1, page: 1, limit: 12, summary: { published: 0 } }));
app.get('/api/users', (_req, res) => {
  topicUserDirectoryReads += 1;
  if (failNextTopicUserDirectoryRead) {
    failNextTopicUserDirectoryRead = false;
    return res.status(503).json({ message: '负责人名单暂不可用。' });
  }
  return res.json({ data: [editor], total: 1, page: 1, limit: 10 });
});
app.get('/api/topics/:id/resources', (req, res) => {
  topicResourceListReads += 1;
  if (failNextTopicResourceRead) {
    failNextTopicResourceRead = false;
    return res.status(503).json({ message: '关联资料读取暂不可用。' });
  }
  return res.json({ data: Number(req.params.id) === productionTopic.id && isResourceLinked ? [linkedResource] : [] });
});
app.post('/api/topics/:topicId/resources', (req, res) => {
  topicResourceWrites.add += 1;
  if (Number(req.params.topicId) !== productionTopic.id || Number(req.body?.resource_id) !== linkedResource.id || isResourceLinked) {
    return res.status(409).json({ message: '资料不可关联' });
  }
  isResourceLinked = true;
  if (commitNextTopicResourceAddThenFail) {
    commitNextTopicResourceAddThenFail = false;
    return res.status(503).json({ message: '关联结果响应暂不可用。' });
  }
  return res.json({ message: '资料关联已创建' });
});
app.delete('/api/topics/:topicId/resources/:resourceId', (req, res) => {
  topicResourceWrites.remove += 1;
  if (Number(req.params.topicId) !== productionTopic.id || Number(req.params.resourceId) !== linkedResource.id || !isResourceLinked) {
    return res.status(404).json({ message: '关联不存在' });
  }
  isResourceLinked = false;
  if (commitNextTopicResourceRemoveThenFail) {
    commitNextTopicResourceRemoveThenFail = false;
    return res.status(503).json({ message: '解除结果响应暂不可用。' });
  }
  return res.json({ message: '资料关联已解除' });
});
app.get('/api/topics/:id/asset-dimensions', (_req, res) => res.json({ data: [] }));
app.get('/api/topics/:id/versions', (req, res) => {
  manualTopicVersionReads += 1;
  if (Number(req.params.id) === manualSaveTopic.id && failNextManualTopicVersionsRead) {
    failNextManualTopicVersionsRead = false;
    return res.status(503).json({ error: '隔离验收：大纲历史暂时无法读取' });
  }
  return res.json({ data: [...manualTopicVersions].reverse() });
});
app.get('/api/topics/:id', (req, res) => {
  const topicId = Number(req.params.id);
  if (desktopTopicStatusFixtureOutcomes.has(topicId)) {
    desktopTopicStatusFixtureReads.set(topicId, (desktopTopicStatusFixtureReads.get(topicId) ?? 0) + 1);
    if (failNextDesktopTopicStatusReadForId === topicId) {
      failNextDesktopTopicStatusReadForId = null;
      return res.status(503).json({ error: '隔离验收：状态首次只读核实暂不可用' });
    }
  }
  if (mobileTopicEditOutcomes.has(topicId)) {
    mobileTopicEditReadAttempts.set(topicId, (mobileTopicEditReadAttempts.get(topicId) ?? 0) + 1);
    if (failNextMobileTopicEditReadForId === topicId) {
      failNextMobileTopicEditReadForId = null;
      return res.status(503).json({ error: '隔离验收：选题内容只读核实暂不可用' });
    }
  }
  if (Number(req.params.id) === auditTopic.id && failNextAuditStatusRead) {
    failNextAuditStatusRead = false;
    return res.status(503).json({ error: '隔离验收：审核状态暂不可读' });
  }
  if (topicId === auditTopic.id && holdNextAuditStatusRead) {
    holdNextAuditStatusRead = false;
    const heldAuditStatusRead = new Promise<void>((resolve) => { releaseAuditStatusRead = resolve; });
    auditStatusReadStartedCallback?.();
    auditStatusReadStartedCallback = null;
    void heldAuditStatusRead.then(() => {
      releaseAuditStatusRead = null;
      const latest = topics.get(topicId);
      if (!latest) return res.status(404).json({ error: '选题不存在' });
      return res.json({ success: true, data: latest });
    });
    return;
  }
  if (Number(req.params.id) === failNextTopicRefreshForTopicId) {
    failNextTopicRefreshForTopicId = null;
    return res.status(503).json({ error: '隔离验收：详情刷新暂不可用' });
  }
  const topic = topics.get(Number(req.params.id));
  if (!topic) return res.status(404).json({ error: '选题不存在' });
  return res.json({ success: true, data: topic });
});
app.get('/api/workflow/production/942', (req, res) => res.json({
  id: managerProductionReview.id,
  topic_id: managerProductionReview.topic_id,
  topic_title: managerProductionReview.topic_title,
  operator_id: editor.id,
  operator_name: editor.name,
  topic_status: 'production',
  content: managerProductionReviewContent,
  status: managerProductionReviewStatus,
  version: managerProductionReview.version,
  can_edit: req.get('authorization') === 'Bearer topic-stage-manager-fixture' || req.get('authorization') === 'Bearer topic-stage-fixture',
  created_at: '2026-10-09 08:00:00',
  updated_at: managerProductionReview.updated_at,
}));
app.get('/api/workflow/production/942/history', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));
app.get('/api/workflow/production/942/review-threads', (_req, res) => res.json({ data: [] }));
app.get('/api/productions/942/material-draft', (_req, res) => res.json({ data: {
  production_id: managerProductionReview.id,
  content_html: '<p></p>',
  revision: 1,
  created_by: null,
  updated_by: null,
  created_at: null,
  updated_at: null,
} }));
app.put('/api/workflow/production/942', (req, res) => {
  managerProductionApprovalWrites += 1;
  if (req.body?.expected_content !== managerProductionReviewContent) {
    return res.status(409).json({ message: '隔离验收：正文版本已变化' });
  }
  managerProductionReviewContent = String(req.body?.content ?? managerProductionReviewContent);
  managerProductionReviewStatus = String(req.body?.status ?? managerProductionReviewStatus);
  return res.json({ message: '创作状态已更新', version: managerProductionReview.version });
});
app.put('/api/topics/:id', (req, res) => {
  const topicId = Number(req.params.id);
  const topic = topics.get(topicId);
  if (!topic) return res.status(404).json({ error: '选题不存在' });
  const editOutcome = mobileTopicEditOutcomes.get(topicId);
  if (editOutcome) {
    const attempt = (mobileTopicEditSaveAttempts.get(topicId) ?? 0) + 1;
    mobileTopicEditSaveAttempts.set(topicId, attempt);
    const applyRequestedEdit = () => {
      topic.title = String(req.body?.title ?? topic.title);
      topic.description = String(req.body?.description ?? topic.description);
      mobileTopicEditWrites.set(topicId, (mobileTopicEditWrites.get(topicId) ?? 0) + 1);
    };
    if (editOutcome === 'committed-response-lost') {
      applyRequestedEdit();
      return res.status(503).json({ error: '隔离验收：保存响应丢失' });
    }
    if (editOutcome === 'unchanged-once' && attempt === 1) {
      return res.status(503).json({ error: '隔离验收：保存暂不可用' });
    }
    if (editOutcome === 'read-fails-once') {
      applyRequestedEdit();
      failNextMobileTopicEditReadForId = topicId;
      return res.status(503).json({ error: '隔离验收：保存响应丢失' });
    }
    if (editOutcome === 'concurrent-change') {
      topic.title = '服务端并发更新标题';
      topic.description = '服务端并发更新说明';
      return res.status(503).json({ error: '隔离验收：服务端内容已被并发更新' });
    }
    applyRequestedEdit();
    return res.json({ message: '选题已更新' });
  }
  if (topicId === mobileDelayedSaveTopic.id) {
    mobileTopicSaveAttempts += 1;
    if (holdNextMobileTopicSave) {
      holdNextMobileTopicSave = false;
      mobileTopicSaveStartedCallback?.();
      mobileTopicSaveStartedCallback = null;
      void new Promise<void>((resolve) => { releaseMobileTopicSave = resolve; }).then(() => {
        releaseMobileTopicSave = null;
        topic.title = String(req.body?.title ?? topic.title);
        topic.description = String(req.body?.description ?? topic.description);
        res.json({ message: '选题已更新' });
      });
      return;
    }
  }
  if (topicId === saveTopic.id) topicSaveWrites += 1;
  if (topicId === manualSaveTopic.id) {
    manualTopicSaveWrites += 1;
    if (failNextManualTopicSave) {
      failNextManualTopicSave = false;
      return res.status(503).json({ message: '选题保存暂不可用，请稍后重试。' });
    }
    if (req.body.version_action === 'minor' || req.body.version_action === 'major') {
      if (manualTopicVersions.length === 0) manualTopicVersions.push({
        id: 1,
        document_type: 'topic_outline',
        document_id: String(manualSaveTopic.id),
        version: 'baseline',
        content: String(topic.outline ?? ''),
        change_type: 'baseline',
        is_baseline: 1,
        operator_id: null,
        operator_name: null,
        created_at: null,
      });
      const latest = [...manualTopicVersions].reverse().find((entry) => entry.is_baseline === 0);
      const version = latest ? 'v1.1' : 'v1.0';
      manualTopicVersions.push({
        id: manualTopicVersions.length + 1,
        document_type: 'topic_outline',
        document_id: String(manualSaveTopic.id),
        version,
        content: String(req.body.outline ?? ''),
        change_type: req.body.version_action,
        is_baseline: 0,
        operator_id: editor.id,
        operator_name: editor.name,
        created_at: '2026-10-13 09:00:00',
      });
    }
  }
  const patch = { ...req.body };
  delete patch.version_action;
  delete patch.expected_content;
  Object.assign(topic, patch);
  return res.json({ message: '选题已更新' });
});
app.post('/api/topics/:id/audit', (req, res) => {
  auditSaveAttempts += 1;
  if (holdNextAuditSave) {
    holdNextAuditSave = false;
    auditSaveStartedCallback?.();
    auditSaveStartedCallback = null;
    void new Promise<void>((resolve) => { releaseAuditSave = resolve; }).then(() => {
      releaseAuditSave = null;
      finishTopicAudit(req, res);
    });
    return;
  }
  finishTopicAudit(req, res);
});
function finishTopicAudit(req: express.Request, res: express.Response) {
  if (failNextAuditSave) {
    const message = failNextAuditSave;
    failNextAuditSave = null;
    if (failNextAuditStatusReadAfterAuditFailure) {
      failNextAuditStatusReadAfterAuditFailure = false;
      failNextAuditStatusRead = true;
    }
    return res.status(503).json({ message });
  }
  const topicId = Number(req.params.id);
  const topic = topics.get(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  if (topic.status !== 'pending' || !['approved', 'rejected'].includes(String(req.body?.status))) {
    return res.status(409).json({ message: '选题状态已变化，请刷新后重新审核。' });
  }
  const status = String(req.body.status);
  topic.status = status;
  if (status === 'approved' && Number(req.body?.assignee_id) > 0) topic.assignee_id = Number(req.body.assignee_id);
  const history = Array.isArray(topic.history) ? topic.history : [];
  topic.history = history;
  const nextHistoryId = history.reduce((max, entry) => Math.max(max, Number(entry.id) || 0), 0) + 1;
  history.push({ id: nextHistoryId, topic_id: topicId, action: status, comment: String(req.body?.comment ?? ''), operator_id: editor.id, operator_name: editor.name, created_at: '2026-10-09 12:00:00' });
  auditWrites.push({ topicId, status });
  if (commitNextAuditThenFailResponse) {
    commitNextAuditThenFailResponse = false;
    if (failNextAuditStatusReadAfterCommit) {
      failNextAuditStatusReadAfterCommit = false;
      failNextAuditStatusRead = true;
    }
    return res.status(503).json({ message: '隔离验收：审核已保存但响应丢失' });
  }
  return res.json({ message: '审核结果已保存' });
}
app.post('/api/topics/:id/status', (req, res) => {
  topicStatusSaveAttempts += 1;
  if (holdNextTopicStatusSave) {
    holdNextTopicStatusSave = false;
    topicStatusSaveStartedCallback?.();
    topicStatusSaveStartedCallback = null;
    void new Promise<void>((resolve) => { releaseTopicStatusSave = resolve; }).then(() => {
      releaseTopicStatusSave = null;
      finishTopicStatus(req, res);
    });
    return;
  }
  finishTopicStatus(req, res);
});
function finishTopicStatus(req: express.Request, res: express.Response) {
  const topicId = Number(req.params.id);
  const topic = topics.get(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  const status = String(req.body?.status ?? '');
  const fixtureOutcome = desktopTopicStatusFixtureOutcomes.get(topicId);
  const fixtureAttempt = (desktopTopicStatusFixtureAttempts.get(topicId) ?? 0) + 1;
  if (fixtureOutcome) desktopTopicStatusFixtureAttempts.set(topicId, fixtureAttempt);
  if (fixtureOutcome === 'uncommitted-response-lost-once' && fixtureAttempt === 1) {
    failNextDesktopTopicStatusReadForId = topicId;
    return res.status(503).json({ message: '隔离验收：阶段状态未提交且响应丢失' });
  }
  topic.status = status;
  if (status === 'publishing') topic.stage_record_presence.publishing = true;
  statusWrites.push({ topicId, status });
  if (fixtureOutcome === 'committed-response-lost' && fixtureAttempt === 1) {
    return res.status(503).json({ message: '隔离验收：阶段状态已写入但响应丢失' });
  }
  return res.json({ message: '选题状态已更新' });
}
app.post('/api/topics/:id/repair-stage-record', (req, res) => {
  if (Number(req.params.id) === mobileDelayedRepairTopic.id) {
    mobileStageRepairAttempts += 1;
    if (holdNextMobileStageRepair) {
      holdNextMobileStageRepair = false;
      mobileStageRepairStartedCallback?.();
      mobileStageRepairStartedCallback = null;
      void new Promise<void>((resolve) => { releaseMobileStageRepair = resolve; }).then(() => {
        releaseMobileStageRepair = null;
        finishTopicStageRecordRepair(req, res);
      });
      return;
    }
  }
  finishTopicStageRecordRepair(req, res);
});
function finishTopicStageRecordRepair(req: express.Request, res: express.Response) {
  const topic = topics.get(Number(req.params.id));
  if (!topic) return res.status(404).json({ error: '选题不存在' });
  if (topic.status === 'completed') return res.status(409).json({ success: false, error: '已完成选题不得自动补建发布历史' });
  const stage = topic.status === 'shooting' ? 'shooting' : topic.status === 'publishing' ? 'publishing' : 'production';
  const created = !topic.stage_record_presence[stage];
  if (created) {
    topic.stage_record_presence[stage] = true;
    topic.history.unshift({ id: Date.now(), action: 'stage_record_repaired', comment: '已补齐当前阶段记录；选题阶段未变更', operator_name: editor.name, created_at: '2026-09-30 12:00:00' });
    repairedStages.push(stage);
  }
  return res.json({ success: true, data: { stage, created } });
}
app.get('/api/resource-center/search', async (_req, res) => {
  topicResourceSearchReads += 1;
  if (holdNextTopicResourceSearch) {
    holdNextTopicResourceSearch = false;
    topicResourceSearchStartedCallback?.();
    await new Promise<void>((resolve) => { releaseTopicResourceSearchCallback = resolve; });
  }
  return res.json({ data: [{ resource_id: linkedResource.id, title: linkedResource.title, summary: linkedResource.summary, snippet: '<mark>隔离</mark>验收素材', library_type: linkedResource.library_type, category: linkedResource.category }], total: 1 });
});
app.get('/api/resource-center/resources', (_req, res) => res.json({ data: [], pagination: { page: 1, page_size: 1, total: 0, total_pages: 0 } }));
app.get('/api/retrospectives', (_req, res) => res.json({ retrospectives: [] }));
app.get('/api/retrospectives/actions/mine', (_req, res) => res.json({ actions: [] }));
app.get('/api/retrospectives/templates', (_req, res) => res.json({ templates: [] }));
app.use('/api', (_req, res) => res.json({ success: true, data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
const requestedQaPort = Number(process.env.XMT_TOPIC_STAGE_QA_PORT || 0);
const qaPort = Number.isInteger(requestedQaPort) && requestedQaPort >= 0 && requestedQaPort <= 65535 ? requestedQaPort : 0;
await new Promise<void>((resolve) => server.listen(qaPort, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

function parseCssColor(value: string) {
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 } : null;
}

function relativeLuminance(rgb: number[]) {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function textContrast(locator: import('playwright').Locator) {
  const styles = await locator.evaluate((element) => {
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    return {
      foreground: getComputedStyle(element).color,
      backgrounds: [getComputedStyle(document.documentElement).backgroundColor, ...ancestors.map((ancestor) => getComputedStyle(ancestor).backgroundColor)],
    };
  });
  const foregroundColor = parseCssColor(styles.foreground);
  if (!foregroundColor) return 0;
  let background = [255, 255, 255];
  for (const value of styles.backgrounds) {
    const layer = parseCssColor(value);
    if (!layer) continue;
    background = layer.rgb.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
  }
  const foreground = foregroundColor.rgb.map((channel, index) => channel * foregroundColor.alpha + background[index] * (1 - foregroundColor.alpha));
  const text = relativeLuminance(foreground);
  const surface = relativeLuminance(background);
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}

if (process.env.XMT_TOPIC_STAGE_REPAIR_QA_SERVE === '1') {
  console.log(`Isolated topic stage repair QA fixture: ${base}/__qa/${productionTopic.id}`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  const expectedConsoleErrors: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    const auditContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    const auditPage = await auditContext.newPage();
    auditPage.on('pageerror', (error) => errors.push(error.message));
    auditPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await auditPage.goto(`${base}/__qa/${auditTopic.id}?theme=${theme}`);
    await auditPage.getByRole('heading', { name: auditTopic.title }).waitFor();
    await auditPage.getByRole('button', { name: '审核选题', exact: true }).click();
    const auditResultGroup = auditPage.getByRole('group', { name: '审核结果', exact: true });
    const approvedOption = auditResultGroup.getByRole('button', { name: '审核通过', exact: true });
    const rejectedOption = auditResultGroup.getByRole('button', { name: '驳回修改', exact: true });
    const auditWritesBeforeSelection = auditWrites.length;
    await approvedOption.waitFor();
    assert.equal(await approvedOption.getAttribute('aria-pressed'), 'true', 'approval is initially exposed as the selected audit result');
    assert.equal(await rejectedOption.getAttribute('aria-pressed'), 'false', 'rejection is initially exposed as unselected');
    assert.ok((await approvedOption.getAttribute('class'))?.includes('bg-studio-success-soft'), 'selected approval uses a soft semantic surface');
    assert.ok((await textContrast(approvedOption)) >= 4.5, `${theme}主题审核通过选项文字对比度应不低于 4.5:1`);
    await rejectedOption.click();
    assert.equal(await approvedOption.getAttribute('aria-pressed'), 'false', 'choosing rejection clears the approval selected state');
    assert.equal(await rejectedOption.getAttribute('aria-pressed'), 'true', 'choosing rejection exposes it as the selected audit result');
    assert.equal(auditWrites.length, auditWritesBeforeSelection, 'changing the audit result selection does not submit an audit write');
    assert.ok((await rejectedOption.getAttribute('class'))?.includes('bg-studio-coral-soft'), 'selected rejection uses a soft semantic surface');
    assert.ok((await textContrast(rejectedOption)) >= 4.5, `${theme}主题驳回选项文字对比度应不低于 4.5:1`);
    const confirmAudit = auditPage.getByRole('button', { name: '驳回选题', exact: true });
    assert.ok((await textContrast(confirmAudit)) >= 4.5, `${theme}主题驳回确认文字对比度应不低于 4.5:1`);
    await auditContext.close();
  }

  auditTopic.status = 'pending';
  const auditLifecycle = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  auditLifecycle.on('pageerror', (error) => errors.push(error.message));
  auditLifecycle.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const auditWritesBeforeLifecycle = auditWrites.length;
  await auditLifecycle.goto(`${base}/__qa/${auditTopic.id}`);
  await auditLifecycle.getByRole('heading', { name: auditTopic.title }).waitFor();
  const auditDialogOpener = auditLifecycle.getByRole('button', { name: '审核选题', exact: true });
  await auditDialogOpener.click();
  const auditDialog = auditLifecycle.getByRole('dialog', { name: '审核选题', exact: true });
  await auditDialog.waitFor();
  assert.equal(await auditDialog.getAttribute('aria-modal'), 'true', 'the audit overlay is exposed as a modal dialog');
  const firstAuditControl = auditDialog.getByRole('button', { name: '审核通过', exact: true });
  assert.equal(await firstAuditControl.evaluate((element) => document.activeElement === element), true, 'opening the audit dialog moves focus into the first control');
  await auditLifecycle.keyboard.press('Shift+Tab');
  const lastAuditControl = auditDialog.getByRole('button', { name: '通过审核', exact: true });
  assert.equal(await lastAuditControl.evaluate((element) => document.activeElement === element), true, 'Shift+Tab from the first audit control wraps to the last control');
  await auditLifecycle.keyboard.press('Tab');
  assert.equal(await firstAuditControl.evaluate((element) => document.activeElement === element), true, 'Tab from the last audit control wraps to the first control');
  await auditLifecycle.keyboard.press('Escape');
  await auditDialog.waitFor({ state: 'detached' });
  assert.equal(await auditDialogOpener.evaluate((element) => document.activeElement === element), true, 'closing the audit dialog restores focus to its opener');
  assert.equal(auditWrites.length, auditWritesBeforeLifecycle, 'keyboard dismissal does not write an audit result');
  await auditLifecycle.close();

  const auditSubmit = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const expectedAuditHttpErrors: string[] = [];
  const expectedAuditConsoleErrors: string[] = [];
  auditSubmit.on('pageerror', (error) => errors.push(error.message));
  auditSubmit.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedAuditConsoleErrors.push(message.text());
    else errors.push(message.text());
  });
  auditSubmit.on('response', (response) => {
    if (response.status() < 400) return;
    const responseDescription = `${response.status()} ${response.url()}`;
    if (response.url().endsWith(`/api/topics/${auditTopic.id}/audit`) && response.status() === 503) expectedAuditHttpErrors.push(responseDescription);
    else errors.push(`Unexpected HTTP error: ${responseDescription}`);
  });
  auditTopic.status = 'pending';
  await auditSubmit.goto(`${base}/__qa/${auditTopic.id}`);
  await auditSubmit.getByRole('heading', { name: auditTopic.title }).waitFor();
  await auditSubmit.getByRole('button', { name: '审核选题', exact: true }).click();
  await auditSubmit.locator('select').last().selectOption(String(editor.id));
  failNextAuditSave = '审核服务暂不可用，请稍后重试。';
  await auditSubmit.getByRole('button', { name: '通过审核', exact: true }).click();
  await auditSubmit.getByText('服务器仍处于待审核状态，审核历史也未变化。系统不会自动重发；如需继续，请再次确认原审核操作。', { exact: true }).waitFor();
  assert.equal(auditTopic.status, 'pending', 'failed audit leaves the isolated topic unchanged');
  assert.deepEqual(auditWrites, [], 'failed audit is not recorded as a successful mutation');
  await auditSubmit.getByRole('heading', { name: '审核选题', exact: true }).waitFor();
  await auditSubmit.getByRole('button', { name: '确认再次提交审核', exact: true }).click();
  await auditSubmit.getByRole('dialog', { name: '确认再次提交审核', exact: true }).getByRole('button', { name: '确认再次提交', exact: true }).click();
  await auditSubmit.getByText('服务器已记录通过审核。', { exact: true }).waitFor();
  assert.equal(auditTopic.status, 'approved', 'successful retry updates the isolated topic before showing success');
  assert.deepEqual(auditWrites, [{ topicId: auditTopic.id, status: 'approved' }], 'the retry performs exactly one successful audit write');
  assert.equal(await auditSubmit.getByRole('heading', { name: '审核选题', exact: true }).count(), 0, 'successful audit closes the review dialog');
  assert.equal(expectedAuditHttpErrors.length, 1, 'only the injected audit-save 503 is expected');
  assert.equal(expectedAuditConsoleErrors.length, 1, 'only the injected audit-save 503 is logged by the browser');

  auditTopic.status = 'pending';
  await auditSubmit.goto(`${base}/__qa/${auditTopic.id}`);
  await auditSubmit.getByRole('heading', { name: auditTopic.title }).waitFor();
  await auditSubmit.getByRole('button', { name: '审核选题', exact: true }).click();
  let resolveAuditSaveStarted!: () => void;
  const auditSaveStarted = new Promise<void>((resolve) => { resolveAuditSaveStarted = resolve; });
  auditSaveStartedCallback = resolveAuditSaveStarted;
  holdNextAuditSave = true;
  const auditAttemptsBeforeDelayedSave = auditSaveAttempts;
  await auditSubmit.getByRole('button', { name: '通过审核', exact: true }).click();
  await auditSaveStarted;
  const pendingAuditSubmit = auditSubmit.getByRole('button', { name: '正在提交审核…', exact: true });
  await pendingAuditSubmit.waitFor();
  assert.equal(await pendingAuditSubmit.isDisabled(), true, 'the audit submit button stays disabled until the server confirms the result');
  assert.equal(await auditSubmit.getByRole('button', { name: '审核处理中…', exact: true }).isDisabled(), true, 'the dialog cannot be dismissed while the audit request is pending');
  assert.equal(await auditSubmit.locator('textarea').isDisabled(), true, 'audit comments cannot change while their submitted values are in flight');
  await auditSubmit.keyboard.press('Escape');
  assert.equal(await auditSubmit.getByRole('dialog', { name: '审核选题', exact: true }).count(), 1, 'Escape cannot dismiss the dialog while the audit request is pending');
  assert.equal(auditSaveAttempts, auditAttemptsBeforeDelayedSave + 1, 'one delayed audit request is in flight');
  releaseAuditSave?.();
  releaseAuditSave = null;
  await auditSubmit.getByText('服务器已记录通过审核。', { exact: true }).waitFor();
  assert.equal(auditTopic.status, 'approved', 'the delayed audit is reflected after server confirmation');
  assert.deepEqual(auditWrites.at(-1), { topicId: auditTopic.id, status: 'approved' }, 'the delayed audit is recorded once');
  assert.equal(auditSaveAttempts, auditAttemptsBeforeDelayedSave + 1, 'the locked dialog does not issue a duplicate write');
  await auditSubmit.close();

  auditTopic.status = 'pending';
  auditWrites.length = 0;
  const lostAuditResponse = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const expectedLostAuditErrors: string[] = [];
  lostAuditResponse.on('pageerror', (error) => errors.push(error.message));
  lostAuditResponse.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('status of 503 (Service Unavailable)')) expectedLostAuditErrors.push(message.text());
    else if (message.type() === 'error') errors.push(message.text());
  });
  lostAuditResponse.on('response', (response) => {
    if (response.status() < 400) return;
    const responseDescription = `${response.status()} ${response.url()}`;
    if (response.url().endsWith(`/api/topics/${auditTopic.id}/audit`) && response.status() === 503) expectedLostAuditErrors.push(responseDescription);
    else errors.push(`Unexpected HTTP error: ${responseDescription}`);
  });
  await lostAuditResponse.goto(`${base}/__qa/${auditTopic.id}`);
  await lostAuditResponse.getByRole('heading', { name: auditTopic.title }).waitFor();
  await lostAuditResponse.getByRole('button', { name: '审核选题', exact: true }).click();
  commitNextAuditThenFailResponse = true;
  await lostAuditResponse.getByRole('button', { name: '通过审核', exact: true }).click();
  await lostAuditResponse.getByText('服务器已记录通过审核。', { exact: true }).waitFor();
  assert.equal(auditTopic.status, 'approved', 'readback confirms an audit committed before its response was lost');
  assert.deepEqual(auditWrites, [{ topicId: auditTopic.id, status: 'approved' }], 'committed audit is not submitted a second time after a lost response');
  assert.equal(await lostAuditResponse.getByRole('heading', { name: '审核选题', exact: true }).count(), 0, 'confirmed audit closes the review dialog');
  assert.equal(expectedLostAuditErrors.filter((entry) => entry.startsWith('503 ')).length, 1, 'only the injected lost audit response is expected');
  assert.equal(expectedLostAuditErrors.filter((entry) => entry.includes('status of 503')).length, 1, 'only the fixture audit 503 is logged by the page');
  await lostAuditResponse.close();

  auditTopic.status = 'pending';
  auditWrites.length = 0;
  const lockedAudit = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const expectedLockedAuditHttpErrors: string[] = [];
  const expectedLockedAuditConsoleErrors: string[] = [];
  lockedAudit.on('pageerror', (error) => errors.push(error.message));
  lockedAudit.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('status of 503 (Service Unavailable)')) expectedLockedAuditConsoleErrors.push(message.text());
    else if (message.type() === 'error') errors.push(message.text());
  });
  lockedAudit.on('response', (response) => {
    if (response.status() < 400) return;
    const responseDescription = `${response.status()} ${response.url()}`;
    if (response.status() === 503 && (response.url().endsWith(`/api/topics/${auditTopic.id}/audit`) || response.url().endsWith(`/api/topics/${auditTopic.id}`))) expectedLockedAuditHttpErrors.push(responseDescription);
    else errors.push(`Unexpected HTTP error: ${responseDescription}`);
  });
  await lockedAudit.goto(`${base}/__qa/${auditTopic.id}`);
  await lockedAudit.getByRole('heading', { name: auditTopic.title }).waitFor();
  await lockedAudit.getByRole('button', { name: '审核选题', exact: true }).click();
  failNextAuditSave = '审核服务暂不可用，请稍后重试。';
  failNextAuditStatusReadAfterAuditFailure = true;
  await lockedAudit.getByRole('button', { name: '通过审核', exact: true }).click();
  await lockedAudit.getByText(/审核结果暂时无法确认/).waitFor();
  assert.equal(await lockedAudit.getByRole('button', { name: '通过审核', exact: true }).isDisabled(), true, 'unknown audit result locks duplicate submission');
  assert.deepEqual(auditWrites, [], 'failed audit and failed readback do not report a successful write');
  let resolveAuditStatusReadStarted!: () => void;
  const auditStatusReadStarted = new Promise<void>((resolve) => { resolveAuditStatusReadStarted = resolve; });
  auditStatusReadStartedCallback = resolveAuditStatusReadStarted;
  holdNextAuditStatusRead = true;
  const heldAuditStatusResponse = lockedAudit.waitForResponse((response) => response.url().endsWith(`/api/topics/${auditTopic.id}`) && response.request().method() === 'GET' && response.status() === 200);
  await lockedAudit.getByRole('button', { name: '只读核实状态', exact: true }).click();
  await auditStatusReadStarted;
  await lockedAudit.getByRole('button', { name: '核实中…', exact: true }).waitFor();
  await lockedAudit.keyboard.press('Escape');
  assert.equal(await lockedAudit.getByRole('dialog', { name: '审核选题', exact: true }).count(), 1, 'Escape cannot dismiss the dialog while audit status is being verified');
  releaseAuditStatusRead?.();
  releaseAuditStatusRead = null;
  await heldAuditStatusResponse;
  await lockedAudit.getByText('服务器仍处于待审核状态，审核历史也未变化。系统不会自动重发；如需继续，请再次确认原审核操作。', { exact: true }).waitFor();
  assert.equal(auditWrites.length, 0, 'read-only verification does not repeat an audit write');
  await lockedAudit.getByRole('button', { name: '确认再次提交审核', exact: true }).click();
  await lockedAudit.getByRole('dialog', { name: '确认再次提交审核', exact: true }).getByRole('button', { name: '确认再次提交', exact: true }).click();
  await lockedAudit.getByText('服务器已记录通过审核。', { exact: true }).waitFor();
  assert.deepEqual(auditWrites, [{ topicId: auditTopic.id, status: 'approved' }], 'a second audit write occurs only after verification and explicit user confirmation');
  assert.equal(expectedLockedAuditHttpErrors.length, 2, 'only the injected audit and readback 503 responses are expected');
  assert.equal(expectedLockedAuditConsoleErrors.length, 2, 'only the injected audit and readback 503 errors are logged by the page');
  await lockedAudit.close();

  auditTopic.status = 'pending';
  auditWrites.length = 0;
  const reloadAudit = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const reloadAuditPayloads: unknown[] = [];
  reloadAudit.on('request', (request) => {
    if (request.url().endsWith(`/api/topics/${auditTopic.id}/audit`) && request.method() === 'POST') {
      reloadAuditPayloads.push(request.postDataJSON());
    }
  });
  await reloadAudit.goto(`${base}/__qa/${auditTopic.id}`);
  await reloadAudit.getByRole('heading', { name: auditTopic.title }).waitFor();
  await reloadAudit.getByRole('button', { name: '审核选题', exact: true }).click();
  await reloadAudit.locator('#topic-audit-assignee').selectOption(String(creator.id));
  await reloadAudit.locator('#topic-audit-comment').fill('刷新后恢复的原始审核意见');
  const reloadAuditAttemptsBefore = auditSaveAttempts;
  failNextAuditSave = '审核服务暂不可用，请稍后重试。';
  failNextAuditStatusReadAfterAuditFailure = true;
  await reloadAudit.getByRole('button', { name: '通过审核', exact: true }).click();
  await reloadAudit.getByText(/审核结果暂时无法确认/).waitFor();
  assert.equal(auditSaveAttempts, reloadAuditAttemptsBefore + 1, 'unknown audit response sends one POST before reload');
  const beforeUnloadBlocked = await reloadAudit.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(beforeUnloadBlocked, true, 'unknown audit recovery warns before a reload can discard the in-memory state');
  await reloadAudit.getByRole('button', { name: '返回列表', exact: true }).click();
  await reloadAudit.getByRole('dialog', { name: '审核结果尚未核实', exact: true }).waitFor();
  await reloadAudit.getByRole('button', { name: '留在本页核实审核', exact: true }).click();
  assert.equal(await reloadAudit.getByRole('dialog', { name: '审核结果尚未核实', exact: true }).count(), 0, 'the user can stay and continue read-only recovery');
  await reloadAudit.reload();
  await reloadAudit.getByRole('heading', { name: auditTopic.title }).waitFor();
  await reloadAudit.getByText('服务器仍处于待审核状态，审核历史也未变化。系统不会自动重发；如需继续，请再次确认原审核操作。', { exact: true }).waitFor();
  assert.equal(await reloadAudit.locator('#topic-audit-comment').inputValue(), '刷新后恢复的原始审核意见', 'reload restores the original audit comment');
  assert.equal(await reloadAudit.locator('#topic-audit-assignee').inputValue(), String(creator.id), 'reload restores the original assignee');
  assert.equal(auditSaveAttempts, reloadAuditAttemptsBefore + 1, 're-entry performs read-only verification and does not auto-resubmit');
  assert.deepEqual(auditWrites, [], 'the server still has no audit write before explicit retry confirmation');
  await reloadAudit.getByRole('button', { name: '确认再次提交审核', exact: true }).click();
  await reloadAudit.getByRole('dialog', { name: '确认再次提交审核', exact: true }).getByRole('button', { name: '确认再次提交', exact: true }).click();
  await reloadAudit.getByText('服务器已记录通过审核。', { exact: true }).waitFor();
  assert.equal(auditSaveAttempts, reloadAuditAttemptsBefore + 2, 'one additional POST follows a fresh read and explicit confirmation');
  assert.deepEqual(reloadAuditPayloads, [
    { status: 'approved', comment: '刷新后恢复的原始审核意见', assignee_id: creator.id },
    { status: 'approved', comment: '刷新后恢复的原始审核意见', assignee_id: creator.id },
  ], 'retry uses the exact persisted audit operation and does not accept changed form values');
  await reloadAudit.close();

  auditTopic.status = 'pending';
  auditWrites.length = 0;
  const committedAuditReload = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await committedAuditReload.goto(`${base}/__qa/${auditTopic.id}`);
  await committedAuditReload.getByRole('heading', { name: auditTopic.title }).waitFor();
  await committedAuditReload.getByRole('button', { name: '审核选题', exact: true }).click();
  const committedAuditAttemptsBefore = auditSaveAttempts;
  commitNextAuditThenFailResponse = true;
  failNextAuditStatusReadAfterCommit = true;
  await committedAuditReload.getByRole('button', { name: '通过审核', exact: true }).click();
  await committedAuditReload.getByText(/审核结果暂时无法确认/).waitFor();
  assert.equal(auditSaveAttempts, committedAuditAttemptsBefore + 1, 'committed response loss sends one audit POST');
  assert.equal(auditWrites.length, 1, 'the server records the audit before dropping the response');
  await committedAuditReload.reload();
  await committedAuditReload.getByRole('heading', { name: auditTopic.title }).waitFor();
  await committedAuditReload.getByText('服务器已记录通过审核。', { exact: true }).waitFor();
  assert.equal(auditSaveAttempts, committedAuditAttemptsBefore + 1, 'reload recognizes committed audit history without another POST');
  assert.equal(auditWrites.length, 1, 'read-only recovery does not duplicate the committed audit');
  assert.equal(await committedAuditReload.evaluate((topicId) => sessionStorage.getItem(`xmt:topic-audit-pending:v1:user:${93}:topic:${topicId}`), auditTopic.id), null, 'a verified result clears only its recovery marker');
  await committedAuditReload.close();

  auditTopic.status = 'pending';
  const blockedAuditStorage = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await blockedAuditStorage.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key.startsWith('xmt:topic-audit-pending:v1:')) throw new DOMException('storage denied', 'SecurityError');
      return originalSetItem.call(this, key, value);
    };
  });
  await blockedAuditStorage.goto(`${base}/__qa/${auditTopic.id}`);
  await blockedAuditStorage.getByRole('heading', { name: auditTopic.title }).waitFor();
  await blockedAuditStorage.getByRole('button', { name: '审核选题', exact: true }).click();
  const blockedAuditAttemptsBefore = auditSaveAttempts;
  await blockedAuditStorage.getByRole('button', { name: '通过审核', exact: true }).click();
  await blockedAuditStorage.getByRole('alert').getByText(/本次未提交审核/).waitFor();
  assert.equal(auditSaveAttempts, blockedAuditAttemptsBefore, 'storage marker failure prevents the audit POST');
  assert.deepEqual(auditWrites, [], 'storage marker failure has no server-side audit effect');
  await blockedAuditStorage.close();

  auditTopic.status = 'pending';
  const auditWritesBeforeHomeAction = auditWrites.length;
  const home = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await home.addInitScript(() => { Date.now = () => new Date('2026-10-09T12:00:00+08:00').getTime(); });
  const homeNavigationTrace: string[] = [];
  let homeNavigationEventCount = 0;
  home.on('framenavigated', (frame) => {
    if (frame !== home.mainFrame()) return;
    homeNavigationEventCount += 1;
    if (homeNavigationTrace.at(-1) !== frame.url() && homeNavigationTrace.length < 20) homeNavigationTrace.push(frame.url());
  });
  const recentHomePublishingListRequests: string[] = [];
  const homeLegacyListReadsBefore = { topics: homeTopicListReads, production: homeProductionListReads };
  const noPermissionCreatorReadsBeforeHome = creatorDashboardAccountQueries.length;
  home.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/workflow/publishing') recentHomePublishingListRequests.push(request.url());
  });
  home.on('pageerror', (error) => errors.push(error.message));
  home.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await home.goto(`${base}/__qa-home`);
  await home.getByRole('heading', { name: '审核与内容推进' }).waitFor();
  await home.getByRole('heading', { name: '团队选题关注' }).waitFor();
  const desktopRecentChangesToggle = home.getByRole('button', { name: '收起最近变化', exact: true });
  const desktopRecentChangesRegion = home.locator('#home-recent-changes-content');
  await home.getByText('可追溯的稿件版本、批注和选题阶段变化', { exact: true }).waitFor();
  assert.equal(await desktopRecentChangesToggle.getAttribute('aria-expanded'), 'true', 'desktop recent changes reports that its content is expanded by default');
  assert.equal(await desktopRecentChangesToggle.getAttribute('aria-controls'), 'home-recent-changes-content', 'desktop recent changes toggle points to its controlled region');
  assert.equal(await desktopRecentChangesRegion.getAttribute('role'), 'region', 'desktop recent changes content is exposed as a named region');
  assert.equal(await desktopRecentChangesRegion.getAttribute('aria-labelledby'), 'home-recent-changes-title', 'desktop recent changes region is named by its visible heading');
  assert.equal(await desktopRecentChangesRegion.isVisible(), true, 'desktop recent changes region is visible while expanded');
  await home.getByText('最近变化验收稿件', { exact: true }).waitFor();
  await home.getByText('小修 · 基于 v1.0', { exact: true }).waitFor();
  await desktopRecentChangesToggle.click();
  const desktopRecentChangesCollapsedToggle = home.getByRole('button', { name: '展开最近变化', exact: true });
  assert.equal(await desktopRecentChangesCollapsedToggle.getAttribute('aria-expanded'), 'false', 'desktop recent changes reports the collapsed state after activation');
  assert.equal(await desktopRecentChangesRegion.isVisible(), false, 'desktop recent changes controlled region is hidden while collapsed');
  assert.equal(await home.getByText('最近变化验收稿件', { exact: true }).count(), 0, 'collapsing desktop recent changes hides its event list');
  await desktopRecentChangesCollapsedToggle.click();
  const desktopRecentChangesExpandedToggle = home.getByRole('button', { name: '收起最近变化', exact: true });
  assert.equal(await desktopRecentChangesExpandedToggle.getAttribute('aria-expanded'), 'true', 'desktop recent changes reports the expanded state after reopening');
  assert.equal(await desktopRecentChangesRegion.isVisible(), true, 'desktop recent changes controlled region is shown after reopening');
  await home.getByText('最近变化验收稿件', { exact: true }).waitFor();
  assert.equal(creatorDashboardAccountQueries.length, noPermissionCreatorReadsBeforeHome, 'Home does not request creator analytics when the signed-in user lacks creator:data:view');
  assert.equal(await home.getByText('近 7 天播放变化', { exact: true }).count(), 0, 'creator metrics stay hidden for a user without view permission');
  assert.deepEqual(recentHomePublishingListRequests, [], 'Home no longer reads the publishing list to synthesize recent activity');
  assert.deepEqual({ topics: homeTopicListReads, production: homeProductionListReads }, homeLegacyListReadsBefore, 'Home uses bounded summaries instead of separate topic-stage and production list requests');
  await home.getByText('我的待续写稿件', { exact: true }).waitFor();
  await home.getByRole('button', { name: `审核稿件：待审核稿件 · ${managerProductionReview.topic_title}`, exact: true }).waitFor();
  await home.getByRole('button', { name: `开始审核：审核选题 · ${auditTopic.title}`, exact: true }).waitFor();
  await home.getByRole('button', { name: '去发布：今日发布 · 今日待发布验收 · 抖音', exact: true }).waitFor();
  await home.getByRole('button', { name: '继续写稿：继续写稿 · 我的待续写稿件', exact: true }).waitFor();
  const desktopReviewTasks = home.getByTestId('home-priority-task');
  assert.match(await desktopReviewTasks.nth(0).getAttribute('aria-label') || '', /^审核稿件：/);
  assert.match(await desktopReviewTasks.nth(1).getAttribute('aria-label') || '', /^开始审核：/);
  assert.match(await desktopReviewTasks.nth(2).getAttribute('aria-label') || '', /^跟进选题：/);
  const attentionTaskMeta = home.getByTestId('home-priority-task-meta').nth(2);
  assert.equal(await attentionTaskMeta.innerText(), `负责人：${editor.name} · 截止 2026/10/07`, 'an actionable attention task identifies who owns the topic and its deadline');
  assert.ok(await textContrast(attentionTaskMeta) >= 4.5, 'light-theme attention task ownership meets 4.5:1 contrast');
  const desktopDraftSaveStatus = home.getByTestId('home-draft-save-status').first();
  await desktopDraftSaveStatus.waitFor();
  assert.equal(await desktopDraftSaveStatus.innerText(), '保存状态未确认', 'a server update timestamp does not claim a save was confirmed in the desktop browser session');
  await home.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('writeConsistency:saved', 'production:943@v1.1', { userId: 96, source: 'browser-test' });
  });
  assert.equal(await desktopDraftSaveStatus.innerText(), '保存状态未确认', 'save state from another account is not shown on a desktop personal draft');
  await home.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('editor:synced', 'production:943@v1.1', { userId: 93, source: 'browser-test' });
  });
  assert.equal(await desktopDraftSaveStatus.innerText(), '保存状态未确认', 'a collaboration sync event alone is not treated as persisted save confirmation');
  await home.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('writeConsistency:saved', 'production:943@v1.1', { userId: 93, source: 'browser-test' });
  });
  assert.equal(await desktopDraftSaveStatus.innerText(), '本次会话已确认保存', 'the desktop Home only shows saved after an account-matched write confirmation');
  await home.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('conflict:event', 'production:943@v1.1', { userId: 93, source: 'browser-test' });
  });
  assert.equal(await desktopDraftSaveStatus.innerText(), '保存异常待确认', 'a persisted editor conflict is surfaced on desktop Home');
  await home.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('editor:local-change', 'production:943@v1.1', { userId: 93, source: 'browser-test' });
  });
  assert.equal(await desktopDraftSaveStatus.innerText(), '保存异常待确认', 'a later edit does not hide an unresolved editor conflict');
  assert.match(await desktopReviewTasks.nth(3).getAttribute('aria-label') || '', /^去发布：/);
  const ideaStage = home.getByRole('button', { name: /^4 灵感池/ });
  await ideaStage.getByText('首页灵感预览 3', { exact: true }).waitFor();
  assert.equal(await ideaStage.getByText('首页灵感预览 4', { exact: true }).count(), 0, 'the inspiration stage displays exactly three latest previews');
  assert.equal(await home.getByRole('button', { name: '新建选题', exact: true }).count(), 0, 'the desktop header hides create-topic actions without the actual permission');
  assert.equal(await home.getByRole('button', { name: '进入选题管理', exact: true }).count(), 1, 'Home keeps one general entry to the topic list');
  assert.equal(await home.getByRole('button', { name: '进入内容生产', exact: true }).count(), 0, 'the content-flow section does not duplicate the general topic-list entry');
  const quickWriteButton = home.getByRole('button', { name: '写两句', exact: true });
  await quickWriteButton.waitFor();
  const homeHistoryBeforeQuickWrite = await home.evaluate(() => ({ length: history.length, state: history.state }));
  await quickWriteButton.click();
  await home.waitForURL((url) => url.pathname === '/production' && !url.searchParams.has('action'));
  await home.getByRole('heading', { name: '添加创作记录', exact: true }).waitFor();
  await home.getByText('关联选题 *', { exact: true }).waitFor();
  const productionHistoryBeforeBack = await home.evaluate(() => ({ url: location.href, length: history.length, state: history.state }));
  await home.goBack();
  await home.waitForURL((url) => url.pathname === '/');
  const firstHomeHeading = home.getByRole('heading', { name: '内容流', exact: true });
  const firstHomeHeadingReady = await firstHomeHeading.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  if (!firstHomeHeadingReady) {
    const homeState = await home.evaluate(() => ({
      url: location.href,
      title: document.title,
      width: window.innerWidth,
      historyLength: history.length,
      historyState: history.state,
      body: document.body.innerText.slice(0, 1200),
    }));
    assert.fail(`back to desktop Home reached the root route without the content-flow heading: ${JSON.stringify({ homeHistoryBeforeQuickWrite, productionHistoryBeforeBack, homeNavigationTrace, homeNavigationEventCount, homeState })}`);
  }
  await home.getByRole('button', { name: /^继续写稿：/ }).waitFor();
  await home.getByText('最近变化验收稿件', { exact: true }).scrollIntoViewIfNeeded();
  await home.screenshot({ path: '/tmp/xmt-home-recent-activity-1440.png', fullPage: false });
  await home.getByText('已超过截止时间 · 2026/10/07', { exact: true }).waitFor();
  await home.screenshot({ path: '/tmp/xmt-home-attention-1440.png', fullPage: false });
  assert.equal(await home.getByText('今日发布', { exact: true }).count(), 1, 'desktop Home shows one today publishing task title');
  assert.equal(await home.getByText('今日待发布验收 · 抖音', { exact: true }).count(), 1, 'desktop Home shows the topic and platform for today publishing');
  await home.getByText('2026/10/09 15:00', { exact: true }).waitFor();
  assert.equal(await home.title(), '新媒体协作管理系统', 'the Home flow renders the intended app document');
  assert.equal(new URL(home.url()).pathname, '/', 'the Home fixture lands on the real dashboard route');
  assert.match(await home.locator('body').innerText(), /审核与内容推进[\s\S]*团队选题关注/, 'the dashboard renders meaningful Home content');
  assert.equal(await home.locator('vite-error-overlay').count(), 0, 'the rendered Home page has no Vite error overlay');
  await home.getByRole('button', { name: new RegExp(`选题状态.*${auditTopic.title}.*阶段更新至待审核`) }).click();
  await home.waitForURL((url) => url.pathname === `/topics/${auditTopic.id}`);
  await home.goBack();
  await home.waitForURL((url) => url.pathname === '/');
  await home.getByRole('heading', { name: '内容流', exact: true }).waitFor({ timeout: 10_000 });
  const startAuditFromHome = home.getByRole('button', { name: /^开始审核：/ }).first();
  await startAuditFromHome.waitFor();
  const pendingStageCard = home.getByRole('button', { name: /^4 待审 / });
  for (const title of [auditTopic.title, secondPendingTopic.title, thirdPendingTopic.title]) {
    await pendingStageCard.getByText(title, { exact: true }).waitFor();
  }
  await pendingStageCard.getByText('停留 1 天', { exact: true }).waitFor();
  await pendingStageCard.getByText('停留不到 1 小时', { exact: true }).waitFor();
  await pendingStageCard.getByText('停留 2 天', { exact: true }).waitFor();
  assert.ok(await textContrast(pendingStageCard.getByText(auditTopic.title, { exact: true })) >= 4.5, 'light-theme stage topic previews meet 4.5:1 contrast');
  assert.ok(await textContrast(pendingStageCard.getByText('停留 1 天', { exact: true }).first()) >= 4.5, 'light-theme stage elapsed-time details meet 4.5:1 contrast');
  assert.equal(await pendingStageCard.getByText(fourthPendingTopic.title, { exact: true }).count(), 0, 'the content-flow card shows only the three newest topics from the loaded stage list');
  const creationStageCard = home.getByRole('button').filter({ has: home.getByText(approvedPipelineTopic.title, { exact: true }) }).first();
  await creationStageCard.getByText('已通过 · 待开始创作', { exact: true }).waitFor();
  const approvedStageTimeCases = [
    ['2026-10-06 12:00:00', '停留 3 天'],
    [null, '阶段时间待确认'],
    [undefined, '阶段时间待确认'],
    ['不是有效时间', '阶段时间待确认'],
    ['2026-10-10 12:00:00', '阶段时间待确认'],
  ] as const;
  for (const [stageEnteredAt, expectedElapsed] of approvedStageTimeCases) {
    approvedPipelineStageEnteredAt = stageEnteredAt;
    await home.goto(`${base}/__qa-home`);
    await home.getByRole('heading', { name: '内容流', exact: true }).waitFor();
    const approvedStage = home.getByRole('button').filter({ has: home.getByText(approvedPipelineTopic.title, { exact: true }) }).first();
    await approvedStage.getByText('已通过 · 待开始创作', { exact: true }).waitFor();
    await approvedStage.getByText(expectedElapsed, { exact: true }).waitFor();
  }
  approvedPipelineStageEnteredAt = '2026-10-06 12:00:00';
  await home.goto(`${base}/__qa-home`);
  await home.getByRole('heading', { name: '内容流', exact: true }).waitFor();
  const restoredCreationStageCard = home.getByRole('button').filter({ has: home.getByText(approvedPipelineTopic.title, { exact: true }) }).first();
  await restoredCreationStageCard.getByText('已通过 · 待开始创作', { exact: true }).waitFor();
  await restoredCreationStageCard.getByText('停留 3 天', { exact: true }).waitFor();
  await Promise.all([
    home.waitForURL((url) => url.pathname === '/topics' && url.searchParams.get('status') === 'creation'),
    restoredCreationStageCard.click(),
  ]);
  const creationStageFilter = home.getByRole('combobox', { name: '按状态筛选选题' });
  await creationStageFilter.waitFor();
  assert.equal(await creationStageFilter.inputValue(), 'creation', 'opening the creation stage selects the combined approved and active filter');
  await home.getByRole('table').getByText(approvedPipelineTopic.title, { exact: true }).waitFor();
  await home.getByRole('table').getByText(productionTopic.title, { exact: true }).waitFor();
  await home.getByRole('button', { name: '看板', exact: true }).click();
  const creationBoard = home.getByRole('region', { name: '选题状态看板' });
  const approvedBoardColumnReady = await creationBoard.getByRole('heading', { name: '已通过', exact: true }).waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  if (!approvedBoardColumnReady) {
    const boardState = await home.evaluate(() => ({
      url: location.href,
      title: document.title,
      body: document.body.innerText.slice(0, 900),
    }));
    assert.fail(`creation board did not show the approved column: ${JSON.stringify(boardState)}`);
  }
  await creationBoard.getByRole('heading', { name: '创作中', exact: true }).waitFor();
  await creationBoard.getByRole('button', { name: approvedPipelineTopic.title, exact: true }).waitFor();
  await creationBoard.getByRole('button', { name: productionTopic.title, exact: true }).waitFor();
  await creationStageFilter.selectOption('production');
  await home.waitForURL((url) => url.pathname === '/topics' && url.searchParams.get('status') === 'production');
  await home.reload();
  assert.equal(await creationStageFilter.inputValue(), 'production', 'a changed desktop status filter survives a reload through the URL');
  await creationStageFilter.selectOption('');
  await home.waitForURL((url) => url.pathname === '/topics' && !url.searchParams.has('status'));
  await home.reload();
  assert.equal(await creationStageFilter.inputValue(), '', 'clearing the desktop status filter also survives a reload');
  await creationStageFilter.selectOption('creation');
  await home.goBack();
  await home.goBack();
  await home.getByRole('heading', { name: '内容流', exact: true }).waitFor();
  const retrospectiveStageCard = home.getByRole('button', { name: /^5 复盘 / });
  for (const title of ['团队周复盘', '选题专项复盘', '渠道复盘']) {
    await retrospectiveStageCard.getByText(title, { exact: true }).waitFor();
  }
  await retrospectiveStageCard.getByText('周期 2026-10-06—10-09 · 已发布', { exact: true }).waitFor();
  assert.equal(await home.getByText('从发布记录开始复盘', { exact: true }).count(), 0, 'the content-flow retrospective stage no longer uses a publishing placeholder');
  await retrospectiveStageCard.scrollIntoViewIfNeeded();
  await home.screenshot({ path: '/tmp/xmt-home-content-flow-retrospective-1440.png', fullPage: false });
  await Promise.all([
    home.waitForURL((url) => url.pathname === '/retrospectives'),
    retrospectiveStageCard.click(),
  ]);
  await home.getByRole('heading', { name: '复盘中心' }).waitFor();
  await home.goBack();
  await home.getByRole('heading', { name: '内容流', exact: true }).waitFor();
  await startAuditFromHome.click();
  await home.waitForURL((url) => url.pathname === `/topics/${auditTopic.id}` && !url.searchParams.has('action'));
  await home.getByRole('heading', { name: '审核选题', exact: true }).waitFor();
  assert.equal(auditTopic.status, 'pending', 'the Home review action opens the existing dialog without changing the topic');
  assert.equal(auditWrites.length, auditWritesBeforeHomeAction, 'opening the review dialog does not submit an audit');
  await home.close();

  const homeDark = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const darkHomeErrors: string[] = [];
  await homeDark.addInitScript(() => { Date.now = () => new Date('2026-10-09T12:00:00+08:00').getTime(); });
  homeDark.on('pageerror', (error) => darkHomeErrors.push(error.message));
  homeDark.on('console', (message) => { if (message.type() === 'error') darkHomeErrors.push(message.text()); });
  await homeDark.goto(`${base}/__qa-home?theme=dark`);
  await homeDark.getByRole('heading', { name: '内容流', exact: true }).waitFor();
  const darkAttentionTaskMeta = homeDark.getByTestId('home-priority-task-meta').nth(2);
  assert.equal(await darkAttentionTaskMeta.innerText(), `负责人：${editor.name} · 截止 2026/10/07`, 'dark-theme attention task exposes the same assigned owner and deadline');
  assert.ok(await textContrast(darkAttentionTaskMeta) >= 4.5, 'dark-theme attention task ownership meets 4.5:1 contrast');
  const darkPendingStage = homeDark.getByRole('button', { name: /^4 待审 / });
  assert.ok(await textContrast(darkPendingStage.getByText(auditTopic.title, { exact: true })) >= 4.5, 'dark-theme stage topic previews meet 4.5:1 contrast');
  assert.ok(await textContrast(darkPendingStage.getByText('停留 1 天', { exact: true }).first()) >= 4.5, 'dark-theme stage elapsed-time details meet 4.5:1 contrast');
  await homeDark.screenshot({ path: '/tmp/xmt-home-content-flow-dark-1440.png', fullPage: false });
  assert.deepEqual(darkHomeErrors, [], darkHomeErrors.join('\n'));
  await homeDark.close();

  const partialHome = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const expectedPartialReadErrors: string[] = [];
  const partialApiMethods: string[] = [];
  partialHome.on('pageerror', (error) => errors.push(error.message));
  partialHome.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedPartialReadErrors.push(message.text());
    else errors.push(message.text());
  });
  partialHome.on('request', (request) => {
    if (request.url().includes('/api/')) partialApiMethods.push(request.method());
  });
  partialHome.on('response', (response) => {
    if (response.status() < 400) return;
    if (response.status() === 503 && response.url().endsWith('/api/dashboard/home-attention')) expectedPartialReadErrors.push(`${response.status()} ${response.url()}`);
    else errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  failNextHomeAttention = true;
  await partialHome.goto(`${base}/__qa-home`);
  assert.equal(await partialHome.getByText('工作台部分数据暂时无法读取', { exact: true }).count(), 0, 'the aggregate error is not repeated in a second dashboard banner');
  const unavailablePendingStage = partialHome.getByRole('button', { name: /— 待审/ });
  await unavailablePendingStage.getByText('暂时无法读取', { exact: true }).waitFor();
  const unavailableRetrospectiveStage = partialHome.getByRole('button', { name: /— 复盘/ });
  await unavailableRetrospectiveStage.getByText('暂时无法读取', { exact: true }).waitFor();
  assert.equal(await unavailablePendingStage.getByRole('button').count(), 0, 'a failed stage card exposes no misleading nested retry control');
  await partialHome.getByRole('button', { name: '重新加载', exact: true }).waitFor();
  await partialHome.getByText('工作台摘要暂时无法读取，请重试。', { exact: true }).waitFor();
  assert.equal(await partialHome.getByRole('alert').count(), 1, 'the aggregate failure has one actionable alert');
  assert.equal(await partialHome.getByText('—', { exact: true }).count(), 7, 'failed stage counts, retrospective count, and attention count remain unknown instead of zero');
  await partialHome.getByRole('status').getByText('部分任务来源暂时无法读取', { exact: false }).waitFor();
  assert.equal(await partialHome.getByText('今天没有必须处理的任务', { exact: true }).count(), 0, 'failed task reads are not presented as an empty task list');
  assert.equal(await unavailablePendingStage.getByText('当前没有内容', { exact: true }).count(), 0, 'failed stage reads are not presented as an empty stage');
  const reloadDashboardResponse = partialHome.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-attention'));
  await partialHome.getByRole('button', { name: '重新加载', exact: true }).click();
  const recoveredPendingResponse = await reloadDashboardResponse;
  assert.equal(recoveredPendingResponse.status(), 200, 'dashboard retry re-reads the failed aggregate');
  await partialHome.getByRole('button', { name: /^4 待审/ }).getByText(auditTopic.title, { exact: true }).waitFor();
  await partialHome.getByText('已超过截止时间 · 2026/10/07', { exact: true }).waitFor();
  assert.equal(await partialHome.getByText('—', { exact: true }).count(), 0, 'the successful retry restores both confirmed counts');
  assert.equal(await partialHome.getByRole('alert').count(), 0, 'successful read retries clear dashboard and attention error states');
  assert.ok(expectedPartialReadErrors.length >= 1, 'the only expected partial Home error is the deliberately injected aggregate 503');
  assert.ok(partialApiMethods.every((method) => method === 'GET'), 'Home failure and retry recovery issue no API writes');
  await partialHome.close();

  const partialRetrospectiveHome = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  partialRetrospectiveHome.on('pageerror', (error) => errors.push(error.message));
  partialRetrospectiveHome.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  failNextHomeRetrospectives = true;
  await partialRetrospectiveHome.goto(`${base}/__qa-home`);
  await partialRetrospectiveHome.getByRole('heading', { name: '团队选题关注' }).waitFor();
  const unavailableRetrospectiveCard = partialRetrospectiveHome.getByRole('button', { name: /^— 复盘/ });
  await unavailableRetrospectiveCard.getByText('暂时无法读取', { exact: true }).waitFor();
  await partialRetrospectiveHome.getByRole('button', { name: /^4 待审/ }).getByText(auditTopic.title, { exact: true }).waitFor();
  assert.equal(await partialRetrospectiveHome.getByText('团队周复盘', { exact: true }).count(), 0, 'an unavailable retrospective summary is not rendered as an empty inventory or stale preview');
  assert.equal(await partialRetrospectiveHome.getByText('今天没有必须处理的任务', { exact: true }).count(), 0, 'the isolated retrospective failure does not block other Home sections');
  assert.equal(await partialRetrospectiveHome.getByRole('alert').count(), 1, 'the partial failure is reported in the dashboard summary');
  await unavailableRetrospectiveCard.click();
  await partialRetrospectiveHome.waitForURL((url) => url.pathname === '/retrospectives');
  await partialRetrospectiveHome.close();

  const mobileRetrospectiveHome = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const mobileRetrospectiveMethods: string[] = [];
  mobileRetrospectiveHome.on('pageerror', (error) => errors.push(error.message));
  mobileRetrospectiveHome.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  mobileRetrospectiveHome.on('request', (request) => {
    if (request.url().includes('/api/')) mobileRetrospectiveMethods.push(request.method());
  });
  failNextHomeRetrospectives = true;
  await mobileRetrospectiveHome.goto(`${base}/__qa-home`);
  await mobileRetrospectiveHome.getByRole('heading', { name: '内容阶段' }).waitFor();
  await mobileRetrospectiveHome.getByRole('button', { name: /^— 复盘/ }).waitFor();
  await mobileRetrospectiveHome.getByRole('button', { name: /各阶段最新内容/ }).click();
  await mobileRetrospectiveHome.getByText('复盘摘要暂时无法读取，当前无法确认是否有复盘记录。', { exact: true }).waitFor();
  await mobileRetrospectiveHome.getByRole('button', { name: '重试读取复盘', exact: true }).waitFor();
  const unavailableMobileRetrospectiveStage = mobileRetrospectiveHome.getByRole('region', { name: '复盘 · —' });
  assert.equal(await unavailableMobileRetrospectiveStage.getByText('当前没有内容', { exact: true }).count(), 0, 'an unavailable review summary is never shown as an empty review list');
  mobileRetrospectiveMethods.length = 0;
  const mobileRetrospectiveRecovery = mobileRetrospectiveHome.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-attention'));
  await mobileRetrospectiveHome.getByRole('button', { name: '重试读取复盘', exact: true }).click();
  const mobileRetrospectiveResponse = await mobileRetrospectiveRecovery;
  assert.equal(mobileRetrospectiveResponse.status(), 200, 'the section retry re-reads the Home summary');
  await mobileRetrospectiveHome.getByRole('button', { name: '5 复盘', exact: true }).waitFor();
  await mobileRetrospectiveHome.getByText('团队周复盘', { exact: true }).waitFor();
  assert.deepEqual(mobileRetrospectiveMethods, ['GET'], 'the mobile retrospective retry performs one read and no writes');
  assert.equal(await mobileRetrospectiveHome.getByRole('alert').count(), 0, 'successful section retry clears its unavailable state');
  await mobileRetrospectiveHome.close();

  const actionableRecoveryHome = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const expectedActionableReadErrors: string[] = [];
  const actionableHomeApiMethods: string[] = [];
  actionableRecoveryHome.on('pageerror', (error) => errors.push(error.message));
  actionableRecoveryHome.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedActionableReadErrors.push(message.text());
    else errors.push(message.text());
  });
  actionableRecoveryHome.on('request', (request) => {
    if (request.url().includes('/api/')) actionableHomeApiMethods.push(request.method());
  });
  actionableRecoveryHome.on('response', (response) => {
    if (response.status() < 400) return;
    if (response.status() === 503 && response.url().includes('/api/messages?') && response.url().includes('link=present')) expectedActionableReadErrors.push(`${response.status()} ${response.url()}`);
    else errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  emptyHomeTasks = true;
  homeUnknownStageTimeCount = 2;
  failNextHomeActionableMessages = true;
  // Leave enough time for slower/macOS browser startup before asserting the loading state.
  delayNextHomeActionableMessages = 5000;
  const firstActionableRead = actionableRecoveryHome.waitForResponse((response) => response.url().includes('/api/messages?') && response.url().includes('link=present'));
  await actionableRecoveryHome.goto(`${base}/__qa-manager-home`);
  await actionableRecoveryHome.getByRole('heading', { name: '团队今日重点' }).waitFor();
  await actionableRecoveryHome.getByText('正在确认是否有待处理消息…', { exact: true }).waitFor();
  assert.equal(await actionableRecoveryHome.getByText('今天没有必须处理的任务', { exact: true }).count(), 0, 'a pending actionable-message read is not presented as a confirmed empty task list');
  await actionableRecoveryHome.screenshot({ path: '/tmp/xmt-home-actionable-read-loading-1440.png', fullPage: false });
  assert.equal((await firstActionableRead).status(), 503, 'the isolated first actionable-message read fails as injected');
  await actionableRecoveryHome.getByText('待处理消息暂时无法读取，请重试。', { exact: true }).waitFor();
  assert.equal(await actionableRecoveryHome.getByText('今天没有必须处理的任务', { exact: true }).count(), 0, 'a failed actionable-message read is not presented as an empty task list');
  await actionableRecoveryHome.screenshot({ path: '/tmp/xmt-home-actionable-read-error-1440.png', fullPage: false });
  const actionableQueriesBeforeFailure = managerMessageQueries.length;
  delayNextHomeActionableMessages = 1200;
  const failedActionableRead = actionableRecoveryHome.waitForResponse((response) => response.url().includes('/api/messages?') && response.url().includes('link=present'));
  await actionableRecoveryHome.getByRole('button', { name: '重新加载', exact: true }).click();
  await actionableRecoveryHome.getByRole('button', { name: '正在重试…', exact: true }).waitFor();
  await actionableRecoveryHome.getByText('待处理消息暂时无法读取，请重试。', { exact: true }).waitFor();
  assert.equal(await actionableRecoveryHome.getByText('今天没有必须处理的任务', { exact: true }).count(), 0, 'retry keeps the unresolved message source visible instead of briefly claiming there are no tasks');
  await actionableRecoveryHome.screenshot({ path: '/tmp/xmt-home-actionable-read-retrying-1440.png', fullPage: false });
  assert.equal((await failedActionableRead).status(), 200, 'the explicit read-only retry succeeds');
  await actionableRecoveryHome.getByText('今天没有必须处理的任务', { exact: true }).waitFor();
  await actionableRecoveryHome.getByText('目前没有逾期或已确认卡点内容', { exact: true }).waitFor();
  await actionableRecoveryHome.getByText('2 项内容的当前阶段时间待确认，暂不计入卡点；这不代表它们一定没有卡点。', { exact: true }).waitFor();
  assert.equal(await actionableRecoveryHome.getByText('待处理消息暂时无法读取，请重试。', { exact: true }).count(), 0, 'successful retry clears the read error and confirms the empty task state');
  await actionableRecoveryHome.screenshot({ path: '/tmp/xmt-home-unknown-stage-time-empty-1440.png', fullPage: false });
  assert.equal(managerMessageQueries.length, actionableQueriesBeforeFailure + 1, 'retry performs exactly one scoped actionable-message read');
  assert.ok(expectedActionableReadErrors.length >= 2, 'the only expected errors are the isolated actionable-message 503 and its response record');
  assert.ok(actionableHomeApiMethods.every((method) => method === 'GET'), 'Home actionable-message failure and retry perform no API writes');
  homeUnknownStageTimeCount = 0;
  await actionableRecoveryHome.reload();
  await actionableRecoveryHome.getByText('目前没有逾期或卡点内容', { exact: true }).waitFor();
  assert.equal(await actionableRecoveryHome.getByText(/当前阶段时间待确认/).count(), 0, 'when no active topic has unknown stage time, the dashboard confirms the genuine empty attention state');
  await actionableRecoveryHome.screenshot({ path: '/tmp/xmt-home-attention-confirmed-empty-1440.png', fullPage: false });
  await actionableRecoveryHome.close();

  const actionableMobileHome = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const actionableMobileMethods: string[] = [];
  const actionableMobileMessageReads: string[] = [];
  const expectedMobileActionableErrors: string[] = [];
  actionableMobileHome.on('pageerror', (error) => errors.push(error.message));
  actionableMobileHome.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('status of 503 (Service Unavailable)')) expectedMobileActionableErrors.push(message.text());
    else if (message.type() === 'error') errors.push(message.text());
  });
  actionableMobileHome.on('request', (request) => {
    if (!request.url().includes('/api/')) return;
    actionableMobileMethods.push(request.method());
    if (request.url().includes('/api/messages?') && request.url().includes('link=present')) actionableMobileMessageReads.push(request.method());
  });
  actionableMobileHome.on('response', (response) => {
    if (response.status() < 400) return;
    if (response.status() === 503 && response.url().includes('/api/messages?') && response.url().includes('link=present')) expectedMobileActionableErrors.push(`${response.status()} ${response.url()}`);
    else errors.push(`Unexpected mobile Home HTTP error: ${response.status()} ${response.url()}`);
  });
  emptyHomeTasks = true;
  failNextHomeActionableMessages = true;
  const failedMobileActionableRead = actionableMobileHome.waitForResponse((response) => response.url().includes('/api/messages?') && response.url().includes('link=present'));
  await actionableMobileHome.goto(`${base}/__qa-manager-home`);
  await actionableMobileHome.getByRole('heading', { name: '团队今日重点' }).waitFor();
  assert.equal((await failedMobileActionableRead).status(), 503, 'the isolated mobile actionable-message read fails as injected');
  await actionableMobileHome.getByRole('alert').getByText('待处理消息暂时无法读取，请重试。', { exact: true }).waitFor();
  await actionableMobileHome.getByText('暂时无法确认是否有需要立即处理的任务。', { exact: true }).waitFor();
  assert.equal(await actionableMobileHome.getByText('当前没有需要立即处理的任务。', { exact: true }).count(), 0, 'a failed mobile actionable-message read is not presented as a confirmed empty task list');
  const recoveredMobileActionableRead = actionableMobileHome.waitForResponse((response) => response.url().includes('/api/messages?') && response.url().includes('link=present'));
  await actionableMobileHome.getByRole('button', { name: '重新加载消息', exact: true }).click();
  assert.equal((await recoveredMobileActionableRead).status(), 200, 'the explicit mobile retry recovers the actionable-message read');
  await actionableMobileHome.getByText('当前没有需要立即处理的任务。', { exact: true }).waitFor();
  assert.equal(await actionableMobileHome.getByText('暂时无法确认是否有需要立即处理的任务。', { exact: true }).count(), 0, 'the confirmed empty task state appears only after the retry succeeds');
  assert.deepEqual(actionableMobileMessageReads, ['GET', 'GET'], 'mobile actionable-message failure and retry issue exactly two scoped reads');
  assert.ok(actionableMobileMethods.every((method) => method === 'GET'), 'mobile actionable-message recovery performs no API writes');
  assert.equal(expectedMobileActionableErrors.length, 2, 'only the deliberately injected actionable-message 503 is expected');
  assert.equal(await actionableMobileHome.getByRole('alert').count(), 0, 'successful mobile retry clears the actionable-message alert');
  await actionableMobileHome.close();
  emptyHomeTasks = false;
  homeUnknownStageTimeCount = 0;

  const managerHome = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  managerHome.on('pageerror', (error) => errors.push(error.message));
  managerHome.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await managerHome.goto(`${base}/__qa-manager-home`);
  await managerHome.getByRole('heading', { name: '团队今日重点' }).waitFor();
  const desktopManagerPriorityTasks = managerHome.getByTestId('home-priority-task');
  assert.match(await desktopManagerPriorityTasks.nth(0).getAttribute('aria-label') || '', /^处理消息：/);
  assert.match(await desktopManagerPriorityTasks.nth(1).getAttribute('aria-label') || '', /^查看同步：/);
  assert.match(await desktopManagerPriorityTasks.nth(2).getAttribute('aria-label') || '', /^跟进选题：/);
  assert.match(await desktopManagerPriorityTasks.nth(3).getAttribute('aria-label') || '', /^开始审核：/);
  await managerHome.getByRole('heading', { name: '团队工作概览' }).waitFor();
  const managerCrossModuleOverview = managerHome.getByTestId('home-cross-module-overview');
  assert.equal(await managerCrossModuleOverview.getByTestId('home-cross-module-metric').count(), 5, 'the compact cross-module summary omits topic attention already shown below');
  assert.equal(await managerCrossModuleOverview.getByRole('button', { name: /选题卡点/ }).count(), 0, 'topic attention is not repeated in the cross-module summary');
  await managerCrossModuleOverview.getByRole('button', { name: '待审选题：4 项，进入选题审核' }).waitFor();
  await managerCrossModuleOverview.getByRole('button', { name: '待审稿件：1 项，按现有稿件权限范围' }).waitFor();
  await managerCrossModuleOverview.getByRole('button', { name: '今日待发布：1 项，按现有发布权限范围' }).waitFor();
  await managerCrossModuleOverview.getByRole('button', { name: '同步异常：1 项，失败或未完整的账号' }).waitFor();
  await managerCrossModuleOverview.getByRole('button', { name: '待办消息：1 项，未读且可跟进' }).waitFor();
  await managerCrossModuleOverview.getByText('各项目按当前账号已有权限与可见范围统计。', { exact: true }).waitFor();
  await managerHome.getByText('优先处理待办消息和数据异常，再跟进团队选题与审核事项', { exact: true }).waitFor();
  const desktopMetricHeights = await managerCrossModuleOverview.getByTestId('home-cross-module-metric').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  assert(desktopMetricHeights.every((height) => height <= 44), `cross-module metrics stay compact and touchable: ${desktopMetricHeights.join(',')}`);
  const userMenuButton = managerHome.locator('button[title="打开用户菜单"]');
  await userMenuButton.waitFor();
  assert.equal(await userMenuButton.getAttribute('title'), '打开用户菜单');
  const userMenuVisibleLabel = (await userMenuButton.locator('div.hidden.text-right').innerText()).replace(/\s+/g, ' ').trim();
  assert.equal(await userMenuButton.getAttribute('aria-label'), null, 'the user-menu name comes from its visible account and role text');
  assert.equal(await managerHome.getByRole('button', { name: `${userMenuVisibleLabel} 打开用户菜单`, exact: true }).count(), 1, 'the user-menu name keeps the visible label and explains its purpose');
  assert.equal(await userMenuButton.getAttribute('aria-expanded'), 'false');
  await managerHome.getByText('近 7 天播放变化', { exact: true }).waitFor();
  await managerHome.getByText('粉丝总数', { exact: true }).waitFor();
  await managerHome.getByText('200', { exact: true }).waitFor();
  await managerHome.getByText('120', { exact: true }).waitFor();
  const snapshotMetricProvenance = await managerHome.getByRole('region', { name: '近 7 天播放与粉丝数据' }).locator('p').last().innerText();
  assert.match(snapshotMetricProvenance, /统计口径：近 7 天按北京时间自然日计算，包含当天。/);
  assert.match(snapshotMetricProvenance, /抖音采集快照/);
  assert.match(snapshotMetricProvenance, /精确采集时间未知/);
  assert.match(snapshotMetricProvenance, /粉丝.*观测日期/);
  assert.doesNotMatch(snapshotMetricProvenance, /数据同步于/);
  await managerHome.getByRole('region', { name: '近 7 天播放与粉丝数据' }).scrollIntoViewIfNeeded();
  const snapshotMetricRegion = managerHome.getByRole('region', { name: '近 7 天播放与粉丝数据' });
  assert.ok(await renderedTextContrastRatio(snapshotMetricRegion.locator('dt').first()) >= 4.5, 'the weekly metric label meets text contrast requirements in the light theme');
  assert.ok(await renderedTextContrastRatio(snapshotMetricRegion.locator('p').last()) >= 4.5, 'the weekly metric provenance meets text contrast requirements in the light theme');
  await managerHome.screenshot({ path: '/tmp/xmt-home-weekly-metrics-1440.png', fullPage: false });
  await managerHome.getByText('逾期 1 · 阶段超过 2 天 1 · 截止临近 1', { exact: true }).waitFor();
  await managerHome.getByText('同步未完整', { exact: true }).waitFor();
  await managerHome.getByText('负责人验收账号', { exact: true }).first().waitFor();
  await managerHome.getByText('待审核稿件浏览器验收', { exact: true }).waitFor();
  await managerHome.getByText('待处理消息', { exact: true }).waitFor();
  await managerHome.getByText(actionableManagerMessage.title, { exact: true }).waitFor();
  assert.ok(await managerHome.getByText('待处理消息 1 条', { exact: false }).count() >= 1, 'the manager task summary includes the actionable unread count');
  await managerHome.getByRole('button', { name: '进入选题管理', exact: true }).click();
  await managerHome.waitForURL((url) => url.pathname === '/topics');
  await managerHome.goBack();
  await managerHome.getByRole('heading', { name: '团队今日重点' }).waitFor();
  await managerHome.getByRole('button', { name: /^处理消息：/ }).click();
  await managerHome.waitForURL((url) => url.pathname === '/messages' && url.searchParams.get('filter') === 'actionable');
  assert.equal(await managerHome.getByRole('button', { name: '待处理', exact: true }).getAttribute('aria-pressed'), 'true', 'the Home message action opens the actionable unread filter');
  await managerHome.getByText(actionableManagerMessage.title, { exact: true }).waitFor();
  assert.ok(managerMessageQueries.some((query) => query.read === 'unread' && query.link === 'present'), 'the actionable filter requests only unread messages with business links');
  await managerHome.goto(`${base}/__qa-manager-home`);
  await managerHome.getByRole('heading', { name: '团队今日重点' }).waitFor();
  const managerSync = managerHome.getByRole('button', { name: /^查看同步：/ });
  const managerAudit = managerHome.getByRole('button', { name: /^开始审核：/ }).first();
  const managerProductionReviewTaskButton = managerHome.getByRole('button', { name: /^审核稿件：/ });
  const managerPublishing = managerHome.getByRole('button', { name: /^去发布：/ });
  const managerMessages = managerHome.getByRole('button', { name: /^处理消息：/ });
  await managerPublishing.waitFor();
  await managerSync.waitFor();
  await managerProductionReviewTaskButton.waitFor();
  const managerPublishingHandle = await managerPublishing.elementHandle();
  assert.ok(managerPublishingHandle, 'manager dashboard includes an actionable publishing task');
  const managerMessagesHandle = await managerMessages.elementHandle();
  assert.ok(managerMessagesHandle, 'manager dashboard shows actionable unread messages');
  assert.ok(await managerMessages.evaluate((element, auditElement) => Boolean(element.compareDocumentPosition(auditElement) & Node.DOCUMENT_POSITION_FOLLOWING), await managerAudit.elementHandle()), 'actionable unread messages are prioritized ahead of team review tasks');
  assert.ok(await managerSync.evaluate((element, auditElement) => Boolean(element.compareDocumentPosition(auditElement) & Node.DOCUMENT_POSITION_FOLLOWING), await managerAudit.elementHandle()), 'team sync anomalies are prioritized ahead of review tasks');
  assert.ok(await managerAudit.evaluate((element, publishingElement) => Boolean(element.compareDocumentPosition(publishingElement) & Node.DOCUMENT_POSITION_FOLLOWING), managerPublishingHandle), 'team review actions are shown ahead of publishing tasks for a manager');
  assert.ok(await managerAudit.evaluate((element, manuscriptReviewElement) => Boolean(element.compareDocumentPosition(manuscriptReviewElement) & Node.DOCUMENT_POSITION_FOLLOWING), await managerProductionReviewTaskButton.elementHandle()), 'topic audits are shown before the existing-permission manuscript review queue');
  assert.ok(await managerProductionReviewTaskButton.evaluate((element, publishingElement) => Boolean(element.compareDocumentPosition(publishingElement) & Node.DOCUMENT_POSITION_FOLLOWING), managerPublishingHandle), 'manuscript review is retained ahead of publishing tasks for a manager');
  await managerProductionReviewTaskButton.click();
  await managerHome.waitForURL((url) => url.pathname === '/production/942' && !url.searchParams.has('action'));
  const managerReviewApproveAction = managerHome.getByTestId('production-review-approve');
  await managerReviewApproveAction.waitFor();
  assert.equal(await managerReviewApproveAction.innerText(), '审核通过', 'an authorized review task focuses the existing approval action without executing it');
  assert.equal(await managerReviewApproveAction.evaluate((element) => document.activeElement === element), true, 'the authorized review deep link moves keyboard focus to the approval action');
  assert.equal(await managerHome.locator('.ProseMirror').first().getAttribute('contenteditable'), 'true', 'the manager retains authorized edit access while opening the review action');
  assert.equal(managerProductionReviewStatus, 'review', 'opening a review task does not approve the production');
  assert.equal(managerProductionApprovalWrites, 0, 'opening a review task performs no approval write');
  const managerApprovalResponse = managerHome.waitForResponse((response) => response.request().method() === 'PUT'
    && new URL(response.url()).pathname === '/api/workflow/production/942'
    && response.status() === 200);
  await managerReviewApproveAction.click();
  await managerApprovalResponse;
  assert.equal(managerProductionReviewStatus, 'approved', 'the focused approval action performs the existing authorized status transition');
  assert.equal(managerProductionApprovalWrites, 1, 'an explicit approval click writes exactly once');
  assert.equal(managerProductionReviewContent, '<p>隔离验收稿件正文</p>', 'review-only approval does not alter the manuscript body');
  await managerHome.goto(`${base}/__qa-manager-home`);
  await managerHome.getByRole('heading', { name: '团队今日重点' }).waitFor();
  await managerSync.click();
  await managerHome.waitForURL((url) => url.pathname === '/analytics/creator-center' && url.searchParams.get('account_id') === managerSyncAccountUid);
  await managerHome.getByRole('heading', { name: '抖音数据驾驶舱' }).waitFor();
  assert.ok(creatorDashboardAccountQueries.filter((accountUid) => accountUid === managerSyncAccountUid).length >= 2, 'the sync action opens the matching account dashboard and sync history');
  await managerHome.goto(`${base}/__qa-manager-home`);
  await managerHome.getByRole('heading', { name: '团队今日重点' }).waitFor();
  await managerPublishing.click();
  await managerHome.waitForURL((url) => url.pathname === '/publishing/941');
  await managerHome.close();

  const darkManagerHome = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await darkManagerHome.goto(`${base}/__qa-manager-home?theme=dark`);
  await darkManagerHome.getByText('近 7 天播放变化', { exact: true }).waitFor();
  const darkWeeklyMetricRegion = darkManagerHome.getByRole('region', { name: '近 7 天播放与粉丝数据' });
  const darkWeeklyMetricProvenance = await darkWeeklyMetricRegion.locator('p').last().innerText();
  assert.match(darkWeeklyMetricProvenance, /统计口径：近 7 天按北京时间自然日计算，包含当天。/);
  assert.ok(await renderedTextContrastRatio(darkWeeklyMetricRegion.locator('dt').first()) >= 4.5, 'the weekly metric label meets text contrast requirements in the dark theme');
  assert.ok(await renderedTextContrastRatio(darkWeeklyMetricRegion.locator('p').last()) >= 4.5, 'the weekly metric provenance meets text contrast requirements in the dark theme');
  await darkManagerHome.screenshot({ path: '/tmp/xmt-home-weekly-metrics-dark-1440.png', fullPage: false });
  await darkManagerHome.close();

  const officialMetricsHome = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await officialMetricsHome.goto(`${base}/__qa-manager-home?metrics=official`);
  await officialMetricsHome.getByText('近 7 天播放变化', { exact: true }).waitFor();
  const officialMetricProvenance = await officialMetricsHome.getByRole('region', { name: '近 7 天播放与粉丝数据' }).locator('p').last().innerText();
  assert.match(officialMetricProvenance, /官方逐日数据/);
  assert.match(officialMetricProvenance, /采集时间：2026\/10\/9 18:30/);
  assert.doesNotMatch(officialMetricProvenance, /采集时间：未知/);
  assert.match(officialMetricProvenance, /数据截至：/);
  await officialMetricsHome.close();

  const officialMetricsUnknownTimeHome = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await officialMetricsUnknownTimeHome.goto(`${base}/__qa-manager-home?metrics=official-no-time`);
  await officialMetricsUnknownTimeHome.getByText('近 7 天播放变化', { exact: true }).waitFor();
  const officialUnknownTimeProvenance = await officialMetricsUnknownTimeHome.getByRole('region', { name: '近 7 天播放与粉丝数据' }).locator('p').last().innerText();
  assert.match(officialUnknownTimeProvenance, /官方逐日数据/);
  assert.match(officialUnknownTimeProvenance, /采集时间：未知/);
  assert.match(officialUnknownTimeProvenance, /数据截至：/);
  assert.match(officialUnknownTimeProvenance, /粉丝数是最近一次可用的总量.*观测日期：未知/);
  await officialMetricsUnknownTimeHome.close();

  const creatorDashboardPage = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const expectedCreatorDashboardErrors: string[] = [];
  const creatorDashboardApiMethods: string[] = [];
  creatorDashboardPage.on('pageerror', (error) => errors.push(error.message));
  creatorDashboardPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedCreatorDashboardErrors.push(message.text());
    else errors.push(message.text());
  });
  creatorDashboardPage.on('request', (request) => {
    if (request.url().includes('/api/')) creatorDashboardApiMethods.push(request.method());
  });
  creatorDashboardPage.on('response', (response) => {
    if (response.status() < 400) return;
    if (response.status() === 503 && ['/api/creator-agent/douyin/dashboard', '/api/creator-agent/douyin/sync-logs', '/api/creator-agent/status'].some((path) => response.url().includes(path))) expectedCreatorDashboardErrors.push(`${response.status()} ${response.url()}`);
    else errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  await creatorDashboardPage.goto(`${base}/__qa-manager-home`);
  await creatorDashboardPage.getByRole('heading', { name: '团队今日重点' }).waitFor();
  failNextCreatorDashboard = true;
  failNextCreatorSyncLogs = true;
  failNextCreatorAgentStatus = true;
  await creatorDashboardPage.goto(`${base}/analytics/creator-center?account_id=${encodeURIComponent(managerSyncAccountUid)}`);
  await creatorDashboardPage.getByText('抖音数据驾驶舱暂不可用，请重试。', { exact: true }).waitFor();
  assert.equal(await creatorDashboardPage.getByText('Internal Server Error', { exact: true }).count(), 0, 'dashboard does not expose the raw technical response');
  await creatorDashboardPage.getByRole('button', { name: '重新加载数据', exact: true }).click();
  await creatorDashboardPage.getByRole('heading', { name: '抖音数据驾驶舱' }).waitFor();
  await creatorDashboardPage.getByText('负责人验收账号', { exact: true }).first().waitFor();
  await creatorDashboardPage.getByText('采集端在线', { exact: true }).first().waitFor();
  await creatorDashboardPage.getByText('尚无同步记录；首次同步后会显示在这里。', { exact: true }).waitFor();
  const creatorProfileImages = creatorDashboardPage.locator('img[alt$=" avatar"], img[alt$=" mini avatar"]');
  assert.equal(await creatorProfileImages.count(), 2, 'the creator profile card exposes its portrait and compact avatar images');
  for (let index = 0; index < await creatorProfileImages.count(); index += 1) {
    const dimensions = await creatorProfileImages.nth(index).evaluate((element) => ({
      width: element.getAttribute('width'),
      height: element.getAttribute('height'),
      aspectRatio: getComputedStyle(element).aspectRatio,
      loading: element.loading,
    }));
    assert.ok(Number(dimensions.width) > 0 && Number(dimensions.height) > 0, `creator image ${index + 1} reserves its intrinsic dimensions`);
    assert.notEqual(dimensions.aspectRatio, 'auto', `creator image ${index + 1} declares a stable aspect ratio`);
    assert.notEqual(dimensions.loading, 'lazy', `above-the-fold creator image ${index + 1} loads eagerly`);
  }
  const creatorProfileGlow = creatorDashboardPage.locator('[style*="--behind-glow-color"]').first();
  for (const theme of ['light', 'dark'] as const) {
    await creatorDashboardPage.evaluate((nextTheme) => localStorage.setItem('xmt_theme', nextTheme), theme);
    await creatorDashboardPage.reload();
    await creatorDashboardPage.getByRole('heading', { name: '抖音数据驾驶舱' }).waitFor();
    const glow = await creatorProfileGlow.evaluate((element) => {
      const token = getComputedStyle(document.documentElement).getPropertyValue('--xmt-cyan-rgb').trim();
      const overlay = element.querySelector('.pointer-events-none');
      const background = overlay ? getComputedStyle(overlay).backgroundImage : '';
      const renderedColor = background.match(/rgba?\(([^)]+)\)/)?.[1]?.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      return { token: token.split(/\s+/).map(Number), configuredColor: element.style.getPropertyValue('--behind-glow-color'), renderedColor };
    });
    assert.equal(glow.configuredColor, 'rgb(var(--xmt-cyan-rgb) / 0.38)', `${theme} creator profile glow uses the theme token`);
    assert.deepEqual(glow.renderedColor, glow.token, `${theme} creator profile glow resolves to the active cyan token`);
  }
  await creatorDashboardPage.evaluate(() => localStorage.setItem('xmt_theme', 'light'));
  await creatorDashboardPage.reload();
  await creatorDashboardPage.getByRole('heading', { name: '抖音数据驾驶舱' }).waitFor();
  const creatorWorksButton = creatorDashboardPage.getByRole('button', { name: '查看作品', exact: true });
  for (const width of [320, 390, 1440]) {
    await creatorDashboardPage.setViewportSize({ width, height: 844 });
    const creatorWorksButtonLayout = await creatorWorksButton.evaluate((element) => {
      const button = element.getBoundingClientRect();
      const card = element.closest('[aria-label="创作者账号概览"]')?.getBoundingClientRect();
      return {
        height: button.height,
        whiteSpace: getComputedStyle(element).whiteSpace,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        buttonRight: button.right,
        cardRight: card?.right ?? 0,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    assert.ok(creatorWorksButtonLayout.height >= 40, `the creator works action is at least 40px high at ${width}px`);
    assert.equal(creatorWorksButtonLayout.whiteSpace, 'nowrap', `the creator works action stays on one line at ${width}px`);
    assert.ok(creatorWorksButtonLayout.scrollWidth <= creatorWorksButtonLayout.clientWidth, `the creator works label fits within its button at ${width}px`);
    assert.ok(creatorWorksButtonLayout.buttonRight <= creatorWorksButtonLayout.cardRight, `the creator works action stays within its card at ${width}px`);
    assert.ok(creatorWorksButtonLayout.documentWidth <= creatorWorksButtonLayout.viewportWidth, `the creator dashboard has no horizontal overflow at ${width}px`);
  }
  assert.equal(await creatorDashboardPage.getByText('采集端离线', { exact: true }).count(), 0, 'a failed status read does not claim the collector is offline');
  failNextCreatorDashboard = true;
  failNextCreatorSyncLogs = true;
  failNextCreatorAgentStatus = true;
  await creatorDashboardPage.getByRole('button', { name: '刷新数据', exact: true }).click();
  await creatorDashboardPage.getByText('驾驶舱刷新失败，仍显示最近一次成功数据：抖音数据驾驶舱暂不可用，请重试。', { exact: true }).waitFor();
  assert.equal(await creatorDashboardPage.getByText('Internal Server Error', { exact: true }).count(), 0, 'dashboard refresh recovery does not expose the raw technical response');
  await creatorDashboardPage.getByText('采集端状态暂不可用', { exact: true }).first().waitFor();
  await creatorDashboardPage.getByText('同步记录读取失败；当前同步指标尚未确认。请点击页面上方“刷新数据”重试。', { exact: true }).waitFor();
  await creatorDashboardPage.getByText('负责人验收账号', { exact: true }).first().waitFor();
  assert.equal(await creatorDashboardPage.getByText('采集端离线', { exact: true }).count(), 0, 'a refresh failure retains the existing collector identity without presenting unknown as offline');
  await creatorDashboardPage.setViewportSize({ width: 320, height: 720 });
  const dashboardRefreshAlert = creatorDashboardPage.getByRole('alert').filter({ hasText: '驾驶舱刷新失败，仍显示最近一次成功数据：' });
  const dashboardRetryButton = dashboardRefreshAlert.getByRole('button', { name: '重新加载', exact: true });
  await dashboardRetryButton.scrollIntoViewIfNeeded();
  const dashboardRetryBox = await dashboardRetryButton.boundingBox();
  assert.ok(dashboardRetryBox && dashboardRetryBox.height >= 40, 'the inline dashboard retry action is at least 40px high at 320px');
  await creatorDashboardPage.getByRole('button', { name: '刷新数据', exact: true }).focus();
  await creatorDashboardPage.keyboard.press('Tab');
  assert.equal(await dashboardRetryButton.evaluate((element) => element === document.activeElement), true, 'keyboard Tab reaches the inline dashboard retry action');
  const dashboardRetryFocus = await dashboardRetryButton.evaluate((element) => ({
    visible: element.matches(':focus-visible'),
    outlineStyle: getComputedStyle(element).outlineStyle,
    outlineWidth: getComputedStyle(element).outlineWidth,
  }));
  assert.equal(dashboardRetryFocus.visible, true, 'keyboard focus on the retry action is visually exposed');
  assert.equal(dashboardRetryFocus.outlineStyle, 'solid', 'keyboard focus uses the shared solid focus outline');
  assert.equal(dashboardRetryFocus.outlineWidth, '2px', 'keyboard focus outline remains clearly visible at 320px');
  const dashboardNarrowLayout = await creatorDashboardPage.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(dashboardNarrowLayout.scrollWidth <= dashboardNarrowLayout.width + 1, 'the dashboard error recovery state has no horizontal overflow at 320px');
  await creatorDashboardPage.setViewportSize({ width: 1440, height: 960 });
  await creatorDashboardPage.getByRole('button', { name: '刷新数据', exact: true }).click();
  await creatorDashboardPage.getByText('采集端在线', { exact: true }).first().waitFor();
  await creatorDashboardPage.getByText('尚无同步记录；首次同步后会显示在这里。', { exact: true }).waitFor();
  assert.equal(await creatorDashboardPage.getByRole('alert').count(), 0, 'a successful dashboard refresh clears all three independent errors');

  const creatorAgentPanel = creatorDashboardPage.getByRole('heading', { name: 'Creator Agent' }).locator('..');
  await creatorAgentPanel.getByText('采集设备 A', { exact: true }).waitFor();
  const creatorAgentFields = creatorAgentPanel.locator('div.grid > div');
  assert.match(await creatorAgentFields.nth(1).innerText(), /浏览器 A.*A-浏览器版本/s, 'account A shows its own browser details');
  assert.match(await creatorAgentFields.nth(3).innerText(), /抖音登录\s+未确认/, 'account A shows its own login state');

  failNextCreatorAgentStatus = true;
  await creatorDashboardPage.evaluate((nextAccountId) => {
    history.pushState({}, '', `/analytics/creator-center?account_id=${encodeURIComponent(nextAccountId)}`);
    dispatchEvent(new PopStateEvent('popstate'));
  }, managerSecondarySyncAccountUid);
  await creatorDashboardPage.getByText('负责人验收账号 B', { exact: true }).waitFor();
  await creatorDashboardPage.getByText('采集端状态暂不可用', { exact: true }).first().waitFor();
  assert.equal(await creatorAgentPanel.getByText('采集设备 A', { exact: true }).count(), 0, 'account B does not show account A device after the status request fails');
  assert.equal(await creatorAgentPanel.getByText('浏览器 A', { exact: true }).count(), 0, 'account B does not show account A browser after the status request fails');
  assert.equal(await creatorAgentPanel.getByText('A-浏览器版本', { exact: true }).count(), 0, 'account B does not show account A browser version after the status request fails');
  assert.equal(await creatorAgentPanel.getByText('A-兼容状态', { exact: true }).count(), 0, 'account B does not show account A compatibility after the status request fails');
  assert.equal(await creatorAgentFields.nth(3).innerText(), '抖音登录\n暂不可用', 'account B login state is unavailable when its status request fails');
  assert.equal(await creatorDashboardPage.getByText('采集端离线', { exact: true }).count(), 0, 'a failed status request does not convert an unmatched account into offline');

  await creatorDashboardPage.getByRole('button', { name: '刷新数据', exact: true }).click();
  await creatorDashboardPage.getByText('尚未绑定采集端', { exact: true }).first().waitFor();
  assert.equal(await creatorAgentPanel.getByText('采集设备 A', { exact: true }).count(), 0, 'a successful status read without a B agent does not retain account A device');
  assert.equal(await creatorAgentFields.nth(0).innerText(), '设备\n尚未绑定采集端', 'an account without a matching agent is shown as not bound');
  assert.equal(await creatorAgentFields.nth(3).innerText(), '抖音登录\n未确认', 'an account without a matching agent has no inherited login state');

  creatorAgentStatusAgents = [{ ...managerCreatorAgentA, id: 2, device_id: 'manager-device-b', device_name: '采集设备 B', browser_type: '浏览器 B', browser_version: 'B-浏览器版本', browser_login_status: 'valid', browser_compatibility: 'B-兼容状态', account_id: managerSecondarySyncAccountUid, online: 0 }];
  await creatorDashboardPage.getByRole('button', { name: '刷新数据', exact: true }).click();
  await creatorAgentPanel.getByText('采集设备 B', { exact: true }).waitFor();
  await creatorAgentPanel.getByText('采集端离线', { exact: true }).waitFor();
  assert.equal(await creatorAgentPanel.getByText('采集设备 A', { exact: true }).count(), 0, 'account B displays only its own collector after status recovery');
  assert.match(await creatorAgentFields.nth(1).innerText(), /浏览器 B.*B-浏览器版本/s, 'account B displays its own browser details');
  assert.equal(await creatorAgentFields.nth(3).innerText(), '抖音登录\n正常', 'account B displays its own login state while its collector is offline');

  creatorAgentStatusAgents = creatorAgentStatusAgents.map((agent) => ({ ...agent, online: 1 }));
  await creatorDashboardPage.getByRole('button', { name: '刷新数据', exact: true }).click();
  await creatorAgentPanel.getByText('采集端在线', { exact: true }).waitFor();
  creatorAgentStatusAgents = [managerCreatorAgentA];

  assert.ok(expectedCreatorDashboardErrors.length >= 6, 'the only expected Creator Dashboard errors are the injected 503s and their response records');
  assert.ok(creatorDashboardApiMethods.every((method) => method === 'GET'), 'dashboard failure and retry recovery perform no API writes');
  await creatorDashboardPage.close();

  const managerMobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  managerMobile.on('pageerror', (error) => errors.push(error.message));
  managerMobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await managerMobile.goto(`${base}/__qa-manager-home`);
  managerProductionReviewStatus = 'review';
  managerProductionReviewContent = '<p>隔离验收稿件正文</p>';
  managerProductionApprovalWrites = 0;
  await managerMobile.getByRole('heading', { name: '团队今日重点' }).waitFor();
  const managerMobileOverview = managerMobile.getByTestId('home-cross-module-overview');
  assert.equal(await managerMobileOverview.getByTestId('home-cross-module-metric').count(), 5, 'mobile keeps the same compact cross-module queues without a duplicate topic metric');
  assert.equal(await managerMobileOverview.getByRole('button', { name: /选题卡点/ }).count(), 0);
  await managerMobileOverview.getByRole('button', { name: '待办消息：1 项，未读且可跟进' }).waitFor();
  const managerQuickActions = managerMobile.getByTestId('mobile-home-quick-action');
  assert(await managerQuickActions.count() >= 3, 'the management mobile Home renders its available quick actions');
  const quickActionWidths = () => managerQuickActions.evaluateAll((elements) => elements.map((element) => {
    const button = element.getBoundingClientRect();
    const wrapper = element.parentElement?.getBoundingClientRect();
    return { button: button.width, wrapper: wrapper?.width ?? 0 };
  }));
  assert((await quickActionWidths()).every(({ button, wrapper }) => button >= 150 && wrapper >= 150), 'quick actions fill their two-column cells at 390px instead of shrinking to their labels');
  await managerMobile.setViewportSize({ width: 320, height: 844 });
  assert((await quickActionWidths()).every(({ button, wrapper }) => button >= 125 && wrapper >= 125), 'quick actions remain comfortably wide in the 320px layout');
  assert(await managerMobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the 320px quick-action layout has no horizontal overflow');
  await managerMobile.setViewportSize({ width: 390, height: 844 });
  assert.equal(await managerMobile.getByText('近 7 天播放变化', { exact: true }).count(), 0, 'the separate MobileHome keeps its current scope; this optional block belongs to the desktop Home screen');
  const managerPriorityTasks = managerMobile.getByTestId('mobile-home-task');
  await managerPriorityTasks.nth(2).waitFor();
  const managerFirstScreenTaskText = await managerPriorityTasks.allInnerTexts();
  assert.match(managerFirstScreenTaskText[0], /待处理消息[\s\S]*需要确认发布安排/, 'management mobile Home prioritizes actionable messages first');
  assert.match(managerFirstScreenTaskText[1], /同步异常[\s\S]*负责人验收账号/, 'management mobile Home prioritizes sync anomalies second');
  assert.match(managerFirstScreenTaskText[2], /已逾期[\s\S]*选题离开确认对比度验收/, 'management mobile Home follows with an overdue team topic');
  for (const [index, action] of ['处理消息', '查看同步', '跟进选题'].entries()) {
    assert.ok(await renderedTextContrastRatio(managerPriorityTasks.nth(index).getByText(action, { exact: true })) >= 4.5, `management task action ${action} meets light-theme contrast requirements`);
  }
  const thirdManagerTaskBottom = await managerPriorityTasks.nth(2).evaluate((element) => element.getBoundingClientRect().bottom);
  const managerNavigationTop = await managerMobile.getByRole('navigation', { name: '移动主导航' }).evaluate((element) => element.getBoundingClientRect().top);
  assert(thirdManagerTaskBottom <= managerNavigationTop, 'three prioritized management tasks fit above the fixed mobile navigation');
  await managerMobile.getByRole('heading', { name: '内容阶段' }).waitFor();
  await managerMobile.getByRole('button', { name: '4 灵感池' }).waitFor();
  await managerMobile.getByRole('button', { name: '4 待审' }).waitFor();
  await managerMobile.getByRole('button', { name: '5 复盘' }).waitFor();
  const managerStageButtons = managerMobile.getByRole('list', { name: '内容生产各阶段' }).getByRole('button');
  for (const button of await managerStageButtons.all()) {
    const visibleName = (await button.innerText()).split(/\s+/).filter(Boolean).join(' ');
    assert.equal(await button.getAttribute('aria-label'), null, `stage button “${visibleName}” derives its accessible name from its visible count and label`);
    await managerMobile.getByRole('button', { name: visibleName, exact: true }).waitFor();
  }
  await managerMobile.screenshot({ path: '/tmp/xmt-home-priority-manager-390.png', fullPage: false });
  const pendingStageNavigation = managerMobile.waitForURL((url) => url.pathname === '/topics' && url.searchParams.get('status') === 'pending');
  await managerMobile.getByRole('button', { name: '4 待审' }).click();
  await pendingStageNavigation;
  await managerMobile.goto(`${base}/__qa-manager-home`);
  await managerMobile.getByRole('heading', { name: '团队今日重点' }).waitFor();
  const managerTaskToggle = managerMobile.getByRole('button', { name: '查看剩余 3 项', exact: true });
  assert.equal(await managerTaskToggle.getAttribute('aria-expanded'), 'false', 'the mobile priority-task list starts collapsed');
  assert.equal(await managerTaskToggle.getAttribute('aria-controls'), 'mobile-home-priority-tasks', 'the collapsed toggle identifies the controlled task list');
  assert.equal(await managerMobile.locator('#mobile-home-priority-tasks').count(), 1, 'the controlled task list has the referenced stable id');
  await managerTaskToggle.click();
  const collapseManagerTasks = managerMobile.getByRole('button', { name: '收起任务', exact: true });
  assert.equal(await collapseManagerTasks.getAttribute('aria-expanded'), 'true', 'the mobile priority-task list reports expanded after opening');
  assert.equal(await collapseManagerTasks.getAttribute('aria-controls'), 'mobile-home-priority-tasks', 'the expanded toggle controls the same task list');
  await collapseManagerTasks.click();
  assert.equal(await managerPriorityTasks.count(), 3, 'collapsing the mobile priority-task list restores the first three tasks');
  assert.equal(await managerMobile.getByRole('button', { name: '查看剩余 3 项', exact: true }).getAttribute('aria-expanded'), 'false', 'the mobile priority-task toggle reports collapsed after closing');
  await managerMobile.getByRole('button', { name: '查看剩余 3 项', exact: true }).click();
  await managerPriorityTasks.nth(5).waitFor();
  const managerTaskText = await managerPriorityTasks.allInnerTexts();
  assert.match(managerTaskText[3], /待审核选题/);
  assert.match(managerTaskText[4], /待审核稿件/);
  assert.match(managerTaskText[5], /今日发布/);
  await managerMobile.getByText('负责人验收账号', { exact: true }).waitFor();
  await managerMobile.getByRole('button', { name: /待审核稿件浏览器验收.*v1\.0/ }).waitFor();
  assert(await managerMobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the manager Home fits a 390px viewport without horizontal overflow');
  await managerMobile.goto(`${base}/__qa-manager-home?tasks=attention-only`);
  await managerMobile.getByRole('heading', { name: '团队今日重点' }).waitFor();
  const attentionOnlyTasks = managerMobile.getByTestId('mobile-home-task');
  assert.equal(await attentionOnlyTasks.count(), 3, 'attention-only Home initially keeps the first three priority tasks visible');
  assert.match(await attentionOnlyTasks.nth(2).innerText(), /移动首页第 3 条关注事项/);
  await managerMobile.getByRole('button', { name: '查看剩余 3 项', exact: true }).click();
  assert.equal(await attentionOnlyTasks.count(), 6, 'expanding attention-only Home reveals the full six-task cap');
  await attentionOnlyTasks.nth(3).getByText('移动首页第 4 条关注事项', { exact: true }).waitFor();
  await attentionOnlyTasks.nth(5).getByText('移动首页第 6 条关注事项', { exact: true }).waitFor();
  assert.equal(await managerMobile.getByText('移动首页第 7 条关注事项', { exact: true }).count(), 0, 'the mobile Home respects its documented maximum of six tasks when the server returns eight attention topics');
  assert(await managerMobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'expanded attention-only tasks fit a 390px viewport without horizontal overflow');
  await managerMobile.goto(`${base}/__qa-manager-home`);
  await managerMobile.getByRole('heading', { name: '团队今日重点' }).waitFor();
  await managerMobile.getByRole('button', { name: '查看剩余 3 项', exact: true }).click();
  await managerMobile.getByRole('button', { name: /待审核稿件浏览器验收.*v1\.0/ }).click();
  await managerMobile.waitForURL((url) => url.pathname === '/production/942' && url.searchParams.get('action') === 'review');
  await managerMobile.getByRole('button', { name: '保存修改', exact: true }).waitFor();
  const mobileApproval = managerMobile.waitForResponse((response) => response.request().method() === 'PUT'
    && new URL(response.url()).pathname === '/api/workflow/production/942'
    && response.status() === 200);
  await managerMobile.getByRole('button', { name: '审核通过', exact: true }).click();
  await mobileApproval;
  await managerMobile.getByText('审核已通过', { exact: true }).waitFor();
  assert.equal(managerProductionApprovalWrites, 1, 'the mobile Home review task performs one scoped approval write after the editor flush');
  assert.equal(managerProductionReviewStatus, 'approved', 'the mobile approval is confirmed by the isolated server fixture');
  await managerMobile.getByText(/这份稿件已不在待审核状态/).waitFor();
  await managerMobile.getByText('待审核任务已结束：当前页面只读。', { exact: true }).waitFor();
  assert.equal(await managerMobile.getByRole('button', { name: '审核通过', exact: true }).count(), 0, 'a completed review task no longer offers approval');
  assert.equal(await managerMobile.getByRole('button', { name: '提交审核', exact: true }).count(), 0, 'a stale review deep link cannot accidentally submit a new review');
  await managerMobile.waitForFunction(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'false');
  assert.equal(await managerMobile.locator('.ProseMirror').getAttribute('contenteditable'), 'false', 'a completed review deep link also becomes read-only instead of silently saving edits');
  await managerMobile.goto(`${base}/__qa-manager-home`);
  await managerMobile.getByRole('button', { name: /负责人验收账号.*部分同步失败.*2 项未同步/ }).click();
  await managerMobile.waitForURL((url) => url.pathname === '/analytics/creator-center' && url.searchParams.get('account_id') === managerSyncAccountUid);
  await managerMobile.getByRole('heading', { name: '抖音数据驾驶舱' }).waitFor();
  await managerMobile.goto(`${base}/__qa-manager-home`);
  await managerMobile.getByText(actionableManagerMessage.title, { exact: true }).waitFor();
  assert(await managerMobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the manager Home fits a 390px viewport without horizontal overflow');
  await managerMobile.screenshot({ path: '/tmp/xmt-home-actionable-messages-manager-390.png', fullPage: false });
  await managerMobile.getByTestId('mobile-home-task').first().click();
  await managerMobile.waitForURL((url) => url.pathname === '/messages' && url.searchParams.get('filter') === 'actionable');
  await managerMobile.close();

  const productionViewerMobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  productionViewerMobile.on('pageerror', (error) => errors.push(error.message));
  productionViewerMobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await productionViewerMobile.goto(`${base}/__qa-production-viewer`);
  await productionViewerMobile.getByRole('heading', { name: '当前账号无法打开这份稿件', exact: true }).waitFor();
  assert.equal(new URL(productionViewerMobile.url()).pathname, '/production/942', 'the read-only mobile route stays on the requested manuscript');
  assert.equal(await productionViewerMobile.getByRole('button', { name: '审核通过', exact: true }).count(), 0, 'a read-only account cannot expose the production approval action through a direct link');
  assert.equal(managerProductionApprovalWrites, 1, 'opening the same review task without production permission does not add a server write');
  await productionViewerMobile.close();

  const creatorMobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  creatorMobile.on('pageerror', (error) => errors.push(error.message));
  creatorMobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await creatorMobile.goto(`${base}/__qa-creator-home`);
  await creatorMobile.getByRole('heading', { name: '我的今日任务' }).waitFor();
  assert.equal(await creatorMobile.getByTestId('home-cross-module-overview').count(), 0, 'the manager-only cross-module overview is not exposed in a creator Home');
  assert.equal(await creatorMobile.getByTestId('mobile-home-active-topic-summary').innerText(), '共 2 项 · 展示最近 1 项', 'the creator Home shows the exact personal in-progress total separately from its bounded preview');
  const creatorPriorityTasks = creatorMobile.getByTestId('mobile-home-task');
  await creatorPriorityTasks.nth(2).waitFor();
  const creatorTaskText = await creatorPriorityTasks.allInnerTexts();
  assert.match(creatorTaskText[0], /我的稿件[\s\S]*我的待续写稿件[\s\S]*继续写稿/, 'creator Home puts the creator\'s own draft first');
  const creatorDraftSaveStatus = creatorMobile.getByTestId('mobile-home-draft-save-status').first();
  await creatorDraftSaveStatus.waitFor();
  assert.equal(await creatorDraftSaveStatus.innerText(), '保存状态未确认', 'a server update timestamp does not claim a save was confirmed in this browser session');
  const creatorDraftTask = creatorPriorityTasks.filter({ hasText: '我的待续写稿件' });
  await creatorDraftTask.waitFor();
  await creatorMobile.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('writeConsistency:saved', 'production:943@v1.1', { userId: 95, source: 'browser-test' });
  });
  assert.equal(await creatorDraftSaveStatus.innerText(), '保存状态未确认', 'save state from another account is not shown on the personal draft');
  await creatorMobile.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('editor:synced', 'production:943@v1.1', { userId: 96, source: 'browser-test' });
  });
  assert.equal(await creatorDraftSaveStatus.innerText(), '保存状态未确认', 'a collaboration sync event alone is not treated as persisted save confirmation');
  await creatorMobile.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('editor:local-change', 'production:943@v1.1', { userId: 96, source: 'browser-test' });
  });
  await creatorMobile.getByText('有修改待保存', { exact: true }).waitFor();
  await creatorMobile.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('yjs:update', 'production:943@v1.1', { userId: 96, source: 'browser-test' });
  });
  await creatorMobile.getByText('同步中，保存结果未确认', { exact: true }).waitFor();
  await creatorMobile.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('writeConsistency:save', 'production:943@v1.1', { userId: 96, source: 'browser-test' });
  });
  await creatorMobile.getByText('正在保存', { exact: true }).waitFor();
  await creatorMobile.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('writeConsistency:saved', 'production:943@v1.1', { userId: 96, source: 'browser-test' });
  });
  await creatorMobile.getByText('本次会话已确认保存', { exact: true }).waitFor();
  await creatorMobile.evaluate(async () => {
    const { emitEditorState } = await import('/src/editor/state/editorStateEventBus.ts');
    emitEditorState('conflict:event', 'production:943@v1.1', { userId: 96, source: 'browser-test' });
  });
  await creatorMobile.getByText('保存异常待确认', { exact: true }).waitFor();
  assert.match(creatorTaskText[1], /截止临近[\s\S]*我的临近选题/, 'creator Home puts a nearing deadline after personal drafts');
  assert.match(creatorTaskText[2], /今日发布[\s\S]*今日待发布验收/, 'creator Home keeps the publishing action in the first task group');
  const thirdCreatorTaskBottom = await creatorPriorityTasks.nth(2).evaluate((element) => element.getBoundingClientRect().bottom);
  const creatorNavigationTop = await creatorMobile.getByRole('navigation', { name: '移动主导航' }).evaluate((element) => element.getBoundingClientRect().top);
  assert(thirdCreatorTaskBottom <= creatorNavigationTop, 'three prioritized creator tasks fit above the fixed mobile navigation');
  assert(await creatorMobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the creator Home fits a 390px viewport without horizontal overflow');
  await creatorMobile.getByRole('button', { name: /我的待续写稿件.*继续写稿/ }).click();
  await creatorMobile.waitForURL((url) => url.pathname === '/production/943');
  await creatorMobile.close();

  const weeklyMetricsRetry = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const expectedWeeklyMetricsErrors: string[] = [];
  const weeklyMetricsRequests: string[] = [];
  weeklyMetricsRetry.on('pageerror', (error) => errors.push(error.message));
  weeklyMetricsRetry.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedWeeklyMetricsErrors.push(message.text());
    else errors.push(message.text());
  });
  weeklyMetricsRetry.on('request', (request) => {
    if (request.url().includes('/api/creator-agent/douyin/dashboard')) weeklyMetricsRequests.push(request.method());
  });
  weeklyMetricsRetry.on('response', (response) => {
    if (response.url().includes('/api/creator-agent/douyin/dashboard') && response.status() === 503) expectedWeeklyMetricsErrors.push(`${response.status()} ${response.url()}`);
    else if (response.status() >= 400) errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  failNextCreatorDashboard = true;
  await weeklyMetricsRetry.goto(`${base}/__qa-manager-home`);
  await weeklyMetricsRetry.getByText('运营数据暂时无法读取，请重试。', { exact: true }).waitFor();
  await weeklyMetricsRetry.getByRole('button', { name: '重试运营数据', exact: true }).click();
  await weeklyMetricsRetry.getByText('近 7 天播放变化', { exact: true }).waitFor();
  assert.deepEqual(weeklyMetricsRequests, ['GET', 'GET'], 'weekly metric recovery performs only its failed read and one explicit retry');
  assert.ok(expectedWeeklyMetricsErrors.length >= 1, 'only the deliberately injected weekly metric dashboard 503 is expected');
  await weeklyMetricsRetry.close();

  const metricsEmptyHome = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  hideCreatorMetricsForHome = true;
  await metricsEmptyHome.goto(`${base}/__qa-manager-home`);
  await metricsEmptyHome.getByText('最近变化验收稿件', { exact: true }).waitFor();
  assert.equal(await metricsEmptyHome.getByText('近 7 天播放变化', { exact: true }).count(), 0, 'missing period and fan values are not presented as zeroes');
  assert.equal(await metricsEmptyHome.getByText('粉丝总数', { exact: true }).count(), 0, 'the optional metrics block is hidden when no trustworthy value is available');
  hideCreatorMetricsForHome = false;
  await metricsEmptyHome.close();

  const attentionRetry = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const expectedAttentionErrors: string[] = [];
  attentionRetry.on('pageerror', (error) => errors.push(error.message));
  attentionRetry.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedAttentionErrors.push(message.text());
    else errors.push(message.text());
  });
  attentionRetry.on('response', (response) => {
    if (response.url().endsWith('/api/dashboard/home-attention') && response.status() === 503) expectedAttentionErrors.push(`${response.status()} ${response.url()}`);
    else if (response.status() >= 400) errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  failNextHomeAttention = true;
  await attentionRetry.goto(`${base}/__qa-home`);
  await attentionRetry.getByText('工作台摘要暂时无法读取，请重试。', { exact: true }).waitFor();
  assert.equal(await attentionRetry.getByRole('alert').count(), 1, 'attention summary failure is visible and isolated');
  await attentionRetry.getByRole('button', { name: '重新加载', exact: true }).click();
  await attentionRetry.getByText('已超过截止时间 · 2026/10/07', { exact: true }).waitFor();
  await attentionRetry.getByText('今日发布', { exact: true }).waitFor();
  await attentionRetry.getByText('今日待发布验收 · 抖音', { exact: true }).waitFor();
  assert.equal(await attentionRetry.getByRole('alert').count(), 0, 'retry clears the attention error after the read succeeds');
  assert.ok(expectedAttentionErrors.length >= 1, 'only the deliberately injected dashboard read 503 is expected');
  await attentionRetry.close();

  const activityRetry = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const expectedActivityErrors: string[] = [];
  activityRetry.on('pageerror', (error) => errors.push(error.message));
  activityRetry.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedActivityErrors.push(message.text());
    else errors.push(message.text());
  });
  activityRetry.on('response', (response) => {
    if (response.url().endsWith('/api/dashboard/home-activity') && response.status() === 503) expectedActivityErrors.push(`${response.status()} ${response.url()}`);
    else if (response.status() >= 400) errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  failNextHomeActivity = true;
  await activityRetry.goto(`${base}/__qa-home`);
  await activityRetry.getByText('最近变化暂不可用，请重试。', { exact: true }).waitFor();
  await activityRetry.getByRole('heading', { name: '审核与内容推进' }).waitFor();
  await activityRetry.getByText('今日待发布验收 · 抖音', { exact: true }).waitFor();
  assert.equal(await activityRetry.getByRole('button', { name: '重新加载', exact: true }).count(), 1, 'recent activity failure exposes its own retry without disabling other dashboard data');
  await activityRetry.screenshot({ path: '/tmp/xmt-home-recent-activity-retry-1440.png', fullPage: false });
  await activityRetry.getByRole('button', { name: '重新加载', exact: true }).click();
  await activityRetry.getByText('最近变化验收稿件', { exact: true }).waitFor();
  assert.equal(await activityRetry.getByText('最近变化暂不可用，请重试。', { exact: true }).count(), 0, 'successful retry clears only the recent activity error');
  failNextHomeActivity = true;
  const staleActivityFailure = activityRetry.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-activity') && response.status() === 503);
  await activityRetry.getByRole('button', { name: '刷新最近变化' }).click();
  await staleActivityFailure;
  await activityRetry.getByText('仍显示最近一次成功读取的数据，可能不是最新。', { exact: true }).waitFor();
  assert.equal(await activityRetry.getByText('最近变化验收稿件', { exact: true }).count(), 1, 'a failed refresh keeps the last successful activity visible');
  assert.equal(await activityRetry.getByRole('alert').getByRole('button', { name: '重新加载', exact: true }).count(), 1, 'a failed refresh offers a read-only recovery action beside the retained data');
  await activityRetry.screenshot({ path: '/tmp/xmt-home-recent-activity-stale-1440.png', fullPage: false });
  const staleActivityRecovery = activityRetry.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-activity') && response.status() === 200);
  await activityRetry.getByRole('alert').getByRole('button', { name: '重新加载', exact: true }).click();
  await staleActivityRecovery;
  await activityRetry.getByText('最近变化验收稿件', { exact: true }).waitFor();
  await activityRetry.getByText('最近变化暂不可用，请重试。', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await activityRetry.getByText('最近变化暂不可用，请重试。', { exact: true }).count(), 0, 'successful recovery clears the refresh error');
  assert.ok(expectedActivityErrors.length >= 2, 'only the deliberately injected initial and refresh 503 responses are expected');
  await activityRetry.close();

  const malformedHomeMobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const malformedHomeRuntimeErrors: string[] = [];
  malformedHomeMobile.on('pageerror', (error) => malformedHomeRuntimeErrors.push(error.message));
  malformedHomeMobile.on('console', (message) => { if (message.type() === 'error') malformedHomeRuntimeErrors.push(message.text()); });
  returnMalformedNextHomeAttention = true;
  await malformedHomeMobile.goto(`${base}/__qa-home`);
  await malformedHomeMobile.getByRole('alert').getByText('工作台摘要数据格式暂不兼容，请重新加载；如问题持续，请联系管理员。', { exact: true }).waitFor();
  assert.equal(await malformedHomeMobile.getByRole('alert').count(), 1, 'an incompatible summary response becomes a recoverable card error, not a route crash');
  assert.equal(await malformedHomeMobile.getByText('Unexpected Application Error!', { exact: true }).count(), 0, 'the framework error page is not shown for an incompatible summary response');
  assert.equal(await malformedHomeMobile.locator('vite-error-overlay').count(), 0, 'the malformed summary does not trigger a Vite overlay');
  const malformedHomeLayout = await malformedHomeMobile.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    stageScrollport: (() => {
      const element = document.querySelector('[role="list"][aria-label="内容生产各阶段"]');
      const rect = element?.getBoundingClientRect();
      return element && rect ? {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      } : null;
    })(),
    overflowCandidates: Array.from(document.querySelectorAll('body *')).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
    }).slice(0, 8).map((element) => ({
      tag: element.tagName,
      className: typeof element.className === 'string' ? element.className : '',
      text: element.textContent?.trim().slice(0, 80),
      left: Math.round(element.getBoundingClientRect().left),
      right: Math.round(element.getBoundingClientRect().right),
    })),
  }));
  assert(malformedHomeLayout.documentWidth <= malformedHomeLayout.viewportWidth + 1, `the malformed-summary recovery card fits a 390px viewport: ${JSON.stringify(malformedHomeLayout)}`);
  await malformedHomeMobile.screenshot({ path: '/tmp/xmt-home-malformed-summary-recovery-390.png', fullPage: false });
  const malformedSummaryRetry = malformedHomeMobile.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-attention'));
  await malformedHomeMobile.getByRole('button', { name: '重新加载', exact: true }).click();
  assert.equal((await malformedSummaryRetry).status(), 200, 'retry re-reads the summary without writing data');
  await malformedHomeMobile.getByRole('heading', { name: '团队选题关注' }).waitFor();
  assert.equal(await malformedHomeMobile.getByRole('alert').count(), 0, 'a valid summary clears the contract error');
  assert.deepEqual(malformedHomeRuntimeErrors, [], 'the incompatible summary response causes no page or console runtime errors');
  await malformedHomeMobile.close();

  const homeMobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await homeMobile.addInitScript(() => { Date.now = () => new Date('2026-10-09T12:00:00+08:00').getTime(); });
  const expectedMobileAttentionErrors: string[] = [];
  const expectedMobileActivityErrors: string[] = [];
  const mobileActivityMethods: string[] = [];
  const mobileAttentionMethods: string[] = [];
  homeMobile.on('request', (request) => {
    if (request.url().endsWith('/api/dashboard/home-attention')) mobileAttentionMethods.push(request.method());
    if (request.url().endsWith('/api/dashboard/home-activity')) mobileActivityMethods.push(request.method());
  });
  homeMobile.on('pageerror', (error) => errors.push(error.message));
  homeMobile.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedMobileAttentionErrors.push(message.text());
    else errors.push(message.text());
  });
  homeMobile.on('response', (response) => {
    if (response.url().endsWith('/api/dashboard/home-attention') && response.status() === 503) expectedMobileAttentionErrors.push(`${response.status()} ${response.url()}`);
    else if (response.url().endsWith('/api/dashboard/home-activity') && response.status() === 503) expectedMobileActivityErrors.push(`${response.status()} ${response.url()}`);
    else if (response.status() >= 400) errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  homeUnknownStageTimeCount = 3;
  failNextHomeAttention = true;
  let mobileTopicReadsBefore = homeTopicListReads;
  await homeMobile.goto(`${base}/__qa-home`);
  const mobileAnnouncementStrip = homeMobile.getByTestId('home-announcement-strip');
  await mobileAnnouncementStrip.getByText('暂无公告', { exact: true }).waitFor();
  await mobileAnnouncementStrip.getByRole('button', { name: '查看公告', exact: true }).waitFor();
  await homeMobile.getByRole('button', { name: '记灵感', exact: true }).waitFor();
  await homeMobile.getByRole('alert').getByText('工作台摘要暂时无法读取，请重试。', { exact: true }).waitFor();
  assert.equal(await homeMobile.getByText(/Failed to fetch/i).count(), 0, 'the mobile attention card never exposes browser transport errors');
  await homeMobile.getByRole('heading', { name: '审核与内容推进' }).waitFor();
  assert.equal(await homeMobile.getByRole('alert').count(), 1, 'the mobile Home keeps the attention error scoped to its priority task card');
  await homeMobile.getByText('暂时无法确认是否有需要立即处理的任务。', { exact: true }).waitFor();
  assert.equal(await homeMobile.getByText('当前没有需要立即处理的任务。', { exact: true }).count(), 0, 'a failed attention read is not presented as a confirmed empty task list');
  const mobileRetryResponse = homeMobile.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-attention'));
  await homeMobile.getByRole('button', { name: '重新加载', exact: true }).click();
  const mobileRetryResponseResult = await mobileRetryResponse;
  assert.equal(mobileRetryResponseResult.status(), 200, 'the mobile attention retry request succeeds');
  await homeMobile.getByText('逾期', { exact: true }).waitFor();
  await homeMobile.getByRole('heading', { name: '团队选题关注' }).waitFor();
  await homeMobile.getByText('3 项内容的当前阶段时间待确认，暂不计入卡点；这不代表它们一定没有卡点。', { exact: true }).waitFor();
  const mobileAttentionSummary = homeMobile.locator('[aria-label="2 项需要跟进"]');
  assert.equal(await mobileAttentionSummary.count(), 1, 'unknown stage time is not added to the mobile attention total');
  const mobileAttentionCards = mobileAttentionSummary.locator(':scope > div');
  assert.equal(await mobileAttentionCards.nth(1).getByText('卡点', { exact: true }).count(), 1, 'the second mobile attention metric remains the confirmed stalled count');
  assert.equal(await mobileAttentionCards.nth(1).getByText('1', { exact: true }).count(), 1, 'unknown stage time is not added to the mobile stalled count');
  homeUnknownStageTimeCount = 0;
  await homeMobile.reload();
  await homeMobile.getByRole('heading', { name: '团队选题关注' }).waitFor();
  assert.equal(await homeMobile.getByText(/当前阶段时间待确认/).count(), 0, 'mobile does not show an unknown-time notice when the scoped count is zero');
  assert.equal(await mobileAttentionSummary.count(), 1, 'the confirmed attention total stays unchanged when unknown stage time is absent');
  assert(mobileAttentionMethods.length >= 3 && mobileAttentionMethods.every((method) => method === 'GET'), 'mobile attention failure, retry, and refresh are isolated read-only requests');
  await homeMobile.getByRole('heading', { name: '团队进行中的选题', exact: true }).waitFor();
  assert.equal(await homeMobile.getByTestId('mobile-home-active-topic-summary').innerText(), '共 47 项 · 展示最近 3 项', 'the manager Home distinguishes the full team count from three bounded previews');
  for (const [stageEnteredAt, expectedElapsed] of approvedStageTimeCases) {
    approvedPipelineStageEnteredAt = stageEnteredAt;
    await homeMobile.goto(`${base}/__qa-home`);
    await homeMobile.getByRole('heading', { name: '内容阶段' }).waitFor();
    await homeMobile.getByRole('button', { name: /各阶段最新内容/ }).click();
    const approvedPreview = homeMobile.getByTestId('mobile-home-stage-preview').filter({ hasText: approvedPipelineTopic.title });
    await approvedPreview.getByText(`已通过 · 待开始创作 · ${expectedElapsed}`, { exact: true }).waitFor();
  }
  approvedPipelineStageEnteredAt = '2026-10-06 12:00:00';
  await homeMobile.goto(`${base}/__qa-home`);
  await homeMobile.getByRole('heading', { name: '内容阶段' }).waitFor();
  await homeMobile.getByRole('button', { name: '4 灵感池' }).waitFor();
  const stagePreviewToggle = homeMobile.getByRole('button', { name: /各阶段最新内容/ });
  for (const width of [390, 320]) {
    await homeMobile.setViewportSize({ width, height: 844 });
    const stagePreviewToggleBounds = await stagePreviewToggle.boundingBox();
    assert(stagePreviewToggleBounds && stagePreviewToggleBounds.height >= 40, `mobile stage preview disclosure reaches the 40px touch target at ${width}px`);
  }
  await homeMobile.setViewportSize({ width: 390, height: 844 });
  assert.equal(await stagePreviewToggle.getAttribute('aria-expanded'), 'false', 'mobile stage previews are collapsed by default to keep the first screen compact');
  assert.equal(await homeMobile.locator('#mobile-home-stage-previews').count(), 1, 'the stage-preview disclosure references a persistent controlled region');
  await stagePreviewToggle.focus();
  await stagePreviewToggle.press('Space');
  assert.equal(await stagePreviewToggle.getAttribute('aria-expanded'), 'true', 'the mobile stage preview disclosure opens with the keyboard');
  await stagePreviewToggle.press('Space');
  assert.equal(await stagePreviewToggle.getAttribute('aria-expanded'), 'false', 'the mobile stage preview disclosure closes with the keyboard');
  const stagePreviewRequestCount = homeTopicListReads;
  await stagePreviewToggle.click();
  const stagePreviewList = homeMobile.getByTestId('mobile-home-stage-preview-list');
  await stagePreviewList.waitFor();
  await stagePreviewList.getByText('首页灵感预览 3', { exact: true }).waitFor();
  assert.equal(await stagePreviewList.getByText('首页灵感预览 4', { exact: true }).count(), 0, 'the inspiration preview stays within its three-item cap');
  await stagePreviewList.getByRole('heading', { name: '待审 · 4' }).waitFor();
  await stagePreviewList.getByText('内容流第三条待审选题', { exact: true }).waitFor();
  await stagePreviewList.getByText(approvedPipelineTopic.title, { exact: true }).waitFor();
  await stagePreviewList.getByText('已通过 · 待开始创作 · 停留 3 天', { exact: true }).waitFor();
  await stagePreviewList.getByText(/停留 \d+ 天/).first().waitFor();
  const stagePreviewCounts = await stagePreviewList.locator('section').evaluateAll((sections) => sections.map((section) => section.querySelectorAll('[data-testid="mobile-home-stage-preview"]').length));
  assert.equal(stagePreviewCounts.length, 7, 'the mobile Home renders all seven stage groups');
  assert.ok(stagePreviewCounts.every((count) => count <= 3), `each stage stays within the three-preview cap: ${stagePreviewCounts.join(', ')}`);
  assert.equal(homeTopicListReads, stagePreviewRequestCount, 'stage previews reuse the existing bounded dashboard summary instead of requesting full topic lists');
  assert(await homeMobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'expanded stage previews fit a 390px viewport without horizontal overflow');
  await stagePreviewList.getByTestId('mobile-home-stage-preview').filter({ hasText: '内容流第三条待审选题' }).click();
  await homeMobile.waitForURL((url) => url.pathname === `/topics/${thirdPendingTopic.id}`);
  await homeMobile.goto(`${base}/topics?status=creation`);
  await homeMobile.getByRole('button', { name: '创作阶段', exact: true }).waitFor();
  await homeMobile.getByRole('button', { name: approvedPipelineTopic.title }).waitFor();
  await homeMobile.getByRole('button', { name: productionTopic.title }).waitFor();
  const mobileTopicFilters = homeMobile.getByLabel('选题筛选');
  await mobileTopicFilters.getByRole('button', { name: '我的', exact: true }).click();
  await homeMobile.waitForURL((url) => url.pathname === '/topics' && url.searchParams.get('topic_filter') === 'mine' && !url.searchParams.has('status'));
  await homeMobile.reload();
  assert.equal(await mobileTopicFilters.getByRole('button', { name: '我的', exact: true }).getAttribute('aria-pressed'), 'true', 'the mobile personal filter is addressable and survives a reload');
  await mobileTopicFilters.getByRole('button', { name: '全部', exact: true }).click();
  await homeMobile.waitForURL((url) => url.pathname === '/topics' && !url.searchParams.has('status') && !url.searchParams.has('topic_filter'));
  await homeMobile.reload();
  assert.equal(await mobileTopicFilters.getByRole('button', { name: '全部', exact: true }).getAttribute('aria-pressed'), 'true', 'clearing the mobile filter restores and persists the unfiltered list');
  mobileTopicReadsBefore = homeTopicListReads;
  await homeMobile.goto(`${base}/__qa-home`);
  await homeMobile.getByRole('heading', { name: '内容阶段' }).waitFor();
  const recentChangesToggle = homeMobile.getByRole('button', { name: /最近变化/ });
  assert.equal(await recentChangesToggle.getAttribute('aria-expanded'), 'false', 'recent changes are collapsed on the mobile Home by default');
  assert.equal(await homeMobile.locator('#mobile-home-recent-changes').count(), 1, 'the collapsed disclosure has a persistent controlled region for assistive technology');
  assert.equal(await homeMobile.locator('#mobile-home-recent-changes').isVisible(), false, 'collapsed activity content stays hidden');
  assert.equal(mobileActivityMethods.length, 0, 'the collapsed recent-changes section does not fetch activity data');
  failNextHomeActivity = true;
  const firstMobileActivityFailure = homeMobile.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-activity'));
  await recentChangesToggle.click();
  const firstMobileActivityFailureResponse = await firstMobileActivityFailure;
  assert.equal(firstMobileActivityFailureResponse.status(), 503, 'expanding recent changes surfaces the isolated activity-read failure');
  assert.equal(firstMobileActivityFailureResponse.request().method(), 'GET', 'recent changes remain read-only');
  await homeMobile.getByRole('alert').getByText('最近变化暂不可用，请重试。', { exact: true }).waitFor();
  assert.equal(await homeMobile.getByText(/Failed to fetch/i).count(), 0, 'the mobile recent-changes card never exposes browser transport errors');
  const firstMobileActivityRetry = homeMobile.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-activity'));
  await homeMobile.getByRole('button', { name: '重新加载最近变化', exact: true }).click();
  assert.equal((await firstMobileActivityRetry).status(), 200, 'the mobile recent-changes retry recovers');
  await homeMobile.getByText('最近变化验收稿件', { exact: true }).waitFor();
  assert.equal(await homeMobile.getByTestId('mobile-home-recent-change').count(), 2, 'mobile recent changes render the bounded activity events');
  failNextHomeActivity = true;
  const mobileStaleActivityFailure = homeMobile.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-activity') && response.status() === 503);
  await homeMobile.getByRole('button', { name: '刷新最近变化', exact: true }).click();
  await mobileStaleActivityFailure;
  await homeMobile.getByText('仍显示最近一次成功读取的内容，可能不是最新。', { exact: true }).waitFor();
  assert.equal(await homeMobile.getByText('最近变化验收稿件', { exact: true }).count(), 1, 'a failed mobile refresh retains the last successful activity');
  const mobileStaleActivityRetry = homeMobile.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-activity') && response.status() === 200);
  await homeMobile.getByRole('alert').getByRole('button', { name: '重新加载最近变化', exact: true }).click();
  await mobileStaleActivityRetry;
  const mobileActivityLink = homeMobile.getByTestId('mobile-home-recent-change').filter({ hasText: '最近变化验收稿件' });
  await mobileActivityLink.click();
  await homeMobile.waitForURL((url) => url.pathname === '/production/943');
  assert.deepEqual(mobileActivityMethods, ['GET', 'GET', 'GET', 'GET'], 'the collapsed section makes no request and each explicit expand/retry/refresh uses GET');
  assert.ok(expectedMobileActivityErrors.length >= 2, 'only the deliberately injected first-read and refresh 503 responses are expected');
  await homeMobile.goto(`${base}/__qa-home`);
  await homeMobile.getByRole('heading', { name: '审核与内容推进' }).waitFor();
  await homeMobile.goto(`${base}/__qa-manager-home?active_preview=missing`);
  assert.equal(await homeMobile.getByTestId('mobile-home-active-topic-summary').innerText(), '共 47 项 · 展示最近 0 项', 'a nonzero exact total remains visible when the bounded preview is unavailable');
  await homeMobile.getByText('共 47 项进行中选题，预览暂不可用；可查看全部。', { exact: true }).waitFor();
  assert.equal(await homeMobile.getByText('当前没有进行中的选题。', { exact: true }).count(), 0, 'an unavailable preview does not masquerade as an empty scope');
  await homeMobile.goto(`${base}/__qa-manager-home`);
  await homeMobile.getByRole('heading', { name: '团队今日重点' }).waitFor();
  const mobileRecent = homeMobile.locator('section').filter({ has: homeMobile.getByRole('heading', { name: '团队进行中的选题', exact: true }) });
  assert.equal(await mobileRecent.getByRole('button').count(), 4, 'mobile recent topics contain the three bounded previews plus the full-list link');
  assert.ok(await textContrast(mobileRecent.getByRole('button', { name: '查看全部', exact: true })) >= 4.5, 'light-theme mobile Home links meet 4.5:1 contrast');
  await mobileRecent.getByText('已通过', { exact: true }).waitFor();
  await homeMobile.getByRole('button', { name: '查看剩余 3 项', exact: true }).click();
  await homeMobile.getByRole('button', { name: /选题离开确认对比度验收.*已逾期/ }).waitFor();
  await homeMobile.getByRole('button', { name: /待审核稿件浏览器验收.*v1\.0/ }).waitFor();
  await homeMobile.getByRole('button', { name: /今日待发布验收.*抖音.*2026\/10\/09 15:00/ }).waitFor();
  await homeMobile.goto(`${base}/__qa-home`);
  await homeMobile.getByRole('heading', { name: '审核与内容推进' }).waitFor();
  await homeMobile.getByRole('button', { name: '查看剩余 3 项', exact: true }).click();
  const homeMobileTasks = homeMobile.getByTestId('mobile-home-task');
  await homeMobileTasks.nth(2).waitFor();
  const continueDraftTask = homeMobileTasks.filter({ hasText: '我的待续写稿件' });
  await continueDraftTask.waitFor();
  await continueDraftTask.getByText('继续写稿', { exact: true }).waitFor();
  assert.ok(await renderedTextContrastRatio(continueDraftTask.getByText('继续写稿', { exact: true })) >= 4.5, 'the draft action label meets text contrast requirements in the light theme');
  await continueDraftTask.click();
  await homeMobile.waitForURL((url) => url.pathname === '/production/943');
  await homeMobile.goto(`${base}/__qa-home`);
  await homeMobile.getByRole('heading', { name: '审核与内容推进' }).waitFor();
  await homeMobileTasks.nth(2).waitFor();
  await homeMobile.getByRole('button', { name: '查看剩余 3 项', exact: true }).click();
  const rejectedDraftTask = homeMobile.getByTestId('mobile-home-task').filter({ hasText: '我的退回稿件' });
  await rejectedDraftTask.waitFor();
  await rejectedDraftTask.getByText('处理退回', { exact: true }).waitFor();
  assert.ok(await renderedTextContrastRatio(rejectedDraftTask.getByText('处理退回', { exact: true })) >= 4.5, 'the returned-draft action label meets text contrast requirements in the light theme');
  await rejectedDraftTask.click();
  await homeMobile.waitForURL((url) => url.pathname === '/production/944');
  await homeMobile.goto(`${base}/__qa-home`);
  await homeMobile.getByRole('heading', { name: '审核与内容推进' }).waitFor();
  await homeMobileTasks.nth(2).waitFor();
  await homeMobile.getByRole('button', { name: '查看剩余 3 项', exact: true }).click();
  const todayPublishingTask = homeMobile.getByRole('button', { name: /今日发布.*今日待发布验收.*去发布/ });
  assert.equal(await homeMobile.title(), '新媒体协作管理系统');
  assert.equal(await homeMobile.getByText('逾期', { exact: true }).count(), 1, 'the mobile Home renders attention counts after retry');
  await todayPublishingTask.waitFor();
  await todayPublishingTask.getByText('今日待发布验收', { exact: true }).waitFor();
  await homeMobile.getByText('抖音 · 2026/10/09 15:00', { exact: true }).waitFor();
  assert.equal(await homeMobile.getByRole('alert').count(), 0, 'a successful mobile retry clears the attention error');
  assert.equal(homeTopicListReads, mobileTopicReadsBefore, 'mobile Home uses the bounded aggregate without a paged topics request');
  assert.ok(expectedMobileAttentionErrors.length >= 1, 'the only expected mobile Home failure is the injected attention 503');
  assert(await homeMobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the Home dashboard fits a 390px viewport without horizontal overflow');
  await homeMobile.screenshot({ path: '/tmp/xmt-home-attention-390.png', fullPage: false });
  await homeMobile.getByRole('button', { name: /今日待发布验收.*抖音.*2026\/10\/09 15:00/ }).click();
  await homeMobile.waitForURL((url) => url.pathname === '/publishing/941');
  await homeMobile.goto(`${base}/__qa-home`);
  const mobileQuickWrite = homeMobile.getByRole('button', { name: '写两句', exact: true });
  await mobileQuickWrite.waitFor();
  await mobileQuickWrite.click();
  await homeMobile.waitForURL((url) => url.pathname === '/production/content/new');
  await homeMobile.getByLabel('关联选题').waitFor();

  const darkMobileHome = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  darkMobileHome.on('pageerror', (error) => errors.push(error.message));
  darkMobileHome.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await darkMobileHome.goto(`${base}/__qa-home?theme=dark`);
  await darkMobileHome.getByRole('heading', { name: '团队进行中的选题', exact: true }).waitFor();
  await darkMobileHome.getByRole('button', { name: '查看剩余 3 项', exact: true }).click();
  const darkMobileRecent = darkMobileHome.locator('section').filter({ has: darkMobileHome.getByRole('heading', { name: '团队进行中的选题', exact: true }) });
  assert.ok(await textContrast(darkMobileRecent.getByRole('button', { name: '查看全部', exact: true })) >= 4.5, 'dark-theme mobile Home links meet 4.5:1 contrast');
  await darkMobileHome.getByRole('button', { name: /选题离开确认对比度验收.*已逾期/ }).waitFor();
  await darkMobileHome.getByRole('button', { name: /待审核稿件浏览器验收.*v1\.0/ }).waitFor();
  await darkMobileHome.getByRole('button', { name: /今日待发布验收.*抖音.*2026\/10\/09 15:00/ }).waitFor();
  const darkContinueDraftTask = darkMobileHome.getByTestId('mobile-home-task').filter({ hasText: '我的待续写稿件' });
  const darkRejectedDraftTask = darkMobileHome.getByTestId('mobile-home-task').filter({ hasText: '我的退回稿件' });
  await darkContinueDraftTask.waitFor();
  await darkContinueDraftTask.getByText('继续写稿', { exact: true }).waitFor();
  await darkRejectedDraftTask.waitFor();
  await darkRejectedDraftTask.getByText('处理退回', { exact: true }).waitFor();
  for (const [index, action] of ['审核稿件', '开始审核', '跟进选题'].entries()) {
    assert.ok(await renderedTextContrastRatio(darkMobileHome.getByTestId('mobile-home-task').nth(index).getByText(action, { exact: true })) >= 4.5, `dark-theme task action ${action} meets 4.5:1 contrast`);
  }
  assert.ok(await renderedTextContrastRatio(darkContinueDraftTask.getByText('继续写稿', { exact: true })) >= 4.5, 'the draft action label meets text contrast requirements in the dark theme');
  assert.ok(await renderedTextContrastRatio(darkRejectedDraftTask.getByText('处理退回', { exact: true })) >= 4.5, 'the returned-draft action label meets text contrast requirements in the dark theme');
  await darkMobileHome.close();

  for (const width of [390, 1440]) {
    allowHomeCreate = true;
    const identityHome = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
    identityHome.on('pageerror', (error) => errors.push(error.message));
    identityHome.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const installNonCancelableReads = async () => identityHome.evaluate(() => {
      // Simulate a transport that cannot cancel an already dispatched read.
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (String(input).includes('/api/permissions/my') || String(input).includes('/api/dashboard/home-attention')) {
          return originalFetch(input, { ...init, signal: undefined });
        }
        return originalFetch(input, init);
      };
    });
    try {
      await identityHome.goto(`${base}/__qa-home`);
      await identityHome.getByRole('button', { name: width === 390 ? '提报选题' : '新建选题', exact: true }).first().waitFor();
      await identityHome.getByRole('button', { name: '写两句', exact: true }).waitFor();
      await installNonCancelableReads();
      holdOldHomeReads = true;
      const oldSummaryRead = width === 390 ? identityHome.waitForRequest((request) => request.url().endsWith('/api/dashboard/home-attention')) : null;
      await identityHome.evaluate(async (nextUser) => {
        const { useAuthStore } = await import('/src/store/index.ts');
        useAuthStore.getState().login(nextUser, 'topic-stage-refresh-fixture', { persist: 'memory' });
      }, editor);
      // Desktop waits for permission completion before reading its summary.
      if (oldSummaryRead) await oldSummaryRead;
      await identityHome.waitForTimeout(80);
      assert.ok(heldOldHomeReplies.length > 0, 'the isolated old account read is deliberately held');
      await identityHome.evaluate(async (nextUser) => {
        const { useAuthStore } = await import('/src/store/index.ts');
        useAuthStore.getState().login(nextUser, 'topic-stage-viewer-fixture', { persist: 'memory' });
      }, viewer);
      await identityHome.getByText(`你好，${viewer.name}`, { exact: width === 390 }).first().waitFor();
      assert.equal(await identityHome.getByRole('button', { name: /^(提报选题|新建选题)$/ }).count(), 0, 'switching accounts immediately removes the previous create permission');
      assert.equal(await identityHome.getByRole('button', { name: '写两句', exact: true }).count(), 0, 'switching accounts immediately removes the write shortcut without production:update');
      if (width === 390) {
        await identityHome.getByRole('heading', { name: '我的今日任务' }).waitFor();
        await identityHome.getByText('当前账号进行中选题', { exact: true }).waitFor();
      }
      const lateResponse = identityHome.waitForResponse((response) => response.url().endsWith('/api/permissions/my') && response.request().headers().authorization === 'Bearer topic-stage-refresh-fixture');
      heldOldHomeReplies.splice(0).forEach((reply) => reply());
      await lateResponse;
      await identityHome.waitForTimeout(80);
      assert.equal(await identityHome.getByRole('button', { name: /^(提报选题|新建选题)$/ }).count(), 0, 'late old permissions cannot restore the create entry');
      assert.equal(await identityHome.getByRole('button', { name: '写两句', exact: true }).count(), 0, 'late old permissions cannot restore the write shortcut');
      assert.equal(await identityHome.getByText('迟到的旧账号选题', { exact: true }).count(), 0, 'late old summary cannot replace current account data');
      if (width === 390) await identityHome.getByRole('heading', { name: '我的今日任务' }).waitFor();
      assert.equal(await identityHome.locator('vite-error-overlay').count(), 0);
      await identityHome.screenshot({ path: `/tmp/xmt-home-account-isolation-${width}.png`, fullPage: false });
    } finally {
      holdOldHomeReads = false;
      allowHomeCreate = false;
      heldOldHomeReplies.splice(0).forEach((reply) => reply());
      await identityHome.close();
    }
  }

  const accountScopedRecentActivity = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const accountActivityMethods: string[] = [];
  accountScopedRecentActivity.on('pageerror', (error) => errors.push(error.message));
  accountScopedRecentActivity.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  accountScopedRecentActivity.on('request', (request) => {
    if (request.url().endsWith('/api/dashboard/home-activity')) accountActivityMethods.push(request.method());
  });
  try {
    await accountScopedRecentActivity.goto(`${base}/__qa-home`);
    await accountScopedRecentActivity.getByText('最近变化验收稿件', { exact: true }).waitFor();
    holdNextViewerHomeActivity = true;
    const viewerActivityReadStarted = new Promise<void>((resolve) => { homeActivityReadStartedCallback = resolve; });
    await accountScopedRecentActivity.evaluate(async (nextUser) => {
      const { useAuthStore } = await import('/src/store/index.ts');
      useAuthStore.getState().login(nextUser, 'topic-stage-viewer-fixture', { persist: 'memory' });
    }, viewer);
    await viewerActivityReadStarted;
    await accountScopedRecentActivity.getByRole('heading', { name: '工作台', exact: true }).waitFor();
    assert.equal(await accountScopedRecentActivity.getByText('最近变化验收稿件', { exact: true }).count(), 0, 'switching accounts immediately hides the previous account recent activity');
    await accountScopedRecentActivity.getByText('正在读取最近变化…', { exact: true }).waitFor();
    assert.equal(await accountScopedRecentActivity.getByText('当前账号最近变化', { exact: true }).count(), 0, 'the new account remains in a read-only loading state until its activity arrives');
    assert.ok(heldHomeActivityResponse, 'the new account activity response is held by the isolated fixture');
    heldHomeActivityResponse();
    heldHomeActivityResponse = null;
    await accountScopedRecentActivity.getByText('当前账号最近变化', { exact: true }).waitFor();
    assert.equal(await accountScopedRecentActivity.getByText('最近变化验收稿件', { exact: true }).count(), 0, 'only the current account recent activity is shown after the read completes');
    assert.deepEqual(accountActivityMethods, ['GET', 'GET'], 'account switching only reads each account recent activity and does not write business data');
  } finally {
    holdNextViewerHomeActivity = false;
    homeActivityReadStartedCallback = null;
    heldHomeActivityResponse?.();
    heldHomeActivityResponse = null;
    await accountScopedRecentActivity.close();
  }

  const accountScopedDashboard = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const dashboardReadMethods: string[] = [];
  accountScopedDashboard.on('pageerror', (error) => errors.push(error.message));
  accountScopedDashboard.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  accountScopedDashboard.on('request', (request) => {
    if (request.url().endsWith('/api/dashboard/home-attention') || request.url().endsWith('/api/inspirations')) dashboardReadMethods.push(request.method());
  });
  try {
    await accountScopedDashboard.goto(`${base}/__qa-home`);
    await accountScopedDashboard.getByText('首页灵感预览 3', { exact: true }).waitFor();
    await accountScopedDashboard.getByText('最近变化验收稿件', { exact: true }).waitFor();
    holdNextViewerHomeAttention = true;
    const viewerAttentionRead = accountScopedDashboard.waitForRequest((request) => request.url().endsWith('/api/dashboard/home-attention')
      && request.headers().authorization === 'Bearer topic-stage-viewer-fixture');
    await accountScopedDashboard.evaluate(async (nextUser) => {
      const { useAuthStore } = await import('/src/store/index.ts');
      useAuthStore.getState().login(nextUser, 'topic-stage-viewer-fixture', { persist: 'memory' });
    }, viewer);
    await viewerAttentionRead;
    await accountScopedDashboard.getByText('正在加载工作台…', { exact: true }).waitFor({ state: 'attached' });
    assert.equal(await accountScopedDashboard.getByText('首页灵感预览 3', { exact: true }).count(), 0, 'switching accounts hides the previous account inspiration preview while the summary is pending');
    assert.equal(await accountScopedDashboard.getByText('最近变化验收稿件', { exact: true }).count(), 0, 'switching accounts hides the previous account home sections while the summary is pending');
    assert.ok(heldViewerHomeAttentionResponse, 'the current account home summary is held by the isolated fixture');
    heldViewerHomeAttentionResponse();
    heldViewerHomeAttentionResponse = null;
    await accountScopedDashboard.getByRole('heading', { name: '我的今日任务', exact: true }).waitFor();
    await accountScopedDashboard.getByText('当前账号进行中选题', { exact: true }).waitFor();
    await accountScopedDashboard.getByText('当前账号灵感预览 3', { exact: true }).waitFor();
    assert.equal(await accountScopedDashboard.getByText('首页灵感预览 3', { exact: true }).count(), 0, 'only the current account inspiration preview is shown after its read completes');
    assert.deepEqual(dashboardReadMethods, ['GET', 'GET', 'GET', 'GET'], 'account-scoped Home dashboard reads remain GET-only');
  } finally {
    holdNextViewerHomeAttention = false;
    heldViewerHomeAttentionResponse?.();
    heldViewerHomeAttentionResponse = null;
    await accountScopedDashboard.close();
  }

  const staleAttentionRetry = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const retryReadMethods: string[] = [];
  staleAttentionRetry.on('pageerror', (error) => errors.push(error.message));
  staleAttentionRetry.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  staleAttentionRetry.on('request', (request) => {
    if (request.url().endsWith('/api/dashboard/home-attention')) retryReadMethods.push(request.method());
  });
  try {
    await staleAttentionRetry.goto(`${base}/__qa-home?fail_attention=true`);
    const attentionError = staleAttentionRetry.getByRole('alert').filter({ hasText: '工作台摘要暂时无法读取' });
    await attentionError.getByRole('button', { name: '重新加载', exact: true }).waitFor();
    holdNextEditorHomeAttention = true;
    const heldEditorRetryRequest = staleAttentionRetry.waitForRequest((request) => request.url().endsWith('/api/dashboard/home-attention')
      && request.headers().authorization === 'Bearer topic-stage-fixture');
    await attentionError.getByRole('button', { name: '重新加载', exact: true }).click();
    await heldEditorRetryRequest;
    await staleAttentionRetry.evaluate(async (nextUser) => {
      const { useAuthStore } = await import('/src/store/index.ts');
      useAuthStore.getState().login(nextUser, 'topic-stage-viewer-fixture', { persist: 'memory' });
    }, viewer);
    await staleAttentionRetry.getByText('当前账号灵感预览 3', { exact: true }).waitFor();
    await staleAttentionRetry.getByText('当前账号进行中选题', { exact: true }).waitFor();
    assert.ok(heldEditorHomeAttentionResponse, 'the previous account retry remains deliberately held until the new account is loaded');
    heldEditorHomeAttentionResponse?.();
    heldEditorHomeAttentionResponse = null;
    await staleAttentionRetry.waitForTimeout(80);
    assert.equal(await staleAttentionRetry.getByText('当前账号灵感预览 3', { exact: true }).count(), 1, 'a late previous-account retry does not replace the current account inspiration preview');
    assert.equal(await staleAttentionRetry.getByText('首页灵感预览 3', { exact: true }).count(), 0, 'a late previous-account retry cannot restore old account content');
    assert.equal(await staleAttentionRetry.getByText('工作台摘要暂时无法读取，请重试。', { exact: true }).count(), 0, 'a late previous-account retry cannot restore its error state');
    assert.deepEqual(retryReadMethods, ['GET', 'GET', 'GET'], 'the retry and account transition perform only read-only attention requests');
  } finally {
    holdNextEditorHomeAttention = false;
    heldEditorHomeAttentionResponse?.();
    heldEditorHomeAttentionResponse = null;
    await staleAttentionRetry.close();
  }

  if (process.env.XMT_HOME_DASHBOARD_ONLY === '1') {
    assert.deepEqual(errors, [], 'Home dashboard browser tests complete without unexpected browser or console errors');
    await homeMobile.close();
    console.log('Home dashboard browser tests passed: creator draft save status remains unknown without explicit same-account persistence confirmation, isolates account state, and covers editing/syncing/saving/saved/conflict states; collapsed mobile recent changes, GET-only retry, stale-data recovery, direct content link, and 390px layout.');
  } else {
  const unauthorizedAudit = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  unauthorizedAudit.on('pageerror', (error) => errors.push(error.message));
  unauthorizedAudit.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await unauthorizedAudit.goto(`${base}/__qa-audit-viewer/${auditTopic.id}`);
  await unauthorizedAudit.getByRole('heading', { name: auditTopic.title }).waitFor();
  await unauthorizedAudit.waitForURL((url) => url.pathname === `/topics/${auditTopic.id}` && !url.searchParams.has('action'));
  assert.equal(await unauthorizedAudit.getByRole('heading', { name: '审核选题', exact: true }).count(), 0, 'an unauthorized direct review link does not open the dialog');
  assert.equal(await unauthorizedAudit.getByRole('button', { name: '审核选题', exact: true }).count(), 0, 'an unauthorized account still has no review entry point');
  assert.equal(auditTopic.status, 'pending', 'unauthorized direct navigation leaves the topic unchanged');
  assert.equal(auditWrites.length, auditWritesBeforeHomeAction, 'unauthorized direct navigation performs no audit write');
  await unauthorizedAudit.close();

  const unauthorizedMobileAudit = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  unauthorizedMobileAudit.on('pageerror', (error) => errors.push(error.message));
  unauthorizedMobileAudit.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await unauthorizedMobileAudit.goto(`${base}/__qa-audit-viewer/${auditTopic.id}`);
  await unauthorizedMobileAudit.getByRole('textbox', { name: '选题标题' }).waitFor();
  await unauthorizedMobileAudit.waitForURL((url) => url.pathname === `/topics/${auditTopic.id}` && !url.searchParams.has('action'));
  assert.equal(await unauthorizedMobileAudit.getByRole('button', { name: '开始审核', exact: true }).count(), 0, 'unauthorized mobile direct review navigation does not show an audit control');
  assert.equal(await unauthorizedMobileAudit.getByRole('button', { name: '收起审核', exact: true }).count(), 0, 'unauthorized mobile direct review navigation does not expand the audit panel');
  assert.equal(await unauthorizedMobileAudit.getByRole('button', { name: /确认(通过|驳回)选题/ }).count(), 0, 'unauthorized mobile direct review navigation exposes no submit action');
  assert.equal(auditTopic.status, 'pending', 'unauthorized mobile direct navigation leaves the topic unchanged');
  assert.equal(auditWrites.length, auditWritesBeforeHomeAction, 'unauthorized mobile direct navigation performs no audit write');
  await unauthorizedMobileAudit.close();

  auditTopic.status = 'approved';
  const staleAudit = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  staleAudit.on('pageerror', (error) => errors.push(error.message));
  staleAudit.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await staleAudit.goto(`${base}/__qa-stale-audit/${auditTopic.id}`);
  await staleAudit.getByRole('heading', { name: auditTopic.title }).waitFor();
  await staleAudit.waitForURL((url) => url.pathname === `/topics/${auditTopic.id}` && !url.searchParams.has('action'));
  assert.equal(await staleAudit.getByRole('heading', { name: '审核选题', exact: true }).count(), 0, 'a stale review action does not open for an already reviewed topic');
  assert.equal(auditWrites.length, auditWritesBeforeHomeAction, 'a stale review link performs no audit write');
  await staleAudit.close();
  auditTopic.status = 'pending';

  const topicDirectoryRetry = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const directoryHttpErrors: string[] = [];
  const directoryConsoleErrors: string[] = [];
  const directoryMutationRequests: string[] = [];
  const directoryReadsBefore = topicUserDirectoryReads;
  topicDirectoryRetry.on('pageerror', (error) => errors.push(error.message));
  topicDirectoryRetry.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) directoryConsoleErrors.push(message.text());
    else errors.push(message.text());
  });
  topicDirectoryRetry.on('response', (response) => {
    if (response.status() === 503 && new URL(response.url()).pathname === '/api/users') directoryHttpErrors.push(`${response.status()} ${response.url()}`);
    else if (response.status() >= 400) errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  topicDirectoryRetry.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET' && /^\/api\/topics\/\d+(?:\/audit|\/status|\/repair-stage-record)?$/.test(pathname)) directoryMutationRequests.push(`${request.method()} ${pathname}`);
  });
  failNextTopicUserDirectoryRead = true;
  await topicDirectoryRetry.goto(`${base}/__qa/${saveTopic.id}`);
  await topicDirectoryRetry.getByRole('heading', { name: saveTopic.title }).waitFor();
  await topicDirectoryRetry.getByRole('alert').filter({ hasText: '负责人名单暂不可用' }).waitFor();
  assert.equal(await topicDirectoryRetry.getByRole('heading', { name: saveTopic.title }).count(), 1, 'the main topic remains available while the directory request fails');
  assert.equal(topicUserDirectoryReads, directoryReadsBefore + 1, 'the injected failure affects only the separate user directory request');
  await topicDirectoryRetry.getByRole('button', { name: '编辑选题', exact: true }).click();
  await topicDirectoryRetry.getByRole('button', { name: '重新加载负责人名单', exact: true }).click();
  await topicDirectoryRetry.waitForFunction((name) => Array.from(document.querySelectorAll('select option')).some((option) => option.textContent?.trim() === name), editor.name);
  assert.equal(await topicDirectoryRetry.getByRole('alert').filter({ hasText: '负责人名单暂不可用' }).count(), 0, 'a successful GET-only retry clears the directory error');
  assert.equal(topicUserDirectoryReads, directoryReadsBefore + 2, 'retry re-reads the directory exactly once');
  assert.deepEqual(directoryMutationRequests, [], 'loading or retrying the assignee list performs no topic writes');
  assert.equal(directoryHttpErrors.length, 1, 'only the deliberately injected user-directory 503 is expected');
  assert.equal(directoryConsoleErrors.length, 1, 'only the injected user-directory 503 reaches the console');
  await topicDirectoryRetry.close();

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  desktop.on('pageerror', (error) => errors.push(error.message));
  desktop.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) {
      expectedConsoleErrors.push(message.text());
      return;
    }
    errors.push(message.text());
  });
  desktop.on('response', (response) => {
    if (response.status() < 400) return;
    const responseDescription = `${response.status()} ${response.url()}`;
    if (response.url().endsWith(`/api/topics/${productionTopic.id}`) && response.status() === 503) expectedHttpErrors.push(responseDescription);
    else errors.push(`Unexpected HTTP error: ${responseDescription}`);
  });
  await desktop.goto(`${base}/__qa/${productionTopic.id}`);
  await desktop.getByRole('heading', { name: productionTopic.title }).waitFor();
  await desktop.getByRole('alert').getByText('当前阶段缺少创作稿记录').waitFor();
  const repairButton = desktop.getByRole('button', { name: '补齐创作稿记录', exact: true });
  await repairButton.waitFor();
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
      const cssViewport = {
        width: Math.round(viewport.width / zoom),
        height: Math.round(viewport.height / zoom),
      };
      await desktop.setViewportSize(cssViewport);
      const viewportMetrics = await desktop.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
      }));
      const viewportLabel = `${viewport.width}×${viewport.height}px / ${zoom * 100}% (CSS ${cssViewport.width}×${cssViewport.height}px)`;
      assert.equal(viewportMetrics.innerWidth, cssViewport.width, `Chromium innerWidth matches the converted CSS viewport at ${viewportLabel}`);
      assert.equal(viewportMetrics.innerHeight, cssViewport.height, `Chromium innerHeight matches the converted CSS viewport at ${viewportLabel}`);
      assert.ok(viewportMetrics.documentWidth <= viewportMetrics.innerWidth, `document has no horizontal overflow at ${viewportLabel}: ${JSON.stringify(viewportMetrics)}`);
      for (const name of ['补齐创作稿记录', '编辑选题']) {
        const button = desktop.getByRole('button', { name, exact: true });
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
            width: rect.width,
            height: rect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            display: getComputedStyle(element).display,
            visibility: getComputedStyle(element).visibility,
            clippedBy,
          };
        });
        assert.ok(geometry.width > 0 && geometry.height > 0, `${name} has a layout box at ${viewportLabel}: ${JSON.stringify(geometry)}`);
        assert.notEqual(geometry.display, 'none', `${name} is not hidden at ${viewportLabel}`);
        assert.notEqual(geometry.visibility, 'hidden', `${name} is visible at ${viewportLabel}`);
        assert.deepEqual(geometry.clippedBy, [], `${name} is not clipped at ${viewportLabel}`);
        assert.ok(geometry.x >= -1 && geometry.x + geometry.width <= geometry.viewportWidth + 1, `${name} stays within the viewport at ${viewportLabel}: ${JSON.stringify(geometry)}`);
      }
    }
  }
  await desktop.setViewportSize({ width: 1440, height: 960 });
  failNextTopicRefreshForTopicId = productionTopic.id;
  await repairButton.click();
  await desktop.getByText('阶段记录已补齐', { exact: true }).waitFor();
  await desktop.getByText('服务端已确认结果，但页面刷新失败；请重新加载确认当前状态，不要重复操作。', { exact: true }).waitFor();
  assert.equal(productionTopic.stage_record_presence.production, true, 'the isolated API confirms the repair write succeeded despite the failed detail refresh');
  assert.equal(await repairButton.count(), 1, 'the stale page keeps its repair action until a successful reload');
  await desktop.reload();
  await desktop.getByRole('heading', { name: productionTopic.title }).waitFor();
  await desktop.getByText('已补齐当前阶段记录；选题阶段未变更', { exact: true }).waitFor();
  assert.equal(await desktop.getByRole('alert').count(), 0, 'a successful reload reflects the already-persisted repair');
  assert.equal(productionTopic.status, 'production', 'repair keeps the active Topic stage unchanged');
  assert.deepEqual(repairedStages, ['production'], 'the action creates only the missing active-stage record');
  assert.equal(await desktop.getByRole('button', { name: '补齐创作稿记录', exact: true }).count(), 0, 'a successful repair removes the missing-record action');
  assert.equal(expectedHttpErrors.length, 1, 'only the intentionally injected post-mutation refresh 503 is expected');
  assert.equal(expectedConsoleErrors.length, 1, 'the only expected browser console error is the injected refresh 503');
  await desktop.getByText(linkedResource.title, { exact: true }).waitFor();
  const resourceViewLink = desktop.getByRole('link', { name: `查看资料：${linkedResource.title}`, exact: true });
  const resourceUnlinkButton = desktop.getByRole('button', { name: `解除与「${linkedResource.title}」的关联`, exact: true });
  for (const width of [1440, 390, 320]) {
    await desktop.setViewportSize({ width, height: 960 });
    for (const [label, target] of [['resource view', resourceViewLink], ['resource unlink', resourceUnlinkButton]] as const) {
      const bounds = await target.boundingBox();
      assert.ok(bounds && bounds.width >= 40 && bounds.height >= 40, `${width}px ${label} target is at least 40×40px`);
      assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `${width}px ${label} target stays in the viewport`);
    }
  }
  await desktop.setViewportSize({ width: 1440, height: 960 });
  const initialResourceListReads = topicResourceListReads;
  await resourceUnlinkButton.click();
  await desktop.getByRole('button', { name: '解除', exact: true }).click();
  await desktop.getByText('解除关联成功', { exact: true }).waitFor();
  assert.equal(isResourceLinked, false, 'successful resource unlink persists in the isolated fixture');
  assert.equal(await desktop.getByText(linkedResource.title, { exact: true }).count(), 0, 'unlinked resource disappears from the topic detail');
  assert.equal(topicResourceWrites.remove, 1, 'successful unlink is submitted once');
  assert.equal(topicResourceListReads, initialResourceListReads, 'confirmed unlink updates the current list without a follow-up GET');
  const openResourcePicker = desktop.getByRole('button', { name: '关联资料' });
  assert.match(await openResourcePicker.getAttribute('class') || '', /xmt-btn-primary/, 'topic resource linking uses the shared primary button style');
  await openResourcePicker.click();
  const resourceSearchInput = desktop.getByRole('textbox', { name: '搜索资料', exact: true });
  await resourceSearchInput.fill('隔离素材');
  const searchButton = desktop.getByRole('button', { name: '搜索', exact: true });
  assert.match(await searchButton.getAttribute('class') || '', /xmt-btn-primary/, 'topic resource search uses the shared primary button style');
  const searchStarted = new Promise<void>((resolve) => { topicResourceSearchStartedCallback = resolve; });
  holdNextTopicResourceSearch = true;
  const searchReadsBefore = topicResourceSearchReads;
  await searchButton.evaluate((element) => {
    const form = element.closest('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await searchStarted;
  const pendingSearchButton = desktop.getByRole('button', { name: '搜索中…', exact: true });
  await pendingSearchButton.waitFor();
  assert.equal(await pendingSearchButton.isDisabled(), true, 'search shows a disabled in-progress action');
  assert.equal(await resourceSearchInput.isDisabled(), true, 'the search term cannot change while its results are pending');
  assert.equal(topicResourceSearchReads, searchReadsBefore + 1, 'duplicate form submissions during one pending search produce only one request');
  releaseTopicResourceSearchCallback?.();
  releaseTopicResourceSearchCallback = null;
  topicResourceSearchStartedCallback = null;
  await desktop.getByText(linkedResource.title, { exact: true }).waitFor();
  assert.equal(await resourceSearchInput.isDisabled(), false, 'the search term is editable again after results arrive');
  const resourceAddButton = desktop.getByRole('button', { name: `关联资料：${linkedResource.title}`, exact: true });
  for (const width of [1440, 390, 320]) {
    await desktop.setViewportSize({ width, height: 960 });
    const bounds = await resourceAddButton.boundingBox();
    assert.ok(bounds && bounds.height >= 40, `${width}px resource link action is at least 40px high`);
    assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `${width}px resource link action stays in the viewport`);
  }
  await desktop.setViewportSize({ width: 1440, height: 960 });
  const addResourceResponse = desktop.waitForResponse((response) => response.url().endsWith(`/api/topics/${productionTopic.id}/resources`) && response.request().method() === 'POST');
  await resourceAddButton.click();
  assert.equal((await addResourceResponse).status(), 200, 'resource link is accepted by the isolated fixture');
  await desktop.getByRole('dialog', { name: '关联资料' }).getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await desktop.getByRole('link', { name: linkedResource.title, exact: true }).waitFor();
  assert.equal(isResourceLinked, true, 'successful resource link persists in the isolated fixture');
  assert.equal(topicResourceWrites.add, 1, 'successful link is submitted once');
  assert.equal(topicResourceListReads, initialResourceListReads, 'confirmed link updates the current list without a follow-up GET');

  const resourceRecoveryKey = 'xmt:topic-resource-recovery:v1:actor:93:topic:931';
  const readResourceRecovery = async () => {
    const serialized = await desktop.evaluate((key) => window.sessionStorage.getItem(key), resourceRecoveryKey);
    assert.ok(serialized, 'the unresolved operation persists in this browser session');
    assert.doesNotMatch(serialized, /access[_-]?token|refresh[_-]?token|password/i, 'recovery stores no authentication secrets');
    const payload = JSON.parse(serialized) as { version: number; actorId: number; topicId: number; recoveries: Array<Record<string, unknown>> };
    assert.deepEqual(Object.keys(payload).sort(), ['actorId', 'recoveries', 'topicId', 'version']);
    assert.equal(payload.version, 1);
    assert.equal(payload.actorId, editor.id);
    assert.equal(payload.topicId, productionTopic.id);
    assert.equal(payload.recoveries.length, 1);
    const [record] = payload.recoveries;
    assert.deepEqual(Object.keys(record).sort(), ['actorId', 'mutation', 'requestId', 'resource', 'topicId', 'version']);
    assert.equal(record.actorId, editor.id);
    assert.equal(record.topicId, productionTopic.id);
    assert.match(String(record.requestId), /^[0-9a-f-]{36}$/i);
    assert.deepEqual(record.resource, { id: linkedResource.id, title: linkedResource.title });
    return record;
  };

  const removeWritesBeforeLostResponse = topicResourceWrites.remove;
  const resourceReadsBeforeLostRemove = topicResourceListReads;
  commitNextTopicResourceRemoveThenFail = true;
  failNextTopicResourceRead = true;
  await resourceUnlinkButton.click();
  await desktop.getByRole('button', { name: '解除', exact: true }).click();
  await desktop.getByText('结果仍待核实', { exact: false }).waitFor();
  assert.equal(isResourceLinked, false, 'the isolated unlink committed even though its response and first readback failed');
  assert.equal(topicResourceWrites.remove, removeWritesBeforeLostResponse + 1, 'lost unlink response produced exactly one write');
  assert.equal(topicResourceListReads, resourceReadsBeforeLostRemove + 1, 'the failed unlink is followed by one read-only verification attempt');
  assert.equal(await desktop.getByRole('button', { name: `解除与「${linkedResource.title}」的关联`, exact: true }).isDisabled(), true, 'the target unlink stays locked until readback succeeds');
  const unlinkRecoveryBeforeReload = await readResourceRecovery();
  assert.equal(unlinkRecoveryBeforeReload.mutation, 'unlink');
  failNextTopicResourceRead = true;
  await desktop.reload();
  const unlinkVerifyButton = desktop.getByRole('button', { name: `只读核实资料关联状态：${linkedResource.title}`, exact: true });
  await unlinkVerifyButton.waitFor();
  assert.equal(topicResourceListReads, resourceReadsBeforeLostRemove + 2, 'refresh attempts only one read-only reconciliation and keeps the marker when that read fails');
  assert.deepEqual(await readResourceRecovery(), unlinkRecoveryBeforeReload, 'the same exact unlink marker survives refresh and a failed readback');
  assert.equal(topicResourceWrites.remove, removeWritesBeforeLostResponse + 1, 'refresh does not repeat an unresolved unlink write');
  await unlinkVerifyButton.click();
  await desktop.getByText('解除关联已确认', { exact: true }).waitFor();
  assert.equal(await desktop.getByText(linkedResource.title, { exact: true }).count(), 0, 'read-only recovery reflects the committed unlink');
  assert.equal(topicResourceListReads, resourceReadsBeforeLostRemove + 3, 'manual recovery performs one additional read-only check');
  assert.equal(await desktop.evaluate((key) => window.sessionStorage.getItem(key), resourceRecoveryKey), null, 'confirmed recovery removes its local marker');
  assert.equal(topicResourceWrites.remove, removeWritesBeforeLostResponse + 1, 'unlink recovery sends no second write');

  await openResourcePicker.click();
  await resourceSearchInput.fill('隔离素材');
  await searchButton.click();
  await desktop.getByRole('button', { name: `关联资料：${linkedResource.title}`, exact: true }).waitFor();
  const addWritesBeforeLostResponse = topicResourceWrites.add;
  const resourceReadsBeforeLostAdd = topicResourceListReads;
  commitNextTopicResourceAddThenFail = true;
  failNextTopicResourceRead = true;
  await desktop.getByRole('button', { name: `关联资料：${linkedResource.title}`, exact: true }).click();
  await desktop.getByText('结果仍待核实', { exact: false }).waitFor();
  assert.equal(isResourceLinked, true, 'the isolated link committed even though its response and first readback failed');
  assert.equal(topicResourceWrites.add, addWritesBeforeLostResponse + 1, 'lost link response produced exactly one write');
  assert.equal(topicResourceListReads, resourceReadsBeforeLostAdd + 1, 'the failed link is followed by one read-only verification attempt');
  await openResourcePicker.click();
  await resourceSearchInput.fill('隔离素材');
  await searchButton.click();
  const lockedAddButton = desktop.getByRole('button', { name: `等待核实关联：${linkedResource.title}`, exact: true });
  await lockedAddButton.waitFor();
  assert.equal(await lockedAddButton.isDisabled(), true, 'the target link stays locked until readback succeeds');
  await desktop.getByRole('dialog', { name: '关联资料' }).getByRole('button', { name: '关闭弹窗', exact: true }).click();
  const addRecoveryBeforeReload = await readResourceRecovery();
  assert.equal(addRecoveryBeforeReload.mutation, 'link');
  failNextTopicResourceRead = true;
  await desktop.reload();
  const addVerifyButton = desktop.getByRole('button', { name: `只读核实资料关联状态：${linkedResource.title}`, exact: true });
  await addVerifyButton.waitFor();
  assert.equal(topicResourceListReads, resourceReadsBeforeLostAdd + 2, 'refresh attempts only one read-only reconciliation and keeps the link marker when that read fails');
  assert.deepEqual(await readResourceRecovery(), addRecoveryBeforeReload, 'the same exact link marker survives refresh and a failed readback');
  assert.equal(topicResourceWrites.add, addWritesBeforeLostResponse + 1, 'refresh does not repeat an unresolved link write');
  await addVerifyButton.click();
  await desktop.getByText('关联已确认', { exact: true }).waitFor();
  await desktop.getByRole('link', { name: linkedResource.title, exact: true }).waitFor();
  assert.equal(topicResourceListReads, resourceReadsBeforeLostAdd + 3, 'manual recovery performs one additional read-only check');
  assert.equal(await desktop.evaluate((key) => window.sessionStorage.getItem(key), resourceRecoveryKey), null, 'confirmed recovery removes its local marker');
  assert.equal(topicResourceWrites.add, addWritesBeforeLostResponse + 1, 'link recovery sends no second write');
  await desktop.screenshot({ path: '/tmp/xmt-topic-stage-repair-1440.png', fullPage: true });
  await desktop.close();

  const blockedAdvance = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  blockedAdvance.on('pageerror', (error) => errors.push(error.message));
  blockedAdvance.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await blockedAdvance.goto(`${base}/__qa/${missingAdvanceTopic.id}`);
  await blockedAdvance.getByRole('heading', { name: missingAdvanceTopic.title }).waitFor();
  await blockedAdvance.getByRole('alert').getByText('请先补齐当前阶段记录，再推进到下一阶段。').waitFor();
  assert.equal(await blockedAdvance.getByRole('button', { name: '推进到下一阶段', exact: true }).count(), 0, 'desktop hides stage advance while the current stage record is missing');
  assert.equal(statusWrites.filter((write) => write.topicId === missingAdvanceTopic.id).length, 0, 'missing stage does not submit a transition');
  await blockedAdvance.getByRole('button', { name: '补齐成片制作记录', exact: true }).click();
  await blockedAdvance.getByRole('button', { name: '推进到下一阶段', exact: true }).waitFor();
  await blockedAdvance.getByRole('button', { name: '推进到下一阶段', exact: true }).click();
  await blockedAdvance.getByText('选题状态已更新', { exact: true }).waitFor();
  assert.deepEqual(statusWrites.filter((write) => write.topicId === missingAdvanceTopic.id), [{ topicId: missingAdvanceTopic.id, status: 'publishing' }], 'repair then retry submits one transition');
  assert.equal(missingAdvanceTopic.status, 'publishing');
  await blockedAdvance.close();

  const delayedDesktopAdvance = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  delayedDesktopAdvance.on('pageerror', (error) => errors.push(error.message));
  delayedDesktopAdvance.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await delayedDesktopAdvance.goto(`${base}/__qa/${desktopDelayedAdvanceTopic.id}`);
  await delayedDesktopAdvance.getByRole('heading', { name: desktopDelayedAdvanceTopic.title }).waitFor();
  const desktopAdvanceButton = delayedDesktopAdvance.getByRole('button', { name: '推进到下一阶段', exact: true });
  let resolveDesktopStatusSaveStarted!: () => void;
  const desktopStatusSaveStarted = new Promise<void>((resolve) => { resolveDesktopStatusSaveStarted = resolve; });
  topicStatusSaveStartedCallback = resolveDesktopStatusSaveStarted;
  holdNextTopicStatusSave = true;
  const desktopStatusAttemptsBefore = topicStatusSaveAttempts;
  await desktopAdvanceButton.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await desktopStatusSaveStarted;
  const pendingDesktopAdvance = delayedDesktopAdvance.getByRole('button', { name: '阶段处理中…', exact: true });
  await pendingDesktopAdvance.waitFor();
  assert.equal(await pendingDesktopAdvance.isDisabled(), true, 'desktop stage advance stays disabled until server confirmation');
  assert.equal(topicStatusSaveAttempts, desktopStatusAttemptsBefore + 1, 'two synchronous desktop clicks send one stage request');
  releaseTopicStatusSave?.();
  releaseTopicStatusSave = null;
  await delayedDesktopAdvance.getByText('选题状态已更新', { exact: true }).waitFor();
  assert.deepEqual(statusWrites.filter((write) => write.topicId === desktopDelayedAdvanceTopic.id), [{ topicId: desktopDelayedAdvanceTopic.id, status: 'publishing' }], 'desktop delayed stage advance writes exactly once');
  await delayedDesktopAdvance.close();

  const committedDesktopAdvance = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const committedDesktopStatusHttpErrors: string[] = [];
  const committedDesktopStatusConsoleErrors: string[] = [];
  committedDesktopAdvance.on('pageerror', (error) => errors.push(error.message));
  committedDesktopAdvance.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) committedDesktopStatusConsoleErrors.push(message.text());
    else errors.push(message.text());
  });
  committedDesktopAdvance.on('response', (response) => {
    if (response.status() < 400) return;
    if (response.status() === 503 && response.url().endsWith(`/api/topics/${desktopCommittedAdvanceTopic.id}/status`)) {
      committedDesktopStatusHttpErrors.push(response.url());
    } else errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  await committedDesktopAdvance.goto(`${base}/__qa/${desktopCommittedAdvanceTopic.id}?statusOutcome=committed-response-lost`);
  await committedDesktopAdvance.getByRole('heading', { name: desktopCommittedAdvanceTopic.title }).waitFor();
  const committedDesktopStatusButton = committedDesktopAdvance.getByRole('button', { name: '推进到下一阶段', exact: true });
  const committedStatusAttemptsBefore = topicStatusSaveAttempts;
  const committedStatusReadsBefore = desktopTopicStatusFixtureReads.get(desktopCommittedAdvanceTopic.id) ?? 0;
  const committedStatusWritesBefore = statusWrites.filter((write) => write.topicId === desktopCommittedAdvanceTopic.id).length;
  await committedDesktopStatusButton.click();
  await committedDesktopAdvance.getByText(/服务端结果已只读确认/).waitFor();
  assert.equal(desktopCommittedAdvanceTopic.status, 'publishing', 'read-back confirms the desktop stage transition committed before its response was lost');
  assert.equal(topicStatusSaveAttempts - committedStatusAttemptsBefore, 1, 'a committed desktop transition is not submitted again after a lost response');
  assert.equal((desktopTopicStatusFixtureReads.get(desktopCommittedAdvanceTopic.id) ?? 0) - committedStatusReadsBefore, 1, 'a lost response is resolved with one read-only topic GET');
  assert.equal(statusWrites.filter((write) => write.topicId === desktopCommittedAdvanceTopic.id).length - committedStatusWritesBefore, 1, 'the committed desktop transition is written exactly once');
  assert.equal(committedDesktopStatusHttpErrors.length, 1, 'only the committed transition response is intentionally lost');
  assert.equal(committedDesktopStatusConsoleErrors.length, 1, 'only the injected committed transition 503 appears in the console');
  await committedDesktopAdvance.close();

  const retryDesktopAdvance = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const retryDesktopStatusHttpErrors: string[] = [];
  const retryDesktopStatusConsoleErrors: string[] = [];
  retryDesktopAdvance.on('pageerror', (error) => errors.push(error.message));
  retryDesktopAdvance.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) retryDesktopStatusConsoleErrors.push(message.text());
    else errors.push(message.text());
  });
  retryDesktopAdvance.on('response', (response) => {
    if (response.status() < 400) return;
    const isExpectedStatusFailure = response.status() === 503
      && (response.url().endsWith(`/api/topics/${desktopReadbackRetryAdvanceTopic.id}/status`)
        || response.url().endsWith(`/api/topics/${desktopReadbackRetryAdvanceTopic.id}`));
    if (isExpectedStatusFailure) retryDesktopStatusHttpErrors.push(response.url());
    else errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  await retryDesktopAdvance.goto(`${base}/__qa/${desktopReadbackRetryAdvanceTopic.id}?statusOutcome=uncommitted-response-lost-once`);
  await retryDesktopAdvance.getByRole('heading', { name: desktopReadbackRetryAdvanceTopic.title }).waitFor();
  const retryDesktopStatusButton = retryDesktopAdvance.getByRole('button', { name: '推进到下一阶段', exact: true });
  const retryStatusAttemptsBefore = topicStatusSaveAttempts;
  const retryStatusReadsBefore = desktopTopicStatusFixtureReads.get(desktopReadbackRetryAdvanceTopic.id) ?? 0;
  const retryStatusWritesBefore = statusWrites.filter((write) => write.topicId === desktopReadbackRetryAdvanceTopic.id).length;
  await retryDesktopStatusButton.click();
  const pendingStatusRecovery = retryDesktopAdvance.getByRole('alert').filter({ hasText: '状态更新结果暂时无法确认' });
  await pendingStatusRecovery.waitFor();
  const lockedDesktopStatusButton = retryDesktopAdvance.getByRole('button', { name: '先核实状态', exact: true });
  assert.equal(await lockedDesktopStatusButton.isDisabled(), true, 'a failed initial read-back keeps the desktop stage action locked');
  assert.equal(topicStatusSaveAttempts - retryStatusAttemptsBefore, 1, 'the first ambiguous desktop write is not automatically retried');
  assert.equal(statusWrites.filter((write) => write.topicId === desktopReadbackRetryAdvanceTopic.id).length - retryStatusWritesBefore, 0, 'the first fixture response is lost before any stage write');
  assert.equal((desktopTopicStatusFixtureReads.get(desktopReadbackRetryAdvanceTopic.id) ?? 0) - retryStatusReadsBefore, 1, 'the failed write is followed by one read-only GET that fails');

  await retryDesktopAdvance.getByRole('button', { name: '返回列表', exact: true }).click();
  const statusLeaveDialog = retryDesktopAdvance.getByRole('dialog', { name: '阶段更新结果尚未核实' });
  await statusLeaveDialog.waitFor();
  await statusLeaveDialog.getByRole('button', { name: '留在本页核实' }).click();
  assert.equal(new URL(retryDesktopAdvance.url()).pathname, `/topics/${desktopReadbackRetryAdvanceTopic.id}`, 'canceling status recovery navigation keeps the topic detail open');
  assert.equal(await lockedDesktopStatusButton.isDisabled(), true, 'canceling navigation keeps status writes locked');
  assert.equal(await retryDesktopAdvance.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }), true, 'pending stage recovery warns before refresh or tab close');

  const attemptsBeforeManualVerification = topicStatusSaveAttempts;
  const readsBeforeManualVerification = desktopTopicStatusFixtureReads.get(desktopReadbackRetryAdvanceTopic.id) ?? 0;
  await pendingStatusRecovery.getByRole('button', { name: '只读核实状态', exact: true }).click();
  await retryDesktopAdvance.getByText(/服务器仍显示.*没有自动重发/).waitFor();
  assert.equal(await retryDesktopStatusButton.isDisabled(), false, 'read-back confirming the original state unlocks the action for deliberate retry');
  assert.equal(topicStatusSaveAttempts, attemptsBeforeManualVerification, 'manual status verification sends no write request');
  assert.equal((desktopTopicStatusFixtureReads.get(desktopReadbackRetryAdvanceTopic.id) ?? 0) - readsBeforeManualVerification, 1, 'manual recovery performs only one additional GET');
  assert.equal(statusWrites.filter((write) => write.topicId === desktopReadbackRetryAdvanceTopic.id).length - retryStatusWritesBefore, 0, 'read-only verification leaves the original state unchanged');

  const topicStatusRecoveryKey = `xmt:topic-status-pending:v1:user:${editor.id}:topic:${desktopReadbackRetryAdvanceTopic.id}`;
  await retryDesktopAdvance.evaluate(({ key, topicId, userId }) => {
    sessionStorage.setItem(key, JSON.stringify({
      kind: 'write', topicId, userId, before: 'shooting', target: 'publishing', createdAt: Date.now(),
    }));
  }, { key: topicStatusRecoveryKey, topicId: desktopReadbackRetryAdvanceTopic.id, userId: editor.id });
  const reloadStatusAttemptsBefore = topicStatusSaveAttempts;
  const reloadStatusReadsBefore = desktopTopicStatusFixtureReads.get(desktopReadbackRetryAdvanceTopic.id) ?? 0;
  retryDesktopAdvance.on('dialog', (dialog) => { void dialog.accept(); });
  await retryDesktopAdvance.reload();
  await retryDesktopAdvance.getByRole('heading', { name: desktopReadbackRetryAdvanceTopic.title }).waitFor();
  await retryDesktopAdvance.getByText(/服务器仍显示.*没有自动重发/).waitFor();
  retryDesktopAdvance.removeAllListeners('dialog');
  assert.equal(topicStatusSaveAttempts, reloadStatusAttemptsBefore, 'refresh recovery performs no status POST');
  assert.ok((desktopTopicStatusFixtureReads.get(desktopReadbackRetryAdvanceTopic.id) ?? 0) > reloadStatusReadsBefore, 'refresh recovery reads the latest server status');
  assert.equal(await retryDesktopAdvance.evaluate((key) => sessionStorage.getItem(key), topicStatusRecoveryKey), null, 'confirmed refresh recovery clears the scoped marker');
  assert.equal(await retryDesktopAdvance.getByRole('button', { name: '推进到下一阶段', exact: true }).isDisabled(), false, 'read-back of the original stage unlocks a deliberate retry');

  const writesBeforeExpiredMarker = topicStatusSaveAttempts;
  await retryDesktopAdvance.evaluate(({ key, topicId, userId }) => {
    sessionStorage.setItem(key, JSON.stringify({
      kind: 'write', topicId, userId, before: 'shooting', target: 'publishing', createdAt: Date.now() - (31 * 24 * 60 * 60 * 1000),
    }));
  }, { key: topicStatusRecoveryKey, topicId: desktopReadbackRetryAdvanceTopic.id, userId: editor.id });
  await retryDesktopAdvance.reload();
  await retryDesktopAdvance.getByRole('heading', { name: desktopReadbackRetryAdvanceTopic.title }).waitFor();
  await retryDesktopAdvance.getByText(/阶段核实记录已处理/).waitFor();
  assert.equal(topicStatusSaveAttempts, writesBeforeExpiredMarker, 'expired recovery marker triggers only a read-only status check');
  assert.equal(await retryDesktopAdvance.evaluate((key) => sessionStorage.getItem(key), topicStatusRecoveryKey), null, 'read-only check removes an expired marker');

  const writesBeforeCorruptMarker = topicStatusSaveAttempts;
  await retryDesktopAdvance.evaluate((key) => sessionStorage.setItem(key, '{invalid-json'), topicStatusRecoveryKey);
  await retryDesktopAdvance.reload();
  await retryDesktopAdvance.getByRole('heading', { name: desktopReadbackRetryAdvanceTopic.title }).waitFor();
  await retryDesktopAdvance.getByText(/阶段核实记录已处理/).waitFor();
  assert.equal(topicStatusSaveAttempts, writesBeforeCorruptMarker, 'corrupt recovery marker triggers only a read-only status check');
  assert.equal(await retryDesktopAdvance.evaluate((key) => sessionStorage.getItem(key), topicStatusRecoveryKey), null, 'read-only check removes a corrupt marker');

  await retryDesktopStatusButton.click();
  await retryDesktopAdvance.getByText('选题状态已更新', { exact: true }).waitFor();
  assert.equal(topicStatusSaveAttempts - retryStatusAttemptsBefore, 2, 'the second write occurs only after explicit user confirmation');
  assert.equal(statusWrites.filter((write) => write.topicId === desktopReadbackRetryAdvanceTopic.id).length - retryStatusWritesBefore, 1, 'explicit retry performs one actual status write');
  assert.equal(desktopReadbackRetryAdvanceTopic.status, 'publishing', 'the explicit retry applies the requested stage transition');
  assert.ok((desktopTopicStatusFixtureReads.get(desktopReadbackRetryAdvanceTopic.id) ?? 0) - retryStatusReadsBefore >= 5, 'manual and refresh recovery, explicit retry confirmation, and post-success refresh use GET only');
  assert.equal(retryDesktopStatusHttpErrors.length, 2, 'only the injected status POST and first verification GET fail');
  assert.equal(retryDesktopStatusConsoleErrors.length, 2, 'the two expected 503 fixture responses are the only status console errors');
  await retryDesktopAdvance.close();

  const completed = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  completed.on('pageerror', (error) => errors.push(error.message));
  completed.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await completed.goto(`${base}/__qa/${completedTopic.id}`);
  await completed.getByRole('heading', { name: completedTopic.title }).waitFor();
  await completed.getByRole('alert').getByText('请先核对发布历史').waitFor();
  assert.equal(await completed.getByRole('button', { name: /补齐发布记录/ }).count(), 0, 'completed topics never offer fabricated publishing history');
  await completed.screenshot({ path: '/tmp/xmt-topic-stage-repair-completed-1440.png', fullPage: true });
  await completed.close();

  const readonly = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  readonly.on('pageerror', (error) => errors.push(error.message));
  readonly.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await readonly.goto(`${base}/__qa-viewer/${productionTopic.id}`);
  await readonly.getByRole('heading', { name: productionTopic.title }).waitFor();
  await readonly.getByRole('status').getByText('当前账号仅可查看此选题', { exact: true }).waitFor();
  assert.equal(await readonly.getByText('无编辑权限', { exact: true }).count(), 0, 'read-only details do not expose an access-control label');
  assert.equal(await readonly.getByRole('button', { name: '编辑选题', exact: true }).count(), 0, 'read-only details do not render a disabled-looking edit action');
  assert.equal(await readonly.getByRole('button', { name: '补齐创作稿记录', exact: true }).count(), 0, 'read-only details do not offer record repair');
  await readonly.screenshot({ path: '/tmp/xmt-topic-readonly-1440.png', fullPage: true });
  await readonly.getByRole('button', { name: '返回列表' }).click();
  await readonly.waitForURL(/\/topics(?:\?.*)?$/);
  await readonly.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobile.on('pageerror', (error) => errors.push(error.message));
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mobile.goto(`${base}/__qa/${mobileTopic.id}`);
  await mobile.getByRole('textbox', { name: '选题标题' }).waitFor();
  await mobile.getByRole('alert').getByText('当前阶段缺少创作稿记录').waitFor();
  const mobileHistoryBeforeRepair = await mobile.locator('body').innerText();
  assert.match(mobileHistoryBeforeRepair, /创作状态调整/, `mobile topic history did not render the production status action: ${mobileHistoryBeforeRepair}`);
  await mobile.getByRole('button', { name: '补齐创作稿记录', exact: true }).click();
  await mobile.getByText('阶段记录已补齐；选题阶段未变更，操作已记入历史。', { exact: true }).waitFor();
  const mobileHistoryAfterRepair = await mobile.locator('body').innerText();
  assert.match(mobileHistoryAfterRepair, /创作状态调整/, `mobile topic history lost the production status action after refresh: ${mobileHistoryAfterRepair}`);
  assert.match(mobileHistoryAfterRepair, /创作记录 #18 状态由「草稿」变更为「审核中」/);
  assert.equal(await mobile.getByRole('alert').count(), 0, 'a successful mobile repair refreshes the missing-record warning');
  assert.equal(mobileTopic.status, 'production', 'mobile repair keeps the active Topic stage unchanged');
  assert.deepEqual(repairedStages, ['production', 'shooting', 'production'], 'desktop and mobile repair actions create only their missing current-stage records');
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the topic detail fits a 390px viewport without horizontal overflow');
  const mobileDraftTitle = `${mobileTopic.title}（移动未保存）`;
  await mobile.getByRole('textbox', { name: '选题标题' }).fill(mobileDraftTitle);
  await mobile.getByRole('button', { name: '选题', exact: true }).click();
  const mobileRouteConfirmation = mobile.getByRole('dialog', { name: '选题修改已保存在本机' });
  await mobileRouteConfirmation.waitFor();
  assert.equal(new URL(mobile.url()).pathname, `/topics/${mobileTopic.id}`, 'mobile route navigation stays on the local topic draft until confirmation');
  await mobileRouteConfirmation.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.equal(new URL(mobile.url()).pathname, `/topics/${mobileTopic.id}`, 'cancelling the route confirmation keeps the current topic open');
  assert.equal(await mobile.getByRole('textbox', { name: '选题标题' }).inputValue(), mobileDraftTitle, 'cancelling keeps the local topic edit intact');
  assert.equal(new URL(mobile.url()).pathname, `/topics/${mobileTopic.id}`, 'canceling mobile navigation stays on the topic detail');
  assert.equal(await mobile.getByRole('textbox', { name: '选题标题' }).inputValue(), mobileDraftTitle, 'canceling mobile navigation preserves the local topic draft');
  await mobile.screenshot({ path: '/tmp/xmt-topic-stage-repair-390.png', fullPage: true });

  const mobileBlockedAdvance = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobileBlockedAdvance.on('pageerror', (error) => errors.push(error.message));
  mobileBlockedAdvance.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mobileBlockedAdvance.goto(`${base}/__qa/${mobileMissingAdvanceTopic.id}`);
  await mobileBlockedAdvance.getByRole('textbox', { name: '选题标题' }).waitFor();
  await mobileBlockedAdvance.getByRole('alert').getByText('请先补齐当前阶段记录，再推进到下一阶段。').waitFor();
  assert.equal(await mobileBlockedAdvance.getByRole('button', { name: '进入发布', exact: true }).count(), 0, 'mobile hides stage advance while the current stage record is missing');
  assert.equal(statusWrites.filter((write) => write.topicId === mobileMissingAdvanceTopic.id).length, 0, 'mobile missing stage does not submit a transition');
  await mobileBlockedAdvance.getByRole('button', { name: '补齐成片制作记录', exact: true }).click();
  await mobileBlockedAdvance.getByRole('button', { name: '进入发布', exact: true }).waitFor();
  await mobileBlockedAdvance.getByRole('button', { name: '进入发布', exact: true }).click();
  await mobileBlockedAdvance.getByRole('status').getByText('已推进至发布中', { exact: true }).waitFor();
  assert.equal(await mobileBlockedAdvance.getByRole('alert').count(), 0, 'successful transition reflects the server-created target-stage record locally');
  await mobileBlockedAdvance.getByRole('button', { name: '标记完成', exact: true }).waitFor();
  assert.deepEqual(statusWrites.filter((write) => write.topicId === mobileMissingAdvanceTopic.id), [{ topicId: mobileMissingAdvanceTopic.id, status: 'publishing' }], 'mobile repair then retry submits one transition');
  assert.equal(mobileMissingAdvanceTopic.status, 'publishing');
  await mobileBlockedAdvance.close();

  const delayedMobileAdvance = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  delayedMobileAdvance.on('pageerror', (error) => errors.push(error.message));
  delayedMobileAdvance.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await delayedMobileAdvance.goto(`${base}/__qa/${mobileDelayedAdvanceTopic.id}`);
  await delayedMobileAdvance.getByRole('textbox', { name: '选题标题' }).waitFor();
  const mobileAdvanceButton = delayedMobileAdvance.getByRole('button', { name: '进入发布', exact: true });
  let resolveMobileStatusSaveStarted!: () => void;
  const mobileStatusSaveStarted = new Promise<void>((resolve) => { resolveMobileStatusSaveStarted = resolve; });
  topicStatusSaveStartedCallback = resolveMobileStatusSaveStarted;
  holdNextTopicStatusSave = true;
  const mobileStatusAttemptsBefore = topicStatusSaveAttempts;
  await mobileAdvanceButton.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await mobileStatusSaveStarted;
  const pendingMobileAdvance = delayedMobileAdvance.getByRole('button', { name: '正在推进阶段…', exact: true });
  await pendingMobileAdvance.waitFor();
  assert.equal(await pendingMobileAdvance.isDisabled(), true, 'mobile stage advance stays disabled until server confirmation');
  assert.equal(topicStatusSaveAttempts, mobileStatusAttemptsBefore + 1, 'two synchronous mobile clicks send one stage request');
  releaseTopicStatusSave?.();
  releaseTopicStatusSave = null;
  await delayedMobileAdvance.getByRole('status').getByText('已推进至发布中', { exact: true }).waitFor();
  assert.deepEqual(statusWrites.filter((write) => write.topicId === mobileDelayedAdvanceTopic.id), [{ topicId: mobileDelayedAdvanceTopic.id, status: 'publishing' }], 'mobile delayed stage advance writes exactly once');
  await delayedMobileAdvance.close();

  const delayedMobileSave = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  delayedMobileSave.on('pageerror', (error) => errors.push(error.message));
  delayedMobileSave.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await delayedMobileSave.goto(`${base}/__qa/${mobileDelayedSaveTopic.id}`);
  await delayedMobileSave.getByRole('textbox', { name: '选题标题' }).waitFor();
  const revisedMobileTitle = `${mobileDelayedSaveTopic.title}（已保存）`;
  await delayedMobileSave.getByRole('textbox', { name: '选题标题' }).fill(revisedMobileTitle);
  const mobileSaveButton = delayedMobileSave.getByRole('button', { name: '保存修改', exact: true });
  let resolveMobileTopicSaveStarted!: () => void;
  const mobileTopicSaveStarted = new Promise<void>((resolve) => { resolveMobileTopicSaveStarted = resolve; });
  mobileTopicSaveStartedCallback = resolveMobileTopicSaveStarted;
  holdNextMobileTopicSave = true;
  const mobileTopicSaveAttemptsBefore = mobileTopicSaveAttempts;
  await mobileSaveButton.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await mobileTopicSaveStarted;
  const pendingMobileSave = delayedMobileSave.getByRole('button', { name: '保存中…', exact: true });
  await pendingMobileSave.waitFor();
  assert.equal(await pendingMobileSave.isDisabled(), true, 'mobile detail save stays disabled until server confirmation');
  assert.equal(mobileTopicSaveAttempts, mobileTopicSaveAttemptsBefore + 1, 'two synchronous mobile save clicks send one request');
  releaseMobileTopicSave?.();
  releaseMobileTopicSave = null;
  await delayedMobileSave.getByRole('status').getByText('已保存', { exact: true }).waitFor();
  assert.equal(mobileDelayedSaveTopic.title, revisedMobileTitle, 'the one confirmed mobile save updates the isolated topic');
  assert.equal(mobileTopicSaveAttempts, mobileTopicSaveAttemptsBefore + 1, 'mobile detail save is not repeated after confirmation');
  await delayedMobileSave.close();

  const watchMobileEditPage = (page: import('playwright').Page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('status of 503 (Service Unavailable)')) errors.push(message.text());
    });
  };

  const committedEditPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  watchMobileEditPage(committedEditPage);
  await committedEditPage.goto(`${base}/__qa/${mobileEditCommittedTopic.id}?editOutcome=committed-response-lost`);
  await committedEditPage.getByRole('textbox', { name: '选题标题' }).waitFor();
  const committedReadCountBeforeSave = mobileTopicEditReadAttempts.get(mobileEditCommittedTopic.id) ?? 0;
  const committedEditTitle = `${mobileEditCommittedTopic.title}（本地修改）`;
  await committedEditPage.getByRole('textbox', { name: '选题标题' }).fill(committedEditTitle);
  await committedEditPage.getByRole('button', { name: '保存修改', exact: true }).click();
  await committedEditPage.getByRole('status').getByText('只读核实已确认选题内容保存成功；没有重复提交。', { exact: true }).waitFor();
  assert.equal(mobileEditCommittedTopic.title, committedEditTitle, 'a lost save response is confirmed by the existing topic GET');
  assert.equal(mobileTopicEditSaveAttempts.get(mobileEditCommittedTopic.id), 1, 'a committed response-lost save sends one PUT only');
  assert.equal(mobileTopicEditWrites.get(mobileEditCommittedTopic.id), 1, 'the fixture applies the lost-response save exactly once');
  assert.equal(mobileTopicEditReadAttempts.get(mobileEditCommittedTopic.id), committedReadCountBeforeSave + 1, 'the ambiguous save triggers exactly one additional read-only verification');
  await committedEditPage.close();

  const retryEditPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  watchMobileEditPage(retryEditPage);
  await retryEditPage.goto(`${base}/__qa/${mobileEditRetryTopic.id}?editOutcome=unchanged-once`);
  await retryEditPage.getByRole('textbox', { name: '选题标题' }).waitFor();
  const retryReadCountBeforeSave = mobileTopicEditReadAttempts.get(mobileEditRetryTopic.id) ?? 0;
  const retryEditTitle = `${mobileEditRetryTopic.title}（明确重试）`;
  await retryEditPage.getByRole('textbox', { name: '选题标题' }).fill(retryEditTitle);
  await retryEditPage.getByRole('button', { name: '保存修改', exact: true }).click();
  await retryEditPage.getByRole('status').getByText('只读核实确认服务端内容仍是原版本；本次没有保存，也没有自动重发。请核对本地修改后再明确点击保存。', { exact: true }).waitFor();
  assert.equal(mobileTopicEditSaveAttempts.get(mobileEditRetryTopic.id), 1, 'an unchanged server record does not trigger an automatic retry');
  assert.equal(mobileTopicEditWrites.get(mobileEditRetryTopic.id), 0, 'the first retry fixture request leaves the server unchanged');
  assert.equal(mobileTopicEditReadAttempts.get(mobileEditRetryTopic.id), retryReadCountBeforeSave + 1, 'the failed save is followed by one read-only verification');
  assert.equal(await retryEditPage.getByRole('textbox', { name: '选题标题' }).inputValue(), retryEditTitle, 'the local title draft remains available for review');
  await retryEditPage.getByRole('button', { name: '保存修改', exact: true }).click();
  await retryEditPage.getByRole('status').getByText('已保存', { exact: true }).waitFor();
  assert.equal(mobileTopicEditSaveAttempts.get(mobileEditRetryTopic.id), 2, 'only the explicit user click sends the retry');
  assert.equal(mobileTopicEditWrites.get(mobileEditRetryTopic.id), 1, 'the explicit retry applies the draft once');
  await retryEditPage.close();

  const readFailureEditPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  watchMobileEditPage(readFailureEditPage);
  await readFailureEditPage.goto(`${base}/__qa/${mobileEditReadFailureTopic.id}?editOutcome=read-fails-once`);
  await readFailureEditPage.getByRole('textbox', { name: '选题标题' }).waitFor();
  await readFailureEditPage.waitForLoadState('networkidle');
  const readFailureCountBeforeSave = mobileTopicEditReadAttempts.get(mobileEditReadFailureTopic.id) ?? 0;
  const readFailureTitle = `${mobileEditReadFailureTopic.title}（保留修改）`;
  await readFailureEditPage.getByRole('textbox', { name: '选题标题' }).fill(readFailureTitle);
  await readFailureEditPage.getByRole('button', { name: '保存修改', exact: true }).click();
  await readFailureEditPage.getByRole('alert').getByText(/选题内容保存结果暂时无法确认/).waitFor();
  assert.equal(await readFailureEditPage.getByRole('button', { name: '保存修改', exact: true }).isDisabled(), true, 'a failed readback locks further writes');
  assert.equal(mobileTopicEditSaveAttempts.get(mobileEditReadFailureTopic.id), 1, 'a failed readback does not retry the PUT');
  const readFailureCountAfterFirstRecovery = mobileTopicEditReadAttempts.get(mobileEditReadFailureTopic.id) ?? 0;
  assert.equal(readFailureCountAfterFirstRecovery, readFailureCountBeforeSave + 1, 'the failed recovery path performs one additional GET-only readback');
  readFailureEditPage.once('dialog', (dialog) => { void dialog.accept(); });
  await readFailureEditPage.reload();
  await readFailureEditPage.getByRole('status').getByText('只读核实已确认选题内容保存成功；没有重复提交。', { exact: true }).waitFor();
  assert.equal(mobileTopicEditSaveAttempts.get(mobileEditReadFailureTopic.id), 1, 'reopening after read failure resumes with GET only');
  assert.ok((mobileTopicEditReadAttempts.get(mobileEditReadFailureTopic.id) ?? 0) > readFailureCountAfterFirstRecovery, 'reopening performs a read-only recovery request');
  assert.equal(await readFailureEditPage.evaluate(() => localStorage.getItem('xmt:mobile-topic-edit-recovery:v1:user:93:topic:958')), null, 'confirmed recovery removes the account-scoped uncertainty marker');
  await readFailureEditPage.close();

  const conflictEditPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  watchMobileEditPage(conflictEditPage);
  await conflictEditPage.goto(`${base}/__qa/${mobileEditConflictTopic.id}?editOutcome=concurrent-change`);
  await conflictEditPage.getByRole('textbox', { name: '选题标题' }).waitFor();
  const conflictDraftTitle = `${mobileEditConflictTopic.title}（本地草稿）`;
  await conflictEditPage.getByRole('textbox', { name: '选题标题' }).fill(conflictDraftTitle);
  await conflictEditPage.getByRole('button', { name: '保存修改', exact: true }).click();
  await conflictEditPage.getByRole('alert').getByText('服务端标题：服务端并发更新标题').waitFor();
  assert.equal(await conflictEditPage.getByRole('textbox', { name: '选题标题' }).inputValue(), conflictDraftTitle, 'the local title draft is preserved when the server has diverged');
  assert.equal(mobileTopicEditSaveAttempts.get(mobileEditConflictTopic.id), 1, 'concurrent content is not overwritten by an automatic retry');
  assert.equal(mobileTopicEditWrites.get(mobileEditConflictTopic.id), 0, 'the conflict fixture does not apply the submitted draft');
  assert.equal(await conflictEditPage.getByRole('button', { name: '保存修改', exact: true }).isDisabled(), true, 'the user must resolve the visible conflict before saving');
  await conflictEditPage.getByRole('button', { name: '保留本地修改继续编辑', exact: true }).click();
  await conflictEditPage.getByRole('status').getByText('已保留本地修改；你可以继续编辑，只有再次明确点击保存时才会提交。', { exact: true }).waitFor();
  assert.equal(await conflictEditPage.getByRole('button', { name: '保存修改', exact: true }).isEnabled(), true, 'the user can explicitly choose to continue with the local draft');
  await conflictEditPage.close();

  const delayedMobileRepair = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  delayedMobileRepair.on('pageerror', (error) => errors.push(error.message));
  delayedMobileRepair.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await delayedMobileRepair.goto(`${base}/__qa/${mobileDelayedRepairTopic.id}`);
  await delayedMobileRepair.getByRole('textbox', { name: '选题标题' }).waitFor();
  const mobileRepairButton = delayedMobileRepair.getByRole('button', { name: '补齐成片制作记录', exact: true });
  let resolveMobileStageRepairStarted!: () => void;
  const mobileStageRepairStarted = new Promise<void>((resolve) => { resolveMobileStageRepairStarted = resolve; });
  mobileStageRepairStartedCallback = resolveMobileStageRepairStarted;
  holdNextMobileStageRepair = true;
  const mobileStageRepairAttemptsBefore = mobileStageRepairAttempts;
  await mobileRepairButton.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await mobileStageRepairStarted;
  const pendingMobileRepair = delayedMobileRepair.getByRole('button', { name: '正在补齐…', exact: true });
  await pendingMobileRepair.waitFor();
  assert.equal(await pendingMobileRepair.isDisabled(), true, 'mobile stage-record repair stays disabled until server confirmation');
  assert.equal(mobileStageRepairAttempts, mobileStageRepairAttemptsBefore + 1, 'two synchronous mobile repair clicks send one request');
  releaseMobileStageRepair?.();
  releaseMobileStageRepair = null;
  await delayedMobileRepair.getByText('阶段记录已补齐；选题阶段未变更，操作已记入历史。', { exact: true }).waitFor();
  assert.equal(mobileDelayedRepairTopic.stage_record_presence.shooting, true, 'the one confirmed repair creates the current-stage record');
  assert.equal(mobileStageRepairAttempts, mobileStageRepairAttemptsBefore + 1, 'mobile stage-record repair is not repeated after confirmation');
  await delayedMobileRepair.close();

  auditTopic.status = 'pending';
  const mobileAudit = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobileAudit.on('pageerror', (error) => errors.push(error.message));
  mobileAudit.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const mobileAuditWritesBeforeNavigation = auditWrites.length;
  await mobileAudit.goto(`${base}/__qa/${auditTopic.id}`);
  await mobileAudit.getByRole('textbox', { name: '选题标题' }).waitFor();
  const collapsedMobileAuditToggle = mobileAudit.getByRole('button', { name: '开始审核', exact: true });
  await collapsedMobileAuditToggle.waitFor();
  assert.equal(await collapsedMobileAuditToggle.getAttribute('aria-expanded'), 'false', 'mobile audit disclosure reports its initial collapsed state');
  assert.equal(await collapsedMobileAuditToggle.getAttribute('aria-controls'), 'mobile-topic-audit-panel', 'mobile audit disclosure identifies its controlled panel');
  const mobileAuditPanel = mobileAudit.locator('#mobile-topic-audit-panel');
  assert.equal(await mobileAuditPanel.getAttribute('hidden'), '', 'the controlled audit panel remains in the document while collapsed');
  assert.equal(auditWrites.length, mobileAuditWritesBeforeNavigation, 'checking the initial audit disclosure does not write an audit');
  await collapsedMobileAuditToggle.click();
  const expandedMobileAuditToggle = mobileAudit.getByRole('button', { name: '收起审核', exact: true });
  assert.equal(await expandedMobileAuditToggle.getAttribute('aria-expanded'), 'true', 'mobile audit disclosure reports its expanded state');
  await mobileAuditPanel.waitFor({ state: 'visible' });
  await mobileAudit.getByRole('region', { name: '选题审核', exact: true }).waitFor();
  const mobileAuditResultGroup = mobileAuditPanel.getByRole('group', { name: '审核结果', exact: true });
  assert.equal(await mobileAuditResultGroup.getByRole('button').count(), 2, 'mobile audit decisions share a named result group');
  assert.equal(await mobileAuditResultGroup.getByRole('button', { name: '通过', exact: true }).getAttribute('aria-pressed'), 'true', 'mobile audit initially exposes approval as selected');
  assert.equal(await mobileAuditResultGroup.getByRole('button', { name: '驳回', exact: true }).getAttribute('aria-pressed'), 'false', 'mobile audit initially exposes rejection as unselected');
  await mobileAuditResultGroup.getByRole('button', { name: '驳回', exact: true }).click();
  await mobileAuditPanel.getByRole('textbox', { name: '审核意见（选填）' }).fill('折叠后应保留的合成审核意见');
  await expandedMobileAuditToggle.click();
  assert.equal(await mobileAudit.getByRole('button', { name: '开始审核', exact: true }).getAttribute('aria-expanded'), 'false', 'mobile audit disclosure reports its collapsed state after closing');
  assert.equal(await mobileAuditPanel.getAttribute('hidden'), '', 'collapsing the audit disclosure hides but does not remove its panel');
  assert.equal(await mobileAudit.getByRole('button', { name: '确认通过选题', exact: true }).count(), 0, 'collapsing the audit disclosure hides its submission action');
  await mobileAudit.getByRole('button', { name: '开始审核', exact: true }).click();
  assert.equal(await mobileAuditResultGroup.getByRole('button', { name: '通过', exact: true }).getAttribute('aria-pressed'), 'false', 'mobile audit collapse and reopen preserves the deselected approval');
  assert.equal(await mobileAuditResultGroup.getByRole('button', { name: '驳回', exact: true }).getAttribute('aria-pressed'), 'true', 'mobile audit decision survives collapse and reopen');
  assert.equal(await mobileAuditPanel.getByRole('textbox', { name: '审核意见（选填）' }).inputValue(), '折叠后应保留的合成审核意见', 'mobile audit comment survives collapse and reopen');
  assert.equal(auditWrites.length, mobileAuditWritesBeforeNavigation, 'opening and closing the audit disclosure never submits an audit');
  await mobileAudit.goto(`${base}/__qa/${auditTopic.id}?action=audit`);
  await mobileAudit.getByRole('textbox', { name: '选题标题' }).waitFor();
  await mobileAudit.waitForURL((url) => url.pathname === `/topics/${auditTopic.id}` && !url.searchParams.has('action'));
  const directReviewAuditToggle = mobileAudit.getByRole('button', { name: '收起审核', exact: true });
  await directReviewAuditToggle.waitFor();
  assert.equal(await directReviewAuditToggle.getAttribute('aria-expanded'), 'true', 'direct review navigation exposes its automatically expanded audit disclosure');
  const mobileAuditSubmit = mobileAudit.getByRole('button', { name: '确认通过选题', exact: true });
  await mobileAuditSubmit.waitFor();
  assert.equal(await mobileAudit.getByRole('button', { name: '开始审核', exact: true }).count(), 0, 'mobile direct review navigation expands the audit panel without a second click');
  assert.equal(auditTopic.status, 'pending', 'mobile direct review navigation does not submit an audit automatically');
  assert.equal(auditWrites.length, mobileAuditWritesBeforeNavigation, 'mobile direct review navigation performs no audit write');
  const mobileAuditWritesBeforeSubmit = auditWrites.filter((write) => write.topicId === auditTopic.id).length;
  let resolveMobileAuditSaveStarted!: () => void;
  const mobileAuditSaveStarted = new Promise<void>((resolve) => { resolveMobileAuditSaveStarted = resolve; });
  auditSaveStartedCallback = resolveMobileAuditSaveStarted;
  holdNextAuditSave = true;
  const mobileAuditAttemptsBefore = auditSaveAttempts;
  await mobileAuditSubmit.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await mobileAuditSaveStarted;
  const pendingMobileAudit = mobileAudit.getByRole('button', { name: '正在提交审核…', exact: true });
  await pendingMobileAudit.waitFor();
  assert.equal(await pendingMobileAudit.isDisabled(), true, 'mobile audit submit stays disabled while the request is pending');
  assert.equal(auditSaveAttempts, mobileAuditAttemptsBefore + 1, 'two synchronous mobile audit clicks send one request');
  releaseAuditSave?.();
  releaseAuditSave = null;
  await mobileAudit.getByRole('status').getByText('选题审核已通过', { exact: true }).waitFor();
  const auditWritesForTopic = auditWrites.filter((write) => write.topicId === auditTopic.id);
  assert.equal(auditWritesForTopic.length, mobileAuditWritesBeforeSubmit + 1, 'the delayed mobile audit submits exactly one write');
  assert.deepEqual(auditWritesForTopic.at(-1), { topicId: auditTopic.id, status: 'approved' }, 'mobile delayed audit writes one approved result');
  await mobileAudit.close();

  for (const theme of ['light', 'dark'] as const) {
    const leavePage = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    leavePage.on('pageerror', (error) => errors.push(error.message));
    leavePage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await leavePage.goto(`${base}/__qa/${leaveGuardTopic.id}?theme=${theme}`);
    await leavePage.getByRole('heading', { name: leaveGuardTopic.title }).waitFor();
    const nextStageAction = leavePage.getByRole('button', { name: '推进到下一阶段', exact: true });
    assert.ok((await nextStageAction.getAttribute('class'))?.includes('xmt-btn-primary'), `${theme}主题阶段推进使用统一主按钮令牌`);
    const nextStageStyle = await nextStageAction.evaluate((element) => ({ color: getComputedStyle(element).color, backgroundImage: getComputedStyle(element).backgroundImage }));
    assert.equal(nextStageStyle.color, 'rgb(255, 255, 255)', `${theme}主题阶段推进主操作保留白字`);
    assert.match(nextStageStyle.backgroundImage, /linear-gradient/, `${theme}主题阶段推进主操作使用主题令牌渐变`);
    await leavePage.getByRole('button', { name: '编辑选题', exact: true }).click();
    await leavePage.locator('input[type="text"]').first().fill(`${leaveGuardTopic.title}（本机测试）`);
    await leavePage.getByRole('button', { name: '返回列表' }).click();
    await leavePage.getByRole('heading', { name: '存在未保存的修改' }).waitFor();
    const discardButton = leavePage.getByRole('button', { name: '放弃离开', exact: true });
    const saveButton = leavePage.getByRole('button', { name: '保存并离开', exact: true });
    assert.ok((await discardButton.getAttribute('class'))?.includes('xmt-btn-danger'), `${theme}主题放弃离开操作使用危险按钮令牌`);
    assert.ok(await textContrast(discardButton) >= 4.5, `${theme}主题放弃离开文字对比度应不低于 4.5:1`);
    assert.ok((await saveButton.getAttribute('class'))?.includes('xmt-btn-primary'), `${theme}主题保存并离开操作使用主按钮令牌`);
    const saveStyle = await saveButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, backgroundImage: style.backgroundImage };
    });
    assert.equal(saveStyle.color, 'rgb(255, 255, 255)', `${theme}主题保存操作保留高对比白字`);
    assert.match(saveStyle.backgroundImage, /linear-gradient/, `${theme}主题保存操作使用主题主色渐变`);
    await leavePage.screenshot({ path: `/tmp/xmt-topic-leave-confirm-${theme}.png` });
    await leavePage.getByRole('button', { name: '继续编辑', exact: true }).click();
    await leavePage.getByRole('heading', { name: '存在未保存的修改' }).waitFor({ state: 'hidden' });

    if (theme === 'light') {
      // Create a real SPA history entry, then ensure browser POP and sidebar
      // navigation both reuse the page-owned unsaved-draft confirmation.
      await leavePage.reload();
      await leavePage.getByRole('heading', { name: leaveGuardTopic.title }).waitFor();
      await leavePage.getByRole('button', { name: '选题管理', exact: true }).click();
      await leavePage.waitForURL((url) => url.pathname === '/topics');
      await leavePage.getByRole('button', { name: leaveGuardTopic.title, exact: true }).click();
      await leavePage.waitForURL((url) => url.pathname === `/topics/${leaveGuardTopic.id}`);
      await leavePage.getByRole('button', { name: '编辑选题', exact: true }).click();
      const routeDraftTitle = `${leaveGuardTopic.title}（路由保护测试）`;
      await leavePage.locator('input[type="text"]').first().fill(routeDraftTitle);

      await leavePage.goBack();
      await leavePage.getByRole('heading', { name: '存在未保存的修改' }).waitFor();
      await leavePage.getByRole('button', { name: '继续编辑', exact: true }).click();
      await leavePage.getByRole('heading', { name: '存在未保存的修改' }).waitFor({ state: 'hidden' });
      assert.equal(await leavePage.locator('input[type="text"]').first().inputValue(), routeDraftTitle, 'canceling browser Back preserves the current topic draft');

      await leavePage.getByRole('button', { name: '灵感库', exact: true }).click();
      await leavePage.getByRole('heading', { name: '存在未保存的修改' }).waitFor();
      await leavePage.getByRole('button', { name: '继续编辑', exact: true }).click();
      await leavePage.getByRole('heading', { name: '存在未保存的修改' }).waitFor({ state: 'hidden' });
      assert.equal(await leavePage.locator('input[type="text"]').first().inputValue(), routeDraftTitle, 'canceling sidebar navigation preserves the current topic draft');

      await leavePage.getByRole('button', { name: '退出登录', exact: true }).click();
      await leavePage.getByRole('heading', { name: '存在未保存的修改' }).waitFor();
      await leavePage.getByRole('button', { name: '继续编辑', exact: true }).click();
      await leavePage.getByRole('heading', { name: '存在未保存的修改' }).waitFor({ state: 'hidden' });
      assert.notEqual(await leavePage.evaluate(() => localStorage.getItem('xmt_token')), null, 'canceling logout leaves the current session active');
    }

    await leavePage.close();
  }

  const savePage = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const expectedSaveHttpErrors: string[] = [];
  const expectedSaveConsoleErrors: string[] = [];
  savePage.on('pageerror', (error) => errors.push(error.message));
  savePage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedSaveConsoleErrors.push(message.text());
    else errors.push(message.text());
  });
  savePage.on('response', (response) => {
    if (response.status() < 400) return;
    const responseDescription = `${response.status()} ${response.url()}`;
    if (response.url().endsWith(`/api/topics/${saveTopic.id}`) && response.status() === 503) expectedSaveHttpErrors.push(responseDescription);
    else errors.push(`Unexpected HTTP error: ${responseDescription}`);
  });
  await savePage.goto(`${base}/__qa/${saveTopic.id}`);
  await savePage.getByRole('heading', { name: saveTopic.title }).waitFor();
  await savePage.getByRole('button', { name: '编辑选题', exact: true }).click();
  const savedTitle = `${saveTopic.title}（已保存）`;
  await savePage.locator('input[type="text"]').first().fill(savedTitle);
  failNextTopicRefreshForTopicId = saveTopic.id;
  await savePage.getByRole('button', { name: '保存', exact: true }).click();
  await savePage.getByText('服务端已确认保存，但页面刷新失败；当前内容已保留，请稍后重新加载确认，不要重复保存。', { exact: true }).waitFor();
  assert.equal(saveTopic.title, savedTitle, 'the isolated API confirms the topic update succeeded before refresh failed');
  assert.equal(await savePage.locator('[data-topic-dirty="false"]').count(), 1, 'the confirmed local snapshot is no longer incorrectly marked unsaved');
  assert.equal(topicSaveWrites, 1, 'a successful server write is not retried after refresh failure');
  await savePage.reload();
  await savePage.getByRole('heading', { name: savedTitle }).waitFor();
  assert.equal(topicSaveWrites, 1, 'reloading confirms the persisted edit without repeating the mutation');
  await savePage.getByRole('heading', { name: savedTitle, exact: true }).click();
  const titleOnlyTitle = `${savedTitle}（仅改标题）`;
  await savePage.locator('input[type="text"]').first().fill(titleOnlyTitle);
  assert.equal(await savePage.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, 'saving title-only edits does not wait for an outline editor runtime that is not mounted');
  await savePage.getByRole('button', { name: '保存', exact: true }).click();
  await savePage.getByRole('heading', { name: titleOnlyTitle, exact: true }).waitFor();
  assert.equal(topicSaveWrites, 2, 'title-only editing persists exactly once through the page aggregate');
  assert.equal(expectedSaveHttpErrors.length, 1, 'only the intentionally injected post-save refresh 503 is expected');
  assert.equal(expectedSaveConsoleErrors.length, 1, 'the only expected save-page console error is the injected refresh 503');
  await savePage.close();

  const manualSavePage = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  manualTopicVersions.splice(0, manualTopicVersions.length, {
    id: 1,
    document_type: 'topic_outline',
    document_id: String(manualSaveTopic.id),
    version: 'baseline',
    content: String(manualSaveTopic.outline ?? ''),
    change_type: 'baseline',
    is_baseline: 1,
    operator_id: null,
    operator_name: null,
    created_at: null,
  });
  const expectedManualSaveHttpErrors: string[] = [];
  const expectedManualSaveConsoleErrors: string[] = [];
  manualSavePage.on('pageerror', (error) => errors.push(error.message));
  manualSavePage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedManualSaveConsoleErrors.push(message.text());
    else errors.push(message.text());
  });
  manualSavePage.on('response', (response) => {
    if (response.status() < 400) return;
    const responseDescription = `${response.status()} ${response.url()}`;
    if ((response.url().endsWith(`/api/topics/${manualSaveTopic.id}`) || response.url().endsWith(`/api/topics/${manualSaveTopic.id}/versions`)) && response.status() === 503) expectedManualSaveHttpErrors.push(responseDescription);
    else errors.push(`Unexpected HTTP error: ${responseDescription}`);
  });
  await manualSavePage.goto(`${base}/__qa/${manualSaveTopic.id}`);
  await manualSavePage.getByRole('heading', { name: manualSaveTopic.title }).waitFor();
  await manualSavePage.getByRole('button', { name: '编辑选题', exact: true }).click();
  await manualSavePage.locator('[data-topic-manual-runtime="ready"]').waitFor();
  const outlineEditor = manualSavePage.locator('.ProseMirror').last();
  await outlineEditor.waitFor({ state: 'visible' });
  const outlineHistory = manualSavePage.getByRole('region', { name: '大纲版本历史' });
  await outlineHistory.getByText('历史原稿（时间未记录）', { exact: true }).waitFor();
  await outlineEditor.fill('手动保存失败后保留的选题大纲');
  failNextManualTopicSave = true;
  await manualSavePage.getByRole('button', { name: '保存', exact: true }).click();
  await manualSavePage.getByRole('alert').getByText(/保存未完成，当前修改仍保留：选题保存暂不可用/).waitFor();
  assert.match(await manualSavePage.locator('.ProseMirror').last().innerText(), /手动保存失败后保留的选题大纲/, 'a failed manual save keeps the current outline draft on screen');
  assert.equal(manualSaveTopic.outline, productionTopic.outline, 'the failed manual save does not alter the isolated server record');
  assert.equal(manualTopicSaveWrites, 1, 'the failed manual save issues only one write before the user retries');
  assert.equal(await manualSavePage.getByRole('button', { name: '保存', exact: true }).isDisabled(), true, 'the ordinary save action stays locked while the uncertain result requires explicit recovery');
  const manualSaveRecovery = manualSavePage.getByTestId('topic-save-recovery');
  const explicitManualRetry = manualSaveRecovery.getByRole('button', { name: '按当前本地内容保存', exact: true });
  await explicitManualRetry.waitFor({ state: 'visible' });
  await explicitManualRetry.click();
  await manualSavePage.getByRole('alert').waitFor({ state: 'detached' });
  assert.match(manualSaveTopic.outline, /手动保存失败后保留的选题大纲/, 'the explicit retry persists the preserved outline');
  assert.equal(manualTopicSaveWrites, 2, 'the retry is explicit and produces one additional write');
  await manualSavePage.getByRole('button', { name: '编辑选题', exact: true }).click();
  const versionOutlineEditor = manualSavePage.locator('[contenteditable="true"]').last();
  await versionOutlineEditor.fill('选题大纲版本快照正文');
  const versionReadsBeforeSave = manualTopicVersionReads;
  failNextManualTopicVersionsRead = true;
  await manualSavePage.getByRole('button', { name: '小版本保存', exact: true }).click();
  await outlineHistory.getByRole('alert').getByText('大纲版本历史读取失败，请重新加载。', { exact: true }).waitFor();
  assert.equal(manualTopicVersions.length, 2, 'the server commits the outline version before its independent history read fails');
  assert.equal(manualTopicVersionReads, versionReadsBeforeSave + 1, 'the failed history refresh issues one read after the version save');
  assert.equal(manualTopicSaveWrites, 3, 'a failed history refresh does not mark the confirmed version write as failed or repeat it');
  assert.equal(await outlineHistory.getByText('历史原稿（时间未记录）', { exact: true }).count(), 0, 'a failed refresh clears the previously loaded history instead of showing stale rows');
  assert.equal(await outlineHistory.getByText('v1.0 · 小版本', { exact: true }).count(), 0, 'a stale version list is not presented as the refreshed history');
  assert.equal(await outlineHistory.getByText('暂无已保存版本', { exact: true }).count(), 0, 'a failed read is not presented as a confirmed empty history');
  const manualWritesBeforeHistoryRetry = manualTopicSaveWrites;
  const versionReadsBeforeRetry = manualTopicVersionReads;
  const reloadHistoryButton = outlineHistory.getByRole('button', { name: '重新加载大纲历史', exact: true });
  const reloadHistoryBounds = await reloadHistoryButton.boundingBox();
  assert.ok(reloadHistoryBounds && reloadHistoryBounds.height >= 40, `history retry action has a 40px target: ${JSON.stringify(reloadHistoryBounds)}`);
  await reloadHistoryButton.click();
  await outlineHistory.getByText('v1.0 · 小版本', { exact: true }).waitFor();
  assert.equal(manualTopicVersionReads, versionReadsBeforeRetry + 1, 'the explicit recovery action retries only the read-only history request');
  assert.equal(manualTopicSaveWrites, manualWritesBeforeHistoryRetry, 'retrying history never resubmits the outline version write');
  const outlinePreviews = outlineHistory.getByText('查看此版本正文', { exact: true });
  assert.equal(await outlinePreviews.count(), 2, 'the initial outline is retained as a baseline beside the explicit version');
  const outlineVersionEntry = outlineHistory.getByRole('listitem').filter({ hasText: 'v1.0 · 小版本' });
  const outlineBaselineEntry = outlineHistory.getByRole('listitem').filter({ hasText: '历史原稿（时间未记录）' });
  const outlineVersionSummary = outlineVersionEntry.getByText('查看此版本正文', { exact: true });
  const outlineVersionSummaryBounds = await outlineVersionSummary.boundingBox();
  assert.ok(outlineVersionSummaryBounds && outlineVersionSummaryBounds.height >= 40, `version disclosure action has a 40px target: ${JSON.stringify(outlineVersionSummaryBounds)}`);
  await outlineBaselineEntry.getByText('查看此版本正文', { exact: true }).click();
  await outlineBaselineEntry.getByText('手动保存失败后保留的选题大纲', { exact: true }).waitFor();
  await outlineVersionEntry.getByText('查看此版本正文', { exact: true }).click();
  await outlineVersionEntry.getByText('选题大纲版本快照正文', { exact: true }).waitFor();
  assert.equal(manualTopicSaveWrites, 3, 'explicit version creation submits exactly one additional update');
  assert.equal(expectedManualSaveHttpErrors.length, 2, 'the manual-save and independent history-read 503s are the only expected HTTP errors');
  assert.equal(expectedManualSaveConsoleErrors.length, 2, 'only the injected save and history-read 503s reach the console');
  await manualSavePage.close();

  const recoveryMarkerPage = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const recoveryMarkerKey = `xmt:topic-detail-save-recovery:v1:user:${editor.id}:topic:${manualSaveTopic.id}`;
  let recoveryMarkerPutRequests = 0;
  let recoveryMarkerReadRequests = 0;
  recoveryMarkerPage.on('pageerror', (error) => errors.push(error.message));
  recoveryMarkerPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  recoveryMarkerPage.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname !== `/api/topics/${manualSaveTopic.id}`) return;
    if (request.method() === 'PUT') recoveryMarkerPutRequests += 1;
    if (request.method() === 'GET') recoveryMarkerReadRequests += 1;
  });
  await recoveryMarkerPage.addInitScript((key) => {
    const testWindow = window as Window & { __xmtAllowTopicRecoveryCleanup?: boolean; __xmtDropTopicRecoveryWrite?: boolean; __xmtTamperTopicRecoveryWrite?: boolean };
    testWindow.__xmtAllowTopicRecoveryCleanup = false;
    testWindow.__xmtDropTopicRecoveryWrite = false;
    testWindow.__xmtTamperTopicRecoveryWrite = true;
    const nativeSetItem = Storage.prototype.setItem;
    const nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === window.localStorage && name === key && testWindow.__xmtTamperTopicRecoveryWrite) {
        testWindow.__xmtTamperTopicRecoveryWrite = false;
        const marker = JSON.parse(value) as { target?: { title?: string } };
        if (marker.target) marker.target.title = `${marker.target.title ?? ''}（静默篡改）`;
        nativeSetItem.call(this, name, JSON.stringify(marker));
        return;
      }
      if (this === window.localStorage && name === key && testWindow.__xmtDropTopicRecoveryWrite) {
        testWindow.__xmtDropTopicRecoveryWrite = false;
        return;
      }
      nativeSetItem.call(this, name, value);
    };
    Storage.prototype.removeItem = function (name) {
      if (this === window.localStorage && name === key && !testWindow.__xmtAllowTopicRecoveryCleanup) return;
      nativeRemoveItem.call(this, name);
    };
  }, recoveryMarkerKey);
  await recoveryMarkerPage.goto(`${base}/__qa/${manualSaveTopic.id}`);
  await recoveryMarkerPage.getByRole('heading', { name: manualSaveTopic.title }).waitFor();
  const recoveryMarkerTitle = recoveryMarkerPage.locator('input[type="text"]').first();
  await recoveryMarkerPage.getByRole('button', { name: '编辑选题', exact: true }).click();
  const tamperedMarkerTitle = '恢复标记被改写时保留的选题标题';
  await recoveryMarkerTitle.fill(tamperedMarkerTitle);
  const readsBeforeTamperedMarkerSave = recoveryMarkerReadRequests;
  await recoveryMarkerPage.getByRole('button', { name: '保存', exact: true }).click();
  const invalidRecoveryNotice = recoveryMarkerPage.getByTestId('topic-save-recovery');
  await invalidRecoveryNotice.getByText(/恢复记录未能完整保存或读取/).waitFor();
  assert.equal(await recoveryMarkerTitle.inputValue(), tamperedMarkerTitle, 'content tampering during recovery-marker persistence keeps the original title in the editor');
  assert.equal(recoveryMarkerPutRequests, 0, 'a tampered recovery marker prevents the topic PUT');
  assert.equal(recoveryMarkerReadRequests, readsBeforeTamperedMarkerSave, 'preflight marker tampering does not add a topic GET or PUT');
  assert.equal(manualTopicSaveWrites, 3, 'preflight marker tampering leaves the isolated topic unchanged');
  assert.equal(await invalidRecoveryNotice.getByRole('button', { name: '按当前本地内容保存', exact: true }).count(), 0, 'an invalid stored target is never offered as a retryable draft');
  assert.equal(await recoveryMarkerPage.evaluate((key) => localStorage.getItem(key) !== null, recoveryMarkerKey), true, 'the deliberately corrupted marker remains available for explicit cleanup verification');
  await invalidRecoveryNotice.getByRole('button', { name: '重新读取并采用服务端内容', exact: true }).click();
  await invalidRecoveryNotice.getByText(/当前修改保持不变、写入继续锁定/).waitFor();
  assert.equal(await recoveryMarkerTitle.inputValue(), tamperedMarkerTitle, 'failed invalid-marker cleanup preserves the editor content');
  assert.equal(recoveryMarkerPutRequests, 0, 'read-only invalid-marker cleanup does not send a topic PUT');
  await recoveryMarkerPage.evaluate(() => { (window as Window & { __xmtAllowTopicRecoveryCleanup?: boolean }).__xmtAllowTopicRecoveryCleanup = true; });
  await invalidRecoveryNotice.getByRole('button', { name: '重新读取并采用服务端内容', exact: true }).click();
  await invalidRecoveryNotice.waitFor({ state: 'detached' });
  assert.equal(await recoveryMarkerPage.evaluate((key) => localStorage.getItem(key), recoveryMarkerKey), null, 'the invalid marker is cleared only after verified removal');
  assert.equal(recoveryMarkerPutRequests, 0, 'adopting server content after invalid-marker cleanup remains read-only');

  await recoveryMarkerPage.getByRole('button', { name: '编辑选题', exact: true }).click();
  const cleanupFailureTitle = '服务端已保存但恢复标记待清理';
  await recoveryMarkerTitle.fill(cleanupFailureTitle);
  await recoveryMarkerPage.evaluate(() => { (window as Window & { __xmtAllowTopicRecoveryCleanup?: boolean }).__xmtAllowTopicRecoveryCleanup = false; });
  await recoveryMarkerPage.getByRole('button', { name: '保存', exact: true }).click();
  const cleanupBlockedNotice = recoveryMarkerPage.getByTestId('topic-save-recovery');
  await cleanupBlockedNotice.getByText(/服务器已返回保存成功，但本地恢复记录未能清除/).waitFor();
  assert.equal(manualTopicSaveWrites, 4, 'the server accepts the cleanup-failure save exactly once');
  assert.equal(recoveryMarkerPutRequests, 1, 'cleanup failure follows exactly one topic PUT');
  assert.equal(manualSaveTopic.title, cleanupFailureTitle, 'the isolated server contains the confirmed saved title');
  assert.equal(await recoveryMarkerTitle.inputValue(), cleanupFailureTitle, 'cleanup failure keeps the confirmed content visible');
  assert.equal(await recoveryMarkerPage.evaluate((key) => localStorage.getItem(key) !== null, recoveryMarkerKey), true, 'a silently retained marker keeps recovery locked');
  const readsBeforeCleanupVerify = recoveryMarkerReadRequests;
  await cleanupBlockedNotice.getByRole('button', { name: '只读核实上次保存', exact: true }).click();
  await cleanupBlockedNotice.getByText(/本地恢复记录未能清除/).waitFor();
  assert.equal(recoveryMarkerReadRequests, readsBeforeCleanupVerify + 1, 'the first cleanup retry performs one read-only topic GET');
  assert.equal(recoveryMarkerPutRequests, 1, 'read-only cleanup verification does not repeat the topic PUT');
  await recoveryMarkerPage.evaluate(() => { (window as Window & { __xmtAllowTopicRecoveryCleanup?: boolean }).__xmtAllowTopicRecoveryCleanup = true; });
  await cleanupBlockedNotice.getByRole('button', { name: '只读核实上次保存', exact: true }).click();
  await cleanupBlockedNotice.waitFor({ state: 'detached' });
  assert.equal(recoveryMarkerReadRequests, readsBeforeCleanupVerify + 2, 'the successful cleanup retry also performs only one GET');
  assert.equal(recoveryMarkerPutRequests, 1, 'confirmed cleanup never repeats the topic PUT');
  assert.equal(await recoveryMarkerPage.evaluate((key) => localStorage.getItem(key), recoveryMarkerKey), null, 'recovery unlocks only after the marker is verified absent');

  await recoveryMarkerPage.getByRole('button', { name: '编辑选题', exact: true }).click();
  const droppedMarkerTitle = '恢复标记静默丢失后保留的标题';
  await recoveryMarkerTitle.fill(droppedMarkerTitle);
  await recoveryMarkerPage.evaluate(() => { (window as Window & { __xmtDropTopicRecoveryWrite?: boolean }).__xmtDropTopicRecoveryWrite = true; });
  await recoveryMarkerPage.getByRole('button', { name: '保存', exact: true }).click();
  await recoveryMarkerPage.getByRole('alert').filter({ hasText: '本次选题修改未发送' }).waitFor();
  assert.equal(await recoveryMarkerTitle.inputValue(), droppedMarkerTitle, 'a silently dropped recovery marker keeps the current editor input');
  assert.equal(await recoveryMarkerPage.evaluate((key) => localStorage.getItem(key), recoveryMarkerKey), null, 'a silently dropped marker leaves no recovery value');
  assert.equal(recoveryMarkerPutRequests, 1, 'a silently dropped marker prevents a topic PUT');
  await recoveryMarkerPage.getByRole('button', { name: '保存', exact: true }).click();
  await recoveryMarkerPage.getByRole('heading', { name: droppedMarkerTitle, exact: true }).waitFor();
  assert.equal(recoveryMarkerPutRequests, 2, 'after storage recovers, only the user explicit save sends one PUT');
  assert.equal(manualTopicSaveWrites, 5, 'the explicit retry after a no-send result updates the isolated topic exactly once');
  assert.equal(await recoveryMarkerPage.evaluate((key) => localStorage.getItem(key), recoveryMarkerKey), null, 'successful explicit retry verifies marker cleanup');
  await recoveryMarkerPage.close();

  assert.deepEqual(errors, [], 'topic detail renders without unexpected browser or console errors');
  await homeMobile.close();
  await mobile.close();
  console.log('Topic stage repair browser test passed: Home identity/overlay/desktop and mobile layout, permission-gated weekly creator metrics and empty/retry states, auditable recent-activity links and isolated retry, today publishing and actionable unread message links, role-prioritized tasks, attention failure retry, Home-to-review handoff, permission-safe deep link, audit retry, stage/history refresh, read-only language and return flow, completed-history safeguard, dirty-leave controls in both themes, 1440/390px layout, no unexpected browser errors.');
  }
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
