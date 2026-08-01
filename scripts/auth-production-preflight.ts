import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import packageJson from '../package.json' with { type: 'json' };
import { readSocketProductionBridgeGate } from '../api/modules/auth/socket/socket-production-gate.js';
import { readLoginRolloutPolicyConfig } from '../api/modules/auth/rollout/login-rollout-policy.js';

function gitCommit(): string | null {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; }
}

function databaseHealth(databasePath: string): { exists: boolean; quickCheck: string | null } {
  if (!fs.existsSync(databasePath)) return { exists: false, quickCheck: null };
  try {
    const output = execFileSync('sqlite3', [databasePath, 'PRAGMA quick_check;'], { encoding: 'utf8' }).trim();
    return { exists: true, quickCheck: output };
  } catch { return { exists: true, quickCheck: null }; }
}

function newestBackupAt(directory: string): string | null {
  if (!fs.existsSync(directory)) return null;
  const timestamps = fs.readdirSync(directory)
    .map((name) => fs.statSync(path.join(directory, name)))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.mtimeMs);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

const databasePath = process.env.XMT_DB_PATH || path.join(process.cwd(), 'data/xmt.db');
const backupDirectory = process.env.XMT_BACKUP_DIR || path.join(process.cwd(), 'emergency-backup');
const database = databaseHealth(databasePath);
const backupAt = newestBackupAt(backupDirectory);
const login = readLoginRolloutPolicyConfig();
const socketBridge = readSocketProductionBridgeGate();

const report = {
  version: packageJson.version,
  commit: gitCommit(),
  database: { path: databasePath, ...database },
  backupAt,
  loginRollout: { enabled: login.enabled, mode: login.mode, productionApproved: login.productionApproved, allowlistCount: login.allowlistedUserIds.size },
  socketBridge,
};
console.log(JSON.stringify(report, null, 2));

if (!database.exists || database.quickCheck !== 'ok' || !backupAt) {
  process.exitCode = 1;
}
