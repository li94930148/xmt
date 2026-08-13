import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { databaseMigrations } from '../api/database/migrations/index.js';
import { migrationPolicies } from '../api/database/migrations/policy.js';

type Status = 'PASS' | 'FAIL' | 'UNKNOWN';
const dbPath = process.env.XMT_DB_PATH || path.join(process.cwd(), 'data/xmt.db');
const checks: Record<string, { status: Status; reason?: string }> = {};
const result = (decision: string) => console.log(JSON.stringify({ decision, checks, readOnly: true }, null, 2));
if (!fs.existsSync(dbPath)) { checks.database = { status: 'UNKNOWN', reason: '数据库不可读取' }; result('INSUFFICIENT_DATA'); process.exitCode = 1; }
else {
  const client = createClient({ url: `file:${dbPath}` });
  try {
    const records = await client.execute('SELECT version, name, checksum, status FROM database_migrations');
    const applied = new Map(records.rows.map((row) => [String(row.version), row]));
    let review = false; let failed = false;
    for (const migration of databaseMigrations) {
      const policy = migrationPolicies[migration.version]; const existing = applied.get(migration.version);
      if (!policy) { failed = true; checks[`migration_${migration.version}`] = { status: 'FAIL', reason: '缺少兼容性分类' }; continue; }
      if (existing && (String(existing.status) !== 'applied' || String(existing.name) !== migration.name || String(existing.checksum) !== migration.checksum)) {
        failed = true; checks[`migration_${migration.version}`] = { status: 'FAIL', reason: '已应用迁移状态或校验和不一致' }; continue;
      }
      if (!existing && policy === 'BLOCKED_FOR_ROLLBACK') { failed = true; checks[`migration_${migration.version}`] = { status: 'FAIL', reason: '迁移阻止应用代码回滚' }; continue; }
      if (!existing && policy === 'REVIEW_REQUIRED') { review = true; checks[`migration_${migration.version}`] = { status: 'UNKNOWN', reason: '迁移需要人工兼容性审查' }; continue; }
      checks[`migration_${migration.version}`] = { status: 'PASS' };
    }
    checks.database = { status: 'PASS' };
    result(failed ? 'NO-GO' : review ? 'REVIEW_REQUIRED' : 'GO');
    if (failed || review) process.exitCode = 1;
  } catch (error) { checks.database = { status: 'UNKNOWN', reason: error instanceof Error ? error.message : String(error) }; result('INSUFFICIENT_DATA'); process.exitCode = 1; }
  finally { client.close(); }
}
