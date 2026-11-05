import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { assertProductionTokenEncryptionKeyConfigured, assertTokenEncryptionKeyConfigured, parseTokenEncryptionKey } from '../../api/config/token-encryption.js';
import { migrateDouyinAccountTokens } from '../../api/services/douyin/token-migration.js';
import { decryptTokenWithKey } from '../../api/services/douyin/token-crypto.js';
import { decryptToken, encryptToken } from '../../api/services/douyin/token.service.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationScript = path.join(projectRoot, 'scripts/migrate-douyin-token-encryption.ts');
const tsxCli = path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs');

function legacyEncrypt(value: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

function runMigration(args: string[], runtimeEnvFile: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [tsxCli, migrationScript, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      ...extraEnv,
      NODE_ENV: 'development',
      XMT_RUNTIME_ENV_FILE: runtimeEnvFile,
    },
  });
}

function runProductionDryRun(runtimeEnvFile: string, pm2Path: string) {
  return spawnSync(process.execPath, [tsxCli, migrationScript], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DOUYIN_CLIENT_SECRET: '',
      JWT_SECRET: '',
      XMT_TOKEN_ENCRYPTION_KEY: '',
      XMT_RUNTIME_ENV_FILE: runtimeEnvFile,
      PATH: `${pm2Path}${path.delimiter}${process.env.PATH || ''}`,
    },
  });
}

function runProductionRuntimeEnvCheck(runtimeEnvFile: string) {
  return spawnSync(process.execPath, [tsxCli, path.join(projectRoot, 'scripts/runtime-env-check.ts')], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'http://localhost',
      XMT_RUNTIME_ENV_FILE: runtimeEnvFile,
    },
  });
}

function resultFrom(output: string) {
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith('{"table":'));
  assert(line, `migration output is missing its sanitized result: ${output}`);
  return JSON.parse(line) as {
    table: string;
    accounts: number;
    encryptedTokens: number;
    alreadyEncrypted: number;
    action: string;
    databasePath: string;
    backupPath: string | null;
  };
}

function legacyKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

const originalEncryptionKey = process.env.XMT_TOKEN_ENCRYPTION_KEY;
delete process.env.XMT_TOKEN_ENCRYPTION_KEY;
assert.throws(() => encryptToken('test-token'), /XMT_TOKEN_ENCRYPTION_KEY is required/);
assert.throws(() => parseTokenEncryptionKey(undefined), /XMT_TOKEN_ENCRYPTION_KEY is required/);
assert.throws(() => parseTokenEncryptionKey(crypto.randomBytes(31).toString('base64')), /exactly 32 random bytes/);

const key = crypto.randomBytes(32);
const encodedKey = key.toString('base64');
assertTokenEncryptionKeyConfigured({ XMT_TOKEN_ENCRYPTION_KEY: encodedKey });
assert.throws(() => assertTokenEncryptionKeyConfigured({ XMT_TOKEN_ENCRYPTION_KEY: '' }), /XMT_TOKEN_ENCRYPTION_KEY is required/);
assert.doesNotThrow(() => assertProductionTokenEncryptionKeyConfigured({ NODE_ENV: 'development' }));
assert.throws(() => assertProductionTokenEncryptionKeyConfigured({ NODE_ENV: 'production' }), /XMT_TOKEN_ENCRYPTION_KEY is required/);
assert.doesNotThrow(() => assertProductionTokenEncryptionKeyConfigured({ NODE_ENV: 'production', XMT_TOKEN_ENCRYPTION_KEY: encodedKey }));

process.env.XMT_TOKEN_ENCRYPTION_KEY = encodedKey;
const roundTripCiphertext = encryptToken('token-round-trip');
assert.match(roundTripCiphertext, /^v1\./);
assert.equal(decryptToken(roundTripCiphertext), 'token-round-trip');
assert.throws(() => decryptToken(`${roundTripCiphertext.slice(0, -2)}xx`));
if (originalEncryptionKey === undefined) delete process.env.XMT_TOKEN_ENCRYPTION_KEY;
else process.env.XMT_TOKEN_ENCRYPTION_KEY = originalEncryptionKey;

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-douyin-token-rotation-'));
const databasePath = path.join(workspace, 'tokens.db');
const backupPath = path.join(workspace, 'tokens-backup.db');
const runtimeEnvFile = path.join(workspace, 'xmt.test.env');
const oldSecret = 'legacy-douyin-test-secret';
const oldKey = legacyKey(oldSecret);
const accessToken = 'access-token-fixture-do-not-log';
const refreshToken = 'refresh-token-fixture-do-not-log';

