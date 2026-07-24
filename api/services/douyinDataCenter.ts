import { queryAll, queryOne, runInTransaction } from '../database/utils.js';
import { douyinDataNormalizer, type NormalizedDouyinContract, type NormalizedDouyinWork } from './douyinDataNormalizer.js';
import { analyzeDouyinWorks, calculateDouyinAccountHealth, DOUYIN_OPERATIONS_FORMULAS, type DouyinMetricsWork } from './douyinOperationsAnalytics.js';
import { resolveCoverUrl } from '../utils/coverResolver.js';

type JsonRecord = Record<string, unknown>;
type AgentIdentity = { id: number; user_id: number; platform: string; account_id: string };
type Period = '7d' | '30d' | '90d';
type WorksCursor = { publish_time: string; id: number };
type AnalyzedDouyinWork = ReturnType<typeof analyzeDouyinWorks>['works'][number];
export type DouyinWorksPage = { items: AnalyzedDouyinWork[]; next_cursor: string | null; has_more: boolean; page_size: number };

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const parse = (value: unknown): JsonRecord => { try { return typeof value === 'string' ? JSON.parse(value) as JsonRecord : value && typeof value === 'object' ? value as JsonRecord : {}; } catch { return {}; } };
const isoDate = (value: string) => value.slice(0, 10);
const days = (period: Period) => ({ '7d': 7, '30d': 30, '90d': 90 })[period];

const encodeCursor = (cursor: WorksCursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url');
function decodeCursor(value?: string): WorksCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<WorksCursor>;
    return typeof parsed.publish_time === 'string' && Number.isInteger(parsed.id) ? { publish_time: parsed.publish_time, id: Number(parsed.id) } : null;
  } catch { return null; }
}

async function resolveWorkCovers<T extends DouyinMetricsWork>(account: Record<string, unknown>, works: T[]): Promise<Array<T & { cover_url: string }>> {
  if (!works.length) return [];
  const contentIds = works.map(work => number(work.content_id)).filter(id => id > 0);
  const itemIds = works.map(work => String(work.aweme_id || '')).filter(Boolean);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (contentIds.length) {
    clauses.push(`id IN (${contentIds.map(() => '?').join(',')})`);
    params.push(...contentIds);
  }
  const creatorAccountId = number(account.creator_account_id);
  if (creatorAccountId && itemIds.length) {
    clauses.push(`(account_id=? AND platform='douyin' AND platform_item_id IN (${itemIds.map(() => '?').join(',')}))`);
    params.push(creatorAccountId, ...itemIds);
  }
  const candidates = clauses.length ? await queryAll<Record<string, unknown>>(`SELECT id,platform_item_id,cover_url,raw_json FROM creator_content_items WHERE ${clauses.join(' OR ')}`, params) : [];
  const byId = new Map(candidates.map(item => [number(item.id), item]));
  const byPlatformId = new Map(candidates.map(item => [String(item.platform_item_id || ''), item]));
  return works.map(work => {
    const creator = byId.get(number(work.content_id)) || byPlatformId.get(String(work.aweme_id || ''));
    return { ...work, cover_url: resolveCoverUrl({ douyinCoverUrl: work.cover_url, creatorCoverUrl: creator?.cover_url, creatorRawJson: creator?.raw_json }) };
  });
}

