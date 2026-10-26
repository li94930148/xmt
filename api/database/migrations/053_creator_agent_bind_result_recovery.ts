import type { DatabaseMigration } from './types';

/** Add short-lived encrypted receipts for recovering a committed Creator Agent bind response. */
export const creatorAgentBindResultRecoveryMigration: DatabaseMigration = {
  version: '053',
  name: 'creator_agent_bind_result_recovery',
  checksum: '053-creator-agent-bind-result-recovery-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS creator_agent_bind_result_recovery (
        request_id_hash TEXT PRIMARY KEY,
        recovery_secret_hash TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        agent_id INTEGER NOT NULL,
        previous_token_hash TEXT,
        staged_token_hash TEXT NOT NULL,
        staged_encryption_key_hash TEXT NOT NULL,
        key_version INTEGER NOT NULL CHECK (key_version = 1),
        iv TEXT,
        auth_tag TEXT,
        ciphertext TEXT,
        expires_at TEXT NOT NULL,
        acknowledged_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES creator_agents(id) ON DELETE CASCADE
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_creator_agent_bind_result_expiry
      ON creator_agent_bind_result_recovery(expires_at)
    `);

    const columns = await executor.execute('PRAGMA table_info(creator_agent_bind_result_recovery)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    const requiredColumns = [
      'request_id_hash', 'recovery_secret_hash', 'payload_hash', 'code_hash', 'agent_id',
      'previous_token_hash', 'staged_token_hash', 'staged_encryption_key_hash', 'key_version',
      'iv', 'auth_tag', 'ciphertext', 'expires_at', 'acknowledged_at', 'created_at',
    ];
    if (!requiredColumns.every((name) => columnNames.has(name))) {
      throw new Error('CREATOR_AGENT_BIND_RESULT_RECOVERY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'request_id_hash') {
      throw new Error('CREATOR_AGENT_BIND_RESULT_RECOVERY_PRIMARY_KEY_INVALID');
    }

    const indexes = await executor.execute('PRAGMA index_list(creator_agent_bind_result_recovery)');
    if (!indexes.rows.some((index) => Number(index.unique) === 1 && String(index.origin) === 'pk')) {
      throw new Error('CREATOR_AGENT_BIND_RESULT_RECOVERY_REQUEST_KEY_INVALID');
    }
  },
};
