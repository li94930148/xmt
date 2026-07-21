import { useAuthStore } from '../store';
const base = '/api/douyin';
const headers = () => ({ Authorization: `Bearer ${useAuthStore.getState().token}` });
async function request<T>(path: string, options?: RequestInit): Promise<T> { const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers(), ...options?.headers } }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || '抖音开放平台请求失败'); return response.json() as Promise<T>; }
export type DouyinAccount = { id: number; nickname?: string; open_id: string; avatar?: string; status: string; expires_at?: string; last_sync_at?: string };
export type DouyinStatistics = { account_count: number; video_count: number; play_count: number; like_count: number; comment_count: number; share_count: number };
export const getOpenDouyinAccounts = () => request<DouyinAccount[]>('/accounts');
export const getOpenDouyinStatistics = () => request<DouyinStatistics>('/statistics');
export const getOpenDouyinVideos = () => request<Array<Record<string, unknown>>>('/videos');
export const startDouyinBinding = () => request<{ authorization_url: string }>('/accounts/bind', { method: 'POST' });
export const syncDouyin = (account_id: number) => request('/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id }) });
export const getDouyinAnalysis = () => request<{ top10: Array<{ title: string; play_count: number; engagement_rate: number }>; best_publishing_hours: Array<{ hour: number; average_play_count: number }> }>('/analysis');
