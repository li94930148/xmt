import { callDouyinApi } from './client.js';
export async function fetchAuthorizedUserProfile(accessToken: string, openId: string) {
  const result = await callDouyinApi<{ data?: { nickname?: string; avatar?: string; union_id?: string; open_id?: string }; err_no?: number; err_msg?: string }>('https://open.douyin.com/oauth/userinfo/', accessToken, { access_token: accessToken, open_id: openId });
  if (result.err_no && result.err_no !== 0) throw new Error(result.err_msg || '获取抖音用户公开信息失败');
  return result.data ?? {};
}
