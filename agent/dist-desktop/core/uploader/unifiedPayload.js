"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toUnifiedCreatorPayload = toUnifiedCreatorPayload;
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value.map(record) : [];
const first = (source, keys, fallback = 0) => {
    for (const key of keys)
        if (source[key] !== undefined && source[key] !== null)
            return source[key];
    return fallback;
};
const metric = (work, detail, keys) => first({ ...record(work.raw), ...work, ...record(detail.overview) }, keys);
function toUnifiedCreatorPayload(snapshot, options = {}) {
    const snapshotTime = snapshot.collected_at;
    const dashboard = record(snapshot.dashboard);
    const fans = record(snapshot.fans);
    const details = new Map(snapshot.work_details.map((detail) => [String(detail.item_id), detail]));
    const contents = snapshot.works.filter((work) => !options.knownContentIds?.has(work.item_id)).map((work) => ({
        platform_item_id: work.item_id,
        title: work.title,
        cover_url: work.cover,
        publish_time: work.published_at,
        duration: first(work, ['duration', 'video_duration']),
        status: work.status,
        raw_json: work.raw ?? work,
    }));
    const metrics = snapshot.works.map((work) => {
        const detail = details.get(String(work.item_id)) || {};
        return {
            platform_item_id: work.item_id,
            snapshot_time: snapshotTime,
            play_count: metric(work, detail, ['play_count', 'views', 'view_count']),
            like_count: metric(work, detail, ['like_count', 'likes', 'digg_count']),
            comment_count: metric(work, detail, ['comment_count', 'comments']),
            share_count: metric(work, detail, ['share_count', 'shares']),
            favorite_count: metric(work, detail, ['favorite_count', 'collect_count', 'collects']),
            play_duration: metric(work, detail, ['play_duration', 'avg_play_duration']),
            completion_rate: metric(work, detail, ['completion_rate', 'finish_rate']),
            cover_click_rate: metric(work, detail, ['cover_click_rate']),
            raw_json: { work, detail },
        };
    });
    const trendSources = [
        ...array(snapshot.content_analysis.trends),
        ...array(snapshot.content_analysis.play_trends),
        ...snapshot.work_details.flatMap((detail) => array(record(detail.raw).trends)),
    ];
    const trends = trendSources.map((item) => ({
        platform_item_id: first(item, ['platform_item_id', 'item_id', 'content_id'], ''),
        metric_name: first(item, ['metric_name', 'name', 'metric'], 'play_count'),
        metric_value: first(item, ['metric_value', 'value', 'count']),
        record_time: first(item, ['record_time', 'time', 'date'], snapshotTime),
    }));
    const accountMetrics = record(dashboard.metrics || dashboard.overview || dashboard);
    return {
        platform: snapshot.platform,
        account: {
            platform_uid: snapshot.account.uid,
            nickname: snapshot.account.nickname,
            avatar: snapshot.account.avatar,
            account_name: snapshot.account.nickname,
            status: 'active',
        },
        contents,
        metrics,
        trends,
        account_metrics: {
            snapshot_time: snapshotTime,
            fans_count: first({ ...accountMetrics, ...snapshot.account }, ['fans_count', 'followers', 'follower_count']),
            play_count: first(accountMetrics, ['play_count', 'views', 'view_count']),
            interaction_count: first(accountMetrics, ['interaction_count', 'interactions', 'engagement_count']),
            profile_visit_count: first(accountMetrics, ['profile_visit_count', 'profile_views', 'homepage_visit_count']),
            growth_json: dashboard.growth || dashboard.trend || {},
            raw_json: dashboard,
        },
        fans: {
            snapshot_time: snapshotTime,
            gender_json: fans.gender || fans.gender_distribution || {},
            age_json: fans.age || fans.age_distribution || {},
            city_json: fans.city || fans.city_distribution || {},
            province_json: fans.province || fans.province_distribution || {},
            interest_json: fans.interest || fans.interests || {},
            active_time_json: fans.active_time || fans.active_times || {},
            raw_json: fans,
        },
        raw_records: snapshot.raw.captures.map((capture) => ({
            page_type: capture.page,
            api_url: capture.url,
            method: capture.method,
            response_json: capture.response,
            created_at: capture.captured_at,
        })),
        page_schemas: (options.capabilities || []).flatMap((page) => page.tabs.flatMap((tab) => tab.schemas.map((schema) => ({ page: page.page, tab: tab.name, api: schema.api, fields: schema.fields })))),
        sync_task: { task_id: options.taskId, start_time: snapshotTime },
    };
}
