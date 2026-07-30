import type { DatabaseMigration } from './types';

export const authSessionFoundationMigration: DatabaseMigration = {
  version: '005',
  name: 'auth_session_foundation',
  checksum: '005-auth-session-foundation-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        client_type TEXT NOT NULL,
        device_name TEXT,
        user_agent_summary TEXT,
        app_version TEXT,
        created_at DATETIME NOT NULL,
        last_seen_at DATETIME NOT NULL,
        idle_expires_at DATETIME NOT NULL,
        absolute_expires_at DATETIME NOT NULL,
        revoked_at DATETIME,
        revoke_reason TEXT,
        last_ip_prefix TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await executor.execute(`
      CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        pepper_version INTEGER NOT NULL,
        generation INTEGER NOT NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME,
        replaced_by_id TEXT,
        revoked_at DATETIME,
        revoke_reason TEXT,
        FOREIGN KEY (session_id) REFERENCES auth_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (replaced_by_id) REFERENCES auth_refresh_tokens(id) ON DELETE SET NULL
      )
    `);

    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_revoked_absolute
        ON auth_sessions(user_id, revoked_at, absolute_expires_at)`,
      `CREATE INDEX IF NOT EXISTS idx_auth_sessions_absolute_expires
        ON auth_sessions(absolute_expires_at)`,
      `CREATE INDEX IF NOT EXISTS idx_auth_sessions_idle_expires
        ON auth_sessions(idle_expires_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_refresh_tokens_hash
        ON auth_refresh_tokens(token_hash)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_refresh_tokens_session_generation
        ON auth_refresh_tokens(session_id, generation)`,
      `CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_session_created
        ON auth_refresh_tokens(session_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_expires
        ON auth_refresh_tokens(expires_at)`,
    ];

    for (const statement of indexes) {
      await executor.execute(statement);
    }
  },
};
