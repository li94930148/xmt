import type { User } from '../types/index.js';
import { beijingNow, execute, executeInsert, queryAll, queryOne, runInTransaction } from '../database/utils.js';
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
    throw new RetrospectiveServiceError(401, 'UNAUTHENTICATED', 'Unauthenticated');
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
    throw new RetrospectiveServiceError(400, 'INVALID_DATE', `${field} must use YYYY-MM-DD`);
  }
  return date;
}

function ensureDateRange(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00+08:00`).getTime();
  const endTime = new Date(`${end}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) {
    throw new RetrospectiveServiceError(400, 'INVALID_RANGE', 'Invalid retrospective period');
  }

  const days = Math.floor((endTime - startTime) / 86_400_000) + 1;
  if (days > MAX_RETRO_RANGE_DAYS) {
    throw new RetrospectiveServiceError(400, 'RANGE_TOO_LARGE', 'Retrospective period cannot exceed 366 days');
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
    throw new RetrospectiveServiceError(400, 'INVALID_CATEGORY', 'Invalid retrospective template category');
  }
  return value as RetroTemplateCategory;
}

function parseStatus(value?: string): RetrospectiveStatus | undefined {
  if (!value) {
    return undefined;
  }
  if (!RETRO_STATUSES.includes(value as RetrospectiveStatus)) {
    throw new RetrospectiveServiceError(400, 'INVALID_STATUS', 'Invalid retrospective status');
  }
  return value as RetrospectiveStatus;
}

function parseScopeType(value?: string): RetrospectiveScopeType {
  const scopeType = value || 'custom';
  if (!SCOPE_TYPES.includes(scopeType as RetrospectiveScopeType)) {
    throw new RetrospectiveServiceError(400, 'INVALID_SCOPE_TYPE', 'Invalid retrospective scope type');
  }
  return scopeType as RetrospectiveScopeType;
}

