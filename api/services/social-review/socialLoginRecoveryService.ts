import { randomUUID } from 'node:crypto';
import { execute, queryOne } from '../../database/utils.js';
import { detectServerLogin, openServerBrowser } from './serverBrowserService.js';
import { startBrowserStream, stopBrowserStream } from './browserStreamService.js';

export type LoginSessionStatus = 'waiting_scan' | 'scanned' | 'success' | 'failed' | 'expired';
type Session = { id: string; account_id: number; status: LoginSessionStatus; created_at: string; updated_at: string; expired_at: string };

async function expireSessions() {
  await execute(`UPDATE social_login_sessions SET status = 'expired', updated_at = datetime('now', '+8 hours') WHERE status IN ('waiting_scan', 'scanned') AND expired_at < datetime('now', '+8 hours')`);
}

// Login is intentionally operator-driven. This service stores only session metadata;
// Playwright/browser storage, cookies and tokens are never read or persisted.
export async function startSocialLoginRecovery(accountId: number) {
  await expireSessions();
  await execute(`UPDATE social_login_sessions SET status = 'expired', updated_at = datetime('now', '+8 hours') WHERE account_id = ? AND status IN ('waiting_scan', 'scanned')`, [accountId]);
  const id = randomUUID();
  await execute(`INSERT INTO social_login_sessions (id, account_id, status, created_at, updated_at, expired_at) VALUES (?, ?, 'waiting_scan', datetime('now', '+8 hours'), datetime('now', '+8 hours'), datetime('now', '+8 hours', '+10 minutes'))`, [id, accountId]);
  try { await openServerBrowser(accountId, true); } catch { await execute(`UPDATE social_login_sessions SET status='failed',updated_at=datetime('now','+8 hours') WHERE id=?`,[id]); return { sessionId: id, status: 'failed' as const }; }
  startBrowserStream(id, accountId);
  return { sessionId: id, status: 'waiting_scan' as const, streamReady: true };
}

export async function getSocialLoginRecovery(id: string) {
  await expireSessions();
  const session = await queryOne<Session>(`SELECT id, account_id, status, created_at, updated_at, expired_at FROM social_login_sessions WHERE id = ?`, [id]);
  if (!session) return null;
  if (session.status === 'waiting_scan' || session.status === 'scanned') { const login = await detectServerLogin(Number(session.account_id)); if (login === 'logged_in') { await execute(`UPDATE social_login_sessions SET status='success',updated_at=datetime('now','+8 hours') WHERE id=?`,[id]); await execute(`UPDATE social_credentials SET status='active',last_success_time=datetime('now','+8 hours'),updated_at=datetime('now','+8 hours') WHERE account_id=?`,[session.account_id]); session.status='success'; } }
  return { sessionId: session.id, accountId: Number(session.account_id), status: session.status, message: session.status === 'waiting_scan' ? '请在管理员打开的抖音创作者中心窗口完成扫码。' : null };
}

export async function cancelSocialLoginRecovery(id: string) {
  await execute(`UPDATE social_login_sessions SET status = 'failed', updated_at = datetime('now', '+8 hours') WHERE id = ? AND status IN ('waiting_scan', 'scanned')`, [id]);
  stopBrowserStream(id); return getSocialLoginRecovery(id);
}