try {
  fs.writeFileSync(runtimeEnvFile, `XMT_DB_PATH=${databasePath}\nXMT_TOKEN_ENCRYPTION_KEY=${encodedKey}\n`, { mode: 0o600 });
  fs.chmodSync(runtimeEnvFile, 0o600);
  const runtimePreflight = runProductionRuntimeEnvCheck(runtimeEnvFile);
  assert.equal(runtimePreflight.status, 0, runtimePreflight.stderr);
  assert.match(runtimePreflight.stdout, /"tokenEncryptionKey":"PRESENT"/);
  assert(!runtimePreflight.stdout.includes(encodedKey));

  const fixture = createClient({ url: `file:${databasePath}` });
  await fixture.execute(`CREATE TABLE douyin_accounts (
    id INTEGER PRIMARY KEY,
    access_token_encrypt TEXT,
    refresh_token_encrypt TEXT
  )`);
  const oldAccess = legacyEncrypt(accessToken, oldKey);
  const oldRefresh = legacyEncrypt(refreshToken, oldKey);
  const oldAccessOnly = legacyEncrypt('second-account-access', oldKey);
  await fixture.execute({
    sql: 'INSERT INTO douyin_accounts (id, access_token_encrypt, refresh_token_encrypt) VALUES (?, ?, ?)',
    args: [1, oldAccess, oldRefresh],
  });
  await fixture.execute({
    sql: 'INSERT INTO douyin_accounts (id, access_token_encrypt, refresh_token_encrypt) VALUES (?, ?, NULL)',
    args: [2, oldAccessOnly],
  });
  fixture.close();

  const pm2Bin = path.join(workspace, 'bin');
  fs.mkdirSync(pm2Bin);
  const pm2Fixture = path.join(pm2Bin, 'pm2');
  const pm2Json = JSON.stringify([{ name: 'xmt-api', pm2_env: { env: { DOUYIN_CLIENT_SECRET: oldSecret } } }]);
  fs.writeFileSync(pm2Fixture, `#!/bin/sh\nprintf '%s\\n' '${pm2Json}'\n`, { mode: 0o700 });
  fs.chmodSync(pm2Fixture, 0o700);
  const pm2DryRun = runProductionDryRun(runtimeEnvFile, pm2Bin);
  assert.equal(pm2DryRun.status, 0, pm2DryRun.stderr);
  assert.deepEqual(resultFrom(pm2DryRun.stdout), {
    table: 'present', accounts: 2, encryptedTokens: 3, alreadyEncrypted: 0, action: 'dry_run',
    databasePath, backupPath: null,
  }, 'production dry-run reads the prior source from the named PM2 process without exposing it');
  assert(!pm2DryRun.stdout.includes(oldSecret) && !pm2DryRun.stdout.includes(accessToken));

  const dryRun = runMigration([], runtimeEnvFile, { DOUYIN_CLIENT_SECRET: oldSecret });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.deepEqual(resultFrom(dryRun.stdout), {
    table: 'present', accounts: 2, encryptedTokens: 3, alreadyEncrypted: 0, action: 'dry_run',
    databasePath, backupPath: null,
  });
  assert(!dryRun.stdout.includes(accessToken) && !dryRun.stdout.includes(encodedKey));

  const unchangedClient = createClient({ url: `file:${databasePath}` });
  const unchanged = await unchangedClient.execute('SELECT access_token_encrypt FROM douyin_accounts WHERE id = 1');
  assert.equal(String(unchanged.rows[0]?.access_token_encrypt), oldAccess, 'dry-run leaves ciphertext untouched');
  unchangedClient.close();

  const missingBackup = runMigration(['--apply'], runtimeEnvFile, { DOUYIN_CLIENT_SECRET: oldSecret });
  assert.notEqual(missingBackup.status, 0);
  assert.match(missingBackup.stderr, /requires --backup/);
  assert(!missingBackup.stderr.includes(accessToken));

  fs.copyFileSync(databasePath, backupPath);
  const applied = runMigration(['--apply', `--backup=${backupPath}`], runtimeEnvFile, { DOUYIN_CLIENT_SECRET: oldSecret });
  assert.equal(applied.status, 0, applied.stderr);
  assert.deepEqual(resultFrom(applied.stdout), {
    table: 'present', accounts: 2, encryptedTokens: 3, alreadyEncrypted: 0, action: 'migrated',
    databasePath, backupPath,
  });
  assert(!applied.stdout.includes(accessToken) && !applied.stdout.includes(refreshToken) && !applied.stdout.includes(encodedKey));

  const migratedClient = createClient({ url: `file:${databasePath}` });
  const migrated = await migratedClient.execute('SELECT id, access_token_encrypt, refresh_token_encrypt FROM douyin_accounts ORDER BY id');
  assert.equal(decryptTokenWithKey(String(migrated.rows[0]?.access_token_encrypt), key), accessToken);
  assert.equal(decryptTokenWithKey(String(migrated.rows[0]?.refresh_token_encrypt), key), refreshToken);
  assert.equal(decryptTokenWithKey(String(migrated.rows[1]?.access_token_encrypt), key), 'second-account-access');
  assert.equal(migrated.rows[1]?.refresh_token_encrypt, null);
  migratedClient.close();

  const repeated = runMigration(['--apply', `--backup=${backupPath}`], runtimeEnvFile, { DOUYIN_CLIENT_SECRET: oldSecret });
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.deepEqual(resultFrom(repeated.stdout), {
    table: 'present', accounts: 2, encryptedTokens: 0, alreadyEncrypted: 3, action: 'migrated',
    databasePath, backupPath,
  });

  const startupEnvFile = path.join(workspace, 'xmt.production.env');
  const startupDatabasePath = path.join(workspace, 'startup.db');
  fs.writeFileSync(startupEnvFile, `NODE_ENV=production\nXMT_DB_PATH=${startupDatabasePath}\n`, { mode: 0o600 });
  fs.chmodSync(startupEnvFile, 0o600);
  const missingProductionKey = spawnSync(process.execPath, [tsxCli, path.join(projectRoot, 'api/server.ts')], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: 'startup-key-contract-test-only',
      XMT_TOKEN_ENCRYPTION_KEY: '',
      XMT_RUNTIME_ENV_FILE: startupEnvFile,
    },
  });
  assert.equal(missingProductionKey.status, 1, missingProductionKey.stderr);
  assert.match(missingProductionKey.stderr, /TokenEncryptionConfigurationError/);
  assert(!missingProductionKey.stderr.includes('startup-key-contract-test-only'));

  const rollbackPath = path.join(workspace, 'rollback.db');
  const rollbackClient = createClient({ url: `file:${rollbackPath}` });
  await rollbackClient.execute(`CREATE TABLE douyin_accounts (
    id INTEGER PRIMARY KEY,
    access_token_encrypt TEXT,
    refresh_token_encrypt TEXT
  )`);
  const firstRowCiphertext = legacyEncrypt('rollback-first-row', oldKey);
  await rollbackClient.execute({
    sql: 'INSERT INTO douyin_accounts (id, access_token_encrypt, refresh_token_encrypt) VALUES (?, ?, NULL)',
    args: [1, firstRowCiphertext],
  });
  await rollbackClient.execute({
    sql: 'INSERT INTO douyin_accounts (id, access_token_encrypt, refresh_token_encrypt) VALUES (?, ?, NULL)',
    args: [2, 'malformed-ciphertext'],
  });
  await assert.rejects(migrateDouyinAccountTokens(rollbackClient, oldKey, key, true));
  const afterRollback = await rollbackClient.execute('SELECT access_token_encrypt FROM douyin_accounts WHERE id = 1');
  assert.equal(afterRollback.rows[0]?.access_token_encrypt, firstRowCiphertext, 'invalid later row rolls back earlier updates');
  rollbackClient.close();

  console.log('Douyin token encryption and migration tests passed');
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
