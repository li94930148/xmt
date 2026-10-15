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
function parseColor(raw: string) {
  const channels = raw.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? channels.slice(0, 3) : null;
}
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
  const readColor = (value: string) => {
    const channels = value.match(/[\d.]+/g)?.map(Number) || [];
    return channels.length >= 3 ? [channels[0], channels[1], channels[2], channels[3] ?? 1] : null;
  };
  const foreground = readColor(colors.foreground);
  if (!foreground) return 0;
  const background = [255, 255, 255];
  for (const value of colors.backgrounds.reverse()) {
    const layer = readColor(value);
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
let failNextSettingsSave: string | null = null;
const settingsSaveRequests: unknown[] = [];
let notificationPreferences = [{ id: 1, channel: 'email', event_type: 'review', enabled: true }];
let failNextNotificationSave: string | null = null;
let notificationSaveDelayMs = 0;
let notificationSaveRequests = 0;
let profile = { ...admin };
let failNextProfileSave: string | null = null;
let profileSaveDelayMs = 0;
let profileSaveRequests = 0;
let failNextPasswordChange: string | null = null;
let passwordChangeDelayMs = 0;
let passwordChangeRequests = 0;
let passwordChangeSucceeded = false;
let settingsBackups = [{ name: 'xmt-settings-fixture.db', size: 1024, created: '2026-10-09T00:00:00.000Z' }];
let backupListRequests = 0;
let backupCreateRequests = 0;
let backupDeleteRequests = 0;
let failNextBackupListRead: string | null = null;
let failNextBackupDelete: string | null = null;
let backupListDelayMs = 0;
let backupCreateDelayMs = 0;
let backupDeleteDelayMs = 0;
const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const preference = typeof req.query.theme === 'string' ? `localStorage.setItem('xmt_theme',${JSON.stringify(req.query.theme)});` : "localStorage.removeItem('xmt_theme');";
  res.type('html').send(`<script>${preference}localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(admin))});localStorage.setItem('xmt_token','settings-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/notification-settings');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(profile));
app.put('/api/auth/profile', async (req, res) => {
  profileSaveRequests += 1;
  if (profileSaveDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, profileSaveDelayMs));
  if (failNextProfileSave) {
    const message = failNextProfileSave;
    failNextProfileSave = null;
    res.status(503).json({ message });
    return;
  }
  profile = { ...profile, name: req.body?.name, email: req.body?.email };
  res.json(profile);
});
app.post('/api/auth/change-password', async (_req, res) => {
  passwordChangeRequests += 1;
  if (passwordChangeDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, passwordChangeDelayMs));
  if (failNextPasswordChange) {
    const message = failNextPasswordChange;
    failNextPasswordChange = null;
    res.status(503).json({ message });
    return;
  }
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
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({ ...settings, version }));
app.put('/api/system-settings', (req, res) => {
  settingsSaveRequests.push(req.body);
  if (failNextSettingsSave) {
    const message = failNextSettingsSave;
    failNextSettingsSave = null;
    res.status(503).json({ message });
    return;
  }
  settings = {
    ...settings,
    system: { ...settings.system, ...(req.body?.system ?? {}) },
    branding: { ...settings.branding, ...(req.body?.branding ?? {}) },
    login: { ...settings.login, ...(req.body?.login ?? {}) },
  };
  res.json({ ...settings, version });
});
app.get('/api/notifications/preferences', (_req, res) => res.json(notificationPreferences));
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
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  await page.goto(`${base}/__qa`);
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.getByRole('button', { name: '系统设置', exact: true }).click();
  await page.getByRole('combobox', { name: '默认主题' }).selectOption('light');
  await page.getByRole('button', { name: '保存系统设置', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.getByText('系统设置已更新', { exact: true }).waitFor();
  assert.equal(settings.system.defaultTheme, 'light', 'admin save persists through the isolated settings endpoint');
  assert.equal(await page.evaluate(() => localStorage.getItem('xmt_theme')), null, 'applying the system default does not create a personal preference');
  await page.screenshot({ path: '/tmp/xmt-system-default-theme-1440.png', fullPage: true });

  await page.getByRole('combobox', { name: '默认主题' }).selectOption('dark');
  failNextSettingsSave = '系统设置暂时无法保存，请重试。';
  await page.getByRole('button', { name: '保存系统设置', exact: true }).click();
  await page.getByText('系统设置暂时无法保存，请重试。', { exact: true }).waitFor();
  assert.equal(settings.system.defaultTheme, 'light', 'a failed settings save does not mutate the isolated persisted value');
  assert.equal(expectedHttpErrors.length, 1, 'the isolated failure fixture returns exactly one intentional 503 response');

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.equal(await page.evaluate(() => localStorage.getItem('xmt_theme')), null, 'the system default remains effective after reload without persisting as a personal choice');
  await page.getByRole('button', { name: '关于系统', exact: true }).click();
  assert.ok(await contrastRatio(page.getByTestId('about-brand-mark')) >= 4.5, 'light-theme about-page brand mark has accessible contrast');

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
  await preferencePage.screenshot({ path: '/tmp/xmt-system-default-theme-390.png' });

  await preferencePage.goto(`${base}/__qa?theme=dark`);
  await preferencePage.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await assertMobileShellTextContrast(preferencePage, 'dark');
  assert.equal(await preferencePage.evaluate(() => localStorage.getItem('xmt_theme')), 'dark', 'system default never overwrites an explicit personal choice');
  assert(await preferencePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'mobile-width settings surface has no horizontal overflow');
  await preferencePage.screenshot({ path: '/tmp/xmt-system-default-theme-390-preference.png', fullPage: true });
  await preferencePage.setViewportSize({ width: 1440, height: 960 });
  await preferencePage.getByRole('button', { name: '关于系统', exact: true }).click();
  assert.ok(await contrastRatio(preferencePage.getByTestId('about-brand-mark')) >= 4.5, 'dark-theme about-page brand mark has accessible contrast');
  assert.deepEqual(errors, [], 'no browser runtime or console errors');
  await preferenceContext.close();
  console.log('System default theme browser test passed: admin save → live/reload default → explicit local preference precedence; 1440/390px.');

  const notificationContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const notificationPage = await notificationContext.newPage();
  notificationPage.on('pageerror', (error) => errors.push(error.message));
  notificationPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  await notificationPage.goto(`${base}/__qa`);
  await notificationPage.getByRole('button', { name: '通知偏好', exact: true }).click();
  await assertRenderedSettingsPage(notificationPage);
  await notificationPage.getByRole('heading', { name: '通知偏好', exact: true }).waitFor();
  await notificationPage.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await notificationPage.screenshot({ path: '/tmp/xmt-notification-settings-1440-light.png', fullPage: true });
  const lightDivider = await notificationPage.locator('table tbody').evaluate((element) => ({
    width: getComputedStyle(element).borderTopWidth,
    color: getComputedStyle(element).borderTopColor,
    token: getComputedStyle(document.documentElement).getPropertyValue('--xmt-border-soft'),
  }));
  assert.equal(lightDivider.width, '1px', 'notification preferences retain a visible section divider in the light theme');
  assert.deepEqual(parseColor(lightDivider.color)?.slice(0, 3), parseColor(lightDivider.token)?.slice(0, 3), 'light-theme divider resolves to the Studio border token rather than white opacity');
  assert.equal(await notificationPage.getByRole('button', { name: '已启用', exact: true }).count(), 1, 'fixture starts with an enabled notification preference');
  for (const width of [390, 320]) {
    await notificationPage.setViewportSize({ width, height: 844 });
    assert(await notificationPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${width}px notification settings have no horizontal page overflow`);
    const saveButton = notificationPage.getByRole('button', { name: '保存设置', exact: true });
    await saveButton.scrollIntoViewIfNeeded();
    const saveBounds = await saveButton.boundingBox();
    assert(saveBounds && saveBounds.width > 0 && saveBounds.x >= 0 && saveBounds.x + saveBounds.width <= width + 1, `${width}px save action remains within the viewport`);
    const statusToggle = notificationPage.getByRole('button', { name: '已启用', exact: true });
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
  await notificationPage.getByRole('button', { name: '已启用', exact: true }).click();
  assert.equal(await notificationPage.getByRole('button', { name: '已关闭', exact: true }).count(), 1, 'preference change is visible before save');
  failNextNotificationSave = '通知偏好暂时无法保存，请重试。';
  await notificationPage.getByRole('button', { name: '保存设置', exact: true }).click();
  await notificationPage.getByText('通知偏好暂时无法保存，请重试。', { exact: true }).waitFor();
  assert.equal(notificationPreferences[0].enabled, true, 'failed save leaves the persisted notification preference unchanged');
  assert.equal(await notificationPage.getByRole('button', { name: '已关闭', exact: true }).count(), 1, 'failed save keeps the requested preference available for retry');
  await notificationPage.getByRole('button', { name: '保存设置', exact: true }).click();
  await notificationPage.getByText('通知偏好已更新', { exact: true }).waitFor();
  assert.equal(notificationPreferences[0].enabled, false, 'explicit retry persists the changed notification preference');
  await notificationPage.getByRole('button', { name: '已关闭', exact: true }).click();
  notificationSaveDelayMs = 160;
  const repeatedNotificationSave = notificationPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/notifications/preferences') && response.status() === 200);
  await notificationPage.getByRole('button', { name: '保存设置', exact: true }).dblclick();
  await repeatedNotificationSave;
  await notificationPage.getByText('通知偏好已更新', { exact: true }).waitFor();
  notificationSaveDelayMs = 0;
  assert.equal(notificationPreferences[0].enabled, true, 'a repeated notification save persists the selected value');
  assert.equal(notificationSaveRequests, 3, 'failed attempt, explicit retry, and rapid double click issue only three total saves');

  await notificationPage.getByRole('button', { name: '个人资料', exact: true }).click();
  const profileInputs = notificationPage.locator('input');
  await profileInputs.nth(0).fill('资料重试验收');
  await profileInputs.nth(1).fill('profile-retry@example.test');
  failNextProfileSave = '个人资料暂时无法保存，请重试。';
  profileSaveDelayMs = 160;
  await notificationPage.getByRole('button', { name: '保存个人资料', exact: true }).dblclick();
  await notificationPage.getByText('个人资料暂时无法保存，请重试。', { exact: true }).waitFor();
  profileSaveDelayMs = 0;
  assert.equal(profileSaveRequests, 1, 'rapid repeated profile submission sends one request');
  assert.equal(profile.name, admin.name, 'a failed profile save leaves the persisted profile unchanged');
  assert.equal(await profileInputs.nth(0).inputValue(), '资料重试验收', 'failed profile input is retained for retry');
  assert.equal(await profileInputs.nth(1).inputValue(), 'profile-retry@example.test', 'failed profile email is retained for retry');
  await notificationPage.getByRole('button', { name: '保存个人资料', exact: true }).click();
  await notificationPage.getByText('个人资料已更新', { exact: true }).waitFor();
  assert.equal(profile.name, '资料重试验收', 'explicit profile retry persists the edited name');
  assert.equal(profileSaveRequests, 2, 'profile retry sends exactly one additional update');

  await notificationPage.getByRole('button', { name: '账号安全', exact: true }).click();
  const passwordInputs = notificationPage.locator('input[type="password"]');
  await passwordInputs.nth(0).fill('current-pass');
  await passwordInputs.nth(1).fill('updated-pass');
  await passwordInputs.nth(2).fill('updated-pass');
  failNextPasswordChange = '密码服务暂时无法使用，请重试。';
  passwordChangeDelayMs = 160;
  await notificationPage.getByRole('button', { name: '更新密码', exact: true }).dblclick();
  await notificationPage.getByText('密码服务暂时无法使用，请重试。', { exact: true }).waitFor();
  passwordChangeDelayMs = 0;
  assert.equal(passwordChangeRequests, 1, 'rapid repeated password submission sends one request');
  assert.equal(passwordChangeSucceeded, false, 'a failed password request is not reported as a successful change');
  assert.deepEqual(await passwordInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)), ['current-pass', 'updated-pass', 'updated-pass'], 'failed password input is retained for retry');
  await notificationPage.getByRole('button', { name: '更新密码', exact: true }).click();
  await notificationPage.getByText('密码已更新', { exact: true }).waitFor();
  assert.equal(passwordChangeRequests, 2, 'password retry sends exactly one additional request');
  assert.equal(passwordChangeSucceeded, true, 'the explicit retry completes the password change');
  assert.deepEqual(await passwordInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)), ['', '', ''], 'password fields clear only after confirmed success');

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
  backupDeleteDelayMs = 160;
  await notificationPage.getByRole('button', { name: '删除备份', exact: true }).dblclick();
  await notificationPage.getByText('删除失败', { exact: true }).first().waitFor();
  backupDeleteDelayMs = 0;
  assert.equal(backupDeleteRequests, 1, 'double confirmation while a delete is pending sends one request');
  assert.equal(await notificationPage.getByRole('button', { name: `删除备份 ${fixtureBackupName}` }).count(), 1, 'failed backup delete keeps the file in the list');
  assert.equal(await notificationPage.getByRole('heading', { name: '确认删除备份？' }).count(), 1, 'failed backup delete keeps its confirmation available for explicit retry');

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
  assert.equal(backupListRequests, 5, 'delete confirmation and read-only recovery use only the expected list requests');
  assert.equal(settingsBackups.some((backup) => backup.name === fixtureBackupName), false, 'the fixture confirms the requested backup is removed');
  assert.equal(expectedHttpErrors.length, 7, 'system, notification, profile, password, backup create refresh, failed delete, and delete refresh fixtures each produce one intentional 503');
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
  assert.equal(await notificationPage.getByRole('button', { name: '已启用', exact: true }).evaluate((element) => getComputedStyle(element).whiteSpace), 'nowrap', '320px dark notification state remains on one readable line');
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

  failNextSettingsSave = '品牌设置暂时无法保存，请重试。';
  await brandingPage.getByRole('button', { name: '保存品牌设置', exact: true }).click();
  await brandingPage.getByText('品牌设置暂时无法保存，请重试。', { exact: true }).waitFor();
  assert.equal(settings.branding.logo, '', 'failed save leaves the persisted brand logo unchanged');
  assert.equal(await logoPreview.getAttribute('src'), previewSource, 'failed save keeps the selected preview available for retry');
  await brandingPage.getByRole('button', { name: '保存品牌设置', exact: true }).click();
  await brandingPage.getByText('品牌设置已更新', { exact: true }).waitFor();
  assert.equal(settings.branding.logo, previewSource, 'logo is persisted only after the explicit save succeeds');
  assert.equal(settingsSaveRequests.length, 2, 'logo persistence uses one failed save and one explicit retry');
  assert.equal(expectedHttpErrors.length, 8, 'system, notification, profile, password, backup create/list/delete, and brand-save failures each produce one intentional fixture 503');
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
