"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseKeys = responseKeys;
exports.buildApiMap = buildApiMap;
function responseKeys(value) {
    return value && typeof value === 'object' ? Object.keys(value).slice(0, 200) : [];
}
function buildApiMap(captures) {
    const seen = new Set();
    return captures.filter((capture) => {
        const key = `${capture.page}|${capture.method}|${capture.url.split('?')[0]}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    }).map(({ page, url, method, response }) => ({ page, url: url.split('?')[0], method, responseKeys: responseKeys(response) }));
}
