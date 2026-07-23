"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddedChromiumAdapter = void 0;
const node_path_1 = __importDefault(require("node:path"));
const playwright_1 = require("playwright");
const session_js_1 = require("./session.js");
class EmbeddedChromiumAdapter {
    profileDir;
    mode = 'embedded_chromium';
    loginContext = null;
    constructor(profileDir) {
        this.profileDir = profileDir;
    }
    async openLogin() { if (this.loginContext)
        throw new Error('内置浏览器登录窗口已经打开'); this.loginContext = await playwright_1.chromium.launchPersistentContext(node_path_1.default.resolve(this.profileDir), { headless: false }); const page = this.loginContext.pages()[0] || await this.loginContext.newPage(); await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded' }); }
    async completeLogin() { if (!this.loginContext)
        return false; const page = this.loginContext.pages().find(item => item.url().includes('creator.douyin.com')) || this.loginContext.pages()[0]; const loggedIn = page ? await (0, session_js_1.isDouyinCreatorLoggedIn)(page) : false; if (loggedIn) {
        await this.loginContext.close();
        this.loginContext = null;
    } return loggedIn; }
    async withPage(run) { let context; try {
        context = await playwright_1.chromium.launchPersistentContext(node_path_1.default.resolve(this.profileDir), { headless: true });
        const page = context.pages()[0] || await context.newPage();
        await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
        return await run(page);
    }
    finally {
        await context?.close();
    } }
}
exports.EmbeddedChromiumAdapter = EmbeddedChromiumAdapter;
