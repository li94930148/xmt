"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseCollector = void 0;
const safe_json_js_1 = require("./safe-json.js");
const SECRET = /cookie|authorization|password|passwd|token|session|ticket|signature|secret|access[_-]?key|credential/i;
function sanitize(value, depth = 0) {
    if (depth > 8)
        return '[truncated]';
    if (Array.isArray(value))
        return value.slice(0, 500).map((item) => sanitize(item, depth + 1));
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value)
            .filter(([key]) => !SECRET.test(key)).map(([key, item]) => [key, sanitize(item, depth + 1)]));
    return typeof value === 'string' && value.length > 10_000 ? `${value.slice(0, 10_000)}…` : value;
}
class ResponseCollector {
    page;
    captures = [];
    pageType = 'unknown';
    handler = (response) => { void this.capture(response); };
    constructor(page) {
        this.page = page;
    }
    setPage(pageType) { this.pageType = pageType; }
    start() { this.page.on('response', this.handler); }
    stop() { this.page.off('response', this.handler); }
    async capture(response) {
        const request = response.request();
        if (!['xhr', 'fetch'].includes(request.resourceType()))
            return;
        if (!/creator\.douyin\.com/i.test(request.url()) || this.captures.length >= 2_000)
            return;
        try {
            const responseText = await response.text();
            const payload = sanitize((0, safe_json_js_1.safeJsonParse)(responseText));
            this.captures.push({
                page: this.pageType, url: request.url(), method: request.method(), status: response.status(),
                headers: sanitize(response.headers()), request_body: request.postData() || undefined, response: payload,
                response_size: Buffer.byteLength(JSON.stringify(payload)), captured_at: new Date().toISOString(),
            });
        }
        catch { }
    }
}
exports.ResponseCollector = ResponseCollector;
