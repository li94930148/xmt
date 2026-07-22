"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemChromeAdapter = void 0;
const playwright_1 = require("playwright");
class SystemChromeAdapter {
    endpoint;
    mode = 'system_chrome';
    browser = null;
    constructor(endpoint = 'http://127.0.0.1:9222') {
        this.endpoint = endpoint;
    }
    async connect() {
        if (this.browser?.isConnected())
            return this.browser;
        try {
            this.browser = await playwright_1.chromium.connectOverCDP(this.endpoint, { timeout: 5_000 });
            return this.browser;
        }
        catch {
            throw new Error(`未检测到 Chrome 调试端口。请完全退出 Chrome 后使用 --remote-debugging-port=9222 启动，并在真实 Chrome 中登录抖音创作者中心。`);
        }
    }
    async creatorPage() {
        const browser = await this.connect();
        const context = browser.contexts()[0];
        if (!context)
            throw new Error('Chrome 没有可用浏览器上下文');
        const existing = context.pages().find(page => page.url().includes('creator.douyin.com'));
        const page = existing || await context.newPage();
        if (!existing)
            await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
        return page;
    }
    async openLogin() { const page = await this.creatorPage(); await page.bringToFront(); }
    async completeLogin() { await this.connect(); }
    async withPage(run) { return run(await this.creatorPage()); }
}
exports.SystemChromeAdapter = SystemChromeAdapter;
