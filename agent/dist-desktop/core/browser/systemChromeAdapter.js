"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemChromeAdapter = void 0;
const playwright_1 = require("playwright");
const session_js_1 = require("./session.js");
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
        this.browser = await playwright_1.chromium.connectOverCDP(this.endpoint, { timeout: 5_000 });
        return this.browser;
    }
    catch {
        throw new Error('Chrome启动失败，请检查Chrome安装。');
    } }
    async creatorPage() { const browser = await this.connect(); const context = browser.contexts()[0]; if (!context)
        throw new Error('Chrome 没有可用浏览器上下文'); const existing = context.pages().find(page => page.url().includes('creator.douyin.com')); const page = existing || await context.newPage(); if (!existing)
        await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 }); return page; }
    async openLogin() { this.endpoint = await (0, session_js_1.launchSystemChrome)(this.profileDir, 9222, this.chromePath); this.browser = null; const page = await this.creatorPage(); await page.bringToFront(); }
    async completeLogin() { return (0, session_js_1.isDouyinCreatorLoggedIn)(await this.creatorPage()); }
    async withPage(run) { return run(await this.creatorPage()); }
}
exports.SystemChromeAdapter = SystemChromeAdapter;
