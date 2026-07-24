import fs from 'node:fs';
import path from 'node:path';
import { douyinDataNormalizer } from '../api/services/douyinDataNormalizer.js';

const input = process.argv[2];
if (!input) {
  console.error('用法: npm run test:douyin:sync -- <Creator Agent network.json> [douyin_uid]');
  process.exit(2);
}
const file = path.resolve(input);
if (!fs.existsSync(file)) throw new Error(`真实采集文件不存在: ${file}`);
const captured = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
const captures = Array.isArray(captured.captures) ? captured.captures : [];
if (!captures.length) throw new Error('文件中没有真实 Network Collector captures');
const rawRecords = captures.map(value => {
  const item = value as Record<string, unknown>;
  return { page: item.page, url: item.url, method: item.method, response: item.response, captured_at: item.captured_at };
});
const result = douyinDataNormalizer.normalize({ raw_records: rawRecords }, process.argv[3] || 'captured-account');
const forbidden = result.works.filter(work => ['react','flash_mod_modal','start_flash_mod'].includes(work.title.trim().toLowerCase()));
const missingIds = result.works.filter(work => !work.aweme_id);
if (!result.works.length) throw new Error('未识别到作品：请确认采集文件包含 aweme_list/item_list 作品接口');
if (forbidden.length) throw new Error(`仍包含内部模块字段: ${forbidden.map(work => work.title).join(', ')}`);
if (missingIds.length) throw new Error(`存在缺少 aweme_id 的作品: ${missingIds.length}`);
console.log(JSON.stringify({ source: file, api_count: result.api_count, account: result.account, works_count: result.works.length, rejected_count: result.rejected_count, metric_non_zero: result.works.filter(work => work.play_count || work.like_count || work.comment_count || work.share_count).length, first_three: result.works.slice(0, 3).map(work => ({ aweme_id: work.aweme_id, title: work.title, play_count: work.play_count, like_count: work.like_count })) }, null, 2));
