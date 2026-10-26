import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { creatorAgentBindResultRecoveryMigration } from '../../api/database/migrations/053_creator_agent_bind_result_recovery.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-agent-bind-result-recovery-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'binding.db')}` });

try {
  await client.execute('CREATE TABLE creator_agents (id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL)');
  await client.execute('INSERT INTO creator_agents(id,token_hash) VALUES(1,\'legacy-hash\')');

  await creatorAgentBindResultRecoveryMigration.up(client);
  await creatorAgentBindResultRecoveryMigration.up(client);
  const indexes = await client.execute('PRAGMA index_list(creator_agent_bind_result_recovery)');
  assert(indexes.rows.some((index) => String(index.name) === 'idx_creator_agent_bind_result_expiry'));
  const columns = await client.execute('PRAGMA table_info(creator_agent_bind_result_recovery)');
  const names = new Set(columns.rows.map((column) => String(column.name)));
  assert(names.has('recovery_secret_hash'));
  assert(names.has('previous_token_hash'));
  assert(names.has('staged_token_hash'));
  assert(names.has('ciphertext'));

  await client.execute(`CREATE TABLE creator_agent_bind_result_recovery_bad (request_id_hash TEXT PRIMARY KEY)`);
  await client.execute('ALTER TABLE creator_agent_bind_result_recovery RENAME TO creator_agent_bind_result_recovery_good');
  await client.execute('ALTER TABLE creator_agent_bind_result_recovery_bad RENAME TO creator_agent_bind_result_recovery');
  await assert.rejects(
    creatorAgentBindResultRecoveryMigration.up(client),
    /CREATOR_AGENT_BIND_RESULT_RECOVERY_SCHEMA_INVALID|no such column/i,
    'the additive migration fails closed if a conflicting partial table already exists',
  );
  console.log('Creator Agent bind-result recovery migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
