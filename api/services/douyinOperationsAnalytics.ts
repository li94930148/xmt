type JsonRecord = Record<string, unknown>;

export type DouyinMetricsWork = JsonRecord & {
  id: number;
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  completion_rate: number;
  publish_time?: string | null;
};

export type DouyinWorkPerformance = {
  score: number;
  level: 'viral' | 'excellent' | 'normal' | 'low';
  is_viral: boolean;
  interaction_count: number;
  interaction_rate: number;
  share_rate: number;
  completion_rate: number;
  completion_rate_available: boolean;
  score_components: {
    play: number;
    interaction: number;
    share: number;
    completion: number | null;
  };
  viral_reasons: string[];
};

export type DouyinPerformanceBaselines = {
  median_play_count: number;
  p75_play_count: number;
  median_interaction_rate: number;
  median_share_rate: number;
};

const value = (input: unknown) => Number.isFinite(Number(input)) ? Number(input) : 0;
const round = (input: number, digits = 4) => Number(input.toFixed(digits));
const clamp = (input: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, input));
const rate = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;

function percentile(values: number[], position: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function workRates(work: DouyinMetricsWork) {
  const plays = value(work.play_count);
  const interactionCount = value(work.like_count) + value(work.comment_count) + value(work.share_count) + value(work.collect_count);
  return {
    plays,
    interactionCount,
    interactionRate: rate(interactionCount, plays),
    shareRate: rate(value(work.share_count), plays),
    completionRate: clamp(value(work.completion_rate)),
  };
}

export function buildDouyinPerformanceBaselines(works: DouyinMetricsWork[]): DouyinPerformanceBaselines {
  const metrics = works.map(workRates);
  return {
    median_play_count: round(percentile(metrics.map(item => item.plays), .5), 2),
    p75_play_count: round(percentile(metrics.map(item => item.plays), .75), 2),
    median_interaction_rate: round(percentile(metrics.filter(item => item.plays > 0).map(item => item.interactionRate), .5)),
    median_share_rate: round(percentile(metrics.filter(item => item.plays > 0).map(item => item.shareRate), .5)),
  };
}

export function scoreDouyinWork(work: DouyinMetricsWork, baselines: DouyinPerformanceBaselines): DouyinWorkPerformance {
  const metrics = workRates(work);
  const completionAvailable = metrics.completionRate > 0;
  const playTarget = Math.max(1, baselines.p75_play_count);
  const interactionTarget = Math.max(.03, baselines.median_interaction_rate * 1.5);
  const shareTarget = Math.max(.01, baselines.median_share_rate * 1.5);
  const playComponent = clamp(metrics.plays / playTarget) * 50;
  const interactionComponent = clamp(metrics.interactionRate / interactionTarget) * 25;
  const shareComponent = clamp(metrics.shareRate / shareTarget) * 15;
  const completionComponent = completionAvailable ? clamp(metrics.completionRate / .5) * 10 : null;
  const availableWeight = completionAvailable ? 100 : 90;
  const weightedTotal = playComponent + interactionComponent + shareComponent + (completionComponent ?? 0);
  const score = round(weightedTotal / availableWeight * 100, 1);
  const playGate = metrics.plays > 0
    && metrics.plays >= baselines.p75_play_count
    && metrics.plays >= baselines.median_play_count * 1.5;
  const interactionGate = metrics.interactionRate >= baselines.median_interaction_rate * 1.25;
  const shareGate = metrics.shareRate >= baselines.median_share_rate * 1.25;
  const isViral = worksBaselineIsUsable(baselines) && score >= 70 && playGate && (interactionGate || shareGate);
  const viralReasons = isViral ? [
    `播放量达到账号作品 P75（${Math.round(baselines.p75_play_count)}）且不低于中位数的 1.5 倍`,
    interactionGate ? '互动率达到账号中位互动率的 1.25 倍' : '分享率达到账号中位分享率的 1.25 倍',
    '综合表现评分不低于 70 分',
  ] : [];
  const level: DouyinWorkPerformance['level'] = isViral ? 'viral' : score >= 70 ? 'excellent' : score >= 40 ? 'normal' : 'low';
  return {
    score,
    level,
    is_viral: isViral,
    interaction_count: metrics.interactionCount,
    interaction_rate: round(metrics.interactionRate),
    share_rate: round(metrics.shareRate),
    completion_rate: round(metrics.completionRate),
    completion_rate_available: completionAvailable,
    score_components: {
      play: round(playComponent, 1),
      interaction: round(interactionComponent, 1),
      share: round(shareComponent, 1),
      completion: completionComponent == null ? null : round(completionComponent, 1),
    },
    viral_reasons: viralReasons,
  };
}

function worksBaselineIsUsable(baselines: DouyinPerformanceBaselines) {
  return baselines.median_play_count > 0 && baselines.p75_play_count > 0;
}

export function analyzeDouyinWorks(works: DouyinMetricsWork[]) {
  const baselines = buildDouyinPerformanceBaselines(works);
  return {
    baselines,
    works: works.map(work => ({ ...work, performance: scoreDouyinWork(work, baselines) })),
  };
}

export function calculateDouyinAccountHealth(account: JsonRecord, works: Array<DouyinMetricsWork & { performance: DouyinWorkPerformance }>, snapshots: JsonRecord[], now = new Date()) {
  const lastSync = account.last_sync_time ? new Date(String(account.last_sync_time)) : null;
  const freshnessDays = lastSync && Number.isFinite(lastSync.getTime()) ? Math.max(0, (now.getTime() - lastSync.getTime()) / 86_400_000) : null;
  const freshnessScore = freshnessDays == null ? 0 : freshnessDays <= 2 ? 20 : freshnessDays <= 7 ? 12 : freshnessDays <= 30 ? 6 : 0;
  const recentThreshold = now.getTime() - 30 * 86_400_000;
  const recentWorks = works.filter(work => work.publish_time && new Date(String(work.publish_time)).getTime() >= recentThreshold).length;
  const activityScore = clamp(recentWorks / 8) * 25;
  const totals = works.reduce((result, work) => ({
    plays: result.plays + value(work.play_count),
    interactions: result.interactions + work.performance.interaction_count,
  }), { plays: 0, interactions: 0 });
  const accountInteractionRate = rate(totals.interactions, totals.plays);
  const engagementScore = clamp(accountInteractionRate / .05) * 30;
  const orderedSnapshots = [...snapshots].sort((left, right) => String(left.snapshot_date).localeCompare(String(right.snapshot_date)));
  const firstSnapshot = orderedSnapshots[0];
  const lastSnapshot = orderedSnapshots.at(-1);
  const growthAvailable = orderedSnapshots.length >= 2 && value(firstSnapshot?.fans_count) > 0;
  const fanGrowthRate = growthAvailable ? (value(lastSnapshot?.fans_count) - value(firstSnapshot?.fans_count)) / value(firstSnapshot?.fans_count) : null;
  const growthScore = fanGrowthRate == null ? null : clamp((fanGrowthRate + .02) / .12) * 25;
  const earned = freshnessScore + activityScore + engagementScore + (growthScore ?? 0);
  const availableWeight = 20 + 25 + 30 + (growthScore == null ? 0 : 25);
  const score = availableWeight ? round(earned / availableWeight * 100, 1) : 0;
  const level = score >= 85 ? 'excellent' : score >= 70 ? 'healthy' : score >= 50 ? 'watch' : 'risk';
  return {
    score,
    level,
    available_weight: availableWeight,
    dimensions: {
      data_freshness: { score: round(freshnessScore, 1), weight: 20, days_since_sync: freshnessDays == null ? null : round(freshnessDays, 1) },
      content_activity: { score: round(activityScore, 1), weight: 25, works_published_30d: recentWorks },
      engagement_quality: { score: round(engagementScore, 1), weight: 30, interaction_rate: round(accountInteractionRate) },
      fan_growth: { score: growthScore == null ? null : round(growthScore, 1), weight: 25, growth_rate: fanGrowthRate == null ? null : round(fanGrowthRate) },
    },
    data_notes: growthAvailable ? [] : ['daily_snapshots 少于 2 条或首条粉丝数为 0，粉丝增长维度未参与评分'],
  };
}

export const DOUYIN_OPERATIONS_FORMULAS = {
  version: 'v2.10.1-operations-1',
  interaction_rate: '(like_count + comment_count + share_count + collect_count) / play_count',
  share_rate: 'share_count / play_count',
  completion_rate: 'douyin_works.completion_rate（真实采集值；0 时标记为不可用，不补值）',
  work_score: '播放 50% + 互动率 25% + 分享率 15% + 完播率 10%；不可用维度从分母权重中移除',
  account_health: '数据新鲜度 20% + 30 日内容活跃度 25% + 账号互动质量 30% + 粉丝增长 25%；不可用维度从分母权重中移除',
} as const;
