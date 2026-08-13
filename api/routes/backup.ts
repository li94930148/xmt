import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import fs from 'fs';
import path from 'path';
import { beijingNow } from '../database/utils';
import { getDatabasePath } from '../database/path';
import { db } from '../database/db';
import { BackupLockBusyError, withBackupLock } from '../database/backup-lock.js';

const router = Router();

const DB_PATH = getDatabasePath();
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const BACKUP_NAME = /^xmt-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}(?:-\d+-[a-f0-9]{8})?\.db$/;

// 确保备份目录存在
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function resolveBackupPath(name: unknown): string | null {
  if (typeof name !== 'string' || !BACKUP_NAME.test(name) || path.basename(name) !== name) return null;
  const backupDirectory = path.resolve(BACKUP_DIR);
  const candidate = path.resolve(backupDirectory, name);
  return path.dirname(candidate) === backupDirectory ? candidate : null;
}

// 创建备份
async function createBackup(): Promise<string> {
  return withBackupLock(async () => {
  ensureBackupDir();
  const dateStr = `${beijingNow().replace(/[: ]/g, '-')}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const backupName = `xmt-${dateStr}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  const temporaryPath = `${backupPath}.tmp`;

  if (fs.existsSync(temporaryPath)) {
    fs.unlinkSync(temporaryPath);
  }

  await db.execute({
    sql: 'VACUUM INTO ?',
    args: [temporaryPath],
  });
  fs.renameSync(temporaryPath, backupPath);

  return backupName;
  });
}

// 手动创建备份
router.post('/create', authenticate, requirePermission('system:backup'), async (req, res) => {
  try {
    const name = await createBackup();
    res.json({ message: '备份创建成功', name });
  } catch (error) {
    if (error instanceof BackupLockBusyError) return res.status(409).json({ message: '备份正在进行', code: 'LOCK_BUSY' });
    res.status(500).json({ message: '备份创建失败', error: (error as Error).message });
  }
});

// 获取备份列表
router.get('/list', authenticate, requirePermission('system:backup'), (req, res) => {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          name: f,
          size: stat.size,
          created: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => b.created.localeCompare(a.created));
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: '获取备份列表失败', error: (error as Error).message });
  }
});

// 下载备份
router.get('/download/:name', authenticate, requirePermission('system:backup'), (req, res) => {
  try {
    const filePath = resolveBackupPath(req.params.name);
    if (!filePath) return res.status(400).json({ message: '备份文件名无效' });
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: '备份文件不存在' });
    }
    res.download(filePath, req.params.name);
  } catch (error) {
    res.status(500).json({ message: '下载失败', error: (error as Error).message });
  }
});

// 删除备份
router.delete('/:name', authenticate, requirePermission('system:backup'), (req, res) => {
  try {
    const filePath = resolveBackupPath(req.params.name);
    if (!filePath) return res.status(400).json({ message: '备份文件名无效' });
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: '备份文件不存在' });
    }
    fs.unlinkSync(filePath);
    res.json({ message: '备份已删除' });
  } catch (error) {
    res.status(500).json({ message: '删除失败', error: (error as Error).message });
  }
});

// 自动清理旧备份（保留最近30个）
export function cleanOldBackups() {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    if (files.length > 30) {
      for (const f of files.slice(30)) {
        fs.unlinkSync(path.join(BACKUP_DIR, f.name));
      }
    }
  } catch { /* ignore */ }
}

export { createBackup };
export default router;
