import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { reportSummaryUpdateIdempotencyMigration } from '../../api/database/migrations/065_report_summary_update_idempotency.js';
import { migrationPolicies } from '../../api/database/migrations/policy.js';
import { assessMigrationReadiness } from '../../api/modules/ops/migration-readiness-decision.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-report-summary-update-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'summaries.db')}` });

try {
  assert.equal(migrationPolicies['065'], 'SAFE_EXPAND', 'the new receipt table remains compatible with legacy unkeyed PUT clients');
  assert.equal(assessMigrationReadiness([reportSummaryUpdateIdempotencyMigration], migrationPolicies, []).decision, 'GO');

  await client.execute(`CREATE TABLE monthly_summaries (id INTEGER PRIMARY KEY, content_md TEXT NOT NULL)`);
  await client.execute(`CREATE TABLE yearly_summaries (id INTEGER PRIMARY KEY, content_md TEXT NOT NULL)`);
  await client.execute("INSERT INTO monthly_summaries(id,content_md) VALUES(1,'保留的月报')");
  await client.execute("INSERT INTO yearly_summaries(id,content_md) VALUES(1,'保留的年报')");

  await reportSummaryUpdateIdempotencyMigration.up(client);
  await reportSummaryUpdateIdempotencyMigration.up(client);

  assert.deepEqual((await client.execute('SELECT id,content_md FROM monthly_summaries')).rows[0], { id: 1, content_md: '保留的月报' });
  assert.deepEqual((await client.execute('SELECT id,content_md FROM yearly_summaries')).rows[0], { id: 1, content_md: '保留的年报' });

  const columns = await client.execute('PRAGMA table_info(report_summary_update_request_keys)');
  assert.deepEqual(
    columns.rows.map((column) => String(column.name)).sort(),
    ['actor_id', 'base_fingerprint', 'client_request_id', 'created_at', 'request_fingerprint', 'result_json', 'summary_kind', 'summary_month', 'summary_year'],
  );
  assert.equal(columns.rows.find((column) => String(column.name) === 'client_request_id')?.pk, 1,
    'request IDs are globally unique so another actor or period cannot claim an existing key');
  assert.equal(Number((await client.execute("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name='idx_report_summary_update_actor_period'")).rows[0]?.count), 1,
    'actor, kind, and period lookups have an index');

  const requestId = '9f706f14-a852-4d12-b86b-bbf0c3c89101';
  const receipt = {
    client_request_id: requestId,
    actor_id: 7,
    summary_kind: 'monthly',
    summary_year: 2098,
    summary_month: 6,
    request_fingerprint: 'a'.repeat(64),
    base_fingerprint: 'b'.repeat(64),
    result_json: '{"row":{}}',
  };
  await client.execute({
    sql: `INSERT INTO report_summary_update_request_keys
      (client_request_id,actor_id,summary_kind,summary_year,summary_month,request_fingerprint,base_fingerprint,result_json)
      VALUES(?,?,?,?,?,?,?,?)`,
    args: Object.values(receipt),
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO report_summary_update_request_keys
      (client_request_id,actor_id,summary_kind,summary_year,summary_month,request_fingerprint,base_fingerprint,result_json)
      VALUES(?,?,?,?,?,?,?,?)`,
    args: [requestId, 8, 'yearly', 2099, 0, 'c'.repeat(64), 'd'.repeat(64), '{"row":{}}'],
  }), /UNIQUE constraint failed/i, 'one UUID cannot cross actor or period boundaries');
  await assert.rejects(client.execute({
    sql: `INSERT INTO report_summary_update_request_keys
      (client_request_id,actor_id,summary_kind,summary_year,summary_month,request_fingerprint,base_fingerprint,result_json)
      VALUES(?,?,?,?,?,?,?,?)`,
    args: ['9f706f14-a852-4d12-b86b-bbf0c3c89102', 7, 'yearly', 2098, 6, 'e'.repeat(64), 'f'.repeat(64), '{"row":{}}'],
  }), /CHECK constraint failed/i, 'yearly receipt periods use the explicit zero-month marker');

  console.log('Report summary update idempotency migration retry and SAFE_EXPAND checks passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
