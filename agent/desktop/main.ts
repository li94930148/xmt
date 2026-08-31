import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  safeStorage,
  shell,
  Tray,
} from "electron";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {
  discoverBrowsers,
  creatorFallbackBrowsers,
  rankBrowsers,
} from "../core/browser/discovery.js";
import { BrowserRegistry } from "../core/browser/registry.js";
import type {
  BrowserSelection,
  BrowserSession,
} from "../core/browser/types.js";
import {
  assertManagedProfile,
  managedProfile,
} from "../core/browser/profile.js";
import { runCreatorCollectorTask } from "../core/collector/taskRunner.js";
import { CollectorLoginRequiredError } from "../core/collector/workerBridge.js";
import { applyCollectorLoginRequired, heartbeatLoginStatus } from "./collectorAuthState.js";
import { bind, heartbeat, uploadCanonicalPayload } from "../core/uploader/client.js";
import { intervalMs, nextDailyDelay } from "../core/scheduler/scheduler.js";
import type { AgentConfig, SyncResult } from "../core/types.js";
import type { DesktopState, SetupInput } from "./types.js";
import { CreatorDatabase } from "../core/database/creatorDatabase.js";
import { canonicalJson, canonicalJsonHash } from "../core/database/sqliteValues.js";
import { UploadQueueScheduler } from "../core/uploader/queueScheduler.js";
import type { RebindInput } from "./types.js";
const AGENT_VERSION = '2.13.0-agent';
const SYSTEM_VERSION = '2.20.4';
app.setName("XMT Creator Agent");
const executableDirectory = path.dirname(app.getPath("exe"));
const resourceDirectory = process.resourcesPath;
function loadBuildId() {
  if (!app.isPackaged) return process.env.XMT_AGENT_BUILD_ID || `source-${SYSTEM_VERSION}-${AGENT_VERSION}`;
  try {
    const value = JSON.parse(fsSync.readFileSync(path.join(resourceDirectory, "build-info.json"), "utf8")) as { buildId?: unknown };
    if (typeof value.buildId === "string" && /^macos-arm64-v\d+\.\d+\.\d+-v\d+\.\d+\.\d+-agent-[0-9a-f]{7,40}$/.test(value.buildId)) return value.buildId;
  } catch { /* A missing build marker is surfaced through the fallback identity. */ }
  return `packaged-${SYSTEM_VERSION}-${AGENT_VERSION}`;
}
const BUILD_ID = loadBuildId();
const portableFlagCandidates = [
  path.join(executableDirectory, "portable.flag"),
  path.join(resourceDirectory, "portable.flag"),
  path.join(path.dirname(resourceDirectory), "portable.flag"),
];
const portableMode = portableFlagCandidates.some((candidate) =>
  fsSync.existsSync(candidate),
);
const portableDataRoot = path.join(executableDirectory, "data");
if (portableMode) {
  fsSync.mkdirSync(portableDataRoot, { recursive: true });
  app.setPath("userData", portableDataRoot);
}
console.log(
  `[XMT Agent]\nMode: ${portableMode ? "Portable" : "Standard"}\nData: ${portableMode ? portableDataRoot : app.getPath("userData")}`,
);
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let syncing = false;
let timer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let uploadQueueDatabase: CreatorDatabase | null = null;
let uploadQueueScheduler: UploadQueueScheduler | null = null;
let lastSyncAt: string | undefined;
let lastError: string | undefined;
let browserConnected = false;
let douyinLoggedIn = false;
let browserLoginStatus: "logged_in" | "login_required" | "unknown" = "unknown";
let activeSession: BrowserSession | null = null;
let databaseReady = false;
let databaseSchemaVersion = 0;
let databaseInitializationError: string | undefined;
let packageContractToken: string | undefined;
const paths = () => {
  const testRoot = process.env.NODE_ENV === 'test' ? process.env.XMT_AGENT_TEST_DATA_ROOT : undefined;
  const root = testRoot || (portableMode ? portableDataRoot : app.getPath("userData"));
  return {
    root,
    config: path.join(root, "config.json"),
    token: path.join(root, "agent-token.bin"),
    profile: path.join(root, "browser"),
    database: path.join(root, "creator.db"),
    logs: path.join(root, "logs"),
    log: path.join(root, "logs", "sync.log"),
  };
};
function apiTarget(value?: string): 'loopback'|'production'|'invalid' { if (!value) return 'invalid'; if (loopbackUrl(value)) return 'loopback'; try { new URL(value); return 'production'; } catch { return 'invalid'; } }
function initializeDatabase() {
  try { const database = new CreatorDatabase(paths().database); database.close(); databaseReady = true; databaseSchemaVersion = 1; databaseInitializationError = undefined; }
  catch (error) { databaseReady = false; databaseInitializationError = error instanceof Error ? error.message : String(error); }
}
function assertDatabaseReady() { if (!databaseReady) throw new Error(databaseInitializationError ? 'LOCAL_DATABASE_NOT_READY' : 'LOCAL_DATABASE_INITIALIZING'); }
async function initializePackageContractBootstrap() {
  const serialized = process.env.XMT_AGENT_PACKAGE_CONTRACT_BOOTSTRAP;
  if (!serialized) return;
  if (process.env.NODE_ENV !== "test" || !process.env.XMT_AGENT_TEST_DATA_ROOT) throw new Error("PACKAGE_CONTRACT_BOOTSTRAP_REQUIRES_ISOLATED_TEST_ROOT");
  const bootstrap = JSON.parse(serialized) as { serverUrl?: unknown; token?: unknown };
  if (typeof bootstrap.serverUrl !== "string" || !loopbackUrl(bootstrap.serverUrl) || typeof bootstrap.token !== "string" || !bootstrap.token) throw new Error("PACKAGE_CONTRACT_BOOTSTRAP_REQUIRES_LOOPBACK");
  const config: AgentConfig = {
    serverUrl: bootstrap.serverUrl,
    agentId: 1,
    deviceId: "package-contract-device",
    platform: "douyin",
    accountId: "package-contract-account",
    accountName: "package-contract-account",
    browserConfig: { id: "package-contract", type: "chromium", engine: "chromium", runtime: "playwright", executablePath: "/nonexistent", sessionMode: "persistent", profileName: "default", headless: false, launchArgs: [], autoFallback: false },
    syncConfig: { enabled: false, interval: "manual", dailyHour: 2 },
  };
  await writeConfig(config);
  packageContractToken = bootstrap.token;
  await fs.writeFile(paths().token, Buffer.alloc(0), { mode: 0o600 });
  const payloadJson = canonicalJson("package_contract_payload", { schema_version: 2, agent_version: AGENT_VERSION, generated_at: new Date().toISOString(), datasets: {}, quality: { warnings: [] } });
  const database = new CreatorDatabase(paths().database);
  database.enqueueUpload({ batch_id: crypto.randomUUID(), platform: "douyin", platform_account_id: config.accountId, source_file_sha256: "a".repeat(64), parser_version: "package-contract", payload_json: payloadJson, payload_sha256: canonicalJsonHash(payloadJson) });
  database.close();
}
async function log(message: string) {
  const p = paths();
  await fs.mkdir(p.logs, { recursive: true });
  const safe = message.replace(
    /cookie|password|authorization|token/gi,
    "[redacted]",
  );
  await fs.appendFile(p.log, `[${new Date().toISOString()}] ${safe}\n`, "utf8");
}
function defaultBrowserConfig() {
  const item = rankBrowsers(discoverBrowsers())[0];
  if (!item)
    throw new Error("未发现可用浏览器，请安装受支持浏览器或 Playwright 运行时");
  return {
    id: item.id,
    type: item.browserType,
    engine: item.engine,
    runtime: item.runtime,
    executablePath: item.executablePath,
    sessionMode: "persistent" as const,
    profileName: "default",
    headless: false,
    launchArgs: [],
    autoFallback: true,
  };
}
async function readConfig() {
  try {
    const config = JSON.parse(
      await fs.readFile(paths().config, "utf8"),
    ) as AgentConfig & { browserConfig?: Record<string, unknown> };
    if (!config.browserConfig?.id)
      config.browserConfig = defaultBrowserConfig();
    return config as AgentConfig;
  } catch {
    return null;
  }
}
async function writeConfig(config: AgentConfig) {
  await fs.mkdir(paths().root, { recursive: true });
  await fs.writeFile(paths().config, JSON.stringify(config, null, 2), "utf8");
}
async function readyBrowserSession(config: AgentConfig) {
  if (activeSession?.isConnected()) return activeSession;
  const found = discoverBrowsers(
      config.browserConfig.type === "custom"
        ? { customPath: config.browserConfig.executablePath }
        : undefined,
    ),
    registry = new BrowserRegistry(paths().root, found);
  const candidates = config.browserConfig.autoFallback
    ? creatorFallbackBrowsers(
        found,
        config.browserConfig.id,
        config.browserConfig.lastSuccessfulId,
      )
    : found.filter((item) => item.id === config.browserConfig.id).slice(0, 1);
  const creatorCandidates = candidates.filter((item) => item.capabilities.supportsCreatorCenter);
  if (!creatorCandidates.length)
    throw new Error("COLLECTOR_BROWSER_UNSUPPORTED: Scrapling Creator Collector 仅支持 Chromium-compatible 浏览器，请选择 Chrome、Edge、Brave、Chromium、Arc 或自定义 Chromium 浏览器。");
  if (!candidates.length)
    throw new Error("当前浏览器不可用，且未发现可回退的浏览器");
  const failures: string[] = [];
  for (const item of creatorCandidates) {
    const selection: BrowserSelection = {
      ...config.browserConfig,
      id: item.id,
      type: item.browserType,
      engine: item.engine,
      runtime: item.runtime,
      executablePath: item.executablePath,
    };
    const session = registry.create(selection, config.accountId);
    try {
      await session.start();
      activeSession = session;
      if (item.id !== config.browserConfig.id) {
        await log(`浏览器回退成功：${item.displayName}`);
        config.browserConfig = {
          ...selection,
          lastSuccessfulId: item.id,
          compatibilityStatus:
            item.engine === "chromium" ? "compatible" : "partially_compatible",
          compatibilityReason: "自动回退后已成功启动",
        };
        await writeConfig(config);
      }
      return session;
    } catch (error) {
      await session.stop().catch(() => undefined);
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${item.displayName}: ${reason}`);
      await log(`浏览器启动失败：${item.displayName} ${reason}`);
    }
  }
  throw new Error(
    `可用浏览器启动失败（最多已尝试 ${candidates.length} 个）：${failures.join("; ")}`,
  );
}
async function markBrowserCompatible(
  config: AgentConfig,
  session: BrowserSession,
) {
  const info = session.getBrowserInfo();
  config.browserConfig.browserVersion = info.version;
  config.browserConfig.lastSuccessfulId = info.id;
  config.browserConfig.compatibilityStatus =
    info.engine === "chromium" ? "compatible" : "partially_compatible";
  config.browserConfig.compatibilityReason = "创作者中心页面与登录状态检查通过";
  config.browserConfig.lastTestedAt = new Date().toISOString();
  await writeConfig(config);
}
function protectToken(token: string) {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("系统安全存储当前不可用，无法安全保存 Agent 凭据");
  return safeStorage.encryptString(token);
}
async function saveToken(token: string) {
  await fs.writeFile(paths().token, protectToken(token), { mode: 0o600 });
}
async function readToken() {
  if (packageContractToken) return packageContractToken;
  try {
    return safeStorage.decryptString(await fs.readFile(paths().token));
  } catch {
    throw new Error("Agent 凭据不存在或无法由当前系统用户解密，请重新连接");
  }
}
function fingerprint() {
  return crypto
    .createHash("sha256")
    .update(
      [
        os.hostname(),
        os.platform(),
        os.arch(),
        process.env.COMPUTERNAME || "",
        process.env.USERDOMAIN || "",
      ].join("|"),
    )
    .digest("hex");
}
async function recentLogs() {
  try {
    return (await fs.readFile(paths().log, "utf8"))
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-100)
      .reverse();
  } catch {
    return [];
  }
}
async function state(): Promise<DesktopState> {
  const config = await readConfig();
  return {
    connected: Boolean(config && fsSync.existsSync(paths().token)),
    configured: Boolean(config),
    syncing,
    lastSyncAt,
    lastError,
    config: config || undefined,
    logs: await recentLogs(),
    autoLaunch: portableMode ? false : app.getLoginItemSettings().openAtLogin,
    portableMode,
    browserConnected,
    douyinLoggedIn,
    runtimeIdentity: { systemVersion: SYSTEM_VERSION, agentVersion: AGENT_VERSION, buildId: BUILD_ID, mainPid: process.pid, packaged: app.isPackaged, databaseReady, databaseSchemaVersion, uploadQueue: databaseReady, workerRuntime: app.isPackaged ? 'packaged' : 'development', apiTarget: apiTarget(config?.serverUrl) },
    browsers: discoverBrowsers().map((item) => ({
      id: item.id,
      displayName: item.displayName,
      type: item.browserType,
      engine: item.engine,
      runtime: item.runtime,
      version: item.version,
      compatibilityStatus: item.compatibilityStatus,
    })),
  };
}
async function emit() {
  const value = await state();
  mainWindow?.webContents.send("agent:state", value);
  return value;
}
function loopbackUrl(value: string) {
  try { return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname); }
  catch { return false; }
}
function mayRunQueueScheduler(config: AgentConfig) {
  // An unpackaged development run must never drain a user's persisted
  // production endpoint. Tests may exercise the real sender against loopback.
  return app.isPackaged || loopbackUrl(config.serverUrl);
}
async function startUploadQueueScheduler() {
  assertDatabaseReady();
  if (uploadQueueScheduler) return;
  const config = await readConfig();
  if (!config || !fsSync.existsSync(paths().token) || !mayRunQueueScheduler(config)) return;
  const token = await readToken();
  uploadQueueDatabase = new CreatorDatabase(paths().database);
  uploadQueueScheduler = new UploadQueueScheduler(uploadQueueDatabase, async (job) => {
    const payload = uploadQueueDatabase?.parseUploadPayload(job);
    if (!payload) throw new Error('LOCAL_UPLOAD_QUEUE_READ_FAILED');
    return uploadCanonicalPayload(
      config,
      token,
      payload,
      String(payload.agent_version || AGENT_VERSION),
      String(payload.generated_at || new Date().toISOString()),
    );
  });
  uploadQueueScheduler.start();
}
function stopUploadQueueScheduler() {
  uploadQueueScheduler?.stop();
  uploadQueueScheduler = null;
  uploadQueueDatabase?.close();
  uploadQueueDatabase = null;
}
async function performSync(sample = false): Promise<SyncResult> {
  assertDatabaseReady();
  if (syncing) throw new Error("同步正在进行中");
  const config = await readConfig();
  if (!config) throw new Error("请先连接 XMT 并绑定账号");
  syncing = true;
  lastError = undefined;
  await emit();
  try {
    await activeSession?.stop();
    activeSession = null;
    browserConnected = false;
    const result = await runCreatorCollectorTask({
      config,
      dataRoot: paths().root,
      repositoryRoot: app.isPackaged
        ? process.resourcesPath
        : path.resolve(__dirname, "../../.."),
      profilePath: assertManagedProfile(
        managedProfile(paths().root, config.browserConfig, config.accountId),
        path.join(paths().root, "profiles"),
      ),
      token: await readToken(),
      packaged: app.isPackaged,
      mode: sample ? "metrics_refresh" : "full_snapshot",
      flushOfficialQueue: async () => {
        await startUploadQueueScheduler();
        if (!uploadQueueScheduler) throw new Error("官方导出队列在当前开发运行中不会发送到非本机服务器");
        await uploadQueueScheduler.flush();
      },
      checkpoint: (name, data) => void log(`${name} ${JSON.stringify(data)}`),
    });
    lastSyncAt = result.collectedAt;
    await log(
      `Scrapling 同步完成：${result.upload.success ? "success" : "failed"}`,
    );
    return result;
  } catch (error) {
    if (error instanceof CollectorLoginRequiredError) {
      const auth = applyCollectorLoginRequired();
      douyinLoggedIn = auth.douyinLoggedIn;
      browserConnected = auth.browserConnected;
      browserLoginStatus = auth.browserLoginStatus;
      lastError = auth.lastError;
      void sendHeartbeat();
    } else lastError = '本地同步队列写入失败，数据尚未上传。请查看 Agent 诊断信息后重试。';
    await log(`同步任务失败：${error instanceof Error && error.message.startsWith('UPLOAD_QUEUE_') ? error.message : 'LOCAL_UPLOAD_QUEUE_WRITE_FAILED'}`);
    throw new Error('LOCAL_UPLOAD_QUEUE_WRITE_FAILED');
  } finally {
    syncing = false;
    await emit();
  }
}
async function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  const config = await readConfig();
  if (!config?.syncConfig.enabled || config.syncConfig.interval === "manual")
    return;
  const delay =
    config.syncConfig.interval === "daily"
      ? nextDailyDelay(config.syncConfig.dailyHour)
      : intervalMs(config.syncConfig.interval);
  timer = setTimeout(async () => {
    try {
      await performSync();
    } catch (error) {
      await log(
        `自动同步失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await schedule();
    }
  }, delay);
}
async function sendHeartbeat() {
  const config = await readConfig();
  if (!config || !fsSync.existsSync(paths().token)) return;
  try {
    await heartbeat(config, await readToken(), {
      deviceName: os.hostname(),
      os: `${os.platform()} ${os.arch()}`,
      browserLoginStatus: heartbeatLoginStatus(browserLoginStatus),
    });
  } catch (error) {
    await log(
      `心跳失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  void sendHeartbeat();
  heartbeatTimer = setInterval(() => void sendHeartbeat(), 60_000);
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 880,
    minHeight: 620,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.once("did-finish-load", async () => {
    const preloadReady = await mainWindow?.webContents.executeJavaScript(
      `typeof window.xmtAgent === 'object'`,
    );
    console.log("renderer loaded, preload API:", preloadReady);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) =>
    console.error("renderer load failed:", { code, description, url }),
  );
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void mainWindow.loadURL(dev);
  else {
    const filePath = path.join(__dirname, "../renderer/index.html");
    console.log("loading renderer:", filePath);
    void mainWindow.loadFile(filePath);
  }
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (!(app as typeof app & { isQuitting?: boolean }).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}
function createTray() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect rx="7" width="32" height="32" fill="#2563eb"/><path d="M8 9l16 14M24 9L8 23" stroke="white" stroke-width="4"/></svg>`;
  tray = new Tray(
    nativeImage
      .createFromDataURL(
        `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      )
      .resize({ width: 16, height: 16 }),
  );
  tray.setToolTip("XMT Creator Agent");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "打开窗口",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { label: "立即同步", click: () => void performSync().catch(() => {}) },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          (app as typeof app & { isQuitting?: boolean }).isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => mainWindow?.show());
}
ipcMain.handle("agent:get-state", () => state());
ipcMain.handle("agent:setup", async (_event, input: SetupInput) => {
  const serverUrl = input.serverUrl.replace(/\/$/, "");
  if (
    !/^https:\/\//i.test(serverUrl) &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(serverUrl)
  )
    throw new Error("服务器地址必须使用 HTTPS");
  const deviceId = fingerprint(),
    browser = defaultBrowserConfig();
  const bound = await bind(serverUrl, input.bindingCode, {
    device_id: deviceId,
    device_name: os.hostname(),
    os: `${os.platform()} ${os.arch()}`,
    agent_version: AGENT_VERSION,
    protocol_version: 1,
    browser_type: browser.type,
    browser_version: "",
    browser_engine: browser.engine,
    browser_runtime: browser.runtime,
    session_mode: browser.sessionMode,
    compatibility_status: "not_tested",
  });
  const config: AgentConfig = {
    serverUrl,
    agentId: bound.agent_id,
    deviceId,
    platform: "douyin",
    accountId: bound.account_id,
    accountName: bound.account_id,
    browserConfig: browser,
    syncConfig: { enabled: false, interval: "manual", dailyHour: 2 },
  };
  await writeConfig(config);
  await saveToken(bound.agent_token);
  await log("XMT 一次性绑定码已使用，设备绑定成功");
  await startUploadQueueScheduler();
  return emit();
});
ipcMain.handle("agent:rebind", async (_event, input: RebindInput) => {
  const serverUrl = input.serverUrl.replace(/\/$/, "");
  if (
    !/^https:\/\//i.test(serverUrl) &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(serverUrl)
  )
    throw new Error("服务器地址必须使用 HTTPS");
  const config = await readConfig();
  if (!config) throw new Error("请先完成连接");
  stopUploadQueueScheduler();
  const bound = await bind(serverUrl, input.bindingCode, {
    device_id: config.deviceId,
    device_name: os.hostname(),
    os: `${os.platform()} ${os.arch()}`,
    agent_version: AGENT_VERSION,
    protocol_version: 1,
    browser_type: config.browserConfig.type,
    browser_version: config.browserConfig.browserVersion || "",
    browser_engine: config.browserConfig.engine,
    browser_runtime: config.browserConfig.runtime,
    session_mode: config.browserConfig.sessionMode,
    compatibility_status:
      config.browserConfig.compatibilityStatus || "not_tested",
  });
  config.serverUrl = serverUrl;
  config.agentId = bound.agent_id;
  config.accountId = bound.account_id;
  config.accountName = bound.account_id;
  await writeConfig(config);
  await saveToken(bound.agent_token);
  await log("XMT 服务器已通过一次性绑定码安全更换");
  startHeartbeat();
  await startUploadQueueScheduler();
  return emit();
});
ipcMain.handle("agent:login-open", async () => {
  const config = await readConfig();
  if (!config) throw new Error("请先完成连接");
  try {
    const session = await readyBrowserSession(config);
    const page = await session.getActivePage();
    await page.bringToFront();
    browserConnected = true;
    const login = await session.checkLoginState();
    browserLoginStatus = login.status;
    douyinLoggedIn = login.status === "logged_in";
    if (douyinLoggedIn) await markBrowserCompatible(config, session);
    await log(
      `已启动 ${session.getBrowserInfo().displayName} 独立会话，login_status=${login.status}`,
    );
    await emit();
  } catch (error) {
    activeSession = null;
    browserConnected = false;
    throw error;
  }
});
ipcMain.handle("agent:login-complete", async () => {
  if (!activeSession) throw new Error("请先打开登录窗口");
  const login = await activeSession.checkLoginState();
  browserLoginStatus = login.status;
  if (login.status === "login_required")
    throw new Error("当前抖音创作者中心仍处于登录页面，请完成登录后重试。");
  if (login.status === "unknown")
    throw new Error(
      "暂时无法确认抖音创作者中心登录状态，请保持页面打开并稍后重试。",
    );
  douyinLoggedIn = true;
  const config = await readConfig();
  if (config) await markBrowserCompatible(config, activeSession);
  await log(`${activeSession.getBrowserInfo().displayName} 登录状态正常`);
  return emit();
});
function registerDatabaseReadyIpc() {
  ipcMain.handle("agent:sync", () => performSync());
  ipcMain.handle("agent:sync-sample", () => performSync(true));
}
ipcMain.handle(
  "agent:settings",
  async (
    _event,
    input: {
      serverUrl: string;
      enabled: boolean;
      interval: "manual" | "12h" | "daily";
      dailyHour: number;
      autoLaunch: boolean;
      browserId: string;
      executablePath?: string;
    },
  ) => {
    const config = await readConfig();
    if (!config) throw new Error("请先完成连接");
    const found = discoverBrowsers({ customPath: input.executablePath }),
      selected = found.find((item) => item.id === input.browserId) || found[0];
    if (!selected) throw new Error("没有发现可用浏览器");
    config.serverUrl = input.serverUrl.replace(/\/$/, "");
    config.browserConfig = {
      ...config.browserConfig,
      id: selected.id,
      type: selected.browserType,
      engine: selected.engine,
      runtime: selected.runtime,
      executablePath: selected.executablePath,
    };
    config.syncConfig = {
      enabled: input.enabled,
      interval: input.interval,
      dailyHour: Math.max(0, Math.min(23, Number(input.dailyHour) || 2)),
    };
    await activeSession?.stop();
    activeSession = null;
    await writeConfig(config);
    if (!portableMode)
      app.setLoginItemSettings({
        openAtLogin: input.autoLaunch,
        path: process.execPath,
      });
    await schedule();
    await log(
      `桌面设置已更新，浏览器 ${selected.displayName}，运行模式 ${portableMode ? "portable" : "standard"}`,
    );
    return emit();
  },
);
ipcMain.handle("agent:choose-browser", async () => {
  const mac = process.platform === "darwin";
  const options: Electron.OpenDialogOptions = {
    title: "选择浏览器",
    defaultPath: mac ? "/Applications" : undefined,
    properties: mac ? ["openFile", "openDirectory"] : ["openFile"],
    filters: mac ? undefined : [{ name: "浏览器", extensions: ["exe"] }],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  const selected = result.filePaths[0];
  if (mac && selected.endsWith(".app")) {
    const name = path.basename(selected, ".app");
    return path.join(
      selected,
      "Contents",
      "MacOS",
      name === "Google Chrome" ? "Google Chrome" : name,
    );
  }
  return selected;
});
ipcMain.handle("agent:browser-restart", async () => {
  const config = await readConfig();
  if (!config) throw new Error("请先完成连接");
  await activeSession?.stop();
  activeSession = null;
  browserConnected = false;
  douyinLoggedIn = false;
  const session = await readyBrowserSession(config);
  browserConnected = session.isConnected();
  const login = await session.checkLoginState();
  browserLoginStatus = login.status;
  douyinLoggedIn = login.status === "logged_in";
  if (douyinLoggedIn) await markBrowserCompatible(config, session);
  await log(
    `${session.getBrowserInfo().displayName} 会话测试完成，login_status=${login.status}`,
  );
  return emit();
});
ipcMain.handle("agent:browser-profile-clear", async () => {
  const config = await readConfig();
  if (!config) throw new Error("请先完成连接");
  if (config.browserConfig.sessionMode !== "persistent")
    throw new Error("当前会话不使用 Agent 独立浏览器资料");
  const answer = mainWindow
    ? await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "再次确认清理浏览器资料",
        message:
          "这会删除当前账号的 Agent 独立浏览器资料，并清除其中的抖音登录状态。",
        detail: "不会影响日常浏览器资料，也不会删除 XMT 业务数据。是否继续？",
        buttons: ["取消", "确认清理"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
    : { response: 0 };
  if (answer.response !== 1) return { cleared: false, state: await state() };
  const profileRoot = path.join(paths().root, "profiles");
  const target = assertManagedProfile(
    managedProfile(paths().root, config.browserConfig, config.accountId),
    profileRoot,
  );
  await activeSession?.stop();
  activeSession = null;
  browserConnected = false;
  douyinLoggedIn = false;
  await fs.rm(target, { recursive: true, force: true });
  await log(
    `已清理当前账号的独立浏览器资料：${config.browserConfig.type}/${config.accountId}`,
  );
  return { cleared: true, state: await emit() };
});
ipcMain.handle("agent:open-logs", async () => {
  await fs.mkdir(paths().logs, { recursive: true });
  await shell.openPath(paths().logs);
});
app.whenReady().then(async () => {
  globalThis.fetch = net.fetch as typeof fetch;
  initializeDatabase();
  await initializePackageContractBootstrap();
  createWindow();
  createTray();
  if (databaseReady) { registerDatabaseReadyIpc(); startHeartbeat(); await startUploadQueueScheduler(); }
  await schedule();
  const runtimeProbe = process.env.XMT_AGENT_RUNTIME_PROBE_FILE;
  if (runtimeProbe) {
    await fs.mkdir(path.dirname(runtimeProbe), { recursive: true });
    await fs.writeFile(runtimeProbe, JSON.stringify({ runtimeIdentity: (await state()).runtimeIdentity, resourcesPath: process.resourcesPath, rendererUrl: process.env.ELECTRON_RENDERER_URL || null }, null, 2), "utf8");
  }
  app.on("activate", () => mainWindow?.show());
}).catch(async (error) => {
  const runtimeProbe = process.env.XMT_AGENT_RUNTIME_PROBE_FILE;
  const message = error instanceof Error ? error.message : String(error);
  console.error("XMT Agent startup failed:", message);
  if (runtimeProbe) {
    await fs.mkdir(path.dirname(runtimeProbe), { recursive: true });
    await fs.writeFile(runtimeProbe, JSON.stringify({ startupError: message }, null, 2), "utf8");
  }
});
app.on("window-all-closed", () => {});
app.on("before-quit", () => {
  (app as typeof app & { isQuitting?: boolean }).isQuitting = true;
  if (timer) clearTimeout(timer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  stopUploadQueueScheduler();
});
