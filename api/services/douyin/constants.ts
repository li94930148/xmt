export const DOUYIN_OAUTH_AUTHORIZE_URL = 'https://open.douyin.com/platform/oauth/connect/';
export const DOUYIN_OAUTH_TOKEN_URL = 'https://open.douyin.com/oauth/access_token/';
export const DEFAULT_DOUYIN_SCOPES = ['user_info'];
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function getDouyinConfig() {
  return {
    clientKey: process.env.DOUYIN_CLIENT_KEY || '',
    clientSecret: process.env.DOUYIN_CLIENT_SECRET || '',
    redirectUri: process.env.DOUYIN_REDIRECT_URI || '',
    webhookSecret: process.env.DOUYIN_WEBHOOK_SECRET || '',
    videoListUrl: process.env.DOUYIN_VIDEO_LIST_URL || '',
    videoStatisticsUrl: process.env.DOUYIN_VIDEO_STATISTICS_URL || '',
  };
}
