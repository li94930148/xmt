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
const systemChromeAdapter_js_1 = require("../core/browser/systemChromeAdapter.js");
const embeddedChromiumAdapter_js_1 = require("../core/browser/embeddedChromiumAdapter.js");
const douyin_js_1 = require("../core/collector/douyin.js");
const client_js_1 = require("../core/uploader/client.js");
const scheduler_js_1 = require("../core/scheduler/scheduler.js");
const creatorDatabase_js_1 = require("../core/database/creatorDatabase.js");
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
let lastSyncAt;
let lastError;
let chromeConnected = false;
let douyinLoggedIn = false;
let activeLoginAdapter = null;
const systemAdapters = new Map();
let embeddedAdapter = null;
const paths = () => { const root = portableMode ? portableDataRoot : electron_1.app.getPath('userData'); return { root, config: node_path_1.default.join(root, 'config.json'), token: node_path_1.default.join(root, 'agent-token.bin'), profile: node_path_1.default.join(root, 'browser'), database: node_path_1.default.join(root, 'creator.db'), logs: node_path_1.default.join(root, 'logs'), log: node_path_1.default.join(root, 'logs', 'sync.log'), networkLog: node_path_1.default.join(root, 'logs', 'network.json') }; };
async function log(message) { const p = paths(); await promises_1.default.mkdir(p.logs, { recursive: true }); const safe = message.replace(/cookie|password|authorization|token/gi, '[redacted]'); await promises_1.default.appendFile(p.log, `[${new Date().toISOString()}] ${safe}\n`, 'utf8'); }
async function readConfig() { try {
    const config = JSON.parse(await promises_1.default.readFile(paths().config, 'utf8'));
    if (!config.browserConfig)
        config.browserConfig = { mode: 'system_chrome', cdpEndpoint: 'http://127.0.0.1:9222' };
    return config;
}
catch {
    return null;
} }
async function writeConfig(config) { await promises_1.default.mkdir(paths().root, { recursive: true }); await promises_1.default.writeFile(paths().config, JSON.stringify(config, null, 2), 'utf8'); }
function browserAdapter(config) { if (config.browserConfig.mode === 'embedded_chromium') {
    embeddedAdapter ??= new embeddedChromiumAdapter_js_1.EmbeddedChromiumAdapter(paths().profile);
    return embeddedAdapter;
} const endpoint = config.browserConfig.cdpEndpoint || 'http://127.0.0.1:9222'; const cacheKey = `${endpoint}|${config.browserConfig.chromePath || 'auto'}`; let adapter = systemAdapters.get(cacheKey); if (!adapter) {
    adapter = new systemChromeAdapter_js_1.SystemChromeAdapter(paths().profile, endpoint, config.browserConfig.chromePath);
    systemAdapters.set(cacheKey, adapter);
} return adapter; }
function protectToken(token) { if (!electron_1.safeStorage.isEncryptionAvailable())
    throw new Error('Windows DPAPI 当前不可用，无法安全保存 Agent 凭据'); return electron_1.safeStorage.encryptString(token); }
async function saveToken(token) { await promises_1.default.writeFile(paths().token, protectToken(token), { mode: 0o600 }); }
async function readToken() { try {
    return electron_1.safeStorage.decryptString(await promises_1.default.readFile(paths().token));
}
catch {
    throw new Error('Agent 凭据不存在或无法由当前 Windows 用户解密，请重新连接');
} }
function fingerprint() { return node_crypto_1.default.createHash('sha256').update([node_os_1.default.hostname(), node_os_1.default.platform(), node_os_1.default.arch(), process.env.COMPUTERNAME || '', process.env.USERDOMAIN || ''].join('|')).digest('hex'); }
async function recentLogs() { try {
    return (await promises_1.default.readFile(paths().log, 'utf8')).split(/\r?\n/).filter(Boolean).slice(-100).reverse();
}
catch {
    return [];
} }
async function state() { const config = await readConfig(); return { connected: Boolean(config && node_fs_1.default.existsSync(paths().token)), configured: Boolean(config), syncing, lastSyncAt, lastError, config: config || undefined, logs: await recentLogs(), autoLaunch: portableMode ? false : electron_1.app.getLoginItemSettings().openAtLogin, portableMode, chromeConnected, douyinLoggedIn }; }
async function emit() { const value = await state(); mainWindow?.webContents.send('agent:state', value); return value; }
async function performSync() { if (syncing)
    throw new Error('同步正在进行中'); const config = await readConfig(); if (!config)
    throw new Error('请先连接 XMT 并绑定账号'); syncing = true; lastError = undefined; await emit(); try {
    await log(`开始采集创作者中心，浏览器模式 ${config.browserConfig.mode}`);
    const snapshot = await new douyin_js_1.DouyinCreatorCollector(browserAdapter(config), paths().networkLog).collect();
    const database = new creatorDatabase_js_1.CreatorDatabase(paths().database);
    try {
        database.save(snapshot);
    }
    finally {
        database.close();
    }
    const result = await (0, client_js_1.upload)(config, await readToken(), snapshot);
    lastSyncAt = new Date().toISOString();
    await log(`同步成功，快照 ${result.snapshot_id || '-'}，作品 ${snapshot.works.length}`);
    return { collectedAt: lastSyncAt, snapshot, upload: result };
}
catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    await log(`同步失败：${lastError}`);
    throw error;
}
finally {
    syncing = false;
    await emit();
} }
async function schedule() { if (timer)
    clearTimeout(timer); timer = null; const config = await readConfig(); if (!config?.syncConfig.enabled || config.syncConfig.interval === 'manual')
    return; const delay = config.syncConfig.interval === 'daily' ? (0, scheduler_js_1.nextDailyDelay)(config.syncConfig.dailyHour) : (0, scheduler_js_1.intervalMs)(config.syncConfig.interval); timer = setTimeout(async () => { try {
    await performSync();
}
catch { }
finally {
    await schedule();
} }, delay); }
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
    throw new Error('服务器地址必须使用 HTTPS'); const session = await (0, client_js_1.loginXmt)(serverUrl, input.username, input.password); const deviceId = fingerprint(); const bound = await (0, client_js_1.register)(serverUrl, session.token, input.accountId, deviceId); const config = { serverUrl, agentId: bound.agent_id, deviceId, platform: 'douyin', accountId: input.accountId, accountName: input.accountId, browserConfig: { mode: 'system_chrome', cdpEndpoint: 'http://127.0.0.1:9222' }, syncConfig: { enabled: false, interval: 'manual', dailyHour: 2 } }; await writeConfig(config); await saveToken(bound.agent_token); await log('XMT 连接与设备绑定成功'); return emit(); });
