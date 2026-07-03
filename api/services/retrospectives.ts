import type { User } from '../types/index.js';
import { beijingNow, execute, executeInsert, queryAll, queryOne, runInTransaction } from '../database/utils.js';
import { createMessage } from '../utils/messageHelper.js';
import type {
  CreateRetroActionInput,
  CreateRetrospectiveInput,
  CreateRetroTemplateInput,
  GenerateSnapshotInput,
  RetroActionStatus,
  RetrospectiveListFilters,
  RetrospectiveScopeType,
  RetrospectiveStatus,
  RetroTemplateCategory,
  UpdateRetroActionInput,
  UpdateRetrospectiveInput,
} from '../types/retrospectives.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEMPLATE_CATEGORIES: RetroTemplateCategory[] = ['weekly', 'project', 'channel', 'topic', 'daily', 'custom'];
const SCOPE_TYPES: RetrospectiveScopeType[] = ['team', 'project', 'topic', 'channel', 'user', 'daily_report', 'custom'];
const RETRO_STATUSES: RetrospectiveStatus[] = ['draft', 'published', 'archived'];
const ACTION_STATUSES: RetroActionStatus[] = ['todo', 'doing', 'done', 'cancelled'];
const MAX_RETRO_RANGE_DAYS = 366;

const RETRO_STATUS_LABELS: Record<RetrospectiveStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

const ACTION_STATUS_LABELS: Record<RetroActionStatus, string> = {
  todo: '待处理',
  doing: '进行中',
  done: '已完成',
  cancelled: '已取消',
};

const RETRO_CATEGORY_LABELS: Record<RetroTemplateCategory, string> = {
  weekly: '周复盘',
  project: '项目复盘',
  channel: '渠道复盘',
  topic: '选题复盘',
  daily: '日报复盘',
  custom: '自定义',
};

const METRIC_LABELS: Record<string, string> = {
  topics_count: '选题数量',
  production_count: '创作数量',
  publishing_count: '发布数量',
  daily_reports_submitted_count: '日报提交数',
  daily_reports_reviewed_count: '日报审核数',
  daily_reports_rejected_count: '日报退回数',
  daily_reports_risk_count: '日报风险数',
  daily_report_risk_section_nonempty: '日报风险分段数',
  daily_report_tomorrow_section_nonempty: '日报明日计划分段数',
  retro_actions_count: '复盘行动项数',
  retro_actions_done_count: '已完成行动项数',
};

type Row = Record<string, unknown>;

type RetrospectiveRow = Row & {
  id: number;
  template_id: number | null;
  title: string;
  scope_type: string;
  scope_id: number | null;
  period_start: string;
  period_end: string;
  status: string;
  summary_md: string | null;
  owner_id: number | null;
  published_at: string | null;
  archived_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  version: number;
};

export class RetrospectiveServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'RetrospectiveServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function assertAuthenticated(user?: User): asserts user is User {
  if (!user) {
    throw new RetrospectiveServiceError(401, 'UNAUTHENTICATED', '请先登录');
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
    [user.id, code],
  );
  return rows.length > 0;
}

async function canUsePermission(user: User, code: string) {
  return isManager(user) || await hasPermissionCode(user, code);
}

function parseDate(value?: string, field = 'date') {
  const date = String(value || '').trim();
  if (!DATE_RE.test(date)) {
    throw new RetrospectiveServiceError(400, 'INVALID_DATE', `${field} 必须使用 YYYY-MM-DD 格式`);
  }
  return date;
}

function ensureDateRange(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00+08:00`).getTime();
  const endTime = new Date(`${end}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) {
    throw new RetrospectiveServiceError(400, 'INVALID_RANGE', '复盘周期不合法');
  }

  const days = Math.floor((endTime - startTime) / 86_400_000) + 1;
  if (days > MAX_RETRO_RANGE_DAYS) {
    throw new RetrospectiveServiceError(400, 'RANGE_TOO_LARGE', '复盘周期不能超过 366 天');
  }
}

