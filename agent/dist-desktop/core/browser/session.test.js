"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_test_1 = __importDefault(require("node:test"));
const node_path_1 = __importDefault(require("node:path"));
const discovery_js_1 = require("./discovery.js");
const capabilities_js_1 = require("./capabilities.js");
const profile_js_1 = require("./profile.js");
const session_js_1 = require("./session.js");
const account_js_1 = require("../collector/douyin/parser/account.js");
(0, node_test_1.default)('macOS 发现 Chrome、Edge、Brave 和 Arc', () => { const items = (0, discovery_js_1.macCandidates)('/Users/测试 用户'); for (const type of ['chrome', 'edge', 'brave', 'arc'])
    strict_1.default.ok(items.some(item => item.type === type)); strict_1.default.ok(items.some(item => item.path?.includes('/Users/测试 用户/Applications'))); });
(0, node_test_1.default)('Windows 发现 Chrome、Edge 和 Brave', () => { const items = (0, discovery_js_1.windowsCandidates)({ PROGRAMFILES: 'C:\\程序 文件', LOCALAPPDATA: 'C:\\用户\\识君' }); for (const type of ['chrome', 'edge', 'brave'])
    strict_1.default.ok(items.some(item => item.type === type)); strict_1.default.ok(items.every(item => item.path?.includes('程序 文件') || item.path?.includes('识君'))); });
(0, node_test_1.default)('自定义路径支持中文和空格并拒绝不可执行文件', () => { const directory = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), '浏览器 测试-')), executable = node_path_1.default.join(directory, '自定义 Browser'); try {
    node_fs_1.default.writeFileSync(executable, '#!/bin/sh\nexit 0\n');
    node_fs_1.default.chmodSync(executable, 0o755);
    strict_1.default.ok((0, discovery_js_1.discoverBrowsers)({ platform: 'linux', customPath: executable }).some(item => item.source === 'user'));
    node_fs_1.default.chmodSync(executable, 0o644);
    strict_1.default.ok(!(0, discovery_js_1.discoverBrowsers)({ platform: 'linux', customPath: executable }).some(item => item.source === 'user'));
}
finally {
    node_fs_1.default.rmSync(directory, { recursive: true, force: true });
} });
(0, node_test_1.default)('浏览器能力按引擎和运行时检测', () => { strict_1.default.equal((0, capabilities_js_1.capabilities)('chromium', 'system').supportsCdp, true); strict_1.default.equal((0, capabilities_js_1.capabilities)('firefox', 'playwright').supportsCdp, false); strict_1.default.equal((0, capabilities_js_1.capabilities)('webkit', 'playwright').supportsCreatorCenter, false); strict_1.default.equal((0, capabilities_js_1.capabilities)('chromium', 'external-cdp').supportsManagedProfile, false); });
(0, node_test_1.default)('优先选择用户指定，其次最近成功和兼容浏览器', () => { const make = (id, type, status) => ({ id, displayName: id, browserType: type, engine: 'chromium', runtime: 'system', source: 'test', capabilities: (0, capabilities_js_1.capabilities)('chromium', 'system'), compatibilityStatus: status, compatibilityReason: 'test' }); const list = [make('chrome', 'chrome', 'not_tested'), make('edge', 'edge', 'compatible')]; strict_1.default.equal((0, discovery_js_1.rankBrowsers)(list)[0].id, 'edge'); strict_1.default.equal((0, discovery_js_1.rankBrowsers)(list, 'chrome')[0].id, 'chrome'); strict_1.default.equal((0, discovery_js_1.rankBrowsers)(list, undefined, 'chrome')[0].id, 'chrome'); });
(0, node_test_1.default)('自动回退排除不兼容项且最多尝试三个', () => { const make = (id, status) => ({ id, displayName: id, browserType: 'chromium', engine: 'chromium', runtime: 'playwright', source: 'test', capabilities: (0, capabilities_js_1.capabilities)('chromium', 'playwright'), compatibilityStatus: status, compatibilityReason: 'test' }); const list = [make('bad', 'incompatible'), make('one', 'compatible'), make('two', 'not_tested'), make('three', 'not_tested'), make('four', 'not_tested')]; const result = (0, discovery_js_1.fallbackBrowsers)(list, 'bad', undefined, 9); strict_1.default.equal(result.length, 3); strict_1.default.ok(result.every(item => item.id !== 'bad')); });
(0, node_test_1.default)('不同账号和浏览器使用独立资料目录', () => { const root = node_path_1.default.join('/tmp', 'XMT Creator Agent 中文'); const chrome = (0, profile_js_1.managedProfile)(root, { type: 'chrome', profileName: 'default' }, '账号 A'); const edge = (0, profile_js_1.managedProfile)(root, { type: 'edge', profileName: 'default' }, '账号 A'); strict_1.default.notEqual(chrome, edge); strict_1.default.ok(chrome.includes('chrome')); strict_1.default.equal((0, profile_js_1.assertManagedProfile)(chrome, root), chrome); strict_1.default.throws(() => (0, profile_js_1.assertManagedProfile)('/tmp/outside', root)); });
(0, node_test_1.default)('登录检测忽略隐藏登录文案并识别创作者外壳', async () => { const page = { waitForLoadState: async () => undefined, url: () => 'https://creator.douyin.com/creator-micro/home', locator: () => ({ innerText: async () => '内容管理 数据中心 抖音号：40283171336 登录抖音说明' }), getByText: () => ({ first: () => ({ isVisible: async () => false }) }) }; strict_1.default.equal(await (0, session_js_1.isDouyinCreatorLoggedIn)(page), true); });
(0, node_test_1.default)('可见登录控件优先判定为未登录', async () => { const page = { waitForLoadState: async () => undefined, url: () => 'https://creator.douyin.com/creator-micro/home', locator: () => ({ innerText: async () => '内容管理 数据中心 抖音号：40283171336' }), getByText: () => ({ first: () => ({ isVisible: async () => true }) }) }; strict_1.default.equal(await (0, session_js_1.isDouyinCreatorLoggedIn)(page), false); });
(0, node_test_1.default)('结构化响应缺失时从页面身份区域回退', () => { const account = (0, account_js_1.mergeAccountDomFallback)((0, account_js_1.parseAccount)([]), '岱下纪事\n抖音号： 40283171336\n关注 41\n粉丝 1570\n获赞 1.02万'); strict_1.default.equal(account.nickname, '岱下纪事'); strict_1.default.equal(account.uid, '40283171336'); strict_1.default.equal(account.fans_count, 1570); strict_1.default.equal(account.total_likes, 10200); });
