"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSystemChrome = findSystemChrome;
exports.stopSystemChrome = stopSystemChrome;
exports.launchSystemChrome = launchSystemChrome;
exports.isDouyinCreatorLoggedIn = isDouyinCreatorLoggedIn;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const CREATOR_URL = 'https://creator.douyin.com/';
function findSystemChrome(preferredPath) {
    if (preferredPath && node_fs_1.default.existsSync(preferredPath) && node_path_1.default.basename(preferredPath).toLowerCase() === 'chrome.exe')
        return preferredPath;
    const candidates = [process.env.PROGRAMFILES && node_path_1.default.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'), process.env['PROGRAMFILES(X86)'] && node_path_1.default.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'), process.env.LOCALAPPDATA && node_path_1.default.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')].filter((value) => Boolean(value));
    const executable = candidates.find(candidate => node_fs_1.default.existsSync(candidate));
    if (!executable)
        throw new Error('Chrome启动失败，请检查Chrome安装。');
    return executable;
}
function stopSystemChrome() { const result = (0, node_child_process_1.spawnSync)('taskkill.exe', ['/F', '/IM', 'chrome.exe'], { windowsHide: true, stdio: 'ignore' }); if (result.error)
    throw new Error(`无法关闭现有 Chrome：${result.error.message}`); }
async function launchSystemChrome(profileDir, port = 9222, preferredPath) {
    const executable = findSystemChrome(preferredPath);
    node_fs_1.default.mkdirSync(profileDir, { recursive: true });
    stopSystemChrome();
    const child = (0, node_child_process_1.spawn)(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', CREATOR_URL], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    const endpoint = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1_500) });
            if (response.ok)
                return endpoint;
        }
        catch { }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Chrome启动失败，请检查Chrome安装。');
}
async function isDouyinCreatorLoggedIn(page) {
    await page.waitForLoadState('domcontentloaded').catch(() => { });
    const url = page.url();
    const body = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
    const loginPrompt = /扫码登录|手机号登录|验证码登录|登录抖音/.test(body);
    const creatorShell = /作品管理|数据中心|发布作品|创作中心|创作服务/.test(body);
    return url.includes('creator.douyin.com') && !url.includes('/login') && !loginPrompt && creatorShell;
}
