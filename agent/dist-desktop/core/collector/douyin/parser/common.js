"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.objects = objects;
exports.parseWorks = parseWorks;
exports.metrics = metrics;
exports.section = section;
function objects(value, result = [], depth = 0) {
    if (!value || depth > 12)
        return result;
    if (Array.isArray(value))
        for (const item of value)
            objects(item, result, depth + 1);
    else if (typeof value === 'object') {
        const record = value;
        result.push(record);
        for (const item of Object.values(record))
            objects(item, result, depth + 1);
    }
    return result;
}
const pick = (row, keys) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null);
const text = (value) => value == null ? '' : String(value);
function parseWorks(captures) {
    const found = new Map();
    for (const row of captures.flatMap((capture) => objects(capture.response))) {
        const id = text(pick(row, ['item_id', 'itemId', 'aweme_id', 'awemeId', 'id']));
        const title = text(pick(row, ['title', 'desc', 'caption', 'name']));
        if (!id || !title || id.length > 80)
            continue;
        found.set(id, { item_id: id, title, published_at: text(pick(row, ['publish_time', 'publishTime', 'create_time', 'createTime'])), cover: text(pick(row, ['cover', 'cover_url', 'coverUrl'])), status: text(pick(row, ['status', 'audit_status', 'auditStatus'])), ...metrics(row), raw: row });
    }
    return [...found.values()];
}
function metrics(row) {
    const aliases = {
        play_count: ['play_count', 'playCount', 'vv'], like_count: ['like_count', 'likeCount', 'digg_count'], comment_count: ['comment_count', 'commentCount'], share_count: ['share_count', 'shareCount'], collect_count: ['collect_count', 'collectCount'], avg_play_duration: ['avg_play_duration', 'avgPlayDuration', 'avg_watch_time'], completion_rate: ['completion_rate', 'completionRate', 'finish_rate'], click_rate: ['click_rate', 'clickRate', 'ctr'], two_second_bounce_rate: ['two_second_bounce_rate', 'twoSecondBounceRate'], interaction_rate: ['interaction_rate', 'interactionRate'], new_fans: ['new_fans', 'newFans'], profile_views: ['profile_views', 'profileViewCount']
    };
    return Object.fromEntries(Object.entries(aliases).flatMap(([name, keys]) => { const value = pick(row, keys); return value === undefined ? [] : [[name, typeof value === 'number' ? value : text(value)]]; }));
}
function section(captures, page) { return captures.filter((capture) => capture.page === page).map((capture) => capture.response); }
