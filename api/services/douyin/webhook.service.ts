import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../../database/utils.js';
import { getDouyinConfig } from './constants.js';
import { requestSync } from './data.service.js';
export function verifyWebhook(rawBody: string, signature?: string) { const secret = getDouyinConfig().webhookSecret; if (!secret) return process.env.NODE_ENV !== 'production'; if (!signature) return false; const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex'); return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); }
export async function receiveWebhook(event: Record<string, unknown>) { const eventId = String(event.event_id || event.log_id || crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex')); const exists = await queryOne('SELECT id FROM douyin_webhook_events WHERE event_id = ?', [eventId]); if (exists) return { duplicate: true }; await execute(`INSERT INTO douyin_webhook_events (event_id, event_type, payload) VALUES (?, ?, ?)`, [eventId, String(event.event || 'unknown'), JSON.stringify(event)]); return { duplicate: false }; }

/** Worker entrypoint: the webhook request only persists an event; this worker owns data changes. */
export async function processPendingWebhookEvents() {
  const events = await queryAll<{ id: number; payload: string }>(`SELECT id, payload FROM douyin_webhook_events WHERE status='received' ORDER BY id ASC LIMIT 50`);
  for (const event of events) {
    try {
      await execute(`UPDATE douyin_webhook_events SET status='processing' WHERE id=?`, [event.id]);
      const payload = JSON.parse(event.payload) as { open_id?: string; content?: { open_id?: string } };
      const openId = payload.open_id || payload.content?.open_id;
      const account = openId ? await queryOne<{ id: number }>(`SELECT id FROM douyin_accounts WHERE open_id=? AND status='active'`, [openId]) : null;
      if (account) await requestSync(account.id, 'full');
      await execute(`UPDATE douyin_webhook_events SET status='processed', processed_at=CURRENT_TIMESTAMP WHERE id=?`, [event.id]);
    } catch (error) { await execute(`UPDATE douyin_webhook_events SET status='failed' WHERE id=?`, [event.id]); }
  }
}
