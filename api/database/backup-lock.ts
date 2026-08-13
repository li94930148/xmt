import fs from 'node:fs';
import path from 'node:path';

export class BackupLockBusyError extends Error {
  constructor() { super('LOCK_BUSY'); }
}

function lockDirectory(lockPath: string) { return `${lockPath}.d`; }

// The directory is the shared protocol for Node, deploy, and systemd backup callers.
// It is released in finally; stale local owners are recovered only when their PID is gone.
export async function withBackupLock<T>(operation: () => Promise<T>, lockPath = process.env.XMT_BACKUP_LOCK_PATH || path.join(path.dirname(process.env.XMT_DB_PATH || path.join(process.cwd(), 'data/xmt.db')), '.xmt-backup.lock')): Promise<T> {
  const directory = lockDirectory(lockPath);
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const ownerFile = path.join(directory, 'owner');
    const owner = Number.parseInt(fs.existsSync(ownerFile) ? fs.readFileSync(ownerFile, 'utf8') : '', 10);
    if (Number.isInteger(owner) && owner > 1) {
      try { process.kill(owner, 0); } catch { fs.rmSync(directory, { recursive: true, force: true }); return withBackupLock(operation, lockPath); }
    }
    throw new BackupLockBusyError();
  }
  fs.writeFileSync(path.join(directory, 'owner'), String(process.pid), { mode: 0o600 });
  try { return await operation(); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
