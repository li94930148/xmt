"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.objects = objects;
exports.workCandidateArrays = workCandidateArrays;
exports.parseWorksDetailed = parseWorksDetailed;
exports.parseWorks = parseWorks;
exports.metrics = metrics;
exports.section = section;
const WORK_ARRAY_KEYS = ['aweme_list', 'awemeList', 'item_list', 'itemList', 'video_list', 'videoList', 'works'];
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
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
function responseContainers(value) {
    const root = record(value);
    if (!root)
        return [];
    const data = record(root.data);
    const result = record(root.result);
    return [root, data, result, record(data?.data), record(result?.data)].filter((item) => Boolean(item));
}
function workCandidateArrays(value) {
    return responseContainers(value).flatMap((container) => WORK_ARRAY_KEYS.flatMap((key) => Array.isArray(container[key]) ? [container[key]] : []));
}
function platformId(row) {
    const value = pick(row, ['aweme_id', 'awemeId', 'item_id', 'itemId']);
    if (value === undefined || value === null || value === '')
        return { value: '', error: 'not_aweme_object' };
    if (typeof value === 'number' && !Number.isSafeInteger(value))
        return { value: '', error: 'unsafe_numeric_id' };
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint')
        return { value: '', error: 'not_aweme_object' };
    return { value: String(value) };
}
function mediaUrl(value) {
    if (typeof value === 'string')
        return value;
    const source = record(value);
    if (!source)
        return '';
    const urls = source.url_list ?? source.urlList;
    return Array.isArray(urls) ? text(urls[0]) : text(source.url ?? source.uri);
}
function parseWorksDetailed(captures) {
    const found = new Map();
    const rejectedReasons = {};
    let rawResponseCount = 0;
    let candidateCount = 0;
    const reject = (reason) => { rejectedReasons[reason] = (rejectedReasons[reason] || 0) + 1; };
    for (const capture of captures) {
        const arrays = workCandidateArrays(capture.response);
        if (!arrays.length)
            continue;
        rawResponseCount += 1;
        for (const candidate of arrays.flat()) {
            candidateCount += 1;
            const row = record(candidate);
            if (!row) {
                reject('not_aweme_object');
                continue;
            }
            const id = platformId(row);
            if (id.error) {
                reject(id.error);
                continue;
            }
            const title = text(pick(row, ['title', 'desc', 'caption'])).trim();
            if (!title) {
                reject('missing_title');
                continue;
            }
            const workMetrics = metrics(row);
            if (!Object.keys(workMetrics).length) {
                reject('missing_statistics');
                continue;
            }
            if (found.has(id.value)) {
                reject('duplicate_aweme_id');
                continue;
            }
            const publishTime = text(pick(row, ['publish_time', 'publishTime', 'create_time', 'createTime']));
            const coverUrl = mediaUrl(pick(row, ['cover_url', 'coverUrl', 'cover', 'dynamic_cover', 'origin_cover']));
            const videoUrl = mediaUrl(pick(row, ['video_url', 'videoUrl', 'play_addr', 'playAddr', 'video']));
            found.set(id.value, {
                aweme_id: id.value, item_id: id.value, title, cover_url: coverUrl, cover: coverUrl,
                publish_time: publishTime, published_at: publishTime, video_url: videoUrl, metrics: workMetrics,
                status: text(pick(row, ['status', 'audit_status', 'auditStatus'])), ...workMetrics, raw: row,
            });
        }
    }
    const rejectedCount = Object.values(rejectedReasons).reduce((sum, count) => sum + count, 0);
    return { works: [...found.values()], raw_response_count: rawResponseCount, aweme_candidate_count: candidateCount, rejected_count: rejectedCount, rejected_reasons: rejectedReasons };
}
function parseWorks(captures) { return parseWorksDetailed(captures).works; }
function metrics(row) {
    const aliases = {
        play_count: ['play_count', 'playCount', 'vv'], like_count: ['like_count', 'likeCount', 'digg_count'], comment_count: ['comment_count', 'commentCount'], share_count: ['share_count', 'shareCount'], collect_count: ['collect_count', 'collectCount'], avg_play_duration: ['avg_play_duration', 'avgPlayDuration', 'avg_watch_time'], completion_rate: ['completion_rate', 'completionRate', 'finish_rate'], click_rate: ['click_rate', 'clickRate', 'ctr'], two_second_bounce_rate: ['two_second_bounce_rate', 'twoSecondBounceRate'], interaction_rate: ['interaction_rate', 'interactionRate'], new_fans: ['new_fans', 'newFans'], profile_views: ['profile_views', 'profileViewCount']
    };
    const source = { ...row, ...record(row.statistics), ...record(row.stats), ...record(row.metrics) };
    return Object.fromEntries(Object.entries(aliases).flatMap(([name, keys]) => { const value = pick(source, keys); return value === undefined ? [] : [[name, typeof value === 'number' ? value : text(value)]]; }));
}
function section(captures, page) { return captures.filter((capture) => capture.page === page).map((capture) => capture.response); }
