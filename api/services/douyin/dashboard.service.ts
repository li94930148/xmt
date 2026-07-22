import { callDouyinApi } from './client.js';

export type DashboardMetric = {
  date: string;
  play_count: number;
  new_fans: number;
  new_like_count: number;
  new_comment_count: number;
  profile_view_count: number;
};

const num = (value: unknown) => Number(value || 0);
const date = (value: unknown) => String(value || new Date().toISOString().slice(0, 10));

export async function fetchAccountDashboard(accessToken: string, openId: string): Promise<{ metrics: DashboardMetric[]; raw: unknown }> {
  const endpoint = process.env.DOUYIN_EXTERNAL_USER_URL || 'https://open.douyin.com/data/external/user/';
  const result = await callDouyinApi<Record<string, unknown>>(endpoint, accessToken, {
    open_id: openId,
    date_type: 30,
  });
  const errorCode = num(result.error_code ?? result.err_no);
  if (errorCode) throw new Error(String(result.description ?? result.err_msg ?? '获取抖音账号经营数据失败'));
  const data = (result.data && typeof result.data === 'object' ? result.data : result) as Record<string, unknown>;
  const rows = (Array.isArray(data.result_list) ? data.result_list : Array.isArray(data.list) ? data.list : []) as Record<string, unknown>[];
  return {
    metrics: rows.map((row) => ({
      date: date(row.date ?? row.stat_date), play_count: num(row.play_count), new_fans: num(row.new_fans),
      new_like_count: num(row.new_like_count), new_comment_count: num(row.new_comment_count),
      profile_view_count: num(row.profile_view_count),
    })),
    raw: result,
  };
}

export async function fetchFansSources(accessToken: string, openId: string): Promise<{ sources: Array<{ date: string; source_type: string; count: number; raw: unknown }>; raw: unknown }> {
  const endpoint = process.env.DOUYIN_FANS_SOURCE_URL || 'https://open.douyin.com/data/external/fans/source/';
  const result = await callDouyinApi<Record<string, unknown>>(endpoint, accessToken, { open_id: openId });
  const errorCode = num(result.error_code ?? result.err_no);
  if (errorCode) throw new Error(String(result.description ?? result.err_msg ?? '获取抖音粉丝来源失败'));
  const data = (result.data && typeof result.data === 'object' ? result.data : result) as Record<string, unknown>;
  const rows = (Array.isArray(data.source_list) ? data.source_list : Array.isArray(data.list) ? data.list : []) as Record<string, unknown>[];
  return {
    sources: rows.map((row) => ({ date: date(row.date ?? row.stat_date), source_type: String(row.source_type ?? row.source ?? 'unknown'), count: num(row.count ?? row.value), raw: row })),
    raw: result,
  };
}
