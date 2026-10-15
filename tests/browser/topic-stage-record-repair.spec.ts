import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const editor = { id: 93, username: 'topic-stage-qa', role: 'editor', name: '阶段记录验收', enabled: true, force_change_password: false };
const viewer = { id: 94, username: 'topic-stage-viewer-qa', role: 'member', name: '只读验收', enabled: true, force_change_password: false };
const manager = { id: 95, username: 'topic-stage-manager-qa', role: 'director', name: '负责人验收', enabled: true, force_change_password: false };
const actionableManagerMessage = { id: 951, user_id: manager.id, title: '需要确认发布安排', content: '发布安排仍待跟进。', type: 'warning', read: false, link: '/publishing/941', created_at: '2026-10-09 10:00:00' };
const managerSyncAccountUid = 'manager-sync-anomaly-uid';
const managerSyncAnomaly = { id: 981, platform: 'douyin', account_name: '负责人验收账号', account_uid: managerSyncAccountUid, status: 'partial_success', start_time: '2026-10-09 11:00:00', success_count: 3, failed_count: 2, owner_name: editor.name };
const managerProductionReview = { id: 942, topic_id: 934, topic_title: '待审核稿件浏览器验收', version: 'v1.0', updated_at: '2026-10-09 08:30:00', operator_name: editor.name, assignee_name: editor.name };
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
  stage_record_presence: { production: true, shooting: true, publishing: false },
};
const topics = new Map([[productionTopic.id, productionTopic], [completedTopic.id, completedTopic], [mobileTopic.id, mobileTopic], [auditTopic.id, auditTopic], [secondPendingTopic.id, secondPendingTopic], [thirdPendingTopic.id, thirdPendingTopic], [fourthPendingTopic.id, fourthPendingTopic], [leaveGuardTopic.id, leaveGuardTopic], [missingAdvanceTopic.id, missingAdvanceTopic], [mobileMissingAdvanceTopic.id, mobileMissingAdvanceTopic], [saveTopic.id, saveTopic], [manualSaveTopic.id, manualSaveTopic]]);
const repairedStages: string[] = [];
const auditWrites: Array<{ topicId: number; status: string }> = [];
const statusWrites: Array<{ topicId: number; status: string }> = [];
const managerMessageQueries: Array<{ read: string | undefined; link: string | undefined }> = [];
const creatorDashboardAccountQueries: Array<string | undefined> = [];
let failNextCreatorDashboard = false;
let hideCreatorMetricsForHome = false;
let failNextCreatorSyncLogs = false;
let failNextCreatorAgentStatus = false;
let failNextAuditSave: string | null = null;
const linkedResource = { id: 991, title: '解除关联反馈验收资料', summary: '隔离浏览器资料', library_type: 'knowledge', category: { id: 1, name: '验收资料', path: '验收资料' } };
let isResourceLinked = true;
let topicResourceListReads = 0;
const topicResourceWrites = { add: 0, remove: 0 };
let failNextTopicRefreshForTopicId: number | null = null;
let topicSaveWrites = 0;
let failNextManualTopicSave = false;
let manualTopicSaveWrites = 0;
const manualTopicVersions: Array<Record<string, unknown>> = [];
let failNextHomeAttention = false;
let failNextHomeActivity = false;
let failNextHomeRetrospectives = false;
let homeTopicListReads = 0;
let homeProductionListReads = 0;
let allowHomeCreate = false;
let holdOldHomeReads = false;
const heldOldHomeReplies: Array<() => void> = [];
const app = express();
app.use(express.json());
app.get('/__qa/:topicId', (req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(editor))});localStorage.setItem('xmt_token','topic-stage-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(req.query.theme === 'dark' ? 'dark' : 'light')});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics/${req.params.topicId}');</script>`);
});
app.get('/__qa-viewer/:topicId', (req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(viewer))});localStorage.setItem('xmt_token','topic-stage-viewer-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics/${req.params.topicId}');</script>`);
});
app.get('/__qa-audit-viewer/:topicId', (req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(viewer))});localStorage.setItem('xmt_token','topic-stage-viewer-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics/${req.params.topicId}?action=audit');</script>`);
});
app.get('/__qa-stale-audit/:topicId', (req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(editor))});localStorage.setItem('xmt_token','topic-stage-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics/${req.params.topicId}?action=audit');</script>`);
});
app.get('/__qa-home', (req, res) => {
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(editor))});localStorage.setItem('xmt_token','topic-stage-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/');</script>`);
});
app.get('/__qa-manager-home', (_req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(manager))});localStorage.setItem('xmt_token','topic-stage-manager-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/');</script>`);
});
app.get('/api/auth/me', (req, res) => res.json(req.get('authorization') === 'Bearer topic-stage-viewer-fixture' ? viewer : req.get('authorization') === 'Bearer topic-stage-manager-fixture' ? manager : editor));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get('/api/messages', (req, res) => {
  const isManager = req.get('authorization') === 'Bearer topic-stage-manager-fixture';
  if (isManager) managerMessageQueries.push({ read: typeof req.query.read === 'string' ? req.query.read : undefined, link: typeof req.query.link === 'string' ? req.query.link : undefined });
  const data = isManager ? [actionableManagerMessage] : [];
  return res.json({ data, total: data.length, page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 20, summary: { total: data.length, unread: data.length, actionable: data.length } });
});
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/permissions/my', (req, res) => {
  const codes = req.get('authorization') === 'Bearer topic-stage-viewer-fixture' ? [] : req.get('authorization') === 'Bearer topic-stage-manager-fixture' ? ['topic:update', 'topic:audit', 'production:update', 'workflow:publishing', 'resource:view', 'creator:data:view', 'analytics:retro:view'] : ['topic:update', 'topic:audit', 'production:update', 'workflow:publishing', 'resource:view', 'analytics:retro:view'];
  if (allowHomeCreate && req.get('authorization') !== 'Bearer topic-stage-viewer-fixture') codes.push('topic:create');
  if (holdOldHomeReads && req.get('authorization') !== 'Bearer topic-stage-viewer-fixture') {
    heldOldHomeReplies.push(() => res.json(codes));
    return;
  }
  return res.json(codes);
});
app.get('/api/inspirations', (_req, res) => res.json({ data: [1, 2, 3, 4].map((id) => ({ id, title: `首页灵感预览 ${id}`, content: '', creator_id: editor.id, created_at: '2026-10-09 12:00:00' })), total: 4 }));
app.get('/api/dashboard/home-attention', (req, res) => {
  if (failNextHomeAttention) {
    failNextHomeAttention = false;
    return res.status(503).json({ message: '工作台摘要暂时无法读取，请重试。' });
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
    scope: 'all-visible-content',
    generated_at: '2026-10-09 12:00:00',
    stale_stage_days: 2,
    active_topics: req.get('authorization') === 'Bearer topic-stage-viewer-fixture'
      ? { total: 2, topics: [{ id: mobileTopic.id, title: '当前账号进行中选题', status: 'approved' }] }
      : { total: 47, topics: [auditTopic, secondPendingTopic, thirdPendingTopic].map((topic, index) => ({ id: topic.id, title: topic.title, status: index === 0 ? 'approved' : 'pending' })) },
    counts: { overdue: 1, due_soon: 1, stalled: 1, total: 2 },
    topics: [{ id: leaveGuardTopic.id, title: leaveGuardTopic.title, status: 'shooting', deadline: '2026-10-07', stage_entered_at: '2026-10-04 12:00:00', assignee_name: editor.name, is_overdue: true, is_due_soon: false, is_stalled: true }],
    today_publishing: {
      total: 1,
      tasks: [{ id: 941, topic_id: 934, topic_title: '今日待发布验收', platform: '抖音', publish_time: '2026-10-09 15:00:00', status: 'pending', operator_name: editor.name }],
    },
    sync_anomalies: req.get('authorization') === 'Bearer topic-stage-manager-fixture'
      ? { available: true, total: 1, tasks: [managerSyncAnomaly] }
      : { available: false, total: 0, tasks: [] },
    production_reviews: req.get('authorization') === 'Bearer topic-stage-viewer-fixture'
      ? { available: false, total: 0, tasks: [] }
      : { available: true, total: 1, tasks: [managerProductionReview] },
    retrospectives: retrospectiveSummary,
    topic_stages: {
      pending: { total: 4, topics: [auditTopic, secondPendingTopic, thirdPendingTopic].map((topic) => ({ id: topic.id, title: topic.title, status: 'pending', created_at: topic.created_at, stage_entered_at: topic.stage_entered_at, creator_name: topic.creator_name, assignee_name: topic.assignee_name })) },
      production: { total: 1, topics: [{ id: productionTopic.id, title: productionTopic.title, status: 'production', created_at: '2026-10-09 08:00:00', stage_entered_at: '2026-10-09 08:00:00', creator_name: editor.name, assignee_name: editor.name }] },
      shooting: { total: 2, topics: [leaveGuardTopic, missingAdvanceTopic].map((topic) => ({ id: topic.id, title: topic.title, status: 'shooting', created_at: '2026-10-08 08:00:00', stage_entered_at: '2026-10-08 08:00:00', creator_name: editor.name, assignee_name: editor.name })) },
      publishing: { total: 1, topics: [{ id: 941, title: '今日待发布验收', status: 'publishing', created_at: '2026-10-09 08:00:00', stage_entered_at: '2026-10-09 08:00:00', creator_name: editor.name, assignee_name: editor.name }] },
      completed: { total: 1, topics: [{ id: completedTopic.id, title: completedTopic.title, status: 'completed', created_at: '2026-10-08 08:00:00', stage_entered_at: null, creator_name: editor.name, assignee_name: editor.name }] },
    },
    my_drafts: { tasks: [{ id: 943, topic_id: productionTopic.id, topic_title: '我的待续写稿件', status: 'draft', version: 'v1.1', updated_at: '2026-10-09 09:10:00' }] },
  };
  if (holdOldHomeReads && req.get('authorization') !== 'Bearer topic-stage-viewer-fixture') {
    payload.active_topics = { total: 99, topics: [{ id: mobileTopic.id, title: '迟到的旧账号选题', status: 'approved' }] };
    heldOldHomeReplies.push(() => res.json(payload));
    return;
  }
  return res.json(payload);
});
app.get('/api/dashboard/home-activity', (_req, res) => {
  if (failNextHomeActivity) {
    failNextHomeActivity = false;
    return res.status(503).json({ message: '最近变化暂不可用，请重试。' });
  }
  return res.json({
    scope: 'personal',
    generated_at: '2026-10-09 12:00:00',
    events: [
      { id: 'version-943', kind: 'version', label: '稿件版本', title: '最近变化验收稿件', detail: '小修 · 基于 v1.0', occurred_at: '2026-10-09 11:00:00', path: '/production/943' },
      { id: 'topic-status-934', kind: 'topic_status', label: '选题状态', title: auditTopic.title, detail: '阶段更新至待审核', occurred_at: '2026-10-09 10:00:00', path: `/topics/${auditTopic.id}` },
    ],
  });
});
app.get('/api/creator-agent/douyin/dashboard', (req, res) => {
  const accountUid = typeof req.query.account_id === 'string' ? req.query.account_id : undefined;
  creatorDashboardAccountQueries.push(accountUid);
  if (failNextCreatorDashboard) {
    failNextCreatorDashboard = false;
    return res.status(503).json({ message: '抖音数据驾驶舱暂不可用，请重试。' });
  }
  return res.json({
    account: { nickname: '负责人验收账号', douyin_uid: accountUid || managerSyncAccountUid },
    metrics: { fans_count: hideCreatorMetricsForHome ? null : 120, works_count: 4, play_count: 2400, interaction_count: 120, interaction_rate: 0.05, share_rate: 0.01, viral_works_count: 0 },
    health: { score: 90, level: 'healthy', available_weight: 1, dimensions: {}, data_notes: [] },
    growth_7d: hideCreatorMetricsForHome ? { fans: null, plays: null, interactions: null } : { fans: 2, plays: 200, interactions: 10 },
    growth_30d: { fans: 5, plays: 800, interactions: 40 },
    top_works: [], snapshot_count: 2, snapshot_start_date: '2026-10-07', data_status: 'ready',
    data_source: 'creator_agent', official_snapshot_at: null, last_success_at: '2026-10-09 10:00:00', missing_fields: [], warnings: [],
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
  return res.json({ agents: [{ id: 1, device_id: 'manager-device', device_name: '验收设备', protocol_version: 1, browser_login_status: 'valid', browser_compatibility: 'compatible', status: 'active', account_id: managerSyncAccountUid, online: 1 }], protocol_version: 1 });
});
app.get('/api/topics', (req, res) => {
  if (typeof req.query.status === 'string') homeTopicListReads += 1;
  const matches = Array.from(topics.values())
    .filter((topic) => topic.status === req.query.status)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  const limit = Number(req.query.limit) || 5;
  return res.json({ success: true, data: matches.slice(0, limit), pagination: { total: matches.length, page: 1, limit } });
});
app.get('/api/workflow/production', (_req, res) => { homeProductionListReads += 1; return res.json({ data: [], total: 0, page: 1, limit: 12 }); });
app.get('/api/workflow/publishing', (_req, res) => res.json({ data: [{ id: 941, topic_id: 934, topic_title: '今日待发布验收', status: 'pending', platform: '抖音', publish_time: '2026-10-09 15:00:00', updated_at: '2026-10-09 09:00:00' }], total: 1, page: 1, limit: 12, summary: { published: 0 } }));
app.get('/api/users', (_req, res) => res.json({ data: [editor], total: 1, page: 1, limit: 10 }));
app.get('/api/topics/:id/resources', (req, res) => {
  topicResourceListReads += 1;
  return res.json({ data: Number(req.params.id) === productionTopic.id && isResourceLinked ? [linkedResource] : [] });
});
app.post('/api/topics/:topicId/resources', (req, res) => {
  topicResourceWrites.add += 1;
  if (Number(req.params.topicId) !== productionTopic.id || Number(req.body?.resource_id) !== linkedResource.id || isResourceLinked) {
    return res.status(409).json({ message: '资料不可关联' });
  }
  isResourceLinked = true;
  return res.json({ message: '资料关联已创建' });
});
app.delete('/api/topics/:topicId/resources/:resourceId', (req, res) => {
  topicResourceWrites.remove += 1;
  if (Number(req.params.topicId) !== productionTopic.id || Number(req.params.resourceId) !== linkedResource.id || !isResourceLinked) {
    return res.status(404).json({ message: '关联不存在' });
  }
  isResourceLinked = false;
  return res.json({ message: '资料关联已解除' });
});
app.get('/api/topics/:id/asset-dimensions', (_req, res) => res.json({ data: [] }));
app.get('/api/topics/:id/versions', (req, res) => {
  return res.json({ data: [...manualTopicVersions].reverse() });
});
app.get('/api/topics/:id', (req, res) => {
  if (Number(req.params.id) === failNextTopicRefreshForTopicId) {
    failNextTopicRefreshForTopicId = null;
    return res.status(503).json({ error: '隔离验收：详情刷新暂不可用' });
  }
  const topic = topics.get(Number(req.params.id));
  if (!topic) return res.status(404).json({ error: '选题不存在' });
  return res.json({ success: true, data: topic });
});
app.get('/api/workflow/production/942', (_req, res) => res.json({
  id: managerProductionReview.id,
  topic_id: managerProductionReview.topic_id,
  topic_title: managerProductionReview.topic_title,
  operator_id: editor.id,
  operator_name: editor.name,
  content: '<p>隔离验收稿件正文</p>',
  status: 'review',
  version: managerProductionReview.version,
  created_at: '2026-10-09 08:00:00',
  updated_at: managerProductionReview.updated_at,
}));
app.get('/api/workflow/production/942/history', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));
app.put('/api/topics/:id', (req, res) => {
  const topic = topics.get(Number(req.params.id));
  if (!topic) return res.status(404).json({ error: '选题不存在' });
  if (Number(req.params.id) === saveTopic.id) topicSaveWrites += 1;
  if (Number(req.params.id) === manualSaveTopic.id) {
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
  if (failNextAuditSave) {
    const message = failNextAuditSave;
    failNextAuditSave = null;
    return res.status(503).json({ message });
  }
  const topicId = Number(req.params.id);
  const topic = topics.get(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  topic.status = req.body?.status;
  auditWrites.push({ topicId, status: String(req.body?.status) });
  return res.json({ message: '审核结果已保存' });
});
app.post('/api/topics/:id/status', (req, res) => {
  const topicId = Number(req.params.id);
  const topic = topics.get(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  const status = String(req.body?.status ?? '');
  topic.status = status;
  if (status === 'publishing') topic.stage_record_presence.publishing = true;
  statusWrites.push({ topicId, status });
  return res.json({ message: '选题状态已更新' });
});
app.post('/api/topics/:id/repair-stage-record', (req, res) => {
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
});
app.get('/api/resource-center/search', (_req, res) => res.json({ data: [{ resource_id: linkedResource.id, title: linkedResource.title, summary: linkedResource.summary, snippet: '<mark>隔离</mark>验收素材', library_type: linkedResource.library_type, category: linkedResource.category }], total: 1 }));
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
    const approvedOption = auditPage.getByRole('button', { name: '审核通过', exact: true });
    const rejectedOption = auditPage.getByRole('button', { name: '驳回修改', exact: true });
    await approvedOption.waitFor();
    assert.ok((await approvedOption.getAttribute('class'))?.includes('bg-studio-success-soft'), 'selected approval uses a soft semantic surface');
    assert.ok((await textContrast(approvedOption)) >= 4.5, `${theme}主题审核通过选项文字对比度应不低于 4.5:1`);
    await rejectedOption.click();
    assert.ok((await rejectedOption.getAttribute('class'))?.includes('bg-studio-coral-soft'), 'selected rejection uses a soft semantic surface');
    assert.ok((await textContrast(rejectedOption)) >= 4.5, `${theme}主题驳回选项文字对比度应不低于 4.5:1`);
    const confirmAudit = auditPage.getByRole('button', { name: '驳回选题', exact: true });
    assert.ok((await textContrast(confirmAudit)) >= 4.5, `${theme}主题驳回确认文字对比度应不低于 4.5:1`);
    await auditContext.close();
  }

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
  await auditSubmit.getByText('审核服务暂不可用，请稍后重试。', { exact: true }).waitFor();
  assert.equal(auditTopic.status, 'pending', 'failed audit leaves the isolated topic unchanged');
  assert.deepEqual(auditWrites, [], 'failed audit is not recorded as a successful mutation');
  await auditSubmit.getByRole('heading', { name: '审核选题', exact: true }).waitFor();
  await auditSubmit.getByRole('button', { name: '通过审核', exact: true }).click();
  await auditSubmit.getByText('选题已通过审核', { exact: true }).waitFor();
  assert.equal(auditTopic.status, 'approved', 'successful retry updates the isolated topic before showing success');
  assert.deepEqual(auditWrites, [{ topicId: auditTopic.id, status: 'approved' }], 'the retry performs exactly one successful audit write');
  assert.equal(await auditSubmit.getByRole('heading', { name: '审核选题', exact: true }).count(), 0, 'successful audit closes the review dialog');
  assert.equal(expectedAuditHttpErrors.length, 1, 'only the injected audit-save 503 is expected');
  assert.equal(expectedAuditConsoleErrors.length, 1, 'only the injected audit-save 503 is logged by the browser');
  await auditSubmit.close();

  auditTopic.status = 'pending';
  const auditWritesBeforeHomeAction = auditWrites.length;
  const home = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await home.addInitScript(() => { Date.now = () => new Date('2026-10-09T12:00:00+08:00').getTime(); });
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
  await home.getByText('可追溯的稿件版本、批注和选题阶段变化', { exact: true }).waitFor();
  await home.getByText('最近变化验收稿件', { exact: true }).waitFor();
  await home.getByText('小修 · 基于 v1.0', { exact: true }).waitFor();
  assert.equal(creatorDashboardAccountQueries.length, noPermissionCreatorReadsBeforeHome, 'Home does not request creator analytics when the signed-in user lacks creator:data:view');
  assert.equal(await home.getByText('近 7 天播放变化', { exact: true }).count(), 0, 'creator metrics stay hidden for a user without view permission');
  assert.deepEqual(recentHomePublishingListRequests, [], 'Home no longer reads the publishing list to synthesize recent activity');
  assert.deepEqual({ topics: homeTopicListReads, production: homeProductionListReads }, homeLegacyListReadsBefore, 'Home uses bounded summaries instead of separate topic-stage and production list requests');
  await home.getByText('我的待续写稿件', { exact: true }).waitFor();
  const ideaStage = home.getByRole('button', { name: /^4 灵感池/ });
  await ideaStage.getByText('首页灵感预览 3', { exact: true }).waitFor();
  assert.equal(await ideaStage.getByText('首页灵感预览 4', { exact: true }).count(), 0, 'the inspiration stage displays exactly three latest previews');
  assert.equal(await home.getByRole('button', { name: '新建选题', exact: true }).count(), 0, 'the desktop header hides create-topic actions without the actual permission');
  await home.getByRole('button', { name: '继续写稿', exact: true }).waitFor();
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
  await home.getByRole('heading', { name: '内容流' }).waitFor();
  const startAuditFromHome = home.getByRole('button', { name: '开始审核', exact: true }).first();
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
  await home.getByRole('heading', { name: '内容流' }).waitFor();
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
  await homeDark.getByRole('heading', { name: '内容流' }).waitFor();
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
  await unavailablePendingStage.getByText('暂时无法读取，请重试', { exact: true }).waitFor();
  const unavailableRetrospectiveStage = partialHome.getByRole('button', { name: /— 复盘/ });
  await unavailableRetrospectiveStage.getByText('暂时无法读取，请重试', { exact: true }).waitFor();
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
  await partialRetrospectiveHome.getByRole('button', { name: /^— 复盘/ }).getByText('暂时无法读取，请重试', { exact: true }).waitFor();
  await partialRetrospectiveHome.getByRole('button', { name: /^4 待审/ }).getByText(auditTopic.title, { exact: true }).waitFor();
  assert.equal(await partialRetrospectiveHome.getByText('团队周复盘', { exact: true }).count(), 0, 'an unavailable retrospective summary is not rendered as an empty inventory or stale preview');
  assert.equal(await partialRetrospectiveHome.getByText('今天没有必须处理的任务', { exact: true }).count(), 0, 'the isolated retrospective failure does not block other Home sections');
  assert.equal(await partialRetrospectiveHome.getByRole('alert').count(), 1, 'the partial failure is reported in the dashboard summary');
  await partialRetrospectiveHome.close();

  const managerHome = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  managerHome.on('pageerror', (error) => errors.push(error.message));
  managerHome.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await managerHome.goto(`${base}/__qa-manager-home`);
  await managerHome.getByRole('heading', { name: '团队今日重点' }).waitFor();
  await managerHome.getByRole('heading', { name: '团队选题关注' }).waitFor();
  const userMenuButton = managerHome.getByRole('button', { name: /负责人验收/ });
  await userMenuButton.waitFor();
  assert.equal(await userMenuButton.getAttribute('title'), '打开用户菜单');
  assert.equal(await userMenuButton.getAttribute('aria-expanded'), 'false');
  await managerHome.getByText('近 7 天播放变化', { exact: true }).waitFor();
  await managerHome.getByText('粉丝总数', { exact: true }).waitFor();
  await managerHome.getByText('200', { exact: true }).waitFor();
  await managerHome.getByText('120', { exact: true }).waitFor();
  await managerHome.getByRole('region', { name: '近 7 天播放与粉丝数据' }).scrollIntoViewIfNeeded();
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
  await managerHome.getByRole('button', { name: '处理消息', exact: true }).click();
  await managerHome.waitForURL((url) => url.pathname === '/messages' && url.searchParams.get('filter') === 'actionable');
  assert.equal(await managerHome.getByRole('button', { name: '待处理', exact: true }).getAttribute('aria-pressed'), 'true', 'the Home message action opens the actionable unread filter');
  await managerHome.getByText(actionableManagerMessage.title, { exact: true }).waitFor();
  assert.ok(managerMessageQueries.some((query) => query.read === 'unread' && query.link === 'present'), 'the actionable filter requests only unread messages with business links');
  await managerHome.goto(`${base}/__qa-manager-home`);
  await managerHome.getByRole('heading', { name: '团队今日重点' }).waitFor();
  const managerSync = managerHome.getByRole('button', { name: '查看同步', exact: true });
  const managerAudit = managerHome.getByRole('button', { name: '开始审核', exact: true }).first();
  const managerProductionReview = managerHome.getByRole('button', { name: '审核稿件', exact: true });
  const managerPublishing = managerHome.getByRole('button', { name: '去发布', exact: true });
  const managerMessages = managerHome.getByRole('button', { name: '处理消息', exact: true });
  await managerPublishing.waitFor();
  await managerSync.waitFor();
  await managerProductionReview.waitFor();
  const managerPublishingHandle = await managerPublishing.elementHandle();
  assert.ok(managerPublishingHandle, 'manager dashboard includes an actionable publishing task');
  const managerMessagesHandle = await managerMessages.elementHandle();
  assert.ok(managerMessagesHandle, 'manager dashboard shows actionable unread messages');
  assert.ok(await managerMessages.evaluate((element, auditElement) => Boolean(element.compareDocumentPosition(auditElement) & Node.DOCUMENT_POSITION_FOLLOWING), await managerAudit.elementHandle()), 'actionable unread messages are prioritized ahead of team review tasks');
  assert.ok(await managerSync.evaluate((element, auditElement) => Boolean(element.compareDocumentPosition(auditElement) & Node.DOCUMENT_POSITION_FOLLOWING), await managerAudit.elementHandle()), 'team sync anomalies are prioritized ahead of review tasks');
  assert.ok(await managerAudit.evaluate((element, publishingElement) => Boolean(element.compareDocumentPosition(publishingElement) & Node.DOCUMENT_POSITION_FOLLOWING), managerPublishingHandle), 'team review actions are shown ahead of publishing tasks for a manager');
  assert.ok(await managerAudit.evaluate((element, manuscriptReviewElement) => Boolean(element.compareDocumentPosition(manuscriptReviewElement) & Node.DOCUMENT_POSITION_FOLLOWING), await managerProductionReview.elementHandle()), 'topic audits are shown before the existing-permission manuscript review queue');
  assert.ok(await managerProductionReview.evaluate((element, publishingElement) => Boolean(element.compareDocumentPosition(publishingElement) & Node.DOCUMENT_POSITION_FOLLOWING), managerPublishingHandle), 'manuscript review is retained ahead of publishing tasks for a manager');
  await managerProductionReview.click();
  await managerHome.waitForURL((url) => url.pathname === '/production/942');
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
  await creatorDashboardPage.getByRole('button', { name: '重新加载数据', exact: true }).click();
  await creatorDashboardPage.getByRole('heading', { name: '抖音数据驾驶舱' }).waitFor();
  await creatorDashboardPage.getByText('负责人验收账号', { exact: true }).first().waitFor();
  await creatorDashboardPage.getByText('采集端在线', { exact: true }).first().waitFor();
  await creatorDashboardPage.getByText('尚无同步记录；首次同步后会显示在这里。', { exact: true }).waitFor();
  assert.equal(await creatorDashboardPage.getByText('采集端离线', { exact: true }).count(), 0, 'a failed status read does not claim the collector is offline');
  failNextCreatorDashboard = true;
  failNextCreatorSyncLogs = true;
  failNextCreatorAgentStatus = true;
  await creatorDashboardPage.getByRole('button', { name: '刷新数据', exact: true }).click();
  await creatorDashboardPage.getByText('驾驶舱刷新失败，仍显示最近一次成功数据：抖音数据驾驶舱暂不可用，请重试。', { exact: true }).waitFor();
  await creatorDashboardPage.getByText('采集端状态暂不可用', { exact: true }).first().waitFor();
  await creatorDashboardPage.getByText('同步记录读取失败；当前同步指标尚未确认。请点击页面上方“刷新数据”重试。', { exact: true }).waitFor();
  await creatorDashboardPage.getByText('负责人验收账号', { exact: true }).first().waitFor();
  assert.equal(await creatorDashboardPage.getByText('采集端离线', { exact: true }).count(), 0, 'a refresh failure retains the existing collector identity without presenting unknown as offline');
  await creatorDashboardPage.getByRole('button', { name: '刷新数据', exact: true }).click();
  await creatorDashboardPage.getByText('采集端在线', { exact: true }).first().waitFor();
  await creatorDashboardPage.getByText('尚无同步记录；首次同步后会显示在这里。', { exact: true }).waitFor();
  assert.equal(await creatorDashboardPage.getByRole('alert').count(), 0, 'a successful dashboard refresh clears all three independent errors');
  assert.ok(expectedCreatorDashboardErrors.length >= 6, 'the only expected Creator Dashboard errors are the injected 503s and their response records');
  assert.ok(creatorDashboardApiMethods.every((method) => method === 'GET'), 'dashboard failure and retry recovery perform no API writes');
  await creatorDashboardPage.close();

  const managerMobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  managerMobile.on('pageerror', (error) => errors.push(error.message));
  managerMobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await managerMobile.goto(`${base}/__qa-manager-home`);
  await managerMobile.getByRole('heading', { name: '数据同步异常' }).waitFor();
  await managerMobile.getByRole('heading', { name: '待审核稿件' }).waitFor();
  assert.equal(await managerMobile.getByText('近 7 天播放变化', { exact: true }).count(), 0, 'the separate MobileHome keeps its current scope; this optional block belongs to the desktop Home screen');
  await managerMobile.getByText('负责人验收账号', { exact: true }).waitFor();
  await managerMobile.getByRole('button', { name: '打开待审核稿件：待审核稿件浏览器验收' }).waitFor();
  assert(await managerMobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the manager Home fits a 390px viewport without horizontal overflow');
  await managerMobile.screenshot({ path: '/tmp/xmt-home-sync-anomalies-manager-390.png', fullPage: false });
  await managerMobile.getByRole('button', { name: '打开待审核稿件：待审核稿件浏览器验收' }).click();
  await managerMobile.waitForURL((url) => url.pathname === '/production/942');
  await managerMobile.goto(`${base}/__qa-manager-home`);
  await managerMobile.getByRole('heading', { name: '数据同步异常' }).waitFor();
  await managerMobile.getByRole('button', { name: '查看同步异常：负责人验收账号' }).click();
  await managerMobile.waitForURL((url) => url.pathname === '/analytics/creator-center' && url.searchParams.get('account_id') === managerSyncAccountUid);
  await managerMobile.getByRole('heading', { name: '抖音数据驾驶舱' }).waitFor();
  await managerMobile.goto(`${base}/__qa-manager-home`);
  await managerMobile.getByRole('heading', { name: '待处理消息' }).waitFor();
  await managerMobile.getByText(actionableManagerMessage.title, { exact: true }).waitFor();
  assert(await managerMobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the manager Home fits a 390px viewport without horizontal overflow');
  await managerMobile.screenshot({ path: '/tmp/xmt-home-actionable-messages-manager-390.png', fullPage: false });
  await managerMobile.getByRole('button', { name: '查看待处理消息' }).click();
  await managerMobile.waitForURL((url) => url.pathname === '/messages' && url.searchParams.get('filter') === 'actionable');
  await managerMobile.close();

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
  assert.ok(expectedActivityErrors.length >= 1, 'the only recent activity read failure is the deliberately injected 503');
  await activityRetry.close();

  const homeMobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const expectedMobileAttentionErrors: string[] = [];
  homeMobile.on('pageerror', (error) => errors.push(error.message));
  homeMobile.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('status of 503 (Service Unavailable)')) expectedMobileAttentionErrors.push(message.text());
    else errors.push(message.text());
  });
  homeMobile.on('response', (response) => {
    if (response.url().endsWith('/api/dashboard/home-attention') && response.status() === 503) expectedMobileAttentionErrors.push(`${response.status()} ${response.url()}`);
    else if (response.status() >= 400) errors.push(`Unexpected HTTP error: ${response.status()} ${response.url()}`);
  });
  failNextHomeAttention = true;
  const mobileTopicReadsBefore = homeTopicListReads;
  await homeMobile.goto(`${base}/__qa-home`);
  await homeMobile.getByText('工作台摘要暂时无法读取，请重试。', { exact: true }).waitFor();
  await homeMobile.getByRole('button', { name: '— 进行中选题', exact: true }).waitFor();
  assert.equal(await homeMobile.getByRole('alert').count(), 1, 'the mobile Home keeps the attention error scoped to its own card');
  const mobileRetryResponse = homeMobile.waitForResponse((response) => response.url().endsWith('/api/dashboard/home-attention'));
  await homeMobile.getByRole('button', { name: '重新加载', exact: true }).click();
  const mobileRetryResponseResult = await mobileRetryResponse;
  assert.equal(mobileRetryResponseResult.status(), 200, 'the mobile attention retry request succeeds');
  await homeMobile.getByText('逾期', { exact: true }).waitFor();
  await homeMobile.getByRole('heading', { name: '团队选题关注' }).waitFor();
  await homeMobile.getByRole('button', { name: '47 进行中选题', exact: true }).waitFor();
  await homeMobile.getByRole('heading', { name: '团队最近选题', exact: true }).waitFor();
  const mobileRecent = homeMobile.locator('section').filter({ has: homeMobile.getByRole('heading', { name: '团队最近选题', exact: true }) });
  assert.equal(await mobileRecent.getByRole('button').count(), 4, 'mobile recent topics contain the three bounded previews plus the full-list link');
  await mobileRecent.getByText('已通过', { exact: true }).waitFor();
  assert.equal(await homeMobile.title(), '新媒体协作管理系统');
  assert.equal(await homeMobile.getByText('逾期', { exact: true }).count(), 1, 'the mobile Home renders attention counts after retry');
  await homeMobile.getByRole('heading', { name: '今日发布' }).waitFor();
  await homeMobile.getByText('今日待发布验收', { exact: true }).waitFor();
  await homeMobile.getByText('抖音 · 2026/10/09 15:00', { exact: true }).waitFor();
  assert.equal(await homeMobile.getByRole('alert').count(), 0, 'a successful mobile retry clears the attention error');
  assert.equal(homeTopicListReads, mobileTopicReadsBefore, 'mobile Home uses the bounded aggregate without a paged topics request');
  assert.ok(expectedMobileAttentionErrors.length >= 1, 'the only expected mobile Home failure is the injected attention 503');
  assert(await homeMobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the Home dashboard fits a 390px viewport without horizontal overflow');
  await homeMobile.screenshot({ path: '/tmp/xmt-home-attention-390.png', fullPage: false });
  await homeMobile.getByRole('button', { name: '处理今日发布：今日待发布验收，抖音' }).click();
  await homeMobile.waitForURL((url) => url.pathname === '/publishing/941');

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
      if (width === 390) {
        await identityHome.getByRole('button', { name: '2 进行中选题', exact: true }).waitFor();
        await identityHome.getByText('当前账号进行中选题', { exact: true }).waitFor();
      }
      const lateResponse = identityHome.waitForResponse((response) => response.url().endsWith('/api/permissions/my') && response.request().headers().authorization === 'Bearer topic-stage-refresh-fixture');
      heldOldHomeReplies.splice(0).forEach((reply) => reply());
      await lateResponse;
      await identityHome.waitForTimeout(80);
      assert.equal(await identityHome.getByRole('button', { name: /^(提报选题|新建选题)$/ }).count(), 0, 'late old permissions cannot restore the create entry');
      assert.equal(await identityHome.getByText('迟到的旧账号选题', { exact: true }).count(), 0, 'late old summary cannot replace current account data');
      if (width === 390) await identityHome.getByRole('button', { name: '2 进行中选题', exact: true }).waitFor();
      assert.equal(await identityHome.locator('vite-error-overlay').count(), 0);
      await identityHome.screenshot({ path: `/tmp/xmt-home-account-isolation-${width}.png`, fullPage: false });
    } finally {
      holdOldHomeReads = false;
      allowHomeCreate = false;
      heldOldHomeReplies.splice(0).forEach((reply) => reply());
      await identityHome.close();
    }
  }

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
    await desktop.setViewportSize(viewport);
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
      await desktop.evaluate((value) => {
        document.documentElement.style.zoom = `${value * 100}%`;
      }, zoom);
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
            display: getComputedStyle(element).display,
            visibility: getComputedStyle(element).visibility,
            clippedBy,
          };
        });
        assert.ok(geometry.width > 0 && geometry.height > 0, `${name} has a layout box at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
        assert.notEqual(geometry.display, 'none', `${name} is not hidden at ${viewport.width}px / ${zoom * 100}%`);
        assert.notEqual(geometry.visibility, 'hidden', `${name} is visible at ${viewport.width}px / ${zoom * 100}%`);
        assert.deepEqual(geometry.clippedBy, [], `${name} is not clipped at ${viewport.width}px / ${zoom * 100}%`);
        assert.ok(geometry.x >= -1 && geometry.x + geometry.width <= geometry.viewportWidth + 1, `${name} stays within the viewport at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
      }
    }
  }
  await desktop.evaluate(() => { document.documentElement.style.zoom = ''; });
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
  const initialResourceListReads = topicResourceListReads;
  await desktop.getByRole('button', { name: '解除关联' }).click();
  await desktop.getByRole('button', { name: '解除', exact: true }).click();
  await desktop.getByText('解除关联成功', { exact: true }).waitFor();
  assert.equal(isResourceLinked, false, 'successful resource unlink persists in the isolated fixture');
  assert.equal(await desktop.getByText(linkedResource.title, { exact: true }).count(), 0, 'unlinked resource disappears from the topic detail');
  assert.equal(topicResourceWrites.remove, 1, 'successful unlink is submitted once');
  assert.equal(topicResourceListReads, initialResourceListReads, 'confirmed unlink updates the current list without a follow-up GET');
  await desktop.getByRole('button', { name: '关联资料' }).click();
  await desktop.getByPlaceholder('搜索资料').fill('隔离素材');
  await desktop.getByRole('button', { name: '搜索', exact: true }).click();
  await desktop.getByText(linkedResource.title, { exact: true }).waitFor();
  await desktop.getByRole('button', { name: '关联', exact: true }).click();
  await desktop.getByRole('link', { name: linkedResource.title, exact: true }).waitFor();
  assert.equal(isResourceLinked, true, 'successful resource link persists in the isolated fixture');
  assert.equal(topicResourceWrites.add, 1, 'successful link is submitted once');
  assert.equal(topicResourceListReads, initialResourceListReads, 'confirmed link updates the current list without a follow-up GET');
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
    if (response.url().endsWith(`/api/topics/${manualSaveTopic.id}`) && response.status() === 503) expectedManualSaveHttpErrors.push(responseDescription);
    else errors.push(`Unexpected HTTP error: ${responseDescription}`);
  });
  await manualSavePage.goto(`${base}/__qa/${manualSaveTopic.id}`);
  await manualSavePage.getByRole('heading', { name: manualSaveTopic.title }).waitFor();
  await manualSavePage.getByRole('button', { name: '编辑选题', exact: true }).click();
  await manualSavePage.locator('[data-topic-manual-runtime="ready"]').waitFor();
  const outlineEditor = manualSavePage.locator('[contenteditable="true"]').last();
  await outlineEditor.waitFor({ state: 'visible' });
  await outlineEditor.fill('手动保存失败后保留的选题大纲');
  failNextManualTopicSave = true;
  await manualSavePage.getByRole('button', { name: '保存', exact: true }).click();
  await manualSavePage.getByRole('alert').getByText(/保存未完成，当前修改仍保留：选题保存暂不可用/).waitFor();
  assert.match(await outlineEditor.innerText(), /手动保存失败后保留的选题大纲/, 'a failed manual save keeps the current outline draft on screen');
  assert.equal(manualSaveTopic.outline, productionTopic.outline, 'the failed manual save does not alter the isolated server record');
  assert.equal(manualTopicSaveWrites, 1, 'the failed manual save issues only one write before the user retries');
  await manualSavePage.getByRole('button', { name: '保存', exact: true }).click();
  await manualSavePage.getByRole('alert').waitFor({ state: 'detached' });
  assert.match(manualSaveTopic.outline, /手动保存失败后保留的选题大纲/, 'the explicit retry persists the preserved outline');
  assert.equal(manualTopicSaveWrites, 2, 'the retry is explicit and produces one additional write');
  await manualSavePage.getByRole('button', { name: '编辑选题', exact: true }).click();
  const versionOutlineEditor = manualSavePage.locator('[contenteditable="true"]').last();
  await versionOutlineEditor.fill('选题大纲版本快照正文');
  await manualSavePage.getByRole('button', { name: '小版本保存', exact: true }).click();
  const outlineHistory = manualSavePage.getByRole('region', { name: '大纲版本历史' });
  await outlineHistory.getByText('v1.0 · 小版本', { exact: true }).waitFor();
  const outlinePreviews = outlineHistory.getByText('查看此版本正文', { exact: true });
  assert.equal(await outlinePreviews.count(), 2, 'the initial outline is retained as a baseline beside the explicit version');
  const outlineVersionEntry = outlineHistory.getByRole('listitem').filter({ hasText: 'v1.0 · 小版本' });
  const outlineBaselineEntry = outlineHistory.getByRole('listitem').filter({ hasText: '历史原稿（时间未记录）' });
  await outlineBaselineEntry.getByText('查看此版本正文', { exact: true }).click();
  await outlineBaselineEntry.getByText('手动保存失败后保留的选题大纲', { exact: true }).waitFor();
  await outlineVersionEntry.getByText('查看此版本正文', { exact: true }).click();
  await outlineVersionEntry.getByText('选题大纲版本快照正文', { exact: true }).waitFor();
  assert.equal(manualTopicSaveWrites, 3, 'explicit version creation submits exactly one additional update');
  assert.equal(expectedManualSaveHttpErrors.length, 1, 'only the intentionally injected manual-save 503 is expected');
  assert.equal(expectedManualSaveConsoleErrors.length, 1, 'only the intentionally injected manual-save 503 reaches the console');
  await manualSavePage.close();

  assert.deepEqual(errors, [], 'topic detail renders without unexpected browser or console errors');
  await homeMobile.close();
  await mobile.close();
  console.log('Topic stage repair browser test passed: Home identity/overlay/desktop and mobile layout, permission-gated weekly creator metrics and empty/retry states, auditable recent-activity links and isolated retry, today publishing and actionable unread message links, role-prioritized tasks, attention failure retry, Home-to-review handoff, permission-safe deep link, audit retry, stage/history refresh, read-only language and return flow, completed-history safeguard, dirty-leave controls in both themes, 1440/390px layout, no unexpected browser errors.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
