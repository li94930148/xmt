"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalCdpSession = exports.ManagedBrowserSession = void 0;
const node_path_1 = __importDefault(require("node:path"));
const playwright_1 = require("playwright");
const session_js_1 = require("./session.js");
const profile_js_1 = require("./profile.js");
const CREATOR = 'https://creator.douyin.com/creator-micro/home';
class ManagedBrowserSession {
    info;
    selection;
    profile;
    dataRoot;
    context = null;
    constructor(info, selection, profile, dataRoot) {
        this.info = info;
        this.selection = selection;
        this.profile = profile;
        this.dataRoot = dataRoot;
    }
    api() { return this.info.engine === 'firefox' ? playwright_1.firefox : this.info.engine === 'webkit' ? playwright_1.webkit : playwright_1.chromium; }
    async start() { if (this.context)
        return; const userDataDir = (0, profile_js_1.assertManagedProfile)(this.profile, this.dataRoot); const args = this.selection.launchArgs || []; this.context = await this.api().launchPersistentContext(node_path_1.default.resolve(userDataDir), { headless: this.selection.headless, executablePath: this.info.runtime === 'system' ? this.info.executablePath : undefined, args, acceptDownloads: true }); await this.ensurePage(CREATOR); }
    async stop() { await this.context?.close(); this.context = null; }
    async restart() { await this.stop(); await this.start(); }
    isConnected() { return Boolean(this.context?.browser()?.isConnected()); }
    getContext() { if (!this.context)
        throw new Error('浏览器会话尚未启动'); return this.context; }
    listPages() { return this.getContext().pages(); }
    async getActivePage() { return this.listPages().find(p => p.url().includes('creator.douyin.com')) || this.listPages()[0] || this.getContext().newPage(); }
    async openPage(url) { const page = await this.getContext().newPage(); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }); return page; }
    async ensurePage(url) { const page = await this.getActivePage(); if (!page.url().includes('creator.douyin.com'))
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }); return page; }
    getCapabilities() { return this.info.capabilities; }
    getBrowserInfo() { return this.info; }
    async checkLoginState() { return (0, session_js_1.isDouyinCreatorLoggedIn)(await this.ensurePage(CREATOR)); }
    async withPage(run) { if (!this.context)
        await this.start(); return run(await this.ensurePage(CREATOR)); }
}
exports.ManagedBrowserSession = ManagedBrowserSession;
class ExternalCdpSession {
    info;
    endpoint;
    browser = null;
    constructor(info, endpoint) {
        this.info = info;
        this.endpoint = endpoint;
    }
    async start() { if (!this.info.capabilities.supportsCdp)
        throw new Error('所选浏览器不支持外部 CDP 会话'); this.browser = await playwright_1.chromium.connectOverCDP(this.endpoint); }
    async stop() { await this.browser?.close(); this.browser = null; }
    async restart() { await this.stop(); await this.start(); }
    isConnected() { return Boolean(this.browser?.isConnected()); }
    getContext() { const context = this.browser?.contexts()[0]; if (!context)
        throw new Error('外部浏览器没有可用上下文'); return context; }
    listPages() { return this.getContext().pages(); }
    async getActivePage() { return this.listPages().find(p => p.url().includes('creator.douyin.com')) || this.listPages()[0] || this.getContext().newPage(); }
    async openPage(url) { const page = await this.getContext().newPage(); await page.goto(url, { waitUntil: 'domcontentloaded' }); return page; }
    async ensurePage(url) { const page = await this.getActivePage(); if (!page.url().includes('creator.douyin.com'))
        await page.goto(url, { waitUntil: 'domcontentloaded' }); return page; }
    getCapabilities() { return this.info.capabilities; }
    getBrowserInfo() { return this.info; }
    async checkLoginState() { return (0, session_js_1.isDouyinCreatorLoggedIn)(await this.ensurePage(CREATOR)); }
    async withPage(run) { if (!this.browser)
        await this.start(); return run(await this.ensurePage(CREATOR)); }
}
exports.ExternalCdpSession = ExternalCdpSession;
