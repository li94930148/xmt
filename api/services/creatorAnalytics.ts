import { execute, executeInsert, queryAll, queryOne, runInTransaction } from '../database/utils.js';
import { getDouyinReportData } from './douyinDataCenter.js';
import { dateKeyBjt, parseStoredBjt } from '../../shared/time/index.js';

type JsonRecord = Record<string, unknown>;
type Period = '7d' | '30d' | '90d';
export type ReportType = 'daily' | 'weekly' | 'monthly';

type WorkRow = {
  id: number; account_id: number; platform_item_id: string; title: string; cover_url: string;
  publish_time: string; duration: number; raw_json: string; snapshot_time: string;
  play_count: number; like_count: number; comment_count: number; share_count: number;
  favorite_count: number; play_duration: number; completion_rate: number; metric_raw_json: string;
};
type AccountMetric = { snapshot_time: string; fans_count: number | null; play_count: number | null; interaction_count: number | null; profile_visit_count: number | null; growth_json: string; raw_json: string };
type CalendarWindow = { start: string; end: string };

const parse = (value: unknown): JsonRecord => {
  try { return typeof value === 'string' ? JSON.parse(value) as JsonRecord : value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
  catch { return {}; }
};
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const text = (value: unknown) => value == null ? '' : String(value);
const valueFrom = (sources: JsonRecord[], keys: string[]) => {
  for (const source of sources) for (const key of keys) if (source[key] != null && source[key] !== '') return number(source[key]);
  return 0;
};
const optionalValueFrom = (sources: JsonRecord[], keys: string[]) => {
  for (const source of sources) for (const key of keys) {
    const candidate = source[key];
    if (candidate == null || candidate === '') continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};
const objectFrom = (sources: JsonRecord[], keys: string[]) => {
  for (const source of sources) for (const key of keys) {
    const candidate = source[key];
    if (candidate && typeof candidate === 'object') return parse(candidate);
  }
  return {};
};
const arrayFrom = (sources: JsonRecord[], keys: string[]) => {
  for (const source of sources) for (const key of keys) if (Array.isArray(source[key])) return source[key] as unknown[];
  return [];
};
const daysFor = (period: Period | ReportType) => ({ '7d': 7, '30d': 30, '90d': 90, daily: 1, weekly: 7, monthly: 30 })[period];
const timestamp = (value: unknown) => {
  if (!(typeof value === 'string' || typeof value === 'number' || value instanceof Date)) return null;
  return parseStoredBjt(value)?.getTime() ?? null;
};
function shiftDateKey(dateKey: string, offset: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}
function calendarWindow(days: number, asOf: Date | number | string = new Date()): CalendarWindow {
  const end = dateKeyBjt(asOf);
  return { start: shiftDateKey(end, 1 - days), end };
}
function storedDateKey(value: unknown) {
  const instant = timestamp(value);
  return instant === null ? null : dateKeyBjt(instant);
}
function isInWindow(value: unknown, window: CalendarWindow) {
  const dateKey = storedDateKey(value);
  return dateKey !== null && dateKey >= window.start && dateKey <= window.end;
}
function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestWorkSql(extra = '') {
  return `SELECT i.id,i.account_id,i.platform_item_id,i.title,i.cover_url,i.publish_time,i.duration,i.raw_json,
    COALESCE(m.snapshot_time,i.created_at) snapshot_time,COALESCE(m.play_count,0) play_count,
    COALESCE(m.like_count,0) like_count,COALESCE(m.comment_count,0) comment_count,
    COALESCE(m.share_count,0) share_count,COALESCE(m.favorite_count,0) favorite_count,
    COALESCE(m.play_duration,0) play_duration,COALESCE(m.completion_rate,0) completion_rate,
    COALESCE(m.raw_json,'{}') metric_raw_json
    FROM creator_content_items i LEFT JOIN creator_content_metrics m ON m.id=(SELECT id FROM creator_content_metrics WHERE content_id=i.id ORDER BY snapshot_time DESC LIMIT 1)
    WHERE i.account_id=? ${extra}`;
}

function extractComments(sources: JsonRecord[]) {
  const rows = arrayFrom(sources, ['comments', 'comment_list', 'top_comments', 'comment_data']);
  const comments = rows.map((item) => typeof item === 'string' ? item : text(parse(item).text || parse(item).content || parse(item).comment)).filter(Boolean).slice(0, 500);
  const stop = new Set(['这个','那个','真的','就是','还是','感觉','视频','作品','一个','可以','没有','不是','什么','怎么','我们','你们','他们']);
  const words = comments.flatMap((comment) => comment.match(/[\p{Script=Han}]{2,6}|[A-Za-z0-9]{2,}/gu) || []).filter((word) => !stop.has(word));
  const counts = words.reduce<Record<string, number>>((result, word) => { result[word] = (result[word] || 0) + 1; return result; }, {});
  const keywords = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word, count]) => ({ word, count }));
  const directions = [
    ['正向认可', /喜欢|好看|有用|学会|支持|优秀|精彩|收藏/],
    ['问题咨询', /怎么|如何|哪里|多少|请问|求|教程/],
    ['购买意向', /购买|链接|价格|怎么买|同款|下单/],
    ['改进建议', /建议|希望|可以再|声音|字幕|太快|太慢/],
    ['负向反馈', /不好|失望|无聊|错误|太差|看不懂/],
  ] as const;
  const feedback = directions.map(([label, pattern]) => ({ label, count: comments.filter((comment) => pattern.test(comment)).length })).sort((a, b) => b.count - a.count);
  return { count: comments.length, hot_words: keywords.slice(0, 6), keywords, feedback, samples: comments.slice(0, 8) };
}

