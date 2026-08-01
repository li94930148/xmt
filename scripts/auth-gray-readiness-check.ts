import fs from 'node:fs';
import path from 'node:path';
import { assessAuthGrayReadiness } from '../api/modules/auth/rollout/auth-gray-readiness.js';

type RuntimeDiagnostic = {
  effectiveAuthV1Enabled: boolean; effectiveAuthWebEnabled: boolean;
  effectiveLoginRolloutEnabled: boolean; effectiveRolloutMode: string;
  effectiveSocketBridgeEnabled: boolean; socketBridgeApproval: boolean;
  allowlistCount: number; allowlistedUserIds: number[]; observationWindowMinutes: number;
};

async function runtimeDiagnostic(): Promise<RuntimeDiagnostic | null> {
  const url = process.env.XMT_AUTH_RUNTIME_STATUS_URL || 'http://127.0.0.1:3001/internal/auth-rollout/runtime';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    const body = await response.json() as { runtime?: RuntimeDiagnostic };
    return response.ok && body.runtime ? body.runtime : null;
  } catch { return null; }
}

const runtime = await runtimeDiagnostic();
const ids = runtime?.allowlistedUserIds ?? [];
const users = ids.length
  ? await (await import('../api/database/utils.js')).queryAll<{ id: number; role: string; enabled: number }>(
    `SELECT id, role, enabled FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids,
  )
  : [];
const result = assessAuthGrayReadiness({
  authV1Enabled: runtime?.effectiveAuthV1Enabled ?? false, authWebEnabled: runtime?.effectiveAuthWebEnabled ?? false,
  loginRolloutEnabled: runtime?.effectiveLoginRolloutEnabled ?? false, socketBridgeEnabled: runtime?.effectiveSocketBridgeEnabled ?? false,
  socketBridgeApproved: runtime?.socketBridgeApproval ?? false, mode: runtime?.effectiveRolloutMode || 'legacy',
  users: users.map((user) => ({ ...user, enabled: Boolean(user.enabled) })), browserFixture: fs.existsSync(path.resolve('docs/AUTH_BROWSER_GRAY_FIXTURE.md')),
  rollbackReady: fs.existsSync('/root/xmt-auth-gray-config-backups') || fs.existsSync('emergency-backup'), observationWindowMinutes: runtime?.observationWindowMinutes ?? 0, runtimeReachable: Boolean(runtime),
});
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.overall === 'READY' ? 0 : 1;
