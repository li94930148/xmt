import type { DatabaseMigration } from './types';

/** Add an actor-scoped, encrypted receipt for safely recovering a one-time Creator Agent binding code. */
export const creatorAgentBindingCodeRecoveryMigration: DatabaseMigration = {
  version: '052',
  name: 'creator_agent_binding_code_recovery',
  checksum: '052-creator-agent-binding-code-recovery-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS creator_agent_binding_code_recovery (
        request_id_hash TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        account_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        binding_code_id INTEGER NOT NULL,
        key_version INTEGER NOT NULL CHECK (key_version = 1),
        iv TEXT,
        auth_tag TEXT,
        ciphertext TEXT,
        expires_at TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (binding_code_id) REFERENCES creator_agent_binding_codes(id) ON DELETE CASCADE
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_creator_agent_binding_recovery_actor_account
      ON creator_agent_binding_code_recovery(actor_id, account_id, expires_at)
    `);
    await executor.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_agent_binding_recovery_code_id
      ON creator_agent_binding_code_recovery(binding_code_id)
    `);

    const columns = await executor.execute('PRAGMA table_info(creator_agent_binding_code_recovery)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    const requiredColumns = [
      'request_id_hash', 'actor_id', 'account_id', 'payload_hash', 'binding_code_id',
      'key_version', 'iv', 'auth_tag', 'ciphertext', 'expires_at', 'created_at',
    ];
    if (!requiredColumns.every((name) => columnNames.has(name))) {
      throw new Error('CREATOR_AGENT_BINDING_CODE_RECOVERY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'request_id_hash') {
      throw new Error('CREATOR_AGENT_BINDING_CODE_RECOVERY_PRIMARY_KEY_INVALID');
    }

    const indexes = await executor.execute('PRAGMA index_list(creator_agent_binding_code_recovery)');
    if (!indexes.rows.some((index) => Number(index.unique) === 1 && String(index.name) === 'idx_creator_agent_binding_recovery_code_id')) {
      throw new Error('CREATOR_AGENT_BINDING_CODE_RECOVERY_CODE_INDEX_INVALID');
    }
  },
};
