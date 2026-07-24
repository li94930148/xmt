"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = __importDefault(require("node:test"));
const safe_json_js_1 = require("../network/safe-json.js");
const work_list_pagination_js_1 = require("../network/work-list-pagination.js");
const common_js_1 = require("../collector/douyin/parser/common.js");
const creatorDatabase_js_1 = require("../database/creatorDatabase.js");
const unifiedPayload_js_1 = require("../uploader/unifiedPayload.js");
const capture = (response) => ({ page: 'work-list', url: 'https://creator.douyin.com/api/works?cursor=0', method: 'GET', status: 200, headers: {}, response, response_size: 0, captured_at: '2026-07-24T00:00:00.000Z' });
const work = (index) => {
    const id = `7663799549412758${String(index).padStart(3, '0')}`;
    const metrics = { play_count: index + 1, like_count: 1, comment_count: 1, share_count: 1 };
    return { aweme_id: id, item_id: id, title: `work-${index}`, cover_url: '', cover: '', publish_time: '', published_at: '', video_url: '', metrics, ...metrics, raw: { aweme_id: id, desc: `work-${index}`, statistics: metrics } };
};
const page = (start, count, cursor, hasMore) => ({ data: { aweme_list: Array.from({ length: count }, (_, offset) => work(start + offset).raw), max_cursor: cursor, has_more: hasMore } });
function snapshot(snapshotId = 'snapshot-v2102') {
    const works = [work(0), work(1)];
    return { platform: 'douyin', source: 'local_creator_center', contract_version: '2.10.2', snapshot_id: snapshotId, collection_mode: 'full_snapshot', collection_stats: { raw_response_count: 1, aweme_candidate_count: 2, normalized_success_count: 2, rejected_count: 0, rejected_reasons: {}, page_count: 1, new_count: 2 }, collected_at: '2026-07-24T00:00:00.000Z', account: { uid: '100000000000000001', nickname: 'creator', avatar: '', fans_count: 3 }, works, work_details: [], dashboard: {}, content_analysis: {}, fans: {}, raw: { api_map: [], captures: [capture({ data: { aweme_list: works.map((item) => item.raw) } })] }, videos: works, operations: { last7Days: {}, last30Days: {}, trafficSources: {}, contentPerformance: {} } };
}
(0, node_test_1.default)('safe JSON parsing preserves long aweme_id exactly as a string', () => {
    const parsed = (0, safe_json_js_1.safeJsonParse)('{"aweme_id":7663799549412758193,"author":{"uid":100000000000000001}}');
    strict_1.default.equal(parsed.aweme_id, '7663799549412758193');
    strict_1.default.equal(parsed.author.uid, '100000000000000001');
});
(0, node_test_1.default)('parseWorks accepts only strict named-list aweme objects', () => {
    const valid = Array.from({ length: 12 }, (_, index) => work(index).raw);
    const music = Array.from({ length: 12 }, (_, index) => ({ id: `music-${index}`, title: `music-${index}`, statistics: { play_count: 1 } }));
    const modules = Array.from({ length: 7 }, (_, index) => ({ group_id: `module-${index}`, name: `module-${index}`, statistics: { play_count: 1 } }));
    const result = (0, common_js_1.parseWorksDetailed)([capture({ data: { aweme_list: [...valid, ...music, ...modules] }, manifest: { works: [work(99).raw] } })]);
    strict_1.default.equal(result.works.length, 12);
    strict_1.default.equal(result.aweme_candidate_count, 31);
    strict_1.default.equal(result.rejected_count, 19);
    strict_1.default.equal(result.rejected_reasons.not_aweme_object, 19);
    strict_1.default.equal(result.works[0].aweme_id, work(0).aweme_id);
});
(0, node_test_1.default)('cursor pagination collects 12 + 12 + 7 works', async () => {
    const fixtures = { c1: page(12, 12, 'c2', true), c2: page(24, 7, 'c3', false) };
    const result = await (0, work_list_pagination_js_1.paginateWorkList)(page(0, 12, 'c1', true), async (cursor) => fixtures[cursor]);
    const parsed = (0, common_js_1.parseWorksDetailed)(result.responses.map(capture));
    strict_1.default.equal(result.page_count, 3);
    strict_1.default.equal(parsed.works.length, 31);
});
(0, node_test_1.default)('knownContentIds is statistics-only and does not remove uploaded contents', () => {
    const source = snapshot();
    const payload = (0, unifiedPayload_js_1.toUnifiedCreatorPayload)(source, { knownContentIds: new Set(source.works.map((item) => item.item_id)) });
    strict_1.default.equal(payload.contents.length, source.works.length);
    strict_1.default.equal(payload.sync_task.collection_stats.new_count, 0);
    strict_1.default.equal(payload.contents[0].aweme_id, source.works[0].aweme_id);
});
(0, node_test_1.default)('saving the same snapshot ten times is idempotent', () => {
    const directory = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'xmt-v2102-'));
    const file = node_path_1.default.join(directory, 'creator.sqlite');
    try {
        const database = new creatorDatabase_js_1.CreatorDatabase(file);
        const source = snapshot();
        for (let index = 0; index < 10; index += 1)
            strict_1.default.deepEqual(database.save(source).errors, {});
        strict_1.default.deepEqual(database.snapshotCounts(), { creator_accounts: 1, creator_works: 2, creator_work_statistics: 2, creator_dashboard_statistics: 1, creator_fans_statistics: 1, creator_fans_snapshots: 1, creator_raw_snapshots: 1 });
        database.close();
    }
    finally {
        node_fs_1.default.rmSync(directory, { recursive: true, force: true });
    }
});
