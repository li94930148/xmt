"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiName = apiName;
exports.responseKeys = responseKeys;
exports.buildApiMap = buildApiMap;
const RULES = [
    ['works', /content|work|item|aweme/i], ['work_detail', /detail|video.*data/i], ['operation', /operation|overview|dashboard/i],
    ['content_analysis', /content.*(analysis|data)|work.*trend/i], ['follower', /follower|fans|portrait|audience/i], ['graphql', /graphql/i],
];
function apiName(url) { return RULES.find(([, rule]) => rule.test(url))?.[0] ?? 'unknown'; }
function responseKeys(value) {
    if (!value || typeof value !== 'object')
        return [];
    return Object.keys(value).slice(0, 100);
}
function buildApiMap(captures) {
    const seen = new Set();
    return captures.filter((capture) => { const key = `${capture.name}|${capture.url.split('?')[0]}`; if (seen.has(key))
        return false; seen.add(key); return true; })
        .map(({ name, url, params, response }) => ({ name, url: url.split('?')[0], params, response_keys: responseKeys(response) }));
}
