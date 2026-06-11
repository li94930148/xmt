import { useAuthStore } from '../store';
import type { DouyinAccount, DouyinSnapshot, DouyinVideo } from '@shared/types';

const BASE_URL = '/api/douyin';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { DouyinAccount, DouyinSnapshot, DouyinVideo };

// 账号管理
export async function getDouyinAccounts(): Promise<DouyinAccount[]> {
  const res = await fetch(`${BASE_URL}/accounts`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error('获取账号列表失败');
  return res.json();
}

export async function addDouyinAccount(data: { name: string; profileUrl: string }): Promise<{ id: number }> {
  const res = await fetch(`${BASE_URL}/accounts`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('添加账号失败');
  return res.json();
}

export async function deleteDouyinAccount(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/accounts/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('删除账号失败');
}

// 抓取
export async function scrapeDouyin(accountId: number): Promise<{ snapshot: DouyinSnapshot }> {
  const res = await fetch(`${BASE_URL}/scrape/${accountId}`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || '抓取失败');
  }
  return res.json();
}

// 历史数据
export async function getDouyinSnapshots(accountId: number, limit?: number): Promise<DouyinSnapshot[]> {
  const params = limit ? `?limit=${limit}` : '';
  const res = await fetch(`${BASE_URL}/snapshots/${accountId}${params}`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error('获取快照失败');
  return res.json();
}

export async function getDouyinVideos(snapshotId: number): Promise<DouyinVideo[]> {
  const res = await fetch(`${BASE_URL}/snapshot/${snapshotId}/videos`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error('获取视频列表失败');
  return res.json();
}

export async function getDouyinTrend(accountId: number, days?: number): Promise<DouyinSnapshot[]> {
  const params = days ? `?days=${days}` : '';
  const res = await fetch(`${BASE_URL}/trend/${accountId}${params}`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error('获取趋势数据失败');
  return res.json();
}
