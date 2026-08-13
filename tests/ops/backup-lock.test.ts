import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BackupLockBusyError, withBackupLock } from '../../api/database/backup-lock.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-backup-lock-test-')); const lock = path.join(directory, 'backup.lock');
let release!: () => void;
const first = withBackupLock(() => new Promise<void>((resolve) => { release = resolve; }), lock);
await new Promise((resolve) => setTimeout(resolve, 10));
await assert.rejects(() => withBackupLock(async () => undefined, lock), BackupLockBusyError);
release(); await first;
await withBackupLock(async () => undefined, lock);
assert.equal(fs.existsSync(`${lock}.d`), false);
fs.mkdirSync(`${lock}.d`); fs.writeFileSync(path.join(`${lock}.d`, 'owner'), '99999999');
await withBackupLock(async () => undefined, lock);
assert.equal(fs.existsSync(`${lock}.d`), false);
if (fs.existsSync('/proc/self/stat')) {
  fs.mkdirSync(`${lock}.d`); fs.writeFileSync(path.join(`${lock}.d`, 'owner'), `${process.pid}:not-the-current-start-time`);
  await withBackupLock(async () => undefined, lock);
  assert.equal(fs.existsSync(`${lock}.d`), false);
}
fs.rmSync(directory, { recursive: true, force: true });
console.log('backup lock tests passed');