function workAnalysis(work: NormalizedDouyinWork, medianPlay: number) {
  const interactions = work.like_count + work.comment_count + work.share_count + work.collect_count;
  const playIndex = medianPlay > 0 ? work.play_count / medianPlay : 0;
  const score = Math.min(100, Math.round((Math.min(3, playIndex) / 3 * 55 + Math.min(.15, work.interaction_rate) / .15 * 35 + Math.min(1, work.completion_rate) * 10) * 10) / 10);
  const level = score >= 85 ? 'viral' : score >= 70 ? 'excellent' : score >= 45 ? 'normal' : 'low';
  const tags = [...work.title.matchAll(/#([^#\s，。,；;！!？?]+)/g)].map(match => match[1]).slice(0, 10);
  const category = tags[0] || '未分类';
  const summary = work.play_count === 0
    ? '当前接口尚未返回播放量，暂不判断传播表现。'
    : `当前播放 ${work.play_count}，互动 ${interactions}，互动率 ${(work.interaction_rate * 100).toFixed(2)}%。`;
  const suggestions: string[] = [];
  if (work.play_count > 0 && work.interaction_rate < .03) suggestions.push('互动率低于 3%，可在内容中增加明确的评论或收藏引导。');
  if (work.completion_rate > 0 && work.completion_rate < .25) suggestions.push('完播率低于 25%，建议缩短前置信息并提前核心内容。');
  if (!tags.length) suggestions.push('标题未解析到话题标签，可结合内容主题补充准确标签。');
  if (!suggestions.length) suggestions.push('当前核心指标表现稳定，建议复用发布时间与内容结构并持续观察后续快照。');
  return { score, level, viral_tag: level === 'viral' ? '爆款' : '', content_category: category, tags, ai_summary: summary, optimization_suggestions: suggestions, comment_keywords: [], methodology: '仅基于真实采集指标的确定性规则计算，未调用外部 AI。' };
}

export async function persistNormalizedDouyinSync(agent: AgentIdentity, payload: JsonRecord, snapshotTime: string, taskId: string) {
  const normalized = douyinDataNormalizer.normalize(payload, agent.account_id);
  const plays = normalized.works.map(work => work.play_count).sort((a, b) => a - b);
  const medianPlay = plays.length ? plays[Math.floor(plays.length / 2)] : 0;
  return runInTransaction(async tx => {
    await tx.execute(`INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname,avatar,account_name,status,updated_at)
      VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,platform,platform_uid) DO UPDATE SET nickname=excluded.nickname,avatar=excluded.avatar,account_name=excluded.account_name,status='active',updated_at=CURRENT_TIMESTAMP`,
      [agent.user_id, 'douyin', normalized.account.douyin_uid, normalized.account.nickname, normalized.account.avatar, normalized.account.nickname, 'active']);
    const creatorAccount = await tx.queryOne<{ id: number }>('SELECT id FROM creator_platform_accounts WHERE user_id=? AND platform=? AND platform_uid=?', [agent.user_id, 'douyin', normalized.account.douyin_uid]);
    if (!creatorAccount) throw new Error('抖音权限账号写入失败');
    await tx.execute(`INSERT INTO creator_account_access(account_id,user_id,access_level) VALUES(?,?,'manage') ON CONFLICT(account_id,user_id) DO UPDATE SET access_level='manage'`, [creatorAccount.id, agent.user_id]);

    await tx.execute(`INSERT INTO douyin_accounts(name,profile_url,douyin_id,user_id,nickname,avatar,douyin_uid,fans_count,following_count,works_count,total_likes,last_sync_time,creator_account_id,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(douyin_uid) DO UPDATE SET user_id=excluded.user_id,nickname=excluded.nickname,avatar=excluded.avatar,fans_count=excluded.fans_count,following_count=excluded.following_count,works_count=excluded.works_count,total_likes=excluded.total_likes,last_sync_time=excluded.last_sync_time,creator_account_id=excluded.creator_account_id,updated_at=CURRENT_TIMESTAMP`,
      [normalized.account.nickname || normalized.account.douyin_uid, `https://www.douyin.com/user/${encodeURIComponent(normalized.account.douyin_uid)}`, normalized.account.douyin_uid, agent.user_id, normalized.account.nickname, normalized.account.avatar, normalized.account.douyin_uid, normalized.account.fans_count, normalized.account.following_count, normalized.account.works_count, normalized.account.total_likes, snapshotTime, creatorAccount.id]);
    const account = await tx.queryOne<{ id: number }>('SELECT id FROM douyin_accounts WHERE douyin_uid=?', [normalized.account.douyin_uid]);
    if (!account) throw new Error('标准抖音账号写入失败');

    for (const work of normalized.works) {
      await tx.execute(`INSERT INTO douyin_works(account_id,aweme_id,title,cover_url,publish_time,play_count,like_count,comment_count,share_count,collect_count,duration,completion_rate,interaction_rate,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(account_id,aweme_id) DO UPDATE SET title=excluded.title,cover_url=excluded.cover_url,publish_time=excluded.publish_time,play_count=excluded.play_count,like_count=excluded.like_count,comment_count=excluded.comment_count,share_count=excluded.share_count,collect_count=excluded.collect_count,duration=excluded.duration,completion_rate=excluded.completion_rate,interaction_rate=excluded.interaction_rate,updated_at=CURRENT_TIMESTAMP`,
        [account.id, work.aweme_id, work.title, work.cover_url, work.publish_time, work.play_count, work.like_count, work.comment_count, work.share_count, work.collect_count, work.duration, work.completion_rate, work.interaction_rate, snapshotTime]);
      const row = await tx.queryOne<{ id: number }>('SELECT id FROM douyin_works WHERE account_id=? AND aweme_id=?', [account.id, work.aweme_id]);
      if (!row) continue;
      await tx.execute(`INSERT INTO douyin_work_snapshots(work_id,snapshot_time,play_count,like_count,comment_count,share_count,collect_count,completion_rate,interaction_rate)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(work_id,snapshot_time) DO UPDATE SET play_count=excluded.play_count,like_count=excluded.like_count,comment_count=excluded.comment_count,share_count=excluded.share_count,collect_count=excluded.collect_count,completion_rate=excluded.completion_rate,interaction_rate=excluded.interaction_rate`,
        [row.id, snapshotTime, work.play_count, work.like_count, work.comment_count, work.share_count, work.collect_count, work.completion_rate, work.interaction_rate]);
      const analysis = workAnalysis(work, medianPlay);
      await tx.execute(`INSERT INTO douyin_analysis_records(account_id,work_id,analysis_type,viral_tag,content_category,content_json,ai_analysis_json,snapshot_time)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(work_id,analysis_type,snapshot_time) DO UPDATE SET viral_tag=excluded.viral_tag,content_category=excluded.content_category,content_json=excluded.content_json,ai_analysis_json=excluded.ai_analysis_json`,
        [account.id, row.id, 'work_review', analysis.viral_tag, analysis.content_category, JSON.stringify(analysis), JSON.stringify({ summary: analysis.ai_summary, suggestions: analysis.optimization_suggestions, generated_by: 'rule_engine' }), snapshotTime]);
    }

    const aggregate = await tx.queryOne<{ play_count: number; like_count: number; comment_count: number; share_count: number; works_count: number }>(`SELECT COUNT(*) works_count,COALESCE(SUM(play_count),0) play_count,COALESCE(SUM(like_count),0) like_count,COALESCE(SUM(comment_count),0) comment_count,COALESCE(SUM(share_count),0) share_count FROM douyin_works WHERE account_id=?`, [account.id]);
    await tx.execute(`INSERT INTO douyin_daily_snapshots(account_id,snapshot_date,fans_count,works_count,play_count,like_count,comment_count,share_count)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id,snapshot_date) DO UPDATE SET fans_count=excluded.fans_count,works_count=excluded.works_count,play_count=excluded.play_count,like_count=excluded.like_count,comment_count=excluded.comment_count,share_count=excluded.share_count`,
      [account.id, isoDate(snapshotTime), normalized.account.fans_count, number(aggregate?.works_count), number(aggregate?.play_count), number(aggregate?.like_count), number(aggregate?.comment_count), number(aggregate?.share_count)]);
    await tx.execute(`INSERT INTO douyin_sync_logs(account_id,sync_type,status,message,sync_time,api_count,success_count,failed_count,error_message,task_id)
      VALUES(?,?,?,?,?,?,?,?,?,?)`, [account.id, 'agent_incremental', normalized.works.length ? 'success' : 'failed', `标准化作品 ${normalized.works.length} 条`, snapshotTime, normalized.api_count, normalized.works.length, normalized.rejected_count, normalized.works.length ? null : '未从真实接口响应中识别到合法 aweme_list 作品', taskId]);
    return { account_id: account.id, creator_account_id: creatorAccount.id, works: normalized.works.length, api_count: normalized.api_count, rejected_count: normalized.rejected_count };
  });
}

export async function getDouyinPollutionCandidates() {
  return queryAll<Record<string, unknown>>(`SELECT id,account_id,platform,platform_item_id,title,created_at
    FROM creator_content_items
    WHERE lower(trim(title)) IN ('react','flash_mod_modal','start_flash_mod')
    ORDER BY account_id,id`);
}

export async function persistDouyinContractV2102(agent: AgentIdentity, payload: JsonRecord, snapshotTime: string, taskId: string) {
  const normalized = douyinDataNormalizer.normalizeContractV2102(payload, agent.account_id);
  return persistValidatedDouyinContract(agent, normalized, snapshotTime, taskId);
}

async function persistValidatedDouyinContract(agent: AgentIdentity, normalized: NormalizedDouyinContract, snapshotTime: string, taskId: string) {
  const plays = normalized.works.map(work => work.play_count).sort((a, b) => a - b);
  const medianPlay = plays.length ? plays[Math.floor(plays.length / 2)] : 0;
  return runInTransaction(async tx => {
    await tx.execute(`INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname,avatar,account_name,status,updated_at)
      VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,platform,platform_uid) DO UPDATE SET nickname=excluded.nickname,avatar=excluded.avatar,account_name=excluded.account_name,status='active',updated_at=CURRENT_TIMESTAMP`,
      [agent.user_id, 'douyin', normalized.account.douyin_uid, normalized.account.nickname, normalized.account.avatar, normalized.account.nickname, 'active']);
    const creatorAccount = await tx.queryOne<{ id: number }>('SELECT id FROM creator_platform_accounts WHERE user_id=? AND platform=? AND platform_uid=?', [agent.user_id, 'douyin', normalized.account.douyin_uid]);
    if (!creatorAccount) throw new Error('抖音权限账号写入失败');
    await tx.execute(`INSERT INTO creator_account_access(account_id,user_id,access_level) VALUES(?,?,'manage') ON CONFLICT(account_id,user_id) DO UPDATE SET access_level='manage'`, [creatorAccount.id, agent.user_id]);

    await tx.execute(`INSERT INTO douyin_accounts(name,profile_url,douyin_id,user_id,nickname,avatar,douyin_uid,fans_count,following_count,works_count,total_likes,last_sync_time,creator_account_id,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(douyin_uid) DO UPDATE SET user_id=excluded.user_id,nickname=excluded.nickname,avatar=excluded.avatar,fans_count=excluded.fans_count,following_count=excluded.following_count,works_count=excluded.works_count,total_likes=excluded.total_likes,last_sync_time=excluded.last_sync_time,creator_account_id=excluded.creator_account_id,updated_at=CURRENT_TIMESTAMP`,
      [normalized.account.nickname || normalized.account.douyin_uid, `https://www.douyin.com/user/${encodeURIComponent(normalized.account.douyin_uid)}`, normalized.account.douyin_uid, agent.user_id, normalized.account.nickname, normalized.account.avatar, normalized.account.douyin_uid, normalized.account.fans_count, normalized.account.following_count, normalized.account.works_count, normalized.account.total_likes, snapshotTime, creatorAccount.id]);
    const account = await tx.queryOne<{ id: number }>('SELECT id FROM douyin_accounts WHERE douyin_uid=?', [normalized.account.douyin_uid]);
    if (!account) throw new Error('标准抖音账号写入失败');

    const existingSnapshot = await tx.queryOne<{ id: number }>('SELECT id FROM douyin_sync_logs WHERE account_id=? AND snapshot_id=?', [account.id, normalized.snapshot_id]);
    if (existingSnapshot) {
      return { account_id: account.id, creator_account_id: creatorAccount.id, works: normalized.works.length, duplicate: true, snapshot_id: normalized.snapshot_id, summary: normalized.summary };
    }

    for (const work of normalized.works) {
      await tx.execute(`INSERT INTO creator_content_items(account_id,platform,platform_item_id,title,cover_url,publish_time,duration,status,raw_json)
        VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(account_id,platform,platform_item_id) DO UPDATE SET title=excluded.title,cover_url=excluded.cover_url,publish_time=excluded.publish_time,duration=excluded.duration,status=excluded.status,raw_json=excluded.raw_json`,
        [creatorAccount.id, 'douyin', work.aweme_id, work.title, work.cover_url, work.publish_time, work.duration, 'published', JSON.stringify(work.raw)]);
      const content = await tx.queryOne<{ id: number }>('SELECT id FROM creator_content_items WHERE account_id=? AND platform=? AND platform_item_id=?', [creatorAccount.id, 'douyin', work.aweme_id]);
      if (!content) throw new Error(`Creator 作品写入失败: ${work.aweme_id}`);
      await tx.execute(`INSERT INTO creator_content_metrics(content_id,snapshot_time,play_count,like_count,comment_count,share_count,favorite_count,play_duration,completion_rate,cover_click_rate,raw_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(content_id,snapshot_time) DO UPDATE SET play_count=excluded.play_count,like_count=excluded.like_count,comment_count=excluded.comment_count,share_count=excluded.share_count,favorite_count=excluded.favorite_count,completion_rate=excluded.completion_rate,raw_json=excluded.raw_json`,
        [content.id, snapshotTime, work.play_count, work.like_count, work.comment_count, work.share_count, work.collect_count, 0, work.completion_rate, 0, JSON.stringify(work.raw)]);
      await tx.execute(`INSERT INTO douyin_works(content_id,account_id,aweme_id,title,cover_url,publish_time,play_count,like_count,comment_count,share_count,collect_count,duration,completion_rate,interaction_rate,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(account_id,aweme_id) DO UPDATE SET content_id=excluded.content_id,title=excluded.title,cover_url=excluded.cover_url,publish_time=excluded.publish_time,play_count=excluded.play_count,like_count=excluded.like_count,comment_count=excluded.comment_count,share_count=excluded.share_count,collect_count=excluded.collect_count,duration=excluded.duration,completion_rate=excluded.completion_rate,interaction_rate=excluded.interaction_rate,updated_at=CURRENT_TIMESTAMP`,
        [content.id, account.id, work.aweme_id, work.title, work.cover_url, work.publish_time, work.play_count, work.like_count, work.comment_count, work.share_count, work.collect_count, work.duration, work.completion_rate, work.interaction_rate, snapshotTime]);
      const douyinWork = await tx.queryOne<{ id: number }>('SELECT id FROM douyin_works WHERE account_id=? AND aweme_id=?', [account.id, work.aweme_id]);
      if (!douyinWork) throw new Error(`标准抖音作品写入失败: ${work.aweme_id}`);
      await tx.execute(`INSERT INTO douyin_work_snapshots(work_id,snapshot_time,play_count,like_count,comment_count,share_count,collect_count,completion_rate,interaction_rate)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(work_id,snapshot_time) DO UPDATE SET play_count=excluded.play_count,like_count=excluded.like_count,comment_count=excluded.comment_count,share_count=excluded.share_count,collect_count=excluded.collect_count,completion_rate=excluded.completion_rate,interaction_rate=excluded.interaction_rate`,
        [douyinWork.id, snapshotTime, work.play_count, work.like_count, work.comment_count, work.share_count, work.collect_count, work.completion_rate, work.interaction_rate]);
      const analysis = workAnalysis(work, medianPlay);
      await tx.execute(`INSERT INTO douyin_analysis_records(account_id,work_id,analysis_type,viral_tag,content_category,content_json,ai_analysis_json,snapshot_time)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(work_id,analysis_type,snapshot_time) DO UPDATE SET viral_tag=excluded.viral_tag,content_category=excluded.content_category,content_json=excluded.content_json,ai_analysis_json=excluded.ai_analysis_json`,
        [account.id, douyinWork.id, 'work_review', analysis.viral_tag, analysis.content_category, JSON.stringify(analysis), JSON.stringify({ summary: analysis.ai_summary, suggestions: analysis.optimization_suggestions, generated_by: 'rule_engine' }), snapshotTime]);
    }

    const aggregate = await tx.queryOne<{ play_count: number; like_count: number; comment_count: number; share_count: number; works_count: number }>(`SELECT COUNT(*) works_count,COALESCE(SUM(play_count),0) play_count,COALESCE(SUM(like_count),0) like_count,COALESCE(SUM(comment_count),0) comment_count,COALESCE(SUM(share_count),0) share_count FROM douyin_works WHERE account_id=?`, [account.id]);
    await tx.execute(`INSERT INTO douyin_daily_snapshots(account_id,snapshot_date,fans_count,works_count,play_count,like_count,comment_count,share_count)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id,snapshot_date) DO UPDATE SET fans_count=excluded.fans_count,works_count=excluded.works_count,play_count=excluded.play_count,like_count=excluded.like_count,comment_count=excluded.comment_count,share_count=excluded.share_count`,
      [account.id, isoDate(snapshotTime), normalized.account.fans_count, number(aggregate?.works_count), number(aggregate?.play_count), number(aggregate?.like_count), number(aggregate?.comment_count), number(aggregate?.share_count)]);
    const status = normalized.works.length ? 'success' : 'failed';
    await tx.execute(`INSERT INTO douyin_sync_logs(account_id,sync_type,status,message,sync_time,api_count,success_count,failed_count,error_message,task_id,contract_version,collection_mode,snapshot_id,summary_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [account.id, 'agent_incremental', status, `标准化作品 ${normalized.works.length} 条`, snapshotTime, normalized.summary.raw_response_count, normalized.summary.normalized_success_count, normalized.summary.rejected_count, status === 'failed' ? '未收到合法 DouyinWorkInput' : null, taskId, normalized.contract_version, normalized.collection_mode, normalized.snapshot_id, JSON.stringify(normalized.summary)]);
    return { account_id: account.id, creator_account_id: creatorAccount.id, works: normalized.works.length, duplicate: false, snapshot_id: normalized.snapshot_id, summary: normalized.summary };
  });
}

async function accountForScope(creatorAccountId: number) {
  return queryOne<Record<string, unknown>>('SELECT * FROM douyin_accounts WHERE creator_account_id=? ORDER BY last_sync_time DESC LIMIT 1', [creatorAccountId]);
}

function growth(latest: Record<string, unknown>, previous: Record<string, unknown> | null) {
  if (!previous) return null;
  return {
    fans: number(latest.fans_count) - number(previous.fans_count),
    plays: number(latest.play_count) - number(previous.play_count),
    interactions: number(latest.like_count) + number(latest.comment_count) + number(latest.share_count) - number(previous.like_count) - number(previous.comment_count) - number(previous.share_count),
  };
}

export async function getDouyinDashboard(creatorAccountId: number) {
  const account = await accountForScope(creatorAccountId);
  if (!account) return null;
  const [works, snapshots] = await Promise.all([
    queryAll<DouyinMetricsWork>('SELECT * FROM douyin_works WHERE account_id=?', [account.id]),
    queryAll<Record<string, unknown>>('SELECT * FROM douyin_daily_snapshots WHERE account_id=? ORDER BY snapshot_date ASC', [account.id]),
  ]);
  const analyzed = analyzeDouyinWorks(works);
  const totals = analyzed.works.reduce((result, work) => ({
    plays: result.plays + number(work.play_count),
    interactions: result.interactions + work.performance.interaction_count,
    shares: result.shares + number(work.share_count),
  }), { plays: 0, interactions: 0, shares: 0 });
  const latest = snapshots.at(-1) || {};
  const previous = (periodDays: number) => snapshots.filter(row => new Date(String(row.snapshot_date)).getTime() <= new Date(String(latest.snapshot_date)).getTime() - periodDays * 86400000).at(-1) || null;
  const rankedWorks = [...analyzed.works].sort((left, right) => Number(right.performance.is_viral) - Number(left.performance.is_viral) || right.performance.score - left.performance.score || number(right.play_count) - number(left.play_count));
  return {
    account,
    metrics: {
      fans_count: number(latest.fans_count ?? account.fans_count),
      works_count: works.length,
      play_count: totals.plays,
      interaction_count: totals.interactions,
      interaction_rate: totals.plays > 0 ? totals.interactions / totals.plays : 0,
      share_rate: totals.plays > 0 ? totals.shares / totals.plays : 0,
      viral_works_count: analyzed.works.filter(work => work.performance.is_viral).length,
    },
    health: calculateDouyinAccountHealth(account, analyzed.works, snapshots),
    baselines: analyzed.baselines,
    growth_7d: growth(latest, previous(7)),
    growth_30d: growth(latest, previous(30)),
    top_works: await resolveWorkCovers(account, rankedWorks.slice(0, 5)),
    snapshot_count: snapshots.length,
    metric_sources: {
      account: 'douyin_accounts',
      works: 'douyin_works',
      growth: 'douyin_daily_snapshots',
      scoring: 'douyin_works',
    },
    formulas: DOUYIN_OPERATIONS_FORMULAS,
  };
}

export async function getDouyinWorks(creatorAccountId: number, sort = 'latest', requestedLimit = 20, cursorValue?: string): Promise<DouyinWorksPage> {
  const account = await accountForScope(creatorAccountId);
  const limit = Math.min(100, Math.max(1, Math.floor(requestedLimit) || 20));
  if (!account) return { items: [], next_cursor: null, has_more: false, page_size: limit };
  const works = await queryAll<DouyinMetricsWork>(`SELECT w.*,a.content_category,a.content_json FROM douyin_works w LEFT JOIN douyin_analysis_records a ON a.id=(SELECT id FROM douyin_analysis_records WHERE work_id=w.id ORDER BY snapshot_time DESC,id DESC LIMIT 1) WHERE w.account_id=?`, [account.id]);
  const analyzed = analyzeDouyinWorks(works).works.map(work => ({ ...work, viral_tag: work.performance.is_viral ? '爆款' : '' }));
  const stableNewestFirst = (left: typeof analyzed[number], right: typeof analyzed[number]) =>
    new Date(String(right.publish_time || 0)).getTime() - new Date(String(left.publish_time || 0)).getTime()
    || number(right.id) - number(left.id);
  const comparators: Record<string, (left: typeof analyzed[number], right: typeof analyzed[number]) => number> = {
    plays: (left, right) => number(right.play_count) - number(left.play_count) || stableNewestFirst(left, right),
    interactions: (left, right) => right.performance.interaction_rate - left.performance.interaction_rate || stableNewestFirst(left, right),
    likes: (left, right) => number(right.like_count) - number(left.like_count) || stableNewestFirst(left, right),
    score: (left, right) => right.performance.score - left.performance.score || stableNewestFirst(left, right),
    latest: stableNewestFirst,
  };
  const ordered = analyzed.sort(comparators[sort] || comparators.latest);
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) throw Object.assign(new Error('作品分页 cursor 无效'), { statusCode: 400 });
  const start = cursor ? ordered.findIndex(work => number(work.id) === cursor.id && String(work.publish_time || '') === cursor.publish_time) + 1 : 0;
  if (cursor && start === 0) throw Object.assign(new Error('作品分页 cursor 已失效'), { statusCode: 400 });
  const selected = ordered.slice(start, start + limit);
  const items = await resolveWorkCovers(account, selected);
  const hasMore = start + selected.length < ordered.length;
  const last = selected.at(-1);
  return {
    items,
    next_cursor: hasMore && last ? encodeCursor({ publish_time: String(last.publish_time || ''), id: number(last.id) }) : null,
    has_more: hasMore,
    page_size: limit,
  };
}

export async function getDouyinWorkDetail(creatorAccountId: number, workId: number) {
  const account = await accountForScope(creatorAccountId);
  if (!account) return null;
  const [works, snapshots, analysis] = await Promise.all([
    queryAll<DouyinMetricsWork>('SELECT * FROM douyin_works WHERE account_id=?', [account.id]),
    queryAll<Record<string, unknown>>('SELECT * FROM douyin_work_snapshots WHERE work_id=? ORDER BY snapshot_time ASC', [workId]),
    queryOne<Record<string, unknown>>('SELECT * FROM douyin_analysis_records WHERE work_id=? ORDER BY snapshot_time DESC,id DESC LIMIT 1', [workId]),
  ]);
  const analyzed = analyzeDouyinWorks(works);
  const work = analyzed.works.find(item => number(item.id) === workId);
  if (!work) return null;
  const [coveredWork] = await resolveWorkCovers(account, [work]);
  return {
    work: { ...coveredWork, viral_tag: work.performance.is_viral ? '爆款' : '' },
    snapshots,
    analysis: analysis ? { ...analysis, content: parse(analysis.content_json), ai: parse(analysis.ai_analysis_json) } : null,
    performance: work.performance,
    baselines: analyzed.baselines,
    formulas: DOUYIN_OPERATIONS_FORMULAS,
    metric_sources: ['douyin_works', 'douyin_work_snapshots', 'douyin_analysis_records'],
  };
}

export async function getDouyinWorkReview(creatorAccountId: number, workId: number) {
  const detail = await getDouyinWorkDetail(creatorAccountId, workId);
  if (!detail) return null;
  const firstSnapshot = detail.snapshots[0];
  const lastSnapshot = detail.snapshots.at(-1);
  const delta = firstSnapshot && lastSnapshot ? {
    plays: number(lastSnapshot.play_count) - number(firstSnapshot.play_count),
    likes: number(lastSnapshot.like_count) - number(firstSnapshot.like_count),
    comments: number(lastSnapshot.comment_count) - number(firstSnapshot.comment_count),
    shares: number(lastSnapshot.share_count) - number(firstSnapshot.share_count),
    collects: number(lastSnapshot.collect_count) - number(firstSnapshot.collect_count),
  } : null;
  return {
    ...detail,
    review: {
      score: detail.performance.score,
      level: detail.performance.level,
      is_viral: detail.performance.is_viral,
      viral_reasons: detail.performance.viral_reasons,
      snapshot_delta: delta,
      snapshot_count: detail.snapshots.length,
      evidence_only: true,
    },
  };
}

export async function getDouyinTrends(creatorAccountId: number, period: Period) {
  const account = await accountForScope(creatorAccountId);
  if (!account) return { period, snapshots: [] };
  const since = new Date(Date.now() - days(period) * 86400000).toISOString().slice(0, 10);
  const snapshots = await queryAll<Record<string, unknown>>('SELECT * FROM douyin_daily_snapshots WHERE account_id=? AND snapshot_date>=? ORDER BY snapshot_date ASC', [account.id, since]);
  return {
    period,
    snapshots: snapshots.map(snapshot => {
      const interactions = number(snapshot.like_count) + number(snapshot.comment_count) + number(snapshot.share_count);
      const plays = number(snapshot.play_count);
      return { ...snapshot, interaction_count: interactions, tracked_interaction_rate: plays > 0 ? interactions / plays : 0 };
    }),
    source: 'douyin_daily_snapshots',
    note: '日快照表不含收藏历史，因此趋势互动量仅由点赞、评论和分享构成。',
  };
}

export async function getDouyinSyncLogs(creatorAccountId: number) {
  const account = await accountForScope(creatorAccountId);
  return account ? queryAll<Record<string, unknown>>('SELECT * FROM douyin_sync_logs WHERE account_id=? ORDER BY sync_time DESC,id DESC LIMIT 100', [account.id]) : [];
}
