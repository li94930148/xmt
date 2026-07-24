"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readWorkListPagination = readWorkListPagination;
exports.paginateWorkList = paginateWorkList;
const common_js_1 = require("../collector/douyin/parser/common.js");
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
function paginationContainers(value) {
    const root = record(value);
    if (!root)
        return [];
    const data = record(root.data);
    const result = record(root.result);
    return [root, data, result, record(data?.data), record(result?.data)].filter((item) => Boolean(item));
}
function readWorkListPagination(value) {
    const containers = paginationContainers(value);
    const read = (keys) => containers.flatMap((container) => keys.map((key) => container[key])).find((item) => item !== undefined && item !== null);
    const rawHasMore = read(['has_more', 'hasMore']);
    const rawCursor = read(['max_cursor', 'maxCursor', 'cursor']);
    return { hasMore: rawHasMore === true || rawHasMore === 1 || rawHasMore === '1', cursor: rawCursor == null ? '' : String(rawCursor) };
}
async function paginateWorkList(firstResponse, fetchPage, options = {}) {
    const maxPages = Math.min(100, Math.max(1, options.maxPages ?? 100));
    const retries = Math.max(0, options.retries ?? 2);
    const responses = [firstResponse];
    const seenCursors = new Set();
    let current = firstResponse;
    while (responses.length < maxPages) {
        const state = readWorkListPagination(current);
        if (!state.hasMore)
            return { responses, page_count: responses.length, stop_reason: 'completed' };
        if (!state.cursor)
            return { responses, page_count: responses.length, stop_reason: 'missing_cursor' };
        if (seenCursors.has(state.cursor))
            return { responses, page_count: responses.length, stop_reason: 'repeated_cursor' };
        seenCursors.add(state.cursor);
        let next;
        let lastError;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
                next = await fetchPage(state.cursor);
                lastError = undefined;
                break;
            }
            catch (error) {
                lastError = error;
            }
        }
        if (lastError)
            throw lastError;
        if (!(0, common_js_1.workCandidateArrays)(next).some((items) => items.length > 0))
            return { responses, page_count: responses.length, stop_reason: 'empty_page' };
        responses.push(next);
        current = next;
    }
    return { responses, page_count: responses.length, stop_reason: 'max_pages' };
}
