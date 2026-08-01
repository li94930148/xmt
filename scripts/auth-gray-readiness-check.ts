import fs from 'node:fs';
import path from 'node:path';
import { queryAll } from '../api/database/utils.js';
import { assessAuthGrayReadiness } from '../api/modules/auth/rollout/auth-gray-readiness.js';

const ids = (process.env.XMT_AUTH_WEB_ALLOWLIST_USER_IDS || '').split(',').map(Number).filter(Number.isSafeInteger);
const users = ids.length ? await queryAll<{ id: number; role: string; enabled: number }>(`SELECT id, role, enabled FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids) : [];
const result = assessAuthGrayReadiness({
  authV1Enabled: process.env.XMT_AUTH_V1_ENABLED === 'true', authWebEnabled: process.env.XMT_AUTH_WEB_ENABLED === 'true',
  loginRolloutEnabled: process.env.XMT_LOGIN_ROLLOUT_ENABLED === 'true', socketBridgeEnabled: process.env.XMT_SOCKET_AUTH_BRIDGE_ENABLED === 'true',
  socketBridgeApproved: process.env.XMT_SOCKET_BRIDGE_APPROVED === 'true', mode: process.env.XMT_AUTH_ROLLOUT_MODE || 'legacy',
  users: users.map((user) => ({ ...user, enabled: Boolean(user.enabled) })), browserFixture: fs.existsSync(path.resolve('docs/AUTH_BROWSER_GRAY_FIXTURE.md')),
  rollbackReady: fs.existsSync('/root/xmt-auth-gray-config-backups') || fs.existsSync('emergency-backup'), observationWindowMinutes: Number(process.env.XMT_AUTH_GRAY_WINDOW_MINUTES || 0),
});
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.overall === 'READY' ? 0 : 1;
