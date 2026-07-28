"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const discovery_js_1 = require("../core/browser/discovery.js");
const registry_js_1 = require("../core/browser/registry.js");
const profile_js_1 = require("../core/browser/profile.js");
const douyin_js_1 = require("../core/collector/douyin.js");
const client_js_1 = require("../core/uploader/client.js");
const scheduler_js_1 = require("../core/scheduler/scheduler.js");
const creatorDatabase_js_1 = require("../core/database/creatorDatabase.js");
const pageExplorer_js_1 = require("../core/explorer/pageExplorer.js");
electron_1.app.setName('XMT Creator Agent');
const executableDirectory = node_path_1.default.dirname(electron_1.app.getPath('exe'));
const resourceDirectory = process.resourcesPath;
const portableFlagCandidates = [node_path_1.default.join(executableDirectory, 'portable.flag'), node_path_1.default.join(resourceDirectory, 'portable.flag'), node_path_1.default.join(node_path_1.default.dirname(resourceDirectory), 'portable.flag')];
const portableMode = portableFlagCandidates.some(candidate => node_fs_1.default.existsSync(candidate));
const portableDataRoot = node_path_1.default.join(executableDirectory, 'data');
if (portableMode) {
    node_fs_1.default.mkdirSync(portableDataRoot, { recursive: true });
    electron_1.app.setPath('userData', portableDataRoot);
}
console.log(`[XMT Agent]\nMode: ${portableMode ? 'Portable' : 'Standard'}\nData: ${portableMode ? portableDataRoot : electron_1.app.getPath('userData')}`);
let mainWindow = null;
let tray = null;
let syncing = false;
let timer = null;
let heartbeatTimer = null;
let lastSyncAt;
let lastError;
let browserConnected = false;
let douyinLoggedIn = false;
let activeSession = null;
const paths = () => { const root = portableMode ? portableDataRoot : electron_1.app.getPath('userData'); return { root, config: node_path_1.default.join(root, 'config.json'), token: node_path_1.default.join(root, 'agent-token.bin'), profile: node_path_1.default.join(root, 'browser'), database: node_path_1.default.join(root, 'creator.db'), logs: node_path_1.default.join(root, 'logs'), log: node_path_1.default.join(root, 'logs', 'sync.log'), networkLog: node_path_1.default.join(root, 'logs', 'network.json'), discovery: node_path_1.default.join(root, 'douyin-api-discovery') }; };
async function log(message) { const p = paths(); await promises_1.default.mkdir(p.logs, { recursive: true }); const safe = message.replace(/cookie|password|authorization|token/gi, '[redacted]'); await promises_1.default.appendFile(p.log, `[${new Date().toISOString()}] ${safe}\n`, 'utf8'); }
function defaultBrowserConfig() { const item = (0, discovery_js_1.rankBrowsers)((0, discovery_js_1.discoverBrowsers)())[0]; if (!item)
    throw new Error('未发现可用浏览器，请安装受支持浏览器或 Playwright 运行时'); return { id: item.id, type: item.browserType, engine: item.engine, runtime: item.runtime, executablePath: item.executablePath, sessionMode: 'persistent', profileName: 'default', headless: false, launchArgs: [], autoFallback: true }; }
