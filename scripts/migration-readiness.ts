import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { databaseMigrations } from '../api/database/migrations/index.js';
import { migrationPolicies } from '../api/database/migrations/policy.js';
import { assessMigrationReadiness } from '../api/modules/ops/migration-readiness-decision.js';

type Status = 'PASS' | 'FAIL' | 'UNKNOWN';
const dbPath = process.env.XMT_DB_PATH || path.join(process.cwd(), 'data/xmt.db');
const checks: Record<string, { status: Status; reason?: string }> = {};
const result = (decision: string) => console.log(JSON.stringify({ decision, checks, readOnly: true }, null, 2));
if (!fs.existsSync(dbPath)) { checks.database = { status: 'UNKNOWN', reason: '数据库不可读取' }; result('INSUFFICIENT_DATA'); process.exitCode = 1; }
else {
  const client = createClient({ url: `file:${dbPath}` });
  try {
    const records = await client.execute('SELECT version, name, checksum, status FROM database_migrations');
    const assessment = assessMigrationReadiness(databaseMigrations, migrationPolicies, records.rows.map((row) => ({ version: String(row.version), name: String(row.name), checksum: String(row.checksum), status: String(row.status) })));
    Object.assign(checks, assessment.checks);
    checks.database = { status: 'PASS' };
    result(assessment.decision);
    if (assessment.decision !== 'GO') process.exitCode = 1;
  } catch (error) { checks.database = { status: 'UNKNOWN', reason: error instanceof Error ? error.message : String(error) }; result('INSUFFICIENT_DATA'); process.exitCode = 1; }
  finally { client.close(); }
}