function extractTraffic(sources: JsonRecord[]) {
  const raw = objectFrom(sources, ['traffic', 'traffic_source', 'traffic_sources', 'flow_source', 'source_distribution']);
  const find = (keys: string[]) => keys.reduce((sum, key) => sum + number(raw[key]), 0);
  const recommendation = find(['recommend','recommendation','推荐','推荐流量','for_you']);
  const search = find(['search','搜索','搜索流量']);
  const following = find(['follow','following','关注','关注流量','followers']);
  const known = recommendation + search + following;
  const total = Object.values(raw).reduce<number>((sum, item) => sum + number(parse(item).value ?? item), 0);
  const other = Math.max(0, total - known) || find(['other','其他','其他来源']);
  return { recommendation, search, following, other, raw };
}

function ratingFor(work: WorkRow, medianPlay: number) {
  const raw = parse(work.raw_json), metricRaw = parse(work.metric_raw_json), sources = [metricRaw, raw, parse(raw.metrics), parse(raw.data)];
  const plays = number(work.play_count);
  const interactions = number(work.like_count) + number(work.comment_count) + number(work.share_count) + number(work.favorite_count);
  const engagementRate = plays ? interactions / plays : 0;
  const completionRate = number(work.completion_rate) || valueFrom(sources, ['completion_rate','finish_rate','complete_rate']);
  const fansGained = valueFrom(sources, ['fans_gained','follower_gain','new_fans','follow_count','fans_increment']);
  const playIndex = medianPlay ? plays / medianPlay : 0;
  const playScore = clamp(playIndex / 3 * 35, 0, 35);
  const engagementScore = clamp(engagementRate / 0.12 * 30, 0, 30);
  const completionScore = clamp(completionRate / (completionRate > 1 ? 100 : 1) * 20, 0, 20);
  const fanRate = plays ? fansGained / plays : 0;
  const fanScore = clamp(fanRate / 0.02 * 15, 0, 15);
  const score = round(playScore + engagementScore + completionScore + fanScore, 1);
  const level = score >= 85 ? 'viral' : score >= 70 ? 'excellent' : score >= 45 ? 'normal' : 'low';
  return {
    score, level, engagement_rate: round(engagementRate * 100), completion_rate: round(completionRate > 1 ? completionRate : completionRate * 100),
    fans_gained: fansGained, average_play_duration: number(work.play_duration) || valueFrom(sources, ['average_play_duration','avg_play_duration','average_watch_time']),
    rules: {
      play: { weight: 35, score: round(playScore, 1), basis: '播放量相对账号作品中位数，达到 3 倍得满分' },
      engagement: { weight: 30, score: round(engagementScore, 1), basis: '互动率达到 12% 得满分' },
      completion: { weight: 20, score: round(completionScore, 1), basis: '完播率 100% 得满分' },
      fan_conversion: { weight: 15, score: round(fanScore, 1), basis: '播放涨粉转化率达到 2% 得满分' },
      levels: { viral: '85-100 爆款', excellent: '70-84.9 优秀', normal: '45-69.9 普通', low: '0-44.9 低效' },
    },
  };
}