electron_1.ipcMain.handle('agent:login-open', async () => { if (activeLoginAdapter)
    throw new Error('浏览器登录流程已经打开'); const config = await readConfig(); if (!config)
    throw new Error('请先完成连接'); activeLoginAdapter = browserAdapter(config); try {
    await activeLoginAdapter.openLogin();
    chromeConnected = true;
    douyinLoggedIn = false;
    await log(`已自动启动并连接 Chrome，浏览器模式 ${config.browserConfig.mode}`);
    await emit();
}
catch (error) {
    activeLoginAdapter = null;
    chromeConnected = false;
    throw error;
} });
electron_1.ipcMain.handle('agent:login-complete', async () => { if (!activeLoginAdapter)
    throw new Error('请先打开登录窗口'); const loggedIn = await activeLoginAdapter.completeLogin(); if (!loggedIn)
    throw new Error('未检测到有效的抖音创作者中心登录状态，请完成登录后重试。'); douyinLoggedIn = true; activeLoginAdapter = null; await log('Chrome 已连接，抖音登录状态正常'); return emit(); });
electron_1.ipcMain.handle('agent:sync', () => performSync());
electron_1.ipcMain.handle('agent:settings', async (_event, input) => { const config = await readConfig(); if (!config)
    throw new Error('请先完成连接'); config.serverUrl = input.serverUrl.replace(/\/$/, ''); config.browserConfig = { mode: input.browserMode, cdpEndpoint: 'http://127.0.0.1:9222', chromePath: input.chromePath || undefined }; config.syncConfig = { enabled: input.enabled, interval: input.interval, dailyHour: Math.max(0, Math.min(23, Number(input.dailyHour) || 2)) }; await writeConfig(config); if (!portableMode)
    electron_1.app.setLoginItemSettings({ openAtLogin: input.autoLaunch, path: process.execPath }); await schedule(); await log(`桌面设置已更新，浏览器模式 ${input.browserMode}，运行模式 ${portableMode ? 'portable' : 'standard'}`); return emit(); });
electron_1.ipcMain.handle('agent:choose-chrome', async () => { const options = { title: '选择 Google Chrome', defaultPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', properties: ['openFile'], filters: [{ name: 'Google Chrome', extensions: ['exe'] }] }; const result = mainWindow ? await electron_1.dialog.showOpenDialog(mainWindow, options) : await electron_1.dialog.showOpenDialog(options); if (result.canceled || !result.filePaths[0])
    return null; const selected = result.filePaths[0]; if (node_path_1.default.basename(selected).toLowerCase() !== 'chrome.exe')
    throw new Error('请选择 chrome.exe'); return selected; });
electron_1.ipcMain.handle('agent:open-logs', async () => { await promises_1.default.mkdir(paths().logs, { recursive: true }); await electron_1.shell.openPath(paths().logs); });
electron_1.app.whenReady().then(async () => { createWindow(); createTray(); await schedule(); electron_1.app.on('activate', () => mainWindow?.show()); });
electron_1.app.on('window-all-closed', () => { });
electron_1.app.on('before-quit', () => { electron_1.app.isQuitting = true; if (timer)
    clearTimeout(timer); });
