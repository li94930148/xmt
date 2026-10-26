import express, { type Request, type Response } from 'express';
import { ReportSummaryUpdateBaseConflictError, ReportSummaryUpdateRequestConflictError, ReportSummaryUpdateTargetMissingError, createReportSummaryBaseFingerprint, getReportSummaryUpdateRequestStatus, updateReportSummaryWithRequest, type ReportSummaryTarget, type ReportSummaryWriteValues } from '../services/reportSummaryUpdate.js';
import { authenticate } from '../middleware/auth.js';
import { execute, queryAll, queryOne } from '../database/utils.js';
import { sendSafeServerError } from '../utils/response.js';

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/i;
router.use(['/monthly/requests/:requestId', '/yearly/requests/:requestId'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.use(authenticate);

class InvalidSummaryQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSummaryQueryError';
  }
}

function numberQuery(req: Request, key: string, fallback: number) {
  const value = Number(req.query[key] || fallback);
  if (!Number.isInteger(value) || value <= 0) throw new InvalidSummaryQueryError(`参数 ${key} 不合法`);
  return value;
}

function isAdmin(user: NonNullable<Request['user']>) {
  return user.role === 'admin' || user.role === 'director';
}

function handle(error: unknown, res: Response) {
  if (error instanceof InvalidSummaryQueryError) {
    return res.status(400).json({ success: false, message: error.message });
  }
  return sendSafeServerError(res, '总结请求失败，请稍后重试。', 'report-summaries', error);
}

type SummaryKind = 'monthly' | 'yearly';
type SummaryRow = Record<string, unknown>;

/**
 * A summary used to be stored in content_md. New writes use the type-specific
 * field, while this mapper keeps historical rows readable at one boundary.
 */
function displayContent(value: unknown) {
  const content = typeof value === 'string' ? value : value == null ? '' : String(value);
  const meaningfulText = content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|\u00a0|\u200b/g, ' ')
    .trim();
  return meaningfulText ? content : '';
}

function firstDisplayContent(...values: unknown[]) {
  for (const value of values) {
    const content = displayContent(value);
    if (content) return content;
  }
  return '';
}

function mapSummaryRow(kind: SummaryKind, row: SummaryRow) {
  const primaryField = kind === 'monthly' ? 'work_summary_md' : 'annual_summary_md';
  const display_content_md = firstDisplayContent(row[primaryField], row.content_md);
  return { ...row, [primaryField]: display_content_md, display_content_md };
}

function requestText(body: Record<string, unknown>, snakeCase: string, camelCase: string, legacy = 'contentMd') {
  return String(body[snakeCase] ?? body[camelCase] ?? body[legacy] ?? '');
}

function summaryWriteValues(kind: SummaryKind, body: Record<string, unknown>): ReportSummaryWriteValues {
  if (kind === 'monthly') {
    return {
      content_md: String(body.contentMd ?? ''),
      work_summary_md: requestText(body, 'work_summary_md', 'workSummaryMd'),
      key_projects_md: requestText(body, 'key_projects_md', 'keyProjectsMd', 'keyProjectsMd'),
      issues_plan_md: requestText(body, 'issues_plan_md', 'issuesPlanMd', 'issuesPlanMd'),
    };
  }
  return {
    content_md: String(body.contentMd ?? ''),
    annual_summary_md: requestText(body, 'annual_summary_md', 'annualSummaryMd'),
    achievements_md: requestText(body, 'achievements_md', 'achievementsMd', 'achievementsMd'),
    shortcomings_md: requestText(body, 'shortcomings_md', 'shortcomingsMd', 'shortcomingsMd'),
    next_year_plan_md: requestText(body, 'next_year_plan_md', 'nextYearPlanMd', 'nextYearPlanMd'),
  };
}

function summaryTarget(kind: SummaryKind, year: number, month: number | null): ReportSummaryTarget {
  return { kind, year, month };
}

function mappedSummaryWithBaseline(actorId: number, kind: SummaryKind, target: ReportSummaryTarget, row: SummaryRow | null) {
  const baseline_fingerprint = createReportSummaryBaseFingerprint(actorId, target, row);
  const data = row
    ? mapSummaryRow(kind, row)
    : { year: target.year, ...(target.month ? { month: target.month } : {}), work_summary_md: '', key_projects_md: '', issues_plan_md: '', annual_summary_md: '', achievements_md: '', shortcomings_md: '', next_year_plan_md: '', display_content_md: '' };
  return { ...data, baseline_fingerprint };
}

