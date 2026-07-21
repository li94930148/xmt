import { queryAll, queryOne } from '../../database/utils.js';

export async function getOperationalAnalysis(accountId?: number) {
  const videos = await queryAll<{ id:number; title:string; publish_time:string; play_count:number; like_count:number; comment_count:number; share_count:number }>(`SELECT id,title,publish_time,play_count,like_count,comment_count,share_count FROM douyin_videos WHERE (? IS NULL OR account_id=?) ORDER BY play_count DESC LIMIT 200`, [accountId ?? null, accountId ?? null]);
  const ranked = videos.map((v) => ({ ...v, engagement_rate: v.play_count ? (v.like_count + v.comment_count + v.share_count) / v.play_count : 0 })).sort((a,b) => b.play_count-a.play_count).slice(0,10);
  const hours = new Map<number, { count:number; plays:number }>(); for (const video of videos) { const hour = video.publish_time ? new Date(video.publish_time).getHours() : -1; const value = hours.get(hour) ?? { count: 0, plays: 0 }; value.count++; value.plays += Number(video.play_count || 0); hours.set(hour, value); }
  const bestPublishingHours = [...hours.entries()].filter(([hour]) => hour >= 0).map(([hour, value]) => ({ hour, average_play_count: value.count ? value.plays / value.count : 0, video_count: value.count })).sort((a,b) => b.average_play_count-a.average_play_count);
  return { source: 'douyin_openapi', top10: ranked, best_publishing_hours: bestPublishingHours, lifecycle: '生命周期依据连续日快照计算；首次同步后开始输出增长、爆发和衰退阶段。', ai: { status: 'reserved', supported_outputs: ['爆款原因分析', '低效原因分析', '下一步选题建议'] } };
}
