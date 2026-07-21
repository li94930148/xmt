import { DOUYIN_OAUTH_TOKEN_URL, getDouyinConfig } from './constants.js';
import type { DouyinTokenResponse } from './types.js';

export async function exchangeCodeForToken(code: string): Promise<DouyinTokenResponse> {
  const { clientKey, clientSecret } = getDouyinConfig();
  if (!clientKey || !clientSecret) throw new Error('DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET 未配置');
  const body = new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, code, grant_type: 'authorization_code' });
  const response = await fetch(DOUYIN_OAUTH_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`抖音 token 接口请求失败: HTTP ${response.status}`);
  return response.json() as Promise<DouyinTokenResponse>;
}

export async function callDouyinApi<T>(url: string, accessToken: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!url) throw new Error('对应的抖音数据 OpenAPI URL 尚未配置');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'access-token': accessToken }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`抖音 OpenAPI 请求失败: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
