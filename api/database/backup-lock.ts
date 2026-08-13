import fs from 'node:fs';
import path from 'node:path';

export class BackupLockBusyError extends Error {
  constructor() { super('LOCK_BUSY'); }
}

function lockDirectory(lockPath: string) { return `${lockPath}.d`; }
function processStartTime(pid: number): string | undefined {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
  } catch { return undefined; }
}

function ownerIsStale(ownerText: string): boolean {
  const [pidText, expectedStart] = ownerText.trim().split(':'); const pid = Number.parseInt(pidText, 10);
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try { process.kill(pid, 0); } catch { return true; }
  const actualStart = processStartTime(pid);
  return Boolean(expectedStart && actualStart && expectedStart !== actualStart);
}

// The directory is the shared protocol for Node, deploy, and systemd backup callers.
// It is released in finally; Linux start-time metadata prevents PID reuse from keeping a stale lock alive.
export async function withBackupLock<T>(operation: () => Promise<T>, lockPath = process.env.XMT_BACKUP_LOCK_PATH || path.join(path.dirname(process.env.XMT_DB_PATH || path.join(process.cwd(), 'data/xmt.db')), '.xmt-backup.lock')): Promise<T> {
  const directory = lockDirectory(lockPath);
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!fs.lstatSync(directory).isDirectory()) throw new BackupLockBusyError();
    const ownerFile = path.join(directory, 'owner');
    if (fs.existsSync(ownerFile) && ownerIsStale(fs.readFileSync(ownerFile, 'utf8'))) { fs.rmSync(directory, { recursive: true, force: true }); return withBackupLock(operation, lockPath); }
    throw new BackupLockBusyError();
  }
  fs.writeFileSync(path.join(directory, 'owner'), `${process.pid}:${processStartTime(process.pid) || ''}`, { mode: 0o600 });
  try { return await operation(); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