async function getRecord(req: Request, res: Response, kind: 'monthly' | 'yearly') {
  try {
    const year = numberQuery(req, 'year', new Date().getFullYear());
    const month = kind === 'monthly' ? numberQuery(req, 'month', new Date().getMonth() + 1) : null;
    if (month && month > 12) throw new InvalidSummaryQueryError('month 不合法');
    const table = kind === 'monthly' ? 'monthly_summaries' : 'yearly_summaries';
    const where = kind === 'monthly' ? 'user_id = ? AND year = ? AND month = ?' : 'user_id = ? AND year = ?';
    const args = kind === 'monthly' ? [req.user!.id, year, month] : [req.user!.id, year];
    const row = await queryOne<Record<string, unknown>>(`SELECT * FROM ${table} WHERE ${where}`, args);
    const data = mappedSummaryWithBaseline(Number(req.user!.id), kind, summaryTarget(kind, year, month), row);
    return res.json({ success: true, data });
  } catch (error) {
    return handle(error, res);
  }
}

async function saveRecord(req: Request, res: Response, kind: 'monthly' | 'yearly') {
  try {
    const year = numberQuery(req, 'year', new Date().getFullYear());
    const month = kind === 'monthly' ? numberQuery(req, 'month', new Date().getMonth() + 1) : null;
    if (month && month > 12) throw new InvalidSummaryQueryError('month 不合法');
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body as Record<string, unknown>
      : {};
    const target = summaryTarget(kind, year, month);
    const hasClientRequestId = Object.prototype.hasOwnProperty.call(body, 'client_request_id');
    const rawClientRequestId = body.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    if (hasClientRequestId && (typeof rawClientRequestId !== 'string' || !UUID_PATTERN.test(clientRequestId))) {
      return res.status(400).json({ success: false, message: '总结更新请求编号无效' });
    }
    const values = summaryWriteValues(kind, body);
    if (hasClientRequestId) {
      const rawBaseFingerprint = body.base_fingerprint;
      if (typeof rawBaseFingerprint !== 'string' || !SHA256_FINGERPRINT_PATTERN.test(rawBaseFingerprint)) {
        return res.status(400).json({ success: false, message: '总结原内容指纹无效' });
      }
      try {
        const updated = await updateReportSummaryWithRequest(
          Number(req.user!.id), target, values, clientRequestId, rawBaseFingerprint,
        );
        return res.json({
          success: true,
          data: {
            ...mapSummaryRow(kind, updated.result.row),
            baseline_fingerprint: updated.result.baseline_fingerprint,
          },
        });
      } catch (error) {
        if (error instanceof ReportSummaryUpdateBaseConflictError) {
          return res.status(409).json({
            success: false,
            message: '总结内容已被其他操作更新，请重新加载后再提交。',
            code: 'REPORT_SUMMARY_UPDATE_BASE_CONFLICT',
            base_fingerprint: error.currentFingerprint,
          });
        }
        if (error instanceof ReportSummaryUpdateRequestConflictError) {
          return res.status(409).json({
            success: false,
            message: '总结更新请求编号已用于其他内容或周期，请核实原请求状态。',
            code: 'REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT',
          });
        }
        if (error instanceof ReportSummaryUpdateTargetMissingError) {
          return res.status(404).json({ success: false, message: '总结记录不存在' });
        }
        throw error;
      }
    }

    const table = kind === 'monthly' ? 'monthly_summaries' : 'yearly_summaries';
    if (kind === 'monthly') {
      await execute(
        `INSERT INTO monthly_summaries (user_id, year, month, content_md, work_summary_md, key_projects_md, issues_plan_md, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
         ON CONFLICT(user_id, year, month) DO UPDATE SET content_md = excluded.content_md, work_summary_md = excluded.work_summary_md, key_projects_md = excluded.key_projects_md, issues_plan_md = excluded.issues_plan_md, updated_at = excluded.updated_at`,
        [req.user!.id, year, month, values.content_md, values.work_summary_md, values.key_projects_md, values.issues_plan_md],
      );
    } else {
      await execute(
        `INSERT INTO yearly_summaries (user_id, year, content_md, annual_summary_md, achievements_md, shortcomings_md, next_year_plan_md, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
         ON CONFLICT(user_id, year) DO UPDATE SET content_md = excluded.content_md, annual_summary_md = excluded.annual_summary_md, achievements_md = excluded.achievements_md, shortcomings_md = excluded.shortcomings_md, next_year_plan_md = excluded.next_year_plan_md, updated_at = excluded.updated_at`,
        [req.user!.id, year, values.content_md, values.annual_summary_md, values.achievements_md, values.shortcomings_md, values.next_year_plan_md],
      );
    }
    const where = kind === 'monthly' ? 'user_id = ? AND year = ? AND month = ?' : 'user_id = ? AND year = ?';
    const args = kind === 'monthly' ? [req.user!.id, year, month] : [req.user!.id, year];
    const saved = await queryOne<SummaryRow>(`SELECT * FROM ${table} WHERE ${where}`, args);
    return res.json({ success: true, data: saved ? mapSummaryRow(kind, saved) : null });
  } catch (error) {
    return handle(error, res);
  }
}

