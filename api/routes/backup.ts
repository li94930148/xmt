import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import fs from 'fs';
import path from 'path';
import { beijingNow } from '../database/utils';
import { getDatabasePath } from '../database/path';
import { db } from '../database/db';
import { BackupLockBusyError, isBackupLockHeld, withBackupLock } from '../database/backup-lock.js';
import { getBackupSources, listBackupInventory, resolveInventoryBackup } from '../services/backupInventory.js';

const router = Router();

const DB_PATH = getDatabasePath();
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const BACKUP_SOURCES = getBackupSources(DB_PATH);
const BACKUP_NAME = /^xmt-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}(?:-\d+-[a-f0-9]{8,64})?\.db$/;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function backupRequestDigest(actorId: number, requestId: string): string {
  return createHash('sha256').update(`${actorId}:backup-create:${requestId.toLowerCase()}`).digest('hex').slice(0, 24);
}

function findBackupForRequest(actorId: number, requestId: string): string | null {
  const digest = backupRequestDigest(actorId, requestId);
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const matches = fs.readdirSync(BACKUP_DIR).filter((name) => {
    if (!BACKUP_NAME.test(name) || !name.endsWith(`-${digest}.db`)) return false;
    try {
      return fs.lstatSync(path.join(BACKUP_DIR, name)).isFile();
    } catch {
      return false;
    }
  });
  if (matches.length > 1) throw new Error('备份请求关联文件不唯一，已停止自动恢复');
  return matches[0] ?? null;
}

function isValidBackupRequest(actorId: number, requestId: string): boolean {
  return Number.isSafeInteger(actorId) && actorId > 0 && REQUEST_ID_PATTERN.test(requestId);
}

export function getBackupCreateRequestStatus(actorId: number, requestId: string): { state: 'created'; name: string } | { state: 'pending' } | { state: 'not_found' } {
  if (!isValidBackupRequest(actorId, requestId)) throw new Error('备份请求编号无效');
  const name = findBackupForRequest(actorId, requestId);
  if (name) return { state: 'created', name };
  if (isBackupLockHeld()) return { state: 'pending' };
  return { state: 'not_found' };
}

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
async function createBackup(actorId: number, requestId?: string): Promise<string> {
  if (requestId !== undefined && !isValidBackupRequest(actorId, requestId)) throw new Error('备份请求编号无效');
  return withBackupLock(async () => {
  ensureBackupDir();
  const existingBackup = requestId ? findBackupForRequest(actorId, requestId) : null;
  if (existingBackup) return existingBackup;
  const requestSuffix = requestId ? `-${backupRequestDigest(actorId, requestId)}` : `-${randomUUID().slice(0, 8)}`;
  const dateStr = `${beijingNow().replace(/[: ]/g, '-')}-${process.pid}${requestSuffix}`;
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
    const actorId = Number(req.user?.id);
    const hasRequestId = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'client_request_id');
    const requestId = typeof req.body?.client_request_id === 'string' ? req.body.client_request_id : undefined;
    if (hasRequestId && (!requestId || !isValidBackupRequest(actorId, requestId))) return res.status(400).json({ message: '备份请求编号无效' });
    const name = await createBackup(actorId, requestId);
    res.json({ message: '备份创建成功', name });
  } catch (error) {
    if (error instanceof BackupLockBusyError) return res.status(409).json({ message: '备份正在进行', code: 'LOCK_BUSY' });
    res.status(500).json({ message: '备份创建失败' });
  }
});

router.get('/create-requests/:requestId', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, authenticate, requirePermission('system:backup'), (req, res) => {
  const actorId = Number(req.user?.id);
  const requestId = String(req.params.requestId || '');
  if (!isValidBackupRequest(actorId, requestId)) return res.status(400).json({ message: '备份请求编号无效' });
  try {
    return res.json(getBackupCreateRequestStatus(actorId, requestId));
  } catch {
    return res.status(500).json({ message: '暂时无法核实备份状态' });
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
  } catch {
    res.status(500).json({ message: '获取备份列表失败' });
  }
});

// 汇总应用、部署应急和系统定时备份。目录由服务端白名单配置，响应不暴露绝对路径。
router.get('/inventory', authenticate, requirePermission('system:backup'), (req, res) => {
  try {
    res.json(listBackupInventory(BACKUP_SOURCES));
  } catch {
    res.status(500).json({ message: '获取备份清单失败' });
  }
});

router.get('/download/:source/:name', authenticate, requirePermission('system:backup'), (req, res) => {
  try {
    const filePath = resolveInventoryBackup(BACKUP_SOURCES, req.params.source, req.params.name);
    if (!filePath) return res.status(404).json({ message: '备份文件不存在或不在允许目录中' });
    res.download(filePath, req.params.name);
  } catch {
    res.status(500).json({ message: '下载失败' });
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
  } catch {
    res.status(500).json({ message: '下载失败' });
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
  } catch {
    res.status(500).json({ message: '删除失败' });
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
