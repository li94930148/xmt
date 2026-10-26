import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-backup-create-recovery-'));
const previousDbPath = process.env.XMT_DB_PATH;
const previousLockPath = process.env.XMT_BACKUP_LOCK_PATH;
const previousNodeEnv = process.env.NODE_ENV;
const previousJwtSecret = process.env.JWT_SECRET;
process.env.XMT_DB_PATH = path.join(root, 'data', 'xmt.db');
process.env.XMT_BACKUP_LOCK_PATH = path.join(root, '.backup.lock');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'backup-create-recovery-test-secret';

const { db, initDatabase } = await import('../../api/database/db.js');
const { createBackup, getBackupCreateRequestStatus } = await import('../../api/routes/backup.js');
const { withBackupLock } = await import('../../api/database/backup-lock.js');

try {
  await initDatabase();
  const actorId = 41;
  const requestId = 'c24cb8a7-f9bf-4d8f-a839-90b48153ca1d';
  const createdName = await createBackup(actorId, requestId);
  assert.match(createdName, /^xmt-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d+-[a-f0-9]{24}\.db$/);
  assert.deepEqual(getBackupCreateRequestStatus(actorId, requestId), { state: 'created', name: createdName });

  const replayedName = await createBackup(actorId, requestId);
  assert.equal(replayedName, createdName, 'replaying the same actor/request ID returns the original backup');
  const backupDir = path.join(path.dirname(process.env.XMT_DB_PATH!), 'backups');
  assert.equal(fs.readdirSync(backupDir).filter((name) => name.endsWith('.db')).length, 1, 'an idempotent replay creates no second backup');

  assert.deepEqual(getBackupCreateRequestStatus(actorId + 1, requestId), { state: 'not_found' }, 'request receipt is actor scoped');
  const missingRequestId = '8230ebaf-8150-414a-9118-e2b70c6e2f77';
  assert.deepEqual(getBackupCreateRequestStatus(actorId, missingRequestId), { state: 'not_found' });

  let pendingStatus: ReturnType<typeof getBackupCreateRequestStatus> | undefined;
  await withBackupLock(async () => {
    pendingStatus = getBackupCreateRequestStatus(actorId, missingRequestId);
  });
  assert.deepEqual(pendingStatus, { state: 'pending' }, 'an unknown request stays pending while a backup lock is held');

  const legacyName = await createBackup(actorId);
  assert.notEqual(legacyName, createdName, 'legacy callers without a request ID keep independent backup behavior');
  assert.equal(fs.readdirSync(backupDir).filter((name) => name.endsWith('.db')).length, 2);
  assert.throws(() => getBackupCreateRequestStatus(actorId, 'not-a-uuid'));
} finally {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
  if (previousDbPath === undefined) delete process.env.XMT_DB_PATH;
  else process.env.XMT_DB_PATH = previousDbPath;
  if (previousLockPath === undefined) delete process.env.XMT_BACKUP_LOCK_PATH;
  else process.env.XMT_BACKUP_LOCK_PATH = previousLockPath;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
}

console.log('backup create recovery tests passed');
