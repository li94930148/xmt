import { test, type Page } from 'playwright/test';

const baseUrl = process.env.XMT_E2E_BASE_URL || 'http://localhost:5174';
const username = process.env.XMT_E2E_USERNAME;
const password = process.env.XMT_E2E_PASSWORD;

type Theme = 'dark' | 'light';
type MotionMode = 'off' | 'reduced' | 'balanced' | 'full';
type PresetId = 'aurora' | 'deep-space' | 'silk' | 'linear' | 'minimal' | 'custom';
type AppearanceState = { theme: Theme; fontSize: string; presetId: PresetId; applyToAnalytics: boolean; motionMode: MotionMode };
type CanvasAudit = { activeCanvas: number; ownerUnknown: number; interactionCanvas: number };

const presetNames: Record<PresetId, string> = {
  aurora: '岚曜极光',
  'deep-space': '深空科技',
  silk: '丝绸创意',
  linear: '线性协作',
  minimal: '极简无扰',
  custom: '自由搭配',
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function settingsMain(page: Page) {
  return page.locator('main.xmt-business-content');
}

function appearancePanel(page: Page) {
  return settingsMain(page).getByRole('heading', { name: '外观与动效', exact: true }).locator('xpath=../..');
}

async function dismissSystemUpdateDialog(page: Page) {
  const updateDialog = page.locator('div.fixed.inset-0').filter({
    has: page.getByText('系统更新', { exact: true }),
  }).filter({
    has: page.getByRole('button', { name: '我知道了', exact: true }),
  }).filter({
    has: page.getByRole('button', { name: '查看完整更新日志', exact: true }),
  });
  const acknowledgement = updateDialog.getByRole('button', { name: '我知道了', exact: true });
  await acknowledgement.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => undefined);
  if (await acknowledgement.isVisible().catch(() => false)) {
    await acknowledgement.click();
    await updateDialog.waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

async function openCommandPalette(page: Page) {
  await page.keyboard.press('Meta+k');
  await page.locator('input[placeholder="搜索选题、页面、用户..."]').waitFor({ state: 'visible', timeout: 5_000 });
}

async function openAppearanceSettings(page: Page) {
  await openCommandPalette(page);
  const settingsCommand = page.getByRole('button', { name: '设置中心', exact: true });
  assert(await settingsCommand.count() === 1, 'Settings command is not uniquely available');
  await settingsCommand.click();
  await dismissSystemUpdateDialog(page);

  const heading = settingsMain(page).getByRole('heading', { name: '设置中心', exact: true });
  await heading.waitFor({ state: 'attached', timeout: 15_000 });
  await heading.waitFor({ state: 'visible', timeout: 15_000 });
  const root = settingsMain(page).locator('div.mx-auto.w-full.max-w-7xl');
  assert(await root.count() === 1, 'Settings root is not stable and unique');
  await root.waitFor({ state: 'visible', timeout: 10_000 });
  const navigationHost = root.locator('div.flex.flex-col.gap-6.lg\\:flex-row > div.w-full.flex-shrink-0');
  assert(await navigationHost.count() === 1, 'Settings left navigation host is not stable and unique');
  await navigationHost.waitFor({ state: 'visible', timeout: 10_000 });
  const appearanceButton = navigationHost.getByRole('button', { name: '外观与动效', exact: true });
  assert(await appearanceButton.count() === 1, 'Appearance navigation button is not uniquely available');
  await dismissSystemUpdateDialog(page);
  const updateOverlay = page.locator('div.fixed.inset-0').filter({ has: page.getByText('系统更新', { exact: true }) });
  assert(await updateOverlay.count() === 0 || await updateOverlay.isHidden(), 'UpdateNotification overlay is still visible');
  await appearanceButton.click();
  const panel = appearancePanel(page);
  await panel.waitFor({ state: 'visible', timeout: 10_000 });
  return panel;
}

function motionControl(page: Page) {
  return appearancePanel(page).locator('label').filter({ hasText: '动效强度' }).getByRole('combobox');
}

function themeControl(page: Page) {
  return appearancePanel(page).locator('select:has(option[value="light"]):has(option[value="dark"])');
}

async function readAppearanceState(page: Page): Promise<AppearanceState> {
  const theme = await themeControl(page).inputValue() as Theme;
  const fontSize = await page.getByRole('combobox', { name: '界面字号', exact: true }).inputValue();
  const applyToAnalytics = await appearancePanel(page).getByLabel('应用到Analytics', { exact: true }).isChecked();
  const motionMode = await motionControl(page).inputValue() as MotionMode;
  let presetId: PresetId | undefined;
  const region = appearancePanel(page).getByRole('region', { name: '视觉方案预设', exact: true });
  for (const id of Object.keys(presetNames) as PresetId[]) {
    const button = region.getByRole('button', { name: new RegExp(`^${presetNames[id]}(?:\\s|$)`) });
    if (await button.count() === 1 && await button.getAttribute('aria-pressed') === 'true') presetId = id;
  }
  assert(presetId, 'No unique saved React Bits preset is selected');
  return { theme, fontSize, presetId, applyToAnalytics, motionMode };
}

async function selectPreset(page: Page, presetId: PresetId) {
  const button = appearancePanel(page).getByRole('region', { name: '视觉方案预设', exact: true })
    .getByRole('button', { name: new RegExp(`^${presetNames[presetId]}(?:\\s|$)`) });
  assert(await button.count() === 1, `Preset is not uniquely available: ${presetId}`);
  await button.click();
  assert(await button.getAttribute('aria-pressed') === 'true', `Preset draft was not selected: ${presetId}`);
}

async function saveAppearance(page: Page) {
  const save = appearancePanel(page).getByRole('button', { name: '保存外观与动效', exact: true });
  assert(await save.count() === 1, 'Appearance save operation is not uniquely available');
  await save.click();
  await page.waitForFunction(() => document.documentElement.dataset.reactbitsMotion !== undefined, undefined, { timeout: 10_000 });
}

async function savePersonalPreferences(page: Page) {
  const save = appearancePanel(page).getByRole('button', { name: '保存个人偏好', exact: true });
  assert(await save.count() === 1, 'Personal-preferences save operation is not uniquely available');
  await save.click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark' || document.documentElement.dataset.theme === 'light', undefined, { timeout: 10_000 });
}

async function writeAppearance(page: Page, state: AppearanceState) {
  await selectPreset(page, state.presetId);
  const apply = appearancePanel(page).getByLabel('应用到Analytics', { exact: true });
  if (await apply.isChecked() !== state.applyToAnalytics) {
    if (state.applyToAnalytics) await apply.check();
    else await apply.uncheck();
  }
  const motion = motionControl(page);
  await motion.selectOption(state.motionMode);
  assert(await motion.inputValue() === state.motionMode, `Motion draft was not selected: ${state.motionMode}`);
  await saveAppearance(page);
  await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(state.fontSize);
  await themeControl(page).selectOption(state.theme);
  await savePersonalPreferences(page);
}

async function openAnalytics(page: Page) {
  await openCommandPalette(page);
  const command = page.getByRole('button', { name: '实时数据看板', exact: true });
  assert(await command.count() === 1, 'Analytics command is not uniquely available');
  await command.click();
  await page.waitForFunction(() => new URL(window.location.href).pathname === '/analytics', undefined, { timeout: 10_000 });
  await page.locator('[data-reactbits-scene="analytics"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('h1').filter({ hasText: /^数据复盘\|?$/ }).waitFor({ state: 'visible', timeout: 15_000 });
}

async function openTopicsFromCommandPalette(page: Page) {
  await openCommandPalette(page);
  const pageNavigationGroup = page.getByText('页面导航', { exact: true }).locator('..');
  const command = pageNavigationGroup.getByRole('button', { name: '选题管理', exact: true });
  assert(await command.count() === 1, 'Topics command is not uniquely available');
  await command.click();
  await page.waitForFunction(() => new URL(window.location.href).pathname === '/topics', undefined, { timeout: 10_000 });
  await page.getByRole('heading', { name: '选题管理', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
}

async function auditAnalyticsCanvas(page: Page): Promise<CanvasAudit> {
  const audit = await page.evaluate(() => {
    const facts = Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
      owner: Boolean(canvas.closest('[data-reactbits-scene="analytics"]')),
      interaction: Boolean(canvas.closest('[data-reactbits-button]')) && canvas.parentElement?.classList.contains('pointer-events-none') && canvas.parentElement?.classList.contains('-inset-5'),
    }));
    return {
      activeCanvas: facts.filter((item) => item.owner).length,
      interactionCanvas: facts.filter((item) => item.interaction).length,
      ownerUnknown: facts.filter((item) => !item.owner && !item.interaction).length,
    };
  });
  assert(audit.ownerUnknown === 0, `Analytics canvas owner UNKNOWN: ${JSON.stringify(audit)}`);
  return audit;
}

async function waitForCanvasCount(page: Page, expected: number) {
  await page.waitForFunction((count) => document.querySelectorAll('[data-reactbits-scene="analytics"] canvas').length === count, expected, { timeout: 15_000 });
  const audit = await auditAnalyticsCanvas(page);
  assert(audit.activeCanvas === expected, `Analytics Silk Scene Canvas=${audit.activeCanvas}, expected ${expected}`);
  return audit;
}

async function assertAnalyticsBasicStructure(page: Page) {
  const scene = page.locator('[data-reactbits-scene="analytics"]');
  await scene.waitFor({ state: 'visible', timeout: 15_000 });
  assert(await scene.count() === 1 && await scene.isVisible(), 'Analytics scene is not mounted and visible');
  for (const label of ['数据复盘', '数据导出', '周报生成']) {
    const tab = page.locator('[data-reactbits-navigation^="analytics-dimensions:"]').getByRole('button', { name: label, exact: true });
    assert(await tab.count() === 1 && await tab.isVisible(), `Analytics tab is unavailable: ${label}`);
  }
  assert(await page.getByRole('heading', { name: '个人统计排行', exact: true }).count() === 1, 'Analytics basic structure is incomplete');
  assert(await page.getByText('页面出错了', { exact: true }).count() === 0, 'Real ErrorBoundary is visible');
}

async function login(page: Page) {
  assert(username && password, 'TEST INFRA: XMT_E2E_USERNAME/XMT_E2E_PASSWORD are required');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]').fill(username);
  await page.locator('input[name="password"], input[autocomplete="current-password"], input[type="password"]').fill(password);
  await page.locator('button[type="submit"], button:has-text("登录")').click();
  await page.getByText('内容生产驾驶舱', { exact: false }).waitFor({ state: 'visible', timeout: 15_000 });
  await dismissSystemUpdateDialog(page);
}

test('XMT V2.18.0 Persistent-Off formal regression', async ({ page }) => {
  test.setTimeout(240_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const errorGate = { UNKNOWN: 0, ORPHAN: 0, addEventListenerNull: 0, eventsConnect: 0, CanvasImpl: 0, Provider: 0, R3F: 0, consoleError: 0, pageerror: 0, ErrorBoundary: 0 };
  const recordError = (message: string, source: 'consoleError' | 'pageerror') => {
    if (source === 'consoleError') { errorGate.consoleError += 1; consoleErrors.push(message); }
    else { errorGate.pageerror += 1; pageErrors.push(message); }
    if (/UNKNOWN/i.test(message)) errorGate.UNKNOWN += 1;
    if (/ORPHAN/i.test(message)) errorGate.ORPHAN += 1;
    if (/addEventListener\s*\(null\)/i.test(message)) errorGate.addEventListenerNull += 1;
    if (/events\\.connect.*error/i.test(message)) errorGate.eventsConnect += 1;
    if (/CanvasImpl/i.test(message)) errorGate.CanvasImpl += 1;
    if (/Provider/i.test(message)) errorGate.Provider += 1;
    if (/R3F/i.test(message)) errorGate.R3F += 1;
  };
  page.on('console', (message) => { if (message.type() === 'error') recordError(message.text(), 'consoleError'); });
  page.on('pageerror', (error) => recordError(error.message, 'pageerror'));

  let original: AppearanceState | undefined;
  let restoreSuccess = false;
  const rounds: Array<{ round: number; active: number; off: number; return: number }> = [];
  try {
    await login(page);
    await openAppearanceSettings(page);
    original = await readAppearanceState(page);
    await writeAppearance(page, { ...original, presetId: 'silk', applyToAnalytics: true, motionMode: 'balanced' });
    await openAnalytics(page);
    await assertAnalyticsBasicStructure(page);
    const active = await waitForCanvasCount(page, 1);
    console.log(`[persistent-off] setup Silk Scene Canvas=1 ${JSON.stringify(active)}`);

    for (let round = 1; round <= 5; round += 1) {
      const activeCanvas = await waitForCanvasCount(page, 1);
      await openAppearanceSettings(page);
      const offState = await readAppearanceState(page);
      await writeAppearance(page, { ...offState, presetId: 'silk', applyToAnalytics: true, motionMode: 'off' });
      await openAnalytics(page);
      const offCanvas = await waitForCanvasCount(page, 0);
      await openAppearanceSettings(page);
      assert((await readAppearanceState(page)).motionMode === 'off', 'Persistent-off save did not remain off');
      await openAnalytics(page);
      await waitForCanvasCount(page, 0);
      await openTopicsFromCommandPalette(page);
      assert(await page.locator('[data-reactbits-scene="analytics"]').count() === 0, 'Analytics did not unmount on route leave');
      await openAnalytics(page);
      const returnCanvas = await waitForCanvasCount(page, 0);
      const roundResult = { round, active: activeCanvas.activeCanvas, off: offCanvas.activeCanvas, return: returnCanvas.activeCanvas };
      rounds.push(roundResult);
      console.log(`[persistent-off] Round ${round} ${JSON.stringify(roundResult)}`);
      assert(roundResult.active === 1 && roundResult.off === 0 && roundResult.return === 0, `Round ${round} failed: ${JSON.stringify(roundResult)}`);
      if (round < 5) {
        await openAppearanceSettings(page);
        const current = await readAppearanceState(page);
        await writeAppearance(page, { ...current, presetId: 'silk', applyToAnalytics: true, motionMode: 'balanced' });
        await openAnalytics(page);
        await waitForCanvasCount(page, 1);
      }
    }

    await openAppearanceSettings(page);
    const reloadOff = await readAppearanceState(page);
    assert(reloadOff.motionMode === 'off', 'Reload-Off setup did not remain off');
    await openAnalytics(page);
    await waitForCanvasCount(page, 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await assertAnalyticsBasicStructure(page);
    const afterReload = await waitForCanvasCount(page, 0);
    await openAppearanceSettings(page);
    const persistedReloadState = await readAppearanceState(page);
    assert(persistedReloadState.motionMode === 'off', 'Reload-Off motionMode did not persist as off');
    console.log(`[persistent-off] Reload-Off ${JSON.stringify({ motionMode: persistedReloadState.motionMode, canvas: afterReload.activeCanvas })}`);
  } finally {
    if (original) {
      try {
        await openAppearanceSettings(page);
        await writeAppearance(page, original);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await dismissSystemUpdateDialog(page);
        await openAppearanceSettings(page);
        const restored = await readAppearanceState(page);
        restoreSuccess = JSON.stringify(restored) === JSON.stringify(original);
      } catch (error) {
        restoreSuccess = false;
        recordError(`restore failed: ${error instanceof Error ? error.message : String(error)}`, 'consoleError');
      }
    }
    if (page.getByText('页面出错了', { exact: true }).count) errorGate.ErrorBoundary = await page.getByText('页面出错了', { exact: true }).count();
    console.log(`[persistent-off] rounds=${JSON.stringify(rounds)} errors=${JSON.stringify(errorGate)} restoreSuccess=${restoreSuccess}`);
  }
  assert(restoreSuccess, 'restoreSuccess=false');
  assert(consoleErrors.length === 0 && pageErrors.length === 0, `Runtime errors: ${[...consoleErrors, ...pageErrors].slice(0, 5).join(' | ')}`);
  assert(Object.values(errorGate).every((count) => count === 0), `Error gate failed: ${JSON.stringify(errorGate)}`);
});
