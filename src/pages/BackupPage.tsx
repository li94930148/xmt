import { useState, useEffect } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAppStore } from '../store';
import { useAuthStore } from '../store';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Database, Download, Trash2, RefreshCw,
  CheckCircle, AlertCircle, HardDrive, Clock, Shield,
} from 'lucide-react';
import { formatBeijingDate } from '../lib/utils';
import type { BackupFile } from '../types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getBackups(): Promise<BackupFile[]> {
  const res = await fetch(`${BASE_URL}/backup/list`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error('获取备份列表失败');
  return res.json();
}

async function createBackupNow(): Promise<{ name: string }> {
  const res = await fetch(`${BASE_URL}/backup/create`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('创建备份失败');
  return res.json();
}

async function downloadBackup(name: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/backup/download/${name}`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('下载备份失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BackupPage() {
  const styles = useThemeStyles();
  const appStore = useAppStore();
  const navigate = useNavigate();
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchBackups = async () => {
    try {
      const data = await getBackups();
      setBackups(data);
    } catch {
      // 静默处理
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createBackupNow();
      appStore.addNotification({ title: '备份成功', message: `已创建备份: ${result.name}`, type: 'success' });
      await fetchBackups();
    } catch (err) {
      appStore.addNotification({ title: '备份失败', message: (err as Error).message, type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (name: string) => {
    try {
      await downloadBackup(name);
      appStore.addNotification({ title: '下载成功', message: `${name} 已开始下载`, type: 'success' });
    } catch (err) {
      appStore.addNotification({ title: '下载失败', message: (err as Error).message, type: 'error' });
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-theme-text-muted hover:text-theme-text transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          返回首页
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-text">数据备份</h1>
          <p className="text-sm text-theme-text-muted mt-1">安全备份项目数据，防止数据丢失</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all disabled:opacity-50"
        >
          {creating ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Database className="w-4 h-4" />
          )}
          {creating ? '备份中...' : '立即备份'}
        </button>
      </div>

      {/* 安全提示 */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 p-5">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-400">数据安全保障</p>
            <p className="text-xs text-theme-text-muted mt-1">
              系统每天凌晨 3:00 自动备份，手动备份的文件会保留最近 30 天。所有备份文件存储在本地服务器。
            </p>
          </div>
        </div>
      </div>

      {/* 备份列表 */}
      <div className="rounded-2xl bg-theme-secondary border border-theme-border p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
            <HardDrive className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-base font-semibold text-theme-text">备份记录</h3>
          <span className="text-xs text-theme-text-muted">({backups.length} 个文件)</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-theme-text-muted" />
          </div>
        ) : backups.length > 0 ? (
          <div className="space-y-2">
            {backups.map((backup) => (
              <div
                key={backup.name}
                className="flex items-center gap-4 p-4 rounded-xl bg-theme-tertiary/50 hover:bg-theme-tertiary transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Database className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-theme-text truncate">{backup.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-theme-text-muted flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      {formatSize(backup.size)}
                    </span>
                    <span className="text-xs text-theme-text-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatBeijingDate(backup.created)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(backup.name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-tertiary hover:bg-theme-elevated text-theme-text text-xs font-medium transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Download className="w-3.5 h-3.5" />
                  下载
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Database className="w-12 h-12 mx-auto mb-3 text-theme-text-muted" />
            <p className="text-sm text-theme-text-muted">暂无备份记录</p>
            <p className="text-xs text-theme-text-muted mt-1">点击「立即备份」创建第一个备份</p>
          </div>
        )}
      </div>
    </div>
  );
}
