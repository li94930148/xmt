import type { SocialAccount } from '@shared/types/social-review';
import { DouyinPlaywrightAdapterV3 } from './douyin-playwright-v3.js';
import type { SocialReviewAdapter } from './base.js';

export function getSocialFetchAdapter(account: SocialAccount): SocialReviewAdapter {
  if (account.platform === 'douyin' && account.fetch_strategy === 'native_playwright') return new DouyinPlaywrightAdapterV3();
  throw new Error('当前账号暂不支持真实采集。');
}