async function readConfig() { try {
    const config = JSON.parse(await promises_1.default.readFile(paths().config, 'utf8'));
    if (!config.browserConfig?.id)
        config.browserConfig = defaultBrowserConfig();
    return config;
}
catch {
    return null;
} }
async function writeConfig(config) { await promises_1.default.mkdir(paths().root, { recursive: true }); await promises_1.default.writeFile(paths().config, JSON.stringify(config, null, 2), 'utf8'); }
async function readyBrowserSession(config) { if (activeSession?.isConnected())
    return activeSession; const found = (0, discovery_js_1.discoverBrowsers)(config.browserConfig.type === 'custom' ? { customPath: config.browserConfig.executablePath } : undefined), registry = new registry_js_1.BrowserRegistry(paths().root, found); const candidates = config.browserConfig.autoFallback ? (0, discovery_js_1.fallbackBrowsers)(found, config.browserConfig.id, config.browserConfig.lastSuccessfulId) : found.filter(item => item.id === config.browserConfig.id).slice(0, 1); if (!candidates.length)
    throw new Error('当前浏览器不可用，且未发现可回退的浏览器'); const failures = []; for (const item of candidates) {
    const selection = { ...config.browserConfig, id: item.id, type: item.browserType, engine: item.engine, runtime: item.runtime, executablePath: item.executablePath };
    const session = registry.create(selection, config.accountId);
    try {
        await session.start();
        activeSession = session;
        if (item.id !== config.browserConfig.id) {
            await log(`浏览器回退成功：${item.displayName}`);
            config.browserConfig = { ...selection, lastSuccessfulId: item.id, compatibilityStatus: item.engine === 'chromium' ? 'compatible' : 'partially_compatible', compatibilityReason: '自动回退后已成功启动' };
            await writeConfig(config);
        }
        return session;
    }
    catch (error) {
        await session.stop().catch(() => undefined);
        const reason = error instanceof Error ? error.message : String(error);
        failures.push(`${item.displayName}: ${reason}`);
        await log(`浏览器启动失败：${item.displayName} ${reason}`);
    }
} throw new Error(`可用浏览器启动失败（最多已尝试 ${candidates.length} 个）：${failures.join('; ')}`); }
async function markBrowserCompatible(config, session) { const info = session.getBrowserInfo(); config.browserConfig.browserVersion = info.version; config.browserConfig.lastSuccessfulId = info.id; config.browserConfig.compatibilityStatus = info.engine === 'chromium' ? 'compatible' : 'partially_compatible'; config.browserConfig.compatibilityReason = '创作者中心页面与登录状态检查通过'; config.browserConfig.lastTestedAt = new Date().toISOString(); await writeConfig(config); }
function protectToken(token) { if (!electron_1.safeStorage.isEncryptionAvailable())
    throw new Error('系统安全存储当前不可用，无法安全保存 Agent 凭据'); return electron_1.safeStorage.encryptString(token); }
