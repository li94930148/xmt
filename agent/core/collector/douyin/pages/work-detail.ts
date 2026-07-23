import type { Page } from 'playwright';
import type { CreatorWorkDetail, NetworkCapture } from '../../../types.js';
import { metrics, objects } from '../parser/common.js';
import { bodySnapshot, clickLabels, openPage } from './helpers.js';

export async function collectWorkDetail(page: Page, itemId: string, captures: NetworkCapture[]): Promise<CreatorWorkDetail> {
  const start = captures.length;
  await openPage(page, `https://creator.douyin.com/creator-micro/work-management/work-detail/${encodeURIComponent(itemId)}`);
  await clickLabels(page, ['总览', '流量分析', '流量来源', '推荐流量', '搜索流量', '主页流量', '粉丝流量', '观众分析', '性别', '年龄', '地域', '在线时间', '兴趣标签', '评论分析', '热门评论', '评论关键词']);
  const raw = captures.slice(start).map((capture) => capture.response);
  const overview = Object.assign({}, ...raw.flatMap((value) => objects(value)).map(metrics));
  return { item_id: itemId, overview, traffic: raw, audience: raw, comments: raw, raw: { network: raw, dom: await bodySnapshot(page) } };
}
