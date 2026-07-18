import type { Page, Response } from 'playwright';
import { execute, queryOne } from '../../database/utils.js';

const base = 'https://creator.douyin.com';
const number = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : null; };
async function capture(page: Page, pathname: string, target: string) {
  const pending = page.waitForResponse((r) => new URL(r.url()).pathname === pathname, { timeout: 20000 });
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
  return pending;
}
export async function syncDouyinAccountMetrics(accountId: number, page: Page) {
  const summary = { apiCalled: 0, accountMetricCount: 0, trendMetricCount: 0, videoMatched: 0, videoUpdated: 0, unmatched: 0 };
  const info = await capture(page, '/web/api/media/user/info/', `${base}/creator-micro/home`);
  const infoJson = await info.json() as Record<string, unknown>; summary.apiCalled += 1;
  const user = (infoJson.user || {}) as Record<string, unknown>;
  const nickname = typeof user.nickname === 'string' ? user.nickname : null;
  const followerCount = number(user.follower_count); const awemeCount = number(user.aweme_count); const totalFavorited = number(user.total_favorited); const followingCount = number(user.following_count);
  await execute(`UPDATE social_accounts SET display_name = COALESCE(?, display_name), account_name = COALESCE(?, account_name), updated_at = datetime('now','+8 hours') WHERE id = ?`, [nickname, nickname, accountId]);
  for (const [name, value] of [['followers', followerCount], ['video_count', awemeCount], ['total_favorited', totalFavorited], ['following_count', followingCount]] as const) if (value != null) { await execute(`INSERT INTO social_account_metric_snapshots(account_id,metric_name,metric_value,snapshot_date,source,created_at) VALUES(?,?,?,date('now'),'chrome_cdp',datetime('now','+8 hours')) ON CONFLICT(account_id,metric_name,snapshot_date) DO UPDATE SET metric_value=excluded.metric_value,source=excluded.source`, [accountId, name, value]); summary.accountMetricCount += 1; }
  const dashboard = await capture(page, '/janus/douyin/creator/data/overview/dashboard', `${base}/creator-micro/data-center/operation`);
  const dashboardJson = await dashboard.json() as Record<string, unknown>; summary.apiCalled += 1;
  const metrics = Array.isArray(dashboardJson.metrics) ? dashboardJson.metrics : [];
  for (const raw of metrics) { const metric = raw as Record<string, unknown>; const name = typeof metric.metric_name === 'string' ? metric.metric_name : null; if (!name) continue; const value = number(metric.metric_value); if (value != null) { await execute(`INSERT INTO social_account_metric_snapshots(account_id,metric_name,metric_value,snapshot_date,source,created_at) VALUES(?,?,?,date('now'),'chrome_cdp',datetime('now','+8 hours')) ON CONFLICT(account_id,metric_name,snapshot_date) DO UPDATE SET metric_value=excluded.metric_value,source=excluded.source`, [accountId, name, value]); summary.accountMetricCount += 1; } for (const point of Array.isArray(metric.trends) ? metric.trends : []) { const trend = point as Record<string, unknown>; const date = typeof trend.date_time === 'string' ? trend.date_time.slice(0,10) : null; const trendValue = number(trend.douyin_value ?? trend.value); if (date && trendValue != null) { await execute(`INSERT INTO social_account_metric_snapshots(account_id,metric_name,metric_value,snapshot_date,source,created_at) VALUES(?,?,?,?,'chrome_cdp',datetime('now','+8 hours')) ON CONFLICT(account_id,metric_name,snapshot_date) DO UPDATE SET metric_value=excluded.metric_value,source=excluded.source`, [accountId, name, trendValue, date]); summary.trendMetricCount += 1; } } }
  const quality = await capture(page, '/janus/douyin/creator/data/item_analysis/item_performance', `${base}/creator-micro/data-center/content`);
  const qualityJson = await quality.json() as Record<string, unknown>; summary.apiCalled += 1;
  for (const raw of Array.isArray(qualityJson.items) ? qualityJson.items : []) { const item = raw as Record<string, unknown>; const itemId = typeof item.item_id === 'string' ? item.item_id : ''; if (!itemId) continue; const video = await queryOne<Record<string, unknown>>(`SELECT id FROM social_videos WHERE account_id = ? AND external_video_id = ?`, [accountId,itemId]); if (!video) { summary.unmatched += 1; continue; } summary.videoMatched += 1; await execute(`UPDATE social_videos SET avg_play_duration=COALESCE(?,avg_play_duration),completion_rate_5s=COALESCE(?,completion_rate_5s),bounce_rate_2s=COALESCE(?,bounce_rate_2s) WHERE id=?`, [number(item.average_play_duration),number(item.completion_rate_5s),number(item.bounce_rate_2s),video.id]); summary.videoUpdated += 1; }
  return { ...summary, nickname, followers: followerCount, videoCount: awemeCount };
}