async function saveToken(token) { await promises_1.default.writeFile(paths().token, protectToken(token), { mode: 0o600 }); }
async function readToken() { try {
    return electron_1.safeStorage.decryptString(await promises_1.default.readFile(paths().token));
}
catch {
    throw new Error('Agent 凭据不存在或无法由当前系统用户解密，请重新连接');
} }
function fingerprint() { return node_crypto_1.default.createHash('sha256').update([node_os_1.default.hostname(), node_os_1.default.platform(), node_os_1.default.arch(), process.env.COMPUTERNAME || '', process.env.USERDOMAIN || ''].join('|')).digest('hex'); }
async function recentLogs() { try {
    return (await promises_1.default.readFile(paths().log, 'utf8')).split(/\r?\n/).filter(Boolean).slice(-100).reverse();
}
catch {
    return [];
} }
async function state() { const config = await readConfig(); return { connected: Boolean(config && node_fs_1.default.existsSync(paths().token)), configured: Boolean(config), syncing, lastSyncAt, lastError, config: config || undefined, logs: await recentLogs(), autoLaunch: portableMode ? false : electron_1.app.getLoginItemSettings().openAtLogin, portableMode, browserConnected, douyinLoggedIn, browsers: (0, discovery_js_1.discoverBrowsers)().map(item => ({ id: item.id, displayName: item.displayName, type: item.browserType, engine: item.engine, runtime: item.runtime, version: item.version, compatibilityStatus: item.compatibilityStatus })) }; }
async function emit() { const value = await state(); mainWindow?.webContents.send('agent:state', value); return value; }
async function performSync(sample = false) { if (syncing)
    throw new Error('同步正在进行中'); const config = await readConfig(); if (!config)
    throw new Error('请先连接 XMT 并绑定账号'); syncing = true; lastError = undefined; await emit(); const taskId = node_crypto_1.default.randomUUID(); const startedAt = new Date().toISOString(); let database = null; try {
    database = new creatorDatabase_js_1.CreatorDatabase(paths().database);
    database.startSyncTask(taskId, config.platform, config.accountId, startedAt);
    const knownContentIds = database.knownContentIds();
    await log(`开始增量采集，任务 ${taskId}，已知作品 ${knownContentIds.size}`);
    const adapter = await readyBrowserSession(config);
    const snapshot = await new douyin_js_1.DouyinCreatorCollector(adapter, paths().networkLog, paths().discovery).collect(sample ? { collectionMode: 'metrics_refresh', maxPages: 1, maxDetails: 3 } : { collectionMode: 'full_snapshot' });
    const capabilityFile = node_path_1.default.join(paths().discovery, 'page-capability-map.json');
    let capabilities = [];
    if (!sample)
        try {
            capabilities = await (0, pageExplorer_js_1.exploreCreatorPages)(adapter, capabilityFile);
            await log(`Page Explorer 完成，页面 ${capabilities.length}`);
        }
        catch (error) {
            await log(`Page Explorer 失败，不影响已采集快照：${error instanceof Error ? error.message : String(error)}`);
        }
    const local = database.save(snapshot);
    for (const [module, value] of Object.entries(local.errors))
        await log(`本地模块 ${module} 保存失败：${value}`);
    const result = await (0, client_js_1.upload)(config, await readToken(), snapshot, { knownContentIds, capabilities, taskId });
    database.finishSyncTask(taskId, result.status, result.success_count, result.failed_count, Object.values(result.errors).join('; '));
    lastSyncAt = new Date().toISOString();
    await log(`同步任务 ${taskId} ${result.status}，新增作品 ${Math.max(0, snapshot.works.length - knownContentIds.size)}，模块成功 ${result.success_count}，失败 ${result.failed_count}`);
    return { collectedAt: lastSyncAt, snapshot, local, upload: result };
}
catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    database?.finishSyncTask(taskId, 'failed', 0, 1, lastError);
    await log(`同步任务 ${taskId} 失败：${lastError}`);
    throw error;
}
finally {
    database?.close();
    syncing = false;
    await emit();
} }
async function schedule() { if (timer)
    clearTimeout(timer); timer = null; const config = await readConfig(); if (!config?.syncConfig.enabled || config.syncConfig.interval === 'manual')
    return; const delay = config.syncConfig.interval === 'daily' ? (0, scheduler_js_1.nextDailyDelay)(config.syncConfig.dailyHour) : (0, scheduler_js_1.intervalMs)(config.syncConfig.interval); timer = setTimeout(async () => { try {
    await performSync();
}
catch (error) {
    await log(`自动同步失败：${error instanceof Error ? error.message : String(error)}`);
}
finally {
    await schedule();
} }, delay); }
async function sendHeartbeat() { const config = await readConfig(); if (!config || !node_fs_1.default.existsSync(paths().token))
    return; try {
    await (0, client_js_1.heartbeat)(config, await readToken(), { deviceName: node_os_1.default.hostname(), os: `${node_os_1.default.platform()} ${node_os_1.default.arch()}`, browserLoginStatus: douyinLoggedIn ? 'valid' : 'unknown' });
}
catch (error) {
    await log(`心跳失败：${error instanceof Error ? error.message : String(error)}`);
} }
function startHeartbeat() { if (heartbeatTimer)
    clearInterval(heartbeatTimer); void sendHeartbeat(); heartbeatTimer = setInterval(() => void sendHeartbeat(), 60_000); }
function createWindow() { mainWindow = new electron_1.BrowserWindow({ width: 1040, height: 720, minWidth: 880, minHeight: 620, show: false, webPreferences: { preload: node_path_1.default.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } }); mainWindow.webContents.once('did-finish-load', async () => { const preloadReady = await mainWindow?.webContents.executeJavaScript(`typeof window.xmtAgent === 'object'`); console.log('renderer loaded, preload API:', preloadReady); }); mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => console.error('renderer load failed:', { code, description, url })); const dev = process.env.ELECTRON_RENDERER_URL; if (dev)
    void mainWindow.loadURL(dev);
