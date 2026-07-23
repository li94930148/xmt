"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectWorkDetail = collectWorkDetail;
const common_js_1 = require("../parser/common.js");
const helpers_js_1 = require("./helpers.js");
async function collectWorkDetail(page, itemId, captures) {
    const start = captures.length;
    await (0, helpers_js_1.openPage)(page, `https://creator.douyin.com/creator-micro/work-management/work-detail/${encodeURIComponent(itemId)}`);
    await (0, helpers_js_1.clickLabels)(page, ['总览', '流量分析', '流量来源', '推荐流量', '搜索流量', '主页流量', '粉丝流量', '观众分析', '性别', '年龄', '地域', '在线时间', '兴趣标签', '评论分析', '热门评论', '评论关键词']);
    const raw = captures.slice(start).map((capture) => capture.response);
    const overview = Object.assign({}, ...raw.flatMap((value) => (0, common_js_1.objects)(value)).map(common_js_1.metrics));
    return { item_id: itemId, overview, traffic: raw, audience: raw, comments: raw, raw: { network: raw, dom: await (0, helpers_js_1.bodySnapshot)(page) } };
}
