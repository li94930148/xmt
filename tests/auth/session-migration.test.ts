import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { authSessionFoundationMigration } from '../../api/database/migrations/005_auth_session_foundation.js';
import { databaseMigrations } from '../../api/database/migrations/index.js';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-auth-session-migration-'));
const databasePath = path.join(tempDirectory, 'session-migration.test.db');
const client = createClient({ url: `file:${databasePath}` });

const expectedSessionColumns = [
  'id',
  'user_id',
  'client_type',
  'device_name',
  'user_agent_summary',
  'app_version',
  'created_at',
  'last_seen_at',
  'idle_expires_at',
  'absolute_expires_at',
  'revoked_at',
  'revoke_reason',
  'last_ip_prefix',
];

const expectedRefreshTokenColumns = [
  'id',
  'session_id',
  'token_hash',
  'pepper_version',
  'generation',
  'created_at',
  'expires_at',
  'used_at',
  'replaced_by_id',
  'revoked_at',
  'revoke_reason',
];

const expectedIndexes = [
  'idx_auth_sessions_user_revoked_absolute',
  'idx_auth_sessions_absolute_expires',
  'idx_auth_sessions_idle_expires',
  'idx_auth_refresh_tokens_hash',
  'idx_auth_refresh_tokens_session_generation',
  'idx_auth_refresh_tokens_session_created',
  'idx_auth_refresh_tokens_expires',
];

async function applyMigration() {
  const transaction = await client.transaction('write');
  try {
    await authSessionFoundationMigration.up(transaction);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}

try {
  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);
  await client.execute({
    sql: 'INSERT INTO users (username, password) VALUES (?, ?)',
    args: ['existing-user', 'existing-password-hash'],
  });

  assert.equal(databaseMigrations.at(-1)?.version, '005');
  assert.equal(databaseMigrations.at(-1)?.name, 'auth_session_foundation');

  await applyMigration();
  await applyMigration();

  const tables = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('auth_sessions', 'auth_refresh_tokens')`,
  );
  assert.deepEqual(
    Array.from(tables.rows, (row) => String(row.name)).sort(),
    ['auth_refresh_tokens', 'auth_sessions'],
  );

  const sessionColumns = await client.execute('PRAGMA table_info(auth_sessions)');
  assert.deepEqual(Array.from(sessionColumns.rows, (row) => String(row.name)), expectedSessionColumns);

  const refreshTokenColumns = await client.execute('PRAGMA table_info(auth_refresh_tokens)');
  assert.deepEqual(Array.from(refreshTokenColumns.rows, (row) => String(row.name)), expectedRefreshTokenColumns);
  assert.equal(refreshTokenColumns.rows.some((row) => String(row.name) === 'token'), false);

  const indexes = await client.execute(`
    SELECT name FROM sqlite_master
    WHERE type = 'index' AND name LIKE 'idx_auth_%'
    ORDER BY name
  `);
  assert.deepEqual(
    Array.from(indexes.rows, (row) => String(row.name)),
    [...expectedIndexes].sort(),
  );

  const sessionIndexList = await client.execute('PRAGMA index_list(auth_sessions)');
  const refreshIndexList = await client.execute('PRAGMA index_list(auth_refresh_tokens)');
  assert.equal(
    refreshIndexList.rows.find((row) => row.name === 'idx_auth_refresh_tokens_hash')?.unique,
    1,
  );
  assert.equal(
    refreshIndexList.rows.find((row) => row.name === 'idx_auth_refresh_tokens_session_generation')?.unique,
    1,
  );
  assert.equal(
    sessionIndexList.rows.some((row) => row.name === 'idx_auth_sessions_user_revoked_absolute'),
    true,
  );

  const sessionForeignKeys = await client.execute('PRAGMA foreign_key_list(auth_sessions)');
  assert.equal(sessionForeignKeys.rows.some((row) => row.table === 'users' && row.from === 'user_id'), true);

  const refreshForeignKeys = await client.execute('PRAGMA foreign_key_list(auth_refresh_tokens)');
  assert.equal(
    refreshForeignKeys.rows.some((row) => row.table === 'auth_sessions' && row.from === 'session_id'),
    true,
  );
  assert.equal(
    refreshForeignKeys.rows.some((row) => row.table === 'auth_refresh_tokens' && row.from === 'replaced_by_id'),
    true,
  );

  const existingUser = await client.execute({
    sql: 'SELECT id, username, password FROM users WHERE username = ?',
    args: ['existing-user'],
  });
  assert.deepEqual(existingUser.rows[0], {
    id: 1,
    username: 'existing-user',
    password: 'existing-password-hash',
  });

  console.log('Auth session migration tests passed');
} finally {
  client.close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