function parseJson(raw?: string | null) {
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

function parseCategory(value?: string): RetroTemplateCategory | undefined {
  if (!value) {
    return undefined;
  }
  if (!TEMPLATE_CATEGORIES.includes(value as RetroTemplateCategory)) {
    throw new RetrospectiveServiceError(400, 'INVALID_CATEGORY', '复盘模板类型不合法');
  }
  return value as RetroTemplateCategory;
}

function parseStatus(value?: string): RetrospectiveStatus | undefined {
  if (!value) {
    return undefined;
  }
  if (!RETRO_STATUSES.includes(value as RetrospectiveStatus)) {
    throw new RetrospectiveServiceError(400, 'INVALID_STATUS', '复盘状态不合法');
  }
  return value as RetrospectiveStatus;
}

function parseScopeType(value?: string): RetrospectiveScopeType {
  const scopeType = value || 'custom';
  if (!SCOPE_TYPES.includes(scopeType as RetrospectiveScopeType)) {
    throw new RetrospectiveServiceError(400, 'INVALID_SCOPE_TYPE', '复盘范围不合法');
  }
  return scopeType as RetrospectiveScopeType;
}

function parseActionStatus(value?: string): RetroActionStatus | undefined {
  if (!value) {
    return undefined;
  }
  if (!ACTION_STATUSES.includes(value as RetroActionStatus)) {
    throw new RetrospectiveServiceError(400, 'INVALID_ACTION_STATUS', '行动项状态不合法');
  }
  return value as RetroActionStatus;
}

async function formatTemplate(row: Row | null) {
  if (!row) {
    return null;
  }
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    category: String(row.category || 'custom'),
    description: String(row.description || ''),
    schemaJson: parseJson(String(row.schema_json || '')),
    metricBindingsJson: parseJson(String(row.metric_bindings_json || '')),
    status: String(row.status || 'active'),
    createdBy: row.created_by === null || row.created_by === undefined ? null : Number(row.created_by),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

async function loadTemplate(templateId?: number | null) {
  if (!templateId) {
    return null;
  }
  const row = await queryOne<Row>(`SELECT * FROM retro_templates WHERE id = ?`, [templateId]);
  return formatTemplate(row);
}

function formatSnapshot(row: Row) {
  return {
    id: Number(row.id),
    retroId: Number(row.retro_id),
    metricKey: String(row.metric_key || ''),
    metricName: String(row.metric_name || ''),
    valueNum: row.value_num === null || row.value_num === undefined ? null : Number(row.value_num),
    valueText: row.value_text === null || row.value_text === undefined ? null : String(row.value_text),
    compareValueNum: row.compare_value_num === null || row.compare_value_num === undefined ? null : Number(row.compare_value_num),
    dimensionJson: parseJson(String(row.dimension_json || '')),
    sourceRefJson: parseJson(String(row.source_ref_json || '')),
    capturedAt: String(row.captured_at || ''),
    createdAt: String(row.created_at || ''),
  };
}

function formatAction(row: Row) {
  return {
    id: Number(row.id),
    retroId: Number(row.retro_id),
    title: String(row.title || ''),
    descriptionMd: String(row.description_md || ''),
    ownerId: row.owner_id === null || row.owner_id === undefined ? null : Number(row.owner_id),
    ownerName: String(row.owner_name || row.owner_username || ''),
    dueDate: row.due_date === null || row.due_date === undefined ? null : String(row.due_date),
    status: String(row.status || 'todo') as RetroActionStatus,
    resultMd: String(row.result_md || ''),
    closedAt: row.closed_at ? String(row.closed_at) : null,
    createdBy: row.created_by === null || row.created_by === undefined ? null : Number(row.created_by),
    creatorName: String(row.creator_name || row.creator_username || ''),
    retroTitle: String(row.retro_title || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

function formatRetrospective(row: Row, counts?: { snapshotCount?: number; actionCount?: number }) {
  return {
    id: Number(row.id),
    templateId: row.template_id === null || row.template_id === undefined ? null : Number(row.template_id),
    templateName: String(row.template_name || ''),
    templateCategory: String(row.template_category || ''),
    title: String(row.title || ''),
    scopeType: String(row.scope_type || 'custom'),
    scopeId: row.scope_id === null || row.scope_id === undefined ? null : Number(row.scope_id),
    periodStart: String(row.period_start || ''),
    periodEnd: String(row.period_end || ''),
    status: String(row.status || 'draft') as RetrospectiveStatus,
    summaryMd: String(row.summary_md || ''),
    ownerId: row.owner_id === null || row.owner_id === undefined ? null : Number(row.owner_id),
    ownerName: String(row.owner_name || row.owner_username || ''),
    publishedAt: row.published_at ? String(row.published_at) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdBy: row.created_by === null || row.created_by === undefined ? null : Number(row.created_by),
    creatorName: String(row.creator_name || row.creator_username || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    version: Number(row.version || 1),
    snapshotCount: Number(counts?.snapshotCount ?? row.snapshot_count ?? 0),
    actionCount: Number(counts?.actionCount ?? row.action_count ?? 0),
  };
}

async function getRetrospectiveRow(id: number) {
  return queryOne<RetrospectiveRow>(
    `SELECT r.*, t.name AS template_name, t.category AS template_category,
            owner.name AS owner_name, owner.username AS owner_username,
            creator.name AS creator_name, creator.username AS creator_username
     FROM retrospectives r
     LEFT JOIN retro_templates t ON t.id = r.template_id
     LEFT JOIN users owner ON owner.id = r.owner_id
     LEFT JOIN users creator ON creator.id = r.created_by
     WHERE r.id = ?`,
    [id],
  );
}

async function loadSnapshots(retroId: number) {
  const rows = await queryAll<Row>(
    `SELECT * FROM retro_metric_snapshots WHERE retro_id = ? ORDER BY metric_key ASC, id ASC`,
    [retroId],
  );
  return rows.map(formatSnapshot);
}

async function loadActions(retroId: number) {
  const rows = await queryAll<Row>(
    `SELECT a.*, r.title AS retro_title,
            owner.name AS owner_name, owner.username AS owner_username,
            creator.name AS creator_name, creator.username AS creator_username
     FROM retro_actions a
     JOIN retrospectives r ON r.id = a.retro_id
     LEFT JOIN users owner ON owner.id = a.owner_id
     LEFT JOIN users creator ON creator.id = a.created_by
     WHERE a.retro_id = ?
     ORDER BY a.status ASC, a.due_date ASC, a.id ASC`,
    [retroId],
  );
  return rows.map(formatAction);
}

async function loadManagerUsers() {
  return queryAll<{ id: number }>(
    `SELECT id FROM users WHERE enabled = 1 AND role IN ('admin', 'director')`,
    [],
  );
}

function notifyUser(
  userId: number | null | undefined,
  title: string,
  content: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  link?: string,
) {
  if (!userId) return;
  createMessage(userId, title, content, type, link);
}

async function notifyRetrospectivePublished(retro: RetrospectiveRow, actorId: number) {
  const recipients = new Set<number>();
  if (retro.owner_id) recipients.add(Number(retro.owner_id));
  if (retro.created_by) recipients.add(Number(retro.created_by));
  for (const manager of await loadManagerUsers()) {
    recipients.add(Number(manager.id));
  }
  recipients.delete(actorId);
  for (const userId of recipients) {
    notifyUser(
      userId,
      '复盘已发布',
      `复盘「${retro.title}」已发布，可进入详情查看结论与行动项。`,
      'success',
      `/retrospectives/${retro.id}`,
    );
  }
}

async function notifyRetrospectiveArchived(retro: RetrospectiveRow, actorId: number) {
  const recipients = new Set<number>();
  if (retro.owner_id) recipients.add(Number(retro.owner_id));
  if (retro.created_by) recipients.add(Number(retro.created_by));
  for (const manager of await loadManagerUsers()) {
    recipients.add(Number(manager.id));
  }
  recipients.delete(actorId);
  for (const userId of recipients) {
    notifyUser(
      userId,
      '复盘已归档',
      `复盘「${retro.title}」已归档，后续仅保留查看与行动项结果更新。`,
      'info',
      `/retrospectives/${retro.id}`,
    );
  }
}

function notifyActionAssigned(retro: RetrospectiveRow, actionTitle: string, ownerId: number | null, actorId: number) {
  if (!ownerId || ownerId === actorId) return;
  notifyUser(
    ownerId,
    '你有新的复盘行动项',
    `复盘「${retro.title}」分配了行动项「${actionTitle}」。`,
    'warning',
    `/retrospectives/${retro.id}`,
  );
}

async function notifyActionUpdated(retroId: number, action: Row, actorId: number, beforeStatus: string, afterStatus: string) {
  const retro = await getRetrospectiveRow(retroId);
  if (!retro) return;

  const recipients = new Set<number>();
  if (retro.owner_id) recipients.add(Number(retro.owner_id));
  if (retro.created_by) recipients.add(Number(retro.created_by));
  if (action.created_by) recipients.add(Number(action.created_by));
  recipients.delete(actorId);

  const changed = beforeStatus !== afterStatus;
  for (const userId of recipients) {
    notifyUser(
      userId,
      changed ? '复盘行动项状态已更新' : '复盘行动项已更新',
      `复盘「${retro.title}」的行动项「${action.title || ''}」已更新${changed ? `：从${ACTION_STATUS_LABELS[beforeStatus as RetroActionStatus] || '未知状态'}调整为${ACTION_STATUS_LABELS[afterStatus as RetroActionStatus] || '未知状态'}` : '。'}`,
      changed && afterStatus === 'done' ? 'success' : 'info',
      `/retrospectives/${retro.id}`,
    );
  }
}

async function userCanView(user: User, retro: RetrospectiveRow) {
  if (isManager(user) || await hasPermissionCode(user, 'analytics:retro:view')) {
    return true;
  }
  if (String(retro.status) === 'published') {
    return true;
  }
  if (Number(retro.owner_id) === user.id || Number(retro.created_by) === user.id) {
    return true;
  }
  const action = await queryOne<Row>(
    `SELECT id FROM retro_actions WHERE retro_id = ? AND owner_id = ? LIMIT 1`,
    [Number(retro.id), user.id],
  );
  return Boolean(action);
}

async function userCanEdit(user: User, retro: RetrospectiveRow) {
  if (String(retro.status) !== 'draft') {
    return false;
  }
  return Number(retro.owner_id) === user.id ||
    Number(retro.created_by) === user.id ||
    await canUsePermission(user, 'analytics:retro:create');
}

async function userCanPublish(user: User, retro: RetrospectiveRow) {
  return String(retro.status) === 'draft' && await canUsePermission(user, 'analytics:retro:publish');
}

async function userCanArchive(user: User, retro: RetrospectiveRow) {
  return String(retro.status) === 'published' && await canUsePermission(user, 'analytics:retro:archive');
}

async function userCanManageActions(user: User) {
  return await canUsePermission(user, 'analytics:retro:action_manage');
}

function parseId(value: number | string, field = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new RetrospectiveServiceError(400, 'INVALID_ID', `${field} 不合法`);
  }
  return id;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function markdownValue(value: unknown) {
  const text = String(value ?? '').trim();
  return text || '-';
}

function buildRetrospectiveMarkdown(detail: Awaited<ReturnType<typeof getRetrospectiveDetail>>) {
  const { retrospective, template, snapshots, actions } = detail;
  const lines: string[] = [
    `# ${retrospective.title}`,
    '',
    `- 类型：${RETRO_CATEGORY_LABELS[retrospective.templateCategory as RetroTemplateCategory] || '自定义'}`,
    `- 模板：${template?.name || retrospective.templateName || '-'}`,
    `- 周期：${retrospective.periodStart} 至 ${retrospective.periodEnd}`,
    `- 状态：${RETRO_STATUS_LABELS[retrospective.status as RetrospectiveStatus] || '未知状态'}`,
    `- 负责人：${retrospective.ownerName || '-'}`,
    `- 创建人：${retrospective.creatorName || '-'}`,
    `- 发布时间：${retrospective.publishedAt || '-'}`,
    `- 归档时间：${retrospective.archivedAt || '-'}`,
    '',
    '## 复盘结论',
    '',
    markdownValue(retrospective.summaryMd),
    '',
    '## 指标快照',
    '',
  ];

  if (snapshots.length === 0) {
    lines.push('- 暂无指标快照');
  } else {
    for (const snapshot of snapshots) {
      lines.push(`- ${METRIC_LABELS[snapshot.metricKey] || snapshot.metricName || '指标'}：${snapshot.valueNum ?? snapshot.valueText ?? '-'}`);
    }
  }

  lines.push('', '## 行动项', '');
  if (actions.length === 0) {
    lines.push('- 暂无行动项');
  } else {
    for (const action of actions) {
      lines.push(
        `### ${action.title}`,
        '',
        `- 负责人：${action.ownerName || '-'}`,
        `- 截止日期：${action.dueDate || '-'}`,
        `- 状态：${ACTION_STATUS_LABELS[action.status as RetroActionStatus] || '未知状态'}`,
        `- 关闭时间：${action.closedAt || '-'}`,
        '',
        markdownValue(action.descriptionMd),
        '',
        `结果：${markdownValue(action.resultMd)}`,
        '',
      );
    }
  }

  return lines.join('\n');
}

function buildRetrospectiveHtml(detail: Awaited<ReturnType<typeof getRetrospectiveDetail>>) {
  const markdown = buildRetrospectiveMarkdown(detail);
  const blocks = markdown
    .split('\n')
    .map((line) => {
      if (line.startsWith('# ')) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith('### ')) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      if (line.startsWith('- ')) return `<p class="list">${escapeHtml(line)}</p>`;
      if (!line.trim()) return '';
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(detail.retrospective.title)} - 复盘导出</title>
  <style>
    body { margin: 40px; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.7; }
    h1 { font-size: 28px; margin-bottom: 16px; }
    h2 { margin-top: 32px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    h3 { margin-top: 24px; }
    p { white-space: pre-wrap; }
    .list { margin: 4px 0; color: #374151; }
    @media print { body { margin: 18mm; } }
  </style>
</head>
<body>
${blocks}
</body>
</html>`;
}

async function recordAudit(
  retroId: number,
  actorId: number,
  action: string,
  beforeStatus?: string,
  afterStatus?: string,
  comment?: string,
) {
  await execute(
    `INSERT INTO retro_audit_logs (retro_id, actor_id, action, before_status, after_status, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))`,
    [retroId, actorId, action, beforeStatus || null, afterStatus || null, comment || null],
  );
}

export async function listRetroTemplates(user: User | undefined, includeDisabled = false) {
  assertAuthenticated(user);
  const canManageTemplates = await canUsePermission(user, 'analytics:retro:template_manage');
  const rows = await queryAll<Row>(
    `SELECT * FROM retro_templates
     WHERE status = 'active' OR ? = 1
     ORDER BY category ASC, id ASC`,
    [includeDisabled && canManageTemplates ? 1 : 0],
  );
  return { templates: await Promise.all(rows.map(formatTemplate)) };
}

export async function createRetroTemplate(user: User | undefined, input: CreateRetroTemplateInput) {
  assertAuthenticated(user);
  if (!await canUsePermission(user, 'analytics:retro:template_manage')) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', '当前账号没有管理复盘模板的权限');
  }

  const name = String(input.name || '').trim();
  if (!name) {
    throw new RetrospectiveServiceError(400, 'INVALID_NAME', '请填写模板名称');
  }
  const category = parseCategory(input.category || 'custom') || 'custom';
  const templateId = await executeInsert(
    `INSERT INTO retro_templates
       (name, category, description, schema_json, metric_bindings_json, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
    [
      name,
      category,
      String(input.description || '').trim(),
      stringifyJson(input.schemaJson || {}),
      stringifyJson(input.metricBindingsJson || {}),
      user.id,
    ],
  );

  const row = await queryOne<Row>(`SELECT * FROM retro_templates WHERE id = ?`, [templateId]);
  return formatTemplate(row);
}

export async function listRetrospectives(user: User | undefined, filters: RetrospectiveListFilters) {
  assertAuthenticated(user);
  const status = parseStatus(filters.status);
  const category = parseCategory(filters.category);
  const params: unknown[] = [];
  const where: string[] = [];
  const canViewAll = isManager(user) || await hasPermissionCode(user, 'analytics:retro:view');

  if (!canViewAll) {
    where.push(`(r.status = 'published' OR r.owner_id = ? OR r.created_by = ? OR EXISTS (
      SELECT 1 FROM retro_actions va WHERE va.retro_id = r.id AND va.owner_id = ?
    ))`);
    params.push(user.id, user.id, user.id);
  }
  if (status) {
    where.push('r.status = ?');
    params.push(status);
  }
  if (category) {
    where.push('t.category = ?');
    params.push(category);
  }
  if (filters.start) {
    const start = parseDate(filters.start, 'start');
    where.push('r.period_end >= ?');
    params.push(start);
  }
  if (filters.end) {
    const end = parseDate(filters.end, 'end');
    where.push('r.period_start <= ?');
    params.push(end);
  }
  if (filters.ownerId) {
    where.push('r.owner_id = ?');
    params.push(parseId(filters.ownerId, 'ownerId'));
  }

  const rows = await queryAll<Row>(
    `SELECT r.*, t.name AS template_name, t.category AS template_category,
            owner.name AS owner_name, owner.username AS owner_username,
            creator.name AS creator_name, creator.username AS creator_username,
            (SELECT COUNT(*) FROM retro_metric_snapshots s WHERE s.retro_id = r.id) AS snapshot_count,
            (SELECT COUNT(*) FROM retro_actions a WHERE a.retro_id = r.id) AS action_count
     FROM retrospectives r
     LEFT JOIN retro_templates t ON t.id = r.template_id
     LEFT JOIN users owner ON owner.id = r.owner_id
     LEFT JOIN users creator ON creator.id = r.created_by
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY r.period_start DESC, r.updated_at DESC, r.id DESC`,
    params,
  );

  return { retrospectives: rows.map((row) => formatRetrospective(row)) };
}

export async function listMyRetroActions(user: User | undefined, statusValue?: string) {
  assertAuthenticated(user);
  const params: unknown[] = [user.id];
  const where = ['a.owner_id = ?'];
  const status = statusValue === 'open' || statusValue === 'all' ? undefined : parseActionStatus(statusValue);

  if (statusValue === 'open' || !statusValue) {
    where.push(`a.status NOT IN ('done', 'cancelled')`);
  } else if (status) {
    where.push('a.status = ?');
    params.push(status);
  }

  const rows = await queryAll<Row>(
    `SELECT a.*, r.title AS retro_title,
            owner.name AS owner_name, owner.username AS owner_username,
            creator.name AS creator_name, creator.username AS creator_username
     FROM retro_actions a
     JOIN retrospectives r ON r.id = a.retro_id
     LEFT JOIN users owner ON owner.id = a.owner_id
     LEFT JOIN users creator ON creator.id = a.created_by
     WHERE ${where.join(' AND ')}
     ORDER BY CASE a.status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
              CASE WHEN a.due_date IS NULL THEN 1 ELSE 0 END,
              a.due_date ASC,
              a.updated_at DESC`,
    params,
  );

  return { actions: rows.map(formatAction) };
}

export async function listRetrospectiveDailyRisks(user: User | undefined, retroIdValue: number) {
  assertAuthenticated(user);
  const retroId = parseId(retroIdValue);
  const row = await getRetrospectiveRow(retroId);
  if (!row) {
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', '复盘不存在或不可访问');
  }
  if (!await userCanView(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', '当前账号不能查看该复盘的日报风险');
  }

  const rows = await queryAll<Row>(
    `SELECT i.id AS item_id, i.report_id, i.section_key, i.content_md,
            r.report_date, r.user_id, r.risk_level, r.status,
            u.name AS user_name, u.username AS username
     FROM daily_report_items i
     JOIN daily_reports r ON r.id = i.report_id
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.report_date BETWEEN ? AND ?
       AND i.section_key IN ('risk', 'risks', 'blocker', 'blockers')
       AND TRIM(COALESCE(i.content_md, '')) != ''
     ORDER BY r.report_date DESC, r.user_id ASC, i.id ASC`,
    [row.period_start, row.period_end],
  );

  return {
    risks: rows.map((item) => ({
      itemId: Number(item.item_id),
      reportId: Number(item.report_id),
      reportDate: String(item.report_date || ''),
      userId: Number(item.user_id),
      userName: String(item.user_name || item.username || ''),
      sectionKey: String(item.section_key || ''),
      contentMd: String(item.content_md || ''),
      riskLevel: String(item.risk_level || 'normal'),
      reportStatus: String(item.status || ''),
    })),
  };
}

export async function createRetrospective(user: User | undefined, input: CreateRetrospectiveInput) {
  assertAuthenticated(user);
  if (!await canUsePermission(user, 'analytics:retro:create')) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', '当前账号没有创建复盘的权限');
  }

  const title = String(input.title || '').trim();
  if (!title) {
    throw new RetrospectiveServiceError(400, 'INVALID_TITLE', '请填写复盘标题');
  }
  const periodStart = parseDate(input.periodStart, 'periodStart');
  const periodEnd = parseDate(input.periodEnd, 'periodEnd');
  ensureDateRange(periodStart, periodEnd);
  const scopeType = parseScopeType(input.scopeType);
  const templateId = input.templateId ? parseId(input.templateId, 'templateId') : null;
  const ownerId = input.ownerId ? parseId(input.ownerId, 'ownerId') : user.id;
  const scopeId = input.scopeId === undefined || input.scopeId === null ? null : parseId(input.scopeId, 'scopeId');

  if (templateId) {
    const template = await queryOne<Row>(`SELECT id FROM retro_templates WHERE id = ?`, [templateId]);
    if (!template) {
      throw new RetrospectiveServiceError(404, 'TEMPLATE_NOT_FOUND', '复盘模板不存在');
    }
  }

  const retroId = await executeInsert(
    `INSERT INTO retrospectives
       (template_id, title, scope_type, scope_id, period_start, period_end, status, summary_md, owner_id, created_by, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', '', ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'), 1)`,
    [templateId, title, scopeType, scopeId, periodStart, periodEnd, ownerId, user.id],
  );
  await recordAudit(retroId, user.id, 'create', undefined, 'draft');
  return getRetrospectiveDetail(user, retroId);
}

export async function getRetrospectiveDetail(user: User | undefined, retroIdValue: number) {
  assertAuthenticated(user);
  const retroId = parseId(retroIdValue);
  const row = await getRetrospectiveRow(retroId);
  if (!row) {
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', '复盘不存在或不可访问');
  }
  if (!await userCanView(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', '当前账号不能查看该复盘');
  }

  const [template, snapshots, actions] = await Promise.all([
    loadTemplate(row.template_id),
    loadSnapshots(retroId),
    loadActions(retroId),
  ]);

  return {
    retrospective: formatRetrospective(row, { snapshotCount: snapshots.length, actionCount: actions.length }),
    template,
    snapshots,
    actions,
    permissions: {
      canEdit: await userCanEdit(user, row),
      canPublish: await userCanPublish(user, row),
      canArchive: await userCanArchive(user, row),
      canManageActions: await userCanManageActions(user),
    },
  };
}

export async function exportRetrospective(user: User | undefined, retroIdValue: number, typeValue?: string) {
  const type = typeValue === 'html' ? 'html' : 'markdown';
  const detail = await getRetrospectiveDetail(user, retroIdValue);
  const safeTitle = detail.retrospective.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '复盘';
  const content = type === 'html' ? buildRetrospectiveHtml(detail) : buildRetrospectiveMarkdown(detail);

  return {
    filename: `${safeTitle}.${type === 'html' ? 'html' : 'md'}`,
    contentType: type === 'html' ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8',
    content,
  };
}

export async function updateRetrospective(user: User | undefined, retroIdValue: number, input: UpdateRetrospectiveInput) {
  assertAuthenticated(user);
  const retroId = parseId(retroIdValue);
  const row = await getRetrospectiveRow(retroId);
  if (!row) {
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', '复盘不存在或不可访问');
  }
  if (!await userCanEdit(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', '当前复盘不可编辑');
  }
  if (input.version !== undefined && Number(input.version) !== Number(row.version || 1)) {
    throw new RetrospectiveServiceError(409, 'VERSION_CONFLICT', '复盘已被更新，请刷新后重试');
  }

  const title = input.title === undefined ? String(row.title) : String(input.title || '').trim();
  if (!title) {
    throw new RetrospectiveServiceError(400, 'INVALID_TITLE', '请填写复盘标题');
  }

  await execute(
    `UPDATE retrospectives
     SET title = ?, summary_md = ?, version = version + 1, updated_at = datetime('now', '+8 hours')
     WHERE id = ?`,
    [title, input.summaryMd === undefined ? row.summary_md || '' : String(input.summaryMd || ''), retroId],
  );
  await recordAudit(retroId, user.id, 'update', String(row.status), String(row.status));
  return getRetrospectiveDetail(user, retroId);
}

async function countOne(sql: string, params: unknown[]) {
  const row = await queryOne<{ count: number }>(sql, params);
  return Number(row?.count || 0);
}

async function buildMetricSnapshots(retro: RetrospectiveRow) {
  const start = String(retro.period_start);
  const end = String(retro.period_end);
  const sourceBase = { periodStart: start, periodEnd: end, capturedAt: beijingNow() };
  const metrics = [
    {
      metricKey: 'topics_count',
      metricName: '选题数量',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM topics WHERE date(created_at) BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'topics', field: 'created_at' },
    },
    {
      metricKey: 'production_count',
      metricName: '创作数量',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM production WHERE date(created_at) BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'production', field: 'created_at' },
    },
    {
      metricKey: 'publishing_count',
      metricName: '发布数量',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM publishing WHERE date(created_at) BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'publishing', field: 'created_at' },
    },
    {
      metricKey: 'daily_reports_submitted_count',
      metricName: '日报提交数',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM daily_reports WHERE submitted_at IS NOT NULL AND report_date BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'daily_reports', field: 'report_date' },
    },
    {
      metricKey: 'daily_reports_reviewed_count',
      metricName: '日报审核数',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM daily_reports WHERE reviewed_at IS NOT NULL AND report_date BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'daily_reports', field: 'report_date' },
    },
    {
      metricKey: 'daily_reports_rejected_count',
      metricName: '日报退回数',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM daily_reports WHERE status = 'rejected' AND report_date BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'daily_reports', status: 'rejected' },
    },
    {
      metricKey: 'daily_reports_risk_count',
      metricName: '日报风险数',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM daily_reports WHERE risk_level IN ('warning', 'blocked', 'high') AND report_date BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'daily_reports', field: 'risk_level' },
    },
    {
      metricKey: 'daily_report_risk_section_nonempty',
      metricName: '日报风险分段数',
      valueNum: await countOne(
        `SELECT COUNT(*) AS count
         FROM daily_report_items i
         JOIN daily_reports r ON r.id = i.report_id
         WHERE i.section_key = 'risk' AND TRIM(COALESCE(i.content_md, '')) != '' AND r.report_date BETWEEN ? AND ?`,
        [start, end],
      ),
      source: { ...sourceBase, table: 'daily_report_items', sectionKey: 'risk' },
    },
    {
      metricKey: 'daily_report_tomorrow_section_nonempty',
      metricName: '日报明日计划分段数',
      valueNum: await countOne(
        `SELECT COUNT(*) AS count
         FROM daily_report_items i
         JOIN daily_reports r ON r.id = i.report_id
         WHERE i.section_key = 'tomorrow' AND TRIM(COALESCE(i.content_md, '')) != '' AND r.report_date BETWEEN ? AND ?`,
        [start, end],
      ),
      source: { ...sourceBase, table: 'daily_report_items', sectionKey: 'tomorrow' },
    },
    {
      metricKey: 'retro_actions_count',
      metricName: '复盘行动项数',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM retro_actions WHERE date(created_at) BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'retro_actions', field: 'created_at' },
    },
    {
      metricKey: 'retro_actions_done_count',
      metricName: '已完成行动项数',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM retro_actions WHERE status = 'done' AND date(updated_at) BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'retro_actions', status: 'done' },
    },
  ];

  return metrics;
}

