"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toUnifiedCreatorPayload = toUnifiedCreatorPayload;
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value.map(record) : [];
const first = (source, keys, fallback = null) => {
    for (const key of keys)
        if (source[key] !== undefined && source[key] !== null)
            return source[key];
    return fallback;
};
const metric = (work, detail, keys) => first({ ...record(work.raw), ...work, ...record(detail.overview) }, keys);
const RAW_RESPONSE_LIMIT = 128 * 1024;
const RAW_RECORD_LIMIT = 120;
const RAW_RECORD_TOTAL_LIMIT = 2 * 1024 * 1024;
const compactRawResponse = (value) => {
    const serialized = JSON.stringify(value ?? null);
    const bytes = Buffer.byteLength(serialized);
    return bytes <= RAW_RESPONSE_LIMIT ? value : { truncated: true, original_bytes: bytes };
};
const compactRawRecords = (snapshot) => {
    const records = [];
    let totalBytes = 0;
    const priority = ['account-home', 'account-dashboard', 'fans-analysis', 'work-list', 'content-analysis', 'work-detail'];
    const rank = (page) => { const index = priority.indexOf(page); return index < 0 ? priority.length : index; };
    const captures = [...snapshot.raw.captures].sort((left, right) => rank(left.page) - rank(right.page));
    for (const capture of captures) {
        if (records.length >= RAW_RECORD_LIMIT)
            break;
        const item = {
            page_type: capture.page,
            api_url: capture.url.split('?')[0],
            method: capture.method,
            response_json: compactRawResponse(capture.response),
            created_at: capture.captured_at,
        };
        const bytes = Buffer.byteLength(JSON.stringify(item));
        if (totalBytes + bytes > RAW_RECORD_TOTAL_LIMIT)
            continue;
        records.push(item);
        totalBytes += bytes;
    }
    return records;
};
function toUnifiedCreatorPayload(snapshot, options = {}) {
    const snapshotTime = snapshot.collected_at;
    const dashboard = record(snapshot.dashboard);
    const fans = record(snapshot.fans);
    const details = new Map(snapshot.work_details.map((detail) => [String(detail.item_id), detail]));
    const contents = snapshot.works.map((work) => ({
        aweme_id: String(work.aweme_id || work.item_id),
        platform_item_id: String(work.aweme_id || work.item_id),
        title: work.title,
        cover_url: work.cover_url || work.cover || '',
        publish_time: work.publish_time || work.published_at || '',
        video_url: work.video_url || '',
        metrics: work.metrics,
        duration: first(work, ['duration', 'video_duration']),
        status: work.status,
        raw_json: {
            item_id: work.item_id,
            cover_url: work.cover_url || work.cover || '',
            metrics: work.metrics,
        },
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
            raw_json: {
                work: { item_id: work.item_id, metrics: work.metrics },
                detail: { item_id: detail.item_id, overview: detail.overview },
            },
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
        schema_version: 1,
        protocol_version: 1,
        agent_version: snapshot.agent_version,
        contract_version: snapshot.contract_version,
        snapshot_id: snapshot.snapshot_id,
        collection_mode: snapshot.collection_mode,
        platform: snapshot.platform,
        account: {
            platform_uid: snapshot.account.uid,
            nickname: snapshot.account.nickname,
            avatar: snapshot.account.avatar,
            account_name: snapshot.account.nickname,
            status: 'active',
            availability: snapshot.account.availability,
            fans_count: snapshot.account.fans_count,
            following_count: snapshot.account.following_count,
            total_likes: snapshot.account.total_likes,
            works_count: snapshot.account.works_count,
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
        raw_records: compactRawRecords(snapshot),
        page_schemas: (options.capabilities || []).flatMap((page) => page.tabs.flatMap((tab) => tab.schemas.map((schema) => ({ page: page.page, tab: tab.name, api: schema.api, fields: schema.fields })))),
        sync_task: {
            task_id: options.taskId,
            snapshot_id: snapshot.snapshot_id,
            start_time: snapshotTime,
            collection_mode: snapshot.collection_mode,
            collection_stats: {
                ...snapshot.collection_stats,
                new_count: snapshot.works.filter((work) => !options.knownContentIds?.has(String(work.item_id))).length,
            },
        },
    };
}
