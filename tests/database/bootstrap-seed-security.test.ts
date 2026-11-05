import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBootstrapUserPlan } from '../../api/config/bootstrap-users.js';

const defaults = new Map([
  ['admin', 'admin123'],
  ['director', 'director123'],
  ['member1', 'member123'],
  ['member2', 'member123'],
]);

const disabledPlan = createBootstrapUserPlan({ NODE_ENV: 'production' });
assert.equal(disabledPlan.mode, 'production-skipped');
assert.deepEqual(disabledPlan.users, []);
assert.equal(createBootstrapUserPlan({ NODE_ENV: 'production', XMT_BOOTSTRAP_SEED_USERS: 'True' }).mode, 'production-skipped');

let generated = 0;
const enabledPlan = createBootstrapUserPlan(
  { NODE_ENV: 'production', XMT_BOOTSTRAP_SEED_USERS: 'true' },
  () => `generated-secret-${++generated}`,
);
assert.equal(enabledPlan.mode, 'production');
assert.equal(enabledPlan.users.length, 4);
assert.deepEqual(enabledPlan.users.map((user) => user.username), [...defaults.keys()]);
assert(enabledPlan.users.every((user) => !defaults.has(user.username) || user.password !== defaults.get(user.username)));
const cryptoGeneratedPlan = createBootstrapUserPlan({ NODE_ENV: 'production', XMT_BOOTSTRAP_SEED_USERS: 'true' });
assert.equal(new Set(cryptoGeneratedPlan.users.map((user) => user.password)).size, 4);
assert(cryptoGeneratedPlan.users.every((user) => user.password.length >= 40));

const developmentPlan = createBootstrapUserPlan({ NODE_ENV: 'development' });
assert.equal(developmentPlan.mode, 'development');
assert.equal(new Set(developmentPlan.users.map((user) => user.password)).size, 4);
assert(developmentPlan.users.every((user) => user.password.length >= 40));
assert(developmentPlan.users.every((user) => !defaults.has(user.username) || user.password !== defaults.get(user.username)));

const testFile = fileURLToPath(import.meta.url);
const tsxCli = path.resolve(path.dirname(testFile), '../../node_modules/tsx/dist/cli.mjs');

async function assertDatabaseSeed(mode: 'development' | 'disabled' | 'enabled') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `xmt-bootstrap-${mode}-`));
  try {
    const env = { ...process.env };
    env.NODE_ENV = mode === 'development' ? 'development' : 'production';
    env.LOG_LEVEL = 'silent';
    env.XMT_DB_PATH = path.join(directory, 'bootstrap.db');
    env.JWT_SECRET = 'bootstrap-seed-test-secret';
    if (mode === 'enabled') env.XMT_BOOTSTRAP_SEED_USERS = 'true';
    else delete env.XMT_BOOTSTRAP_SEED_USERS;

    const child = spawnSync(process.execPath, [tsxCli, testFile, `--child-${mode}`], {
      env,
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(child.status, 0, `bootstrap child exited with status ${child.status ?? 'signal'}`);
    const combinedOutput = `${child.stdout}\n${child.stderr}`;
    assert.equal(/[A-Za-z0-9_-]{43}/.test(combinedOutput), false, 'spawned test processes never print generated passwords');
    const resultLine = child.stdout.split('\n').find((line) => line.startsWith('BOOTSTRAP_RESULT='));
    assert(resultLine, 'child process returns a sanitized database result');
    return JSON.parse(resultLine.slice('BOOTSTRAP_RESULT='.length)) as {
      mode: string;
      users: Array<{ username: string; force_change_password: number }>;
      knownDefaultPasswordsMatch: boolean[];
      credentialLogCount: number;
      credentialLogUsernames: string[];
      credentialsMatchSeededUsers: boolean[];
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const childMode = process.argv.find((argument) => ['--child-development', '--child-disabled', '--child-enabled'].includes(argument));
if (childMode) {
  const mode = childMode === '--child-enabled' ? 'enabled' : childMode === '--child-development' ? 'development' : 'disabled';
  const { apiLogger } = await import('../../api/observability/logger.js');
  const capturedCredentials = new Map<string, string>();
  const mutableLogger = apiLogger as unknown as { warn: (...args: unknown[]) => unknown };
  const originalWarn = mutableLogger.warn.bind(apiLogger);
  mutableLogger.warn = (details: unknown, ...args: unknown[]) => {
    if (details && typeof details === 'object' && (details as { operation?: string }).operation === 'default_users.bootstrap_credentials') {
      const record = details as { username?: unknown; bootstrapCredential?: unknown };
      capturedCredentials.set(String(record.username || ''), String(record.bootstrapCredential || ''));
      return undefined;
    }
    return originalWarn(details, ...args);
  };

  const { initDatabase, db, closeDatabase } = await import('../../api/database/db.js');
  await initDatabase();
  await initDatabase();
  const result = await db.execute({
    sql: `SELECT username, password, force_change_password FROM users
          WHERE username IN ('admin', 'director', 'member1', 'member2') ORDER BY username`,
  });
  const users = result.rows.map((row) => ({
    username: String(row.username),
    password: String(row.password),
    force_change_password: Number(row.force_change_password),
  }));
  const knownDefaultPasswordsMatch: boolean[] = [];
  const credentialsMatchSeededUsers: boolean[] = [];
  if (mode !== 'disabled') {
    const bcrypt = await import('bcrypt');
    for (const user of users) {
      knownDefaultPasswordsMatch.push(await bcrypt.compare(defaults.get(user.username)!, user.password));
      const capturedCredential = capturedCredentials.get(user.username);
      credentialsMatchSeededUsers.push(capturedCredential ? await bcrypt.compare(capturedCredential, user.password) : false);
    }
  }
  console.log(`BOOTSTRAP_RESULT=${JSON.stringify({
    mode,
    users: users.map(({ username, force_change_password }) => ({ username, force_change_password })),
    knownDefaultPasswordsMatch,
    credentialLogCount: capturedCredentials.size,
    credentialLogUsernames: [...capturedCredentials.keys()],
    credentialsMatchSeededUsers,
  })}`);
  closeDatabase();
} else {
  const development = await assertDatabaseSeed('development');
  assert.deepEqual(development.users.map((user) => user.username), [...defaults.keys()]);
  assert(development.users.every((user) => user.force_change_password === 1), 'development bootstrap accounts require password change');
  assert(development.knownDefaultPasswordsMatch.every((matches) => !matches), 'development bootstrap passwords do not match known weak defaults');
  assert.equal(development.credentialLogCount, 0, 'non-interactive development runs do not emit credentials');

  const disabled = await assertDatabaseSeed('disabled');
  assert.equal(disabled.users.length, 0, 'production seeding is disabled unless explicitly enabled');
  assert.equal(disabled.credentialLogCount, 0, 'disabled production seeding does not emit credentials');

  const enabled = await assertDatabaseSeed('enabled');
  assert.deepEqual(enabled.users.map((user) => user.username), [...defaults.keys()]);
  assert(enabled.users.every((user) => user.force_change_password === 1), 'production bootstrap accounts require password change');
  assert(enabled.knownDefaultPasswordsMatch.every((matches) => !matches), 'production bootstrap passwords do not match the source defaults');
  assert.equal(enabled.credentialLogCount, 4, 'production credentials are emitted only during first account creation');
  assert.deepEqual(enabled.credentialLogUsernames, [...defaults.keys()]);
  assert(enabled.credentialsMatchSeededUsers.every(Boolean), 'captured production bootstrap credentials match seeded password hashes');

  console.log('Production bootstrap seed security tests passed');
}