else {
    const filePath = node_path_1.default.join(__dirname, '../renderer/index.html');
    console.log('loading renderer:', filePath);
    void mainWindow.loadFile(filePath);
} mainWindow.once('ready-to-show', () => mainWindow?.show()); mainWindow.on('close', event => { if (!electron_1.app.isQuitting) {
    event.preventDefault();
    mainWindow?.hide();
} }); }
function createTray() { const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect rx="7" width="32" height="32" fill="#2563eb"/><path d="M8 9l16 14M24 9L8 23" stroke="white" stroke-width="4"/></svg>`; tray = new electron_1.Tray(electron_1.nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 16, height: 16 })); tray.setToolTip('XMT Creator Agent'); tray.setContextMenu(electron_1.Menu.buildFromTemplate([{ label: '打开窗口', click: () => { mainWindow?.show(); mainWindow?.focus(); } }, { label: '立即同步', click: () => void performSync().catch(() => { }) }, { type: 'separator' }, { label: '退出', click: () => { electron_1.app.isQuitting = true; electron_1.app.quit(); } }])); tray.on('double-click', () => mainWindow?.show()); }
electron_1.ipcMain.handle('agent:get-state', () => state());
electron_1.ipcMain.handle('agent:setup', async (_event, input) => { const serverUrl = input.serverUrl.replace(/\/$/, ''); if (!/^https:\/\//i.test(serverUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(serverUrl))
    throw new Error('服务器地址必须使用 HTTPS'); const deviceId = fingerprint(), browser = defaultBrowserConfig(); const bound = await (0, client_js_1.bind)(serverUrl, input.bindingCode, { device_id: deviceId, device_name: node_os_1.default.hostname(), os: `${node_os_1.default.platform()} ${node_os_1.default.arch()}`, agent_version: '2.11.0-agent', protocol_version: 1, browser_type: browser.type, browser_version: '', browser_engine: browser.engine, browser_runtime: browser.runtime, session_mode: browser.sessionMode, compatibility_status: 'not_tested' }); const config = { serverUrl, agentId: bound.agent_id, deviceId, platform: 'douyin', accountId: bound.account_id, accountName: bound.account_id, browserConfig: browser, syncConfig: { enabled: false, interval: 'manual', dailyHour: 2 } }; await writeConfig(config); await saveToken(bound.agent_token); await log('XMT 一次性绑定码已使用，设备绑定成功'); return emit(); });
electron_1.ipcMain.handle('agent:login-open', async () => { const config = await readConfig(); if (!config)
    throw new Error('请先完成连接'); try {
    const session = await readyBrowserSession(config);
    const page = await session.getActivePage();
    await page.bringToFront();
    browserConnected = true;
    douyinLoggedIn = await session.checkLoginState();
    if (douyinLoggedIn)
        await markBrowserCompatible(config, session);
    await log(`已启动 ${session.getBrowserInfo().displayName} 独立会话`);
    await emit();
}
catch (error) {
    activeSession = null;
    browserConnected = false;
    throw error;
} });
electron_1.ipcMain.handle('agent:login-complete', async () => { if (!activeSession)
    throw new Error('请先打开登录窗口'); const loggedIn = await activeSession.checkLoginState(); if (!loggedIn)
    throw new Error('未检测到有效的抖音创作者中心登录状态，请完成登录后重试。'); douyinLoggedIn = true; const config = await readConfig(); if (config)
    await markBrowserCompatible(config, activeSession); await log(`${activeSession.getBrowserInfo().displayName} 登录状态正常`); return emit(); });
electron_1.ipcMain.handle('agent:sync', () => performSync());
electron_1.ipcMain.handle('agent:sync-sample', () => performSync(true));
electron_1.ipcMain.handle('agent:settings', async (_event, input) => { const config = await readConfig(); if (!config)
    throw new Error('请先完成连接'); const found = (0, discovery_js_1.discoverBrowsers)({ customPath: input.executablePath }), selected = found.find(item => item.id === input.browserId) || found[0]; if (!selected)
    throw new Error('没有发现可用浏览器'); config.serverUrl = input.serverUrl.replace(/\/$/, ''); config.browserConfig = { ...config.browserConfig, id: selected.id, type: selected.browserType, engine: selected.engine, runtime: selected.runtime, executablePath: selected.executablePath }; config.syncConfig = { enabled: input.enabled, interval: input.interval, dailyHour: Math.max(0, Math.min(23, Number(input.dailyHour) || 2)) }; await activeSession?.stop(); activeSession = null; await writeConfig(config); if (!portableMode)
    electron_1.app.setLoginItemSettings({ openAtLogin: input.autoLaunch, path: process.execPath }); await schedule(); await log(`桌面设置已更新，浏览器 ${selected.displayName}，运行模式 ${portableMode ? 'portable' : 'standard'}`); return emit(); });
electron_1.ipcMain.handle('agent:choose-browser', async () => { const mac = process.platform === 'darwin'; const options = { title: '选择浏览器', defaultPath: mac ? '/Applications' : undefined, properties: mac ? ['openFile', 'openDirectory'] : ['openFile'], filters: mac ? undefined : [{ name: '浏览器', extensions: ['exe'] }] }; const result = mainWindow ? await electron_1.dialog.showOpenDialog(mainWindow, options) : await electron_1.dialog.showOpenDialog(options); if (result.canceled || !result.filePaths[0])
    return null; const selected = result.filePaths[0]; if (mac && selected.endsWith('.app')) {
    const name = node_path_1.default.basename(selected, '.app');
    return node_path_1.default.join(selected, 'Contents', 'MacOS', name === 'Google Chrome' ? 'Google Chrome' : name);
} return selected; });
electron_1.ipcMain.handle('agent:browser-restart', async () => { const config = await readConfig(); if (!config)
    throw new Error('请先完成连接'); await activeSession?.stop(); activeSession = null; browserConnected = false; douyinLoggedIn = false; const session = await readyBrowserSession(config); browserConnected = session.isConnected(); douyinLoggedIn = await session.checkLoginState(); if (douyinLoggedIn)
    await markBrowserCompatible(config, session); await log(`${session.getBrowserInfo().displayName} 会话测试完成，登录状态${douyinLoggedIn ? '有效' : '需要重新登录'}`); return emit(); });
electron_1.ipcMain.handle('agent:browser-profile-clear', async () => { const config = await readConfig(); if (!config)
    throw new Error('请先完成连接'); if (config.browserConfig.sessionMode !== 'persistent')
    throw new Error('当前会话不使用 Agent 独立浏览器资料'); const answer = mainWindow ? await electron_1.dialog.showMessageBox(mainWindow, { type: 'warning', title: '再次确认清理浏览器资料', message: '这会删除当前账号的 Agent 独立浏览器资料，并清除其中的抖音登录状态。', detail: '不会影响日常浏览器资料，也不会删除 XMT 业务数据。是否继续？', buttons: ['取消', '确认清理'], defaultId: 0, cancelId: 0, noLink: true }) : { response: 0 }; if (answer.response !== 1)
    return { cleared: false, state: await state() }; const profileRoot = node_path_1.default.join(paths().root, 'profiles'); const target = (0, profile_js_1.assertManagedProfile)((0, profile_js_1.managedProfile)(paths().root, config.browserConfig, config.accountId), profileRoot); await activeSession?.stop(); activeSession = null; browserConnected = false; douyinLoggedIn = false; await promises_1.default.rm(target, { recursive: true, force: true }); await log(`已清理当前账号的独立浏览器资料：${config.browserConfig.type}/${config.accountId}`); return { cleared: true, state: await emit() }; });
electron_1.ipcMain.handle('agent:open-logs', async () => { await promises_1.default.mkdir(paths().logs, { recursive: true }); await electron_1.shell.openPath(paths().logs); });
electron_1.app.whenReady().then(async () => { createWindow(); createTray(); startHeartbeat(); await schedule(); electron_1.app.on('activate', () => mainWindow?.show()); });
electron_1.app.on('window-all-closed', () => { });
electron_1.app.on('before-quit', () => { electron_1.app.isQuitting = true; if (timer)
    clearTimeout(timer); if (heartbeatTimer)
    clearInterval(heartbeatTimer); });
