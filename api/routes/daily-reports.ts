import express, { type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { execute, executeInsert, queryAll, queryOne } from '../database/utils.js';
import {
  DailyReportServiceError,
  autosaveDailyReport,
  generateDailyReportDraft,
  getMyDailyReport,
  listDailyReportArchive,
  listTeamDailyReports,
  reviewDailyReport,
  saveDailyReportDraft,
  submitDailyReport,
} from '../services/dailyReports.js';
import type { DailyReportStatus, ReviewDailyReportInput, SaveDailyReportDraftInput } from '../types/dailyReports.js';

const router = express.Router();

router.use(authenticate);

function getQueryString(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === 'string' ? value : undefined;
}

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new DailyReportServiceError(400, 'INVALID_ID', 'ID 不合法');
  }
  return id;
}

function handleDailyReportError(error: unknown, res: Response) {
  if (error instanceof DailyReportServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  console.error('[DailyReports] unexpected error:', error);
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: '日报服务异常',
  });
}

router.get('/me', async (req, res) => {
  try {
    const result = await getMyDailyReport(req.user, getQueryString(req, 'date'));
    res.json({ success: true, data: result });
  } catch (error) {
    handleDailyReportError(error, res);
  }
});

router.post('/draft', async (req, res) => {
  try {
    const result = await saveDailyReportDraft(req.user, req.body as SaveDailyReportDraftInput);
    res.json({ success: true, data: result });
  } catch (error) {
    handleDailyReportError(error, res);
  }
});

router.post('/autosave', async (req, res) => {
  try {
    const result = await autosaveDailyReport(req.user, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    handleDailyReportError(error, res);
  }
});

router.get('/templates', async (req, res) => {
  try {
    const rows = await queryAll(`SELECT id, name, description, sections_json, is_default, sort_order, user_id, created_at, updated_at FROM daily_report_templates WHERE active = 1 AND (is_default = 1 OR user_id = ?) ORDER BY is_default DESC, sort_order ASC, id ASC`, [req.user!.id]);
    res.json({ success: true, data: rows.map((row: any) => ({ ...row, sections: JSON.parse(row.sections_json || '[]'), isDefault: Boolean(row.is_default), userId: row.user_id ? Number(row.user_id) : null })) });
  } catch (error) { handleDailyReportError(error, res); }
});

router.post('/templates', requirePermission('report:template:create'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: '模板名称不能为空' });
    const id = await executeInsert(`INSERT INTO daily_report_templates (name, description, sections_json, is_default, sort_order, user_id, active, created_by, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, 1, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [name, String(req.body?.description || ''), JSON.stringify(req.body?.sections || []), Number(req.body?.sortOrder || 0), req.user!.id, req.user!.id]);
    const row = await queryOne(`SELECT id, name, description, sections_json, is_default, sort_order, user_id FROM daily_report_templates WHERE id = ?`, [id]);
    res.status(201).json({ success: true, data: row });
  } catch (error) { handleDailyReportError(error, res); }
});

router.put('/templates/:id', requirePermission('report:template:update'), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const existing = await queryOne<any>(`SELECT * FROM daily_report_templates WHERE id = ? AND active = 1`, [id]);
    if (!existing || (existing.user_id && Number(existing.user_id) !== req.user!.id && req.user!.role !== 'admin')) return res.status(404).json({ success: false, message: '模板不存在或无权修改' });
    await execute(`UPDATE daily_report_templates SET name = ?, description = ?, sections_json = ?, sort_order = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [String(req.body?.name || existing.name), String(req.body?.description ?? existing.description ?? ''), JSON.stringify(req.body?.sections || JSON.parse(existing.sections_json || '[]')), Number(req.body?.sortOrder ?? existing.sort_order ?? 0), id]);
    res.json({ success: true, data: await queryOne(`SELECT id, name, description, sections_json, is_default, sort_order, user_id FROM daily_report_templates WHERE id = ?`, [id]) });
  } catch (error) { handleDailyReportError(error, res); }
});

router.delete('/templates/:id', requirePermission('report:template:delete'), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const existing = await queryOne<any>(`SELECT user_id, is_default FROM daily_report_templates WHERE id = ? AND active = 1`, [id]);
    if (!existing || existing.is_default || (existing.user_id && Number(existing.user_id) !== req.user!.id && req.user!.role !== 'admin')) return res.status(404).json({ success: false, message: '模板不存在或不可删除' });
    await execute(`UPDATE daily_report_templates SET active = 0, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [id]);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { handleDailyReportError(error, res); }
});

router.post('/:id/submit', async (req, res) => {
  try {
    const result = await submitDailyReport(req.user, parseId(req.params.id));
    res.json({ success: true, data: result });
  } catch (error) {
    handleDailyReportError(error, res);
  }
});

router.get('/team', requirePermission('report:daily:view_team'), async (req, res) => {
  try {
    const result = await listTeamDailyReports(req.user, {
      reportDate: getQueryString(req, 'date'),
      status: getQueryString(req, 'status') as DailyReportStatus | undefined,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    handleDailyReportError(error, res);
  }
});

router.post('/:id/review', requirePermission('report:daily:review'), async (req, res) => {
  try {
    const result = await reviewDailyReport(req.user, parseId(req.params.id), req.body as ReviewDailyReportInput);
    res.json({ success: true, data: result });
  } catch (error) {
    handleDailyReportError(error, res);
  }
});

router.get('/archive', async (req, res) => {
  try {
    const userId = getQueryString(req, 'userId');
    const result = await listDailyReportArchive(req.user, {
      start: getQueryString(req, 'start'),
      end: getQueryString(req, 'end'),
      userId: userId ? Number(userId) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    handleDailyReportError(error, res);
  }
});

router.post('/generate-draft', async (req, res) => {
  void req;
  res.status(410).json({ success: false, code: 'REPORT_MANUAL_ONLY', message: '日报为独立办公模块，仅支持员工手动填写，不读取任何业务数据。' });
});

export default router;
