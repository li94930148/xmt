import type { DouyinMetricsWork } from './douyinOperationsAnalytics.js';
import { resolveCoverUrl } from '../utils/coverResolver.js';

type RecordValue = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const validId = (value: unknown) => /^[A-Za-z0-9_-]{3,}$/.test(text(value));
const normalizedTitle = (value: unknown) => text(value).replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
const published = (value: unknown) => { const date = new Date(text(value)); return Number.isFinite(date.getTime()) ? date.toISOString() : ''; };
const timestamp = (row: RecordValue) => Date.parse(text(row.updated_at) || text(row.snapshot_time) || text(row.created_at)) || 0;
const sourcePriority = (row: RecordValue) => ({ creator_center: 3, stable_api: 2, historical: 1 }[text(row.source_type || row.source)] || 0);
const completeness = (row: RecordValue) => ['title', 'publish_time', 'cover_url', 'play_count', 'like_count', 'comment_count', 'share_count'].filter(key => text(row[key]) || Number.isFinite(Number(row[key]))).length;
const accountKey = (row: RecordValue) => String(Number(row.account_id) || 'unknown');
const keyFor = (row: RecordValue) => validId(row.aweme_id)
  ? `id:${accountKey(row)}:${text(row.aweme_id)}`
  : `fallback:${accountKey(row)}:${normalizedTitle(row.title)}|${published(row.publish_time)}`;

export type CanonicalWork = DouyinMetricsWork & { cover_candidates: string[]; canonical_source_count: number; canonical_collision: boolean };

/** Canonicalizes only records already scoped to one tenant and platform account. */
export function canonicalizeDouyinWorks(rows: DouyinMetricsWork[]): CanonicalWork[] {
  const groups = new Map<string, DouyinMetricsWork[]>();
  for (const row of rows) { const key = keyFor(row); groups.set(key, [...(groups.get(key) || []), row]); }
  const safeGroups = [...groups.values()].flatMap(group => !validId(group[0].aweme_id) && group.length > 1
    ? group.map(row => ({ group: [row], collision: true }))
    : [{ group, collision: false }]);
  return safeGroups.map(({ group, collision }) => {
    const ordered = [...group].sort((left, right) => timestamp(right) - timestamp(left)
      || sourcePriority(right) - sourcePriority(left)
      || completeness(right) - completeness(left)
      || Number(right.id) - Number(left.id));
    const representative = ordered[0];
    const covers = [...new Set(ordered.map(row => resolveCoverUrl({ douyinCoverUrl: row.cover_url })).filter(Boolean))].slice(0, 4);
    return { ...representative, cover_url: covers[0] || '', cover_candidates: covers, canonical_source_count: group.length, canonical_collision: collision };
  });
}
