import { queryAll, queryOne, runInTransaction } from '../database/utils.js';

type JsonRecord = Record<string, unknown>;
type WorkRow = { id: number; title: string; publish_time: string; raw_json: string; play_count: number; like_count: number; comment_count: number; share_count: number; favorite_count: number };
const parse = (value: unknown): JsonRecord => { try { return typeof value === 'string' ? JSON.parse(value) as JsonRecord : (value && typeof value === 'object' ? value as JsonRecord : {}); } catch { return {}; } };
const value = (input: unknown) => Number.isFinite(Number(input)) ? Number(input) : 0;
const delta = (rows: JsonRecord[], key: string) => rows.length > 1 ? value(rows.at(-1)?.[key]) - value(rows[0]?.[key]) : 0;

export class CreatorInsightService {
  async generate(accountId: number) {
    const [accountMetrics, works, fans] = await Promise.all([
      queryAll<JsonRecord>('SELECT snapshot_time,fans_count,play_count,interaction_count,profile_visit_count FROM creator_account_metrics WHERE account_id=? ORDER BY snapshot_time ASC LIMIT 31', [accountId]),
      queryAll<WorkRow>(`SELECT i.id,i.title,i.publish_time,i.raw_json,m.play_count,m.like_count,m.comment_count,m.share_count,m.favorite_count FROM creator_content_items i LEFT JOIN creator_content_metrics m ON m.id=(SELECT id FROM creator_content_metrics WHERE content_id=i.id ORDER BY snapshot_time DESC LIMIT 1) WHERE i.account_id=?`, [accountId]),
      queryOne<JsonRecord>('SELECT age_json,gender_json,province_json,city_json,interest_json,active_time_json FROM creator_fans_portraits WHERE account_id=? ORDER BY snapshot_time DESC LIMIT 1', [accountId]),
    ]);
    const seven = accountMetrics.slice(-8);
    const thirty = accountMetrics.slice(-31);
    const scored = works.map((work) => ({ ...work, score: value(work.play_count) + value(work.like_count) * 5 + value(work.comment_count) * 10 + value(work.share_count) * 15 }));
    const ranked = [...scored].sort((a, b) => b.score - a.score);
    const hours = works.reduce<Record<string, number>>((result, work) => { const hour = work.publish_time ? new Date(String(work.publish_time)).getHours().toString().padStart(2, '0') : 'unknown'; result[hour] = (result[hour] || 0) + 1; return result; }, {});
    const tags = works.flatMap((work) => { const raw = parse(work.raw_json); return Array.isArray(raw.tags) ? raw.tags.map(String) : String(work.title || '').match(/#[^#\s]+/g) || []; });
    const tagCounts = tags.reduce<Record<string, number>>((result, tag) => { result[tag] = (result[tag] || 0) + 1; return result; }, {});
    const portrait = fans ? Object.fromEntries(['age_json','gender_json','province_json','city_json','interest_json','active_time_json'].map((key) => [key.replace('_json',''), parse(fans[key])])) : {};
    const insights = {
      daily: { period: 'latest', play_growth: delta(accountMetrics.slice(-2), 'play_count'), fans_growth: delta(accountMetrics.slice(-2), 'fans_count'), interaction_change: delta(accountMetrics.slice(-2), 'interaction_count') },
      weekly: { days: 7, play_growth: delta(seven, 'play_count'), fans_growth: delta(seven, 'fans_count'), interaction_change: delta(seven, 'interaction_count') },
      monthly: { days: 30, play_growth: delta(thirty, 'play_count'), fans_growth: delta(thirty, 'fans_count'), interaction_change: delta(thirty, 'interaction_count'), portrait },
      content: { high_performers: ranked.slice(0, 5).map(({ id, title, score }) => ({ id, title, score })), low_performers: ranked.slice(-5).reverse().map(({ id, title, score }) => ({ id, title, score })), common_tags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10), publish_hours: hours },
    };
    await runInTransaction(async (tx) => {
      for (const [analysisType, content] of Object.entries(insights)) await tx.execute('INSERT INTO creator_insights(account_id,analysis_type,content) VALUES(?,?,?)', [accountId, analysisType, JSON.stringify(content)]);
      await tx.execute('DELETE FROM creator_insights WHERE account_id=? AND id NOT IN (SELECT id FROM creator_insights WHERE account_id=? ORDER BY created_at DESC LIMIT 480)', [accountId, accountId]);
    });
    return insights;
  }
}

export async function getCreatorInsights(accountId: number) {
  const rows = await queryAll<{ analysis_type: string; content: string; created_at: string }>('SELECT analysis_type,content,created_at FROM creator_insights WHERE account_id=? ORDER BY created_at DESC', [accountId]);
  const result: Record<string, unknown> = {};
  for (const row of rows) if (!(row.analysis_type in result)) result[row.analysis_type] = { ...parse(row.content), created_at: row.created_at };
  return result;
}

export const creatorInsightService = new CreatorInsightService();
