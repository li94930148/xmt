import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';

const version = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const admin = { id: 91, username: 'settings-qa', role: 'admin', name: '系统设置验收', email: 'qa@example.test', enabled: true, force_change_password: false };
async function assertRenderedSettingsPage(page: Page) {
  await page.getByRole('heading', { name: '设置中心', exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/notification-settings', 'the intended settings route is active');
  assert((await page.locator('body').innerText()).trim().length > 0, 'the settings page is not blank');
  assert.equal(await page.locator('vite-error-overlay, #vite-error-overlay, nextjs-portal').count(), 0, 'no framework error overlay is visible');
}
async function navigateToWorkbench(page: Page) {
  const workbenchGroup = page.locator('nav button[aria-expanded]').filter({ hasText: '工作台' }).first();
  await workbenchGroup.click();
  await page.locator('nav ul[aria-hidden="false"]').getByRole('button', { name: '工作台', exact: true }).click();
}
function parseColor(raw: string) {
  const srgb = raw.match(/^color\(\s*srgb\s+([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)(?:\s*\/\s*([^\s)]+))?\s*\)/i);
  if (srgb) {
    const channels = srgb.slice(1, 4).map((value) => Number(value) * 255);
    const alpha = srgb[4] === undefined ? 1 : Number(srgb[4]);
    return [...channels, alpha].every(Number.isFinite) ? [...channels, alpha] : null;
  }
  const rgb = raw.match(/^rgba?\((.*)\)$/i);
  const channels = rgb?.[1].match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)?.map(Number) || [];
  return channels.length >= 3 ? [...channels.slice(0, 3), channels[3] ?? 1] : null;
}
assert.deepEqual(
  parseColor('color(srgb 0.302118 0.395294 0.72)')?.slice(0, 3).map(Math.round),
  [77, 101, 184],
  'CSS Color 4 srgb channels are normalized to the same range as rgb() channels',
);
function relativeLuminance(rgb: number[]) {
  const channels = rgb.map((value) => value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
async function contrastRatio(locator: import('playwright').Locator) {
  const colors = await locator.evaluate((element) => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  const foreground = parseColor(colors.foreground);
  const background = parseColor(colors.background);
  if (!foreground || !background) return 0;
  const text = relativeLuminance(foreground);
  const surface = relativeLuminance(background);
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}
async function composedTextContrastRatio(locator: import('playwright').Locator) {
  const colors = await locator.evaluate((element) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      backgrounds.push(getComputedStyle(current).backgroundColor);
    }
    return { foreground: getComputedStyle(element).color, backgrounds };
  });
  const foreground = parseColor(colors.foreground);
  if (!foreground) return 0;
  const background = [255, 255, 255];
  for (const value of colors.backgrounds.reverse()) {
    const layer = parseColor(value);
    if (!layer) continue;
    for (let index = 0; index < 3; index += 1) background[index] = layer[index] * layer[3] + background[index] * (1 - layer[3]);
  }
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}
async function assertMobileShellTextContrast(page: Page, theme: 'light' | 'dark') {
  const brand = page.getByText('XMT 移动办公', { exact: true });
  const brandRatio = await composedTextContrastRatio(brand);
  assert(brandRatio >= 4.5, `${theme}-theme mobile shell brand contrast=${brandRatio.toFixed(2)} expected>=4.5`);
  const mobileNavigation = page.getByRole('navigation', { name: '移动主导航' });
  for (const label of ['首页', '选题', '工作', '消息', '我的']) {
    const tab = mobileNavigation.getByRole('button', { name: label, exact: true });
    const ratio = await composedTextContrastRatio(tab);
    assert(ratio >= 4.5, `${theme}-theme mobile navigation "${label}" contrast=${ratio.toFixed(2)} expected>=4.5`);
  }
}
let settings = {
  system: { name: '测试系统', browserTitle: '测试系统', description: '隔离验收', icon: '测', defaultTheme: 'dark' },
  branding: { brandName: '测试系统', logo: '', brandDescription: '隔离验收' },
  login: { layout: 'style1', welcomeTitle: '欢迎', welcomeMessage: '登录验收' },
};
let failNextSettingsSave: { message: string; status: number; afterCommit: boolean } | null = null;
let failNextSettingsRead: string | null = null;
let settingsSaveDelayMs = 0;
const settingsSaveRequests: unknown[] = [];
let systemSettingsReadRequests = 0;
let notificationPreferences = [{ id: 1, channel: 'email', event_type: 'review', enabled: true }];
let failNextNotificationSave: string | null = null;
let failNextNotificationRead: string | null = null;
let notificationSaveDelayMs = 0;
let notificationSaveRequests = 0;
let notificationPreferenceReadRequests = 0;
let dropNextNotificationSaveResponseAfterCommit = false;
let profile = { ...admin };
let failNextProfileSave: { message: string; status: number; afterCommit: boolean } | null = null;
let failNextProfileRead: string | null = null;
let profileSaveDelayMs = 0;
let profileSaveRequests = 0;
let profileReadRequests = 0;
let fixturePassword = 'current-pass';
let passwordChangeDelayMs = 0;
let passwordChangeRequests = 0;
let passwordChangeCommittedCount = 0;
let passwordChangeSucceeded = false;
let dropNextPasswordChangeResponseAfterCommit = false;
let settingsBackups = [{ name: 'xmt-settings-fixture.db', size: 1024, created: '2026-10-09T00:00:00.000Z' }];
let backupListRequests = 0;
let backupCreateRequests = 0;
let backupDeleteRequests = 0;
let failNextBackupListRead: string | null = null;
let failNextBackupDelete: string | null = null;
let backupListDelayMs = 0;
let backupCreateDelayMs = 0;
let backupDeleteDelayMs = 0;
let dropNextBackupDeleteResponseAfterCommit = false;
const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const preference = typeof req.query.theme === 'string' ? `localStorage.setItem('xmt_theme',${JSON.stringify(req.query.theme)});` : "localStorage.removeItem('xmt_theme');";
  res.type('html').send(`<script>${preference}localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(admin))});localStorage.setItem('xmt_token','settings-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/notification-settings');</script>`);
});
app.get('/api/auth/me', (_req, res) => {
  profileReadRequests += 1;
  if (failNextProfileRead) {
    const message = failNextProfileRead;
    failNextProfileRead = null;
    res.status(503).json({ message });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(profile);
});
app.put('/api/auth/profile', async (req, res) => {
  profileSaveRequests += 1;
  if (profileSaveDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, profileSaveDelayMs));
  const failure = failNextProfileSave;
  if (failure && !failure.afterCommit) {
    failNextProfileSave = null;
    res.status(failure.status).json({ message: failure.message });
    return;
  }
  profile = { ...profile, name: String(req.body?.name ?? '').trim(), email: String(req.body?.email ?? '').trim() };
  if (failure) {
    failNextProfileSave = null;
    res.status(failure.status).json({ message: failure.message });
    return;
  }
  res.json(profile);
});
app.post('/api/auth/change-password', async (req, res) => {
  passwordChangeRequests += 1;
  if (passwordChangeDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, passwordChangeDelayMs));
  if (req.body?.oldPassword !== fixturePassword) {
    res.status(401).json({ message: '旧密码错误' });
    return;
  }
  fixturePassword = String(req.body?.newPassword || '');
  passwordChangeCommittedCount += 1;
  passwordChangeSucceeded = true;
  res.json({ message: '密码修改成功' });
});
app.get('/api/backup/list', async (_req, res) => {
  backupListRequests += 1;
  if (backupListDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, backupListDelayMs));
  if (failNextBackupListRead) {
    const message = failNextBackupListRead;
    failNextBackupListRead = null;
    res.status(503).json({ message });
    return;
  }
  res.json(settingsBackups);
});
app.post('/api/backup/create', async (_req, res) => {
  backupCreateRequests += 1;
  if (backupCreateDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, backupCreateDelayMs));
  const name = 'xmt-settings-created-fixture.db';
  settingsBackups = [{ name, size: 2048, created: '2026-10-09T00:01:00.000Z' }, ...settingsBackups];
  res.json({ message: '备份已创建', name });
});
app.delete('/api/backup/:name', async (req, res) => {
  backupDeleteRequests += 1;
  if (backupDeleteDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, backupDeleteDelayMs));
  if (failNextBackupDelete) {
    const message = failNextBackupDelete;
    failNextBackupDelete = null;
    res.status(503).json({ message });
    return;
  }
  settingsBackups = settingsBackups.filter((backup) => backup.name !== req.params.name);
  res.json({ message: '备份已删除' });
});
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get('/api/system-settings', (_req, res) => {
  systemSettingsReadRequests += 1;
  if (failNextSettingsRead) {
    const message = failNextSettingsRead;
    failNextSettingsRead = null;
    res.status(503).json({ message });
    return;
  }
  res.json({ ...settings, version });
});
app.get('/api/system-settings/public', (_req, res) => res.json({ ...settings, version }));
app.put('/api/system-settings', async (req, res) => {
  settingsSaveRequests.push(req.body);
  if (settingsSaveDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, settingsSaveDelayMs));
  const failure = failNextSettingsSave;
  if (failure && !failure.afterCommit) {
    failNextSettingsSave = null;
    res.status(failure.status).json({ message: failure.message });
    return;
  }
  settings = {
    ...settings,
    system: { ...settings.system, ...(req.body?.system ?? {}) },
    branding: { ...settings.branding, ...(req.body?.branding ?? {}) },
    login: { ...settings.login, ...(req.body?.login ?? {}) },
  };
  if (failure) {
    failNextSettingsSave = null;
    res.status(failure.status).json({ message: failure.message });
    return;
  }
  res.json({ ...settings, version });
});
app.get('/api/notifications/preferences', (_req, res) => {
  notificationPreferenceReadRequests += 1;
  if (failNextNotificationRead) {
    const message = failNextNotificationRead;
    failNextNotificationRead = null;
    res.status(503).json({ message });
    return;
  }
  res.json(notificationPreferences);
});
app.put('/api/notifications/preferences', async (req, res) => {
  notificationSaveRequests += 1;
  if (notificationSaveDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, notificationSaveDelayMs));
  if (failNextNotificationSave) {
    const message = failNextNotificationSave;
    failNextNotificationSave = null;
    res.status(503).json({ message });
    return;
  }
  notificationPreferences = req.body?.preferences ?? notificationPreferences;
  res.json({ message: '通知偏好已更新' });
});
app.get('/api/notifications/channels', (_req, res) => res.json([{ id: 'email', name: '邮件', description: '邮件提醒' }]));
app.get('/api/notifications/events', (_req, res) => res.json([{ id: 'review', name: '审核结果', description: '选题审核完成时提醒' }]));
app.use('/api', (_req, res) => res.json({ data: [] }));

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_SYSTEM_SETTINGS_QA_SERVE === '1') {
  console.log(`Isolated system settings QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  settings.system.defaultTheme = 'dark';
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)') || message.text().includes('400 (Bad Request)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  await page.goto(`${base}/__qa`);
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const notificationPreferencesTab = page.getByRole('button', { name: '通知偏好', exact: true });
  const systemSettingsTab = page.getByRole('button', { name: '系统设置', exact: true });
  assert.equal(await notificationPreferencesTab.getAttribute('aria-pressed'), 'true', 'the default settings category exposes its selected state');
  assert.equal(await systemSettingsTab.getAttribute('aria-pressed'), 'false', 'inactive settings categories expose an unselected state');
  await systemSettingsTab.click();
  assert.equal(await systemSettingsTab.getAttribute('aria-pressed'), 'true', 'the selected settings category updates after activation');
  const loginPageSettingsTab = page.getByRole('button', { name: '登录页设置', exact: true });
  await loginPageSettingsTab.click();
  const loginLayoutControl = page.getByLabel('登录页布局', { exact: true });
  assert.equal(await loginLayoutControl.count(), 1, 'login page layout selector is available by its visible label');
  assert.equal(await loginLayoutControl.getAttribute('id'), 'settings-login-layout', 'login page layout selector exposes a stable id');
  assert.equal(await loginLayoutControl.getAttribute('name'), 'login.layout', 'login page layout selector exposes its setting name');
  await systemSettingsTab.click();
  await page.getByRole('combobox', { name: '默认主题' }).selectOption('light');
  const writesBeforeRecoveryMarkerFailure = settingsSaveRequests.length;
  await page.evaluate(() => {
    const storage = window.sessionStorage as Storage & { __restoreSetItem?: Storage['setItem'] };
    const originalSetItem = storage.setItem.bind(storage);
    storage.__restoreSetItem = originalSetItem;
    storage.setItem = (key: string, value: string) => {
      if (key === 'xmt:system-settings-recovery:v1:actor:91') return;
      originalSetItem(key, value);
    };
  });
  await page.getByRole('button', { name: '保存系统设置', exact: true }).click();
  await page.getByText('本机恢复信息未能可靠保存；系统设置未发送。请检查浏览器存储后重试。', { exact: true }).waitFor();
  assert.equal(settingsSaveRequests.length, writesBeforeRecoveryMarkerFailure, 'a silently dropped recovery marker prevents the settings PUT');
  assert.equal(settings.system.defaultTheme, 'dark', 'a failed recovery-marker write does not change server settings');
  await page.evaluate(() => {
    const storage = window.sessionStorage as Storage & { __restoreSetItem?: Storage['setItem'] };
    if (storage.__restoreSetItem) storage.setItem = storage.__restoreSetItem;
    delete storage.__restoreSetItem;
  });
  await page.getByRole('button', { name: '保存系统设置', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.getByText('系统设置已更新', { exact: true }).waitFor();
  assert.equal(settings.system.defaultTheme, 'light', 'admin save persists through the isolated settings endpoint');
  assert.equal(await page.evaluate(() => localStorage.getItem('xmt_theme')), null, 'applying the system default does not create a personal preference');
  await page.screenshot({ path: '/tmp/xmt-system-default-theme-1440.png', fullPage: true });

  await page.getByRole('combobox', { name: '默认主题' }).selectOption('dark');
  const systemWritesBeforeCommitThen503 = settingsSaveRequests.length;
  const systemReadsBeforeCommitThen503 = systemSettingsReadRequests;
  failNextSettingsSave = { message: '设置已提交，但响应暂时失败。', status: 503, afterCommit: true };
  await page.getByRole('button', { name: '保存系统设置', exact: true }).click();
  await page.getByText('已核实系统设置已保存', { exact: true }).waitFor();
  assert.equal(settings.system.defaultTheme, 'dark', 'read-back confirms a settings update that committed before a 503 response');
  assert.equal(settingsSaveRequests.length, systemWritesBeforeCommitThen503 + 1, 'commit-then-503 recovery does not repeat the PUT');
  assert.equal(systemSettingsReadRequests, systemReadsBeforeCommitThen503 + 1, 'commit-then-503 recovery uses one read-only GET');

  await page.getByRole('combobox', { name: '默认主题' }).selectOption('light');
  const systemWritesBeforeUnknown = settingsSaveRequests.length;
  const systemReadsBeforeUnknown = systemSettingsReadRequests;
  failNextSettingsSave = { message: '系统设置暂时无法保存，请重试。', status: 503, afterCommit: false };
  failNextSettingsRead = '系统设置核实暂时不可用。';
  await page.getByRole('button', { name: '保存系统设置', exact: true }).click();
  await page.getByText(/系统设置保存结果尚未核实/).waitFor();
  assert.equal(settings.system.defaultTheme, 'dark', 'a pre-commit failure leaves persisted settings unchanged');
  assert.equal(settingsSaveRequests.length, systemWritesBeforeUnknown + 1, 'a failed verification does not automatically repeat the PUT');
  assert.equal(systemSettingsReadRequests, systemReadsBeforeUnknown + 1, 'the ambiguous save performs one GET even when verification fails');
  assert.equal(await page.getByRole('button', { name: '保存系统设置', exact: true }).isDisabled(), true, 'ordinary save stays locked while the result is unknown');
  assert.equal(await page.getByRole('combobox', { name: '默认主题' }).isDisabled(), true, 'the submitted settings snapshot stays locked while recovery is pending');
  const pendingSettingsRecovery = await page.evaluate(() => {
    const raw = window.sessionStorage.getItem('xmt:system-settings-recovery:v1:actor:91');
    return raw ? JSON.parse(raw) as { actorId: number; requestId: string; patch: { system?: { defaultTheme?: string } }; token?: string } : null;
  });
  assert.equal(pendingSettingsRecovery?.actorId, 91, 'the pending marker is isolated to the saving account');
  assert.equal(pendingSettingsRecovery?.patch.system?.defaultTheme, 'light', 'the marker retains the submitted setting for recovery');
  assert.equal('token' in (pendingSettingsRecovery || {}), false, 'the recovery marker never stores an authentication token');

  const systemWritesBeforeRecoveryReload = settingsSaveRequests.length;
  const systemReadsBeforeRecoveryReload = systemSettingsReadRequests;
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await page.getByText(/服务器当前系统设置与本次提交内容不同/).waitFor();
  assert.equal(settingsSaveRequests.length, systemWritesBeforeRecoveryReload, 'refresh restores the pending setting without automatically repeating the PUT');
  assert.equal(systemSettingsReadRequests, systemReadsBeforeRecoveryReload + 2, 'refresh performs the page read and one read-only recovery verification');
  assert.equal(await page.getByRole('button', { name: '保存系统设置', exact: true }).isDisabled(), true, 'refresh keeps ordinary settings saves locked until the pending result is resolved');

  await page.getByRole('button', { name: '只读重新核实', exact: true }).click();
  await page.getByText(/服务器当前系统设置与本次提交内容不同/).waitFor();
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === '确认覆盖服务器设置');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  assert.equal(settingsSaveRequests.length, systemWritesBeforeUnknown + 1, 'manual verification is read-only and does not repeat the PUT');
  assert.equal(systemSettingsReadRequests, systemReadsBeforeUnknown + 2, 'manual verification performs only one additional GET');
  await navigateToWorkbench(page);
  await page.waitForTimeout(100);
  assert.equal(new URL(page.url()).pathname, '/notification-settings', 'unresolved settings recovery blocks navigation before opening its confirmation');
  const settingsLeaveDialog = page.getByRole('dialog', { name: '设置尚有未完成事项' });
  const settingsLeaveDialogOpened = await settingsLeaveDialog.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  if (!settingsLeaveDialogOpened) {
    const navigationState = await page.evaluate(() => ({
      url: location.href,
      alerts: Array.from(document.querySelectorAll('[role="alert"]'), (element) => element.textContent?.trim() || ''),
      dialogs: Array.from(document.querySelectorAll('[role="dialog"]'), (element) => element.textContent?.trim().slice(0, 300) || ''),
    }));
    assert.fail(`navigation was blocked without the unresolved-settings confirmation dialog: ${JSON.stringify(navigationState)}`);
  }
  assert.equal(new URL(page.url()).pathname, '/notification-settings', 'system settings recovery blocks in-app navigation');
  await settingsLeaveDialog.getByRole('button', { name: '继续留在设置', exact: true }).click();
  assert.equal(settingsSaveRequests.length, systemWritesBeforeUnknown + 1, 'canceling navigation does not repeat an unresolved system settings write');
  await page.getByRole('button', { name: '确认覆盖服务器设置', exact: true }).click();
  await page.getByText('系统设置已更新', { exact: true }).waitFor();
  assert.equal(settings.system.defaultTheme, 'light', 'an explicit overwrite applies the preserved settings snapshot');
  assert.equal(settingsSaveRequests.length, systemWritesBeforeUnknown + 2, 'explicit overwrite sends exactly one additional PUT');

  await page.getByRole('combobox', { name: '默认主题' }).selectOption('dark');
  const systemWritesBeforeRejected = settingsSaveRequests.length;
  const systemReadsBeforeRejected = systemSettingsReadRequests;
  failNextSettingsSave = { message: '系统设置输入不合法。', status: 400, afterCommit: false };
  await page.getByRole('button', { name: '保存系统设置', exact: true }).click();
  await page.getByText('系统设置输入不合法。', { exact: true }).waitFor();
  assert.equal(settingsSaveRequests.length, systemWritesBeforeRejected + 1, 'a definite 4xx is sent once');
  assert.equal(systemSettingsReadRequests, systemReadsBeforeRejected, 'a definite 4xx does not trigger a verification GET');
  assert.equal(await page.getByRole('button', { name: '保存系统设置', exact: true }).isDisabled(), false, 'a definite rejection releases the ordinary save action');
  assert.equal(expectedHttpErrors.length, 4, 'system settings has one committed 503, one failed PUT/GET pair, and one definite 400');

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.equal(await page.evaluate(() => localStorage.getItem('xmt_theme')), null, 'the system default remains effective after reload without persisting as a personal choice');
  await page.getByRole('button', { name: '关于系统', exact: true }).click();
  assert.ok(await contrastRatio(page.getByTestId('about-brand-mark')) >= 4.5, 'light-theme about-page brand mark has accessible contrast');
  assert.ok(await composedTextContrastRatio(page.getByTestId('about-description')) >= 4.5, 'light-theme about-page description has accessible contrast');

  await context.close();

  const preferenceContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const preferencePage = await preferenceContext.newPage();
  preferencePage.on('pageerror', (error) => errors.push(error.message));
  preferencePage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await preferencePage.goto(`${base}/__qa`);
  await preferencePage.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await assertMobileShellTextContrast(preferencePage, 'light');
  assert.equal(await preferencePage.evaluate(() => localStorage.getItem('xmt_theme')), null, 'system default remains a system setting rather than a personal preference');
  await preferencePage.getByRole('button', { name: '系统设置', exact: true }).click();
  const defaultThemeControl = preferencePage.getByRole('combobox', { name: '默认主题' });
  assert.equal(await defaultThemeControl.inputValue(), 'light');
  await defaultThemeControl.scrollIntoViewIfNeeded();
  const controlBounds = await defaultThemeControl.boundingBox();
  const mobileNavBounds = await preferencePage.getByRole('navigation', { name: '移动主导航' }).boundingBox();
  assert(controlBounds && mobileNavBounds && controlBounds.y + controlBounds.height < mobileNavBounds.y, 'mobile navigation does not cover the default theme control');
  assert(await preferencePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'mobile-width settings surface has no horizontal overflow');
  await preferencePage.getByRole('button', { name: '关于系统', exact: true }).click();
  const lightAboutDescription = preferencePage.getByTestId('about-description');
  await lightAboutDescription.scrollIntoViewIfNeeded();
  assert.ok(await composedTextContrastRatio(lightAboutDescription) >= 4.5, '390px light-theme about description has accessible contrast');
  assert(await preferencePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'mobile about surface has no horizontal overflow');
  await preferencePage.screenshot({ path: '/tmp/xmt-system-default-theme-390.png' });

  await preferencePage.goto(`${base}/__qa?theme=dark`);
  await preferencePage.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await assertMobileShellTextContrast(preferencePage, 'dark');
  assert.equal(await preferencePage.evaluate(() => localStorage.getItem('xmt_theme')), 'dark', 'system default never overwrites an explicit personal choice');
  assert(await preferencePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'mobile-width settings surface has no horizontal overflow');
  await preferencePage.getByRole('button', { name: '关于系统', exact: true }).click();
  const darkAboutDescription = preferencePage.getByTestId('about-description');
  await darkAboutDescription.scrollIntoViewIfNeeded();
  assert.ok(await composedTextContrastRatio(darkAboutDescription) >= 4.5, '390px dark-theme about description has accessible contrast');
  assert(await preferencePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'dark mobile about surface has no horizontal overflow');
  await preferencePage.screenshot({ path: '/tmp/xmt-system-default-theme-390-preference.png', fullPage: true });
  await preferencePage.setViewportSize({ width: 1440, height: 960 });
  await preferencePage.getByRole('button', { name: '关于系统', exact: true }).click();
  assert.ok(await contrastRatio(preferencePage.getByTestId('about-brand-mark')) >= 4.5, 'dark-theme about-page brand mark has accessible contrast');
  assert.ok(await composedTextContrastRatio(preferencePage.getByTestId('about-description')) >= 4.5, 'dark-theme about-page description has accessible contrast');
  assert.deepEqual(errors, [], 'no browser runtime or console errors');
  await preferenceContext.close();
  console.log('System default theme browser test passed: admin save → live/reload default → explicit local preference precedence; 1440/390px.');

  const notificationContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const notificationPage = await notificationContext.newPage();
  const expectedPasswordConsoleErrors: string[] = [];
  const expectedBackupDeleteConsoleErrors: string[] = [];
  const expectedBackupDeleteRequestFailures: string[] = [];
  const expectedNotificationSaveConsoleErrors: string[] = [];
  const expectedNotificationSaveRequestFailures: string[] = [];
  let pendingPasswordResponseLossConsoleErrors = 0;
  let pendingBackupDeleteResponseLossConsoleErrors = 0;
  let pendingNotificationSaveResponseLossConsoleErrors = 0;
  await notificationPage.route('**/api/auth/change-password', async (route) => {
    if (!dropNextPasswordChangeResponseAfterCommit) {
      await route.continue();
      return;
    }
    dropNextPasswordChangeResponseAfterCommit = false;
    await route.fetch(); // Let the isolated server commit, then withhold its response from the page.
    pendingPasswordResponseLossConsoleErrors += 1;
    await route.abort('failed');
  });
  await notificationPage.route('**/api/notifications/preferences', async (route) => {
    if (!dropNextNotificationSaveResponseAfterCommit || route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    dropNextNotificationSaveResponseAfterCommit = false;
    await route.fetch();
    pendingNotificationSaveResponseLossConsoleErrors += 1;
    await route.abort('failed');
  });
  await notificationPage.route('**/api/backup/*', async (route) => {
    const request = route.request();
    if (!dropNextBackupDeleteResponseAfterCommit || request.method() !== 'DELETE'
      || !request.url().endsWith('/api/backup/xmt-settings-lost-response-fixture.db')) {
      await route.continue();
      return;
    }
    dropNextBackupDeleteResponseAfterCommit = false;
    await route.fetch();
    pendingBackupDeleteResponseLossConsoleErrors += 1;
    await route.abort('failed');
  });
  notificationPage.on('pageerror', (error) => errors.push(error.message));
  notificationPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)') || message.text().includes('400 (Bad Request)')) expectedHttpErrors.push(message.text());
    else if (message.text().includes('401 (Unauthorized)') && !expectedPasswordConsoleErrors.some((text) => text.includes('401 (Unauthorized)'))) expectedPasswordConsoleErrors.push(message.text());
    else if (message.text().includes('net::ERR_FAILED') && pendingNotificationSaveResponseLossConsoleErrors > 0) {
      pendingNotificationSaveResponseLossConsoleErrors -= 1;
      expectedNotificationSaveConsoleErrors.push(message.text());
    }
    else if (message.text().includes('net::ERR_FAILED') && pendingBackupDeleteResponseLossConsoleErrors > 0) {
      pendingBackupDeleteResponseLossConsoleErrors -= 1;
      expectedBackupDeleteConsoleErrors.push(message.text());
    }
    else if (message.text().includes('net::ERR_FAILED') && pendingPasswordResponseLossConsoleErrors > 0) {
      pendingPasswordResponseLossConsoleErrors -= 1;
      expectedPasswordConsoleErrors.push(message.text());
    }
    else errors.push(message.text());
  });
  const expectedPasswordRequestFailures: string[] = [];
  notificationPage.on('requestfailed', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/api/notifications/preferences')) {
      expectedNotificationSaveRequestFailures.push(request.failure()?.errorText || 'request failed');
    }
    if (request.url().endsWith('/api/auth/change-password')) {
      expectedPasswordRequestFailures.push(request.failure()?.errorText || 'request failed');
    }
    if (request.method() === 'DELETE' && request.url().endsWith('/api/backup/xmt-settings-lost-response-fixture.db')) {
      expectedBackupDeleteRequestFailures.push(request.failure()?.errorText || 'request failed');
    }
  });
  await notificationPage.goto(`${base}/__qa`);
  await notificationPage.getByRole('button', { name: '通知偏好', exact: true }).click();
  await assertRenderedSettingsPage(notificationPage);
  await notificationPage.getByRole('heading', { name: '通知偏好', exact: true }).waitFor();
  const notificationPreferenceToggle = notificationPage.getByRole('button', { name: '审核结果，邮件', exact: true });
  await notificationPage.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await notificationPage.screenshot({ path: '/tmp/xmt-notification-settings-1440-light.png', fullPage: true });
  const lightDivider = await notificationPage.locator('table tbody').evaluate((element) => ({
    width: getComputedStyle(element).borderTopWidth,
    color: getComputedStyle(element).borderTopColor,
    token: getComputedStyle(document.documentElement).getPropertyValue('--xmt-border-soft'),
  }));
  assert.equal(lightDivider.width, '1px', 'notification preferences retain a visible section divider in the light theme');
  assert.deepEqual(parseColor(lightDivider.color)?.slice(0, 3), parseColor(lightDivider.token)?.slice(0, 3), 'light-theme divider resolves to the Studio border token rather than white opacity');
  assert.equal(await notificationPreferenceToggle.count(), 1, 'the notification toggle identifies its event and channel');
  assert.equal(await notificationPreferenceToggle.getAttribute('aria-pressed'), 'true', 'fixture starts with an enabled notification preference');
  for (const width of [390, 320]) {
    await notificationPage.setViewportSize({ width, height: 844 });
    assert(await notificationPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${width}px notification settings have no horizontal page overflow`);
    const saveButton = notificationPage.getByRole('button', { name: '保存设置', exact: true });
    await saveButton.scrollIntoViewIfNeeded();
    const saveBounds = await saveButton.boundingBox();
    assert(saveBounds && saveBounds.width > 0 && saveBounds.x >= 0 && saveBounds.x + saveBounds.width <= width + 1, `${width}px save action remains within the viewport`);
    const statusToggle = notificationPreferenceToggle;
    assert.equal(await statusToggle.evaluate((element) => getComputedStyle(element).whiteSpace), 'nowrap', `${width}px notification state remains on one readable line`);
    const mobileNavigation = notificationPage.getByRole('navigation', { name: '移动主导航' });
    if (await mobileNavigation.count()) {
      const navigationBounds = await mobileNavigation.boundingBox();
      assert(!navigationBounds || saveBounds.y + saveBounds.height <= navigationBounds.y + 1, `${width}px fixed navigation does not cover the save action`);
    }
    if (width === 320) await notificationPage.screenshot({ path: '/tmp/xmt-notification-settings-320-light.png', fullPage: true });
  }
  for (const label of ['审核结果', '选题审核完成时提醒']) {
    const text = notificationPage.getByText(label, { exact: true }).first();
    const ratio = await composedTextContrastRatio(text);
    assert(ratio >= 4.5, `light-theme notification text "${label}" contrast=${ratio.toFixed(2)} expected>=4.5`);
  }
  for (const label of ['我的设置', '系统管理', '产品信息']) {
    const heading = notificationPage.getByRole('heading', { name: label, exact: true });
    const ratio = await composedTextContrastRatio(heading);
    assert(ratio >= 4.5, `light-theme settings group heading "${label}" contrast=${ratio.toFixed(2)} expected>=4.5`);
  }
  await notificationPage.setViewportSize({ width: 1440, height: 960 });
  await notificationPreferenceToggle.click();
  assert.equal(await notificationPreferenceToggle.getAttribute('aria-pressed'), 'false', 'preference change is visible before save');
  const notificationWritesBeforeDroppedMarker = notificationSaveRequests;
  await notificationPage.evaluate(() => {
    const storage = window.sessionStorage as Storage & { __restoreSetItem?: Storage['setItem'] };
    const originalSetItem = storage.setItem.bind(storage);
    storage.__restoreSetItem = originalSetItem;
    storage.setItem = (key: string, value: string) => {
      if (key === 'xmt:notification-preferences-recovery:v1:actor:91') return;
      originalSetItem(key, value);
    };
  });
  await notificationPage.getByRole('button', { name: '保存设置', exact: true }).click();
  await notificationPage.getByText('本机恢复信息未能可靠保存；通知偏好未发送。请检查浏览器存储后重新读取恢复记录。', { exact: true }).waitFor();
  assert.equal(notificationSaveRequests, notificationWritesBeforeDroppedMarker, 'a silently dropped notification recovery marker prevents the PUT');
  assert.equal(notificationPreferences[0].enabled, true, 'a failed recovery-marker write leaves server preferences unchanged');
  await notificationPage.evaluate(() => {
    const storage = window.sessionStorage as Storage & { __restoreSetItem?: Storage['setItem'] };
    if (storage.__restoreSetItem) storage.setItem = storage.__restoreSetItem;
    delete storage.__restoreSetItem;
  });
  await notificationPage.getByRole('button', { name: '重新读取恢复记录', exact: true }).click();
  const notificationSaveButton = notificationPage.getByRole('button', { name: '保存设置', exact: true });
  await notificationPage.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === '保存设置' && !button.disabled));
  assert.equal(await notificationSaveButton.isDisabled(), false, 'restoring storage and re-reading the empty marker re-enables settings');
  await notificationPreferenceToggle.waitFor({ state: 'visible' });
  await notificationPreferenceToggle.click();
  assert.equal(await notificationPreferenceToggle.getAttribute('aria-pressed'), 'false', 'the unsaved notification choice is restored after the marker failure is cleared');
  failNextNotificationSave = '通知偏好暂时无法保存，请重试。';
  const savesBeforeRefusal = notificationSaveRequests;
  await notificationPage.getByRole('button', { name: '保存设置', exact: true }).click();
  await notificationPage.getByText('服务器当前通知偏好与本页设置不同。为避免覆盖其他设备的更新，系统没有自动重复保存。', { exact: true }).waitFor();
  assert.equal(notificationPreferences[0].enabled, true, 'failed save leaves the persisted notification preference unchanged');
  assert.equal(await notificationPreferenceToggle.getAttribute('aria-pressed'), 'false', 'failed save keeps the requested preference available for retry');
  assert.equal(notificationSaveRequests, savesBeforeRefusal + 1, 'an ambiguous 503 never triggers an automatic second PUT');
  assert.equal(await notificationPage.getByRole('button', { name: '保存设置', exact: true }).isDisabled(), true, 'ordinary save stays locked until the conflict is resolved');
  await notificationPage.getByRole('button', { name: '确认覆盖服务器设置', exact: true }).click();
  await notificationPage.getByText('通知偏好已更新', { exact: true }).waitFor();
  assert.equal(notificationPreferences[0].enabled, false, 'explicit retry persists the changed notification preference');
  await notificationPreferenceToggle.click();
  notificationSaveDelayMs = 160;
  const repeatedNotificationSave = notificationPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/notifications/preferences') && response.status() === 200);
  await notificationPage.getByRole('button', { name: '保存设置', exact: true }).dblclick();
  await repeatedNotificationSave;
  await notificationPage.getByText('通知偏好已更新', { exact: true }).waitFor();
  notificationSaveDelayMs = 0;
  assert.equal(notificationPreferences[0].enabled, true, 'a repeated notification save persists the selected value');
  assert.equal(notificationSaveRequests, 3, 'failed attempt, explicit retry, and rapid double click issue only three total saves');

  await notificationPreferenceToggle.click();
  const readsBeforeLostResponse = notificationPreferenceReadRequests;
  const savesBeforeLostResponse = notificationSaveRequests;
  dropNextNotificationSaveResponseAfterCommit = true;
  await notificationPage.getByRole('button', { name: '保存设置', exact: true }).click();
  await notificationPage.getByText('已核实通知偏好已保存', { exact: true }).waitFor();
  assert.equal(notificationPreferences[0].enabled, false, 'read-back confirms a committed save whose response was lost');
  assert.equal(notificationSaveRequests, savesBeforeLostResponse + 1, 'response-loss recovery performs no second PUT');
  assert.equal(notificationPreferenceReadRequests, readsBeforeLostResponse + 1, 'response-loss recovery uses one read-only GET');
  assert.equal(expectedNotificationSaveRequestFailures.length, 1, 'the injected response loss is observed as one failed browser request');

  await notificationPreferenceToggle.click();
  dropNextNotificationSaveResponseAfterCommit = true;
  failNextNotificationRead = '通知偏好核实暂时不可用。';
  await notificationPage.getByRole('button', { name: '保存设置', exact: true }).click();
  await notificationPage.getByRole('button', { name: '只读重新核实', exact: true }).waitFor();
  assert.equal(await notificationPreferenceToggle.isDisabled(), true, 'unknown outcome locks further edits');
  assert.equal(notificationSaveRequests, savesBeforeLostResponse + 2, 'verification failure does not resend the write');
  await notificationPage.getByRole('button', { name: '只读重新核实', exact: true }).click();
  await notificationPage.getByText('已核实通知偏好已保存', { exact: true }).waitFor();
  assert.equal(notificationPreferences[0].enabled, true, 'a read-only retry resolves the prior unknown outcome');
  assert.equal(notificationSaveRequests, savesBeforeLostResponse + 2, 'read-only verification retry sends no additional PUT');
  assert.equal(expectedNotificationSaveConsoleErrors.length, 2, 'both injected response losses are the only expected notification request errors');

  await notificationPreferenceToggle.click();
  const notificationWritesBeforeReloadRecovery = notificationSaveRequests;
  const notificationReadsBeforeReloadRecovery = notificationPreferenceReadRequests;
  failNextNotificationSave = '通知偏好暂时无法保存，请重试。';
  failNextNotificationRead = '通知偏好核实暂时不可用。';
  await notificationPage.getByRole('button', { name: '保存设置', exact: true }).click();
  await notificationPage.getByRole('button', { name: '只读重新核实', exact: true }).waitFor();
  const pendingNotificationRecovery = await notificationPage.evaluate(() => {
    const raw = window.sessionStorage.getItem('xmt:notification-preferences-recovery:v1:actor:91');
    return raw ? JSON.parse(raw) as { actorId: number; requestId: string; draft: Array<{ channel: string; event_type: string; enabled: boolean }>; token?: string } : null;
  });
  assert.equal(pendingNotificationRecovery?.actorId, 91, 'notification recovery is isolated to the saving account');
  assert.equal(pendingNotificationRecovery?.draft[0]?.enabled, false, 'notification recovery keeps the submitted preference');
  assert.equal('token' in (pendingNotificationRecovery || {}), false, 'notification recovery never stores an authentication token');
  assert.equal(notificationPreferences[0].enabled, true, 'the injected definite pre-commit failure leaves the server value unchanged');
  assert.equal(notificationSaveRequests, notificationWritesBeforeReloadRecovery + 1, 'an unknown notification save is submitted once');
  assert.equal(notificationPreferenceReadRequests, notificationReadsBeforeReloadRecovery + 1, 'the initial unknown result uses one failed read-only verification');

  const notificationRequestIdBeforeReload = pendingNotificationRecovery?.requestId;
  notificationPage.once('dialog', (dialog) => void dialog.accept());
  await notificationPage.reload();
  await notificationPage.getByText(/服务器当前通知偏好与本页设置不同/).waitFor();
  assert.equal(notificationPreferenceReadRequests, notificationReadsBeforeReloadRecovery + 3, 'refresh loads preferences and performs one read-only recovery GET');
  assert.equal(notificationSaveRequests, notificationWritesBeforeReloadRecovery + 1, 'refresh recovery never repeats the notification PUT');
  assert.equal(await notificationPreferenceToggle.isDisabled(), true, 'refresh keeps notification editing locked while the outcome conflicts');
  const recoveredNotificationMarker = await notificationPage.evaluate(() => {
    const raw = window.sessionStorage.getItem('xmt:notification-preferences-recovery:v1:actor:91');
    return raw ? JSON.parse(raw) as { requestId: string } : null;
  });
  assert.equal(recoveredNotificationMarker?.requestId, notificationRequestIdBeforeReload, 'refresh resumes the same owned notification request');
  await notificationPage.getByRole('button', { name: '确认覆盖服务器设置', exact: true }).click();
  await notificationPage.getByText('通知偏好已更新', { exact: true }).waitFor();
  assert.equal(notificationPreferences[0].enabled, false, 'an explicit post-refresh overwrite applies the preserved preference');
  assert.equal(notificationSaveRequests, notificationWritesBeforeReloadRecovery + 2, 'the explicit post-refresh overwrite sends exactly one additional PUT');
  assert.equal(await notificationPage.evaluate(() => window.sessionStorage.getItem('xmt:notification-preferences-recovery:v1:actor:91')), null, 'a verified post-refresh save clears its owned recovery marker');

  await notificationPage.getByRole('button', { name: '个人资料', exact: true }).click();
  const profileInputs = notificationPage.locator('input');
  const profileRecoveryKey = 'xmt:desktop-profile-recovery:v1:actor:91';
  const profileWritesBeforeMarkerFailure = profileSaveRequests;
  await profileInputs.nth(0).fill('恢复标记未写入');
  await profileInputs.nth(1).fill('marker-drop@example.test');
  await notificationPage.evaluate(() => {
    const storage = window.sessionStorage as Storage & { __restoreProfileSetItem?: Storage['setItem'] };
    const originalSetItem = storage.setItem.bind(storage);
    storage.__restoreProfileSetItem = originalSetItem;
    storage.setItem = (key: string, value: string) => {
      if (key === 'xmt:desktop-profile-recovery:v1:actor:91') return;
      originalSetItem(key, value);
    };
  });
  await notificationPage.getByRole('button', { name: '保存个人资料', exact: true }).click();
  await notificationPage.getByText('本机恢复记录未能逐项保存并核对；个人资料未发送。请检查浏览器存储后重试。', { exact: true }).waitFor();
  assert.equal(profileSaveRequests, profileWritesBeforeMarkerFailure, 'a silently dropped profile recovery marker prevents the profile PUT');
  assert.equal(await notificationPage.evaluate((key) => window.sessionStorage.getItem(key), profileRecoveryKey), null, 'a silently dropped profile marker remains absent');
  assert.equal(await profileInputs.nth(0).inputValue(), '恢复标记未写入', 'failed marker verification keeps the edited name');
  assert.equal(await profileInputs.nth(1).inputValue(), 'marker-drop@example.test', 'failed marker verification keeps the edited email');
  await notificationPage.evaluate(() => {
    const storage = window.sessionStorage as Storage & { __restoreProfileSetItem?: Storage['setItem'] };
    if (!storage.__restoreProfileSetItem) throw new Error('profile sessionStorage setter backup missing');
    storage.setItem = storage.__restoreProfileSetItem;
    delete storage.__restoreProfileSetItem;
  });

  await profileInputs.nth(0).fill('资料重试验收');
  await profileInputs.nth(1).fill('profile-retry@example.test');
  const profileReadsBeforeRejected = profileReadRequests;
  failNextProfileSave = { message: '个人资料格式不正确。', status: 400, afterCommit: false };
  profileSaveDelayMs = 160;
  await notificationPage.getByRole('button', { name: '保存个人资料', exact: true }).dblclick();
  await notificationPage.getByText('个人资料格式不正确。', { exact: true }).waitFor();
  profileSaveDelayMs = 0;
  assert.equal(profileSaveRequests, 1, 'rapid repeated profile submission sends one request');
  assert.equal(profile.name, admin.name, 'a failed profile save leaves the persisted profile unchanged');
  assert.equal(profileReadRequests, profileReadsBeforeRejected, 'a definite profile rejection does not trigger a verification GET');
  assert.equal(await profileInputs.nth(0).inputValue(), '资料重试验收', 'failed profile input is retained for retry');
  assert.equal(await profileInputs.nth(1).inputValue(), 'profile-retry@example.test', 'failed profile email is retained for retry');
  await notificationPage.getByRole('button', { name: '保存个人资料', exact: true }).click();
  await notificationPage.getByText('个人资料已更新', { exact: true }).waitFor();
  assert.equal(profile.name, '资料重试验收', 'explicit profile retry persists the edited name');
  assert.equal(profileSaveRequests, 2, 'profile retry sends exactly one additional update');

  await profileInputs.nth(0).fill('响应丢失后已保存');
  await profileInputs.nth(1).fill('profile-committed@example.test');
  const profileWritesBeforeCommitThen503 = profileSaveRequests;
  const profileReadsBeforeCommitThen503 = profileReadRequests;
  failNextProfileSave = { message: '资料已保存，但响应暂时失败。', status: 503, afterCommit: true };
  await notificationPage.getByRole('button', { name: '保存个人资料', exact: true }).click();
  await notificationPage.getByText('已核实个人资料已更新。', { exact: true }).waitFor();
  assert.equal(profile.name, '响应丢失后已保存', 'read-back confirms a profile update committed before its 503 response');
  assert.equal(profileSaveRequests, profileWritesBeforeCommitThen503 + 1, 'commit-then-503 recovery does not repeat the profile PUT');
  assert.equal(profileReadRequests, profileReadsBeforeCommitThen503 + 1, 'commit-then-503 recovery uses one read-only profile GET');

  await profileInputs.nth(0).fill('资料明确恢复验收');
  await profileInputs.nth(1).fill('profile-recovery@example.test');
  const profileWritesBeforeUnknown = profileSaveRequests;
  const profileReadsBeforeUnknown = profileReadRequests;
  failNextProfileSave = { message: '个人资料服务暂时不可用。', status: 503, afterCommit: false };
  failNextProfileRead = '个人资料核实暂时不可用。';
  await notificationPage.getByRole('button', { name: '保存个人资料', exact: true }).click();
  await notificationPage.getByText(/个人资料保存结果尚未核实/).waitFor();
  assert.equal(profile.name, '响应丢失后已保存', 'a pre-commit profile failure leaves the server value unchanged');
  assert.equal(profileSaveRequests, profileWritesBeforeUnknown + 1, 'a failed profile read-back does not automatically repeat the PUT');
  assert.equal(profileReadRequests, profileReadsBeforeUnknown + 1, 'an ambiguous profile write is followed by one failed read-only GET');
  assert.equal(await profileInputs.nth(0).isDisabled(), true, 'profile inputs lock while the write result is unknown');
  const pendingProfileRecovery = await notificationPage.evaluate((key) => {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as { actorId: number; authMode: string; requestId: string; before: { name: string; email: string }; draft: { name: string; email: string }; token?: string; password?: string } : null;
  }, profileRecoveryKey);
  assert.equal(pendingProfileRecovery?.actorId, 91, 'profile recovery is scoped to its saving account');
  assert(['legacy', 'v1-web'].includes(pendingProfileRecovery?.authMode || ''), 'profile recovery records a supported authentication mode');
  assert.equal(pendingProfileRecovery?.draft.name, '资料明确恢复验收', 'profile recovery preserves the submitted name');
  assert.equal(pendingProfileRecovery?.draft.email, 'profile-recovery@example.test', 'profile recovery preserves the submitted email');
  assert.equal('token' in (pendingProfileRecovery || {}), false, 'profile recovery never stores an authentication token');
  assert.equal('password' in (pendingProfileRecovery || {}), false, 'profile recovery never stores a password');
  assert.equal(await notificationPage.evaluate(() => window.sessionStorage.getItem('xmt:desktop-profile-recovery:v1:actor:92')), null, 'profile recovery is isolated from another account');
  const profileRecoveryWarnsOnUnload = await notificationPage.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(profileRecoveryWarnsOnUnload, true, 'an unresolved profile update warns before the settings page is unloaded');
  await navigateToWorkbench(notificationPage);
  const profileLeaveDialog = notificationPage.getByRole('dialog', { name: '设置尚有未完成事项' });
  await profileLeaveDialog.waitFor();
  assert.equal(new URL(notificationPage.url()).pathname, '/notification-settings', 'unresolved profile recovery blocks in-app navigation');
  await profileLeaveDialog.getByRole('button', { name: '继续留在设置', exact: true }).click();
  assert.equal(profileSaveRequests, profileWritesBeforeUnknown + 1, 'canceling navigation does not repeat an unresolved profile write');
  notificationPage.once('dialog', (dialog) => void dialog.accept());
  await notificationPage.reload();
  await notificationPage.getByText(/服务器仍是本次编辑前的资料/).waitFor();
  assert.equal(profileSaveRequests, profileWritesBeforeUnknown + 1, 'refresh recovery never repeats the profile PUT');
  assert.equal(profileReadRequests, profileReadsBeforeUnknown + 2, 'refresh recovery resumes with one read-only profile GET');
  assert.equal(await profileInputs.nth(0).inputValue(), '资料明确恢复验收', 'refresh recovery restores the submitted name');
  assert.equal(await profileInputs.nth(1).inputValue(), 'profile-recovery@example.test', 'refresh recovery restores the submitted email');
  assert.equal(await profileInputs.nth(0).isDisabled(), true, 'refresh keeps profile editing locked until explicit recovery');
  const refreshedProfileRecovery = await notificationPage.evaluate((key) => {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as { requestId: string } : null;
  }, profileRecoveryKey);
  assert.equal(refreshedProfileRecovery?.requestId, pendingProfileRecovery?.requestId, 'refresh resumes the same profile write marker');
  await notificationPage.getByRole('button', { name: '确认重新保存', exact: true }).click();
  await notificationPage.getByText('个人资料已更新', { exact: true }).waitFor();
  assert.equal(profile.name, '资料明确恢复验收', 'the explicit profile retry persists the preserved draft');
  assert.equal(profileSaveRequests, profileWritesBeforeUnknown + 2, 'explicit profile retry sends exactly one additional PUT');
  assert.equal(await notificationPage.evaluate((key) => window.sessionStorage.getItem(key), profileRecoveryKey), null, 'the explicit retry clears its verified profile marker');

  await profileInputs.nth(0).fill('清理失败仍锁定');
  await profileInputs.nth(1).fill('clear-failure@example.test');
  const profileWritesBeforeClearFailure = profileSaveRequests;
  await notificationPage.evaluate((key) => {
    const storage = window.sessionStorage as Storage & { __restoreProfileRemoveItem?: Storage['removeItem'] };
    const originalRemoveItem = storage.removeItem.bind(storage);
    storage.__restoreProfileRemoveItem = originalRemoveItem;
    storage.removeItem = (candidate: string) => {
      if (candidate === key) return;
      originalRemoveItem(candidate);
    };
  }, profileRecoveryKey);
  await notificationPage.getByRole('button', { name: '保存个人资料', exact: true }).click();
  await notificationPage.getByText(/本机恢复记录未能清除/).waitFor();
  assert.equal(profile.name, '清理失败仍锁定', 'a confirmed profile write updates the isolated server fixture');
  assert.equal(profileSaveRequests, profileWritesBeforeClearFailure + 1, 'marker cleanup failure does not repeat the profile PUT');
  assert.equal(await profileInputs.nth(0).isDisabled(), true, 'profile editing remains locked when marker cleanup fails');
  assert.notEqual(await notificationPage.evaluate((key) => window.sessionStorage.getItem(key), profileRecoveryKey), null, 'the unresolved profile marker remains available for recovery');
  const profileReadsBeforeClearRecovery = profileReadRequests;
  const clearFailureRead = notificationPage.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith('/api/auth/me') && response.status() === 200);
  await notificationPage.getByRole('button', { name: '只读重新核实', exact: true }).click();
  await clearFailureRead;
  await notificationPage.getByText(/本机恢复记录未能清除/).waitFor();
  assert.equal(profileSaveRequests, profileWritesBeforeClearFailure + 1, 'read-only recovery after cleanup failure sends no profile PUT');
  assert.equal(profileReadRequests, profileReadsBeforeClearRecovery + 1, 'cleanup recovery performs one read-only profile GET');
  await notificationPage.evaluate(() => {
    const storage = window.sessionStorage as Storage & { __restoreProfileRemoveItem?: Storage['removeItem'] };
    if (!storage.__restoreProfileRemoveItem) throw new Error('profile sessionStorage remover backup missing');
    storage.removeItem = storage.__restoreProfileRemoveItem;
    delete storage.__restoreProfileRemoveItem;
  });
  const profileReadsBeforeClearRetry = profileReadRequests;
  const clearRetryRead = notificationPage.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith('/api/auth/me') && response.status() === 200);
  await notificationPage.getByRole('button', { name: '只读重新核实', exact: true }).click();
  await clearRetryRead;
  await notificationPage.getByRole('button', { name: '保存个人资料', exact: true }).waitFor();
  assert.equal(await notificationPage.evaluate((key) => window.sessionStorage.getItem(key), profileRecoveryKey), null, 'a later verified cleanup removes the profile marker');
  assert.equal(profileSaveRequests, profileWritesBeforeClearFailure + 1, 'clearing a confirmed profile marker never resubmits the PUT');
  assert.equal(profileReadRequests, profileReadsBeforeClearRetry + 1, 'clearing the profile marker uses only a read-only GET');

  await notificationPage.evaluate(async () => {
    const { useAuthStore } = await import('/src/store/index.ts');
    const auth = useAuthStore.getState();
    if (!auth.user) throw new Error('the isolated profile fixture must be authenticated');
    auth.loginV1(auth.user, 'settings-profile-session-token-before-refresh');
  });
  await profileInputs.nth(0).fill('令牌刷新后仍能保存');
  await profileInputs.nth(1).fill('token-refresh-profile@example.test');
  profileSaveDelayMs = 160;
  const tokenRefreshProfileRequest = notificationPage.waitForRequest((request) => request.method() === 'PUT' && request.url().endsWith('/api/auth/profile'));
  const tokenRefreshProfileResponse = notificationPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/auth/profile') && response.status() === 200);
  await notificationPage.getByRole('button', { name: '保存个人资料', exact: true }).click();
  await tokenRefreshProfileRequest;
  await notificationPage.evaluate(async () => {
    const { useAuthStore } = await import('/src/store/index.ts');
    const auth = useAuthStore.getState();
    if (!auth.user) throw new Error('the isolated profile fixture must remain authenticated during token refresh');
    auth.loginV1(auth.user, 'settings-profile-session-token-after-refresh');
  });
  await tokenRefreshProfileResponse;
  profileSaveDelayMs = 0;
  await notificationPage.getByText('个人资料已更新', { exact: true }).last().waitFor();
  const refreshedProfileAuth = await notificationPage.evaluate(async () => {
    const { useAuthStore } = await import('/src/store/index.ts');
    const auth = useAuthStore.getState();
    return { token: auth.token, user: auth.user };
  });
  assert.equal(refreshedProfileAuth.token, 'settings-profile-session-token-after-refresh', 'profile read-back keeps the access token refreshed during the request');
  assert.equal(refreshedProfileAuth.user?.name, '令牌刷新后仍能保存', 'a same-account profile response still applies after routine token rotation');
  assert.equal(profile.name, '令牌刷新后仍能保存', 'the isolated server fixture records the profile update once');
  await notificationPage.evaluate(async () => {
    const { useAuthStore } = await import('/src/store/index.ts');
    const auth = useAuthStore.getState();
    if (!auth.user) throw new Error('the isolated profile fixture must remain authenticated after token refresh');
    auth.login(auth.user, 'settings-fixture', { persist: 'local' });
  });

  await notificationPage.getByRole('button', { name: '账号安全', exact: true }).click();
  for (const label of ['当前密码', '新密码', '确认新密码']) {
    const passwordField = notificationPage.getByLabel(label, { exact: true });
    const toggle = notificationPage.getByRole('button', { name: `显示${label}`, exact: true });
    assert.equal(await passwordField.getAttribute('type'), 'password', `${label} starts masked`);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false', `${label} visibility control reports its masked state`);
    assert.equal(await toggle.getAttribute('aria-controls'), await passwordField.getAttribute('id'), `${label} visibility control identifies its field`);
    await toggle.click();
    const hideToggle = notificationPage.getByRole('button', { name: `隐藏${label}`, exact: true });
    assert.equal(await hideToggle.getAttribute('aria-pressed'), 'true', `${label} visibility control reports its revealed state`);
    assert.equal(await passwordField.getAttribute('type'), 'text', `${label} is revealed on request`);
    await hideToggle.click();
    assert.equal(await passwordField.getAttribute('type'), 'password', `${label} is masked again on request`);
  }
  const passwordInputs = notificationPage.locator('input[type="password"]');
  await passwordInputs.nth(0).fill('wrong-current-pass');
  await passwordInputs.nth(1).fill('updated-pass');
  await passwordInputs.nth(2).fill('updated-pass');
  const passwordWritesBeforeDroppedMarker = passwordChangeRequests;
  await notificationPage.evaluate(() => {
    const storage = window.sessionStorage as Storage & { __restoreSetItem?: Storage['setItem'] };
    const originalSetItem = storage.setItem.bind(storage);
    storage.__restoreSetItem = originalSetItem;
    storage.setItem = (key: string, value: string) => {
      if (key === 'xmt:desktop-password-change-recovery:v1:actor:91') return;
      originalSetItem(key, value);
    };
  });
  await notificationPage.getByRole('button', { name: '更新密码', exact: true }).click();
  await notificationPage.getByText('本机恢复信息未能可靠保存；密码修改请求未发送。请检查浏览器存储后重试。', { exact: true }).waitFor();
  assert.equal(passwordChangeRequests, passwordWritesBeforeDroppedMarker, 'a silently dropped password recovery marker prevents the POST');
  assert.equal(await notificationPage.evaluate(() => window.sessionStorage.getItem('xmt:desktop-password-change-recovery:v1:actor:91')), null, 'the failed password marker write leaves no recovery record');
  await notificationPage.evaluate(() => {
    const storage = window.sessionStorage as Storage & { __restoreSetItem?: Storage['setItem'] };
    if (storage.__restoreSetItem) storage.setItem = storage.__restoreSetItem;
    delete storage.__restoreSetItem;
  });
  passwordChangeDelayMs = 160;
  await notificationPage.getByRole('button', { name: '更新密码', exact: true }).dblclick();
  await notificationPage.getByText('旧密码错误', { exact: true }).waitFor();
  passwordChangeDelayMs = 0;
  assert.equal(passwordChangeRequests, 1, 'rapid repeated password submission sends one request');
  assert.equal(passwordChangeCommittedCount, 0, 'an explicit old-password rejection occurs before the password write');
  assert.equal(passwordChangeSucceeded, false, 'a known rejected password request is not reported as a successful change');
  assert.equal(await notificationPage.evaluate(() => window.sessionStorage.getItem('xmt:desktop-password-change-recovery:v1:actor:91')), null, 'a definite password rejection clears its verified recovery marker');
  assert.deepEqual(await passwordInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)), ['wrong-current-pass', 'updated-pass', 'updated-pass'], 'a definite old-password rejection retains the inputs for correction');
  await passwordInputs.nth(0).fill('current-pass');
  await notificationPage.getByRole('button', { name: '更新密码', exact: true }).click();
  await notificationPage.getByText('密码已更新', { exact: true }).waitFor();
  assert.equal(passwordChangeRequests, 2, 'password retry sends exactly one additional request');
  assert.equal(passwordChangeCommittedCount, 1, 'the corrected password request commits once');
  assert.equal(passwordChangeSucceeded, true, 'the explicit retry completes the password change');
  assert.equal(await notificationPage.evaluate(() => window.sessionStorage.getItem('xmt:desktop-password-change-recovery:v1:actor:91')), null, 'confirmed password success clears its verified recovery marker');
  assert.deepEqual(await passwordInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)), ['', '', ''], 'password fields clear only after confirmed success');

  await passwordInputs.nth(0).fill('updated-pass');
  await passwordInputs.nth(1).fill('final-pass');
  await passwordInputs.nth(2).fill('final-pass');
  dropNextPasswordChangeResponseAfterCommit = true;
  passwordChangeDelayMs = 160;
  await notificationPage.getByRole('button', { name: '更新密码', exact: true }).dblclick();
  await notificationPage.getByTestId('password-outcome-unknown').waitFor();
  passwordChangeDelayMs = 0;
  assert.equal(fixturePassword, 'final-pass', 'the isolated server commits the password before dropping the response');
  assert.equal(passwordChangeRequests, 3, 'the response-loss path submits the password change exactly once');
  assert.equal(passwordChangeCommittedCount, 2, 'the dropped response does not undo the committed password change');
  assert.equal(expectedPasswordRequestFailures.length, 1, 'the fixture drops exactly one committed password-change response');
  assert.equal(expectedPasswordConsoleErrors.length, 2, 'only the intentional old-password rejection and withheld response create network console errors');
  assert.deepEqual(await passwordInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)), ['', '', ''], 'unknown result clears all sensitive password fields');
  assert.equal(await passwordInputs.evaluateAll((inputs) => inputs.every((input) => (input as HTMLInputElement).disabled)), true, 'unknown result locks password fields against replay');
  const pendingPasswordRecovery = await notificationPage.evaluate(() => {
    const raw = window.sessionStorage.getItem('xmt:desktop-password-change-recovery:v1:actor:91');
    return raw ? JSON.parse(raw) as { version: number; actorId: number; requestId: string; oldPassword?: string; newPassword?: string; token?: string } : null;
  });
  assert.equal(pendingPasswordRecovery?.version, 1, 'the unresolved password marker uses the current schema');
  assert.equal(pendingPasswordRecovery?.actorId, 91, 'the unresolved password marker is scoped to the active account');
  assert.match(pendingPasswordRecovery?.requestId || '', /^[0-9a-f-]{36}$/i, 'the unresolved password marker keeps its stable request identity');
  assert.deepEqual(Object.keys(pendingPasswordRecovery || {}).sort(), ['actorId', 'requestId', 'version'], 'the password recovery marker stores no passwords or authentication token');
  const passwordUpdateButton = notificationPage.getByRole('button', { name: '结果待核实', exact: true });
  assert.equal(await passwordUpdateButton.isDisabled(), true, 'unknown result disables another submission');
  const unknownPasswordNotice = await notificationPage.getByTestId('password-outcome-unknown').innerText();
  assert.match(unknownPasswordNotice, /结果尚未确认/);
  assert.match(unknownPasswordNotice, /新密码重新登录/);
  assert.doesNotMatch(unknownPasswordNotice, /修改失败/);
  await passwordUpdateButton.click({ force: true });
  assert.equal(passwordChangeRequests, 3, 'a forced click cannot replay an unknown password-change request');

  notificationPage.once('dialog', (dialog) => void dialog.accept());
  await notificationPage.reload();
  await assertRenderedSettingsPage(notificationPage);
  await notificationPage.getByTestId('password-outcome-unknown').waitFor();
  assert.equal(await notificationPage.getByRole('heading', { name: '账号安全', exact: true }).count(), 1, 'refresh returns directly to the unresolved password panel');
  assert.equal(passwordChangeRequests, 3, 'refresh never resends the unresolved password-change request');
  assert.equal(await notificationPage.locator('#settings-current-password, #settings-new-password, #settings-confirm-password').evaluateAll((inputs) => inputs.every((input) => (input as HTMLInputElement).disabled && (input as HTMLInputElement).value === '')), true, 'refresh keeps every password input blank and locked');
  assert.equal(await notificationPage.getByRole('button', { name: '结果待核实', exact: true }).isDisabled(), true, 'refresh keeps the password submission locked');
  const recoveredPasswordMarker = await notificationPage.evaluate(() => {
    const raw = window.sessionStorage.getItem('xmt:desktop-password-change-recovery:v1:actor:91');
    return raw ? JSON.parse(raw) as { requestId: string } : null;
  });
  assert.equal(recoveredPasswordMarker?.requestId, pendingPasswordRecovery?.requestId, 'refresh restores the same password request marker');

  await notificationPage.getByRole('button', { name: '数据与备份', exact: true }).click();
  await notificationPage.getByRole('heading', { name: '数据与备份' }).waitFor();
  await notificationPage.getByText('xmt-settings-fixture.db', { exact: true }).waitFor();
  assert.equal(backupListRequests, 1, 'opening the settings backup tab loads one isolated inventory list');
  failNextBackupListRead = '隔离备份清单暂时无法读取';
  backupCreateDelayMs = 160;
  backupListDelayMs = 160;
  await notificationPage.getByRole('button', { name: '创建备份', exact: true }).dblclick();
  await notificationPage.getByText('服务端已确认创建备份 xmt-settings-created-fixture.db，', { exact: false }).waitFor();
  backupCreateDelayMs = 0;
  backupListDelayMs = 0;
  assert.equal(backupCreateRequests, 1, 'rapid repeated backup creation sends one request');
  const backupListRetry = notificationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/backup/list') && response.status() === 200);
  await notificationPage.getByRole('button', { name: '重试', exact: true }).click();
  await backupListRetry;
  await notificationPage.getByText('xmt-settings-created-fixture.db', { exact: true }).waitFor();
  assert.equal(backupCreateRequests, 1, 'backup list retry does not repeat the confirmed create request');
  assert.equal(backupListRequests, 3, 'backup list recovery performs only one read after the initial load and failed refresh');

  const fixtureBackupName = 'xmt-settings-fixture.db';
  await notificationPage.getByRole('button', { name: `删除备份 ${fixtureBackupName}` }).click();
  await notificationPage.getByRole('heading', { name: '确认删除备份？' }).waitFor();
  await notificationPage.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(backupDeleteRequests, 0, 'cancelling backup confirmation performs no delete');
  await notificationPage.getByRole('button', { name: `删除备份 ${fixtureBackupName}` }).click();
  failNextBackupDelete = '隔离备份删除暂时失败';
  failNextBackupListRead = '隔离删除状态核实暂时无法读取';
  backupDeleteDelayMs = 160;
  const failedDeleteVerification = notificationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/backup/list') && response.status() === 503);
  await notificationPage.getByRole('button', { name: '删除备份', exact: true }).dblclick();
  await failedDeleteVerification;
  await notificationPage.getByText(/删除结果仍待核实；暂时无法读取备份清单/).waitFor();
  backupDeleteDelayMs = 0;
  assert.equal(backupDeleteRequests, 1, 'double confirmation while a delete is pending sends one request');
  assert.equal(await notificationPage.locator(`button[aria-label="删除备份 ${fixtureBackupName}"]`).count(), 0, 'a failed verification hides the stale list rather than presenting it as current');
  assert.equal(await notificationPage.getByRole('heading', { name: '确认删除备份？' }).count(), 0, 'failed status verification closes the destructive confirmation until a read-only check succeeds');
  const storedDeleteRecovery = await notificationPage.evaluate(() => Object.entries(sessionStorage)
    .find(([key]) => key.startsWith('xmt:backup-delete-pending:v1:actor:91:'))?.[1] || null);
  assert.deepEqual(JSON.parse(storedDeleteRecovery || 'null'), { version: 1, actorId: 91, name: fixtureBackupName }, 'the unresolved delete marker is persisted by actor and backup filename');
  const backupRequestsDuringRestore: string[] = [];
  notificationPage.on('request', (request) => {
    if (request.url().includes('/api/backup/')) backupRequestsDuringRestore.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  const restoredDeleteVerification = notificationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/backup/list') && response.status() === 200);
  await notificationPage.reload();
  await restoredDeleteVerification;
  await notificationPage.getByRole('heading', { name: '确认删除备份？' }).waitFor();
  assert.deepEqual(backupRequestsDuringRestore, ['GET /api/backup/list'], 'refresh performs the read-only backup-list verification before any delete');
  assert.equal(backupDeleteRequests, 1, 'refresh recovery never automatically resends the unresolved delete');
  assert.equal(await notificationPage.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith('xmt:backup-delete-pending:v1:actor:91:'))), false, 'a successful list read clears the recovery marker after confirming the backup still exists');
  // The open destructive confirmation makes the background alert aria-hidden; inspect its DOM text directly.
  assert.match(await notificationPage.locator('[role="alert"]').innerText(), /仍在当前清单中/);

  failNextBackupListRead = '隔离删除后的备份清单暂时无法读取';
  backupDeleteDelayMs = 160;
  backupListDelayMs = 160;
  const backupDeleteRetry = notificationPage.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith(`/api/backup/${fixtureBackupName}`) && response.status() === 200);
  const backupDeleteRefreshFailure = notificationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/backup/list') && response.status() === 503);
  await notificationPage.getByRole('button', { name: '删除备份', exact: true }).click();
  await Promise.all([backupDeleteRetry, backupDeleteRefreshFailure]);
  backupDeleteDelayMs = 0;
  backupListDelayMs = 0;
  await notificationPage.getByText('服务端已确认删除备份 xmt-settings-fixture.db，', { exact: false }).waitFor();
  assert.equal(backupDeleteRequests, 2, 'one failed delete and one explicit retry are recorded');
  assert.equal(await notificationPage.getByRole('heading', { name: '确认删除备份？' }).count(), 0, 'confirmed backup deletion closes the confirmation before list recovery');
  assert.equal(await notificationPage.getByText('xmt-settings-fixture.db', { exact: true }).count(), 0, 'confirmed backup deletion removes the current row before the read-only refresh');
  const confirmedBackupListRetry = notificationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/backup/list') && response.status() === 200);
  await notificationPage.getByRole('button', { name: '重试', exact: true }).click();
  await confirmedBackupListRetry;
  await notificationPage.getByText('暂无备份记录。', { exact: true }).count().then((count) => assert.equal(count, 0, 'the remaining confirmed fixture backup is still present'));
  assert.equal(backupDeleteRequests, 2, 'read-only backup list retry does not issue another delete');
  assert.equal(backupListRequests, 7, 'delete verification and read-only recovery use only the expected list requests');
  assert.equal(settingsBackups.some((backup) => backup.name === fixtureBackupName), false, 'the fixture confirms the requested backup is removed');
  settingsBackups.push({ name: 'xmt-settings-lost-response-fixture.db', size: 3072, created: '2026-10-09T00:02:00.000Z' });
  const refreshedFixtureList = notificationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/backup/list') && response.status() === 200);
  await notificationPage.getByRole('button', { name: '刷新列表', exact: true }).click();
  await refreshedFixtureList;
  await notificationPage.getByRole('button', { name: '删除备份 xmt-settings-lost-response-fixture.db' }).click();
  dropNextBackupDeleteResponseAfterCommit = true;
  const lostDeleteVerification = notificationPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/backup/list') && response.status() === 200);
  await notificationPage.getByRole('button', { name: '删除备份', exact: true }).click();
  await lostDeleteVerification;
  await notificationPage.getByText(/已核实：当前备份清单中不存在 xmt-settings-lost-response-fixture.db/).waitFor();
  assert.equal(backupDeleteRequests, 3, 'a committed delete with a lost response is submitted once and recovered with GET');
  assert.equal(settingsBackups.some((backup) => backup.name === 'xmt-settings-lost-response-fixture.db'), false, 'the isolated fixture commits the delete before its response is withheld');
  assert.equal(await notificationPage.getByRole('heading', { name: '确认删除备份？' }).count(), 0, 'confirmed absence closes the stale destructive confirmation');
  assert.equal(await notificationPage.getByText('xmt-settings-lost-response-fixture.db', { exact: true }).count(), 0, 'the read-back list removes the backup after response loss');
  assert.equal(expectedBackupDeleteRequestFailures.length, 1, 'the committed delete response is withheld exactly once in the isolated browser fixture');
  assert.equal(expectedBackupDeleteConsoleErrors.length, 1, 'the only backup network console error is the intentional response-loss fixture');
  assert.equal(backupListRequests, 9, 'response-loss recovery uses one list GET and does not repeat DELETE');
  assert.equal(expectedHttpErrors.length, 14, 'system, notification, profile, and backup fixtures produce the expected isolated HTTP error responses');
  assert.deepEqual(errors, [], 'notification preference feedback has no browser runtime or unexpected console errors');
  await notificationPage.goto(`${base}/__qa?theme=dark`);
  await notificationPage.getByRole('button', { name: '通知偏好', exact: true }).click();
  await assertRenderedSettingsPage(notificationPage);
  await notificationPage.getByRole('heading', { name: '通知偏好', exact: true }).waitFor();
  await notificationPage.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const darkDivider = await notificationPage.locator('table tbody').evaluate((element) => ({
    width: getComputedStyle(element).borderTopWidth,
    color: getComputedStyle(element).borderTopColor,
    token: getComputedStyle(document.documentElement).getPropertyValue('--xmt-border-soft'),
  }));
  assert.equal(darkDivider.width, '1px', 'notification preferences retain a visible section divider in the dark theme');
  assert.deepEqual(parseColor(darkDivider.color)?.slice(0, 3), parseColor(darkDivider.token)?.slice(0, 3), 'dark-theme divider resolves to the Studio border token');
  await notificationPage.setViewportSize({ width: 320, height: 844 });
  assert(await notificationPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), '320px dark notification settings have no horizontal page overflow');
  assert.equal(await notificationPreferenceToggle.evaluate((element) => getComputedStyle(element).whiteSpace), 'nowrap', '320px dark notification state remains on one readable line');
  for (const label of ['审核结果', '选题审核完成时提醒']) {
    const text = notificationPage.getByText(label, { exact: true }).first();
    const ratio = await composedTextContrastRatio(text);
    assert(ratio >= 4.5, `dark-theme notification text "${label}" contrast=${ratio.toFixed(2)} expected>=4.5`);
  }
  for (const label of ['我的设置', '系统管理', '产品信息']) {
    const heading = notificationPage.getByRole('heading', { name: label, exact: true });
    const ratio = await composedTextContrastRatio(heading);
    assert(ratio >= 4.5, `dark-theme settings group heading "${label}" contrast=${ratio.toFixed(2)} expected>=4.5`);
  }
  await notificationPage.screenshot({ path: '/tmp/xmt-notification-settings-320-dark.png', fullPage: true });
  await notificationPage.getByRole('button', { name: '外观与动效', exact: true }).click();
  await notificationPage.getByRole('heading', { name: '外观与动效', exact: true }).waitFor();
  const appearanceTheme = notificationPage.getByRole('combobox', { name: '主题', exact: true });
  await notificationPage.locator('details').filter({ hasText: '高级设置' }).locator('summary').click();
  await notificationPage.getByRole('combobox', { name: '标题文本动画', exact: true }).selectOption('gradient-text');
  await notificationPage.getByRole('combobox', { name: '动效强度', exact: true }).selectOption('balanced');
  for (const theme of ['dark', 'light'] as const) {
    await appearanceTheme.selectOption(theme);
    const preview = notificationPage.locator(`[data-reactbits-scene="home"][data-theme="${theme}"]`);
    const gradientText = preview.locator('.reactbits-text-safe .text-transparent.bg-clip-text').first();
    await gradientText.waitFor({ state: 'visible' });
    const gradient = await gradientText.evaluate((element) => {
      const scope = element.closest('.xmt-theme-scope');
      if (!scope) throw new Error('gradient preview has no Studio theme scope');
      const probe = document.createElement('span');
      scope.append(probe);
      const tokenColors = ['--xmt-primary-contrast', '--xmt-cyan-contrast', '--xmt-violet-contrast'].map((token) => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      });
      probe.remove();
      return {
        authored: (element as HTMLElement).style.backgroundImage,
        computed: getComputedStyle(element).backgroundImage,
        tokenColors,
      };
    });
    assert(['--xmt-primary-contrast', '--xmt-cyan-contrast', '--xmt-violet-contrast'].every((token) => gradient.authored.includes(`var(${token})`)), `${theme} animated heading is authored with Studio color variables`);
    assert(gradient.computed.startsWith('linear-gradient(') && gradient.tokenColors.every((color) => gradient.computed.includes(color)), `${theme} animated heading resolves to the active Studio theme tokens`);
    await gradientText.screenshot({ path: `/tmp/xmt-reactbits-gradient-text-320-${theme}.png` });
  }
  await notificationPage.getByRole('combobox', { name: '动效强度', exact: true }).selectOption('off');
  for (const theme of ['dark', 'light'] as const) {
    await appearanceTheme.selectOption(theme);
    const preview = notificationPage.locator(`[data-reactbits-scene="home"][data-theme="${theme}"]`);
    await preview.waitFor({ state: 'visible' });
    const colors = await preview.evaluate((element) => {
      const computed = getComputedStyle(element);
      const probe = document.createElement('div');
      document.body.append(probe);
      probe.style.backgroundColor = computed.getPropertyValue('--xmt-app-bg').trim();
      const tokenBackground = getComputedStyle(probe).backgroundColor;
      probe.style.backgroundColor = 'transparent';
      probe.style.color = computed.getPropertyValue('--xmt-text-primary').trim();
      const tokenText = getComputedStyle(probe).color;
      probe.style.border = `1px solid ${computed.getPropertyValue('--xmt-border-soft').trim()}`;
      const tokenBorder = getComputedStyle(probe).borderTopColor;
      probe.style.border = '0';
      probe.style.color = computed.getPropertyValue('--xmt-cyan-contrast').trim();
      const tokenLabel = getComputedStyle(probe).color;
      probe.remove();
      const label = element.querySelector('[class*="tracking-wider"]');
      return {
        background: computed.backgroundColor,
        tokenBackground,
        text: computed.color,
        tokenText,
        border: computed.borderTopColor,
        tokenBorder,
        label: label ? getComputedStyle(label).color : null,
        tokenLabel,
      };
    });
    assert.equal(colors.background, colors.tokenBackground, `${theme} appearance preview background uses its Studio theme token`);
    assert.equal(colors.text, colors.tokenText, `${theme} appearance preview text uses its Studio theme token`);
    assert.equal(colors.border, colors.tokenBorder, `${theme} appearance preview border uses its Studio theme token`);
    assert.equal(colors.label, colors.tokenLabel, `${theme} appearance preview label uses its Studio contrast token`);
    const previewMetricLabel = preview.getByText('今日内容生产指数', { exact: true });
    await previewMetricLabel.scrollIntoViewIfNeeded();
    await previewMetricLabel.waitFor({ state: 'visible' });
    assert.equal(await previewMetricLabel.isVisible(), true, `${theme} appearance preview card is visible after entering the preview`);
    assert.equal(await preview.getByText('86', { exact: true }).isVisible(), true, `${theme} appearance preview metric reaches its final value`);
    assert(await notificationPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `320px ${theme} appearance preview has no horizontal overflow`);
    if (theme === 'dark') await preview.screenshot({ path: '/tmp/xmt-reactbits-appearance-preview-320-dark.png' });
  }
  assert.equal(await notificationPage.evaluate(() => localStorage.getItem('xmt_reactbits_appearance_v1')), null, 'preview-only theme and motion changes do not save personal appearance preferences');
  const compatibilityMatrix = notificationPage.getByTestId('reactbits-compatibility-matrix');
  for (const theme of ['dark', 'light'] as const) {
    const themeSurface = compatibilityMatrix.locator(`:scope > div[data-theme="${theme}"]`);
    const tokens = await themeSurface.evaluate((element) => {
      const computed = getComputedStyle(element);
      const probe = document.createElement('div');
      document.body.append(probe);
      probe.style.backgroundColor = computed.getPropertyValue('--xmt-app-bg').trim();
      const tokenBackground = getComputedStyle(probe).backgroundColor;
      probe.style.color = computed.getPropertyValue('--xmt-text-primary').trim();
      const tokenText = getComputedStyle(probe).color;
      probe.style.border = `1px solid ${computed.getPropertyValue('--xmt-border-soft').trim()}`;
      const tokenBorder = getComputedStyle(probe).borderTopColor;
      probe.remove();
      const border = element.querySelector('.border-studio-border-soft');
      return {
        background: computed.backgroundColor,
        tokenBackground,
        text: computed.color,
        tokenText,
        border: border ? getComputedStyle(border).borderTopColor : null,
        tokenBorder,
      };
    });
    assert.equal(tokens.background, tokens.tokenBackground, `${theme} development matrix background uses its Studio theme token`);
    assert.equal(tokens.text, tokens.tokenText, `${theme} development matrix text uses its Studio theme token`);
    assert.equal(tokens.border, tokens.tokenBorder, `${theme} development matrix card border uses its Studio theme token`);
    const matrixLabel = themeSurface.locator('.text-xs.text-studio-text-secondary').first();
    assert((await composedTextContrastRatio(matrixLabel)) >= 4.5, `${theme} development matrix label meets 4.5:1 contrast`);

    const aiButton = themeSurface.getByRole('button', { name: 'standard-none-ai' });
    assert((await aiButton.getAttribute('class'))?.includes('bg-studio-violet/10'), `${theme} AI button uses the semantic Studio violet surface`);
    const aiColors = await aiButton.evaluate((element) => {
      const scope = element.closest('.xmt-theme-scope');
      if (!scope) throw new Error('AI preview button has no Studio theme scope');
      const probe = document.createElement('span');
      scope.append(probe);
      probe.style.color = 'var(--xmt-violet-contrast)';
      const foregroundToken = getComputedStyle(probe).color;
      probe.remove();
      return { foreground: getComputedStyle(element).color, foregroundToken };
    });
    assert.equal(aiColors.foreground, aiColors.foregroundToken, `${theme} AI button foreground resolves to the active Studio contrast token`);
    assert((await composedTextContrastRatio(aiButton)) >= 4.5, `${theme} AI button text meets 4.5:1 contrast`);
    const expectedPrimaryColor = await themeSurface.evaluate((element) => {
      const probe = document.createElement('span');
      element.append(probe);
      probe.style.color = 'var(--xmt-primary)';
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    });

    const borderGlowButton = themeSurface.getByRole('button', { name: 'border-glow-none-primary' });
    const borderGlowStyle = await borderGlowButton.evaluate((element) => {
      const shell = element.closest('div.relative.grid.isolate');
      return shell && [...shell.querySelectorAll<HTMLElement>('*')].map((child) => child.style.boxShadow).find(Boolean);
    });
    assert(borderGlowStyle?.includes('var(--xmt-primary)'), `${theme} border glow uses the scoped Studio primary token`);
    await borderGlowButton.hover();
    const borderGlowComputed = await borderGlowButton.evaluate((element) => {
      const shell = element.closest('div.relative.grid.isolate');
      const shadow = shell && [...shell.querySelectorAll<HTMLElement>('*')].find((child) => child.style.boxShadow);
      return shadow ? getComputedStyle(shadow).boxShadow : 'none';
    });
    assert.notEqual(borderGlowComputed, 'none', `${theme} border glow produces a valid computed shadow on hover`);

    const starBorderButton = themeSurface.getByRole('button', { name: 'star-border-none-primary' });
    const starBorderLine = starBorderButton.locator('span[aria-hidden="true"]').last();
    const starBorderStyle = await starBorderLine.getAttribute('style');
    assert(starBorderStyle?.includes('var(--xmt-primary)'), `${theme} star border uses the scoped Studio primary token`);
    assert.equal(await starBorderLine.evaluate((element) => getComputedStyle(element).borderTopColor), expectedPrimaryColor, `${theme} star border resolves the active Studio primary token`);

    const electricBorderButton = themeSurface.getByRole('button', { name: 'electric-border-none-primary' });
    const electricBorderColor = await electricBorderButton.evaluate((element) => {
      const canvas = element.closest('div[style*="--electric-border-color"]')?.querySelector('canvas');
      return canvas ? getComputedStyle(canvas).color : null;
    });
    assert.equal(electricBorderColor, expectedPrimaryColor, `${theme} electric border canvas resolves the active Studio primary token`);

    const glareButton = themeSurface.getByRole('button', { name: 'standard-glare-hover-primary' });
    const glareStyle = await glareButton.evaluate((element) => {
      const shell = element.closest('div.place-items-center.overflow-hidden');
      return shell?.firstElementChild?.getAttribute('style');
    });
    assert(glareStyle?.includes('var(--xmt-primary)') && glareStyle.includes('background-image: linear-gradient('), `${theme} hover glare uses the scoped Studio token with alpha`);
    await glareButton.hover();
    const glareComputed = await glareButton.evaluate((element) => {
      const shell = element.closest('div.place-items-center.overflow-hidden');
      return shell?.firstElementChild ? getComputedStyle(shell.firstElementChild).backgroundImage : '';
    });
    assert(glareComputed.includes(expectedPrimaryColor), `${theme} hover glare resolves to the active Studio primary token`);

    const clickSparkButton = themeSurface.getByRole('button', { name: 'standard-click-spark-primary' });
    const sparkCanvasColor = await clickSparkButton.evaluate((element) => {
      const canvas = element.parentElement?.querySelector(':scope > canvas');
      return canvas ? getComputedStyle(canvas).color : null;
    });
    const expectedSparkColor = await themeSurface.evaluate((element) => {
      const probe = document.createElement('span');
      element.append(probe);
      probe.style.color = 'var(--xmt-primary-contrast)';
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    });
    assert.equal(sparkCanvasColor, expectedSparkColor, `${theme} click spark canvas resolves the active Studio contrast token`);

    const surfaceCell = themeSurface.locator('div.min-w-0.rounded-lg').filter({ hasText: 'border-glow · none' });
    await surfaceCell.screenshot({ path: `/tmp/xmt-reactbits-button-border-glow-320-${theme}.png` });
  }
  await notificationPage.locator('[data-reactbits-scene="home"][data-theme="light"]').screenshot({ path: '/tmp/xmt-reactbits-appearance-preview-320-light.png' });
  await notificationContext.close();

  settings.branding.logo = '';
  settingsSaveRequests.length = 0;
  const brandingContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const brandingPage = await brandingContext.newPage();
  brandingPage.on('pageerror', (error) => errors.push(error.message));
  brandingPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  await brandingPage.goto(`${base}/__qa`);
  await brandingPage.getByRole('button', { name: '品牌设置', exact: true }).click();
  const logoInput = brandingPage.locator('input[type="file"]');
  await logoInput.setInputFiles({
    name: 'brand-logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64'),
  });
  await brandingPage.getByText('Logo 已选择', { exact: true }).waitFor();
  await brandingPage.getByText('当前仅更新本页预览；点击“保存品牌设置”后才会应用。', { exact: true }).waitFor();
  const logoPreview = brandingPage.locator('img[alt="系统 Logo"]');
  const previewSource = await logoPreview.getAttribute('src');
  assert.match(previewSource ?? '', /^data:image\/png;base64,/, 'selecting a logo creates a local preview');
  assert.equal(settings.branding.logo, '', 'choosing an image does not persist or upload the logo');
  assert.equal(await brandingPage.getByText('品牌设置已更新', { exact: true }).count(), 0, 'local selection is not reported as a saved brand setting');

  const brandReadsBeforeSave = systemSettingsReadRequests;
  failNextSettingsSave = { message: '品牌设置暂时无法保存，请重试。', status: 503, afterCommit: false };
  await brandingPage.getByRole('button', { name: '保存品牌设置', exact: true }).click();
  await brandingPage.getByText(/服务器当前系统设置与本次提交内容不同/).waitFor();
  assert.equal(settings.branding.logo, '', 'failed save leaves the persisted brand logo unchanged');
  assert.equal(await logoPreview.getAttribute('src'), previewSource, 'failed save keeps the selected preview available for retry');
  assert.equal(systemSettingsReadRequests, brandReadsBeforeSave + 1, 'the ambiguous brand save uses one read-only verification');
  assert.equal(await brandingPage.getByRole('button', { name: '保存品牌设置', exact: true }).isDisabled(), true, 'ordinary branding save remains locked until the read-back conflict is resolved');
  settingsSaveDelayMs = 160;
  const brandSaveRetry = brandingPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/system-settings') && response.status() === 200);
  const pendingBrandSave = brandingPage.waitForRequest((request) => request.method() === 'PUT' && request.url().endsWith('/api/system-settings'));
  await brandingPage.getByRole('button', { name: '确认覆盖服务器设置', exact: true }).dblclick();
  await pendingBrandSave;
  assert.equal(await brandingPage.locator('input[type="text"]').first().isDisabled(), true, 'brand fields are locked while the server save is pending');
  assert.equal(await logoInput.isDisabled(), true, 'logo selection is locked while the server save is pending');
  assert.equal(await brandingPage.getByRole('button', { name: '保存品牌设置', exact: true }).isDisabled(), true, 'the save control remains locked while the request is pending');
  await brandSaveRetry;
  await brandingPage.getByText('品牌设置已更新', { exact: true }).waitFor();
  settingsSaveDelayMs = 0;
  assert.equal(settings.branding.logo, previewSource, 'logo is persisted only after the explicit save succeeds');
  assert.equal(settingsSaveRequests.length, 2, 'logo persistence uses one failed save and one request for a rapid double-click retry');
  assert.equal(expectedHttpErrors.length, 15, 'system, notification, profile, backup, and brand-save fixtures produce the expected isolated HTTP error responses');
  await brandingPage.reload();
  await brandingPage.getByRole('button', { name: '品牌设置', exact: true }).click();
  assert.equal(await brandingPage.locator('img[alt="系统 Logo"]').getAttribute('src'), previewSource, 'successful save persists the logo for the next visit');
  assert.deepEqual(errors, [], 'logo preview and retry flow has no browser runtime or unexpected console errors');
  await brandingContext.close();
  console.log('Brand logo browser test passed: selection stays local, failed save preserves preview, successful retry persists the logo.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
}