async function workRows(accountId: number) {
  return queryAll<WorkRow>(`${latestWorkSql()} ORDER BY COALESCE(i.publish_time,i.created_at) DESC`, [accountId]);
}

async function accountMetrics(accountId: number, limit = 1000) {
  const rows = await queryAll<AccountMetric>('SELECT snapshot_time,fans_count,play_count,interaction_count,profile_visit_count,growth_json,raw_json FROM creator_account_metrics WHERE account_id=? ORDER BY snapshot_time DESC LIMIT ?', [accountId, limit]);
  return rows.sort((left, right) => (timestamp(left.snapshot_time) ?? 0) - (timestamp(right.snapshot_time) ?? 0));
}

async function saveAnalysis(workId: number, analysis: JsonRecord & { score?: number; level?: string }) {
  await execute('INSERT INTO creator_work_analysis(work_id,score,level,analysis_json) VALUES(?,?,?,?)', [workId, number(analysis.score), text(analysis.level || 'low'), JSON.stringify(analysis)]);
  await execute('DELETE FROM creator_work_analysis WHERE work_id=? AND id NOT IN (SELECT id FROM creator_work_analysis WHERE work_id=? ORDER BY created_at DESC,id DESC LIMIT 20)', [workId, workId]);
}

function healthFor(works: WorkRow[], metrics: AccountMetric[], asOf: Date | number | string = new Date()) {
  const window = calendarWindow(30, asOf);
  const published30 = works.filter((work) => isInWindow(work.publish_time, window)).length;
  const active = clamp(published30 / 12 * 100);
  const observedFans = metrics
    .filter((row) => isInWindow(row.snapshot_time, window))
    .map((row) => ({ time: timestamp(row.snapshot_time), value: finiteNumber(row.fans_count) }))
    .filter((row): row is { time: number; value: number } => row.time !== null && row.value !== null)
    .sort((left, right) => left.time - right.time);
  const fansFirst = observedFans[0];
  const fansLast = observedFans.at(-1);
  const fanGrowthRate = fansFirst && fansLast && fansFirst.time !== fansLast.time && fansFirst.value > 0
    ? (fansLast.value - fansFirst.value) / fansFirst.value * 100
    : null;
  const plays = works.reduce((sum, work) => sum + number(work.play_count), 0);
  const interactions = works.reduce((sum, work) => sum + number(work.like_count) + number(work.comment_count) + number(work.share_count) + number(work.favorite_count), 0);
  const engagementRate = plays ? interactions / plays * 100 : 0;
  const values = works.map((work) => number(work.play_count)).filter((value) => value > 0);
  const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length || 1);
  const stability = mean ? clamp(100 - Math.sqrt(variance) / mean * 100) : 0;
  const growthScore = fanGrowthRate === null ? null : clamp(50 + fanGrowthRate * 10);
  const interactionScore = clamp(engagementRate / 12 * 100);
  const scoreParts = [active, growthScore, interactionScore, stability].filter((value): value is number => value !== null);
  const fanGrowthBasis = fanGrowthRate === null || !fansFirst || !fansLast
    ? '近30天缺少两条可比较的正值粉丝快照，增长率未知'
    : `近30天窗口内首末可用粉丝快照 ${dateKeyBjt(fansFirst.time)} 至 ${dateKeyBjt(fansLast.time)}；不对缺失日期插值`;
  return {
    score: round(scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length, 1),
    content_activity: round(active, 1), fan_growth_rate: fanGrowthRate === null ? null : round(fanGrowthRate), interaction_rate: round(engagementRate), content_stability: round(stability, 1),
    basis: { content_activity: `近30天发布 ${published30} 条，目标 12 条`, fan_growth_rate: fanGrowthBasis, interaction_rate: '点赞评论分享收藏 / 播放', content_stability: '按作品播放量离散系数计算' },
  };
}