async function getUpdateRequestStatus(req: Request, res: Response, kind: SummaryKind) {
  try {
    const year = numberQuery(req, 'year', new Date().getFullYear());
    const month = kind === 'monthly' ? numberQuery(req, 'month', new Date().getMonth() + 1) : null;
    if (month && month > 12) throw new InvalidSummaryQueryError('month 不合法');
    const clientRequestId = String(req.params.requestId || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(clientRequestId)) return res.status(400).json({ status: 'conflict', message: '总结更新请求编号无效' });
    const rawFingerprint = req.query.fingerprint;
    if (typeof rawFingerprint !== 'string' || !SHA256_FINGERPRINT_PATTERN.test(rawFingerprint)) {
      return res.status(400).json({ status: 'conflict', message: '总结更新指纹无效' });
    }
    const target = summaryTarget(kind, year, month);
    const result = await getReportSummaryUpdateRequestStatus(
      Number(req.user!.id), target, clientRequestId, rawFingerprint,
    );
    if (result.status === 'not_found') return res.json(result);
    return res.json({
      status: 'processed',
      data: {
        ...mapSummaryRow(kind, result.result.row),
        baseline_fingerprint: result.result.baseline_fingerprint,
      },
    });
  } catch (error) {
    if (error instanceof InvalidSummaryQueryError) return handle(error, res);
    if (error instanceof ReportSummaryUpdateRequestConflictError) {
      return res.status(409).json({
        status: 'conflict',
        code: 'REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT',
        message: '请求编号对应的总结内容与当前指纹不一致。',
      });
    }
    return handle(error, res);
  }
}

router.get('/monthly/requests/:requestId', (req, res) => getUpdateRequestStatus(req, res, 'monthly'));
router.get('/yearly/requests/:requestId', (req, res) => getUpdateRequestStatus(req, res, 'yearly'));
router.get('/monthly', (req, res) => getRecord(req, res, 'monthly'));
router.put('/monthly', (req, res) => saveRecord(req, res, 'monthly'));
router.get('/yearly', (req, res) => getRecord(req, res, 'yearly'));
router.put('/yearly', (req, res) => saveRecord(req, res, 'yearly'));

router.get('/archive', async (req, res) => {
  if (!isAdmin(req.user!)) return res.status(403).json({ success: false, message: '仅管理员可查看全部总结归档' });
  try {
    const year = numberQuery(req, 'year', new Date().getFullYear());
    const userId = typeof req.query.userId === 'string' && req.query.userId ? Number(req.query.userId) : null;
    const userFilter = userId ? ' AND s.user_id = ?' : '';
    const args = userId ? [year, userId] : [year];
    const monthlyRows = await queryAll<SummaryRow>(`SELECT s.*, u.name AS user_name, u.username FROM monthly_summaries s LEFT JOIN users u ON u.id = s.user_id WHERE s.year = ?${userFilter} ORDER BY s.month DESC, s.updated_at DESC`, args);
    const yearlyRows = await queryAll<SummaryRow>(`SELECT s.*, u.name AS user_name, u.username FROM yearly_summaries s LEFT JOIN users u ON u.id = s.user_id WHERE s.year = ?${userId ? ' AND s.user_id = ?' : ''} ORDER BY s.updated_at DESC`, args);
    const monthly = monthlyRows.map((row) => mapSummaryRow('monthly', row));
    const yearly = yearlyRows.map((row) => mapSummaryRow('yearly', row));
    return res.json({ success: true, data: { year, monthly, yearly } });
  } catch (error) {
    return handle(error, res);
  }
});

router.get('/archive/:kind/:id', async (req, res) => {
  if (!isAdmin(req.user!)) return res.status(403).json({ success: false, message: '仅管理员可查看总结详情' });
  const kind = req.params.kind;
  const id = Number(req.params.id);
  if ((kind !== 'monthly' && kind !== 'yearly') || !Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: '总结详情参数不合法' });
  }
  try {
    const table = kind === 'monthly' ? 'monthly_summaries' : 'yearly_summaries';
    const row = await queryOne<SummaryRow>(`SELECT s.*, u.name AS user_name, u.username FROM ${table} s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`, [id]);
    if (!row) return res.status(404).json({ success: false, message: '总结记录不存在' });
    return res.json({ success: true, data: mapSummaryRow(kind, row) });
  } catch (error) {
    return handle(error, res);
  }
});

export default router;