export async function generateRetrospectiveSnapshot(user: User | undefined, retroIdValue: number, input: GenerateSnapshotInput) {
  assertAuthenticated(user);
  const retroId = parseId(retroIdValue);
  const row = await getRetrospectiveRow(retroId);
  if (!row) {
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', '复盘不存在或不可访问');
  }
  if (!await userCanEdit(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', '当前账号不能生成指标快照');
  }
  if (input.mode && input.mode !== 'replace') {
    throw new RetrospectiveServiceError(400, 'INVALID_MODE', '只支持刷新指标快照');
  }

  const capturedAt = beijingNow();
  const snapshots = await buildMetricSnapshots(row);
  await runInTransaction(async (tx) => {
    await tx.execute(`DELETE FROM retro_metric_snapshots WHERE retro_id = ?`, [retroId]);
    for (const metric of snapshots) {
      await tx.execute(
        `INSERT INTO retro_metric_snapshots
           (retro_id, metric_key, metric_name, value_num, value_text, compare_value_num, dimension_json, source_ref_json, captured_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))`,
        [
          retroId,
          metric.metricKey,
          metric.metricName,
          metric.valueNum,
          null,
          null,
          stringifyJson({ scopeType: row.scope_type, scopeId: row.scope_id }),
          stringifyJson(metric.source),
          capturedAt,
        ],
      );
    }
  });
  await recordAudit(retroId, user.id, 'snapshot_replace', String(row.status), String(row.status), `metrics=${snapshots.length}`);
  return getRetrospectiveDetail(user, retroId);
}

export async function publishRetrospective(user: User | undefined, retroIdValue: number) {
  assertAuthenticated(user);
  const retroId = parseId(retroIdValue);
  const row = await getRetrospectiveRow(retroId);
  if (!row) {
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', '复盘不存在或不可访问');
  }
  if (!await userCanPublish(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', '当前账号不能发布该复盘');
  }

  const snapshotCount = await countOne(`SELECT COUNT(*) AS count FROM retro_metric_snapshots WHERE retro_id = ?`, [retroId]);
  const actionCount = await countOne(`SELECT COUNT(*) AS count FROM retro_actions WHERE retro_id = ?`, [retroId]);
  if (!String(row.summary_md || '').trim() && snapshotCount === 0 && actionCount === 0) {
    throw new RetrospectiveServiceError(400, 'EMPTY_RETRO', '发布前请先填写结论、生成快照或创建行动项');
  }

  await execute(
    `UPDATE retrospectives
     SET status = 'published', published_at = datetime('now', '+8 hours'), version = version + 1, updated_at = datetime('now', '+8 hours')
     WHERE id = ?`,
    [retroId],
  );
  await recordAudit(retroId, user.id, 'publish', String(row.status), 'published');
  void notifyRetrospectivePublished(row, user.id);
  return getRetrospectiveDetail(user, retroId);
}

export async function archiveRetrospective(user: User | undefined, retroIdValue: number) {
  assertAuthenticated(user);
  const retroId = parseId(retroIdValue);
  const row = await getRetrospectiveRow(retroId);
  if (!row) {
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', '复盘不存在或不可访问');
  }
  if (!await userCanArchive(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', '当前账号不能归档该复盘');
  }

  await execute(
    `UPDATE retrospectives
     SET status = 'archived', archived_at = datetime('now', '+8 hours'), version = version + 1, updated_at = datetime('now', '+8 hours')
     WHERE id = ?`,
    [retroId],
  );
  await recordAudit(retroId, user.id, 'archive', String(row.status), 'archived');
  void notifyRetrospectiveArchived(row, user.id);
  return getRetrospectiveDetail(user, retroId);
}

export async function createRetroAction(user: User | undefined, retroIdValue: number, input: CreateRetroActionInput) {
  assertAuthenticated(user);
  const retroId = parseId(retroIdValue);
  const row = await getRetrospectiveRow(retroId);
  if (!row) {
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', '复盘不存在或不可访问');
  }
  if (String(row.status) === 'archived') {
    throw new RetrospectiveServiceError(409, 'RETRO_ARCHIVED', '复盘已归档，不能新增行动项');
  }
  if (!await userCanManageActions(user)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', '当前账号不能创建行动项');
  }

  const title = String(input.title || '').trim();
  if (!title) {
    throw new RetrospectiveServiceError(400, 'INVALID_ACTION_TITLE', '请填写行动项标题');
  }
  const dueDate = input.dueDate ? parseDate(input.dueDate, 'dueDate') : null;
  const ownerId = input.ownerId ? parseId(input.ownerId, 'ownerId') : user.id;
  const actionId = await executeInsert(
    `INSERT INTO retro_actions
       (retro_id, title, description_md, owner_id, due_date, status, result_md, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'todo', '', ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
    [retroId, title, String(input.descriptionMd || ''), ownerId, dueDate, user.id],
  );
  await recordAudit(retroId, user.id, 'action_create', String(row.status), String(row.status), `action=${actionId}`);
  notifyActionAssigned(row, title, ownerId, user.id);
  return getRetrospectiveDetail(user, retroId);
}

export async function updateRetroAction(user: User | undefined, actionIdValue: number, input: UpdateRetroActionInput) {
  assertAuthenticated(user);
  const actionId = parseId(actionIdValue, 'actionId');
  const action = await queryOne<Row>(
    `SELECT a.*, r.status AS retro_status, r.id AS parent_retro_id
     FROM retro_actions a
     JOIN retrospectives r ON r.id = a.retro_id
     WHERE a.id = ?`,
    [actionId],
  );
  if (!action) {
    throw new RetrospectiveServiceError(404, 'ACTION_NOT_FOUND', '行动项不存在或不可访问');
  }

  const canManage = await userCanManageActions(user);
  const isOwner = Number(action.owner_id) === user.id;
  if (!canManage && !isOwner) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', '当前账号不能更新该行动项');
  }

  const nextStatus = parseActionStatus(input.status) || String(action.status || 'todo') as RetroActionStatus;
  const title = input.title === undefined || !canManage ? String(action.title || '') : String(input.title || '').trim();
  if (!title) {
    throw new RetrospectiveServiceError(400, 'INVALID_ACTION_TITLE', '请填写行动项标题');
  }
  const dueDate = input.dueDate === undefined || !canManage
    ? action.due_date === null || action.due_date === undefined ? null : String(action.due_date)
    : input.dueDate ? parseDate(input.dueDate, 'dueDate') : null;
  const ownerId = input.ownerId === undefined || !canManage
    ? action.owner_id === null || action.owner_id === undefined ? null : Number(action.owner_id)
    : input.ownerId ? parseId(input.ownerId, 'ownerId') : null;
  const wasDone = String(action.status || '') === 'done';
  const closedAt = nextStatus === 'done'
    ? wasDone && action.closed_at ? String(action.closed_at) : beijingNow()
    : null;

  await execute(
    `UPDATE retro_actions
     SET title = ?, description_md = ?, owner_id = ?, due_date = ?, status = ?, result_md = ?, closed_at = ?, updated_at = datetime('now', '+8 hours')
     WHERE id = ?`,
    [
      title,
      input.descriptionMd === undefined || !canManage ? String(action.description_md || '') : String(input.descriptionMd || ''),
      ownerId,
      dueDate,
      nextStatus,
      input.resultMd === undefined ? String(action.result_md || '') : String(input.resultMd || ''),
      closedAt,
      actionId,
    ],
  );
  const retroId = Number(action.parent_retro_id);
  await recordAudit(retroId, user.id, 'action_update', String(action.retro_status || ''), String(action.retro_status || ''), `action=${actionId}`);
  void notifyActionUpdated(retroId, action, user.id, String(action.status || ''), nextStatus);
  return getRetrospectiveDetail(user, retroId);
}
