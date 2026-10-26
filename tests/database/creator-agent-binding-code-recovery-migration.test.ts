import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { creatorAgentBindingCodeRecoveryMigration } from '../../api/database/migrations/052_creator_agent_binding_code_recovery.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-agent-binding-recovery-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'binding.db')}` });

try {
  await client.execute(`CREATE TABLE creator_agent_binding_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    account_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at DATETIME
  )`);
  await client.execute("INSERT INTO creator_agent_binding_codes(user_id,platform,account_id,code_hash,expires_at) VALUES(7,'douyin','migration-fixture','legacy-hash','2030-01-01T00:00:00.000Z')");

  await creatorAgentBindingCodeRecoveryMigration.up(client);
  await creatorAgentBindingCodeRecoveryMigration.up(client);
  assert.deepEqual((await client.execute('SELECT user_id,account_id,code_hash FROM creator_agent_binding_codes WHERE id=1')).rows[0], {
    user_id: 7,
    account_id: 'migration-fixture',
    code_hash: 'legacy-hash',
  }, 'the additive migration preserves legacy binding codes');

  const columns = await client.execute('PRAGMA table_info(creator_agent_binding_code_recovery)');
  assert(columns.rows.some((column) => String(column.name) === 'ciphertext'));
  assert(columns.rows.some((column) => String(column.name) === 'request_id_hash' && Number(column.pk) === 1));
  const indexes = await client.execute('PRAGMA index_list(creator_agent_binding_code_recovery)');
  assert(indexes.rows.some((index) => String(index.name) === 'idx_creator_agent_binding_recovery_code_id' && Number(index.unique) === 1));

  await client.execute(`CREATE TABLE creator_agent_binding_code_recovery_bad (
    request_id_hash TEXT PRIMARY KEY
  )`);
  await client.execute('ALTER TABLE creator_agent_binding_code_recovery RENAME TO creator_agent_binding_code_recovery_good');
  await client.execute('ALTER TABLE creator_agent_binding_code_recovery_bad RENAME TO creator_agent_binding_code_recovery');
  await assert.rejects(creatorAgentBindingCodeRecoveryMigration.up(client), /CREATOR_AGENT_BINDING_CODE_RECOVERY_SCHEMA_INVALID|no such column/i,
    'the migration fails closed when an incompatible recovery table already exists');
  console.log('Creator Agent binding-code recovery migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
