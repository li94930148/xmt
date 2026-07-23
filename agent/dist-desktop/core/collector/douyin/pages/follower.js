"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectFollower = collectFollower;
const helpers_js_1 = require("./helpers.js");
async function collectFollower(page, captures) { const start = captures.length; await (0, helpers_js_1.openPage)(page, 'https://creator.douyin.com/creator-micro/data/stats/follower/portrait'); await (0, helpers_js_1.clickLabels)(page, ['粉丝趋势', '性别', '年龄', '城市', '地域', '活跃时间', '兴趣偏好']); return { raw: captures.slice(start).map(c => c.response), dom: await (0, helpers_js_1.bodySnapshot)(page) }; }
