import { useAuthStore } from '../store';
import type { BackupFile } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { BackupFile };

export async function createBackup(): Promise<{ message: string; name: string }> {
  const response = await fetch(`${BASE_URL}/backup/create`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
  });
  if (!response.ok) throw new Error('备份创建失败');
  return response.json();
}

export async function getBackupList(): Promise<BackupFile[]> {
  const response = await fetch(`${BASE_URL}/backup/list`, {
    headers: { ...getAuthHeader() },
  });
  if (!response.ok) throw new Error('获取备份列表失败');
  return response.json();
}

export async function downloadBackup(name: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/backup/download/${encodeURIComponent(name)}`, {
    headers: { ...getAuthHeader() },
  });
  if (!response.ok) throw new Error('下载失败');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function deleteBackup(name: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/backup/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  if (!response.ok) throw new Error('删除失败');
}
