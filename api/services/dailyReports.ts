import type { User } from '../types/index.js';
import type {
  DailyReportItemInput,
  DailyReportListFilters,
  DailyReportRiskLevel,
  DailyReportSection,
  DailyReportStatus,
  ReviewDailyReportInput,
  SaveDailyReportDraftInput,
} from '../types/dailyReports.js';
import { beijingToday, execute, queryAll, queryOne, runInTransaction } from '../database/utils.js';
import { createMessage } from '../utils/messageHelper.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EDITABLE_STATUSES: DailyReportStatus[] = ['draft', 'rejected'];
const VALID_STATUSES: DailyReportStatus[] = ['draft', 'submitted', 'approved', 'rejected', 'archived'];
const VALID_RISK_LEVELS: DailyReportRiskLevel[] = ['normal', 'warning', 'blocked'];
const MAX_ARCHIVE_DAYS = 31;

const FALLBACK_SECTIONS: DailyReportSection[] = [
  { key: 'done', title: '今日完成' },
  { key: 'progress', title: '进行中' },
  { key: 'risk', title: '风险与阻塞' },
  { key: 'tomorrow', title: '明日计划' },
];

type DailyReportRow = Record<string, unknown>;

type DailyReportItemRow = {
  id: number;
  report_id: number;
  section_key: string;
  title: string | null;
  content_md: string | null;
  source_type: string | null;
  source_id: number | null;
  sort_order: number;
  meta_json: string | null;
  created_at: string;
  updated_at: string;
};

type DailyReportTemplateRow = {
  id: number;
  name: string;
  description: string | null;
  sections_json: string;
};

type SourceSuggestion = {
  sectionKey: string;
  title: string;
  contentMd: string;
  sourceType: string;
  sourceId: number;
  meta?: Record<string, unknown>;
};

export class DailyReportServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'DailyReportServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function assertAuthenticated(user?: User): asserts user is User {
  if (!user) {
    throw new DailyReportServiceError(401, 'UNAUTHENTICATED', '未登录');
  }
}

function isManager(user: User) {
  return user.role === 'admin' || user.role === 'director';
}

async function hasPermissionCode(user: User, code: string) {
  if (user.role === 'admin') {
    return true;
  }
  const rows = await queryAll<{ code: string }>(
    `SELECT DISTINCT p.code
     FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id
     JOIN user_roles ur ON rp.role_id = ur.role_id
     WHERE ur.user_id = ? AND p.code = ?`,
    [user.id, code]
  );
  return rows.length > 0;
}

function parseDate(value?: string) {
  const date = value || beijingToday();
  if (!DATE_RE.test(date)) {
    throw new DailyReportServiceError(400, 'INVALID_DATE', '日期格式必须为 YYYY-MM-DD');
  }
  return date;
}

function parseStatus(value?: string): DailyReportStatus | undefined {
  if (!value) {
    return undefined;
  }
  if (!VALID_STATUSES.includes(value as DailyReportStatus)) {
    throw new DailyReportServiceError(400, 'INVALID_STATUS', '日报状态不合法');
  }
  return value as DailyReportStatus;
}

function parseRiskLevel(value?: DailyReportRiskLevel) {
  if (!value) {
    return 'normal';
  }
  if (!VALID_RISK_LEVELS.includes(value)) {
    throw new DailyReportServiceError(400, 'INVALID_RISK_LEVEL', '风险等级不合法');
  }
  return value;
}

function parseSections(raw?: string | null): DailyReportSection[] {
  if (!raw) {
    return FALLBACK_SECTIONS;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return FALLBACK_SECTIONS;
    }

    const sections = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const record = item as Record<string, unknown>;
        const key = String(record.key || '').trim();
        const title = String(record.title || '').trim();
        return key && title ? { key, title } : null;
      })
      .filter((item): item is DailyReportSection => Boolean(item));

    return sections.length > 0 ? sections : FALLBACK_SECTIONS;
  } catch {
    return FALLBACK_SECTIONS;
  }
}

