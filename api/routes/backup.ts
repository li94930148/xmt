import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beijingNow } from '../database/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

const DB_PATH = path.join(process.cwd(), 'data', 'xmt.db');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

// 确保备份目录存在
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// 创建备份
function createBackup(): string {
  ensureBackupDir();
  const dateStr = beijingNow().replace(/[: ]/g, '-');
  const backupName = `xmt-${dateStr}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  fs.copyFileSync(DB_PATH, backupPath);
  return backupName;
}

// 手动创建备份
router.post('/create', authenticate, requireRole(['admin']), (req, res) => {
  try {
    const name = createBackup();
    res.json({ message: '备份创建成功', name });
  } catch (error) {
    res.status(500).json({ message: '备份创建失败', error: (error as Error).message });
  }
});

// 获取备份列表
router.get('/list', authenticate, requireRole(['admin']), (req, res) => {
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
router.get('/download/:name', authenticate, requireRole(['admin']), (req, res) => {
  try {
    const filePath = path.join(BACKUP_DIR, req.params.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: '备份文件不存在' });
    }
    res.download(filePath, req.params.name);
  } catch (error) {
    res.status(500).json({ message: '下载失败', error: (error as Error).message });
  }
});

// 删除备份
router.delete('/:name', authenticate, requireRole(['admin']), (req, res) => {
  try {
    const filePath = path.join(BACKUP_DIR, req.params.name);
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
