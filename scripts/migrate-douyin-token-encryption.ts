import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { assertTokenEncryptionKeyConfigured, getTokenEncryptionKey } from '../api/config/token-encryption.js';
import { getDatabasePath, getDatabaseUrl } from '../api/database/path.js';
import { loadRuntimeEnvironment } from '../api/config/runtime-env-loader.js';
import { migrateDouyinAccountTokens } from '../api/services/douyin/token-migration.js';

const LEGACY_DEVELOPMENT_KEY_SOURCE = 'xmt-douyin-development-only';
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'utf8');

function argumentValue(prefix: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function legacySourceFromPm2(): string | undefined {
  const appName = process.env.XMT_TOKEN_MIGRATION_PM2_APP?.trim() || 'xmt-api';
  try {
    const output = execFileSync('pm2', ['jlist'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const processes = JSON.parse(output) as Array<{ name?: unknown; pm2_env?: { env?: unknown } }>;
    const application = processes.find((entry) => entry.name === appName);
    const applicationEnvironment = application?.pm2_env?.env;
    if (!applicationEnvironment || typeof applicationEnvironment !== 'object') return undefined;
    const environment = applicationEnvironment as Record<string, unknown>;
    const clientSecret = environment.DOUYIN_CLIENT_SECRET;
    const jwtSecret = environment.JWT_SECRET;
    if (typeof clientSecret === 'string' && clientSecret) return clientSecret;
    if (typeof jwtSecret === 'string' && jwtSecret) return jwtSecret;
    return undefined;
  } catch {
    // A missing/unreadable PM2 source is handled as an explicit unresolved-key error below.
    return undefined;
  }
}

async function validateBackup(backupArgument: string | undefined, databasePath: string): Promise<string> {
  if (!backupArgument) {
    throw new Error('Applying token migration requires --backup=/absolute/path/to/verified-sqlite-backup.db');
  }
  if (!path.isAbsolute(backupArgument)) {
    throw new Error('The --backup path must be absolute.');
  }

  const backupPath = path.resolve(backupArgument);
  const backupStat = fs.lstatSync(backupPath);
  if (!backupStat.isFile() || backupStat.isSymbolicLink()) {
    throw new Error('The --backup path must point to a regular, non-symlink file.');
  }
  if (fs.realpathSync(backupPath) === fs.realpathSync(databasePath)) {
    throw new Error('The backup path must not point to the live database.');
  }

  const descriptor = fs.openSync(backupPath, 'r');
  try {
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    if (bytesRead !== SQLITE_HEADER.length || !header.equals(SQLITE_HEADER)) {
      throw new Error('The --backup file does not have a SQLite database header.');
    }
  } finally {
    fs.closeSync(descriptor);
  }

  const backupClient = createClient({ url: `file:${backupPath}` });
  try {
    const check = await backupClient.execute('PRAGMA quick_check');
    if (String(check.rows[0]?.quick_check) !== 'ok') {
      throw new Error('The --backup SQLite quick_check did not return ok.');
    }
  } finally {
    backupClient.close();
  }
  return backupPath;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Dry run: npm run migrate:douyin-token-encryption');
    console.log('Apply:    npm run migrate:douyin-token-encryption -- --apply --backup=/absolute/path/to/verified-sqlite-backup.db');
    return;
  }

  const supportedArguments = new Set(['--apply', '--help']);
  for (const argument of process.argv.slice(2)) {
    if (!supportedArguments.has(argument) && !argument.startsWith('--backup=') && !argument.startsWith('--legacy-key-source=')) {
      throw new Error(`Unsupported migration argument: ${argument}`);
    }
  }

  loadRuntimeEnvironment();
  if (process.env.NODE_ENV === 'production' && !process.env.XMT_RUNTIME_ENV_FILE?.trim()) {
    throw new Error('Production migration requires XMT_RUNTIME_ENV_FILE as the authoritative configuration source.');
  }

  const apply = process.argv.includes('--apply');
  const databasePath = getDatabasePath();
  const databaseStat = fs.statSync(databasePath);
  if (!databaseStat.isFile()) throw new Error('Configured database path is not a regular file.');

  const backupPath = apply ? await validateBackup(argumentValue('--backup='), databasePath) : null;
  assertTokenEncryptionKeyConfigured();
  const newKey = getTokenEncryptionKey();
  const legacyKeySourceOverride = argumentValue('--legacy-key-source=');
  if (legacyKeySourceOverride && legacyKeySourceOverride !== 'development-fallback') {
    throw new Error('Supported legacy key source override: development-fallback.');
  }
  const oldKeySource = legacyKeySourceOverride === 'development-fallback'
    ? LEGACY_DEVELOPMENT_KEY_SOURCE
    : process.env.DOUYIN_CLIENT_SECRET || process.env.JWT_SECRET || legacySourceFromPm2();
  if (!oldKeySource && process.env.NODE_ENV === 'production') {
    throw new Error('Legacy token key source could not be resolved from this process or PM2; do not guess the old secret.');
  }
  const resolvedOldKeySource = oldKeySource || LEGACY_DEVELOPMENT_KEY_SOURCE;
  const oldKey = crypto.createHash('sha256').update(resolvedOldKeySource).digest();
  const client = createClient({ url: getDatabaseUrl() });

  try {
    const result = await migrateDouyinAccountTokens(client, oldKey, newKey, apply);
    console.log(JSON.stringify({ ...result, databasePath, backupPath }));
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Douyin token migration failed.');
  process.exitCode = 1;
});