function parseMeta(raw?: string | null) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringifyJson(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

function normalizeItemInput(item: DailyReportItemInput, index: number): DailyReportItemInput {
  const sectionKey = String(item.sectionKey || '').trim();
  if (!sectionKey) {
    throw new DailyReportServiceError(400, 'INVALID_ITEM', '日报条目缺少 sectionKey');
  }

  return {
    sectionKey,
    title: String(item.title || '').trim(),
    contentMd: String(item.contentMd || '').trim(),
    sourceType: item.sourceType ? String(item.sourceType).trim() : undefined,
    sourceId: item.sourceId === undefined || item.sourceId === null ? null : Number(item.sourceId),
    sortOrder: Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : index,
    meta: item.meta || null,
  };
}

function hasReportContent(summary: string, items: Array<{ contentMd?: string | null }>) {
  return summary.trim().length > 0 || items.some((item) => String(item.contentMd || '').trim().length > 0);
}

function ensureCanManage(user: User) {
  if (!isManager(user)) {
    throw new DailyReportServiceError(403, 'FORBIDDEN', '无权限操作团队日报');
  }
}

async function listDailyReportManagers() {
  return queryAll<{ id: number }>(
    `SELECT id
     FROM users
     WHERE enabled = 1 AND role IN ('admin', 'director')`
  );
}

/*
async function notifyDailyReportSubmitted(author: User, reportDate: string) {
  try {
    const managers = await listDailyReportManagers();
    for (const manager of managers) {
      if (Number(manager.id) === author.id) {
        continue;
      }
      createMessage(
        Number(manager.id),
        '新的日报待审核',
        `${author.name || author.username} 提交了 ${reportDate} 的日报。`,
        'info',
        '/daily-report'
      );
    }
  } catch (error) {
    console.warn('[DailyReports] notify submit failed:', error);
  }
}

function notifyDailyReportReviewed(ownerId: number, reportDate: string, action: 'approve' | 'reject', comment: string) {
  const approved = action === 'approve';
  createMessage(
    ownerId,
    approved ? '日报审核通过' : '日报已退回',
    `${reportDate} 的日报${approved ? '已审核通过' : '已退回修改'}${comment ? `：${comment}` : ''}`,
    approved ? 'success' : 'warning',
    '/daily-report'
  );
}

*/

async function notifyDailyReportSubmitted(author: User, reportDate: string) {
  try {
    const managers = await listDailyReportManagers();
    for (const manager of managers) {
      if (Number(manager.id) === author.id) {
        continue;
      }
      createMessage(
        Number(manager.id),
        'Daily report pending review',
        `${author.name || author.username} submitted a daily report for ${reportDate}.`,
        'info',
        '/daily-report'
      );
    }
  } catch (error) {
    console.warn('[DailyReports] notify submit failed:', error);
  }
}

function notifyDailyReportReviewed(ownerId: number, reportDate: string, action: 'approve' | 'reject', comment: string) {
  const approved = action === 'approve';
  createMessage(
    ownerId,
    approved ? 'Daily report approved' : 'Daily report rejected',
    `${reportDate} daily report ${approved ? 'was approved' : 'was rejected'}${comment ? `: ${comment}` : ''}`,
    approved ? 'success' : 'warning',
    '/daily-report'
  );
}

function ensureArchiveRange(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00+08:00`).getTime();
  const endTime = new Date(`${end}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) {
    throw new DailyReportServiceError(400, 'INVALID_RANGE', '归档日期范围不合法');
  }

  const days = Math.floor((endTime - startTime) / 86_400_000) + 1;
  if (days > MAX_ARCHIVE_DAYS) {
    throw new DailyReportServiceError(400, 'RANGE_TOO_LARGE', '归档查询最多支持 31 天');
  }
}

async function getDefaultTemplate() {
  const row = await queryOne<DailyReportTemplateRow>(
    `SELECT id, name, description, sections_json
     FROM daily_report_templates
     WHERE is_default = 1 AND active = 1
     ORDER BY id ASC
     LIMIT 1`
  );

  return {
    id: row?.id || null,
    name: row?.name || '默认日报模板',
    description: row?.description || '',
    sections: parseSections(row?.sections_json),
  };
}

