"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const discovery_js_1 = require("./discovery.js");
const registry_js_1 = require("./registry.js");
const dataRoot = process.platform === 'darwin' ? node_path_1.default.join(node_os_1.default.homedir(), 'Library', 'Application Support', 'XMT Creator Agent') : node_path_1.default.join(process.env.LOCALAPPDATA || process.env.APPDATA || node_os_1.default.homedir(), 'XMT Creator Agent');
const configPath = node_path_1.default.join(dataRoot, 'config.json');
const arg = (name) => process.argv.slice(3).find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const command = process.argv[2] || 'list';
async function config() { try {
    return JSON.parse(await promises_1.default.readFile(configPath, 'utf8'));
}
catch {
    return null;
} }
const compact = (item) => ({ id: item.id, name: item.displayName, type: item.browserType, engine: item.engine, runtime: item.runtime, version: item.version || 'unknown', source: item.source, compatibility: item.compatibilityStatus, reason: item.compatibilityReason, capabilities: item.capabilities });
async function main() { const current = await config(); const customPath = arg('path'), discovered = (0, discovery_js_1.discoverBrowsers)({ customPath }); if (customPath && !discovered.some(item => item.source === 'user'))
    throw new Error('自定义浏览器路径不存在、不是文件或没有执行权限'); const found = (0, discovery_js_1.rankBrowsers)(discovered, arg('id') || current?.browserConfig?.id, current?.browserConfig?.lastSuccessfulId); const selected = () => { const wanted = arg('browser'), explicit = arg('id'); return found.find(item => item.id === explicit) || found.find(item => item.browserType === wanted) || found[0]; }; if (command === 'list')
    console.log(JSON.stringify({ browsers: found.map(compact) }, null, 2));
else if (command === 'test') {
    const item = selected();
    if (!item)
        throw new Error('没有发现可测试的浏览器');
    const selection = { id: item.id, type: item.browserType, engine: item.engine, runtime: item.runtime, executablePath: item.executablePath, sessionMode: 'persistent', profileName: 'compatibility-test', headless: false, launchArgs: [], autoFallback: false };
    const session = new registry_js_1.BrowserRegistry(dataRoot, found).create(selection, 'compatibility-test');
    let status = 'incompatible', reason = '';
    try {
        await session.start();
        const page = await session.getActivePage();
        await page.waitForFunction(() => Boolean(document.body?.innerText && document.body.innerText.length > 50), undefined, { timeout: 15_000 }).catch(() => undefined);
        const title = await page.title();
        const body = await page.locator('body').innerText({ timeout: 15_000 }).catch(() => '');
        const core = page.url().includes('creator.douyin.com') && body.length > 50;
        status = core && item.engine === 'chromium' ? 'compatible' : core ? 'partially_compatible' : 'incompatible';
        reason = core ? `页面已加载：${title || '抖音创作者中心'}` : '页面核心内容未正常加载';
    }
    catch (error) {
        reason = error instanceof Error ? error.message : String(error);
    }
    finally {
        await session.stop();
    }
    console.log(JSON.stringify({ browser: compact(item), status, reason }, null, 2));
    process.exitCode = status === 'incompatible' ? 2 : 0;
}
else if (command === 'select') {
    const item = selected();
    if (!item)
        throw new Error('没有找到指定浏览器');
    const next = { ...(current || {}), browserConfig: { id: item.id, type: item.browserType, engine: item.engine, runtime: item.runtime, executablePath: item.executablePath, sessionMode: (arg('mode') || 'persistent'), profileName: arg('profile') || 'default', headless: arg('headless') === 'true', cdpEndpoint: arg('cdp'), launchArgs: [], autoFallback: arg('fallback') !== 'false' } };
    await promises_1.default.mkdir(dataRoot, { recursive: true });
    await promises_1.default.writeFile(configPath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
    console.log(JSON.stringify({ selected: compact(item), config: configPath }, null, 2));
}
else
    throw new Error(`未知浏览器命令：${command}`); }
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
