import { createHash } from 'node:crypto';
import type { CreatorTopicSuggestion, CreatorTopicSuggestions } from '../../shared/types/creator-topic-suggestions.js';
import type { DouyinMetricsWork } from './douyinOperationsAnalytics.js';

const DAY = 86_400_000;
const MIN_SAMPLE = 3;
const bands = [{ min: 2, max: 8, label: '发布满 2–7 天' }, { min: 8, max: 31, label: '发布满 8–30 天' }, { min: 31, max: 91, label: '发布满 31–90 天' }];
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
// Stored legacy database datetimes use Beijing wall time; offset-qualified ISO
// values remain absolute instants and must not receive a second timezone.
const timestamp = (value: unknown) => {
  if (typeof value !== 'string') return NaN;
  const normalized = value.replace(' ', 'T');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(normalized)) return Date.parse(value);
  return Date.parse(`${normalized}+08:00`);
};

function features(title: string) {
  const values = new Map<string, { label: string; direction: string }>();
  // Only explicit tags and punctuation are observed, never inferred cities/topics.
  for (const match of title.normalize('NFKC').matchAll(/#([\p{L}\p{N}_]{1,30})(?![\p{L}\p{N}_])/gu)) {
    const tag = match[1].toLocaleLowerCase('zh-CN');
    values.set(`tag:${tag}`, { label: `#${tag}`, direction: `围绕 #${tag} 策划一个新角度，先核对受众与事实素材` });
  }
  if (/[?？]/.test(title)) values.set('question', { label: '问句标题', direction: '围绕受众的一个真实问题策划选题，尝试问句标题' });
  return values;
}

/** Caller must supply canonical works from exactly one authorized account. No writes. */
export function buildCreatorTopicSuggestions(works: DouyinMetricsWork[], accountUid: string, now = new Date()): CreatorTopicSuggestions {
  const eligible = works.flatMap(work => {
    const age = (now.getTime() - timestamp(work.publish_time)) / DAY;
    const freshness = (now.getTime() - timestamp(work.updated_at)) / DAY;
    const band = bands.findIndex(item => age >= item.min && age < item.max);
    if (band < 0 || !Number.isFinite(freshness) || freshness < 0 || freshness > 7
      || typeof work.play_count !== 'number' || !Number.isFinite(work.play_count) || work.play_count <= 0
      || typeof work.title !== 'string' || !work.title.trim()) return [];
    return [{ work, band, features: features(work.title) }];
  });
  const candidates: CreatorTopicSuggestion[] = [];
  let comparable = false;
  for (const [bandIndex, band] of bands.entries()) {
    const cohort = eligible.filter(row => row.band === bandIndex);
    const patterns = new Map(cohort.flatMap(row => [...row.features.entries()]));
    for (const [key, feature] of patterns) {
      const sample = cohort.filter(row => row.features.has(key));
      const baseline = cohort.filter(row => !row.features.has(key));
      if (sample.length < MIN_SAMPLE || baseline.length < MIN_SAMPLE) continue;
      comparable = true;
      const sampleMedian = median(sample.map(row => row.work.play_count));
      const baselineMedian = median(baseline.map(row => row.work.play_count));
      const ratio = sampleMedian / baselineMedian;
      if (ratio < 1.5) continue;
      const evidence = (rows: typeof cohort) => [...rows].sort((a, b) => b.work.play_count - a.work.play_count || a.work.id - b.work.id).slice(0, 3).map(({ work }) => ({ id: work.id, title: String(work.title).slice(0, 300), play_count: work.play_count }));
      const samples = evidence(sample);
      const baselineSamples = evidence(baseline);
      const id = createHash('sha256').update(`${key}|${bandIndex}`).digest('hex').slice(0, 20);
      const cohortEvidence = (rows: typeof cohort) => rows
        .map(({ work }) => [work.id, work.play_count] as const)
        .sort((a, b) => a[0] - b[0]);
      candidates.push({
        id,
        evidence_id: createHash('sha256').update(JSON.stringify({
          accountUid, id, sample: cohortEvidence(sample), baseline: cohortEvidence(baseline),
          sampleMedian, baselineMedian,
        })).digest('hex').slice(0, 32),
        ...feature, age_band: band.label, sample_count: sample.length, baseline_count: baseline.length,
        median_plays: sampleMedian, baseline_median_plays: baselineMedian, play_ratio: Number(ratio.toFixed(2)),
        samples, baseline_samples: baselineSamples,
      });
    }
  }
  // One best-supported age band per pattern keeps the panel concise.
  const seen = new Set<string>();
  const items = candidates.sort((a, b) => b.sample_count - a.sample_count || b.play_ratio - a.play_ratio || a.id.localeCompare(b.id)).filter(item => {
    if (seen.has(item.label)) return false;
    seen.add(item.label);
    return true;
  }).slice(0, 3);
  return {
    status: items.length ? 'ready' : comparable ? 'no_signal' : 'insufficient_data',
    account_uid: accountUid, source: 'douyin_works', evaluated_at: now.toISOString(),
    eligible_count: eligible.length, excluded_count: works.length - eligible.length,
    methodology: '仅比较本账号发布满 2–90 天、最近 7 天更新且播放量大于 0 的去重作品；按 2–7、8–30、31–90 天分组。同组含该特征与不含该特征各至少 3 条，累计播放中位数达到对照的 1.5 倍才展示。标签与问句为观察特征，不代表因果或效果保证；不混用官方账号汇总。',
    items,
  };
}
