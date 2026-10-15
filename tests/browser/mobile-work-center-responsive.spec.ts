import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import express from 'express';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';

const screenshotDir = '/tmp/xmt-mobile-work-center-responsive';
const appVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const user = {
  id: 1,
  username: 'mobile-browser-qa',
  name: '移动验收',
  role: 'admin',
  email: 'mobile-qa@example.invalid',
  enabled: true,
  force_change_password: false,
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
};
let fixtureUser = user;
let fixturePermissions: string[] = [];
const inspiration = {
  id: 901,
  title: '周末夜市的烟火气',
  description: '记录摊主和老街的故事。',
  category: '故事',
  status: 'active',
  votes: 3,
  creator_id: 1,
  creator_name: '移动验收',
  comment_count: 0,
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
};
const promotedInspiration = {
  ...inspiration,
  id: 902,
  title: '老街早餐铺的传承',
  status: 'promoted',
  topic_id: 903,
};
const linkedTopic = {
  id: 903,
  title: '老街早餐铺的传承',
  description: '记录早餐铺的故事。',
  status: 'production',
  creator_id: 1,
  creator_name: '移动验收',
  assignee_id: 1,
  assignee_name: '移动验收',
  history: [],
  updated_at: '2026-09-27T00:00:00.000Z',
};
let approvedMobileTopic = {
  ...linkedTopic,
  id: 911,
  title: '移动一键开工选题',
  outline: '<p>移动端一键开工预填的大纲</p>',
  status: 'approved',
  creator_id: 3,
  assignee_id: 3,
};
let editableTopic = {
  ...linkedTopic,
  id: 904,
  title: '可恢复修改的选题',
  status: 'pending',
  creator_id: 5,
  assignee_id: null,
};
let auditableTopic = {
  ...linkedTopic,
  id: 905,
  title: '待审核的移动选题',
  status: 'pending',
  creator_id: 1,
  assignee_id: null,
};
const stageRepairTopic = {
  ...linkedTopic,
  id: 914,
  title: '移动阶段补齐刷新边界验收',
  history: [] as Array<{ id: number; action: string; comment: string; operator_name: string; created_at: string }>,
  stage_record_presence: { production: false, shooting: false, publishing: false },
};
const resourceRecoveryTopic = {
  ...linkedTopic,
  id: 915,
  title: '移动关联资料读取恢复验收',
};
let stageRepairWrites = 0;
let failNextStageRepairRefresh = false;
let failNextAuditRefresh = false;
let failNextTopicResourcesRead = false;
let topicResourcesReadAttempts = 0;
const unknownStatusTopic = {
  ...linkedTopic,
  id: 907,
  title: '未知状态移动选题',
  status: 'legacy_review',
  creator_id: 1,
  assignee_id: null,
};
const mobileSimilarTopic = { ...linkedTopic, id: 908, title: '移动提报失败后重试', status: 'production' };
const desktopSimilarTopic = { ...linkedTopic, id: 909, title: '桌面提报失败后重试', status: 'production' };
const inspirationSimilarTopic = { ...linkedTopic, id: 910, title: '周末夜市的烟火故事', status: 'production' };
const linkedCalendarEvent = {
  id: 990,
  title: '拍摄准备',
  description: '核对拍摄提纲',
  event_date: '2099-08-17T09:00:00.000Z',
  event_type: 'shooting',
  topic_id: linkedTopic.id,
  topic_title: linkedTopic.title,
  creator_id: 1,
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
};
const createdCalendarEvents: typeof linkedCalendarEvent[] = [];
const createAttempts = new Map<string, number>();
let failNextCalendarRead = false;
let calendarReadRequests = 0;
const topicCreateAttempts = new Map<string, number>();
const topicSearchAttempts = new Map<string, number>();
let mobileMessagesFixture: Array<{ id: number; title: string; content: string; read: boolean; link?: string; type?: string; created_at?: string }> = [];
let usersListFixture: Array<{ id: number; username: string; name: string; email: string; role: string; enabled: boolean; created_at: string; updated_at: string }> = [];
let usersListReadFailures = 0;
let userLogsReadFailures = 0;
let userLogsReadAttempts = 0;
const userWriteAttempts = { create: 0, update: 0 };
const userActionAttempts = { update: 0, delete: 0 };
let userActionUpdateDelayMs = 0;
let userActionDeleteDelayMs = 0;
let failNextUserActionDelete = false;
let backupInventoryReadFailures = 0;
let backupCreateAttempts = 0;
let backupInventoryFixture: { files: Array<{ id: string; name: string; size: number; created: string; source: string; sourceLabel: string }>; sources: Array<{ id: string; label: string; available: boolean; fileCount: number }> } = { files: [], sources: [] };
let promotedInspirationTopicId: number | null = null;
let inspirationPromoteAttempts = 0;
let messageLoadFailures = 0;
let messageReadFailures = 0;
let messageReadAttempts = 0;
const messageReadFailureIds = new Set<number>();
let messageReadDelayMs = 0;
let messageBulkReadAttempts = 0;
let messageClearFailures = 0;
let messageClearAttempts = 0;
let messageListReadHold = false;
let messageListReadStarted: (() => void) | null = null;
let releaseMessageListRead: (() => void) | null = null;
let passwordChangeFailures = 0;
let passwordChangeAttempts = 0;
let profileUpdateAttempts = 0;
let profileUpdateFailures = 0;
let topicUpdateAttempts = 0;
let topicAuditAttempts = 0;
const topicAuditComments: string[] = [];
function createDailyReport() {
  return {
    id: 780,
    userId: 1,
    reportDate: '2026-09-27',
    status: 'draft',
    manualSummaryMd: '',
    riskLevel: 'normal',
    version: 5,
    items: [{ id: 781, reportId: 780, sectionKey: 'today', title: '今日工作', contentMd: '', sortOrder: 0 }],
  };
}
let dailyReport = createDailyReport();
let holdNextDailyReportRead = false;
let dailyReportReadStarted: (() => void) | null = null;
let releaseDailyReportRead: (() => void) | null = null;
let failNextDailySubmit = true;
const dailyDraftVersions: Array<number | undefined> = [];
let dailyDraftWriteAttempts = 0;
let dailyDraftDelayMs = 0;
const mobileProductionFixture = {
  id: 780,
  topic_id: linkedTopic.id,
  version: 'v1.0',
  content: '<p>只读范围验收稿件</p>',
  status: 'draft',
  file_path: '',
  operator_id: 1,
  operator_name: '移动验收',
  topic_title: linkedTopic.title,
  topic_status: linkedTopic.status,
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
};
let mobileCreatedProduction: typeof mobileProductionFixture | null = null;
let mobileProductionCreateAttempts = 0;
let mobileProductionCreateDelayMs = 0;
let failNextMobileProductionCreate = false;
let failNextMobileProductionTopicList = false;
let mobileStageTransitionAttempts = 0;
let mobileProductionHandoffEvents: string[] = [];
const unknownStatusProductionFixture = {
  ...mobileProductionFixture,
  id: 781,
  topic_title: '未知状态创作稿件',
  status: 'legacy_draft',
};
const shootingStatusFixture = {
  id: 861,
  topic_id: linkedTopic.id,
  topic_title: '状态映射拍摄任务',
  topic_status: 'shooting',
  status: 'legacy_transcoding',
  plan_date: '2026-09-28T09:00:00.000Z',
  location: '影棚 A',
  equipment: '',
  operator_name: '移动验收',
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
  script_content: null,
  production: null,
};
let failNextShootingUpdate = false;
let failNextShootingListRead = false;
let shootingListReadCount = 0;
let shootingUpdateWriteCount = 0;
const publishingStatusFixture = {
  id: 862,
  topic_id: linkedTopic.id,
  topic_title: '状态映射发布任务',
  topic_description: '',
  topic_platform: '抖音',
  topic_deadline: '',
  topic_status: 'publishing',
  platform: '抖音',
  url: '',
  status: 'legacy_verifying',
  publish_time: '',
  script_content: null,
  operator_name: '移动验收',
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
  production: null,
  shooting: {
    id: shootingStatusFixture.id,
    plan_date: shootingStatusFixture.plan_date,
    location: shootingStatusFixture.location,
    equipment: shootingStatusFixture.equipment,
    status: shootingStatusFixture.status,
    operator_name: shootingStatusFixture.operator_name,
    created_at: shootingStatusFixture.created_at,
  },
  topicHistory: [],
};

const fixtureApi = express();
fixtureApi.use(express.json());
fixtureApi.use('/api', async (request, response) => {
  if (request.path === '/auth/me') return response.json(fixtureUser);
  if (request.path === '/permissions/my') return response.json(fixturePermissions);
  if (request.path === '/auth/profile' && request.method === 'PUT') {
    profileUpdateAttempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (profileUpdateFailures > 0) {
      profileUpdateFailures -= 1;
      return response.status(503).json({ message: '模拟个人资料服务暂不可用' });
    }
    fixtureUser = { ...fixtureUser, name: String(request.body?.name ?? fixtureUser.name), email: String(request.body?.email ?? fixtureUser.email) };
    return response.json(fixtureUser);
  }
  if (/^\/topics\/\d+\/asset-dimensions$/.test(request.path) && request.method === 'GET') return response.json({ data: [] });
  if (request.path === '/messages/unread') return response.json({ unreadCount: mobileMessagesFixture.filter((message) => !message.read).length });
  if (request.path === '/auth/change-password' && request.method === 'POST') {
    passwordChangeAttempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (passwordChangeFailures > 0) { passwordChangeFailures -= 1; return response.status(503).json({ message: '密码服务暂不可用，请重试' }); }
    return response.json({ message: '密码已更新' });
  }
  if (request.path === '/system-settings/public' || request.path === '/system-settings') return response.json({});
  if (request.path === '/topics' && request.method === 'POST') {
    const title = String(request.body?.title ?? '');
    const attempts = (topicCreateAttempts.get(title) ?? 0) + 1;
    topicCreateAttempts.set(title, attempts);
    if (attempts === 1) return response.status(503).json({ message: '选题服务暂不可用，已保留本次输入' });
    return response.json({ message: '选题创建成功', data: { topicId: 906 } });
  }
  if (request.path === `/topics/${editableTopic.id}` && request.method === 'PUT') {
    topicUpdateAttempts += 1;
    if (topicUpdateAttempts === 1) return response.status(503).json({ message: '保存服务暂不可用，请稍后重试' });
    editableTopic = { ...editableTopic, ...request.body };
    return response.json({ message: '选题更新成功' });
  }
  if (request.path === `/topics/${auditableTopic.id}/audit` && request.method === 'POST') {
    topicAuditAttempts += 1;
    topicAuditComments.push(String(request.body?.comment ?? ''));
    if (topicAuditAttempts === 1) return response.status(503).json({ message: '审核服务暂不可用，请稍后重试' });
    auditableTopic = { ...auditableTopic, status: request.body?.status };
    return response.json({ message: '选题审核成功' });
  }
  if (request.path === `/topics/${auditableTopic.id}` && request.method === 'GET' && failNextAuditRefresh) {
    failNextAuditRefresh = false;
    return response.status(503).json({ message: '审核已保存，但详情刷新暂不可用' });
  }
  if (request.path === `/topics/${stageRepairTopic.id}/repair-stage-record` && request.method === 'POST') {
    stageRepairWrites += 1;
    stageRepairTopic.stage_record_presence.production = true;
    stageRepairTopic.history = [{ id: 1, action: 'stage_record_repaired', comment: '已补齐当前阶段记录；选题阶段未变更', operator_name: fixtureUser.name, created_at: '2026-10-09 12:00:00' }];
    return response.json({ success: true, data: { stage: 'production', created: true } });
  }
  if (request.path === `/topics/${stageRepairTopic.id}` && request.method === 'GET' && failNextStageRepairRefresh) {
    failNextStageRepairRefresh = false;
    return response.status(503).json({ message: '阶段记录已保存，但详情刷新暂不可用' });
  }
  if (request.path === `/topics/${stageRepairTopic.id}` && request.method === 'GET') return response.json({ data: stageRepairTopic });
  if (request.path === `/topics/${approvedMobileTopic.id}` && request.method === 'GET') return response.json({ data: approvedMobileTopic });
  if (request.path === `/topics/${approvedMobileTopic.id}/status` && request.method === 'POST') {
    mobileStageTransitionAttempts += 1;
    approvedMobileTopic = { ...approvedMobileTopic, status: request.body?.status };
    mobileProductionHandoffEvents.push('advance');
    if (request.body?.status === 'production' && !mobileCreatedProduction) {
      mobileCreatedProduction = {
        ...mobileProductionFixture,
        id: 912,
        topic_id: approvedMobileTopic.id,
        topic_title: approvedMobileTopic.title,
        topic_status: 'production',
        content: approvedMobileTopic.outline,
        status: 'draft',
      };
    }
    return response.json({ message: '选题阶段已更新' });
  }
  if (request.path === '/topics' && request.method === 'GET' && failNextMobileProductionTopicList) {
    failNextMobileProductionTopicList = false;
    return response.status(503).json({ message: '模拟选题列表读取失败' });
  }
  if (request.path === '/topics') {
    const search = String(request.query.search ?? '');
    if (search) topicSearchAttempts.set(search, (topicSearchAttempts.get(search) ?? 0) + 1);
    const candidates = search === '移动' ? [mobileSimilarTopic]
      : search === '桌面' ? [desktopSimilarTopic]
        : search === '周末' ? [inspirationSimilarTopic] : [];
    const data = [unknownStatusTopic, linkedTopic, editableTopic, auditableTopic, ...(request.query.limit === '100' ? [approvedMobileTopic] : []), ...candidates];
    return response.json({ data, total: data.length, page: 1, limit: 20 });
  }
  if (request.path === `/topics/${linkedTopic.id}`) return response.json({ data: linkedTopic });
  if (request.path === '/topics/906') return response.json({ data: { ...linkedTopic, id: 906, title: '桌面提报失败后仍可重试', status: 'pending' } });
  if (/^\/topics\/\d+\/versions$/.test(request.path) && request.method === 'GET') return response.json({ data: [] });
  if (request.path === `/topics/${editableTopic.id}`) return response.json({ data: editableTopic });
  if (request.path === `/topics/${auditableTopic.id}`) return response.json({ data: auditableTopic });
  if (request.path === `/topics/${unknownStatusTopic.id}`) return response.json({ data: unknownStatusTopic });
  if (request.path === `/topics/${resourceRecoveryTopic.id}`) return response.json({ data: resourceRecoveryTopic });
  if (request.path === `/topics/${resourceRecoveryTopic.id}/resources` && request.method === 'GET') {
    topicResourcesReadAttempts += 1;
    if (failNextTopicResourcesRead) {
      failNextTopicResourcesRead = false;
      return response.status(503).json({ message: '资料读取暂不可用，请重试。' });
    }
    return response.json({ data: [{ id: 916, title: '隔离验收关联资料', summary: '仅用于移动网页读取恢复' }] });
  }
  if ([linkedTopic.id, editableTopic.id, auditableTopic.id, unknownStatusTopic.id, approvedMobileTopic.id, stageRepairTopic.id].some((id) => request.path === `/topics/${id}/resources`)) return response.json({ data: [] });
  if (request.path === '/workflow/production' && request.method === 'POST') {
    mobileProductionCreateAttempts += 1;
    mobileProductionHandoffEvents.push('create');
    if (mobileProductionCreateDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, mobileProductionCreateDelayMs));
    if (failNextMobileProductionCreate) {
      failNextMobileProductionCreate = false;
      return response.status(503).json({ message: '模拟创作保存失败' });
    }
    mobileCreatedProduction = {
      ...mobileProductionFixture,
      id: 912,
      topic_id: Number(request.body?.topic_id),
      topic_title: approvedMobileTopic.title,
      content: String(request.body?.content ?? ''),
      status: String(request.body?.status ?? 'draft'),
    };
    return response.json({ message: '创作记录添加成功', productionId: mobileCreatedProduction.id });
  }
  if (request.path === '/workflow/production' && request.method === 'GET') {
    const topicId = Number(request.query.topic_id);
    if (topicId === linkedTopic.id) return response.json([mobileProductionFixture]);
    if (topicId === approvedMobileTopic.id) {
      mobileProductionHandoffEvents.push('list');
      return response.json(mobileCreatedProduction ? [mobileCreatedProduction] : []);
    }
    return response.json([unknownStatusProductionFixture]);
  }
  if (request.path === `/workflow/production/${mobileCreatedProduction?.id}` && request.method === 'GET' && mobileCreatedProduction) {
    return response.json({ ...mobileCreatedProduction, can_edit: fixtureUser.role === 'editor' });
  }
  if (request.path === `/workflow/production/${mobileCreatedProduction?.id}/history` && request.method === 'GET' && mobileCreatedProduction) {
    return response.json({ data: [], total: 0, page: 1, limit: 20 });
  }
  if (request.path === `/productions/${mobileCreatedProduction?.id}/material-draft` && request.method === 'GET' && mobileCreatedProduction) {
    return response.json({ data: {
      production_id: mobileCreatedProduction.id,
      content_html: '<p></p>',
      revision: 0,
      created_by: fixtureUser.id,
      updated_by: fixtureUser.id,
      created_at: null,
      updated_at: null,
    } });
  }
  if (request.path === `/workflow/production/${mobileProductionFixture.id}` && request.method === 'GET') {
    return response.json({ ...mobileProductionFixture, can_edit: fixtureUser.role === 'editor' });
  }
  if (/^\/workflow\/production\/\d+\/review-threads$/.test(request.path) && request.method === 'GET') {
    return response.json({ data: [] });
  }
  if (request.path === '/workflow/shooting' && request.method === 'GET') {
    shootingListReadCount += 1;
    if (failNextShootingListRead) {
      failNextShootingListRead = false;
      return response.status(503).json({ message: '模拟制作计划列表读取失败' });
    }
    return response.json({ data: [shootingStatusFixture], total: 1, page: 1, limit: 20 });
  }
  if (request.path === `/workflow/shooting/${shootingStatusFixture.id}` && request.method === 'PUT') {
    shootingUpdateWriteCount += 1;
    if (failNextShootingUpdate) {
      failNextShootingUpdate = false;
      return response.status(503).json({ message: '模拟完成失败' });
    }
    shootingStatusFixture.status = 'completed';
    return response.json({ message: '制作计划已完成' });
  }
  if (request.path === `/workflow/shooting/${shootingStatusFixture.id}` && request.method === 'GET') {
    return response.json(shootingStatusFixture);
  }
  if (/^\/workflow\/(shooting|publishing)\/\d+\/versions$/.test(request.path) && request.method === 'GET') {
    return response.json({ data: [] });
  }
  if (request.path === '/workflow/publishing' && request.method === 'GET') {
    return response.json({
      data: [publishingStatusFixture],
      total: 1,
      page: 1,
      limit: 20,
      summary: { today: 0, pending: 0, published: 0, failed: 0 },
    });
  }
  if (request.path === `/workflow/publishing/${publishingStatusFixture.id}` && request.method === 'GET') {
    return response.json(publishingStatusFixture);
  }
  if (request.path === '/dashboard/home-attention' && request.method === 'GET') {
    return response.json({
      scope: 'personal',
      generated_at: '2026-10-09T00:00:00.000Z',
      stale_stage_days: 2,
      counts: { overdue: 0, due_soon: 0, stalled: 0, total: 0 },
      today_publishing: { total: 0, tasks: [] },
      sync_anomalies: { available: false, total: 0, tasks: [] },
      production_reviews: { available: false, total: 0, tasks: [] },
      retrospectives: { available: true, total: 0, tasks: [] },
      topics: [],
    });
  }
  if (request.path === '/calendar' && request.method === 'POST') {
    const title = String(request.body?.title ?? '');
    const attempts = (createAttempts.get(title) ?? 0) + 1;
    createAttempts.set(title, attempts);
    if (attempts === 1) return response.status(503).json({ message: '测试创建失败' });
    const event = { ...linkedCalendarEvent, ...request.body, id: 991 + createdCalendarEvents.length, topic_id: request.body?.topic_id, topic_title: request.body?.topic_id ? linkedTopic.title : undefined };
    createdCalendarEvents.push(event);
    failNextCalendarRead = true;
    return response.json({ message: '日历事件创建成功', id: event.id });
  }
  if (request.path === '/calendar' && request.method === 'GET') {
    calendarReadRequests += 1;
    if (failNextCalendarRead) {
      failNextCalendarRead = false;
      return response.status(503).json({ message: '模拟创建后的日历读取失败' });
    }
    return response.json({ data: [linkedCalendarEvent, ...createdCalendarEvents] });
  }
  if (request.path === '/daily-reports/me' && request.method === 'GET') {
    const reportSnapshot = { ...dailyReport, items: dailyReport.items.map((item) => ({ ...item })) };
    if (holdNextDailyReportRead) {
      holdNextDailyReportRead = false;
      dailyReportReadStarted?.();
      await new Promise<void>((resolve) => { releaseDailyReportRead = resolve; });
    }
    return response.json({ success: true, data: { reportDate: reportSnapshot.reportDate, template: { id: null, name: '默认模板', description: '', sections: [] }, report: reportSnapshot, canCreate: true } });
  }
  if (request.path === '/daily-reports/archive' && request.method === 'GET') return response.json({ success: true, data: { reports: [] } });
  if (request.path === '/report-summaries/archive' && request.method === 'GET') return response.json({ success: true, data: { monthly: [], yearly: [] } });
  if (request.path === '/export/weekly-report' && request.method === 'GET') {
    return response.json({ period: { start: '2026-09-21', end: '2026-09-27' }, summary: { completedTopics: 0, publishedVideos: 0, newTopics: 0, totalViews: 0, totalLikes: 0, totalShares: 0, totalComments: 0, pomodoroSessions: 0, focusMinutes: 0 }, details: { completedTopics: [], publishedVideos: [], newTopics: [], topInspirations: [] }, generatedAt: '2026-09-28T00:00:00.000Z' });
  }
  if (request.path === '/daily-reports/draft' && request.method === 'POST') {
    dailyDraftWriteAttempts += 1;
    if (dailyDraftDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, dailyDraftDelayMs));
    const version = request.body?.version as number | undefined;
    dailyDraftVersions.push(version);
    if (version !== undefined && version !== dailyReport.version) {
      return response.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: '日报版本已变化，请刷新后再保存' });
    }
    dailyReport = { ...dailyReport, status: 'draft', version: dailyReport.version + 1, manualSummaryMd: request.body?.manualSummaryMd ?? '', items: request.body?.items ?? dailyReport.items };
    return response.json({ success: true, data: dailyReport });
  }
  if (request.path === `/daily-reports/${dailyReport.id}/submit` && request.method === 'POST') {
    if (failNextDailySubmit) {
      failNextDailySubmit = false;
      return response.status(503).json({ success: false, message: '模拟提交失败' });
    }
    dailyReport = { ...dailyReport, status: 'submitted', version: dailyReport.version + 1 };
    return response.json({ success: true, data: dailyReport });
  }
  if (request.path === '/inspirations') {
    const currentInspiration = promotedInspirationTopicId === null
      ? inspiration
      : { ...inspiration, status: 'promoted', topic_id: promotedInspirationTopicId };
    return response.json({ data: [currentInspiration, promotedInspiration], total: 2 });
  }
  if (request.path === '/inspirations/901/promote' && request.method === 'POST') {
    inspirationPromoteAttempts += 1;
    promotedInspirationTopicId = linkedTopic.id;
    return response.json({ message: '灵感已转为选题', topicId: linkedTopic.id });
  }
  if (request.path === '/inspirations/901') return response.json({ inspiration, comments: [] });
  if (request.path === '/backup/inventory' && request.method === 'GET') {
    if (backupInventoryReadFailures > 0) {
      backupInventoryReadFailures -= 1;
      return response.status(503).json({ message: '模拟备份清单刷新失败' });
    }
    return response.json(backupInventoryFixture);
  }
  if (request.path === '/backup/create' && request.method === 'POST') {
    backupCreateAttempts += 1;
    const name = 'xmt-local-fixture.db';
    const file = { id: `application:${name}`, name, size: 1024, created: '2026-10-09T12:00:00.000Z', source: 'application', sourceLabel: '应用内备份' };
    backupInventoryFixture = {
      files: [file, ...backupInventoryFixture.files.filter((item) => item.name !== name)],
      sources: backupInventoryFixture.sources.map((source) => source.id === 'application' ? { ...source, fileCount: source.fileCount + 1 } : source),
    };
    return response.json({ message: '备份已创建', name });
  }
  if (request.path === '/users' && request.method === 'GET') {
    if (usersListReadFailures > 0) {
      usersListReadFailures -= 1;
      return response.status(503).json({ message: '模拟用户列表刷新失败' });
    }
    const search = typeof request.query.search === 'string' ? request.query.search.toLowerCase() : '';
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.max(1, Number(request.query.limit) || 200);
    const filtered = usersListFixture.filter((item) => !search || [item.username, item.name, item.email].some((value) => value.toLowerCase().includes(search)));
    return response.json({ data: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, page, limit });
  }
  if (request.path === '/users/logs' && request.method === 'GET') {
    userLogsReadAttempts += 1;
    if (userLogsReadFailures > 0) {
      userLogsReadFailures -= 1;
      return response.status(503).json({ message: '模拟操作日志读取失败' });
    }
    return response.json({
      data: [{ id: 8401, user_name: '日志验收账号', action: '更新资料', target: '用户信息', detail: '隔离读取恢复验收', created_at: '2026-10-09T09:30:00.000Z' }],
      total: 1,
      page: 1,
      limit: 100,
    });
  }
  if (request.path === '/users/assignable-roles' && request.method === 'GET') {
    return response.json([{ id: 1, code: 'admin', name: '管理员' }, { id: 2, code: 'member', name: '普通成员' }]);
  }
  if (request.path === '/users' && request.method === 'POST') {
    userWriteAttempts.create += 1;
    const created = {
      id: 1500,
      username: String(request.body.username),
      name: String(request.body.name || ''),
      email: String(request.body.email || ''),
      role: String(request.body.role || 'member'),
      enabled: true,
      created_at: '2026-10-09T09:00:00.000Z',
      updated_at: '2026-10-09T09:00:00.000Z',
    };
    usersListFixture.unshift(created);
    return response.json({ message: '用户已创建', userId: created.id });
  }
  if (/^\/users\/\d+$/.test(request.path) && request.method === 'PUT') {
    userWriteAttempts.update += 1;
    const id = Number(request.path.split('/').at(-1));
    if (id === 1401) {
      userActionAttempts.update += 1;
      if (userActionUpdateDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, userActionUpdateDelayMs));
    }
    const target = usersListFixture.find((item) => item.id === id);
    if (!target) return response.status(404).json({ message: '用户不存在' });
    Object.assign(target, request.body, { updated_at: '2026-10-09T09:30:00.000Z' });
    return response.json({ message: '用户信息已更新' });
  }
  if (request.method === 'DELETE' && request.path.startsWith('/users/')) {
    const id = Number(request.path.split('/').at(-1));
    if (id === 1401) {
      userActionAttempts.delete += 1;
      if (userActionDeleteDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, userActionDeleteDelayMs));
      if (failNextUserActionDelete) {
        failNextUserActionDelete = false;
        return response.status(503).json({ message: '模拟用户删除失败' });
      }
    }
    usersListFixture = usersListFixture.filter((item) => item.id !== id);
    return response.json({ message: '用户已删除' });
  }
  if (request.path === '/messages' && request.method === 'GET') {
    if (messageLoadFailures > 0) { messageLoadFailures -= 1; return response.status(503).json({ message: '消息服务暂不可用' }); }
    const readFilter = typeof request.query.read === 'string' ? request.query.read : undefined;
    const linkFilter = typeof request.query.link === 'string' ? request.query.link : undefined;
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.max(1, Number(request.query.limit) || 20);
    const filtered = mobileMessagesFixture.filter((message) => {
      if (readFilter === 'unread' && message.read) return false;
      if (readFilter === 'read' && !message.read) return false;
      if (linkFilter === 'present' && !message.link) return false;
      if (linkFilter === 'absent' && message.link) return false;
      return true;
    });
    const result = {
      data: filtered.slice((page - 1) * limit, page * limit),
      total: filtered.length,
      page,
      limit,
      summary: {
        total: mobileMessagesFixture.length,
        unread: mobileMessagesFixture.filter((message) => !message.read).length,
        actionable: mobileMessagesFixture.filter((message) => !message.read && Boolean(message.link)).length,
      },
    };
    if (messageListReadHold) {
      messageListReadHold = false;
      const markReadStarted = messageListReadStarted;
      messageListReadStarted = null;
      markReadStarted?.();
      await new Promise<void>((resolve) => { releaseMessageListRead = resolve; });
    }
    return response.json(result);
  }
  if (/^\/messages\/\d+$/.test(request.path) && request.method === 'PUT') {
    messageReadAttempts += 1;
    if (messageReadDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, messageReadDelayMs));
    const messageId = Number(request.path.split('/').at(-1));
    if (messageReadFailureIds.delete(messageId)) return response.status(503).json({ message: '消息服务暂不可用，标记失败' });
    if (messageReadFailures > 0) { messageReadFailures -= 1; return response.status(503).json({ message: '消息服务暂不可用，标记失败' }); }
    mobileMessagesFixture = mobileMessagesFixture.map((message) => message.id === messageId ? { ...message, read: true } : message);
    return response.json({ message: '消息已标记为已读' });
  }
  if (request.path === '/messages' && request.method === 'DELETE') {
    messageClearAttempts += 1;
    if (messageClearFailures > 0) {
      messageClearFailures -= 1;
      return response.status(503).json({ message: '消息服务暂不可用' });
    }
    mobileMessagesFixture = [];
    return response.json({ message: '消息已清空' });
  }
  if (request.path === '/messages/read-all' && request.method === 'POST') {
    messageBulkReadAttempts += 1;
    const updatedCount = mobileMessagesFixture.filter((message) => !message.read).length;
    mobileMessagesFixture = mobileMessagesFixture.map((message) => ({ ...message, read: true }));
    return response.json({ message: '所有消息已标记为已读', updatedCount });
  }
  return response.status(404).json({ message: `Unexpected fixture API request: ${request.method} ${request.path}` });
});
fixtureApi.use('/socket.io', (request, response) => {
  if (request.method === 'GET') {
    return response.type('text/plain').send('0{"sid":"mobile-qa","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
  }
  return response.type('text/plain').send('ok');
});

const server = http.createServer(fixtureApi);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: 'spa', logLevel: 'error' });
fixtureApi.use(vite.middlewares);
const browser = await chromium.launch({ headless: true });

function luminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

async function textContrast(locator: import('playwright').Locator) {
  const { foreground, background } = await locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    const rootColor = getComputedStyle(document.documentElement).getPropertyValue('--xmt-app-bg').match(/[\d.]+/g)?.map(Number) || [];
    let background = rootColor.length >= 3 ? rootColor.slice(0, 3) : [255, 255, 255];
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    for (const ancestor of ancestors.reverse()) {
      const layer = getComputedStyle(ancestor).backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
      if (layer.length < 3) continue;
      const alpha = layer.length >= 4 ? layer[3] : 1;
      if (alpha <= 0) continue;
      background = layer.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
    }
    return { foreground, background };
  });
  if (foreground.length !== 3 || background.length !== 3) return 0;
  const weights = [0.2126, 0.7152, 0.0722];
  const textLum = foreground.reduce((sum, channel, index) => sum + weights[index] * luminance(channel), 0);
  const backgroundLum = background.reduce((sum, channel, index) => sum + weights[index] * luminance(channel), 0);
  return (Math.max(textLum, backgroundLum) + 0.05) / (Math.min(textLum, backgroundLum) + 0.05);
}

async function openMobilePage(width: number, authUser = user, theme?: 'light' | 'dark') {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
  await context.addInitScript(({ authUser, version, theme }) => {
    localStorage.setItem('xmt_user', JSON.stringify(authUser));
    localStorage.setItem('xmt_token', 'local-browser-fixture');
    localStorage.setItem('xmt_last_version_seen', version);
    if (theme) localStorage.setItem('xmt_theme', theme);
  }, { authUser, version: appVersion, theme });
  const page = await context.newPage();
  const errors: string[] = [];
  let expectedConsoleFailures = 0;
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedConsoleFailures > 0 && message.text().includes('503')) {
      expectedConsoleFailures -= 1;
      return;
    }
    errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !(response.status() === 503 && (response.url().includes('/api/calendar') || response.url().includes('/api/daily-reports') || response.url().includes('/api/topics') || response.url().includes('/api/messages') || response.url().includes('/api/auth/change-password') || response.url().includes('/api/auth/profile') || response.url().includes('/api/resource-center/content-topics') || response.url().includes('/api/workflow/production') || response.url().includes('/api/workflow/shooting') || response.url().includes('/api/users') || response.url().includes('/api/backup/inventory')))) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  return { context, page, errors, expectConsoleFailure: () => { expectedConsoleFailures += 1; } };
}

async function assertMobileLayout(page: Page, width: number, screenshotName: string) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    main: document.querySelector('main')?.clientWidth,
    mainScroll: document.querySelector('main')?.scrollWidth,
  }));
  assert.equal(metrics.viewport, width);
  assert.equal(metrics.document, width, `${screenshotName}: document overflow ${JSON.stringify(metrics)}`);
  assert.equal(metrics.body, width, `${screenshotName}: body overflow ${JSON.stringify(metrics)}`);
  await page.screenshot({ path: `${screenshotDir}-${width}-${screenshotName}.png`, fullPage: true });
  return metrics;
}

