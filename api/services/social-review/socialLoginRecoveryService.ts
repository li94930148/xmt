import { randomUUID } from 'node:crypto';
import { execute, queryOne } from '../../database/utils.js';
import { bindRemoteLoginSession, detectServerLogin, openServerBrowser, releaseRemoteLoginSession } from './serverBrowserService.js';
import { startBrowserStream, stopBrowserStream } from './browserStreamService.js';

export type LoginSessionStatus = 'waiting_scan' | 'scanned' | 'manual_verify_required' | 'auth_required' | 'success' | 'failed' | 'expired';
type Session = { id: string; account_id: number; status: LoginSessionStatus; created_at: string; updated_at: string; expired_at: string };
const activeStatuses = "'waiting_scan', 'scanned', 'manual_verify_required', 'auth_required'";
async function expireSessions() { await execute(`UPDATE social_login_sessions SET status = 'expired', updated_at = datetime('now', '+8 hours') WHERE status IN (${activeStatuses}) AND expired_at < datetime('now', '+8 hours')`); }

// The database only holds login-session metadata. Browser profiles, cookies and credentials remain in Playwright and are never read or returned.
export async function startSocialLoginRecovery(accountId: number, ownerUserId: number) {
  await expireSessions();
  await execute(`UPDATE social_login_sessions SET status = 'expired', updated_at = datetime('now', '+8 hours') WHERE account_id = ? AND status IN (${activeStatuses})`, [accountId]);
  const id = randomUUID();
  await execute(`INSERT INTO social_login_sessions (id, account_id, status, created_at, updated_at, expired_at) VALUES (?, ?, 'waiting_scan', datetime('now', '+8 hours'), datetime('now', '+8 hours'), datetime('now', '+8 hours', '+10 minutes'))`, [id, accountId]);
  try { await openServerBrowser(accountId, true); await bindRemoteLoginSession(id, accountId, ownerUserId); } catch { await execute(`UPDATE social_login_sessions SET status='failed',updated_at=datetime('now','+8 hours') WHERE id=?`, [id]); return { sessionId: id, status: 'failed' as const }; }
  startBrowserStream(id, ownerUserId);
  return { sessionId: id, status: 'waiting_scan' as const, streamReady: true };
}

export async function getSocialLoginRecovery(id: string) {
  await expireSessions(); const session = await queryOne<Session>(`SELECT id, account_id, status, created_at, updated_at, expired_at FROM social_login_sessions WHERE id = ?`, [id]); if (!session) return null;
  if (['waiting_scan', 'scanned', 'manual_verify_required', 'auth_required'].includes(session.status)) { const login = await detectServerLogin(Number(session.account_id)); if (login === 'logged_in') { await execute(`UPDATE social_login_sessions SET status='success',updated_at=datetime('now','+8 hours') WHERE id=?`, [id]); await execute(`UPDATE social_credentials SET status='active',last_success_time=datetime('now','+8 hours'),updated_at=datetime('now','+8 hours') WHERE account_id=?`, [session.account_id]); session.status = 'success'; } }
  const manual = session.status === 'manual_verify_required' || session.status === 'auth_required';
  return { sessionId: session.id, accountId: Number(session.account_id), status: session.status, message: session.status === 'waiting_scan' ? '请在远程浏览器中完成扫码登录。' : manual ? '当前需要人工验证，请在远程浏览器中完成。' : null };
}

export async function cancelSocialLoginRecovery(id: string) { await execute(`UPDATE social_login_sessions SET status = 'failed', updated_at = datetime('now', '+8 hours') WHERE id = ? AND status IN (${activeStatuses})`, [id]); stopBrowserStream(id); releaseRemoteLoginSession(id); return getSocialLoginRecovery(id); }