export class CreatorAnalyticsService {
  async refresh(accountId: number, asOf: Date | number | string = new Date()) {
    const [works, metrics] = await Promise.all([workRows(accountId), accountMetrics(accountId)]);
    const plays = works.map((work) => number(work.play_count)).sort((a, b) => a - b);
    const median = plays.length ? plays[Math.floor(plays.length / 2)] : 0;
    const analyses = works.map((work) => ({ work, rating: ratingFor(work, median) }));
    await runInTransaction(async (tx) => {
      for (const { work, rating } of analyses) {
        await tx.execute('INSERT INTO creator_work_analysis(work_id,score,level,analysis_json) VALUES(?,?,?,?)', [work.id, rating.score, rating.level, JSON.stringify(rating)]);
        await tx.execute('DELETE FROM creator_work_analysis WHERE work_id=? AND id NOT IN (SELECT id FROM creator_work_analysis WHERE work_id=? ORDER BY created_at DESC,id DESC LIMIT 20)', [work.id, work.id]);
      }
      for (const period of ['7d','30d','90d'] as Period[]) {
        await tx.execute('DELETE FROM creator_trend_snapshots WHERE account_id=? AND period=?', [accountId, period]);
        const window = calendarWindow(daysFor(period), asOf);
        const selected = metrics.filter((row) => isInWindow(row.snapshot_time, window));
        for (const row of selected) for (const [metric, value] of Object.entries({ plays: row.play_count, fans: row.fans_count, interactions: row.interaction_count })) {
          const observed = finiteNumber(value);
          if (observed === null) continue;
          await tx.execute('INSERT OR IGNORE INTO creator_trend_snapshots(account_id,period,metric,value,snapshot_time) VALUES(?,?,?,?,?)', [accountId, period, metric, observed, row.snapshot_time]);
        }
        const publishes = works.filter((work) => isInWindow(work.publish_time, window));
        const publishDays = publishes.reduce<Record<string, number>>((result, work) => { const day=storedDateKey(work.publish_time); if(day) result[day]=(result[day]||0)+1; return result; }, {});
        for (const [day, count] of Object.entries(publishDays)) await tx.execute('INSERT INTO creator_trend_snapshots(account_id,period,metric,value,snapshot_time) VALUES(?,?,?,?,?)', [accountId, period, 'publishes', count, `${day} 00:00:00`]);
      }
    });
    return { health: healthFor(works, metrics, asOf), works: analyses.map(({ work, rating }) => ({ id: work.id, title: work.title, ...rating })) };
  }

  async overview(accountId: number, asOf: Date | number | string = new Date()) {
    const refreshed = await this.refresh(accountId, asOf);
    const levels = refreshed.works.reduce<Record<string, number>>((result, work) => { result[work.level] = (result[work.level] || 0) + 1; return result; }, { viral: 0, excellent: 0, normal: 0, low: 0 });
    return { health: refreshed.health, levels, rated_works: refreshed.works };
  }

