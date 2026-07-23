"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DouyinNetworkInterceptor = void 0;
const api_map_js_1 = require("./api-map.js");
const SECRET = /cookie|authorization|password|passwd|token|session|ticket|signature/i;
function sanitize(value, depth = 0) {
    if (depth > 8)
        return '[truncated]';
    if (Array.isArray(value))
        return value.slice(0, 500).map((item) => sanitize(item, depth + 1));
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET.test(key)).map(([key, item]) => [key, sanitize(item, depth + 1)]));
    return typeof value === 'string' && value.length > 10000 ? `${value.slice(0, 10000)}…` : value;
}
function requestParams(response) {
    const request = response.request();
    const query = Object.fromEntries(new URL(request.url()).searchParams.entries());
    let body = request.postData();
    try {
        body = body ? JSON.parse(String(body)) : undefined;
    }
    catch { }
    return sanitize({ query, body });
}
class DouyinNetworkInterceptor {
    page;
    captures = [];
    handler = (response) => { void this.capture(response); };
    constructor(page) {
        this.page = page;
    }
    start() { this.page.on('response', this.handler); }
    stop() { this.page.off('response', this.handler); }
    async capture(response) {
        const request = response.request();
        if (!['xhr', 'fetch'].includes(request.resourceType()) && !/graphql/i.test(request.url()))
            return;
        if (!/creator\.douyin\.com/i.test(request.url()) || this.captures.length >= 1500)
            return;
        const contentType = response.headers()['content-type'] ?? '';
        if (!/json|javascript/i.test(contentType))
            return;
        try {
            const payload = sanitize(await response.json());
            this.captures.push({ name: (0, api_map_js_1.apiName)(request.url()), url: request.url(), method: request.method(), params: requestParams(response), response: payload, captured_at: new Date().toISOString() });
        }
        catch { }
    }
}
exports.DouyinNetworkInterceptor = DouyinNetworkInterceptor;
