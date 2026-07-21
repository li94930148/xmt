import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { getDailyReportById, getDailyWorkReference, listDailyReportArchive, saveDailyReportDraft } from '../services/dailyReports.js';

const router = express.Router();
router.use(authenticate);

router.get('/daily-summary', async (req, res, next) => { try { res.json({ success: true, data: await getDailyWorkReference(req.user, typeof req.query.date === 'string' ? req.query.date : undefined) }); } catch (error) { next(error); } });
router.get('/', requirePermission('report:view'), async (req, res, next) => { try { const date = typeof req.query.date === 'string' ? req.query.date : undefined; const result = await listDailyReportArchive(req.user, { start: date, end: date }); res.json({ success: true, data: result.reports }); } catch (error) { next(error); } });
router.post('/', requirePermission('report:create'), async (req, res, next) => { try { res.status(201).json({ success: true, data: await saveDailyReportDraft(req.user, req.body) }); } catch (error) { next(error); } });
router.get('/:id', requirePermission('report:view'), async (req, res, next) => { try { res.json({ success: true, data: await getDailyReportById(req.user, Number(req.params.id)) }); } catch (error) { next(error); } });
router.put('/:id', requirePermission('report:create'), async (req, res, next) => { try { const existing = await getDailyReportById(req.user, Number(req.params.id)); if (!existing) return res.status(404).json({ success: false, message: '日报不存在' }); if (existing.userId !== req.user?.id) return res.status(403).json({ success: false, message: '只能编辑自己的日报' }); res.json({ success: true, data: await saveDailyReportDraft(req.user, { ...req.body, version: existing.version, reportDate: existing.reportDate }) }); } catch (error) { next(error); } });
export default router;
