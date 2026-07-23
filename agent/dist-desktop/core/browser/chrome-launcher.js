"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findChrome = findChrome;
exports.stopChrome = stopChrome;
exports.launchChrome = launchChrome;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const CREATOR_URL = 'https://creator.douyin.com/';
function findChrome(preferredPath) {
    if (preferredPath && node_fs_1.default.existsSync(preferredPath) && node_path_1.default.basename(preferredPath).toLowerCase() === 'chrome.exe')
        return preferredPath;
    const candidates = [
        process.env.PROGRAMFILES && node_path_1.default.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env['PROGRAMFILES(X86)'] && node_path_1.default.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env.LOCALAPPDATA && node_path_1.default.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ].filter((value) => Boolean(value));
    const executable = candidates.find((candidate) => node_fs_1.default.existsSync(candidate));
    if (!executable)
        throw new Error('Chrome启动失败，请检查Chrome安装。');
    return executable;
}
function stopChrome() {
    const result = (0, node_child_process_1.spawnSync)('taskkill.exe', ['/F', '/IM', 'chrome.exe'], { windowsHide: true, stdio: 'ignore' });
    if (result.error)
        throw new Error(`无法关闭现有 Chrome：${result.error.message}`);
}
async function launchChrome(profileDir, port = 9222, preferredPath) {
    const executable = findChrome(preferredPath);
    node_fs_1.default.mkdirSync(profileDir, { recursive: true });
    stopChrome();
    const child = (0, node_child_process_1.spawn)(executable, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        CREATOR_URL,
    ], { detached: true, stdio: 'ignore', windowsHide: false });
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
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Chrome启动失败：9222 调试端口未就绪。');
}
