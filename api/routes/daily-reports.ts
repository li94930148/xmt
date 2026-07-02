import express, { type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  DailyReportServiceError,
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
  try {
    const body = req.body as { date?: string };
    const result = await generateDailyReportDraft(req.user, body.date || getQueryString(req, 'date'));
    res.json({ success: true, data: result });
  } catch (error) {
    handleDailyReportError(error, res);
  }
});

export default router;