async function loadItems(reportId: number) {
  const rows = await queryAll<DailyReportItemRow>(
    `SELECT id, report_id, section_key, title, content_md, source_type, source_id, sort_order, meta_json, created_at, updated_at
     FROM daily_report_items
     WHERE report_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [reportId]
  );

  return rows.map((item) => ({
    id: Number(item.id),
    reportId: Number(item.report_id),
    sectionKey: item.section_key,
    title: item.title || '',
    contentMd: item.content_md || '',
    sourceType: item.source_type || null,
    sourceId: item.source_id === null ? null : Number(item.source_id),
    sortOrder: Number(item.sort_order || 0),
    meta: parseMeta(item.meta_json),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

async function formatReport(row: DailyReportRow | null, includeItems = true) {
  if (!row) {
    return null;
  }

  const reportId = Number(row.id);
  const items = includeItems ? await loadItems(reportId) : [];

  return {
    id: reportId,
    userId: Number(row.user_id),
    userName: String(row.user_name || row.name || row.username || ''),
    username: String(row.username || ''),
    reportDate: String(row.report_date),
    teamId: row.team_id === null || row.team_id === undefined ? null : Number(row.team_id),
    templateId: row.template_id === null || row.template_id === undefined ? null : Number(row.template_id),
    status: String(row.status) as DailyReportStatus,
    manualSummaryMd: String(row.manual_summary_md || ''),
    autoSummary: parseMeta(String(row.auto_summary_json || '')),
    riskLevel: String(row.risk_level || 'normal') as DailyReportRiskLevel,
    version: Number(row.version || 1),
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedBy: row.reviewed_by === null || row.reviewed_by === undefined ? null : Number(row.reviewed_by),
    reviewerName: String(row.reviewer_name || row.reviewer_username || ''),
    reviewerUsername: String(row.reviewer_username || ''),
    reviewComment: String(row.review_comment || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    items,
    itemCount: items.length,
  };
}

async function recordAudit(
  reportId: number,
  userId: number,
  action: string,
  fromStatus?: string,
  toStatus?: string,
  comment?: string,
  payload?: Record<string, unknown>
) {
  await execute(
    `INSERT INTO daily_report_audit_logs (report_id, user_id, action, from_status, to_status, comment, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))`,
    [reportId, userId, action, fromStatus || null, toStatus || null, comment || null, stringifyJson(payload)]
  );
}

export async function getMyDailyReport(user: User | undefined, dateValue?: string) {
  assertAuthenticated(user);
  const reportDate = parseDate(dateValue);
  const template = await getDefaultTemplate();
  const row = await queryOne<DailyReportRow>(
    `SELECT r.*, u.name AS user_name, u.username, reviewer.name AS reviewer_name, reviewer.username AS reviewer_username
     FROM daily_reports r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
     WHERE r.user_id = ? AND r.report_date = ?`,
    [user.id, reportDate]
  );

  return {
    reportDate,
    template,
    report: await formatReport(row),
    canCreate: true,
  };
}

export async function saveDailyReportDraft(user: User | undefined, input: SaveDailyReportDraftInput) {
  assertAuthenticated(user);
  const reportDate = parseDate(input.reportDate);
  const manualSummary = String(input.manualSummaryMd || '').trim();
  const riskLevel = parseRiskLevel(input.riskLevel);
  const items = (input.items || []).map(normalizeItemInput);
  const template = await getDefaultTemplate();
  const templateId = input.templateId === undefined ? template.id : input.templateId;

  const reportId = await runInTransaction(async (tx) => {
    const existing = await tx.queryOne<DailyReportRow>(
      `SELECT * FROM daily_reports WHERE user_id = ? AND report_date = ?`,
      [user.id, reportDate]
    );

    if (existing && !EDITABLE_STATUSES.includes(String(existing.status) as DailyReportStatus)) {
      throw new DailyReportServiceError(409, 'REPORT_LOCKED', '当前日报状态不可继续保存草稿');
    }

    if (existing && input.version !== undefined && Number(existing.version || 1) !== Number(input.version)) {
      throw new DailyReportServiceError(409, 'VERSION_CONFLICT', '日报版本已变化，请刷新后再保存');
    }

    let currentReportId: number;
    let nextVersion = 1;
    let fromStatus: string | undefined;

    if (existing) {
      currentReportId = Number(existing.id);
      fromStatus = String(existing.status);
      nextVersion = Number(existing.version || 1) + 1;
      await tx.execute(
        `UPDATE daily_reports
         SET template_id = ?, status = 'draft', manual_summary_md = ?, risk_level = ?, version = ?,
             updated_at = datetime('now', '+8 hours')
         WHERE id = ?`,
        [templateId, manualSummary, riskLevel, nextVersion, currentReportId]
      );
      await tx.execute(`DELETE FROM daily_report_items WHERE report_id = ?`, [currentReportId]);
    } else {
      currentReportId = await tx.executeInsert(
        `INSERT INTO daily_reports (user_id, report_date, template_id, status, manual_summary_md, risk_level, version, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?, 1, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
        [user.id, reportDate, templateId, manualSummary, riskLevel]
      );
    }

    for (const item of items) {
      await tx.execute(
        `INSERT INTO daily_report_items
           (report_id, section_key, title, content_md, source_type, source_id, sort_order, meta_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
        [
          currentReportId,
          item.sectionKey,
          item.title || null,
          item.contentMd || null,
          item.sourceType || null,
          item.sourceId ?? null,
          item.sortOrder || 0,
          stringifyJson(item.meta),
        ]
      );
    }

    await tx.execute(
      `INSERT INTO daily_report_audit_logs (report_id, user_id, action, from_status, to_status, payload_json, created_at)
       VALUES (?, ?, 'save_draft', ?, 'draft', ?, datetime('now', '+8 hours'))`,
      [currentReportId, user.id, fromStatus || null, stringifyJson({ itemCount: items.length, version: nextVersion })]
    );

    return currentReportId;
  });

  const row = await queryOne<DailyReportRow>(
    `SELECT r.*, u.name AS user_name, u.username, reviewer.name AS reviewer_name, reviewer.username AS reviewer_username
     FROM daily_reports r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
     WHERE r.id = ?`,
    [reportId]
  );

  return formatReport(row);
}

export async function submitDailyReport(user: User | undefined, reportId: number) {
  assertAuthenticated(user);
  const row = await queryOne<DailyReportRow>(`SELECT * FROM daily_reports WHERE id = ?`, [reportId]);
  if (!row) {
    throw new DailyReportServiceError(404, 'REPORT_NOT_FOUND', '日报不存在');
  }
  if (Number(row.user_id) !== user.id) {
    throw new DailyReportServiceError(403, 'FORBIDDEN', '只能提交自己的日报');
  }
  if (!EDITABLE_STATUSES.includes(String(row.status) as DailyReportStatus)) {
    throw new DailyReportServiceError(409, 'REPORT_LOCKED', '只有草稿或驳回状态可以提交');
  }

  const items = await loadItems(reportId);
  if (!hasReportContent(String(row.manual_summary_md || ''), items)) {
    throw new DailyReportServiceError(400, 'EMPTY_REPORT', '提交前需要填写总结或至少一条日报内容');
  }

  await execute(
    `UPDATE daily_reports
     SET status = 'submitted', submitted_at = datetime('now', '+8 hours'), version = version + 1,
         updated_at = datetime('now', '+8 hours')
     WHERE id = ?`,
    [reportId]
  );
  await recordAudit(reportId, user.id, 'submit', String(row.status), 'submitted');

  const updated = await queryOne<DailyReportRow>(
    `SELECT r.*, u.name AS user_name, u.username, reviewer.name AS reviewer_name, reviewer.username AS reviewer_username
     FROM daily_reports r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
     WHERE r.id = ?`,
    [reportId]
  );
  await notifyDailyReportSubmitted(user, String(row.report_date));
  return formatReport(updated);
}

export async function listTeamDailyReports(user: User | undefined, filters: DailyReportListFilters) {
  assertAuthenticated(user);
  ensureCanManage(user);
  const reportDate = parseDate(filters.reportDate);
  const status = parseStatus(filters.status);
  const params: unknown[] = [reportDate];
  let where = `WHERE r.report_date = ?`;

  if (status) {
    where += ` AND r.status = ?`;
    params.push(status);
  }

  const rows = await queryAll<DailyReportRow>(
    `SELECT r.*, u.name AS user_name, u.username, reviewer.name AS reviewer_name, reviewer.username AS reviewer_username
     FROM daily_reports r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
     ${where}
     ORDER BY r.updated_at DESC, r.id DESC`,
    params
  );

  const reports = [];
  for (const row of rows) {
    const formatted = await formatReport(row);
    if (!formatted) {
      continue;
    }
    const itemSummary = formatted.items
      .filter((item) => item.contentMd.trim().length > 0)
      .slice(0, 3)
      .map((item) => ({
        sectionKey: item.sectionKey,
        title: item.title,
        excerpt: item.contentMd.slice(0, 120),
      }));

    reports.push({
      ...formatted,
      summaryExcerpt: formatted.manualSummaryMd.slice(0, 160),
      itemSummary,
    });
  }

  return { reportDate, status: status || null, reports };
}

export async function reviewDailyReport(
  user: User | undefined,
  reportId: number,
  input: ReviewDailyReportInput
) {
  assertAuthenticated(user);
  ensureCanManage(user);
  const action = input.action;
  if (action !== 'approve' && action !== 'reject') {
    throw new DailyReportServiceError(400, 'INVALID_ACTION', '审核动作必须为 approve 或 reject');
  }

  const row = await queryOne<DailyReportRow>(`SELECT * FROM daily_reports WHERE id = ?`, [reportId]);
  if (!row) {
    throw new DailyReportServiceError(404, 'REPORT_NOT_FOUND', '日报不存在');
  }
  if (String(row.status) !== 'submitted') {
    throw new DailyReportServiceError(409, 'REPORT_NOT_SUBMITTED', '只有已提交日报可以审核');
  }

  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  const comment = String(input.comment || '').trim();
  await execute(
    `UPDATE daily_reports
     SET status = ?, reviewed_at = datetime('now', '+8 hours'), reviewed_by = ?, review_comment = ?,
         version = version + 1, updated_at = datetime('now', '+8 hours')
     WHERE id = ?`,
    [nextStatus, user.id, comment, reportId]
  );
  await recordAudit(reportId, user.id, `review_${action}`, 'submitted', nextStatus, comment);

  const updated = await queryOne<DailyReportRow>(
    `SELECT r.*, u.name AS user_name, u.username, reviewer.name AS reviewer_name, reviewer.username AS reviewer_username
     FROM daily_reports r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
     WHERE r.id = ?`,
    [reportId]
  );
  notifyDailyReportReviewed(Number(row.user_id), String(row.report_date), action, comment);
  return formatReport(updated);
}

export async function listDailyReportArchive(user: User | undefined, filters: DailyReportListFilters) {
  assertAuthenticated(user);
  const start = parseDate(filters.start);
  const end = parseDate(filters.end || filters.start);
  ensureArchiveRange(start, end);

  const canViewArchive = isManager(user) || await hasPermissionCode(user, 'report:daily:archive');
  const requestedUserId = filters.userId ? Number(filters.userId) : canViewArchive ? null : user.id;
  if (requestedUserId !== null && (!Number.isInteger(requestedUserId) || requestedUserId <= 0)) {
    throw new DailyReportServiceError(400, 'INVALID_USER_ID', '用户 ID 不合法');
  }
  if (requestedUserId !== null && requestedUserId !== user.id && !canViewArchive) {
    throw new DailyReportServiceError(403, 'FORBIDDEN', '只能查看自己的日报归档');
  }

  const params: unknown[] = [start, end];
  let userWhere = '';
  if (requestedUserId !== null) {
    userWhere = ' AND r.user_id = ?';
    params.push(requestedUserId);
  }

  const rows = await queryAll<DailyReportRow>(
    `SELECT r.*, u.name AS user_name, u.username, reviewer.name AS reviewer_name, reviewer.username AS reviewer_username
     FROM daily_reports r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
     WHERE r.report_date BETWEEN ? AND ?${userWhere}
     ORDER BY r.report_date DESC, r.updated_at DESC`,
    params
  );

  const reports = [];
  for (const row of rows) {
    reports.push(await formatReport(row));
  }

  return { start, end, userId: requestedUserId, reports };
}

async function getSourceSuggestions(user: User, reportDate: string) {
  const suggestions: SourceSuggestion[] = [];

  const topicRows = await queryAll<Record<string, unknown>>(
    `SELECT id, title, status, updated_at
     FROM topics
     WHERE (creator_id = ? OR assignee_id = ?)
       AND (date(created_at) = ? OR date(updated_at) = ?)
     ORDER BY updated_at DESC
     LIMIT 10`,
    [user.id, user.id, reportDate, reportDate]
  );

  for (const row of topicRows) {
    suggestions.push({
      sectionKey: 'progress',
      title: `选题：${String(row.title || '')}`,
      contentMd: `选题状态：${String(row.status || '未知')}`,
      sourceType: 'topic',
      sourceId: Number(row.id),
      meta: { updatedAt: row.updated_at },
    });
  }

  const productionRows = await queryAll<Record<string, unknown>>(
    `SELECT p.id, p.status, p.version, p.updated_at, t.title AS topic_title
     FROM production p
     LEFT JOIN topics t ON t.id = p.topic_id
     WHERE p.operator_id = ?
       AND (date(p.created_at) = ? OR date(p.updated_at) = ?)
     ORDER BY p.updated_at DESC
     LIMIT 10`,
    [user.id, reportDate, reportDate]
  );

  for (const row of productionRows) {
    suggestions.push({
      sectionKey: 'done',
      title: `创作：${String(row.topic_title || `#${row.id}`)}`,
      contentMd: `创作状态：${String(row.status || '未知')}，版本：${String(row.version || '-')}`,
      sourceType: 'production',
      sourceId: Number(row.id),
      meta: { updatedAt: row.updated_at },
    });
  }

  const publishingRows = await queryAll<Record<string, unknown>>(
    `SELECT p.id, p.status, p.platform, p.url, p.updated_at, t.title AS topic_title
     FROM publishing p
     LEFT JOIN topics t ON t.id = p.topic_id
     WHERE p.operator_id = ?
       AND (date(p.created_at) = ? OR date(p.updated_at) = ?)
     ORDER BY p.updated_at DESC
     LIMIT 10`,
    [user.id, reportDate, reportDate]
  );

  for (const row of publishingRows) {
    suggestions.push({
      sectionKey: 'done',
      title: `发布：${String(row.topic_title || `#${row.id}`)}`,
      contentMd: `发布状态：${String(row.status || '未知')}，平台：${String(row.platform || '-')}`,
      sourceType: 'publishing',
      sourceId: Number(row.id),
      meta: { updatedAt: row.updated_at },
    });
  }

  return suggestions;
}

export async function generateDailyReportDraft(user: User | undefined, dateValue?: string) {
  assertAuthenticated(user);
  const reportDate = parseDate(dateValue);
  const suggestions = await getSourceSuggestions(user, reportDate);
  const autoSummary = {
    generatedAt: new Date().toISOString(),
    sourceCount: suggestions.length,
    sources: suggestions.map((item) => ({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: item.title,
      updatedAt: item.meta?.updatedAt,
    })),
  };

  const existing = await queryOne<DailyReportRow>(
    `SELECT * FROM daily_reports WHERE user_id = ? AND report_date = ?`,
    [user.id, reportDate]
  );

  if (existing && EDITABLE_STATUSES.includes(String(existing.status) as DailyReportStatus)) {
    await execute(
      `UPDATE daily_reports
       SET auto_summary_json = ?, updated_at = datetime('now', '+8 hours')
       WHERE id = ?`,
      [stringifyJson(autoSummary), Number(existing.id)]
    );
    await recordAudit(Number(existing.id), user.id, 'generate_draft', String(existing.status), String(existing.status), undefined, {
      sourceCount: suggestions.length,
    });
  }

  return {
    reportDate,
    sourceStatus: suggestions.length > 0 ? 'ready' : 'empty',
    message: suggestions.length > 0 ? '已基于真实业务数据生成草稿建议' : '当天暂无可用于生成日报的业务数据',
    suggestions,
    autoSummary,
    updatedReportId: existing ? Number(existing.id) : null,
  };
}