try {
  for (const width of [320, 390]) {
    promotedInspirationTopicId = null;
    inspirationPromoteAttempts = 0;
    const { context, page, errors, expectConsoleFailure } = await openMobilePage(width);
    try {
      await page.goto(`${baseUrl}/production`, { waitUntil: 'domcontentloaded' });
      await page.getByText('移动工作中心', { exact: true }).waitFor();
      const hub = await assertMobileLayout(page, width, 'hub');

      await page.getByRole('button', { name: /日历/ }).click();
      await page.waitForURL('**/calendar');
      await page.getByRole('heading', { name: '排期日历' }).waitFor();
      const monthBefore = await page.getByText(/\d{4}年\d{1,2}月/).first().innerText();
      const calendar = await assertMobileLayout(page, width, 'calendar');
      let failCalendarRead = true;
      expectConsoleFailure();
      await page.route('**/api/calendar?*', async (route) => {
        if (failCalendarRead) {
          failCalendarRead = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '测试读取失败' }) });
          return;
        }
        await route.continue();
      });
      await page.getByRole('button', { name: '下月' }).click();
      await page.getByRole('heading', { name: '日历加载失败' }).waitFor();
      assert.equal(await page.getByRole('button', { name: '重试加载' }).isVisible(), true);
      assert.equal(await page.getByText('待拍摄', { exact: true }).count(), 0, 'failed refresh does not leave metrics from the previous month visible');
      if (width === 320) await page.screenshot({ path: '/tmp/xmt-calendar-load-error-320.png', fullPage: true });
      await page.getByRole('button', { name: '重试加载' }).click();
      await page.getByText(linkedCalendarEvent.title, { exact: true }).waitFor();
      await page.unroute('**/api/calendar?*');
      const createTitle = `移动日历写入验证 ${width}`;
      await page.getByRole('button', { name: '新增' }).click();
      await page.getByPlaceholder('事件标题').fill(createTitle);
      expectConsoleFailure();
      const failedCreate = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/calendar') && response.status() === 503);
      await page.getByRole('button', { name: '创建', exact: true }).click();
      await failedCreate;
      assert.equal(createAttempts.get(createTitle), 1, 'one failed submit produces one create request');
      assert.equal(await page.getByPlaceholder('事件标题').isVisible(), true, 'failed create keeps the form available for retry');
      assert.equal(await page.getByRole('button', { name: '创建', exact: true }).isEnabled(), true, 'submit control unlocks after failure');
      if (width === 320) await page.screenshot({ path: '/tmp/xmt-calendar-create-retry-320.png', fullPage: true });
      const successfulRetry = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/calendar') && response.status() === 200);
      expectConsoleFailure();
      await page.getByRole('button', { name: '创建', exact: true }).click();
      await successfulRetry;
      await page.getByRole('heading', { name: '事件已创建，日历未刷新' }).waitFor();
      assert.equal(await page.getByText(new RegExp(`“${createTitle}”已由服务器确认创建。重新加载只会读取日历，不会重复创建事件。`)).isVisible(), true);
      assert.equal(await page.getByRole('button', { name: '重新加载日历' }).isVisible(), true);
      const readsBeforeRetry = calendarReadRequests;
      const createsBeforeRetry = createAttempts.get(createTitle);
      const readOnlyRetry = page.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/calendar') && response.status() === 200);
      await page.getByRole('button', { name: '重新加载日历' }).click();
      await readOnlyRetry;
      await page.getByRole('heading', { name: createTitle }).waitFor();
      assert.equal(createAttempts.get(createTitle), createsBeforeRetry, 'calendar refresh retry never repeats the confirmed create');
      assert.equal(calendarReadRequests, readsBeforeRetry + 1, 'calendar refresh retry performs one read');
      assert.equal(createdCalendarEvents.filter((event) => event.title === createTitle).length, 1, 'retry creates one event after a failed request');
      await page.getByRole('button', { name: '查看关联选题' }).click();
      await page.waitForURL(`**/topics/${linkedTopic.id}`);
      await page.getByRole('button', { name: '返回日历' }).click();
      await page.waitForURL('**/calendar');
      await page.getByRole('button', { name: '下月' }).click();
      await page.waitForFunction((before) => /\d{4}年\d{1,2}月/.exec(document.body.innerText)?.[0] !== before, monthBefore);
      await page.getByRole('button', { name: '返回工作' }).click();
      await page.waitForURL('**/production');

      await page.getByRole('button', { name: '首页' }).click();
      await page.getByRole('button', { name: '排期日历' }).click();
      await page.waitForURL('**/calendar');
      await page.getByRole('button', { name: '返回首页' }).click();
      await page.waitForURL('**/');
      await page.getByRole('button', { name: '工作' }).click();
      await page.waitForURL('**/production');

      await page.getByRole('button', { name: /灵感/ }).click();
      await page.waitForURL('**/inspirations');
      await page.getByRole('heading', { name: '灵感池' }).waitFor();
      await page.getByText(inspiration.title, { exact: true }).waitFor();
      const ideas = await assertMobileLayout(page, width, 'inspirations');
      const inspirationCard = page.getByRole('heading', { name: inspiration.title }).locator('xpath=ancestor::div[@role="button"]');
      const submitIdea = page.getByRole('button', { name: '提交灵感', exact: true });
      assert.equal(await submitIdea.locator('span').evaluate((element) => getComputedStyle(element).whiteSpace), 'nowrap');
      const promoteButton = inspirationCard.getByRole('button', { name: '转为选题', exact: true });
      assert.equal(await promoteButton.evaluate((element) => getComputedStyle(element).whiteSpace), 'nowrap');
      const cardBounds = await inspirationCard.boundingBox();
      const promoteBounds = await promoteButton.boundingBox();
      assert(cardBounds && promoteBounds && promoteBounds.x + promoteBounds.width <= cardBounds.x + cardBounds.width, 'promote action fits within the inspiration card');
      assert.equal(await inspirationCard.getByRole('button', { name: `删除灵感：${inspiration.title}`, exact: true }).isVisible(), true, 'mobile delete action must not require hover');
      await promoteButton.click();
      await page.getByRole('heading', { name: '发现标题相似的选题' }).waitFor();
      await page.getByText(inspirationSimilarTopic.title, { exact: true }).waitFor();
      assert.equal(inspirationPromoteAttempts, 0, 'inspiration is not promoted before the user reviews similar topics');
      if (width === 320) await page.screenshot({ path: '/tmp/xmt-inspiration-similarity-320.png', fullPage: true });
      const promotedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/inspirations/901/promote') && response.status() === 200);
      await page.getByRole('button', { name: '仍然转为选题' }).click();
      await promotedResponse;
      assert.equal(inspirationPromoteAttempts, 1, 'explicit confirmation creates one promotion request');
      await page.waitForURL(`**/topics/${linkedTopic.id}`);
      await page.getByRole('button', { name: '返回灵感' }).click();
      await page.waitForURL('**/inspirations');
      const promotedIdeaCard = page.getByRole('heading', { name: inspiration.title }).locator('xpath=ancestor::div[@role="button"]');
      if (width === 320) await page.screenshot({ path: '/tmp/xmt-inspiration-promoted-link-320.png', fullPage: true });
      await promotedIdeaCard.getByRole('button', { name: '查看关联选题' }).click();
      await page.waitForURL(`**/topics/${linkedTopic.id}`);
      await page.getByRole('button', { name: '返回灵感' }).click();
      await page.waitForURL('**/inspirations');
      await submitIdea.click();
      await page.getByRole('button', { name: '取消' }).waitFor();
      await page.getByRole('button', { name: '取消' }).click();
      const promotedCard = page.getByRole('heading', { name: promotedInspiration.title }).locator('xpath=ancestor::div[@role="button"]');
      await promotedCard.getByRole('button', { name: '查看关联选题' }).click();
      await page.waitForURL(`**/topics/${linkedTopic.id}`);
      await page.getByRole('button', { name: '返回灵感' }).click();
      await page.waitForURL('**/inspirations');
      await page.getByRole('button', { name: '返回工作' }).click();
      await page.waitForURL('**/production');

      await page.getByRole('button', { name: /看板/ }).click();
      await page.waitForURL((url) => url.pathname === '/topics' && url.searchParams.get('view') === 'board');
      await page.getByLabel('选题状态看板').getByRole('heading', { name: '创作中' }).waitFor();
      for (const label of ['平台', '负责人']) {
        assert.equal(await page.getByText(label, { exact: true }).evaluate((element) => getComputedStyle(element).whiteSpace), 'nowrap');
      }
      const kanban = await assertMobileLayout(page, width, 'topics-board');
      await page.getByRole('button', { name: '返回工作' }).click();
      await page.waitForURL('**/production');

      await page.goto(`${baseUrl}/kanban`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL((url) => url.pathname === '/topics' && url.searchParams.get('view') === 'board');
      await page.getByLabel('选题状态看板').waitFor();
      await page.getByRole('button', { name: '返回工作' }).click();
      await page.waitForURL('**/production');

      dailyReport = createDailyReport();
      failNextDailySubmit = true;
      dailyDraftVersions.length = 0;
      dailyDraftWriteAttempts = 0;
      dailyDraftDelayMs = 120;
      await page.getByRole('button', { name: '写日报' }).click();
      await page.waitForURL('**/daily-report');
      await page.getByText(/· 我的日报/).waitFor();
      await page.getByPlaceholder('记录今天完成或推进的工作').fill('完成日报保存与提交恢复验收');
      expectConsoleFailure();
      const failedDailySubmit = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/api/daily-reports/${dailyReport.id}/submit`) && response.status() === 503);
      await page.getByRole('button', { name: '提交日报' }).dblclick();
      await failedDailySubmit;
      await page.getByText('模拟提交失败').waitFor();
      assert.deepEqual(dailyDraftVersions, [5], 'first daily save uses the loaded version');
      assert.equal(dailyDraftWriteAttempts, 1, 'a rapid double-click saves the daily draft only once');
      dailyDraftDelayMs = 0;
      await page.getByRole('button', { name: '提交日报' }).click();
      await page.getByText('日报已提交', { exact: true }).waitFor();
      await page.getByText('审核中', { exact: true }).waitFor();
      await page.getByText('日报已提交，审核前仍可修改并再次提交。', { exact: true }).waitFor();
      assert.deepEqual(dailyDraftVersions, [5, 6], 'retry uses the version returned by the successful draft save');
      const daily = await assertMobileLayout(page, width, 'daily-report');
      const reviewComment = '请补充今天完成工作的具体进展。';
      dailyReport = { ...dailyReport, status: 'rejected', reviewComment };
      await page.reload();
      await page.getByText('已退回', { exact: true }).waitFor();
      await page.getByText(reviewComment, { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('记录今天完成或推进的工作').isDisabled(), false, 'rejected reports remain editable');
      dailyReport = { ...dailyReport, status: 'approved' };
      const staleDraft = [{ sectionKey: 'today', title: '今日工作', contentMd: '不应覆盖已审核日报的旧本机草稿', sortOrder: 0 }];
      await page.evaluate(({ reportDate, draft }) => {
        localStorage.setItem(`xmt:safe-draft:v1:user:1:daily:${reportDate}`, JSON.stringify({ savedAt: Date.now(), value: draft }));
      }, { reportDate: dailyReport.reportDate, draft: staleDraft });
      await page.reload();
      await page.getByText('已通过', { exact: true }).waitFor();
      await page.getByText('日报已通过审核，当前为只读状态。', { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('记录今天完成或推进的工作').isDisabled(), true, 'approved reports are read-only');
      await page.getByText('日报当前为只读状态，本机未提交草稿未应用且仍保留在本机。', { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('记录今天完成或推进的工作').inputValue(), '完成日报保存与提交恢复验收', 'approved reports render server content instead of a stale local draft');
      assert.equal(await page.evaluate((reportDate) => localStorage.getItem(`xmt:safe-draft:v1:user:1:daily:${reportDate}`)?.includes('不应覆盖已审核日报的旧本机草稿'), dailyReport.reportDate), true, 'read-only review must preserve local drafts without applying them');
      if (width === 320) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: '/tmp/xmt-mobile-daily-partial-success-320.png', fullPage: true });
      }

      assert.deepEqual(errors, [], `viewport ${width}: ${errors.join('\n')}`);
      console.log(`Mobile work-center browser checks passed at ${width}px`, { hub, calendar, ideas, kanban, daily });
    } finally {
      await context.close();
    }
  }

  for (const width of [320, 390]) {
    const previousPermissions = fixturePermissions;
    fixturePermissions = ['workflow:shooting'];
    shootingStatusFixture.status = 'legacy_transcoding';
    failNextShootingUpdate = false;
    failNextShootingListRead = false;
    shootingListReadCount = 0;
    shootingUpdateWriteCount = 0;
    const { context, page, errors, expectConsoleFailure } = await openMobilePage(width);
    try {
      await page.goto(`${baseUrl}/shooting`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '成片制作' }).waitFor();
      await page.getByText(/状态待确认/).waitFor();
      assert.equal(await page.getByText('legacy_transcoding', { exact: true }).count(), 0, 'shooting list must not expose an unknown raw status');
      const shootingList = await assertMobileLayout(page, width, 'shooting-status-list');
      await page.getByRole('button', { name: '查看', exact: true }).click();
      await page.waitForURL(`**/shooting/${shootingStatusFixture.id}`);
      await page.getByRole('heading', { level: 1, name: shootingStatusFixture.topic_title, exact: true }).waitFor();
      await page.getByText('状态待确认', { exact: true }).waitFor();
      assert.equal(await page.getByText('legacy_transcoding', { exact: true }).count(), 0, 'shooting detail must not expose an unknown raw status');
      const shootingDetail = await assertMobileLayout(page, width, 'shooting-status-detail');

      if (width === 320) {
        await page.goto(`${baseUrl}/shooting`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: '成片制作' }).waitFor();
        await page.getByRole('button', { name: '完成', exact: true }).click();
        await page.getByRole('heading', { name: '确认完成', exact: true }).waitFor();
        failNextShootingUpdate = true;
        expectConsoleFailure();
        const failedComplete = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/shooting/${shootingStatusFixture.id}`) && response.status() === 503);
        await page.getByRole('button', { name: '确认完成', exact: true }).click();
        await failedComplete;
        await page.getByText('操作失败', { exact: true }).waitFor();
        assert.equal(shootingStatusFixture.status, 'legacy_transcoding', 'failed completion leaves the isolated shooting state unchanged');
        assert.equal(await page.getByRole('heading', { name: '确认完成', exact: true }).count(), 1, 'failed completion keeps its confirmation open for retry');
        const successfulComplete = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/shooting/${shootingStatusFixture.id}`) && response.ok());
        failNextShootingListRead = true;
        expectConsoleFailure();
        await page.getByRole('button', { name: '确认完成', exact: true }).click();
        await successfulComplete;
        await page.getByText('完成成功', { exact: true }).waitFor();
        await page.getByText('服务端已确认成片制作完成，但列表读取失败；当前页面保留已确认状态，请重新加载列表确认，不要重复操作。', { exact: true }).waitFor();
        assert.equal(shootingStatusFixture.status, 'completed', 'successful completion updates the isolated shooting state');
        assert.equal(await page.getByRole('button', { name: '完成', exact: true }).count(), 0, 'the confirmed completed row no longer offers a duplicate completion action after refresh failure');
        await page.getByRole('heading', { name: '确认完成', exact: true }).waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('heading', { name: '确认完成', exact: true }).count(), 0, 'successful completion closes its confirmation');
        const writesAfterComplete = shootingUpdateWriteCount;
        const readsBeforeRetry = shootingListReadCount;
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        const completedShootingCard = page.getByRole('heading', { name: shootingStatusFixture.topic_title, exact: true }).locator('xpath=../..');
        await completedShootingCard.getByText('已完成', { exact: true }).waitFor();
        assert.equal(shootingListReadCount, readsBeforeRetry + 1, 'recovery performs one read-only list request');
        assert.equal(shootingUpdateWriteCount, writesAfterComplete, 'recovery does not repeat the confirmed completion write');
      }

      await page.goto(`${baseUrl}/publishing`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '发布管理' }).waitFor();
      await page.getByText('状态待确认', { exact: true }).waitFor();
      assert.equal(await page.getByText('legacy_verifying', { exact: true }).count(), 0, 'publishing list must not expose an unknown raw status');
      const publishingList = await assertMobileLayout(page, width, 'publishing-status-list');
      await page.getByRole('button', { name: '状态映射发布任务 移动验收', exact: true }).click();
      await page.waitForURL(`**/publishing/${publishingStatusFixture.id}`);
      await page.getByText(`发布管理详情 · 关联选题 #${linkedTopic.id}`, { exact: true }).waitFor();
      const publishingDetailFallbackCount = await page.getByText('状态待确认', { exact: true }).count();
      assert(publishingDetailFallbackCount >= 1, 'publishing detail shows the safe fallback');
      assert.equal(await page.getByText('legacy_verifying', { exact: true }).count(), 0, 'publishing detail must not expose an unknown raw status');
      assert.equal(await page.getByText('legacy_transcoding', { exact: true }).count(), 0, 'linked shooting detail must not expose an unknown raw status');
      if (width === 320) await page.screenshot({ path: '/tmp/xmt-mobile-publishing-status-detail-320.png', fullPage: true });
      const publishingDetail = await assertMobileLayout(page, width, 'publishing-status-detail');

      assert.deepEqual(errors, [], `workflow status viewport ${width}: ${errors.join('\n')}`);
      console.log(`Mobile workflow status checks passed at ${width}px`, { shootingList, shootingDetail, publishingList, publishingDetail });
    } finally {
      fixturePermissions = previousPermissions;
      await context.close();
    }
  }

  {
    const { context, page, errors, expectConsoleFailure } = await openMobilePage(390);
    let topicListReads = 0;
    await page.route('**/api/topics?*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      topicListReads += 1;
      if (topicListReads <= 2) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '模拟选题列表读取失败' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [unknownStatusTopic], total: 1, page: 1, limit: 20 }),
      });
    });
    try {
      expectConsoleFailure();
      expectConsoleFailure();
      await page.goto(`${baseUrl}/topics`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('alert').getByText('选题列表读取失败：模拟选题列表读取失败', { exact: true }).waitFor();
      await page.getByText('选题数量暂不可用', { exact: true }).waitFor();
      await page.getByText('暂时无法确认符合条件的选题，请重试。', { exact: true }).waitFor();
      assert.equal(await page.getByText('没有符合条件的选题', { exact: true }).count(), 0, 'failed mobile topic loading is not presented as an empty result');
      assert.equal(topicListReads, 2, 'the page waits until the configured read retry is exhausted');
      const recoveredRead = page.waitForResponse((response) => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/topics' && response.status() === 200);
      await page.getByRole('button', { name: '重试加载选题', exact: true }).click();
      await recoveredRead;
      await page.getByText(unknownStatusTopic.title, { exact: true }).waitFor();
      assert.equal(await page.getByRole('alert').count(), 0, 'a successful explicit retry clears the topic list error');
      assert.equal(topicListReads, 3, 'explicit recovery adds one read and no writes');
      await assertMobileLayout(page, 390, 'topic-list-read-recovery');
      assert.deepEqual(errors, [], `topic list read recovery: ${errors.join('\n')}`);
    } finally {
      await context.close();
    }
  }

  {
    const { context, page, errors } = await openMobilePage(320);
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      await page.getByText(unknownStatusTopic.title, { exact: true }).waitFor();
      await page.getByText('状态待确认', { exact: true }).waitFor();
      assert.equal(await page.getByText('legacy_review', { exact: true }).count(), 0, 'mobile home must not expose an unknown topic status');
      await assertMobileLayout(page, 320, 'home-unknown-status');
      await page.goto(`${baseUrl}/topics`, { waitUntil: 'domcontentloaded' });
      await page.getByText(unknownStatusTopic.title, { exact: true }).waitFor();
      const listFallback = page.getByText('状态待确认', { exact: true });
      await listFallback.waitFor();
      assert((await listFallback.getAttribute('class') || '').includes('bg-studio-surface-soft'), 'unknown topic list status uses a neutral surface token');
      assert.equal(await page.getByText('legacy_review', { exact: true }).count(), 0, 'mobile topic list must not expose unknown raw status');
      await assertMobileLayout(page, 320, 'topics-unknown-status-list');
      await page.getByRole('button', { name: new RegExp(unknownStatusTopic.title) }).click();
      await page.waitForURL(`**/topics/${unknownStatusTopic.id}`);
      await page.getByLabel('选题标题').waitFor();
      const detailFallback = page.getByText('状态待确认', { exact: true });
      await detailFallback.waitFor();
      assert((await detailFallback.getAttribute('class') || '').includes('bg-studio-surface-soft'), 'unknown topic detail status uses a neutral surface token');
      assert.equal(await page.getByText('legacy_review', { exact: true }).count(), 0, 'mobile topic detail must not expose an unknown raw status or render a blank label');
      await assertMobileLayout(page, 320, 'topic-unknown-status-detail');
      assert.deepEqual(errors, [], `unknown topic status viewport: ${errors.join('\n')}`);
    } finally {
      await context.close();
    }
  }

  {
    const visualTopic = { ...linkedTopic, updated_at: '2026-10-12T03:00:00.000Z', deadline: '2026-10-20T00:00:00.000Z' };
    for (const width of [320, 390]) {
      const { context, page, errors } = await openMobilePage(width);
      try {
      await page.route(/\/api\/topics\?/, async (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [visualTopic], total: 1, page: 1, limit: 20 }),
      }));
      await page.route(`**/api/topics/${visualTopic.id}`, async (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: visualTopic }),
      }));
      await page.route(`**/api/topics/${visualTopic.id}/resources`, async (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }));
      await page.route(`**/api/topics/${visualTopic.id}/asset-dimensions`, async (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }));
      await page.route(/\/api\/users(?:\?|\/)/, async (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0, page: 1, limit: 50 }),
      }));
      await page.goto(`${baseUrl}/topics`, { waitUntil: 'domcontentloaded' });
      const topicCard = page.getByRole('button', { name: new RegExp(visualTopic.title) });
      await topicCard.waitFor();
      await topicCard.getByText('2026/10/20', { exact: true }).waitFor();
      assert.equal(await page.getByText('2026-10-20T00:00:00.000Z', { exact: true }).count(), 0, 'mobile topic list formats ISO deadlines as local dates');
      await assertMobileLayout(page, width, `topic-date-list-${width}`);
      await topicCard.click();
      await page.waitForURL(`**/topics/${visualTopic.id}`);
      await page.getByRole('button', { name: '保存修改' }).waitFor();
      await page.getByText('2026/10/12', { exact: true }).waitFor();
      await page.getByText('2026/10/20', { exact: true }).waitFor();
      assert.equal(await page.getByText(/2026-10-(12|20)T/, { exact: false }).count(), 0, 'mobile topic detail does not expose raw ISO timestamps');
      const actionAndNavigationBounds = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="移动主导航"]')?.getBoundingClientRect();
        const save = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('保存修改'));
        const actions = save?.parentElement?.getBoundingClientRect();
        return { navTop: nav?.top ?? null, actionsBottom: actions?.bottom ?? null, viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth };
      });
      assert(actionAndNavigationBounds.navTop !== null && actionAndNavigationBounds.actionsBottom !== null);
      assert(actionAndNavigationBounds.actionsBottom <= actionAndNavigationBounds.navTop, `mobile topic actions must remain above fixed navigation: ${JSON.stringify(actionAndNavigationBounds)}`);
      await assertMobileLayout(page, width, `topic-detail-action-navigation-${width}`);
      assert.deepEqual(errors, [], `mobile topic detail date/action layout: ${errors.join('\n')}`);
      } finally {
        await context.close();
      }
    }
  }

  {
    const previousPermissions = fixturePermissions;
    fixturePermissions = ['production:view'];
    const { context, page, errors } = await openMobilePage(320);
    try {
      await page.goto(`${baseUrl}/production/content`, { waitUntil: 'domcontentloaded' });
      await page.getByText(unknownStatusProductionFixture.topic_title, { exact: true }).waitFor();
      await page.getByText(/状态待确认/).waitFor();
      assert.equal(await page.getByText('legacy_draft', { exact: true }).count(), 0, 'mobile production list must not expose an unknown raw status');
      await assertMobileLayout(page, 320, 'production-unknown-status-list');
      assert.deepEqual(errors, [], `unknown production status viewport: ${errors.join('\n')}`);
    } finally {
      fixturePermissions = previousPermissions;
      await context.close();
    }
  }

  {
    const previousUser = fixtureUser;
    const previousPermissions = fixturePermissions;
    const listReader = { ...user, id: 17, username: 'mobile-production-list-reader', name: '创作列表恢复验收', role: 'member' };
    fixtureUser = listReader;
    fixturePermissions = ['production:view'];
    const { context, page, errors, expectConsoleFailure } = await openMobilePage(390, listReader);
    let listReads = 0;
    const latestList = { ...mobileProductionFixture, id: 783, topic_title: '恢复后的最新创作稿件' };
    await page.route('**/api/workflow/production*', async (route) => {
      if (route.request().method() !== 'GET' || new URL(route.request().url()).pathname !== '/api/workflow/production') {
        await route.continue();
        return;
      }
      listReads += 1;
      if (listReads === 1) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...mobileProductionFixture, id: 782, topic_title: '上次成功读取的创作稿件' }]) });
        return;
      }
      if (listReads === 2) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '模拟创作列表刷新失败' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([latestList]) });
    });
    try {
      await page.goto(`${baseUrl}/production/content`, { waitUntil: 'domcontentloaded' });
      await page.getByText('上次成功读取的创作稿件', { exact: true }).waitFor();
      assert.equal(listReads, 1, 'the mobile production list makes one initial GET');
      expectConsoleFailure();
      const failedRefresh = page.waitForResponse((response) => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/workflow/production' && response.status() === 503);
      await page.getByRole('button', { name: '刷新创作列表', exact: true }).click();
      await failedRefresh;
      await page.getByRole('alert').getByText('获取创作列表失败', { exact: true }).waitFor();
      await page.getByRole('status').getByText('仍显示上次成功读取的 1 条稿件；当前列表可能不是最新。', { exact: true }).waitFor();
      assert.equal(await page.getByText('还没有创作稿件', { exact: true }).count(), 0, 'a failed refresh cannot be mistaken for an empty list');
      const recoveredRefresh = page.waitForResponse((response) => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/workflow/production' && response.status() === 200 && listReads === 3);
      await page.getByRole('button', { name: '重新加载创作列表', exact: true }).click();
      await recoveredRefresh;
      await page.getByText(latestList.topic_title, { exact: true }).waitFor();
      assert.equal(await page.getByText('上次成功读取的创作稿件', { exact: true }).count(), 0, 'successful retry replaces the stale list');
      assert.equal(await page.getByText('仍显示上次成功读取的 1 条稿件；当前列表可能不是最新。', { exact: true }).count(), 0, 'stale-data notice clears after a successful retry');
      assert.equal(listReads, 3, 'recovery uses one explicit read retry, without any write');
      await assertMobileLayout(page, 390, 'production-list-refresh-recovery');
      assert.deepEqual(errors, [], `production list recovery viewport: ${errors.join('\n')}`);
    } finally {
      fixtureUser = previousUser;
      fixturePermissions = previousPermissions;
      await context.close();
    }
  }

  const roleCases = [
    { role: 'director', id: 2, name: '负责人只读验收', permissions: ['production:view', 'production:update'], canEdit: false },
    { role: 'editor', id: 3, name: '内容编辑验收', permissions: ['production:view', 'production:update'], canEdit: true },
  ] as const;
  for (const roleCase of roleCases) {
    fixtureUser = { ...user, id: roleCase.id, username: `mobile-${roleCase.role}-qa`, name: roleCase.name, role: roleCase.role };
    fixturePermissions = [...roleCase.permissions];
    const { context, page, errors } = await openMobilePage(390, fixtureUser);
    let productionWrites = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/workflow/production/780') && request.method() === 'PUT') productionWrites += 1;
    });
    try {
      await page.goto(`${baseUrl}/production/content/${mobileProductionFixture.id}`, { waitUntil: 'domcontentloaded' });
      assert.equal(new URL(page.url()).pathname, `/production/content/${mobileProductionFixture.id}`, `${roleCase.role} should stay on the requested editor route`);
      assert((await page.title()).trim().length > 0, 'app page title is present');
      assert.equal(await page.locator('vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count(), 0, 'no framework error overlay is present');
      const editor = page.locator('.ProseMirror').first();
      await editor.waitFor();
      if (roleCase.canEdit) {
        await page.getByRole('button', { name: '保存草稿' }).waitFor();
        assert.equal(await page.getByText('只读模式：当前账号仅可查看。').count(), 0);
        assert.equal(await editor.getAttribute('contenteditable'), 'true');
      } else {
        await page.getByText('只读模式：当前账号仅可查看。').waitFor();
        assert.equal(await page.getByRole('button', { name: '保存草稿' }).count(), 0);
        assert.equal(await page.getByRole('button', { name: '提交审核' }).count(), 0);
        assert.equal(await editor.getAttribute('contenteditable'), 'false');
        await editor.click();
        assert.equal(await editor.getAttribute('contenteditable'), 'false', 'clicking the read-only body cannot enable editing');
        await page.screenshot({ path: '/tmp/xmt-mobile-production-director-readonly-390.png' });
      }
      assert.equal(productionWrites, 0, `${roleCase.role} fixture made no production update request`);
      assert.deepEqual(errors, [], `${roleCase.role} viewport: ${errors.join('\n')}`);
    } finally {
      await context.close();
    }
  }

  const mobileRoleLabels = [
    { role: 'copywriter', id: 7, name: '文案角色验收', label: '文案' },
    { role: 'post_production', id: 8, name: '后期角色验收', label: '后期' },
    { role: 'camera', id: 9, name: '摄像角色验收', label: '摄像' },
  ] as const;
  for (const roleCase of mobileRoleLabels) {
    fixtureUser = { ...user, id: roleCase.id, username: `mobile-${roleCase.role}-qa`, name: roleCase.name, role: roleCase.role };
    fixturePermissions = [];
    const { context, page, errors } = await openMobilePage(390, fixtureUser);
    try {
      await page.goto(`${baseUrl}/me`, { waitUntil: 'domcontentloaded' });
      await page.getByText(roleCase.label, { exact: true }).waitFor();
      assert.equal(await page.getByText(roleCase.role, { exact: true }).count(), 0, `${roleCase.role} should not appear as a raw role label`);
      assert.deepEqual(errors, [], `${roleCase.role} account viewport: ${errors.join('\n')}`);
    } finally {
      await context.close();
    }
  }

  const topicCreator = { ...user, id: 4, username: 'mobile-topic-creator', name: '选题提报验收', role: 'member' };
  fixtureUser = topicCreator;
  fixturePermissions = ['topic:create'];
  const { context: creatorContext, page: creatorPage, errors: creatorErrors, expectConsoleFailure: expectCreatorFailure } = await openMobilePage(320, topicCreator);
  let releaseMobileCreate = () => {};
  try {
    await creatorPage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    const titleInput = creatorPage.getByPlaceholder('输入清晰、可执行的选题标题');
    await titleInput.waitFor();
    const title = '移动提报失败后仍可重试';
    await titleInput.fill(title);
    const searchCountBefore = topicSearchAttempts.get('移动') ?? 0;
    await creatorPage.getByRole('button', { name: '提交选题' }).click();
    await creatorPage.getByRole('heading', { name: '发现标题相似的选题' }).waitFor();
    await creatorPage.getByText(mobileSimilarTopic.title, { exact: true }).waitFor();
    assert.equal(topicCreateAttempts.get(title) ?? 0, 0, 'similarity review appears before creating the topic');
    const searchCountAfterReview = topicSearchAttempts.get('移动') ?? 0;
    assert(searchCountAfterReview > searchCountBefore, 'similarity check uses the current account topic search');
    await creatorPage.screenshot({ path: '/tmp/xmt-topic-similarity-mobile-320.png', fullPage: true });
    const mobileCreateGate = new Promise<void>((resolve) => { releaseMobileCreate = resolve; });
    await creatorPage.route('**/api/topics', async (route) => {
      if (route.request().method() === 'POST') await mobileCreateGate;
      await route.continue();
    });
    expectCreatorFailure();
    const failedCreate = creatorPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 503);
    const mobileCreateStarted = creatorPage.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/topics'));
    const mobileCreateClick = creatorPage.getByRole('button', { name: '仍然提报' }).dblclick();
    await mobileCreateStarted;
    await creatorPage.locator('fieldset[aria-busy="true"]').waitFor();
    assert.equal(await titleInput.isDisabled(), true, 'a mobile topic submission protects its submitted title while waiting');
    assert.equal(await creatorPage.getByPlaceholder('列出内容结构、核心观点和素材方向').isDisabled(), true, 'a mobile topic submission protects its outline while waiting');
    assert.equal(await creatorPage.getByRole('button', { name: '新建草稿', exact: true }).isDisabled(), true, 'a pending submission cannot switch to a new local draft');
    assert.equal(await creatorPage.locator('section[aria-label="本机草稿列表"] button').evaluateAll((buttons) => buttons.every((button) => button.matches(':disabled'))), true, 'all mobile draft switch/delete actions are protected until the write finishes');
    await creatorPage.screenshot({ path: '/tmp/xmt-topic-submit-locked-mobile-320.png', fullPage: true });
    releaseMobileCreate();
    await mobileCreateClick;
    await failedCreate;
    await creatorPage.getByText('选题服务暂不可用，已保留本次输入', { exact: true }).waitFor();
    assert.equal(await titleInput.inputValue(), title, 'failed create keeps the entered topic title');
    assert.equal(await titleInput.isDisabled(), false, 'a failed mobile topic submission restores editing and retry');
    assert.equal(topicCreateAttempts.get(title), 1);
    const successfulCreate = creatorPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 200);
    await creatorPage.getByRole('button', { name: '提交选题' }).click();
    await successfulCreate;
    await creatorPage.waitForURL('**/topics');
    assert.equal(topicCreateAttempts.get(title), 2, 'retry submits exactly once after the failure');
    assert.equal(topicSearchAttempts.get('移动'), searchCountAfterReview, 'a failed mutation retry does not repeat the similarity search');
    assert.deepEqual(creatorErrors, [], creatorErrors.join('\n'));
  } finally {
    releaseMobileCreate();
    await creatorContext.close();
  }

  const checkFailureCreator = { ...user, id: 12, username: 'topic-similarity-check-failure', name: '查重失败验收', role: 'member' };
  fixtureUser = checkFailureCreator;
  fixturePermissions = ['topic:create'];
  const { context: checkFailureContext, page: checkFailurePage, errors: checkFailureErrors, expectConsoleFailure: expectCheckFailure } = await openMobilePage(390, checkFailureCreator);
  try {
    await checkFailurePage.route('**/api/topics?*', async (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '选题检查暂不可用' }) }));
    await checkFailurePage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    const title = '检查暂不可用时仍可提交';
    await checkFailurePage.getByPlaceholder('输入清晰、可执行的选题标题').fill(title);
    expectCheckFailure();
    expectCheckFailure();
    expectCheckFailure();
    await checkFailurePage.getByRole('button', { name: '提交选题' }).click();
    await checkFailurePage.getByRole('heading', { name: '暂时无法检查相似选题' }).waitFor();
    assert.equal(topicCreateAttempts.get(title) ?? 0, 0, 'failed similarity search waits for an explicit decision');
    await checkFailurePage.getByText('当前无法完成相似选题检查。你可以返回稍后重试，也可以确认后继续。', { exact: true }).waitFor();
    expectCheckFailure();
    const continuedCreate = checkFailurePage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 503);
    await checkFailurePage.getByRole('button', { name: '仍然提报' }).click();
    await continuedCreate;
    assert.equal(topicCreateAttempts.get(title), 1, 'user can explicitly continue when similarity search is unavailable');
    assert.deepEqual(checkFailureErrors, [], checkFailureErrors.join('\n'));
  } finally {
    await checkFailureContext.close();
  }

  mobileCreatedProduction = null;
  mobileProductionCreateAttempts = 0;
  mobileProductionCreateDelayMs = 450;
  failNextMobileProductionCreate = true;
  failNextMobileProductionTopicList = true;
  const mobileProductionAuthor = { ...user, id: 32, username: 'mobile-production-author', name: '移动创作保存验收', role: 'editor' };
  fixtureUser = mobileProductionAuthor;
  fixturePermissions = ['production:update'];
  const { context: productionAuthorContext, page: productionAuthorPage, errors: productionAuthorErrors, expectConsoleFailure: expectCreateFailure } = await openMobilePage(390, mobileProductionAuthor);
  try {
    expectCreateFailure();
    productionAuthorPage.setDefaultTimeout(5000);
    await productionAuthorPage.goto(`${baseUrl}/production/content/new`, { waitUntil: 'domcontentloaded' });
    await productionAuthorPage.getByRole('alert').getByText('模拟选题列表读取失败', { exact: true }).waitFor({ timeout: 3000 });
    assert.equal(await productionAuthorPage.getByRole('button', { name: '重试加载', exact: true }).count(), 1, 'a failed topic list read has an explicit recovery action');
    await productionAuthorPage.getByRole('button', { name: '重试加载', exact: true }).click();
    const topicSelector = productionAuthorPage.getByLabel('关联选题');
    await topicSelector.waitFor();
    await topicSelector.selectOption(String(linkedTopic.id));
    const editor = productionAuthorPage.locator('.ProseMirror[contenteditable="true"]');
    await editor.waitFor();
    const draftContent = '移动创作稿快速双击与失败重试验收';
    await editor.fill(draftContent);
    expectCreateFailure();
    const failedCreate = productionAuthorPage.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/production' && response.status() === 503);
    const createRequest = productionAuthorPage.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/workflow/production');
    const doubleClickSave = productionAuthorPage.getByRole('button', { name: '保存草稿' }).dblclick();
    await createRequest;
    await productionAuthorPage.waitForFunction(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'false');
    assert.equal(await productionAuthorPage.locator('.ProseMirror').getAttribute('contenteditable'), 'false', 'editing is temporarily locked while the save result is pending');
    assert.equal(await productionAuthorPage.getByRole('button', { name: '提交审核' }).isDisabled(), true, 'submit cannot race with a pending draft save');
    await doubleClickSave;
    await failedCreate;
    await productionAuthorPage.getByRole('status').getByText('模拟创作保存失败', { exact: true }).waitFor();
    assert.equal(mobileProductionCreateAttempts, 1, 'a rapid double-click during a delayed mobile production create sends one POST');
    assert.equal(await editor.innerText(), draftContent, 'failed mobile production save keeps the editor content available for retry');
    assert.equal(new URL(productionAuthorPage.url()).pathname, '/production/content/new', 'failed create keeps the author on the draft form');

    mobileProductionCreateDelayMs = 0;
    const successfulCreate = productionAuthorPage.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/production' && response.status() === 200);
    await productionAuthorPage.getByRole('button', { name: '保存草稿' }).click();
    await successfulCreate;
    await productionAuthorPage.waitForURL('**/production/content/912');
    assert.equal(mobileProductionCreateAttempts, 2, 'explicit retry sends one additional create after the failed attempt');
    assert.ok(mobileCreatedProduction?.content.includes(draftContent), 'successful retry persists the preserved editor content');
    assert.deepEqual(productionAuthorErrors, [], productionAuthorErrors.join('\n'));
  } finally {
    mobileProductionCreateDelayMs = 0;
    failNextMobileProductionCreate = false;
    failNextMobileProductionTopicList = false;
    await productionAuthorContext.close();
  }

  approvedMobileTopic = { ...approvedMobileTopic, status: 'approved' };
  mobileCreatedProduction = null;
  mobileProductionCreateAttempts = 0;
  mobileStageTransitionAttempts = 0;
  mobileProductionHandoffEvents = [];
  const productionStarter = { ...user, id: 3, username: 'mobile-production-starter', name: '移动创作验收', role: 'editor' };
  fixtureUser = productionStarter;
  fixturePermissions = ['topic:update', 'production:update'];
  const { context: starterContext, page: starterPage, errors: starterErrors } = await openMobilePage(390, productionStarter);
  try {
    const topicDimensions: Array<{ id: number; type: 'city' | 'person' | 'project'; value: string }> = [];
    let nextTopicDimensionId = 950;
    await starterPage.route(`**/api/topics/${linkedTopic.id}/asset-dimensions**`, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: topicDimensions }) });
        return;
      }
      if (request.method() === 'POST') {
        const input = request.postDataJSON() as { type: 'city' | 'person' | 'project'; value: string };
        const dimension = { id: nextTopicDimensionId++, ...input };
        topicDimensions.push(dimension);
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: '维度已登记', id: dimension.id, data: dimension }) });
        return;
      }
      const dimensionId = Number(new URL(request.url()).pathname.split('/').at(-1));
      const index = topicDimensions.findIndex(({ id }) => id === dimensionId);
      if (index >= 0) topicDimensions.splice(index, 1);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: '维度已移除' }) });
    });
    await starterPage.goto(`${baseUrl}/topics/${linkedTopic.id}`, { waitUntil: 'domcontentloaded' });
    await starterPage.getByRole('button', { name: '进入创作' }).waitFor();
    await starterPage.getByText('暂未登记城市、人物或项目。', { exact: true }).waitFor();
    await starterPage.getByLabel(`维度名称-${linkedTopic.id}`).fill('宁波');
    const addCityResponse = starterPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/topics/${linkedTopic.id}/asset-dimensions`) && response.status() === 201);
    await starterPage.getByRole('button', { name: '添加维度' }).click();
    await addCityResponse;
    await starterPage.getByText('宁波', { exact: true }).waitFor();
    await starterPage.getByRole('status').getByText('城市“宁波”已登记。', { exact: true }).waitFor();
    await starterPage.getByLabel(`维度类型-${linkedTopic.id}`).selectOption('project');
    await starterPage.getByLabel(`维度名称-${linkedTopic.id}`).fill('老街早餐计划');
    const addProjectResponse = starterPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/topics/${linkedTopic.id}/asset-dimensions`) && response.status() === 201);
    await starterPage.getByRole('button', { name: '添加维度' }).click();
    await addProjectResponse;
    await starterPage.getByText('老街早餐计划', { exact: true }).waitFor();
    await starterPage.getByRole('status').getByText('项目“老街早餐计划”已登记。', { exact: true }).waitFor();
    await assertMobileLayout(starterPage, 390, 'topic-dimensions');
    await starterPage.screenshot({ path: '/tmp/xmt-topic-dimensions-mobile-390.png', fullPage: true });
    const removeCityResponse = starterPage.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().includes(`/api/topics/${linkedTopic.id}/asset-dimensions/`) && response.status() === 200);
    await starterPage.getByRole('button', { name: '移除城市：宁波' }).click();
    await removeCityResponse;
    assert.equal(await starterPage.getByText('宁波', { exact: true }).count(), 0, 'removing an explicit dimension updates the topic detail immediately');
    await starterPage.getByRole('status').getByText('内容维度已移除。', { exact: true }).waitFor();
    assert.deepEqual(topicDimensions.map(({ type, value }) => ({ type, value })), [{ type: 'project', value: '老街早餐计划' }]);

    const existingDraft = starterPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes(`/api/workflow/production?topic_id=${linkedTopic.id}`));
    await starterPage.getByRole('button', { name: '进入创作' }).click();
    await existingDraft;
    await starterPage.waitForURL(`**/production/content/${mobileProductionFixture.id}`);
    await starterPage.locator('.ProseMirror').waitFor();
    await starterPage.getByRole('button', { name: '返回选题' }).click();
    await starterPage.waitForURL(`**/topics/${linkedTopic.id}`);
    assert.equal(mobileProductionCreateAttempts, 0, 'opening an existing mobile production does not create another draft');

    await starterPage.goto(`${baseUrl}/topics/${approvedMobileTopic.id}`, { waitUntil: 'domcontentloaded' });
    await starterPage.getByRole('button', { name: '开始创作' }).waitFor();
    const advanceApprovedTopic = starterPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/topics/${approvedMobileTopic.id}/status`) && response.status() === 200);
    await starterPage.getByRole('button', { name: '开始创作' }).click();
    await advanceApprovedTopic;
    await starterPage.waitForURL('**/production/content/912');
    await starterPage.locator('.ProseMirror').waitFor();
    await starterPage.screenshot({ path: '/tmp/xmt-mobile-topic-start-production-390.png', fullPage: true });
    assert.equal(mobileStageTransitionAttempts, 1, 'starting an approved topic advances its canonical stage exactly once');
    assert.deepEqual(mobileProductionHandoffEvents, ['advance', 'list'], 'the UI advances through the atomic Topic transition before reading its child record');
    assert.equal(mobileProductionCreateAttempts, 0, 'the UI does not create a detached draft after stage transition');
    assert.equal(mobileCreatedProduction?.topic_id, approvedMobileTopic.id);
    assert.equal(mobileCreatedProduction?.content, approvedMobileTopic.outline, 'the server-created mobile draft carries the selected topic outline');
    assert.equal(mobileCreatedProduction?.status, 'draft');
    await starterPage.getByRole('button', { name: '返回选题' }).click();
    await starterPage.waitForURL(`**/topics/${approvedMobileTopic.id}`);
    await starterPage.getByText('创作中', { exact: true }).waitFor();
    const reopenExistingDraft = starterPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes(`/api/workflow/production?topic_id=${approvedMobileTopic.id}`));
    await starterPage.getByRole('button', { name: '进入创作' }).click();
    await reopenExistingDraft;
    await starterPage.waitForURL('**/production/content/912');
    assert.equal(mobileProductionCreateAttempts, 0, 'starting again reuses the linked draft rather than duplicating it');
    assert.equal(mobileStageTransitionAttempts, 1, 'reopening an existing production does not advance the stage twice');
    assert.equal(await starterPage.getByText('继续创作', { exact: true }).count(), 0, 'resuming an existing draft does not stack a duplicate success toast');
    assert.deepEqual(starterErrors, [], starterErrors.join('\n'));
  } finally {
    await starterContext.close();
  }

  approvedMobileTopic = { ...approvedMobileTopic, status: 'approved' };
  mobileCreatedProduction = null;
  mobileProductionCreateAttempts = 0;
  mobileStageTransitionAttempts = 0;
  mobileProductionHandoffEvents = [];
  const desktopProductionStarter = { ...productionStarter, id: 30, username: 'desktop-production-starter', name: '桌面创作验收' };
  fixtureUser = desktopProductionStarter;
  fixturePermissions = ['topic:update', 'production:update'];
  const { context: desktopStarterContext, page: desktopStarterPage, errors: desktopStarterErrors } = await openMobilePage(1440, desktopProductionStarter);
  try {
    const permissionsResponse = desktopStarterPage.waitForResponse((response) => response.url().endsWith('/api/permissions/my'));
    await desktopStarterPage.goto(`${baseUrl}/topics/${approvedMobileTopic.id}`, { waitUntil: 'domcontentloaded' });
    const permissionResult = await permissionsResponse;
    assert.equal(permissionResult.status(), 200, 'desktop receives the authenticated current-user permissions response');
    assert.deepEqual(await permissionResult.json(), ['topic:update', 'production:update']);
    await desktopStarterPage.getByRole('button', { name: '开始创作' }).waitFor();
    const advanceApprovedTopic = desktopStarterPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/topics/${approvedMobileTopic.id}/status`) && response.status() === 200);
    await desktopStarterPage.getByRole('button', { name: '开始创作' }).click();
    await advanceApprovedTopic;
    await desktopStarterPage.waitForURL('**/production/912');
    await desktopStarterPage.locator('.ProseMirror[contenteditable="true"]').waitFor();
    assert.deepEqual(mobileProductionHandoffEvents, ['advance', 'list'], 'desktop uses the same stage-first handoff as mobile');
    assert.equal(mobileProductionCreateAttempts, 0, 'desktop does not create a detached draft after stage transition');
    assert.equal(await desktopStarterPage.locator('vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count(), 0, 'desktop production editor has no framework error overlay');
    await desktopStarterPage.screenshot({ path: '/tmp/xmt-desktop-topic-start-production-1440.png', fullPage: true });
    assert.deepEqual(desktopStarterErrors, [], desktopStarterErrors.join('\n'));
  } finally {
    await desktopStarterContext.close();
  }

  const narrowTopicDimensionUser = { ...productionStarter, id: 15, username: 'narrow-topic-dimensions', name: '窄屏维度验收' };
  fixtureUser = narrowTopicDimensionUser;
  fixturePermissions = ['topic:update'];
  const { context: narrowTopicDimensionContext, page: narrowTopicDimensionPage, errors: narrowTopicDimensionErrors } = await openMobilePage(320, narrowTopicDimensionUser);
  try {
    await narrowTopicDimensionPage.goto(`${baseUrl}/topics/${linkedTopic.id}`, { waitUntil: 'domcontentloaded' });
    await narrowTopicDimensionPage.getByRole('heading', { name: '城市、人物与项目' }).waitFor();
    await narrowTopicDimensionPage.getByLabel(`维度名称-${linkedTopic.id}`).waitFor();
    await assertMobileLayout(narrowTopicDimensionPage, 320, 'topic-dimensions');
    assert.deepEqual(narrowTopicDimensionErrors, [], narrowTopicDimensionErrors.join('\n'));
  } finally {
    await narrowTopicDimensionContext.close();
  }

  const topicEditor = { ...user, id: 5, username: 'mobile-topic-editor', name: '选题编辑验收', role: 'member' };
  fixtureUser = topicEditor;
  fixturePermissions = ['topic:update'];
  const { context: editorContext, page: editorPage, errors: editorErrors, expectConsoleFailure: expectEditorFailure } = await openMobilePage(390, topicEditor);
  let editableTopicDetailReads = 0;
  editorPage.on('request', (request) => {
    if (request.method() === 'GET' && request.url().endsWith(`/api/topics/${editableTopic.id}`)) editableTopicDetailReads += 1;
  });
  try {
    await editorPage.goto(`${baseUrl}/topics/${editableTopic.id}`, { waitUntil: 'domcontentloaded' });
    await editorPage.getByRole('button', { name: '保存修改' }).waitFor();
    const titleInput = editorPage.getByLabel('选题标题');
    await editorPage.waitForTimeout(250);
    assert(editableTopicDetailReads <= 3, `topic permission/load updates must settle instead of refetching indefinitely (reads=${editableTopicDetailReads})`);
    const changedTitle = '移动编辑重载后恢复';
    await titleInput.fill(changedTitle);
    await editorPage.waitForFunction(() => {
      const raw = localStorage.getItem('xmt:safe-draft:v1:user:5:topic:904:edit');
      return Boolean(raw && JSON.parse(raw).value?.title === '移动编辑重载后恢复');
    });
    expectEditorFailure();
    const failedUpdate = editorPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/topics/${editableTopic.id}`) && response.status() === 503);
    await editorPage.getByRole('button', { name: '保存修改' }).click();
    await failedUpdate;
    await editorPage.getByText('保存服务暂不可用，请稍后重试', { exact: true }).waitFor();
    await editorPage.reload({ waitUntil: 'domcontentloaded' });
    await editorPage.getByText('已恢复未提交的本地修改；确认后再保存到服务器。', { exact: true }).waitFor();
    assert.equal(await titleInput.inputValue(), changedTitle, 'failed update draft survives reload for an authorized owner');
    await editorPage.getByRole('button', { name: '保存修改' }).click();
    await editorPage.getByText('已保存', { exact: true }).waitFor();
    assert.equal(await editorPage.evaluate(() => localStorage.getItem('xmt:safe-draft:v1:user:5:topic:904:edit')), null, 'successful retry clears the recovered topic edit draft');
    assert.equal(topicUpdateAttempts, 2);
    assert.deepEqual(editorErrors, [], editorErrors.join('\n'));
  } finally {
    await editorContext.close();
  }

  const resourceViewer = { ...user, id: 16, username: 'mobile-topic-resource-viewer', name: '资料读取恢复验收' };
  fixtureUser = resourceViewer;
  fixturePermissions = ['topic:view'];
  failNextTopicResourcesRead = true;
  topicResourcesReadAttempts = 0;
  const { context: topicResourcesContext, page: topicResourcesPage, errors: topicResourcesErrors, expectConsoleFailure: expectTopicResourcesFailure } = await openMobilePage(390, resourceViewer);
  try {
    expectTopicResourcesFailure();
    await topicResourcesPage.goto(`${baseUrl}/topics/${resourceRecoveryTopic.id}`, { waitUntil: 'domcontentloaded' });
    await topicResourcesPage.getByRole('alert').getByText(/关联资料读取失败/).waitFor();
    assert.equal(await topicResourcesPage.getByText('暂无关联资料', { exact: true }).count(), 0, 'a failed resource read is not presented as an empty relationship list');
    assert.equal(topicResourcesReadAttempts, 1, 'initial resource failure performs one read and no write');
    await topicResourcesPage.getByRole('button', { name: '重新加载资料', exact: true }).click();
    await topicResourcesPage.getByText('隔离验收关联资料', { exact: true }).waitFor();
    assert.equal(topicResourcesReadAttempts, 2, 'the recovery control retries only the resource GET');
    assert.equal(await topicResourcesPage.getByRole('alert').count(), 0, 'successful retry clears the resource error');
    assert.deepEqual(topicResourcesErrors, [], topicResourcesErrors.join('\n'));
  } finally {
    await topicResourcesContext.close();
  }

  const topicAuditor = { ...user, id: 6, username: 'mobile-topic-auditor', name: '独立审核验收', role: 'director' };
  fixtureUser = topicAuditor;
  fixturePermissions = ['topic:audit'];
  const { context: auditorContext, page: auditorPage, errors: auditorErrors, expectConsoleFailure: expectAuditorFailure } = await openMobilePage(390, topicAuditor);
  try {
    await auditorPage.goto(`${baseUrl}/topics/${auditableTopic.id}`, { waitUntil: 'domcontentloaded' });
    await auditorPage.getByRole('button', { name: '开始审核' }).click();
    assert.equal(await auditorPage.getByRole('button', { name: '保存修改' }).count(), 0, 'audit permission does not grant content editing');
    await auditorPage.getByRole('button', { name: '驳回', exact: true }).click();
    const comment = '请补充选题依据后再提交';
    await auditorPage.getByPlaceholder('填写通过说明或需要修改的内容').fill(comment);
    expectAuditorFailure();
    const failedAudit = auditorPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/topics/${auditableTopic.id}/audit`) && response.status() === 503);
    await auditorPage.getByRole('button', { name: '确认驳回选题' }).click();
    await failedAudit;
    await auditorPage.getByText('审核服务暂不可用，请稍后重试', { exact: true }).waitFor();
    assert.equal(await auditorPage.getByPlaceholder('填写通过说明或需要修改的内容').inputValue(), comment, 'failed audit keeps the decision and review comment available');
    await auditorPage.getByText('审核服务暂不可用，请稍后重试', { exact: true }).scrollIntoViewIfNeeded();
    await auditorPage.screenshot({ path: '/tmp/xmt-mobile-topic-audit-failure-390.png' });
    failNextAuditRefresh = true;
    expectAuditorFailure();
    const savedAudit = auditorPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/topics/${auditableTopic.id}/audit`) && response.status() === 200);
    const failedAuditRefresh = auditorPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith(`/api/topics/${auditableTopic.id}`) && response.status() === 503);
    await auditorPage.getByRole('button', { name: '确认驳回选题' }).click();
    await Promise.all([savedAudit, failedAuditRefresh]);
    await auditorPage.getByText('审核结果已提交；页面刷新失败，请重新加载确认当前状态，不要重复审核。', { exact: true }).waitFor();
    assert.equal(auditableTopic.status, 'rejected', 'the audit write remains successful when its detail refresh fails');
    assert.deepEqual(topicAuditComments, [comment, comment], 'audit retry sends the unchanged review comment exactly once more');
    const reloadedAuditTopic = auditorPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith(`/api/topics/${auditableTopic.id}`));
    await auditorPage.reload({ waitUntil: 'domcontentloaded' });
    assert.equal((await reloadedAuditTopic).status(), 200, 'reload reads the persisted audit result');
    const reloadedTitle = auditorPage.getByRole('textbox', { name: '选题标题' });
    await reloadedTitle.waitFor();
    assert.equal(await reloadedTitle.inputValue(), auditableTopic.title, 'reload restores the persisted topic title');
    await auditorPage.getByText('已驳回', { exact: true }).waitFor();
    assert.deepEqual(topicAuditComments, [comment, comment], 'reload does not repeat the committed audit mutation');
    assert.deepEqual(auditorErrors, [], auditorErrors.join('\n'));
  } finally {
    await auditorContext.close();
  }

  const stageRepairUser = { ...user, id: 17, username: 'mobile-stage-repair', name: '移动阶段补齐验收', role: 'editor' };
  fixtureUser = stageRepairUser;
  fixturePermissions = ['topic:update'];
  const { context: stageRepairContext, page: stageRepairPage, errors: stageRepairErrors, expectConsoleFailure: expectStageRepairFailure } = await openMobilePage(390, stageRepairUser);
  try {
    await stageRepairPage.goto(`${baseUrl}/topics/${stageRepairTopic.id}`, { waitUntil: 'domcontentloaded' });
    const stageRepairTitle = stageRepairPage.getByRole('textbox', { name: '选题标题' });
    await stageRepairTitle.waitFor();
    assert.equal(await stageRepairTitle.inputValue(), stageRepairTopic.title);
    await stageRepairPage.getByRole('alert').getByText('当前阶段缺少创作稿记录').waitFor();
    failNextStageRepairRefresh = true;
    expectStageRepairFailure();
    const stageRepairWrite = stageRepairPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/topics/${stageRepairTopic.id}/repair-stage-record`) && response.status() === 200);
    const failedStageRepairRefresh = stageRepairPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith(`/api/topics/${stageRepairTopic.id}`) && response.status() === 503);
    await stageRepairPage.getByRole('button', { name: '补齐创作稿记录', exact: true }).click();
    await Promise.all([stageRepairWrite, failedStageRepairRefresh]);
    await stageRepairPage.getByText('服务端已确认阶段记录补齐；页面刷新失败，请重新加载确认当前状态，不要重复操作。', { exact: true }).waitFor();
    assert.equal(stageRepairWrites, 1, 'the mobile repair API write succeeded exactly once');
    assert.equal(stageRepairTopic.stage_record_presence.production, true, 'mobile repair persisted before its refresh failed');
    assert.equal(stageRepairTopic.status, 'production', 'mobile stage-record repair does not advance the Topic stage');
    await stageRepairPage.reload({ waitUntil: 'domcontentloaded' });
    await stageRepairPage.getByRole('textbox', { name: '选题标题' }).waitFor();
    assert.equal(await stageRepairPage.getByRole('alert').count(), 0, 'reloading reflects the already-persisted stage record');
    assert.equal(await stageRepairPage.getByRole('button', { name: '补齐创作稿记录', exact: true }).count(), 0, 'reload does not offer a duplicate repair');
    assert.equal(stageRepairWrites, 1, 'reload does not repeat the committed repair');
    assert.deepEqual(stageRepairErrors, [], stageRepairErrors.join('\n'));
  } finally {
    await stageRepairContext.close();
  }

  const mobileDraftUser = { ...user, id: 9, username: 'mobile-topic-draft', name: '移动草稿验收', role: 'member' };
  fixtureUser = mobileDraftUser;
  fixturePermissions = ['topic:create'];
  const { context: mobileDraftContext, page: mobileDraftPage, errors: mobileDraftErrors, expectConsoleFailure: expectMobileDraftFailure } = await openMobilePage(390, mobileDraftUser);
  const mobileDraftTitle = '选题保存恢复校验A';
  const mobileDraftKey = 'xmt:safe-draft:v1:user:9:topic:new';
  try {
    await mobileDraftPage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    const titleInput = mobileDraftPage.getByPlaceholder('输入清晰、可执行的选题标题');
    await titleInput.fill(mobileDraftTitle);
    await mobileDraftPage.getByPlaceholder('说明选题来源、场景和目标').fill('保存后重新进入仍应保留的项目背景');
    await mobileDraftPage.getByPlaceholder('列出内容结构、核心观点和素材方向').fill('开头、采访、结尾');
    await mobileDraftPage.getByRole('button', { name: '存本地草稿' }).click();
    await mobileDraftPage.getByText('已保存到本机草稿，不会创建服务端选题', { exact: true }).waitFor();
    await mobileDraftPage.waitForFunction(({ key, expectedTitle }) => {
      const entry = JSON.parse(localStorage.getItem(key) || 'null')?.value?.drafts?.find((candidate) => candidate.draft.title === expectedTitle);
      return entry?.draft.projectBackground === '保存后重新进入仍应保留的项目背景';
    }, { key: mobileDraftKey, expectedTitle: mobileDraftTitle });

    await mobileDraftPage.reload({ waitUntil: 'domcontentloaded' });
    await mobileDraftPage.getByText('已保存到本机草稿，不会创建服务端选题', { exact: true }).waitFor({ state: 'detached' });
    await mobileDraftPage.waitForFunction(({ key, expectedTitle }) => {
      const entry = JSON.parse(localStorage.getItem(key) || 'null')?.value?.drafts?.find((candidate) => candidate.draft.title === expectedTitle);
      return entry?.draft?.title === expectedTitle;
    }, { key: mobileDraftKey, expectedTitle: mobileDraftTitle });
    await mobileDraftPage.getByPlaceholder('输入清晰、可执行的选题标题').waitFor();
    assert.equal(await titleInput.inputValue(), mobileDraftTitle, 'mobile form restores the current account draft after reload');
    assert.equal(await mobileDraftPage.getByPlaceholder('说明选题来源、场景和目标').inputValue(), '保存后重新进入仍应保留的项目背景');
    assert.equal(await mobileDraftPage.getByPlaceholder('列出内容结构、核心观点和素材方向').inputValue(), '开头、采访、结尾');
    await mobileDraftPage.screenshot({ path: '/tmp/xmt-topic-draft-mobile-restored-390.png', fullPage: true });

    expectMobileDraftFailure();
    const failedCreate = mobileDraftPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 503);
    await mobileDraftPage.getByRole('button', { name: '提交选题' }).click();
    await failedCreate;
    await mobileDraftPage.getByText('选题服务暂不可用，已保留本次输入', { exact: true }).waitFor();
    assert.equal(await mobileDraftPage.getByPlaceholder('输入清晰、可执行的选题标题').inputValue(), mobileDraftTitle, 'failed mobile submit keeps its editable content');
    assert.equal(await mobileDraftPage.evaluate((key) => Boolean(localStorage.getItem(key)), mobileDraftKey), true, 'failed mobile submit keeps the saved draft');

    const successfulCreate = mobileDraftPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 200);
    await mobileDraftPage.getByRole('button', { name: '提交选题' }).click();
    await successfulCreate;
    await mobileDraftPage.waitForURL((url) => url.pathname === '/topics');
    assert.equal(await mobileDraftPage.evaluate((key) => localStorage.getItem(key), mobileDraftKey), null, 'successful mobile submit clears only its own draft');
    assert.deepEqual(mobileDraftErrors, [], mobileDraftErrors.join('\n'));
  } finally {
    await mobileDraftContext.close();
  }

  const storageFailureUser = { ...user, id: 10, username: 'mobile-topic-storage-failure', name: '移动存储失败验收', role: 'member' };
  fixtureUser = storageFailureUser;
  fixturePermissions = ['topic:create'];
  const { context: storageFailureContext, page: storageFailurePage, errors: storageFailureErrors } = await openMobilePage(390, storageFailureUser);
  try {
    await storageFailureContext.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'xmt:safe-draft:v1:user:10:topic:new') throw new Error('storage quota exceeded');
        originalSetItem.call(this, key, value);
      };
    });
    await storageFailurePage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    await storageFailurePage.getByPlaceholder('输入清晰、可执行的选题标题').fill('移动存储失败必须明确提示');
    await storageFailurePage.getByText('本机存储不可用，草稿未能保存；请检查设备存储后重试。', { exact: true }).waitFor();
    await storageFailurePage.getByRole('button', { name: '存本地草稿' }).click();
    await storageFailurePage.getByText('本机存储不可用，草稿未能保存；请检查设备存储后重试。', { exact: true }).waitFor();
    await storageFailurePage.screenshot({ path: '/tmp/xmt-topic-draft-storage-error-390.png', fullPage: true });
    assert.equal(topicCreateAttempts.get('移动存储失败必须明确提示') ?? 0, 0, 'storage failure does not submit a topic');
    assert.deepEqual(storageFailureErrors, [], storageFailureErrors.join('\n'));
  } finally {
    await storageFailureContext.close();
  }

  const messageUser = { ...user, id: 8, username: 'mobile-message-recovery', name: '消息恢复验收', role: 'member' };
  fixtureUser = messageUser;
  fixturePermissions = [];
  mobileMessagesFixture = [];
  messageLoadFailures = 1;
  const { context: messageErrorContext, page: messageErrorPage, errors: messageErrorErrors, expectConsoleFailure: expectMessageLoadFailure } = await openMobilePage(390, messageUser);
  try {
    expectMessageLoadFailure();
    const failedMessageLoad = messageErrorPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/messages?') && response.status() === 503);
    await messageErrorPage.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
    await failedMessageLoad;
    await messageErrorPage.getByRole('heading', { name: '消息加载失败' }).waitFor();
    assert.equal(await messageErrorPage.getByText('暂无消息', { exact: true }).count(), 0, 'a failed request without cache must not look like an empty inbox');
    await messageErrorPage.screenshot({ path: '/tmp/xmt-mobile-message-load-error-390.png', fullPage: true });
    await messageErrorPage.getByRole('button', { name: '重试加载' }).click();
    await messageErrorPage.getByText('暂无消息', { exact: true }).waitFor();
    assert.deepEqual(messageErrorErrors, [], messageErrorErrors.join('\n'));
  } finally {
    await messageErrorContext.close();
  }

  mobileMessagesFixture = [{ id: 992, title: '需重试的工作提醒', content: '标记失败时应保留在消息页', read: false, link: `/topics/${linkedTopic.id}` }];
  messageReadFailures = 1;
  messageReadAttempts = 0;
  for (const theme of ['light', 'dark'] as const) {
    const { context, page, errors } = await openMobilePage(1440, messageUser, theme);
    try {
      await page.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
      const messageLabel = page.getByText('可进入关联页面', { exact: true });
      await messageLabel.waitFor();
      const ratio = await textContrast(messageLabel);
      assert(ratio >= 4.5, `${theme}主题桌面消息关联提示对比度为 ${ratio.toFixed(2)}:1，应不低于 4.5:1`);
      assert.deepEqual(errors, [], `${theme}主题移动消息回归无浏览器错误`);
    } finally {
      await context.close();
    }

    const { context: mobileContext, page: mobilePage, errors: mobileErrors } = await openMobilePage(390, messageUser, theme);
    try {
      await mobilePage.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
      const unreadBadge = mobilePage.getByLabel('移动主导航').getByText('1', { exact: true });
      const unreadContrast = await textContrast(unreadBadge);
      assert(unreadContrast >= 4.5, `${theme}主题手机未读徽标对比度为 ${unreadContrast.toFixed(2)}:1，应不低于 4.5:1`);
      const activeMessageFilter = mobilePage.getByRole('button', { name: '全部', exact: true });
      assert((await activeMessageFilter.getAttribute('class'))?.includes('bg-studio-primary-button'), `${theme}主题消息当前筛选使用主按钮色令牌`);
      const filterContrast = await textContrast(activeMessageFilter);
      assert(filterContrast >= 4.5, `${theme}主题手机消息当前筛选文字对比度为 ${filterContrast.toFixed(2)}:1，应不低于 4.5:1`);
      const refresh = mobilePage.getByRole('button', { name: '刷新', exact: true });
      const markAll = mobilePage.getByRole('button', { name: '全部已读', exact: true });
      for (const [label, element] of [['手机消息刷新操作', refresh], ['手机全部已读操作', markAll]] as const) {
        const contrast = await textContrast(element);
        assert(contrast >= 4.5, `${theme}主题${label}对比度为 ${contrast.toFixed(2)}:1，应不低于 4.5:1`);
      }
      assert.deepEqual(mobileErrors, [], `${theme}主题手机消息回归无浏览器错误`);
    } finally {
      await mobileContext.close();
    }
  }
  const priorDailyPermissions = fixturePermissions;
  fixturePermissions = ['report:daily:submit'];
  dailyReport = createDailyReport();
  for (const theme of ['light', 'dark'] as const) {
    const { context, page, errors } = await openMobilePage(390, user, theme);
    try {
      await page.goto(`${baseUrl}/daily-report`, { waitUntil: 'domcontentloaded' });
      const submit = page.getByRole('button', { name: '提交日报', exact: true });
      await submit.waitFor();
      const ratio = await textContrast(submit);
      assert(ratio >= 4.5, `${theme}主题移动日报提交按钮对比度为 ${ratio.toFixed(2)}:1，应不低于 4.5:1`);
      await page.goto(`${baseUrl}/calendar`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '排期日历', exact: true }).waitFor();
      const todayMarker = page.locator('span.bg-studio-primary-button').first();
      await todayMarker.waitFor();
      assert((await textContrast(todayMarker)) >= 4.5, `${theme}主题日历今天日期标记文字对比度应不低于 4.5:1`);
      assert.deepEqual(errors, [], `${theme}主题移动日报页面无浏览器错误`);
    } finally {
      await context.close();
    }
  }
  fixturePermissions = priorDailyPermissions;

  const priorReportNavigationPermissions = fixturePermissions;
  fixturePermissions = ['export:data', 'report:daily:submit', 'analytics:view'];
  for (const theme of ['light', 'dark'] as const) {
    const { context, page, errors } = await openMobilePage(1440, user, theme);
    try {
      await page.goto(`${baseUrl}/daily-report`, { waitUntil: 'domcontentloaded' });
      const dailyTab = page.getByRole('button', { name: '我的日报', exact: true });
      await dailyTab.waitFor();
      assert(dailyTab && (await dailyTab.getAttribute('class'))?.includes('bg-studio-primary-button'), `${theme}主题日报当前标签应使用主按钮色令牌`);
      assert((await textContrast(dailyTab)) >= 4.5, `${theme}主题日报当前标签文字对比度应不低于 4.5:1`);

      await page.goto(`${baseUrl}/export`, { waitUntil: 'domcontentloaded' });
      const weeklyTab = page.getByRole('button', { name: '周报', exact: true });
      await weeklyTab.waitFor();
      await weeklyTab.click();
      assert((await weeklyTab.getAttribute('class'))?.includes('bg-studio-primary-button'), `${theme}主题报告中心当前标签应使用主按钮色令牌`);
      assert((await textContrast(weeklyTab)) >= 4.5, `${theme}主题报告中心当前标签文字对比度应不低于 4.5:1`);
      await page.goto(`${baseUrl}/daily-report`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: '总结归档', exact: true }).click();
      const archiveKind = page.getByRole('button', { name: '日报', exact: true });
      await archiveKind.waitFor();
      assert((await archiveKind.getAttribute('class'))?.includes('bg-studio-primary-button'), `${theme}主题日报总结归档当前类型使用主按钮色令牌`);
      assert((await textContrast(archiveKind)) >= 4.5, `${theme}主题日报总结归档当前类型文字对比度应不低于 4.5:1`);
      assert.deepEqual(errors, [], `${theme}主题桌面日报/报告中心页面无浏览器错误`);
    } finally {
      await context.close();
    }
  }
  fixturePermissions = priorReportNavigationPermissions;

  const { context: messageReadContext, page: messageReadPage, errors: messageReadErrors, expectConsoleFailure: expectMessageReadFailure } = await openMobilePage(390, messageUser);
  try {
    await messageReadPage.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
    const messageCard = messageReadPage.getByRole('button', { name: /需重试的工作提醒/ });
    await messageCard.waitFor();
    expectMessageReadFailure();
    const failedMessageRead = messageReadPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/messages/992') && response.status() === 503);
    await messageCard.click();
    await failedMessageRead;
    assert.equal(await messageReadPage.getByText('标记消息失败', { exact: true }).count(), 1, 'mark failure remains visible on the inbox');
    assert.equal(await messageReadPage.url(), `${baseUrl}/messages`, 'failed mark must not navigate away from its recovery message');
    const successfulMessageRead = messageReadPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/messages/992') && response.status() === 200);
    await messageCard.click();
    await successfulMessageRead;
    await messageReadPage.waitForURL(`**/topics/${linkedTopic.id}`);
    assert.equal(messageReadAttempts, 2, 'failed mark is retried exactly once before navigation');
    assert.deepEqual(messageReadErrors, [], messageReadErrors.join('\n'));
  } finally {
    await messageReadContext.close();
  }

  mobileMessagesFixture = [
    { id: 994, title: '批量已读成功提醒', content: '成功项应保留已读状态。', read: false },
    { id: 995, title: '批量已读失败提醒', content: '失败项应保留未读并允许重试。', read: false },
  ];
  messageReadFailures = 0;
  messageReadFailureIds.clear();
  messageReadFailureIds.add(995);
  messageReadAttempts = 0;
  const { context: mobileBulkReadContext, page: mobileBulkReadPage, errors: mobileBulkReadErrors, expectConsoleFailure: expectMobileBulkReadFailure } = await openMobilePage(390, messageUser);
  try {
    await mobileBulkReadPage.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
    await mobileBulkReadPage.getByRole('button', { name: /批量已读成功提醒/ }).waitFor();
    expectMobileBulkReadFailure();
    await mobileBulkReadPage.getByRole('button', { name: '全部已读', exact: true }).click();
    await mobileBulkReadPage.getByText('1 条已标记为已读，1 条仍未读，可重试。', { exact: true }).waitFor();
    assert.equal(mobileMessagesFixture.find((message) => message.id === 994)?.read, true, 'successful messages are reflected as read after partial completion');
    assert.equal(mobileMessagesFixture.find((message) => message.id === 995)?.read, false, 'failed messages remain unread after partial completion');
    await mobileBulkReadPage.getByText('未读 1 条', { exact: true }).waitFor();
    assert.equal(messageReadAttempts, 2, 'bulk read sends one individual request for each unread message');
    await mobileBulkReadPage.getByRole('button', { name: '全部已读', exact: true }).click();
    await mobileBulkReadPage.getByText('所有消息已标记为已读', { exact: true }).waitFor();
    assert.ok(mobileMessagesFixture.every((message) => message.read), 'a successful retry eventually marks all messages read');
    assert.equal(messageReadAttempts, 3, 'retry submits only the one message that remained unread');
    assert.deepEqual(mobileBulkReadErrors, [], mobileBulkReadErrors.join('\n'));
  } finally {
    await mobileBulkReadContext.close();
  }

  const desktopMessageUser = { ...user, id: 10, username: 'desktop-message-recovery', name: '桌面消息恢复验收', role: 'member' };
  fixtureUser = desktopMessageUser;
  fixturePermissions = [];
  mobileMessagesFixture = [{ id: 993, title: '桌面待处理提醒', content: '失败后应留在消息中心，成功后才打开选题。', read: false, link: `/topics/${linkedTopic.id}`, type: 'info', created_at: '2026-09-28T09:00:00.000Z' }];
  messageReadFailures = 1;
  messageReadAttempts = 0;
  messageReadDelayMs = 180;
  const { context: desktopMessageContext, page: desktopMessagePage, errors: desktopMessageErrors, expectConsoleFailure: expectDesktopMessageFailure } = await openMobilePage(1440, desktopMessageUser);
  try {
    expectDesktopMessageFailure();
    await desktopMessagePage.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
    assert.ok((await desktopMessagePage.title()).trim().length > 0, 'the desktop message page must have a document title');
    const desktopMessageCard = desktopMessagePage.getByRole('button', { name: /桌面待处理提醒/ });
    await desktopMessageCard.waitFor();
    const failedDesktopMessageRead = desktopMessagePage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/messages/993') && response.status() === 503);
    await desktopMessageCard.click();
    await desktopMessagePage.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.disabled && button.getAttribute('aria-busy') === 'true'));
    assert.equal(await desktopMessageCard.isDisabled(), true, 'the in-flight message action must not be submitted again');
    await failedDesktopMessageRead;
    assert.equal(messageReadAttempts, 1, 'one click must issue one read request');
    await desktopMessagePage.getByText('标记消息失败', { exact: true }).waitFor();
    assert.equal(await desktopMessagePage.url(), `${baseUrl}/messages`, 'a failed mark must preserve the inbox and its retry opportunity');
    assert.equal(await desktopMessageCard.getByText('未读', { exact: true }).count(), 1, 'a failed mark must preserve unread state');
    await desktopMessagePage.screenshot({ path: '/tmp/xmt-desktop-message-read-failed.png', fullPage: true });

    messageReadDelayMs = 0;
    const successfulDesktopMessageRead = desktopMessagePage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/messages/993') && response.status() === 200);
    await desktopMessageCard.click();
    await successfulDesktopMessageRead;
    await desktopMessagePage.waitForURL(`**/topics/${linkedTopic.id}`);
    const linkedTopicMain = desktopMessagePage.locator('main');
    await linkedTopicMain.waitFor({ state: 'visible' });
    assert.ok((await linkedTopicMain.innerText()).trim().length > 0, 'the associated topic destination must render meaningful content');
    assert.equal(messageReadAttempts, 2, 'retry must succeed once before the associated topic opens');
    assert.equal(await desktopMessagePage.locator('vite-error-overlay, nextjs-portal').count(), 0, 'the destination must not show a framework error overlay');
    assert.deepEqual(desktopMessageErrors, [], desktopMessageErrors.join('\n'));
  } finally {
    messageReadDelayMs = 0;
    await desktopMessageContext.close();
  }

  const paginationUser = { ...user, id: 11, username: 'desktop-message-pagination', name: '消息分页验收', role: 'member' };
  fixtureUser = paginationUser;
  fixturePermissions = [];
  mobileMessagesFixture = Array.from({ length: 45 }, (_, index) => ({
    id: 1200 + index,
    title: `分页消息 ${index + 1}`,
    content: '验证服务端分页、筛选和全局已读。',
    read: index % 3 === 0,
    ...(index % 2 === 0 ? { link: `/topics/${linkedTopic.id}` } : {}),
    type: 'info',
    created_at: new Date(Date.UTC(2026, 8, 28, 12, 0, 0) - index * 60_000).toISOString(),
  }));
  messageBulkReadAttempts = 0;
  messageClearFailures = 1;
  messageClearAttempts = 0;
  const { context: messagePaginationContext, page: messagePaginationPage, errors: messagePaginationErrors, expectConsoleFailure: expectMessageClearFailure } = await openMobilePage(1440, paginationUser);
  try {
    await messagePaginationPage.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(messagePaginationPage.url()).pathname, '/messages', 'the desktop message flow remains on the intended inbox route');
    assert.equal(await messagePaginationPage.locator('vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count(), 0, 'the message inbox renders without a framework error overlay');
    await messagePaginationPage.getByRole('heading', { name: '分页消息 1', exact: true }).waitFor();
    await messagePaginationPage.getByText('本页 20 条，共 45 条', { exact: true }).waitFor();
    assert.equal(await messagePaginationPage.getByRole('button', { name: '上一页' }).isDisabled(), true, 'page one must not allow navigating backward');

    await messagePaginationPage.getByRole('button', { name: '下一页' }).click();
    await messagePaginationPage.getByRole('heading', { name: '分页消息 21', exact: true }).waitFor();
    await messagePaginationPage.getByText('共 45 条，第 2 / 3 页', { exact: true }).waitFor();
    await messagePaginationPage.evaluate(() => {
      window.scrollTo({ top: 0 });
      document.querySelector('main')?.scrollTo({ top: 0 });
    });
    await messagePaginationPage.screenshot({ path: '/tmp/xmt-desktop-message-pagination-1440.png', fullPage: true });

    const unreadFilterResponse = messagePaginationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/messages?') && response.url().includes('read=unread'));
    await messagePaginationPage.getByRole('button', { name: '未读', exact: true }).click();
    const unreadResult = await (await unreadFilterResponse).json() as { total: number; page: number; data: unknown[] };
    assert.equal(unreadResult.total, 30, 'unread total is calculated across all pages');
    assert.equal(unreadResult.page, 1, 'changing a filter returns to page one');
    assert.equal(unreadResult.data.length, 20, 'unread filter returns one server page');
    await messagePaginationPage.getByText('本页 20 条，共 30 条', { exact: true }).waitFor();
    assert.equal(await messagePaginationPage.getByRole('heading', { name: '分页消息 1', exact: true }).count(), 0, 'read rows must not leak into the unread page');

    const actionableFilterResponse = messagePaginationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/messages?') && response.url().includes('link=present'));
    await messagePaginationPage.getByRole('button', { name: '待处理', exact: true }).click();
    const actionableResult = await (await actionableFilterResponse).json() as { total: number; data: Array<{ link?: string; read: boolean }> };
    assert.equal(actionableResult.total, 15, 'actionable filter includes only unread linked messages');
    assert.equal(actionableResult.data.length, 15);
    assert.ok(actionableResult.data.every((message) => !message.read && Boolean(message.link)), 'actionable filter only returns unread linked messages');

    const systemFilterResponse = messagePaginationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/messages?') && response.url().includes('link=absent'));
    await messagePaginationPage.getByRole('button', { name: '系统', exact: true }).click();
    const systemResult = await (await systemFilterResponse).json() as { total: number; data: Array<{ link?: string }> };
    assert.equal(systemResult.total, 22, 'system filter total is computed server-side');
    assert.equal(systemResult.data.length, 20);
    assert.ok(systemResult.data.every((message) => !message.link), 'system filter only returns unlinked messages');

    await messagePaginationPage.getByRole('button', { name: '全部', exact: true }).click();
    await messagePaginationPage.getByText('本页 20 条，共 45 条', { exact: true }).waitFor();
    await messagePaginationPage.getByRole('button', { name: '下一页' }).click();
    await messagePaginationPage.getByRole('heading', { name: '分页消息 21', exact: true }).waitFor();
    const bulkReadResponse = messagePaginationPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/messages/read-all'));
    await messagePaginationPage.getByRole('button', { name: '全部已读', exact: true }).click();
    await bulkReadResponse;
    assert.equal(messageBulkReadAttempts, 1, 'all-read is one server request, not one request per visible row');
    assert.ok(mobileMessagesFixture.every((message) => message.read), 'bulk read applies to messages on every page');
    await messagePaginationPage.getByText('已将 30 条未读消息标记为已读', { exact: true }).waitFor();
    await messagePaginationPage.screenshot({ path: '/tmp/xmt-desktop-message-bulk-read-1440.png', fullPage: true });
    assert.equal(await messagePaginationPage.getByRole('button', { name: '全部已读', exact: true }).isDisabled(), true, 'global unread summary updates after bulk read');
    assert.equal(await messagePaginationPage.getByText('共 45 条，第 2 / 3 页', { exact: true }).count(), 1, 'mark all read preserves the current page for the all filter');

    let resolveStaleListReadStarted!: () => void;
    const staleListReadStarted = new Promise<void>((resolve) => { resolveStaleListReadStarted = resolve; });
    messageListReadStarted = resolveStaleListReadStarted;
    messageListReadHold = true;
    const staleListResponse = messagePaginationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/messages?') && response.url().includes('read=unread'));
    await messagePaginationPage.getByRole('button', { name: '未读', exact: true }).click();
    await staleListReadStarted;

    await messagePaginationPage.getByRole('button', { name: '清空', exact: true }).click();
    await messagePaginationPage.getByRole('heading', { name: '确认清空消息' }).waitFor();
    const failedClearResponse = messagePaginationPage.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith('/api/messages'));
    expectMessageClearFailure();
    await messagePaginationPage.getByRole('button', { name: '确认清空', exact: true }).click();
    assert.equal((await failedClearResponse).status(), 503);
    await messagePaginationPage.getByText('清空消息失败', { exact: true }).waitFor();
    assert.equal(await messagePaginationPage.getByRole('heading', { name: '确认清空消息' }).count(), 1, 'clear failure keeps confirmation open for a safe retry');
    assert.equal(mobileMessagesFixture.length, 45, 'clear failure leaves all fixture messages intact');
    await messagePaginationPage.screenshot({ path: '/tmp/xmt-desktop-message-clear-failed-1440.png', fullPage: true });

    const successfulClearResponse = messagePaginationPage.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith('/api/messages') && response.status() === 200);
    await messagePaginationPage.getByRole('button', { name: '确认清空', exact: true }).click();
    await successfulClearResponse;
    await messagePaginationPage.getByText('消息已清空', { exact: true }).waitFor();
    await messagePaginationPage.getByText('暂无消息', { exact: true }).waitFor();
    assert.equal(messageClearAttempts, 2, 'clear retries exactly once after the injected failure');
    assert.equal(mobileMessagesFixture.length, 0, 'clear retry removes the fixture messages only after server success');

    const assertEmptyMessageMetrics = async () => {
      for (const title of ['未读消息', '待处理跳转', '消息总量']) {
        await messagePaginationPage.getByText(title, { exact: true }).locator('xpath=../../..').getByText('0', { exact: true }).waitFor();
      }
    };
    await assertEmptyMessageMetrics();
    releaseMessageListRead?.();
    releaseMessageListRead = null;
    await staleListResponse;
    await messagePaginationPage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await assertEmptyMessageMetrics();
    await messagePaginationPage.screenshot({ path: '/tmp/xmt-desktop-message-clear-success-1440.png', fullPage: true });
    assert.deepEqual(messagePaginationErrors, [], messagePaginationErrors.join('\n'));
  } finally {
    releaseMessageListRead?.();
    releaseMessageListRead = null;
    messageListReadHold = false;
    await messagePaginationContext.close();
  }

  const usersListUser = { ...user, id: 12, username: 'desktop-user-pagination', name: '人员分页验收', role: 'admin' };
  fixtureUser = usersListUser;
  fixturePermissions = ['user:view'];
  usersListFixture = Array.from({ length: 65 }, (_, index) => ({
    id: 1300 + index,
    username: `team-user-${String(index + 1).padStart(3, '0')}`,
    name: `员工-${String(index + 1).padStart(3, '0')}`,
    email: `employee-${index + 1}@example.invalid`,
    role: 'member',
    enabled: true,
    created_at: '2026-09-28T09:00:00.000Z',
    updated_at: '2026-09-28T09:00:00.000Z',
  }));
  const { context: usersPaginationContext, page: usersPaginationPage, errors: usersPaginationErrors } = await openMobilePage(1440, usersListUser);
  try {
    await usersPaginationPage.goto(`${baseUrl}/users`, { waitUntil: 'domcontentloaded' });
    await usersPaginationPage.getByText('员工-001', { exact: true }).waitFor();
    await usersPaginationPage.getByText('共 65 条，第 1/2 页', { exact: true }).waitFor();
    assert.equal(await usersPaginationPage.getByText('员工-051', { exact: true }).count(), 0, 'the user page renders only its first server page');
    await usersPaginationPage.getByTitle('下一页').click();
    await usersPaginationPage.getByText('员工-051', { exact: true }).waitFor();
    await usersPaginationPage.getByText('共 65 条，第 2/2 页', { exact: true }).waitFor();
    await usersPaginationPage.screenshot({ path: '/tmp/xmt-desktop-user-pagination-1440.png', fullPage: true });

    const searchResponse = usersPaginationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/users?') && response.url().includes('search='));
    await usersPaginationPage.getByPlaceholder('搜索用户名、姓名或邮箱...').fill('员工-064');
    const searchResult = await (await searchResponse).json() as { total: number; page: number; data: Array<{ username: string }> };
    assert.equal(searchResult.total, 1, 'search reaches beyond the initial 50 visible users');
    assert.equal(searchResult.page, 1, 'changing the search resets to the first page');
    assert.equal(searchResult.data[0]?.username, 'team-user-064');
    await usersPaginationPage.getByText('员工-064', { exact: true }).waitFor();
    assert.equal(await usersPaginationPage.getByText('员工-051', { exact: true }).count(), 0, 'search results replace stale rows from the previous page');
    assert.deepEqual(usersPaginationErrors, [], usersPaginationErrors.join('\n'));
  } finally {
    await usersPaginationContext.close();
  }

  const usersActionsUser = { ...user, id: 13, username: 'users-actions-responsive', name: '人员操作验收', role: 'admin' };
  fixtureUser = usersActionsUser;
  fixturePermissions = ['user:view', 'user:update', 'user:delete'];
  const roleSamples = ['admin', 'director', 'editor', 'copywriter', 'post_production', 'camera', 'member'];
  usersListFixture = roleSamples.map((role, index) => ({
    id: 1401 + index,
    username: index === 0 ? 'row-action-user' : `role-${role}`,
    name: index === 0 ? '固定操作列验收' : `角色验收-${role}`,
    email: `${role}@example.invalid`,
    role,
    enabled: true,
    created_at: '2026-09-28T09:00:00.000Z',
    updated_at: '2026-09-28T09:00:00.000Z',
  }));
  for (const { width, theme } of [{ width: 320, theme: 'light' as const }, { width: 390, theme: 'dark' as const }, { width: 1440, theme: 'light' as const }]) {
    const { context: usersActionsContext, page: usersActionsPage, errors: usersActionsErrors } = await openMobilePage(width, usersActionsUser, theme);
    const userMutationRequests: string[] = [];
    usersActionsPage.on('request', (request) => {
      if (request.url().includes('/api/users') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
        userMutationRequests.push(`${request.method()} ${request.url()}`);
      }
    });
    try {
      await usersActionsPage.goto(`${baseUrl}/users`, { waitUntil: 'domcontentloaded' });
      await usersActionsPage.getByText('固定操作列验收', { exact: true }).waitFor();
      await usersActionsPage.locator('tbody tr').nth(roleSamples.length - 1).waitFor();
      const actionCell = usersActionsPage.getByTestId('user-row-actions-1401');
      const initialLayout = await assertMobileLayout(usersActionsPage, width, `users-actions-${theme}`);
      assert.equal(initialLayout.document, width, 'the wide user table must scroll inside its shell, not expand the page');
      for (const [index, role] of roleSamples.entries()) {
        const row = usersActionsPage.locator('tbody tr').nth(index);
        const roleBadge = row.locator('td').nth(3).locator('span');
        const statusBadge = row.locator('td').nth(4).locator('span');
        assert.ok(await textContrast(roleBadge) >= 4.5, `${theme} ${role} role label must meet 4.5:1 contrast`);
        assert.ok(await textContrast(statusBadge) >= 4.5, `${theme} ${role} account status must meet 4.5:1 contrast`);
      }

      const scrollState = await actionCell.evaluate((element) => {
        const scroller = element.closest('table')?.parentElement;
        if (!scroller) throw new Error('User table scroll container is missing');
        scroller.scrollLeft = scroller.scrollWidth;
        const rect = element.getBoundingClientRect();
        return {
          position: getComputedStyle(element).position,
          left: rect.left,
          right: rect.right,
          scrollLeft: scroller.scrollLeft,
          scrollMax: scroller.scrollWidth - scroller.clientWidth,
        };
      });
      assert.equal(scrollState.position, 'sticky', 'row operations remain fixed in the horizontal scroll window');
      assert.ok(scrollState.scrollMax === 0 || scrollState.scrollLeft > 0, 'narrow layouts expose horizontal table scrolling');
      assert.ok(scrollState.left >= 0 && scrollState.right <= width, `row action column must be visible at ${width}px: ${JSON.stringify(scrollState)}`);
      const disableButton = usersActionsPage.getByRole('button', { name: '禁用用户 row-action-user' });
      await disableButton.waitFor();
      await usersActionsPage.getByRole('button', { name: '编辑用户 row-action-user' }).waitFor();
      assert.ok(await textContrast(disableButton) >= 4.5, `${theme} user action label must retain readable contrast`);
      await usersActionsPage.screenshot({ path: `/tmp/xmt-user-actions-${width}-${theme}.png` });
      await usersActionsPage.getByRole('button', { name: '删除用户 row-action-user' }).click();
      await usersActionsPage.getByRole('heading', { name: '确认删除用户' }).waitFor();
      await usersActionsPage.getByRole('button', { name: '取消', exact: true }).click();
      assert.deepEqual(userMutationRequests, [], 'opening and cancelling a delete confirmation must not mutate user data');
      assert.deepEqual(usersActionsErrors, [], usersActionsErrors.join('\n'));
    } finally {
      await usersActionsContext.close();
    }
  }

  const userMutationGuardUser = { ...user, id: 131, username: 'user-mutation-guard-admin', name: '人员写入保护验收', role: 'admin' };
  fixtureUser = userMutationGuardUser;
  fixturePermissions = ['user:view', 'user:update', 'user:delete'];
  usersListFixture = [{
    id: 1401,
    username: 'guarded-user',
    name: '写入互斥验收',
    email: 'guarded@example.invalid',
    role: 'member',
    enabled: true,
    created_at: '2026-09-28T09:00:00.000Z',
    updated_at: '2026-09-28T09:00:00.000Z',
  }];
  userActionAttempts.update = 0;
  userActionAttempts.delete = 0;
  userActionUpdateDelayMs = 160;
  userActionDeleteDelayMs = 160;
  failNextUserActionDelete = true;
  const { context: userGuardContext, page: userGuardPage, errors: userGuardErrors, expectConsoleFailure: expectUserDeleteFailure } = await openMobilePage(390, userMutationGuardUser);
  const userActionMutationRequests: string[] = [];
  userGuardPage.on('request', (request) => {
    if (request.url().includes('/api/users/1401') && ['PUT', 'DELETE'].includes(request.method())) {
      userActionMutationRequests.push(request.method());
    }
  });
  try {
    await userGuardPage.goto(`${baseUrl}/users`, { waitUntil: 'domcontentloaded' });
    const toggleUser = userGuardPage.getByRole('button', { name: '禁用用户 guarded-user' });
    await toggleUser.waitFor();
    const toggleResponse = userGuardPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/users/1401') && response.status() === 200);
    await toggleUser.evaluate((button) => {
      button.click();
      button.click();
    });
    await toggleResponse;
    await userGuardPage.getByText('已禁用', { exact: true }).waitFor();
    assert.equal(userActionAttempts.update, 1, 'rapid user enable/disable triggers submit one update');

    await userGuardPage.getByRole('button', { name: '删除用户 guarded-user' }).click();
    await userGuardPage.getByRole('heading', { name: '确认删除用户' }).waitFor();
    await userGuardPage.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(userActionAttempts.delete, 0, 'cancelling user deletion issues no request');

    await userGuardPage.getByRole('button', { name: '删除用户 guarded-user' }).click();
    expectUserDeleteFailure();
    const failedUserDelete = userGuardPage.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith('/api/users/1401') && response.status() === 503);
    await userGuardPage.getByRole('button', { name: '确认删除', exact: true }).dblclick();
    await failedUserDelete;
    await userGuardPage.getByText('删除失败', { exact: true }).waitFor();
    assert.equal(await userGuardPage.getByRole('heading', { name: '确认删除用户' }).count(), 1, 'failed user deletion leaves the confirmation open for retry');
    assert.equal(await userGuardPage.getByText('guarded-user', { exact: true }).count(), 1, 'failed user deletion retains the original row');
    assert.equal(userActionAttempts.delete, 1, 'double confirmation during pending delete sends one request');

    const confirmedUserDelete = userGuardPage.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith('/api/users/1401') && response.status() === 200);
    await userGuardPage.getByRole('button', { name: '确认删除', exact: true }).click();
    await confirmedUserDelete;
    await userGuardPage.getByText('guarded-user', { exact: true }).waitFor({ state: 'hidden' });
    assert.equal(userActionAttempts.delete, 2, 'explicit user delete retry sends one additional request');
    assert.deepEqual(userActionMutationRequests, ['PUT', 'DELETE', 'DELETE'], 'user actions remain serialized as one update and a failed/successful delete retry');
    assert.deepEqual(userGuardErrors, [], userGuardErrors.join('\n'));
  } finally {
    userActionUpdateDelayMs = 0;
    userActionDeleteDelayMs = 0;
    await userGuardContext.close();
  }

  const usersFeedbackUser = { ...user, id: 14, username: 'users-feedback-admin', name: '人员反馈验收', role: 'admin' };
  fixtureUser = usersFeedbackUser;
  fixturePermissions = ['user:view', 'user:create', 'user:update'];
  usersListFixture = [];
  usersListReadFailures = 0;
  userWriteAttempts.create = 0;
  userWriteAttempts.update = 0;
  const { context: usersFeedbackContext, page: usersFeedbackPage, errors: usersFeedbackErrors, expectConsoleFailure: expectUsersFeedbackFailure } = await openMobilePage(390, usersFeedbackUser);
  try {
    await usersFeedbackPage.goto(`${baseUrl}/users`, { waitUntil: 'domcontentloaded' });
    await usersFeedbackPage.getByRole('button', { name: '添加用户' }).click();
    await usersFeedbackPage.getByRole('heading', { name: '添加用户' }).waitFor();
    await usersFeedbackPage.getByPlaceholder('请输入用户名').fill('user-feedback-new');
    await usersFeedbackPage.getByPlaceholder('请输入密码').fill('local-fixture-password');
    await usersFeedbackPage.getByPlaceholder('请输入姓名').fill('写入确认后待刷新');
    await usersFeedbackPage.getByPlaceholder('请输入邮箱').fill('feedback@example.invalid');

    usersListReadFailures = 1;
    expectUsersFeedbackFailure();
    const createResponse = usersFeedbackPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/users'));
    const createRefreshFailure = usersFeedbackPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/users?') && response.status() === 503);
    await usersFeedbackPage.getByRole('button', { name: '保存', exact: true }).click();
    await createResponse;
    await createRefreshFailure;
    await usersFeedbackPage.getByRole('alert').getByText('服务端已确认用户创建，但用户列表刷新失败；请重新加载列表确认，不要重复操作。', { exact: true }).waitFor();
    assert.equal(userWriteAttempts.create, 1, 'a confirmed create is sent once even if its follow-up list read fails');
    assert.equal(await usersFeedbackPage.getByText('暂无用户', { exact: true }).count(), 0, 'a failed list refresh must not be presented as an empty user list');

    const createRetry = usersFeedbackPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/users?') && response.status() === 200);
    await usersFeedbackPage.getByRole('button', { name: '重新加载列表' }).click();
    await createRetry;
    await usersFeedbackPage.getByText('user-feedback-new', { exact: true }).waitFor();
    assert.equal(userWriteAttempts.create, 1, 'read-only list retry must not recreate the user');

    await usersFeedbackPage.getByRole('button', { name: '编辑用户 user-feedback-new' }).click();
    await usersFeedbackPage.getByRole('heading', { name: '编辑用户' }).waitFor();
    await usersFeedbackPage.locator('.xmt-overlay').getByLabel('姓名').fill('刷新失败后已确认编辑');
    usersListReadFailures = 1;
    expectUsersFeedbackFailure();
    const updateResponse = usersFeedbackPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/users/1500'));
    const updateRefreshFailure = usersFeedbackPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/users?') && response.status() === 503);
    await usersFeedbackPage.getByRole('button', { name: '保存', exact: true }).click();
    await updateResponse;
    await updateRefreshFailure;
    await usersFeedbackPage.getByRole('alert').getByText('服务端已确认用户信息更新，但用户列表刷新失败；请重新加载列表确认，不要重复操作。', { exact: true }).waitFor();
    await usersFeedbackPage.getByText('刷新失败后已确认编辑', { exact: true }).waitFor();
    assert.equal(userWriteAttempts.update, 1, 'a confirmed update is sent once even if its follow-up list read fails');

    const updateRetry = usersFeedbackPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/users?') && response.status() === 200);
    await usersFeedbackPage.getByRole('button', { name: '重新加载列表' }).click();
    await updateRetry;
    await usersFeedbackPage.getByText('刷新失败后已确认编辑', { exact: true }).waitFor();
    assert.equal(userWriteAttempts.update, 1, 'read-only list retry must not repeat the user update');
    assert.deepEqual(usersFeedbackErrors, [], usersFeedbackErrors.join('\n'));
  } finally {
    await usersFeedbackContext.close();
  }

  const userLogsFeedbackUser = { ...user, id: 16, username: 'user-logs-feedback-admin', name: '操作日志恢复验收', role: 'admin' };
  fixtureUser = userLogsFeedbackUser;
  fixturePermissions = ['user:view', 'user:logs'];
  usersListFixture = [];
  userLogsReadFailures = 1;
  userLogsReadAttempts = 0;
  const { context: userLogsContext, page: userLogsPage, errors: userLogsErrors, expectConsoleFailure: expectUserLogsFailure } = await openMobilePage(390, userLogsFeedbackUser);
  const userLogsMethods: string[] = [];
  userLogsPage.on('request', (request) => {
    if (request.url().includes('/api/users/logs')) userLogsMethods.push(request.method());
  });
  try {
    await userLogsPage.goto(`${baseUrl}/users`, { waitUntil: 'domcontentloaded' });
    await userLogsPage.getByRole('button', { name: '操作日志' }).click();
    expectUserLogsFailure();
    await userLogsPage.getByRole('alert').getByText(/操作日志暂不可用/).waitFor();
    assert.equal(await userLogsPage.getByText('暂无操作日志', { exact: true }).count(), 0, 'a failed log read must not appear as an empty log list');

    const firstLogsRetry = userLogsPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/users/logs') && response.status() === 200);
    await userLogsPage.getByRole('button', { name: '重新加载日志' }).click();
    await firstLogsRetry;
    await userLogsPage.getByText('隔离读取恢复验收', { exact: true }).waitFor();

    await userLogsPage.getByRole('button', { name: '用户列表' }).click();
    await userLogsPage.getByRole('button', { name: '用户列表' }).waitFor();
    userLogsReadFailures = 1;
    expectUserLogsFailure();
    await userLogsPage.getByRole('button', { name: '操作日志' }).click();
    await userLogsPage.getByRole('alert').getByText(/操作日志暂不可用/).waitFor();
    await userLogsPage.getByText('隔离读取恢复验收', { exact: true }).waitFor();
    assert.equal(await userLogsPage.getByText('暂无操作日志', { exact: true }).count(), 0, 'a failed refresh retains previously loaded log records');

    const secondLogsRetry = userLogsPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/users/logs') && response.status() === 200);
    await userLogsPage.getByRole('button', { name: '重新加载日志' }).click();
    await secondLogsRetry;
    assert.equal(userLogsReadAttempts, 4, 'log load and retry use only the expected GET requests');
    assert.deepEqual(userLogsMethods, ['GET', 'GET', 'GET', 'GET'], 'log recovery never performs a write request');
    assert.deepEqual(userLogsErrors, [], userLogsErrors.join('\n'));
  } finally {
    await userLogsContext.close();
  }

  const backupFeedbackUser = { ...user, id: 15, username: 'backup-feedback-admin', name: '备份反馈验收', role: 'admin' };
  fixtureUser = backupFeedbackUser;
  fixturePermissions = ['system:backup'];
  backupInventoryReadFailures = 0;
  backupCreateAttempts = 0;
  backupInventoryFixture = {
    files: [],
    sources: [{ id: 'application', label: '应用内备份', available: true, fileCount: 0 }],
  };
  const { context: backupFeedbackContext, page: backupFeedbackPage, errors: backupFeedbackErrors, expectConsoleFailure: expectBackupFeedbackFailure } = await openMobilePage(390, backupFeedbackUser);
  try {
    await backupFeedbackPage.goto(`${baseUrl}/backup`, { waitUntil: 'domcontentloaded' });
    await backupFeedbackPage.getByRole('heading', { name: '备份管理' }).waitFor();
    await backupFeedbackPage.getByText('没有发现备份文件', { exact: true }).waitFor();

    backupInventoryReadFailures = 1;
    expectBackupFeedbackFailure();
    const backupCreateResponse = backupFeedbackPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/backup/create'));
    const backupRefreshFailure = backupFeedbackPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/backup/inventory') && response.status() === 503);
    await backupFeedbackPage.getByRole('button', { name: '立即备份' }).click();
    await backupCreateResponse;
    await backupRefreshFailure;
    await backupFeedbackPage.getByRole('alert').getByText('服务端已确认备份 xmt-local-fixture.db，但备份清单刷新失败；请重新加载清单确认，不要重复创建。', { exact: true }).waitFor();
    await backupFeedbackPage.getByText('备份清单暂不可用', { exact: true }).waitFor();
    assert.equal(backupCreateAttempts, 1, 'a confirmed backup is created once even when its inventory refresh fails');

    const backupRetry = backupFeedbackPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/backup/inventory') && response.status() === 200);
    await backupFeedbackPage.getByRole('alert').getByRole('button', { name: '重新加载清单' }).click();
    await backupRetry;
    await backupFeedbackPage.getByText('xmt-local-fixture.db', { exact: true }).waitFor();
    assert.equal(backupCreateAttempts, 1, 'read-only inventory retry must not create another backup');
    assert.deepEqual(backupFeedbackErrors, [], backupFeedbackErrors.join('\n'));
  } finally {
    await backupFeedbackContext.close();
  }

  const profileUser = { ...user, id: 12, username: 'mobile-profile-recovery', name: '资料恢复验收', role: 'member' };
  fixtureUser = profileUser;
  profileUpdateAttempts = 0;
  profileUpdateFailures = 1;
  const { context: profileContext, page: profilePage, errors: profileErrors, expectConsoleFailure: expectProfileFailure } = await openMobilePage(390, profileUser);
  try {
    await profilePage.goto(`${baseUrl}/me`, { waitUntil: 'domcontentloaded' });
    await profilePage.getByText('普通人员', { exact: true }).waitFor();
    await profilePage.getByRole('textbox', { name: '姓名' }).fill('资料修改后名称');
    await profilePage.getByRole('textbox', { name: '邮箱' }).fill('profile-recovery@example.test');
    expectProfileFailure();
    const failedProfileUpdate = profilePage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/auth/profile') && response.status() === 503);
    await profilePage.getByRole('button', { name: '保存个人资料' }).dblclick();
    await failedProfileUpdate;
    await profilePage.getByText('模拟个人资料服务暂不可用', { exact: true }).waitFor();
    assert.equal(profileUpdateAttempts, 1, 'double-click submits a profile update once while the request is pending');
    assert.equal(await profilePage.getByRole('textbox', { name: '姓名' }).inputValue(), '资料修改后名称', 'failed profile update keeps the edited name');
    assert.equal(await profilePage.getByRole('textbox', { name: '邮箱' }).inputValue(), 'profile-recovery@example.test', 'failed profile update keeps the edited email');
    const successfulProfileUpdate = profilePage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/auth/profile') && response.status() === 200);
    await profilePage.getByRole('button', { name: '保存个人资料' }).click();
    await successfulProfileUpdate;
    await profilePage.getByText('个人资料已保存。', { exact: true }).waitFor();
    assert.equal(profileUpdateAttempts, 2, 'explicit retry follows the single failed profile request');
    assert.deepEqual(profileErrors, [], profileErrors.join('\n'));
  } finally {
    await profileContext.close();
  }

  const passwordUser = { ...user, id: 9, username: 'mobile-password-recovery', name: '密码恢复验收', role: 'member' };
  fixtureUser = passwordUser;
  passwordChangeAttempts = 0;
  passwordChangeFailures = 1;
  const { context: passwordContext, page: passwordPage, errors: passwordErrors, expectConsoleFailure: expectPasswordFailure } = await openMobilePage(390, passwordUser);
  try {
    await passwordPage.goto(`${baseUrl}/me`, { waitUntil: 'domcontentloaded' });
    await passwordPage.getByRole('button', { name: '账号安全' }).click();
    await passwordPage.getByPlaceholder('当前密码').waitFor();
    await passwordPage.getByRole('button', { name: '更新密码' }).click();
    await passwordPage.getByText('请输入当前密码。', { exact: true }).waitFor();
    await passwordPage.getByPlaceholder('当前密码').fill('current-pass');
    await passwordPage.getByPlaceholder('新密码（至少 6 位）').fill('12345');
    await passwordPage.getByRole('button', { name: '更新密码' }).click();
    await passwordPage.getByText('新密码至少 6 位。', { exact: true }).waitFor();
    assert.equal(passwordChangeAttempts, 0, 'invalid password input must not call the service');
    await passwordPage.getByPlaceholder('新密码（至少 6 位）').fill('123456');
    expectPasswordFailure();
    const failedPasswordUpdate = passwordPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/auth/change-password') && response.status() === 503);
    await passwordPage.getByRole('button', { name: '更新密码' }).dblclick();
    await failedPasswordUpdate;
    await passwordPage.getByText('密码服务暂不可用，请重试', { exact: true }).waitFor();
    assert.equal(passwordChangeAttempts, 1, 'double-click submits only once while the request is pending');
    await passwordPage.getByText('密码服务暂不可用，请重试', { exact: true }).scrollIntoViewIfNeeded();
    await passwordPage.screenshot({ path: '/tmp/xmt-mobile-password-retry-390.png' });
    const successfulPasswordUpdate = passwordPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/auth/change-password') && response.status() === 200);
    await passwordPage.getByRole('button', { name: '更新密码' }).click();
    await successfulPasswordUpdate;
    await passwordPage.getByText('密码已更新。', { exact: true }).waitFor();
    assert.equal(await passwordPage.getByPlaceholder('当前密码').isVisible(), true, 'the password form stays open so success feedback is visible');
    await passwordPage.getByText('密码已更新。', { exact: true }).scrollIntoViewIfNeeded();
    await passwordPage.screenshot({ path: '/tmp/xmt-mobile-password-success-390.png' });
    assert.equal(passwordChangeAttempts, 2, 'retry follows the single failed request');
    assert.deepEqual(passwordErrors, [], passwordErrors.join('\n'));
  } finally {
    await passwordContext.close();
  }

  // A late daily-report response from the previous account must not replace the current account's report.
  const staleDailyUser = { ...user, id: 16, username: 'mobile-stale-daily-user', name: '旧账号日报验收', role: 'member' };
  const currentDailyUser = { ...user, id: 17, username: 'mobile-current-daily-user', name: '新账号日报验收', role: 'member' };
  const previousDailyFixtureUser = fixtureUser;
  const previousDailyFixturePermissions = fixturePermissions;
  fixtureUser = staleDailyUser;
  fixturePermissions = ['report:daily:submit'];
  dailyReport = {
    ...createDailyReport(),
    userId: staleDailyUser.id,
    items: [{ id: 781, reportId: 780, sectionKey: 'today', title: '今日工作', contentMd: '迟到的旧账号日报内容', sortOrder: 0 }],
  };
  holdNextDailyReportRead = true;
  let resolveStaleDailyReadStarted: (() => void) | null = null;
  const staleDailyReadStarted = new Promise<void>((resolve) => { resolveStaleDailyReadStarted = resolve; });
  dailyReportReadStarted = () => resolveStaleDailyReadStarted?.();
  const { context: dailyIdentityContext, page: dailyIdentityPage, errors: dailyIdentityErrors } = await openMobilePage(390, staleDailyUser);
  try {
    const dailyReadMethods: string[] = [];
    dailyIdentityPage.on('request', (request) => {
      if (request.url().includes('/api/daily-reports/me')) dailyReadMethods.push(request.method());
    });
    const staleDailyReadResponse = dailyIdentityPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/daily-reports/me'));
    await dailyIdentityPage.goto(`${baseUrl}/daily-report`, { waitUntil: 'domcontentloaded' });
    await staleDailyReadStarted;

    fixtureUser = currentDailyUser;
    dailyReport = {
      ...createDailyReport(),
      id: 790,
      userId: currentDailyUser.id,
      items: [{ id: 791, reportId: 790, sectionKey: 'today', title: '今日工作', contentMd: '新账号当前日报内容', sortOrder: 0 }],
    };
    await dailyIdentityPage.evaluate(async (nextUser) => {
      const { useAuthStore } = await import('/src/store/index.ts');
      useAuthStore.getState().login(nextUser, 'second-account-test-token', { persist: 'memory' });
    }, currentDailyUser);
    await dailyIdentityPage.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('textarea[placeholder="记录今天完成或推进的工作"]')?.value === '新账号当前日报内容');
    assert.equal(await dailyIdentityPage.getByPlaceholder('记录今天完成或推进的工作').inputValue(), '新账号当前日报内容');

    releaseDailyReportRead?.();
    releaseDailyReportRead = null;
    await staleDailyReadResponse;
    await dailyIdentityPage.waitForTimeout(50);
    assert.equal(await dailyIdentityPage.getByPlaceholder('记录今天完成或推进的工作').inputValue(), '新账号当前日报内容', 'the old account response must not replace the current report');
    assert.deepEqual(dailyReadMethods, ['GET', 'GET'], 'account switch performs only the two report reads, without a write');
    assert.equal(await dailyIdentityPage.getByText('迟到的旧账号日报内容', { exact: true }).count(), 0, 'old account report content stays hidden after its delayed response');
    assert.deepEqual(dailyIdentityErrors, [], dailyIdentityErrors.join('\n'));
  } finally {
    releaseDailyReportRead?.();
    releaseDailyReportRead = null;
    dailyReportReadStarted = null;
    holdNextDailyReportRead = false;
    await dailyIdentityContext.close();
    fixtureUser = previousDailyFixtureUser;
    fixturePermissions = previousDailyFixturePermissions;
    dailyReport = createDailyReport();
  }

  // A shared phone must never restore another account's cached messages or drafts.
  const secondUser = { ...user, id: 7, username: 'mobile-second-user', name: '第二位成员', role: 'member' };
  fixtureUser = secondUser;
  fixturePermissions = ['topic:create', 'report:daily:submit'];
  mobileMessagesFixture = [];
  dailyReport = createDailyReport();
  const { context: sharedContext, page: sharedPage, errors: sharedErrors } = await openMobilePage(390, secondUser);
  try {
    await sharedPage.addInitScript((reportDate) => {
      localStorage.setItem('xmt:safe-draft:v1:messages:recent', JSON.stringify({ savedAt: Date.now(), value: [{ id: 998, title: '旧版账号私密消息', content: '不得显示', read: false }] }));
      localStorage.setItem('xmt:safe-draft:v1:user:1:messages:recent', JSON.stringify({ savedAt: Date.now(), value: [{ id: 999, title: '其他账号私密消息', content: '不得显示', read: false }] }));
      localStorage.setItem('xmt:safe-draft:v1:topic:new', JSON.stringify({ savedAt: Date.now(), value: { title: '旧版账号的选题草稿' } }));
      localStorage.setItem('xmt:safe-draft:v1:user:1:topic:new', JSON.stringify({ savedAt: Date.now(), value: { title: '其他账号的选题草稿' } }));
      localStorage.setItem(`xmt:safe-draft:v1:user:1:daily:${reportDate}`, JSON.stringify({ savedAt: Date.now(), value: [{ sectionKey: 'today', title: '今日工作', contentMd: '其他账号的日报内容', sortOrder: 0 }] }));
    }, dailyReport.reportDate);
    await sharedPage.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
    await sharedPage.getByText('暂无消息', { exact: true }).waitFor();
    assert.equal(await sharedPage.getByText('其他账号私密消息').count(), 0);
    assert.equal(await sharedPage.getByText('旧版账号私密消息').count(), 0);
    await sharedPage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    const sharedTopicTitle = sharedPage.getByPlaceholder('输入清晰、可执行的选题标题');
    await sharedTopicTitle.waitFor();
    assert.equal(await sharedTopicTitle.inputValue(), '', 'another account’s topic draft must not be restored');
    await sharedPage.goto(`${baseUrl}/daily-report`, { waitUntil: 'domcontentloaded' });
    await sharedPage.getByText(/· 我的日报/).waitFor();
    assert.notEqual(await sharedPage.getByPlaceholder('记录今天完成或推进的工作').inputValue(), '其他账号的日报内容');
    await assertMobileLayout(sharedPage, 390, 'shared-device-account-isolation');
    assert.deepEqual(sharedErrors, [], sharedErrors.join('\n'));
  } finally {
    await sharedContext.close();
  }

  // The everyday content-production path keeps writing and filming directly under topic management.
  const previousFixtureUser = fixtureUser;
  const previousFixturePermissions = fixturePermissions;
  fixtureUser = user;
  fixturePermissions = ['workflow:shooting', 'workflow:publishing', 'analytics:view'];
  const { context: navigationContext, page: navigationPage, errors: navigationErrors } = await openMobilePage(1440, user);
  try {
    await navigationContext.addInitScript(() => localStorage.removeItem('xmt_sidebar_state'));
    await navigationPage.goto(`${baseUrl}/topics`, { waitUntil: 'domcontentloaded' });
    await navigationPage.getByRole('heading', { name: '选题管理' }).waitFor();
    assert.ok((await navigationPage.title()).trim().length > 0, 'the app page must have a document title');
    const expandSidebar = navigationPage.getByRole('button', { name: '展开侧边栏' });
    if (await expandSidebar.count()) await expandSidebar.click();

    const contentGroupButton = navigationPage.locator('aside nav').getByRole('button', { name: '内容生产' });
    await contentGroupButton.waitFor({ state: 'visible' });
    const contentItems = contentGroupButton.locator('xpath=following-sibling::ul');
    await contentItems.locator('li').nth(6).waitFor({ state: 'visible' });
    const labels = (await contentItems.locator('li button span.truncate').allTextContents()).map((label) => label.trim());
    assert.deepEqual(labels, ['灵感库', '选题管理', '创作管理', '成片制作', '排期日历', '发布管理', '内容动态']);
    await navigationPage.screenshot({ path: '/tmp/xmt-content-production-navigation-order.png', fullPage: true });

    auditableTopic = { ...auditableTopic, status: 'pending' };
    await navigationPage.goto(`${baseUrl}/kanban`, { waitUntil: 'domcontentloaded' });
    await navigationPage.waitForURL((url) => url.pathname === '/topics' && url.searchParams.get('view') === 'board');
    await navigationPage.getByRole('heading', { name: '选题管理' }).waitFor();
    const board = navigationPage.getByLabel('选题状态看板');
    await board.getByRole('heading', { name: '创作中' }).waitFor();
    await board.getByRole('button', { name: linkedTopic.title }).waitFor();
    const pendingCard = board.getByRole('button', { name: auditableTopic.title }).locator('xpath=ancestor::article');
    const auditResponse = navigationPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/topics/${auditableTopic.id}/audit`));
    await pendingCard.getByRole('button', { name: '通过', exact: true }).click();
    await auditResponse;
    assert.equal(auditableTopic.status, 'approved', 'the integrated board sends pending decisions through the audit API');
    await navigationPage.getByRole('button', { name: '列表', exact: true }).click();
    await navigationPage.waitForURL((url) => url.pathname === '/topics' && !url.searchParams.has('view'));
    await navigationPage.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === '列表' && button.getAttribute('aria-pressed') === 'true'));
    assert.equal(await navigationPage.getByRole('button', { name: '列表', exact: true }).getAttribute('aria-pressed'), 'true');

    await navigationPage.getByRole('button', { name: '看板', exact: true }).click();
    await navigationPage.waitForURL((url) => url.pathname === '/topics' && url.searchParams.get('view') === 'board');
    await navigationPage.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === '看板' && button.getAttribute('aria-pressed') === 'true'));
    assert.equal(await navigationPage.getByRole('button', { name: '看板', exact: true }).getAttribute('aria-pressed'), 'true');
    await navigationPage.screenshot({ path: '/tmp/xmt-topics-board-desktop.png', fullPage: true });

    const mobileTopicsAccessibility = await openMobilePage(390, user);
    try {
      await mobileTopicsAccessibility.page.goto(`${baseUrl}/topics`, { waitUntil: 'domcontentloaded' });
      await mobileTopicsAccessibility.page.getByRole('heading', { name: '选题', exact: true }).waitFor();
      const mobileTopicsSearch = mobileTopicsAccessibility.page.getByRole('textbox', { name: '搜索选题' });
      await mobileTopicsSearch.waitFor();
      assert.equal(await mobileTopicsSearch.getAttribute('id'), 'mobile-topics-search');
      assert.equal(await mobileTopicsSearch.getAttribute('name'), 'mobileTopicsSearch');
      await assertMobileLayout(mobileTopicsAccessibility.page, 390, 'topics-search-accessible-name-390');
      assert.deepEqual(mobileTopicsAccessibility.errors, [], mobileTopicsAccessibility.errors.join('\n'));
    } finally {
      await mobileTopicsAccessibility.context.close();
    }

    const systemGroupButton = navigationPage.locator('aside nav').getByRole('button', { name: '系统管理' });
    await systemGroupButton.click();
    const systemItems = systemGroupButton.locator('xpath=following-sibling::ul');
    await systemItems.getByRole('button', { name: '内容实验室', exact: true }).click();
    await navigationPage.waitForURL((url) => url.pathname === '/content-lab');
    await navigationPage.getByRole('heading', { name: '内容实验室' }).waitFor();
    await navigationPage.getByRole('heading', { name: '内容操作系统' }).waitFor();
    assert.equal(await navigationPage.getByRole('button', { name: '内容运行', exact: true }).getAttribute('aria-pressed'), 'true');
    await navigationPage.goto(`${baseUrl}/content-intelligence`, { waitUntil: 'domcontentloaded' });
    await navigationPage.waitForURL((url) => url.pathname === '/content-lab' && url.searchParams.get('tab') === 'insights');
    await navigationPage.getByRole('heading', { name: '内容智能理解' }).waitFor();
    await navigationPage.getByRole('button', { name: '创作建议', exact: true }).click();
    await navigationPage.waitForURL((url) => url.pathname === '/content-lab' && url.searchParams.get('tab') === 'generation');
    await navigationPage.getByRole('heading', { name: '内容生成助手' }).waitFor();
    await navigationPage.screenshot({ path: '/tmp/xmt-content-lab-generation.png', fullPage: true });

    await contentGroupButton.click();
    await contentItems.getByRole('button', { name: '创作管理', exact: true }).click();
    await navigationPage.waitForURL('**/production');
    const productionMain = navigationPage.locator('main');
    await productionMain.waitFor({ state: 'visible' });
    assert.ok((await productionMain.innerText()).trim().length > 0, 'the destination page must render meaningful content');
    assert.equal(await navigationPage.locator('vite-error-overlay, nextjs-portal').count(), 0, 'the destination must not show a framework error overlay');
    assert.deepEqual(navigationErrors, [], navigationErrors.join('\n'));
  } finally {
    await navigationContext.close();
    fixtureUser = previousFixtureUser;
    fixturePermissions = previousFixturePermissions;
  }

  const desktopDraftUser = { ...user, id: 12, username: 'desktop-topic-draft', name: '桌面草稿验收', role: 'member' };
  fixtureUser = desktopDraftUser;
  fixturePermissions = ['topic:create'];
  const { context: desktopDraftContext, page: desktopDraftPage, errors: desktopDraftErrors, expectConsoleFailure: expectDesktopDraftFailure } = await openMobilePage(1440, desktopDraftUser);
  const desktopDraftTitle = '选题保存恢复校验B';
  const desktopDraftKey = 'xmt:safe-draft:v1:user:12:topic:new';
  const legacyDesktopDraftKey = 'xmt:safe-draft:v1:topic:new:desktop:12';
  let releaseDesktopCreate = () => {};
  try {
    await desktopDraftContext.addInitScript(({ key }) => {
      if (sessionStorage.getItem('xmt:test:legacy-topic-seeded')) return;
      sessionStorage.setItem('xmt:test:legacy-topic-seeded', '1');
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value: {
        title: '旧版桌面草稿迁移校验', platform: '小红书', deadline: '', assignee_id: '123',
        projectBackground: '桌面草稿恢复验证内容', targetAudience: '桌面受众', expectedGoal: '完成旧草稿迁移', budget: '100', outline: '开头与结尾',
      } }));
    }, { key: legacyDesktopDraftKey });
    await desktopDraftPage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    const titleInput = desktopDraftPage.getByPlaceholder('请输入选题标题');
    await desktopDraftPage.getByText('当前账号的提报内容会自动保存在本机', { exact: false }).waitFor();
    await desktopDraftPage.waitForFunction((expectedTitle) => {
      const input = document.querySelector<HTMLInputElement>('input[placeholder="请输入选题标题"]');
      return input?.value === expectedTitle;
    }, '旧版桌面草稿迁移校验', { timeout: 10000 });
    assert.equal(await titleInput.inputValue(), '旧版桌面草稿迁移校验', 'legacy desktop draft is restored');
    assert.equal(await desktopDraftPage.evaluate((key) => localStorage.getItem(key), legacyDesktopDraftKey), null, 'legacy draft is removed after a successful migration');
    await titleInput.fill(desktopDraftTitle);
    await desktopDraftPage.waitForFunction(({ key, expectedTitle }) => {
      const drafts = JSON.parse(localStorage.getItem(key) || 'null')?.value?.drafts || [];
      return drafts.some((entry) => entry.draft.title === expectedTitle && entry.draft.assignee_id === '123');
    }, { key: desktopDraftKey, expectedTitle: desktopDraftTitle });
    await desktopDraftPage.getByRole('button', { name: '存本机草稿' }).click();
    await desktopDraftPage.getByText('已存本机草稿', { exact: true }).waitFor();

    const secondDraftTitle = '第二份草稿应独立续写';
    await desktopDraftPage.getByRole('button', { name: '新建草稿' }).click();
    await titleInput.fill(secondDraftTitle);
    await desktopDraftPage.waitForFunction(({ key, titles }) => {
      const drafts = JSON.parse(localStorage.getItem(key) || 'null')?.value?.drafts || [];
      return titles.every((title) => drafts.some((entry) => entry.draft.title === title));
    }, { key: desktopDraftKey, titles: [desktopDraftTitle, secondDraftTitle] });
    await desktopDraftPage.screenshot({ path: '/tmp/xmt-topic-draft-list-desktop-1440.png', fullPage: true });
    await desktopDraftPage.getByRole('button', { name: `打开本机草稿：${desktopDraftTitle}` }).click();
    assert.equal(await titleInput.inputValue(), desktopDraftTitle, 'selecting a saved draft restores its own form content');
    assert.equal(await desktopDraftPage.evaluate(({ key, expectedTitle }) => JSON.parse(localStorage.getItem(key) || 'null')?.value?.drafts?.find((entry) => entry.draft.title === expectedTitle)?.draft?.assignee_id, { key: desktopDraftKey, expectedTitle: desktopDraftTitle }), '123', 'switching drafts preserves the migrated desktop-only fields');
    await desktopDraftPage.getByRole('button', { name: `打开本机草稿：${secondDraftTitle}` }).click();
    await desktopDraftPage.reload({ waitUntil: 'domcontentloaded' });
    await desktopDraftPage.getByPlaceholder('请输入选题标题').waitFor();
    assert.equal(await desktopDraftPage.getByPlaceholder('请输入选题标题').inputValue(), secondDraftTitle, 'the active draft selection survives reload');
    desktopDraftPage.once('dialog', (dialog) => dialog.accept());
    await desktopDraftPage.getByRole('button', { name: `删除本机草稿：${secondDraftTitle}` }).click();
    await desktopDraftPage.getByRole('button', { name: `打开本机草稿：${desktopDraftTitle}` }).waitFor();
    assert.equal(await desktopDraftPage.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.value?.drafts?.length, desktopDraftKey), 1, 'deleting one draft keeps the other draft');

    await desktopDraftPage.setViewportSize({ width: 390, height: 844 });
    await desktopDraftPage.reload({ waitUntil: 'domcontentloaded' });
    const mobileTitleInput = desktopDraftPage.getByPlaceholder('输入清晰、可执行的选题标题');
    await mobileTitleInput.waitFor();
    assert.equal(await mobileTitleInput.inputValue(), desktopDraftTitle, 'mobile shell restores the same account draft');
    assert.equal(await desktopDraftPage.getByPlaceholder('如：抖音、小红书').inputValue(), '小红书');
    await desktopDraftPage.getByPlaceholder('描述受众特征和需求').fill('移动端补充后仍需保留桌面草稿字段');
    await desktopDraftPage.waitForFunction(({ key, expectedTitle }) => {
      const entry = JSON.parse(localStorage.getItem(key) || 'null')?.value?.drafts?.find((candidate) => candidate.draft.title === expectedTitle);
      return entry?.draft.targetAudience === '移动端补充后仍需保留桌面草稿字段' && entry.draft.assignee_id === '123' && entry.draft.expectedGoal === '完成旧草稿迁移';
    }, { key: desktopDraftKey, expectedTitle: desktopDraftTitle });
    await desktopDraftPage.screenshot({ path: '/tmp/xmt-topic-draft-mobile-shared-390.png', fullPage: true });

    await desktopDraftPage.setViewportSize({ width: 1440, height: 844 });
    await desktopDraftPage.reload({ waitUntil: 'domcontentloaded' });
    await desktopDraftPage.getByText('当前账号的提报内容会自动保存在本机', { exact: false }).waitFor();
    assert.equal(await titleInput.inputValue(), desktopDraftTitle, 'desktop form restores the current account draft after reload');
    assert.equal(await desktopDraftPage.getByPlaceholder('如：抖音、快手').inputValue(), '小红书');
    assert.equal(await desktopDraftPage.getByPlaceholder(/请详细描述项目背景/).inputValue(), '桌面草稿恢复验证内容');
    assert.equal(await desktopDraftPage.evaluate(({ key, expectedTitle }) => JSON.parse(localStorage.getItem(key) || 'null')?.value?.drafts?.find((entry) => entry.draft.title === expectedTitle)?.draft?.assignee_id, { key: desktopDraftKey, expectedTitle: desktopDraftTitle }), '123', 'mobile autosave preserves desktop-only assignment data');
    await desktopDraftPage.screenshot({ path: '/tmp/xmt-topic-draft-desktop-restored-1440.png', fullPage: true });

    const retainedDraftTitle = '未提交草稿在提报后保留';
    await desktopDraftPage.getByRole('button', { name: '新建草稿' }).click();
    await titleInput.fill(retainedDraftTitle);
    await desktopDraftPage.waitForFunction(({ key, title }) => JSON.parse(localStorage.getItem(key) || 'null')?.value?.drafts?.some((entry) => entry.draft.title === title), { key: desktopDraftKey, title: retainedDraftTitle });
    await desktopDraftPage.getByRole('button', { name: `打开本机草稿：${desktopDraftTitle}` }).click();

    const desktopCreateGate = new Promise<void>((resolve) => { releaseDesktopCreate = resolve; });
    await desktopDraftPage.route('**/api/topics', async (route) => {
      if (route.request().method() === 'POST') await desktopCreateGate;
      await route.continue();
    });
    expectDesktopDraftFailure();
    const failedCreate = desktopDraftPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 503);
    const desktopCreateStarted = desktopDraftPage.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/topics'));
    const desktopCreateClick = desktopDraftPage.getByRole('button', { name: '提报选题' }).dblclick();
    await desktopCreateStarted;
    await desktopDraftPage.locator('fieldset[aria-busy="true"]').waitFor();
    assert.equal(await titleInput.isDisabled(), true, 'a pending desktop submit protects the title sent to the server');
    assert.equal(await desktopDraftPage.getByRole('button', { name: `打开本机草稿：${retainedDraftTitle}` }).isDisabled(), true, 'a pending desktop submit cannot switch to another draft');
    assert.equal(await desktopDraftPage.getByRole('button', { name: `删除本机草稿：${desktopDraftTitle}` }).isDisabled(), true, 'the submitted draft cannot be deleted while awaiting confirmation');
    await desktopDraftPage.waitForFunction(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'false');
    await desktopDraftPage.screenshot({ path: '/tmp/xmt-topic-submit-locked-desktop-1440.png', fullPage: false });
    releaseDesktopCreate();
    await desktopCreateClick;
    await failedCreate;
    await desktopDraftPage.getByText('选题服务暂不可用，已保留本次输入', { exact: true }).waitFor();
    assert.equal(await desktopDraftPage.evaluate((key) => Boolean(localStorage.getItem(key)), desktopDraftKey), true, 'failed desktop submit keeps the saved draft');
    assert.equal(await titleInput.inputValue(), desktopDraftTitle, 'failed desktop submit keeps its editable content');
    assert.equal(await titleInput.isDisabled(), false, 'a failed desktop submit restores the same draft for editing');
    await desktopDraftPage.waitForFunction(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true');
    assert.equal(topicCreateAttempts.get(desktopDraftTitle), 1, 'a double-clicked desktop submission sends one write');

    const successfulCreate = desktopDraftPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 200);
    await desktopDraftPage.getByRole('button', { name: '提报选题' }).click();
    await successfulCreate;
    await desktopDraftPage.waitForURL('**/topics/906');
    assert.deepEqual(await desktopDraftPage.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.value?.drafts?.map((entry) => entry.draft.title), desktopDraftKey), [retainedDraftTitle], 'successful submit clears only the submitted draft');
    assert.equal(await desktopDraftPage.evaluate((key) => localStorage.getItem(key), legacyDesktopDraftKey), null, 'successful submit also clears a leftover legacy key');
    assert.deepEqual(desktopDraftErrors, [], desktopDraftErrors.join('\n'));
  } finally {
    releaseDesktopCreate();
    await desktopDraftContext.close();
  }

  const desktopStorageFailureUser = { ...user, id: 13, username: 'desktop-topic-storage-failure', name: '桌面存储失败验收', role: 'member' };
  fixtureUser = desktopStorageFailureUser;
  fixturePermissions = ['topic:create'];
  const { context: desktopStorageFailureContext, page: desktopStorageFailurePage, errors: desktopStorageFailureErrors, expectConsoleFailure: expectDesktopStorageFailure } = await openMobilePage(1440, desktopStorageFailureUser);
  try {
    await desktopStorageFailureContext.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'xmt:safe-draft:v1:user:13:topic:new') throw new Error('storage quota exceeded');
        originalSetItem.call(this, key, value);
      };
    });
    await desktopStorageFailurePage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    const titleInput = desktopStorageFailurePage.getByPlaceholder('请输入选题标题');
    const title = '桌面存储失败仍可提交并明确提醒';
    await titleInput.fill(title);
    await desktopStorageFailurePage.getByText('本机存储不可用，最新内容未能保存；请检查浏览器存储空间。当前页面仍保留输入。', { exact: true }).waitFor();
    await desktopStorageFailurePage.screenshot({ path: '/tmp/xmt-topic-draft-desktop-storage-error-1440.png', fullPage: true });

    expectDesktopStorageFailure();
    const failedCreate = desktopStorageFailurePage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 503);
    await desktopStorageFailurePage.getByRole('button', { name: '提报选题' }).click();
    await failedCreate;
    await desktopStorageFailurePage.getByText('本机草稿未能保存，请勿关闭此页', { exact: false }).waitFor();
    assert.equal(await titleInput.inputValue(), title, 'failed desktop submit keeps editable content in the current page');
    assert.equal(await desktopStorageFailurePage.evaluate((key) => localStorage.getItem(key), 'xmt:safe-draft:v1:user:13:topic:new'), null, 'quota failure does not claim a stored copy');

    const successfulCreate = desktopStorageFailurePage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 200);
    await desktopStorageFailurePage.getByRole('button', { name: '提报选题' }).click();
    await successfulCreate;
    await desktopStorageFailurePage.waitForURL('**/topics/906');
    assert.deepEqual(desktopStorageFailureErrors, [], desktopStorageFailureErrors.join('\n'));
  } finally {
    await desktopStorageFailureContext.close();
  }

  const cleanupFailureUser = { ...user, id: 16, username: 'topic-cleanup-failure', name: '草稿清理反馈验收', role: 'member' };
  fixtureUser = cleanupFailureUser;
  fixturePermissions = ['topic:create'];
  const { context: cleanupContext, page: cleanupPage, errors: cleanupErrors, expectConsoleFailure: expectCleanupFailure } = await openMobilePage(1440, cleanupFailureUser);
  const cleanupKey = 'xmt:safe-draft:v1:user:16:topic:new';
  try {
    await cleanupContext.addInitScript((key) => {
      const originalRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (target) {
        if (target === key) throw new Error('simulated draft deletion unavailable');
        originalRemoveItem.call(this, target);
      };
    }, cleanupKey);
    await cleanupPage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    const title = '清理失败应提示已提交选题';
    await cleanupPage.getByPlaceholder('请输入选题标题').fill(title);
    expectCleanupFailure();
    const failedCreate = cleanupPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 503);
    await cleanupPage.getByRole('button', { name: '提报选题' }).click();
    await failedCreate;
    await cleanupPage.getByText('选题服务暂不可用，已保留本次输入', { exact: true }).waitFor();
    await cleanupPage.getByRole('button', { name: '提报选题' }).click();
    await cleanupPage.waitForURL('**/topics/906');
    await cleanupPage.getByText('草稿清理失败', { exact: true }).waitFor();
    await cleanupPage.getByText('选题已提交成功，但本机草稿未能清理；请勿重复提报。', { exact: true }).waitFor();
    assert.equal(await cleanupPage.evaluate(({ key, title }) => localStorage.getItem(key)?.includes(title), { key: cleanupKey, title }), true, 'failed deletion leaves a recoverable copy and reports that it was not cleared');
    assert.equal(topicCreateAttempts.get(title), 2, 'cleanup failure does not trigger another server submission');
    assert.deepEqual(cleanupErrors, [], cleanupErrors.join('\n'));
    await cleanupPage.screenshot({ path: '/tmp/xmt-topic-draft-cleanup-failure-desktop.png', fullPage: false });
  } finally {
    await cleanupContext.close();
  }

  const topicDraftDeniedUser = { ...user, id: 14, username: 'topic-draft-no-create', name: '无提报权限验收', role: 'member' };
  fixtureUser = topicDraftDeniedUser;
  fixturePermissions = [];
  const { context: topicDraftDeniedContext, page: topicDraftDeniedPage, errors: topicDraftDeniedErrors } = await openMobilePage(390, topicDraftDeniedUser);
  try {
    await topicDraftDeniedContext.addInitScript(() => {
      localStorage.setItem('xmt:safe-draft:v1:user:14:topic:new', JSON.stringify({ savedAt: Date.now(), value: { title: '无提报权限不得展示本机草稿' } }));
    });
    await topicDraftDeniedPage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    await topicDraftDeniedPage.getByText('你暂时没有访问这个页面的权限', { exact: true }).waitFor();
    assert.equal(await topicDraftDeniedPage.getByPlaceholder('输入清晰、可执行的选题标题').count(), 0, 'a saved draft is not rendered without create permission');
    assert.equal(await topicDraftDeniedPage.evaluate(() => localStorage.getItem('xmt:safe-draft:v1:user:14:topic:new')?.includes('无提报权限不得展示本机草稿')), true, 'permission denial does not delete the user’s local draft');
    assert.deepEqual(topicDraftDeniedErrors, [], topicDraftDeniedErrors.join('\n'));
  } finally {
    await topicDraftDeniedContext.close();
  }

  const desktopTopicCreator = { ...user, id: 11, username: 'desktop-topic-creator', name: '桌面选题验收', role: 'member' };
  fixtureUser = desktopTopicCreator;
  fixturePermissions = ['topic:create'];
  const { context: desktopCreatorContext, page: desktopCreatorPage, errors: desktopCreatorErrors, expectConsoleFailure: expectDesktopFailure } = await openMobilePage(1440, desktopTopicCreator);
  try {
    await desktopCreatorPage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    const titleInput = desktopCreatorPage.getByPlaceholder('请输入选题标题');
    await titleInput.waitFor();
    const title = '桌面提报失败后仍可重试';
    await titleInput.fill(title);
    await desktopCreatorPage.getByRole('button', { name: '提报选题' }).click();
    await desktopCreatorPage.getByRole('heading', { name: '发现标题相似的选题' }).waitFor();
    await desktopCreatorPage.getByText(desktopSimilarTopic.title, { exact: true }).waitFor();
    assert.equal(topicCreateAttempts.get(title) ?? 0, 0, 'desktop create waits for explicit similarity review');
    const searchCountAfterReview = topicSearchAttempts.get('桌面') ?? 0;
    assert(searchCountAfterReview > 0, 'desktop AddTopic uses the current account topic search');
    await desktopCreatorPage.screenshot({ path: '/tmp/xmt-topic-similarity-desktop.png', fullPage: true });
    expectDesktopFailure();
    const failedCreate = desktopCreatorPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 503);
    await desktopCreatorPage.getByRole('button', { name: '仍然提报' }).click();
    await failedCreate;
    await desktopCreatorPage.getByText('选题服务暂不可用，已保留本次输入', { exact: true }).waitFor();
    const successfulCreate = desktopCreatorPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 200);
    await desktopCreatorPage.getByRole('button', { name: '提报选题' }).click();
    await successfulCreate;
    await desktopCreatorPage.waitForURL('**/topics/906');
    assert.equal(topicCreateAttempts.get(title), 2, 'desktop retry submits exactly once after the failure');
    assert.equal(topicSearchAttempts.get('桌面'), searchCountAfterReview, 'desktop retry reuses its similarity review');
    assert.deepEqual(desktopCreatorErrors, [], desktopCreatorErrors.join('\n'));
  } finally {
    await desktopCreatorContext.close();
  }

  fixturePermissions = ['resource:view', 'topic:view', 'analytics:view'];
  const topicAssetFixture = [
    {
      id: 931, title: '夜市主题内容资产', status: 'completed', platform: 'douyin',
      created_at: '2026-09-20T00:00:00.000Z', updated_at: '2026-09-27T00:00:00.000Z',
      production_count: 2, latest_production_id: 932, latest_production_version: 'v2.0', latest_production_updated_at: '2026-09-26T00:00:00.000Z',
      shooting_count: 1, publishing_count: 1, resource_count: 3,
      dimensions: [], can_manage_dimensions: true,
      latest_analytics: {
        data_date: '2026-09-27', views: 5200, likes: 120, shares: 20, comments: 15,
        sources: { views: 'douyin_official_export', likes: 'manual', shares: 'douyin_creator_collection', comments: 'unavailable' },
      },
    },
    {
      id: 933, title: '早餐铺传承故事', status: 'production', platform: 'xiaohongshu',
      created_at: '2026-09-19T00:00:00.000Z', updated_at: '2026-09-25T00:00:00.000Z',
      production_count: 1, latest_production_id: 934, latest_production_version: 'v1.0', latest_production_updated_at: '2026-09-24T00:00:00.000Z',
      shooting_count: 0, publishing_count: 0, resource_count: 1, dimensions: [], can_manage_dimensions: true, latest_analytics: null,
    },
  ];
  const { context: topicAssetsContext, page: topicAssetsPage, errors: topicAssetsErrors, expectConsoleFailure: expectTopicAssetConsoleFailure } = await openMobilePage(390);
  try {
    let topicAssetRetryAttempts = 0;
    let dimensionAddAttempts = 0;
    let registeredDimensions: Array<{ id: number; type: 'city' | 'person' | 'project'; value: string }> = [];
    await topicAssetsPage.route('**/api/topics/931/asset-dimensions', async (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'not found' }) });
      dimensionAddAttempts += 1;
      if (dimensionAddAttempts === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '维度服务暂不可用，请重试' }) });
        return;
      }
      const body = route.request().postDataJSON() as { type: 'city' | 'person' | 'project'; value: string };
      registeredDimensions = [{ id: 1, ...body }];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: '维度已登记', id: 1 }) });
    });
    await topicAssetsPage.route('**/api/resource-center/content-topics*', async (route) => {
      const url = new URL(route.request().url());
      const keyword = url.searchParams.get('keyword')?.toLowerCase() || '';
      const dimensionType = url.searchParams.get('dimension_type') || '';
      const dimensionValue = url.searchParams.get('dimension_value') || '';
      if (keyword === '故障重试') {
        topicAssetRetryAttempts += 1;
        if (topicAssetRetryAttempts === 1) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '主题资产服务暂不可用，请重试' }) });
          return;
        }
      }
      const allItems = topicAssetFixture.map((item) => item.id === 931 ? { ...item, dimensions: registeredDimensions } : item);
      const data = (keyword === '故障重试'
        ? [allItems[0]]
        : allItems.filter((item) => (!keyword || item.title.toLowerCase().includes(keyword))
          && (!dimensionType || item.dimensions.some((dimension) => dimension.type === dimensionType && (!dimensionValue || dimension.value === dimensionValue)))));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data,
          pagination: { page: Number(url.searchParams.get('page')) || 1, page_size: 12, total: data.length, total_pages: 1 },
          analytics_visible: true,
          available_dimensions: registeredDimensions.map(({ type, value }) => ({ dimension_type: type, value })),
          dimension_summaries: registeredDimensions.map(({ type, value }) => ({ dimension_type: type, value, topic_count: 1, production_count: 2, resource_count: 3, shooting_count: 1, publishing_count: 1 })),
        }),
      });
    });
    await topicAssetsPage.goto(`${baseUrl}/asset-center/content-topics`, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(topicAssetsPage.url()).pathname, '/asset-center/content-topics', 'topic assets route identity is preserved');
    assert((await topicAssetsPage.title()).trim().length > 0, 'topic assets page title is present');
    await topicAssetsPage.getByRole('heading', { name: '主题内容资产' }).waitFor();
    assert.equal(await topicAssetsPage.locator('vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count(), 0, 'topic assets has no framework error overlay');
    await topicAssetsPage.getByRole('link', { name: '夜市主题内容资产' }).waitFor();
    await topicAssetsPage.getByText(/最近发布 .*播放 5,200 · 点赞 120 · 评论 15/).waitFor();
    await topicAssetsPage.getByText('来源：播放 抖音官方 · 点赞 手工补充 · 评论 未录入').waitFor();
    await assertMobileLayout(topicAssetsPage, 390, 'topic-assets');
    await topicAssetsPage.getByLabel('维度名称-931').fill('杭州');
    expectTopicAssetConsoleFailure();
    await Promise.all([
      topicAssetsPage.waitForResponse((response) => response.url().includes('/api/topics/931/asset-dimensions') && response.status() === 503),
      topicAssetsPage.getByRole('button', { name: '添加维度' }).first().click(),
    ]);
    await topicAssetsPage.getByRole('alert').filter({ hasText: '维度服务暂不可用，请重试' }).waitFor();
    await Promise.all([
      topicAssetsPage.waitForResponse((response) => response.url().includes('/api/topics/931/asset-dimensions') && response.status() === 201),
      topicAssetsPage.getByRole('button', { name: '添加维度' }).first().click(),
    ]);
    await topicAssetsPage.getByText('城市杭州', { exact: false }).waitFor();
    await topicAssetsPage.getByRole('status').getByText('城市“杭州”已登记。', { exact: true }).waitFor();
    assert.equal(dimensionAddAttempts, 2, 'dimension recovery requires one explicit retry and submits exactly twice');
    const cityFilterResponse = topicAssetsPage.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/resource-center/content-topics' && url.searchParams.get('dimension_type') === 'city' && url.searchParams.get('dimension_value') === '杭州';
    });
    await topicAssetsPage.getByLabel('按内容维度筛选').selectOption('city');
    await topicAssetsPage.getByLabel('按维度名称筛选').selectOption('杭州');
    await cityFilterResponse;
    assert.equal(await topicAssetsPage.getByRole('link', { name: '早餐铺传承故事' }).count(), 0, 'dimension filters narrow the visible topic cards');
    await topicAssetsPage.getByLabel('按内容维度筛选').selectOption('');
    const breakfastSearchResponse = topicAssetsPage.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/resource-center/content-topics' && url.searchParams.get('keyword') === '早餐';
    });
    await topicAssetsPage.getByPlaceholder('搜索主题名称').fill('早餐');
    await breakfastSearchResponse;
    await topicAssetsPage.getByRole('link', { name: '早餐铺传承故事' }).waitFor();
    assert.equal(await topicAssetsPage.getByRole('link', { name: '夜市主题内容资产' }).count(), 0, 'search narrows the aggregate without matching stale cards');
    const assetFailureResponse = topicAssetsPage.waitForResponse((response) => response.status() === 503 && new URL(response.url()).searchParams.get('keyword') === '故障重试');
    expectTopicAssetConsoleFailure();
    await topicAssetsPage.getByPlaceholder('搜索主题名称').fill('故障重试');
    await assetFailureResponse;
    await topicAssetsPage.getByText('主题资产读取失败：主题资产服务暂不可用，请重试。现有内容没有被修改。').waitFor();
    const assetRetryResponse = topicAssetsPage.waitForResponse((response) => response.status() === 200 && new URL(response.url()).searchParams.get('keyword') === '故障重试');
    await topicAssetsPage.getByRole('button', { name: '重试' }).click();
    await assetRetryResponse;
    await topicAssetsPage.getByRole('link', { name: '夜市主题内容资产' }).waitFor();
    assert.equal(topicAssetRetryAttempts, 2, 'one explicit retry causes exactly one second content assets request');
    await topicAssetsPage.screenshot({ path: '/tmp/xmt-topic-assets-mobile-390.png', fullPage: true });
    assert.deepEqual(topicAssetsErrors, [], topicAssetsErrors.join('\n'));
  } finally {
    await topicAssetsContext.close();
  }

  const { context: topicAssetsNarrowContext, page: topicAssetsNarrowPage, errors: topicAssetsNarrowErrors } = await openMobilePage(320);
  try {
    await topicAssetsNarrowPage.route('**/api/resource-center/content-topics*', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ ...topicAssetFixture[0], can_manage_dimensions: true }], pagination: { page: 1, page_size: 12, total: 1, total_pages: 1 }, analytics_visible: true, available_dimensions: [], dimension_summaries: [] }),
    }));
    await topicAssetsNarrowPage.goto(`${baseUrl}/asset-center/content-topics`, { waitUntil: 'domcontentloaded' });
    await topicAssetsNarrowPage.getByRole('link', { name: '夜市主题内容资产' }).waitFor();
    await topicAssetsNarrowPage.getByText('抖音 · 更新于 2026/9/27').waitFor();
    await assertMobileLayout(topicAssetsNarrowPage, 320, 'topic-assets');
    assert.deepEqual(topicAssetsNarrowErrors, [], topicAssetsNarrowErrors.join('\n'));
  } finally {
    await topicAssetsNarrowContext.close();
  }

  const { context: topicAssetsDesktopContext, page: topicAssetsDesktopPage, errors: topicAssetsDesktopErrors } = await openMobilePage(1440);
  try {
    await topicAssetsDesktopPage.route('**/api/resource-center/content-topics*', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: topicAssetFixture, pagination: { page: 1, page_size: 12, total: topicAssetFixture.length, total_pages: 1 }, analytics_visible: true, available_dimensions: [], dimension_summaries: [] }),
    }));
    await topicAssetsDesktopPage.goto(`${baseUrl}/asset-center/content-topics`, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(topicAssetsDesktopPage.url()).pathname, '/asset-center/content-topics', 'desktop topic assets route identity is preserved');
    assert.equal(await topicAssetsDesktopPage.locator('vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count(), 0, 'desktop topic assets has no framework error overlay');
    await topicAssetsDesktopPage.getByRole('link', { name: '夜市主题内容资产' }).waitFor();
    await assertMobileLayout(topicAssetsDesktopPage, 1440, 'topic-assets');
    await topicAssetsDesktopPage.screenshot({ path: '/tmp/xmt-topic-assets-desktop-1440.png', fullPage: true });
    assert.deepEqual(topicAssetsDesktopErrors, [], topicAssetsDesktopErrors.join('\n'));
  } finally {
    await topicAssetsDesktopContext.close();
  }

  const desktopTopicDimensionUser = { ...user, id: 14, username: 'desktop-topic-dimensions', name: '桌面维度验收', role: 'editor' };
  fixtureUser = desktopTopicDimensionUser;
  fixturePermissions = ['topic:update'];
  const { context: desktopTopicDimensionContext, page: desktopTopicDimensionPage, errors: desktopTopicDimensionErrors } = await openMobilePage(1440, desktopTopicDimensionUser);
  try {
    let registeredDesktopDimension: { id: number; type: 'city' | 'person' | 'project'; value: string } | null = null;
    await desktopTopicDimensionPage.route(`**/api/topics/${linkedTopic.id}/asset-dimensions**`, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: registeredDesktopDimension ? [registeredDesktopDimension] : [] }) });
        return;
      }
      if (request.method() === 'POST') {
        const input = request.postDataJSON() as { type: 'city' | 'person' | 'project'; value: string };
        registeredDesktopDimension = { id: 960, ...input };
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: '维度已登记', id: 960, data: registeredDesktopDimension }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: '维度已移除' }) });
    });
    await desktopTopicDimensionPage.goto(`${baseUrl}/topics/${linkedTopic.id}`, { waitUntil: 'domcontentloaded' });
    await desktopTopicDimensionPage.getByRole('heading', { name: '城市、人物与项目' }).waitFor();
    await desktopTopicDimensionPage.getByLabel(`维度类型-${linkedTopic.id}`).selectOption('person');
    await desktopTopicDimensionPage.getByLabel(`维度名称-${linkedTopic.id}`).fill('李师傅');
    const addPersonResponse = desktopTopicDimensionPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/topics/${linkedTopic.id}/asset-dimensions`) && response.status() === 201);
    await desktopTopicDimensionPage.getByRole('button', { name: '添加维度' }).click();
    await addPersonResponse;
    await desktopTopicDimensionPage.getByText('李师傅', { exact: true }).waitFor();
    await assertMobileLayout(desktopTopicDimensionPage, 1440, 'topic-dimensions');
    await desktopTopicDimensionPage.screenshot({ path: '/tmp/xmt-topic-dimensions-desktop-1440.png', fullPage: true });
    await desktopTopicDimensionPage.setViewportSize({ width: 320, height: 844 });
    await desktopTopicDimensionPage.getByRole('heading', { name: '城市、人物与项目' }).waitFor();
    await assertMobileLayout(desktopTopicDimensionPage, 320, 'topic-dimensions-desktop-resized-narrow');
    assert.deepEqual(desktopTopicDimensionErrors, [], desktopTopicDimensionErrors.join('\n'));
  } finally {
    await desktopTopicDimensionContext.close();
  }
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