function parseActionStatus(value?: string): RetroActionStatus | undefined {
  if (!value) {
    return undefined;
  }
  if (!ACTION_STATUSES.includes(value as RetroActionStatus)) {
    throw new RetrospectiveServiceError(400, 'INVALID_ACTION_STATUS', 'Invalid action status');
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
    `SELECT a.*, owner.name AS owner_name, owner.username AS owner_username
     FROM retro_actions a
     LEFT JOIN users owner ON owner.id = a.owner_id
     WHERE a.retro_id = ?
     ORDER BY a.status ASC, a.due_date ASC, a.id ASC`,
    [retroId],
  );
  return rows.map(formatAction);
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
    throw new RetrospectiveServiceError(400, 'INVALID_ID', `${field} is invalid`);
  }
  return id;
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
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', 'Missing retrospective template permission');
  }

  const name = String(input.name || '').trim();
  if (!name) {
    throw new RetrospectiveServiceError(400, 'INVALID_NAME', 'Template name is required');
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

export async function createRetrospective(user: User | undefined, input: CreateRetrospectiveInput) {
  assertAuthenticated(user);
  if (!await canUsePermission(user, 'analytics:retro:create')) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', 'Missing retrospective create permission');
  }

  const title = String(input.title || '').trim();
  if (!title) {
    throw new RetrospectiveServiceError(400, 'INVALID_TITLE', 'Retrospective title is required');
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
      throw new RetrospectiveServiceError(404, 'TEMPLATE_NOT_FOUND', 'Retrospective template not found');
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
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', 'Retrospective not found');
  }
  if (!await userCanView(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', 'Cannot view retrospective');
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

export async function updateRetrospective(user: User | undefined, retroIdValue: number, input: UpdateRetrospectiveInput) {
  assertAuthenticated(user);
  const retroId = parseId(retroIdValue);
  const row = await getRetrospectiveRow(retroId);
  if (!row) {
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', 'Retrospective not found');
  }
  if (!await userCanEdit(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', 'Cannot edit retrospective');
  }
  if (input.version !== undefined && Number(input.version) !== Number(row.version || 1)) {
    throw new RetrospectiveServiceError(409, 'VERSION_CONFLICT', 'Retrospective version changed');
  }

  const title = input.title === undefined ? String(row.title) : String(input.title || '').trim();
  if (!title) {
    throw new RetrospectiveServiceError(400, 'INVALID_TITLE', 'Retrospective title is required');
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
      metricName: 'Topics count',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM topics WHERE date(created_at) BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'topics', field: 'created_at' },
    },
    {
      metricKey: 'production_count',
      metricName: 'Production count',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM production WHERE date(created_at) BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'production', field: 'created_at' },
    },
    {
      metricKey: 'publishing_count',
      metricName: 'Publishing count',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM publishing WHERE date(created_at) BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'publishing', field: 'created_at' },
    },
    {
      metricKey: 'daily_reports_submitted_count',
      metricName: 'Daily reports submitted',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM daily_reports WHERE submitted_at IS NOT NULL AND report_date BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'daily_reports', field: 'report_date' },
    },
    {
      metricKey: 'daily_reports_reviewed_count',
      metricName: 'Daily reports reviewed',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM daily_reports WHERE reviewed_at IS NOT NULL AND report_date BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'daily_reports', field: 'report_date' },
    },
    {
      metricKey: 'daily_reports_rejected_count',
      metricName: 'Daily reports rejected',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM daily_reports WHERE status = 'rejected' AND report_date BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'daily_reports', status: 'rejected' },
    },
    {
      metricKey: 'daily_reports_risk_count',
      metricName: 'Daily reports risk count',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM daily_reports WHERE risk_level IN ('warning', 'blocked', 'high') AND report_date BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'daily_reports', field: 'risk_level' },
    },
    {
      metricKey: 'daily_report_risk_section_nonempty',
      metricName: 'Daily report risk sections',
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
      metricName: 'Daily report tomorrow sections',
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
      metricName: 'Retrospective actions',
      valueNum: await countOne(`SELECT COUNT(*) AS count FROM retro_actions WHERE date(created_at) BETWEEN ? AND ?`, [start, end]),
      source: { ...sourceBase, table: 'retro_actions', field: 'created_at' },
    },
    {
      metricKey: 'retro_actions_done_count',
      metricName: 'Retrospective actions done',
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
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', 'Retrospective not found');
  }
  if (!await userCanEdit(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', 'Cannot generate retrospective snapshot');
  }
  if (input.mode && input.mode !== 'replace') {
    throw new RetrospectiveServiceError(400, 'INVALID_MODE', 'Only replace snapshot mode is supported');
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
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', 'Retrospective not found');
  }
  if (!await userCanPublish(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', 'Cannot publish retrospective');
  }

  const snapshotCount = await countOne(`SELECT COUNT(*) AS count FROM retro_metric_snapshots WHERE retro_id = ?`, [retroId]);
  const actionCount = await countOne(`SELECT COUNT(*) AS count FROM retro_actions WHERE retro_id = ?`, [retroId]);
  if (!String(row.summary_md || '').trim() && snapshotCount === 0 && actionCount === 0) {
    throw new RetrospectiveServiceError(400, 'EMPTY_RETRO', 'Publish requires summary, snapshot or action');
  }

  await execute(
    `UPDATE retrospectives
     SET status = 'published', published_at = datetime('now', '+8 hours'), version = version + 1, updated_at = datetime('now', '+8 hours')
     WHERE id = ?`,
    [retroId],
  );
  await recordAudit(retroId, user.id, 'publish', String(row.status), 'published');
  return getRetrospectiveDetail(user, retroId);
}

export async function archiveRetrospective(user: User | undefined, retroIdValue: number) {
  assertAuthenticated(user);
  const retroId = parseId(retroIdValue);
  const row = await getRetrospectiveRow(retroId);
  if (!row) {
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', 'Retrospective not found');
  }
  if (!await userCanArchive(user, row)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', 'Cannot archive retrospective');
  }

  await execute(
    `UPDATE retrospectives
     SET status = 'archived', archived_at = datetime('now', '+8 hours'), version = version + 1, updated_at = datetime('now', '+8 hours')
     WHERE id = ?`,
    [retroId],
  );
  await recordAudit(retroId, user.id, 'archive', String(row.status), 'archived');
  return getRetrospectiveDetail(user, retroId);
}

export async function createRetroAction(user: User | undefined, retroIdValue: number, input: CreateRetroActionInput) {
  assertAuthenticated(user);
  const retroId = parseId(retroIdValue);
  const row = await getRetrospectiveRow(retroId);
  if (!row) {
    throw new RetrospectiveServiceError(404, 'RETRO_NOT_FOUND', 'Retrospective not found');
  }
  if (String(row.status) === 'archived') {
    throw new RetrospectiveServiceError(409, 'RETRO_ARCHIVED', 'Cannot add actions to archived retrospective');
  }
  if (!await userCanManageActions(user)) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', 'Cannot create retrospective actions');
  }

  const title = String(input.title || '').trim();
  if (!title) {
    throw new RetrospectiveServiceError(400, 'INVALID_ACTION_TITLE', 'Action title is required');
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
    throw new RetrospectiveServiceError(404, 'ACTION_NOT_FOUND', 'Retrospective action not found');
  }

  const canManage = await userCanManageActions(user);
  const isOwner = Number(action.owner_id) === user.id;
  if (!canManage && !isOwner) {
    throw new RetrospectiveServiceError(403, 'FORBIDDEN', 'Cannot update retrospective action');
  }

  const nextStatus = parseActionStatus(input.status) || String(action.status || 'todo') as RetroActionStatus;
  const title = input.title === undefined || !canManage ? String(action.title || '') : String(input.title || '').trim();
  if (!title) {
    throw new RetrospectiveServiceError(400, 'INVALID_ACTION_TITLE', 'Action title is required');
  }
  const dueDate = input.dueDate === undefined || !canManage
    ? action.due_date === null || action.due_date === undefined ? null : String(action.due_date)
    : input.dueDate ? parseDate(input.dueDate, 'dueDate') : null;
  const ownerId = input.ownerId === undefined || !canManage
    ? action.owner_id === null || action.owner_id === undefined ? null : Number(action.owner_id)
    : input.ownerId ? parseId(input.ownerId, 'ownerId') : null;
  const closedAt = nextStatus === 'done' ? beijingNow() : null;

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
  return getRetrospectiveDetail(user, retroId);
}
