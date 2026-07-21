import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { createAuthorizationUrl, completeAuthorization } from '../services/douyin/auth.service.js';
import { requestSync, syncAccount, syncStatistics, syncVideos } from '../services/douyin/data.service.js';
import { getOperationalAnalysis } from '../services/douyin/analysis.service.js';
import { receiveWebhook, verifyWebhook } from '../services/douyin/webhook.service.js';
import { queryAll, queryOne, execute } from '../database/utils.js';

const router = express.Router();

router.get('/oauth/url', authenticate, requirePermission('douyin:account'), (req, res) => {
  try { res.json({ authorization_url: createAuthorizationUrl(req.user!.id) }); }
  catch (error) { res.status(503).json({ message: (error as Error).message }); }
});
// Compatibility alias requested by the original interaction specification.
router.get('/auth/url', authenticate, requirePermission('douyin:account'), (req, res) => {
  try { res.json({ authorization_url: createAuthorizationUrl(req.user!.id) }); }
  catch (error) { res.status(503).json({ message: (error as Error).message }); }
});
router.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code || !state) return res.status(400).send('抖音授权未完成。');
  try { const result = await completeAuthorization(String(code), String(state)); res.send(`抖音账号绑定成功（账号 #${result.accountId}）。请关闭此窗口返回 XMT。`); }
  catch (cause) { res.status(400).send(`抖音账号绑定失败：${(cause as Error).message}`); }
});
router.get('/accounts', authenticate, requirePermission('douyin:view'), async (req, res) => {
  const ownOnly = req.user!.role !== 'admin' && req.user!.role !== 'director';
  const accounts = await queryAll(`SELECT id, user_id, open_id, union_id, nickname, avatar, expires_at, status, created_at, updated_at, (SELECT MAX(created_at) FROM douyin_sync_logs l WHERE l.account_id = douyin_accounts.id) AS last_sync_at FROM douyin_accounts WHERE open_id IS NOT NULL ${ownOnly ? 'AND user_id = ?' : ''} ORDER BY updated_at DESC, created_at DESC`, ownOnly ? [req.user!.id] : []);
  res.json(accounts);
});
router.post('/accounts/bind', authenticate, requirePermission('douyin:account'), (req, res) => {
  try { res.json({ authorization_url: createAuthorizationUrl(req.user!.id) }); }
  catch (error) { res.status(503).json({ message: (error as Error).message }); }
});
router.delete('/accounts/:id', authenticate, requirePermission('douyin:account'), async (req, res) => {
  const account = await queryOne<{ user_id: number }>('SELECT user_id FROM douyin_accounts WHERE id = ?', [req.params.id]);
  if (!account) return res.status(404).json({ message: '账号不存在' });
  if (req.user!.role !== 'admin' && req.user!.role !== 'director' && account.user_id !== req.user!.id) return res.status(403).json({ message: '无权解绑该账号' });
  await execute(`UPDATE douyin_accounts SET status='revoked', access_token_encrypt=NULL, refresh_token_encrypt=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [req.params.id]);
  res.status(204).end();
});
router.get('/videos', authenticate, requirePermission('douyin:view'), async (req, res) => {
  const accountId = req.query.account_id ? Number(req.query.account_id) : null;
  const videos = await queryAll(`SELECT v.*, a.nickname, a.open_id FROM douyin_videos v JOIN douyin_accounts a ON a.id=v.account_id WHERE (? IS NULL OR v.account_id=?) ORDER BY v.publish_time DESC LIMIT 200`, [accountId, accountId]);
  res.json(videos);
});
router.get('/statistics', authenticate, requirePermission('douyin:view'), async (_req, res) => {
  const summary = await queryOne(`SELECT COUNT(DISTINCT a.id) account_count, COUNT(v.id) video_count, COALESCE(SUM(v.play_count),0) play_count, COALESCE(SUM(v.like_count),0) like_count, COALESCE(SUM(v.comment_count),0) comment_count, COALESCE(SUM(v.share_count),0) share_count FROM douyin_accounts a LEFT JOIN douyin_videos v ON v.account_id=a.id WHERE a.status='active'`);
  res.json(summary ?? {});
});
router.post('/sync', authenticate, requirePermission('douyin:sync'), async (req, res) => {
  const accountId = Number(req.body?.account_id); if (!accountId) return res.status(400).json({ message: 'account_id 必填' });
  res.status(202).json(await requestSync(accountId, String(req.body?.sync_type || 'full')));
});
router.post('/sync/account', authenticate, requirePermission('douyin:sync'), async (req, res) => { try { res.json(await syncAccount(Number(req.body?.account_id))); } catch (error) { res.status(400).json({ message: (error as Error).message }); } });
router.post('/sync/videos', authenticate, requirePermission('douyin:sync'), async (req, res) => { try { res.json(await syncVideos(Number(req.body?.account_id))); } catch (error) { res.status(400).json({ message: (error as Error).message }); } });
router.post('/sync/statistics', authenticate, requirePermission('douyin:sync'), async (req, res) => { try { res.json(await syncStatistics(Number(req.body?.account_id))); } catch (error) { res.status(400).json({ message: (error as Error).message }); } });
router.get('/analysis', authenticate, requirePermission('douyin:view'), async (req, res) => { res.json(await getOperationalAnalysis(req.query.account_id ? Number(req.query.account_id) : undefined)); });
router.post('/webhook', async (req, res) => {
  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody?.toString('utf8') || JSON.stringify(req.body ?? {});
  if (!verifyWebhook(rawBody, req.header('X-Douyin-Signature') || undefined)) return res.status(401).json({ message: 'Webhook 验签失败' });
  const event = JSON.parse(rawBody || '{}') as Record<string, unknown>;
  if (event.event === 'verify_webhook') return res.type('text/plain').send(JSON.stringify({ challenge: (event.content as { challenge?: unknown } | undefined)?.challenge }));
  await receiveWebhook(event); res.status(204).end();
});
export default router;
