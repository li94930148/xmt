"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectOperation = collectOperation;
const helpers_js_1 = require("./helpers.js");
async function collectOperation(page, captures) { const start = captures.length; await (0, helpers_js_1.openPage)(page, 'https://creator.douyin.com/creator-micro/data-center/operation'); const ranges = {}; for (const label of ['今日', '昨日', '近7天', '近30天']) {
    const before = captures.length;
    await (0, helpers_js_1.clickLabels)(page, [label]);
    ranges[label] = captures.slice(before).map(c => c.response);
} return { ranges, raw: captures.slice(start).map(c => c.response) }; }