  async work(accountId: number, workId: number, period: '24h'|'7d'|'30d' = '7d', asOf: Date | number | string = new Date()) {
    const [work, allWorks] = await Promise.all([
      queryOne<WorkRow>(`${latestWorkSql('AND i.id=?')} LIMIT 1`, [accountId, workId]),
      workRows(accountId),
    ]);
    if (!work) return null;
    const plays = allWorks.map((item) => number(item.play_count)).sort((a, b) => a - b);
    const raw = parse(work.raw_json), metricRaw = parse(work.metric_raw_json), sources = [metricRaw, raw, parse(raw.metrics), parse(raw.data), parse(raw.detail)];
    const rating = ratingFor(work, plays[Math.floor(plays.length / 2)] || 0);
    const rows = await queryAll<JsonRecord>('SELECT snapshot_time,play_count,like_count,comment_count,share_count,favorite_count,raw_json FROM creator_content_metrics WHERE content_id=? ORDER BY snapshot_time ASC', [workId]);
    const selected = period === '24h'
      ? rows.filter((row) => {
          const time = timestamp(row.snapshot_time);
          const end = timestamp(asOf);
          return time !== null && end !== null && time >= end - 86400000 && time <= end;
        })
      : rows.filter((row) => isInWindow(row.snapshot_time, calendarWindow(period === '7d' ? 7 : 30, asOf)));
    const trend = selected.map((row) => {
      const details = parse(row.raw_json);
      const interactionValues = [row.like_count, row.comment_count, row.share_count, row.favorite_count].map(finiteNumber);
      return {
        time: text(row.snapshot_time),
        plays: finiteNumber(row.play_count),
        interactions: interactionValues.every((value): value is number => value !== null) ? interactionValues.reduce((sum, value) => sum + value, 0) : null,
        fans: optionalValueFrom([details], ['fans_gained','follower_gain','new_fans','fans_increment']),
      };
    });
    const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : text(work.title).match(/#[^#\s]+/g) || [];
    const analysis = {
      ...rating, period, trend, comments: extractComments(sources), traffic: extractTraffic(sources),
      work: { id: work.id, platform_item_id: work.platform_item_id, title: work.title, cover_url: work.cover_url, publish_time: work.publish_time, duration: number(work.duration), tags, url: text(raw.url || raw.share_url || raw.item_url || raw.video_url), metrics: { plays: work.play_count, likes: work.like_count, comments: work.comment_count, shares: work.share_count, favorites: work.favorite_count, completion_rate: rating.completion_rate, average_play_duration: rating.average_play_duration, fans_gained: rating.fans_gained } },
    };
    await saveAnalysis(workId, analysis);
    return analysis;
  }

  async trends(accountId: number, period: Period = '30d', asOf: Date | number | string = new Date()) {
    await this.refresh(accountId, asOf);
    const rows = await queryAll<{ metric: string; value: number; snapshot_time: string }>('SELECT metric,value,snapshot_time FROM creator_trend_snapshots WHERE account_id=? AND period=? ORDER BY snapshot_time ASC', [accountId, period]);
    const grouped: Record<string, Array<{ time: string; value: number }>> = { plays: [], fans: [], interactions: [], publishes: [] };
    for (const row of rows) grouped[row.metric]?.push({ time: row.snapshot_time, value: number(row.value) });
    return { period, days: daysFor(period), series: grouped };
  }

  async generateReport(accountId: number, type: ReportType, asOf: Date = new Date()) {
    const unified = await getDouyinReportData(accountId, type, asOf);
    if (!unified) throw Object.assign(new Error('该账号尚未完成标准化抖音同步'), { statusCode: 404 });
    const growth = unified.growth;
    const health = unified.account_performance.health;
    const anomalies: Array<{ metric: string; message: string }> = [];
    if (growth.plays != null && growth.plays < 0) anomalies.push({ metric: 'plays', message: '周期末累计播放低于期初快照，请核对采集完整性' });
    if (growth.fans != null && growth.fans < 0) anomalies.push({ metric: 'fans', message: '周期内粉丝出现净流失' });
    if (number(health.score) < 45) anomalies.push({ metric: 'health', message: '账号综合健康度低于 45 分' });
    const content = {
      report_version: 2,
      type,
      generated_at: asOf.toISOString(),
      ...unified,
      anomalies,
      methodology: '账号、作品、趋势与报告统一读取抖音运营中心标准化数据；累计值不会重复累加历史快照。',
    };
    const id = await executeInsert('INSERT INTO creator_reports(account_id,type,content_json) VALUES(?,?,?)', [accountId, type, JSON.stringify(content)]);
    return { id, account_id: accountId, ...content };
  }

  async reports(accountId: number) {
    const rows = await queryAll<{ id: number; type: ReportType; content_json: string; created_at: string }>('SELECT id,type,content_json,created_at FROM creator_reports WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT 100', [accountId]);
    return rows.map((row) => ({ id: row.id, type: row.type, created_at: row.created_at, content: parse(row.content_json) }));
  }

  async deleteReport(accountId: number, reportId: number) {
    const deleted = await execute('DELETE FROM creator_reports WHERE id=? AND account_id=?', [reportId, accountId]);
    if (deleted !== 1) throw Object.assign(new Error('复盘报告不存在或不在当前账号范围内'), { statusCode: 404 });
  }
}

export const creatorAnalyticsService = new CreatorAnalyticsService();
