"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DouyinCreatorCollector = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const api_map_js_1 = require("./douyin/network/api-map.js");
const interceptor_js_1 = require("./douyin/network/interceptor.js");
const content_js_1 = require("./douyin/pages/content.js");
const work_detail_js_1 = require("./douyin/pages/work-detail.js");
const operation_js_1 = require("./douyin/pages/operation.js");
const content_analysis_js_1 = require("./douyin/pages/content-analysis.js");
const follower_js_1 = require("./douyin/pages/follower.js");
const discovery_store_js_1 = require("../network/discovery-store.js");
class DouyinCreatorCollector {
    browser;
    networkLogPath;
    discoveryDirectory;
    constructor(browser, networkLogPath, discoveryDirectory) {
        this.browser = browser;
        this.networkLogPath = networkLogPath;
        this.discoveryDirectory = discoveryDirectory;
    }
    async collect() {
        return this.browser.withPage(async (page) => {
            const network = new interceptor_js_1.DouyinNetworkInterceptor(page);
            network.start();
            try {
                network.setPage('work-list');
                const content = await (0, content_js_1.collectContent)(page, network.captures);
                network.setPage('work-detail');
                const detailId = content.works.find((work) => work.item_id === '7663799549412758193')?.item_id ?? '7663799549412758193';
                const details = [await (0, work_detail_js_1.collectWorkDetail)(page, detailId, network.captures)];
                network.setPage('account-dashboard');
                const dashboard = await (0, operation_js_1.collectOperation)(page, network.captures);
                network.setPage('content-analysis');
                const contentAnalysis = await (0, content_analysis_js_1.collectContentAnalysis)(page, network.captures);
                network.setPage('fans-analysis');
                const fans = await (0, follower_js_1.collectFollower)(page, network.captures);
                const account = await page.evaluate(() => { const avatar = document.querySelector('img[class*=avatar]')?.src || ''; const nickname = document.querySelector('[class*=nickname],[class*=user-name]')?.innerText || ''; return { nickname, avatar, uid: '', fans_count: 0 }; }).catch(() => ({ nickname: '', avatar: '', uid: '', fans_count: 0 }));
                const snapshot = { platform: 'douyin', source: 'local_creator_center', collected_at: new Date().toISOString(), account, works: content.works, work_details: details, dashboard, content_analysis: contentAnalysis, fans, raw: { api_map: (0, api_map_js_1.buildApiMap)(network.captures), captures: network.captures }, videos: content.works, operations: { last7Days: dashboard, last30Days: dashboard, trafficSources: details.map(d => d.traffic), contentPerformance: contentAnalysis } };
                if (this.networkLogPath) {
                    await promises_1.default.mkdir(node_path_1.default.dirname(this.networkLogPath), { recursive: true });
                    await promises_1.default.writeFile(this.networkLogPath, JSON.stringify({ generated_at: snapshot.collected_at, api_map: snapshot.raw.api_map, captures: network.captures }, null, 2), 'utf8');
                }
                if (this.discoveryDirectory) {
                    await (0, discovery_store_js_1.writeDiscovery)(this.discoveryDirectory, 'work-list.json', 'work-list', network.captures);
                    await (0, discovery_store_js_1.writeDiscovery)(this.discoveryDirectory, 'work-detail.json', 'work-detail', network.captures);
                    await (0, discovery_store_js_1.writeDiscovery)(this.discoveryDirectory, 'account-dashboard.json', 'account-dashboard', network.captures);
                    await (0, discovery_store_js_1.writeDiscovery)(this.discoveryDirectory, 'content-analysis.json', 'content-analysis', network.captures);
                    await (0, discovery_store_js_1.writeDiscovery)(this.discoveryDirectory, 'fans-analysis.json', 'fans-analysis', network.captures);
                }
                return snapshot;
            }
            finally {
                network.stop();
            }
        });
    }
}
exports.DouyinCreatorCollector = DouyinCreatorCollector;
