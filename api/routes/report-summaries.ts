import express, { type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { execute, queryAll, queryOne } from '../database/utils.js';

const router = express.Router();
router.use(authenticate);

function numberQuery(req: Request, key: string, fallback: number) {
  const value = Number(req.query[key] || fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`参数 ${key} 不合法`);
  return value;
}

function isAdmin(user: NonNullable<Request['user']>) {
  return user.role === 'admin' || user.role === 'director';
}

function handle(error: unknown, res: Response) {
  res.status(400).json({ success: false, message: error instanceof Error ? error.message : '总结请求失败' });
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

async function getRecord(req: Request, res: Response, kind: 'monthly' | 'yearly') {
  try {
    const year = numberQuery(req, 'year', new Date().getFullYear());
    const month = kind === 'monthly' ? numberQuery(req, 'month', new Date().getMonth() + 1) : null;
    if (month && month > 12) throw new Error('month 不合法');
    const table = kind === 'monthly' ? 'monthly_summaries' : 'yearly_summaries';
    const where = kind === 'monthly' ? 'user_id = ? AND year = ? AND month = ?' : 'user_id = ? AND year = ?';
    const args = kind === 'monthly' ? [req.user!.id, year, month] : [req.user!.id, year];
    const row = await queryOne<Record<string, unknown>>(`SELECT * FROM ${table} WHERE ${where}`, args);
    const data = row
      ? mapSummaryRow(kind, row)
      : { year, ...(month ? { month } : {}), work_summary_md: '', key_projects_md: '', issues_plan_md: '', annual_summary_md: '', achievements_md: '', shortcomings_md: '', next_year_plan_md: '', display_content_md: '' };
    return res.json({ success: true, data });
  } catch (error) {
    return handle(error, res);
  }
}

async function saveRecord(req: Request, res: Response, kind: 'monthly' | 'yearly') {
  try {
    const year = numberQuery(req, 'year', new Date().getFullYear());
    const month = kind === 'monthly' ? numberQuery(req, 'month', new Date().getMonth() + 1) : null;
    if (month && month > 12) throw new Error('month 不合法');
    const body = req.body || {};
    const table = kind === 'monthly' ? 'monthly_summaries' : 'yearly_summaries';
    if (kind === 'monthly') {
      await execute(
        `INSERT INTO monthly_summaries (user_id, year, month, content_md, work_summary_md, key_projects_md, issues_plan_md, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
         ON CONFLICT(user_id, year, month) DO UPDATE SET content_md = excluded.content_md, work_summary_md = excluded.work_summary_md, key_projects_md = excluded.key_projects_md, issues_plan_md = excluded.issues_plan_md, updated_at = excluded.updated_at`,
        [req.user!.id, year, month, String(body.contentMd ?? ''), requestText(body, 'work_summary_md', 'workSummaryMd'), requestText(body, 'key_projects_md', 'keyProjectsMd', 'keyProjectsMd'), requestText(body, 'issues_plan_md', 'issuesPlanMd', 'issuesPlanMd')],
      );
    } else {
      await execute(
        `INSERT INTO yearly_summaries (user_id, year, content_md, annual_summary_md, achievements_md, shortcomings_md, next_year_plan_md, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
         ON CONFLICT(user_id, year) DO UPDATE SET content_md = excluded.content_md, annual_summary_md = excluded.annual_summary_md, achievements_md = excluded.achievements_md, shortcomings_md = excluded.shortcomings_md, next_year_plan_md = excluded.next_year_plan_md, updated_at = excluded.updated_at`,
        [req.user!.id, year, String(body.contentMd ?? ''), requestText(body, 'annual_summary_md', 'annualSummaryMd'), requestText(body, 'achievements_md', 'achievementsMd', 'achievementsMd'), requestText(body, 'shortcomings_md', 'shortcomingsMd', 'shortcomingsMd'), requestText(body, 'next_year_plan_md', 'nextYearPlanMd', 'nextYearPlanMd')],
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

export default router;
