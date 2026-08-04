import express, { type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { execute, queryAll, queryOne } from '../database/utils.js';

const router = express.Router();
router.use(authenticate);
const submittedStatuses = `('submitted', 'approved', 'archived')`;

function numberQuery(req: Request, key: string, fallback: number) {
  const value = Number(req.query[key] || fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`参数 ${key} 不合法`);
  return value;
}
function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end, days: Number(end.slice(8, 10)) };
}
function keywords(rows: Array<{ manual_summary_md?: string | null }>) {
  const stop = new Set(['今天', '工作', '完成', '日报', '以及', '进行']);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const words = String(row.manual_summary_md || '').match(/[\u4e00-\u9fa5]{2,6}|[A-Za-z]{3,}/g) || [];
    for (const word of words) if (!stop.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word, count]) => ({ word, count }));
}
function maxStreak(dates: string[]) {
  const set = new Set(dates);
  let best = 0;
  for (const date of dates) {
    const previous = new Date(`${date}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    if (set.has(previous.toISOString().slice(0, 10))) continue;
    let current = 1;
    const cursor = new Date(`${date}T00:00:00Z`);
    while (true) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (!set.has(cursor.toISOString().slice(0, 10))) break;
      current += 1;
    }
    best = Math.max(best, current);
  }
  return best;
}
function handle(error: unknown, res: Response) {
  res.status(400).json({ success: false, message: error instanceof Error ? error.message : '日报统计请求失败' });
}

router.get('/monthly', async (req, res) => {
  try {
    const year = numberQuery(req, 'year', new Date().getFullYear());
    const month = numberQuery(req, 'month', new Date().getMonth() + 1);
    if (month > 12) throw new Error('month 不合法');
    const range = monthRange(year, month);
    const rows = await queryAll<Record<string, any>>(
      `SELECT r.report_date, r.status, r.risk_level, r.manual_summary_md FROM daily_reports r WHERE r.user_id = ? AND r.report_date BETWEEN ? AND ? ORDER BY r.report_date`,
      [req.user!.id, range.start, range.end]
    );
    const submitted = rows.filter((row) => submittedStatuses.includes(`'${row.status}'`));
    const dates = submitted.map((row) => String(row.report_date));
    return res.json({ success: true, data: { year, month, days: range.days, submitted: submitted.length, rate: Math.round((submitted.length / range.days) * 100), riskDays: rows.filter((row) => row.risk_level && row.risk_level !== 'normal').length, keywords: keywords(rows), streaks: maxStreak(dates), reports: rows } });
  } catch (error) { handle(error, res); }
});

router.get('/yearly', async (req, res) => {
  try {
    const year = numberQuery(req, 'year', new Date().getFullYear());
    const rows = await queryAll<Record<string, any>>(`SELECT report_date, status, risk_level, manual_summary_md FROM daily_reports WHERE user_id = ? AND report_date BETWEEN ? AND ? ORDER BY report_date`, [req.user!.id, `${year}-01-01`, `${year}-12-31`]);
    const submitted = rows.filter((row) => submittedStatuses.includes(`'${row.status}'`));
    const months = Array.from({ length: 12 }, (_, index) => { const month = index + 1; const monthRows = submitted.filter((row) => Number(String(row.report_date).slice(5, 7)) === month); return { month, submitted: monthRows.length, rate: Math.round((monthRows.length / new Date(year, month, 0).getDate()) * 100) }; });
    return res.json({ success: true, data: { year, totalDays: new Date(year, 1, 29).getMonth() === 1 ? 366 : 365, submitted: submitted.length, rate: Math.round((submitted.length / (new Date(year, 1, 29).getMonth() === 1 ? 366 : 365)) * 100), months, keywords: keywords(rows), maxStreak: maxStreak(submitted.map((row) => String(row.report_date))) } });
  } catch (error) { handle(error, res); }
});

async function note(req: Request, res: Response, kind: 'monthly' | 'yearly', write: boolean) {
  try {
    const year = numberQuery(req, 'year', new Date().getFullYear());
    const month = kind === 'monthly' ? numberQuery(req, 'month', new Date().getMonth() + 1) : null;
    if (month && month > 12) throw new Error('month 不合法');
    const table = kind === 'monthly' ? 'monthly_summaries' : 'yearly_summaries';
    const where = kind === 'monthly' ? 'user_id = ? AND year = ? AND month = ?' : 'user_id = ? AND year = ?';
    const args = kind === 'monthly' ? [req.user!.id, year, month] : [req.user!.id, year];
    if (write) {
      const content = String(req.body?.contentMd || '');
      const columns = kind === 'monthly' ? 'user_id, year, month, content_md, created_at, updated_at' : 'user_id, year, content_md, created_at, updated_at';
      const values = kind === 'monthly' ? '?, ?, ?, ?, datetime(\'now\', \'+8 hours\'), datetime(\'now\', \'+8 hours\')' : '?, ?, ?, datetime(\'now\', \'+8 hours\'), datetime(\'now\', \'+8 hours\')';
      const conflict = kind === 'monthly' ? 'user_id, year, month' : 'user_id, year';
      await execute(`INSERT INTO ${table} (${columns}) VALUES (${values}) ON CONFLICT(${conflict}) DO UPDATE SET content_md = excluded.content_md, updated_at = excluded.updated_at`, [...args, content]);
    }
    const row = await queryOne(`SELECT year, ${kind === 'monthly' ? 'month,' : ''} content_md, ai_summary_json, updated_at FROM ${table} WHERE ${where}`, args);
    return res.json({ success: true, data: row || { year, ...(month ? { month } : {}), contentMd: '', aiSummary: null } });
  } catch (error) { handle(error, res); }
}
router.get('/monthly-note', (req, res) => note(req, res, 'monthly', false));
router.put('/monthly-note', (req, res) => note(req, res, 'monthly', true));
router.get('/yearly-note', (req, res) => note(req, res, 'yearly', false));
router.put('/yearly-note', (req, res) => note(req, res, 'yearly', true));

router.get('/calendar', async (req, res) => {
  try {
    const year = numberQuery(req, 'year', new Date().getFullYear());
    const month = numberQuery(req, 'month', new Date().getMonth() + 1);
    const range = monthRange(year, month);
    const rows = await queryAll<Record<string, any>>(`SELECT report_date, status, risk_level FROM daily_reports WHERE user_id = ? AND report_date BETWEEN ? AND ?`, [req.user!.id, range.start, range.end]);
    const byDate = new Map(rows.map((row) => [String(row.report_date), row]));
    const data = Array.from({ length: range.days }, (_, index) => { const date = `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`; const row = byDate.get(date); return { date, status: row?.status || null, riskLevel: row?.risk_level || null }; });
    return res.json({ success: true, data });
  } catch (error) { handle(error, res); }
});

router.get('/team-stats', requirePermission('report:daily:view_team'), async (req, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const users = await queryAll<Record<string, any>>(`SELECT u.id, u.name, u.username, r.status, r.risk_level, r.manual_summary_md FROM users u LEFT JOIN daily_reports r ON r.user_id = u.id AND r.report_date = ? WHERE u.enabled = 1 ORDER BY u.name, u.username`, [date]);
    const submitted = users.filter((row) => submittedStatuses.includes(`'${row.status}'`));
    return res.json({ success: true, data: { total: users.length, submitted: submitted.length, pending: users.filter((row) => row.status === 'submitted').length, notSubmitted: users.filter((row) => !row.status).length, users: users.map((row) => ({ id: Number(row.id), name: row.name || row.username, status: row.status || null, riskLevel: row.risk_level || null, summary: row.manual_summary_md || '' })) } });
  } catch (error) { handle(error, res); }
});

export default router;
