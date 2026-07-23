"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemChromeAdapter = void 0;
const chrome_launcher_js_1 = require("./chrome-launcher.js");
const chrome_connector_js_1 = require("./chrome-connector.js");
class SystemChromeAdapter {
    profileDir;
    chromePath;
    mode = 'system_chrome';
    browser = null;
    endpoint;
    constructor(profileDir, endpoint = 'http://127.0.0.1:9222', chromePath) {
        this.profileDir = profileDir;
        this.chromePath = chromePath;
        this.endpoint = endpoint;
    }
    async connect() { if (this.browser?.isConnected())
        return this.browser; try {
        this.browser = (await (0, chrome_connector_js_1.connectChrome)(this.endpoint)).browser;
        return this.browser;
    }
    catch (error) {
        throw new Error(`connectOverCDP失败：${error instanceof Error ? error.message : String(error)}`);
    } }
    async creatorPage() { const browser = await this.connect(); const context = browser.contexts()[0]; if (!context)
        throw new Error('Chrome 没有可用浏览器上下文'); const existing = context.pages().find(page => page.url().includes('creator.douyin.com')); const page = existing || await context.newPage(); if (!existing)
        await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 }); return page; }
    async openLogin() { this.endpoint = await (0, chrome_launcher_js_1.launchChrome)(this.profileDir, 9222, this.chromePath); this.browser = null; const page = await this.creatorPage(); await page.bringToFront(); }
    async completeLogin() { return (0, chrome_connector_js_1.checkLogin)(await this.creatorPage()); }
    async withPage(run) { return run(await this.creatorPage()); }
}
exports.SystemChromeAdapter = SystemChromeAdapter;
