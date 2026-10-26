import { useAuthStore } from '../store';
import type { BackupFile } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { BackupFile };

export type BackupInventory = {
  files: BackupFile[];
  sources: Array<{ id: string; label: string; available: boolean; fileCount: number }>;
};

export type BackupCreateRequestStatus =
  | { state: 'created'; name: string }
  | { state: 'pending' }
  | { state: 'not_found' };

export class BackupApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'BackupApiError';
  }
}

export async function createBackup(requestId: string): Promise<{ message: string; name: string }> {
  const response = await fetch(`${BASE_URL}/backup/create`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_request_id: requestId }),
  });
  if (!response.ok) throw new Error('备份创建失败');
  return response.json();
}

export async function getBackupCreateRequestStatus(requestId: string): Promise<BackupCreateRequestStatus> {
  const response = await fetch(`${BASE_URL}/backup/create-requests/${encodeURIComponent(requestId)}`, {
    headers: { ...getAuthHeader() },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('暂时无法核实备份状态');
  return response.json();
}

export async function getBackupList(): Promise<BackupFile[]> {
  const response = await fetch(`${BASE_URL}/backup/list`, {
    headers: { ...getAuthHeader() },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('获取备份列表失败');
  return response.json();
}

export async function getBackupInventory(): Promise<BackupInventory> {
  const response = await fetch(`${BASE_URL}/backup/inventory`, { headers: { ...getAuthHeader() } });
  if (!response.ok) throw new Error('获取服务器备份清单失败');
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

export async function downloadInventoryBackup(source: string, name: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/backup/download/${encodeURIComponent(source)}/${encodeURIComponent(name)}`, {
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
  if (!response.ok) throw new BackupApiError('删除失败', response.status);
}
