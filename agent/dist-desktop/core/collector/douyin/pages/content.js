"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectContent = collectContent;
const safe_json_js_1 = require("../../../network/safe-json.js");
const work_list_pagination_js_1 = require("../../../network/work-list-pagination.js");
const common_js_1 = require("../parser/common.js");
const helpers_js_1 = require("./helpers.js");
function requestWithCursor(capture, cursor) {
    const url = new URL(capture.url);
    const cursorKey = ['cursor', 'max_cursor', 'maxCursor'].find((key) => url.searchParams.has(key)) || 'cursor';
    url.searchParams.set(cursorKey, cursor);
    let body = capture.request_body;
    if (body) {
        try {
            const parsed = (0, safe_json_js_1.safeJsonParse)(body);
            const bodyKey = ['cursor', 'max_cursor', 'maxCursor'].find((key) => parsed[key] !== undefined) || 'cursor';
            parsed[bodyKey] = cursor;
            body = JSON.stringify(parsed);
        }
        catch { /* Preserve opaque request bodies. */ }
    }
    return { url: url.toString(), method: capture.method, body };
}
async function fetchCursorPage(page, capture, cursor) {
    const request = requestWithCursor(capture, cursor);
    const responseText = await page.evaluate(async ({ url, method, body }) => {
        const response = await fetch(url, {
            method,
            credentials: 'include',
            headers: body ? { 'content-type': 'application/json' } : undefined,
            body: method === 'GET' || method === 'HEAD' ? undefined : body,
        });
        if (!response.ok)
            throw new Error(`Douyin work-list pagination failed: HTTP ${response.status}`);
        return response.text();
    }, request);
    return (0, safe_json_js_1.safeJsonParse)(responseText);
}
async function collectContent(page, captures) {
    await (0, helpers_js_1.openPage)(page, 'https://creator.douyin.com/creator-micro/content/manage');
    const observeMs = Math.max(0, Number(process.env.XMT_DOUYIN_WORK_LIST_OBSERVE_MS ?? 0));
    if (observeMs)
        await page.waitForTimeout(observeMs);
    const initialCapture = captures.find((capture) => capture.page === 'work-list' && (0, common_js_1.workCandidateArrays)(capture.response).length > 0);
    let pageCount = initialCapture ? 1 : 0;
    if (initialCapture) {
        const paginated = await (0, work_list_pagination_js_1.paginateWorkList)(initialCapture.response, (cursor) => fetchCursorPage(page, initialCapture, cursor));
        pageCount = paginated.page_count;
        for (const response of paginated.responses.slice(1)) {
            captures.push({
                page: 'work-list', url: initialCapture.url, method: initialCapture.method, status: 200,
                headers: {}, request_body: initialCapture.request_body, response,
                response_size: Buffer.byteLength(JSON.stringify(response)), captured_at: new Date().toISOString(),
            });
        }
    }
    const parsed = (0, common_js_1.parseWorksDetailed)(captures.filter((capture) => capture.page === 'work-list'));
    return {
        works: parsed.works,
        dom: await (0, helpers_js_1.bodySnapshot)(page),
        collectionStats: {
            raw_response_count: parsed.raw_response_count,
            aweme_candidate_count: parsed.aweme_candidate_count,
            normalized_success_count: parsed.works.length,
            rejected_count: parsed.rejected_count,
            rejected_reasons: parsed.rejected_reasons,
            page_count: pageCount,
            new_count: 0,
        },
    };
}
