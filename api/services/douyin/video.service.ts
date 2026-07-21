import { callDouyinApi } from './client.js';
import { getDouyinConfig } from './constants.js';

export type RemoteVideo = { item_id: string; title?: string; cover?: string; share_url?: string; create_time?: number; statistics?: Record<string, number>; play_count?: number; like_count?: number; comment_count?: number; share_count?: number; collect_count?: number };
export async function fetchAuthorizedVideos(accessToken: string, openId: string) {
  const { videoListUrl } = getDouyinConfig();
  const result = await callDouyinApi<{ data?: { list?: RemoteVideo[] }; err_no?: number; err_msg?: string }>(videoListUrl, accessToken, { open_id: openId });
  if (result.err_no && result.err_no !== 0) throw new Error(result.err_msg || '获取视频列表失败');
  return result.data?.list ?? [];
}
export async function fetchVideoStatistics(accessToken: string, openId: string, itemIds: string[]) {
  const { videoStatisticsUrl } = getDouyinConfig();
  const result = await callDouyinApi<{ data?: { list?: RemoteVideo[] }; err_no?: number; err_msg?: string }>(videoStatisticsUrl, accessToken, { open_id: openId, item_ids: itemIds });
  if (result.err_no && result.err_no !== 0) throw new Error(result.err_msg || '获取视频统计数据失败');
  return result.data?.list ?? [];
}
