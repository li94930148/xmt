import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const backup = process.argv.find((arg) => arg.startsWith('--backup='))?.slice(9);
const checks: Record<string, { status: 'PASS' | 'FAIL'; reason?: string }> = {};
let tempDir: string | undefined;
try {
  if (!backup || !path.isAbsolute(backup) || !fs.existsSync(backup)) throw new Error('必须提供存在的绝对 --backup 路径');
  checks.file = { status: 'PASS' }; tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-restore-drill-'));
  const copy = path.join(tempDir, 'restore.db'); fs.copyFileSync(backup, copy);
  execFileSync('sqlite3', [copy, 'PRAGMA quick_check;'], { encoding: 'utf8' }).trim() === 'ok' ? checks.quick_check = { status: 'PASS' } : checks.quick_check = { status: 'FAIL', reason: 'quick_check 未通过' };
  const tables = execFileSync('sqlite3', [copy, "SELECT name FROM sqlite_master WHERE type='table'"], { encoding: 'utf8' });
  const required = ['users', 'roles', 'permissions', 'database_migrations', 'topics', 'production'];
  const missing = required.filter((name) => !tables.split('\n').includes(name));
  checks.open = { status: 'PASS' }; checks.schema = { status: missing.length ? 'FAIL' : 'PASS', ...(missing.length ? { reason: `缺少核心表: ${missing.join(',')}` } : {}) }; checks.core_tables = checks.schema;
  checks.migration_history = { status: tables.includes('database_migrations') ? 'PASS' : 'FAIL' };
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  if (!checks.file) checks.file = { status: 'FAIL', reason };
  else checks.open = { status: 'FAIL', reason };
}
finally { if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true }); }
const decision = Object.values(checks).every((check) => check.status === 'PASS') ? 'PASS' : 'FAIL';
console.log(JSON.stringify({ decision, checks, destructive: false }, null, 2)); if (decision === 'FAIL') process.exitCode = 1;
