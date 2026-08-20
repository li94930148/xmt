import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../../database/utils.js';
import { getDouyinConfig } from './constants.js';
export function verifyWebhook(rawBody: string, signature?: string) {
  const secret = getDouyinConfig().webhookSecret;
  if (!secret || !signature || !/^[a-f0-9]+$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (signature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
export async function receiveWebhook(event: Record<string, unknown>) { const eventId = String(event.event_id || event.log_id || crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex')); const exists = await queryOne('SELECT id FROM douyin_webhook_events WHERE event_id = ?', [eventId]); if (exists) return { duplicate: true }; await execute(`INSERT INTO douyin_webhook_events (event_id, event_type, payload) VALUES (?, ?, ?)`, [eventId, String(event.event || 'unknown'), JSON.stringify(event)]); return { duplicate: false }; }

/** Worker entrypoint: the webhook request only persists an event; this worker owns data changes. */
export async function processPendingWebhookEvents() {
  const events = await queryAll<{ id: number; payload: string }>(`SELECT id, payload FROM douyin_webhook_events WHERE status='received' ORDER BY id ASC LIMIT 50`);
  for (const event of events) {
    try {
      await execute(`UPDATE douyin_webhook_events SET status='processing' WHERE id=?`, [event.id]);
      JSON.parse(event.payload);
      await execute(`UPDATE douyin_webhook_events SET status='processed', processed_at=CURRENT_TIMESTAMP WHERE id=?`, [event.id]);
    } catch { await execute(`UPDATE douyin_webhook_events SET status='failed' WHERE id=?`, [event.id]); }
  }
}
