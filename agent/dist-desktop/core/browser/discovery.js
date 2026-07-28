"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.windowsCandidates = exports.macCandidates = void 0;
exports.discoverBrowsers = discoverBrowsers;
exports.rankBrowsers = rankBrowsers;
exports.fallbackBrowsers = fallbackBrowsers;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const playwright_1 = require("playwright");
const capabilities_js_1 = require("./capabilities.js");
const macCandidates = (home) => [
    ['chrome', 'Google Chrome', 'Google Chrome.app'], ['chromium', 'Chromium', 'Chromium.app'], ['edge', 'Microsoft Edge', 'Microsoft Edge.app'], ['brave', 'Brave Browser', 'Brave Browser.app'], ['arc', 'Arc', 'Arc.app'],
].flatMap(([type, name, bundle]) => ['/Applications', node_path_1.default.join(home, 'Applications')].map(root => ({ type: type, engine: 'chromium', name, path: node_path_1.default.join(root, bundle, 'Contents', 'MacOS', name), source: 'macos-app' })));
exports.macCandidates = macCandidates;
const windowsCandidates = (env) => {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap(root => [
        { type: 'chrome', engine: 'chromium', name: 'Google Chrome', path: node_path_1.default.win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), source: 'windows-app' },
        { type: 'edge', engine: 'chromium', name: 'Microsoft Edge', path: node_path_1.default.win32.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), source: 'windows-app' },
        { type: 'brave', engine: 'chromium', name: 'Brave Browser', path: node_path_1.default.win32.join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'), source: 'windows-app' },
    ]);
};
exports.windowsCandidates = windowsCandidates;
function version(executable) { try {
    return (0, node_child_process_1.execFileSync)(executable, ['--version'], { encoding: 'utf8', timeout: 3000 }).trim().replace(/\r?\n/g, ' ');
}
catch {
    return undefined;
} }
function managed(type, engine, name, executablePath) { return { id: `playwright:${type}`, displayName: name, browserType: type, engine, runtime: 'playwright', executablePath, version: version(executablePath), source: 'playwright', capabilities: (0, capabilities_js_1.capabilities)(engine, 'playwright'), compatibilityStatus: engine === 'chromium' ? 'not_tested' : 'partially_compatible', compatibilityReason: engine === 'chromium' ? '等待实机兼容性检测' : '可启动，但抖音创作者中心功能可能受限' }; }
function discoverBrowsers(options = {}) { const platform = options.platform || process.platform, env = options.env || process.env, home = options.home || node_os_1.default.homedir(); const candidates = platform === 'darwin' ? (0, exports.macCandidates)(home) : platform === 'win32' ? (0, exports.windowsCandidates)(env) : []; if (options.customPath)
    candidates.unshift({ type: 'custom', engine: 'chromium', name: '自定义浏览器', path: options.customPath, source: 'user' }); const found = []; const seen = new Set(); for (const item of candidates) {
    if (!item.path || !node_fs_1.default.existsSync(item.path))
        continue;
    let real;
    try {
        real = node_fs_1.default.realpathSync(item.path);
        if (!node_fs_1.default.statSync(real).isFile())
            continue;
        node_fs_1.default.accessSync(real, node_fs_1.default.constants.X_OK);
    }
    catch {
        continue;
    }
    if (seen.has(real))
        continue;
    seen.add(real);
    found.push({ id: `system:${item.type}:${Buffer.from(real).toString('base64url').slice(0, 12)}`, displayName: item.name, browserType: item.type, engine: item.engine, runtime: 'system', executablePath: real, version: version(real), source: item.source, capabilities: (0, capabilities_js_1.capabilities)(item.engine, 'system'), compatibilityStatus: 'not_tested', compatibilityReason: '等待实机兼容性检测' });
} for (const [type, engine, name, api] of [['chromium', 'chromium', 'Playwright Chromium', playwright_1.chromium], ['firefox', 'firefox', 'Playwright Firefox', playwright_1.firefox], ['webkit', 'webkit', 'Playwright WebKit', playwright_1.webkit]]) {
    const executable = api.executablePath();
    if (node_fs_1.default.existsSync(executable) && !seen.has(node_fs_1.default.realpathSync(executable)))
        found.push(managed(type, engine, name, executable));
} return found; }
function rankBrowsers(found, preferredId, lastSuccessfulId) { const typeScore = { chrome: 50, edge: 45, brave: 43, chromium: 40, arc: 35, firefox: 20, webkit: 10, custom: 30 }; return [...found].sort((a, b) => ((b.id === preferredId ? 1000 : b.id === lastSuccessfulId ? 800 : 0) + typeScore[b.browserType] + (b.compatibilityStatus === 'compatible' ? 100 : b.compatibilityStatus === 'incompatible' ? -500 : 0)) - ((a.id === preferredId ? 1000 : a.id === lastSuccessfulId ? 800 : 0) + typeScore[a.browserType] + (a.compatibilityStatus === 'compatible' ? 100 : a.compatibilityStatus === 'incompatible' ? -500 : 0))); }
function fallbackBrowsers(found, preferredId, lastSuccessfulId, maxAttempts = 3) { return rankBrowsers(found, preferredId, lastSuccessfulId).filter(item => item.compatibilityStatus !== 'incompatible').slice(0, Math.max(1, Math.min(3, maxAttempts))); }
