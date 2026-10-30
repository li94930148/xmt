import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creatorOfficialDailyMetricObservationsMigration } from '../../api/database/migrations/069_creator_official_daily_metric_observations.js';
import { assessMigrationReadiness } from '../../api/modules/ops/migration-readiness-decision.js';
import { migrationPolicies } from '../../api/database/migrations/policy.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-creator-daily-observations-'));
const client = createClient({ url: `file:${path.join(directory, 'observations.db')}` });

try {
  await client.execute('PRAGMA foreign_keys=ON');
  await client.execute('CREATE TABLE creator_platform_accounts(id INTEGER PRIMARY KEY)');
  await client.execute('CREATE TABLE creator_agents(id INTEGER PRIMARY KEY)');
  await client.execute(`CREATE TABLE creator_ingest_batches(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES creator_agents(id) ON DELETE CASCADE,
    batch_id TEXT NOT NULL,
    account_id INTEGER NOT NULL REFERENCES creator_platform_accounts(id) ON DELETE CASCADE
  )`);
  await client.execute(`CREATE TABLE creator_official_daily_metrics(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    metric_date DATE NOT NULL,
    source_period TEXT NOT NULL,
    metric_code TEXT NOT NULL,
    value_text TEXT NOT NULL,
    value_number REAL,
    unit TEXT NOT NULL,
    source_file_sha256 TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    collected_at DATETIME NOT NULL,
    UNIQUE(account_id,metric_date,source_period,metric_code)
  )`);
  await client.execute('INSERT INTO creator_platform_accounts(id) VALUES(7)');
  await client.execute('INSERT INTO creator_agents(id) VALUES(8)');
  await client.execute("INSERT INTO creator_ingest_batches(id,agent_id,batch_id,account_id) VALUES(9,8,'accepted-batch',7)");
  await client.execute(`INSERT INTO creator_official_daily_metrics(
    account_id,metric_date,source_period,metric_code,value_text,value_number,unit,source_file_sha256,parser_version,collected_at
  ) VALUES(7,'2026-10-01','30d','views','123',123,'count','${'a'.repeat(64)}','fixture-v3','2026-10-02T00:00:00.000Z')`);

  await creatorOfficialDailyMetricObservationsMigration.up(client);
  await creatorOfficialDailyMetricObservationsMigration.up(client);

  assert.equal(migrationPolicies['069'], 'SAFE_EXPAND');
  assert.equal(assessMigrationReadiness([creatorOfficialDailyMetricObservationsMigration], migrationPolicies, []).decision, 'GO');
  assert.deepEqual((await client.execute(`SELECT account_id,batch_id,source_kind,metric_date,source_period,metric_code,value_text,value_number,unit,source_file_sha256,parser_version,collected_at
    FROM creator_official_daily_metric_observations`)).rows, [{
    account_id: 7,
    batch_id: null,
    source_kind: 'projection_backfill',
    metric_date: '2026-10-01',
    source_period: '30d',
    metric_code: 'views',
    value_text: '123',
    value_number: 123,
    unit: 'count',
    source_file_sha256: 'a'.repeat(64),
    parser_version: 'fixture-v3',
    collected_at: '2026-10-02T00:00:00.000Z',
  }], 'the current projection is copied as a baseline without a fabricated batch identity');

  await client.execute(`INSERT INTO creator_official_daily_metric_observations(
    account_id,batch_id,source_kind,metric_date,source_period,metric_code,value_text,value_number,unit,source_file_sha256,parser_version,collected_at
  ) VALUES(7,9,'official_batch','2026-10-02','30d','views','456',456,'count','${'b'.repeat(64)}','fixture-v3','2026-10-03T00:00:00.000Z')`);
  assert.equal(Number((await client.execute('SELECT COUNT(*) AS count FROM creator_official_daily_metric_observations')).rows[0]?.count), 2);
  await client.execute('DELETE FROM creator_ingest_batches WHERE id=9');
  assert.deepEqual((await client.execute('SELECT source_kind,metric_date FROM creator_official_daily_metric_observations ORDER BY id')).rows, [
    { source_kind: 'projection_backfill', metric_date: '2026-10-01' },
  ], 'deleting the owning batch cascades only its batch facts and keeps the legacy baseline');
  await client.execute('DELETE FROM creator_platform_accounts WHERE id=7');
  assert.equal(Number((await client.execute('SELECT COUNT(*) AS count FROM creator_official_daily_metric_observations')).rows[0]?.count), 0,
    'deleting the owning creator account cascades its remaining projection baseline');
  console.log('Creator official daily metric observations migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
