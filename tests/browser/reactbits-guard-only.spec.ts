import { test, type Page } from 'playwright/test';

const baseUrl = process.env.XMT_E2E_BASE_URL || 'http://127.0.0.1:5174';
const username = process.env.XMT_E2E_USERNAME;
const password = process.env.XMT_E2E_PASSWORD;
type Theme = 'dark' | 'light';
type Motion = 'off' | 'reduced' | 'balanced' | 'full';
type Preset = 'aurora' | 'deep-space' | 'silk' | 'linear' | 'minimal' | 'custom';
type State = { theme: Theme; fontSize: string; preset: Preset; analytics: boolean; motion: Motion };
const presetLabels: Record<Preset, string> = { aurora: '岚曜极光', 'deep-space': '深空科技', silk: '丝绸创意', linear: '线性协作', minimal: '极简无扰', custom: '自由搭配' };

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

function main(page: Page) { return page.locator('main.xmt-business-content'); }
function appearance(page: Page) { return main(page).getByRole('heading', { name: '外观与动效', exact: true }).locator('xpath=../..'); }
function motion(page: Page) { return appearance(page).locator('label').filter({ hasText: '动效强度' }).getByRole('combobox'); }
function theme(page: Page) { return appearance(page).locator('select:has(option[value="light"]):has(option[value="dark"])'); }

async function dismiss(page: Page) {
  const dialog = page.locator('div.fixed.inset-0').filter({ has: page.getByText('系统更新', { exact: true }) }).filter({ has: page.getByRole('button', { name: '我知道了', exact: true }) }).filter({ has: page.getByRole('button', { name: '查看完整更新日志', exact: true }) });
  const button = dialog.getByRole('button', { name: '我知道了', exact: true });
  await button.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => undefined);
  if (await button.isVisible().catch(() => false)) { await button.click(); await dialog.waitFor({ state: 'hidden', timeout: 5_000 }); }
}

async function ensureSettingsInteractive(page: Page) {
  await dismiss(page);
  const overlay = page.locator('div.fixed.inset-0').filter({ has: page.getByText('系统更新', { exact: true }) });
  await overlay.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
}

async function command(page: Page, label: string) {
  await page.keyboard.press('Meta+k');
  await page.locator('input[placeholder="搜索选题、页面、用户..."]').waitFor({ state: 'visible', timeout: 5_000 });
  const group = label === '选题管理' ? page.getByText('页面导航', { exact: true }).locator('..') : page.locator('div.fixed.inset-0').getByRole('button', { name: label, exact: true });
  const button = label === '选题管理' ? group.getByRole('button', { name: label, exact: true }) : group;
  assert(await button.count() === 1, `Command is not unique: ${label}`);
  await button.click();
}

async function openSettings(page: Page) {
  await command(page, '设置中心');
  await dismiss(page);
  await main(page).getByRole('heading', { name: '设置中心', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  const root = main(page).locator('div.mx-auto.w-full.max-w-7xl');
  const nav = root.locator('div.flex.flex-col.gap-6.lg\\:flex-row > div.w-full.flex-shrink-0');
  assert(await root.count() === 1 && await nav.count() === 1, 'Settings structure is not unique');
  const tab = nav.getByRole('button', { name: '外观与动效', exact: true });
  assert(await tab.count() === 1, 'Appearance tab is not unique');
  await ensureSettingsInteractive(page); await tab.click(); await appearance(page).waitFor({ state: 'visible', timeout: 15_000 });
  await ensureSettingsInteractive(page);
}

async function readState(page: Page): Promise<State> {
  const region = appearance(page).getByRole('region', { name: '视觉方案预设', exact: true });
  await region.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[aria-pressed="true"]')).some((node) => node.closest('[aria-label*="视觉方案预设"], [role="region"]')), undefined, { timeout: 15_000 }).catch(() => undefined);
  let preset: Preset | undefined;
  for (const id of Object.keys(presetLabels) as Preset[]) {
    const button = region.getByRole('button', { name: new RegExp(`^${presetLabels[id]}(?:\\s|$)`) });
    const pressed = await button.evaluateAll((nodes) => nodes.length === 1 && nodes[0].getAttribute('aria-pressed') === 'true').catch(() => false);
    if (pressed) preset = id;
  }
  assert(preset, 'Saved preset is unavailable');
  return { theme: await theme(page).inputValue() as Theme, fontSize: await page.getByRole('combobox', { name: '界面字号', exact: true }).inputValue(), preset, analytics: await appearance(page).getByLabel('应用到Analytics', { exact: true }).isChecked(), motion: await motion(page).inputValue() as Motion };
}

async function save(page: Page) {
  await ensureSettingsInteractive(page);
  const button = appearance(page).getByRole('button', { name: '保存外观与动效', exact: true });
  assert(await button.count() === 1, 'Appearance save is not unique'); await button.click();
  await page.waitForFunction(() => document.documentElement.dataset.reactbitsMotion !== undefined, undefined, { timeout: 10_000 });
}

async function savePersonal(page: Page) {
  const button = appearance(page).getByRole('button', { name: '保存个人偏好', exact: true });
  assert(await button.count() === 1, 'Personal preference save is not unique'); await button.click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark' || document.documentElement.dataset.theme === 'light', undefined, { timeout: 10_000 });
}

async function writeState(page: Page, state: State) {
  const preset = appearance(page).getByRole('region', { name: '视觉方案预设', exact: true }).getByRole('button', { name: new RegExp(`^${presetLabels[state.preset]}(?:\\s|$)`) });
  assert(await preset.count() === 1, `Preset is not unique: ${state.preset}`); await preset.click();
  const analytics = appearance(page).getByLabel('应用到Analytics', { exact: true });
  if (await analytics.isChecked() !== state.analytics) state.analytics ? await analytics.check() : await analytics.uncheck();
  await motion(page).selectOption(state.motion); await save(page);
  await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(state.fontSize); await theme(page).selectOption(state.theme); await savePersonal(page);
}

async function analytics(page: Page) {
  await command(page, '实时数据看板');
  await page.waitForFunction(() => new URL(location.href).pathname === '/analytics', undefined, { timeout: 10_000 });
  await page.locator('[data-reactbits-scene="analytics"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('h1').filter({ hasText: /^数据复盘\|?$/ }).waitFor({ state: 'visible', timeout: 15_000 });
}

async function topics(page: Page) {
  await command(page, '选题管理');
  await page.waitForFunction(() => new URL(location.href).pathname === '/topics', undefined, { timeout: 10_000 });
  await page.getByRole('heading', { name: '选题管理', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
}

async function canvasAudit(page: Page) {
  return page.evaluate(() => {
    const facts = Array.from(document.querySelectorAll('canvas')).map((node) => ({ scene: Boolean(node.closest('[data-reactbits-scene="analytics"]')), interaction: Boolean(node.closest('[data-reactbits-button]')) && node.parentElement?.classList.contains('pointer-events-none') && node.parentElement?.classList.contains('-inset-5') }));
    return { active: facts.filter((item) => item.scene).length, interaction: facts.filter((item) => item.interaction).length, unknown: facts.filter((item) => !item.scene && !item.interaction).length };
  });
}
async function expectCanvas(page: Page, expected: number) {
  await page.waitForFunction((count) => document.querySelectorAll('[data-reactbits-scene="analytics"] canvas').length === count, expected, { timeout: 15_000 });
  const audit = await canvasAudit(page); assert(audit.active === expected, `Silk Scene Canvas=${audit.active}, expected=${expected}`); assert(audit.unknown === 0, `UNKNOWN canvas: ${JSON.stringify(audit)}`); return audit;
}

test('XMT V2.18.0 Silk Fiber8 Null-Safe Events Guard-Only validation', async ({ page }) => {
  test.setTimeout(600_000);
  assert(username && password, 'TEST INFRA: credentials are missing');
  const errors: Record<string, number> = { UNKNOWN: 0, ORPHAN: 0, addEventListenerNull: 0, eventsConnect: 0, CanvasImpl: 0, Provider: 0, R3F: 0, WebGLFatal: 0, consoleError: 0, pageerror: 0, ErrorBoundary: 0, unmountWarning: 0, rafCleanup: 0 };
  const messages: string[] = [];
  const record = (message: string, kind: 'consoleError' | 'pageerror' | 'warning') => {
    if (kind === 'consoleError') errors.consoleError += 1; if (kind === 'pageerror') errors.pageerror += 1; messages.push(message);
    if (/UNKNOWN/i.test(message)) errors.UNKNOWN += 1; if (/ORPHAN/i.test(message)) errors.ORPHAN += 1; if (/addEventListener\s*\(null\)/i.test(message)) errors.addEventListenerNull += 1; if (/events\.connect.*error/i.test(message)) errors.eventsConnect += 1; if (/CanvasImpl/i.test(message)) errors.CanvasImpl += 1; if (/Provider/i.test(message)) errors.Provider += 1; if (/R3F/i.test(message)) errors.R3F += 1; if (/WebGL.*fatal|fatal.*WebGL/i.test(message)) errors.WebGLFatal += 1; if (kind === 'warning' && /state update.*unmount|can't perform.*unmount/i.test(message)) errors.unmountWarning += 1; if (/RAF.*cleanup/i.test(message)) errors.rafCleanup += 1;
  };
  page.on('console', (message) => record(message.text(), message.type() === 'error' ? 'consoleError' : message.type() === 'warning' ? 'warning' : 'warning'));
  page.on('pageerror', (error) => record(error.message, 'pageerror'));
  let original: State | undefined; let restoreSuccess = false;
  const silkRounds: string[] = []; const routeRounds: string[] = []; const offRouteRounds: string[] = []; const balancedReloads: string[] = []; const offReloads: string[] = [];
  const assertClean = async () => {
    const visibleBoundary = await page.getByText('页面出错了', { exact: true }).evaluateAll((nodes) => nodes.filter((node) => { const style = getComputedStyle(node as HTMLElement); const box = (node as HTMLElement).getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0 && box.width > 0 && box.height > 0; }).length);
    errors.ErrorBoundary = visibleBoundary;
    assert(Object.entries(errors).filter(([key]) => key !== 'ErrorBoundary').every(([, value]) => value === 0), `Guard error gate: ${JSON.stringify(errors)}; ${messages.slice(0, 3).join(' | ')}`);
    assert(visibleBoundary === 0, 'ErrorBoundary is visible');
  };
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[autocomplete="username"]').fill(username); await page.locator('input[autocomplete="current-password"]').fill(password); await page.getByRole('button', { name: '登录', exact: true }).click(); await page.getByText('内容生产驾驶舱', { exact: false }).waitFor({ state: 'visible', timeout: 15_000 }); await dismiss(page);
    await openSettings(page); original = await readState(page);
    await writeState(page, { ...original, preset: 'silk', analytics: true, motion: 'balanced' }); await analytics(page); await expectCanvas(page, 1);
    for (let round = 1; round <= 10; round += 1) {
      await openSettings(page); await writeState(page, { ...(await readState(page)), preset: 'silk', analytics: true, motion: 'off' }); await analytics(page); await expectCanvas(page, 0); await openSettings(page); await writeState(page, { ...(await readState(page)), preset: 'silk', analytics: true, motion: 'balanced' }); await analytics(page); await expectCanvas(page, 1); await assertClean(); silkRounds.push(`Round ${round}: 1→0→1`);
    }
    for (let round = 1; round <= 5; round += 1) {
      await openSettings(page); await writeState(page, { ...(await readState(page)), preset: 'silk', analytics: true, motion: 'balanced' }); await analytics(page); await expectCanvas(page, 1); await topics(page); assert(await page.locator('[data-reactbits-scene="analytics"]').count() === 0, 'Analytics did not unmount'); await analytics(page); await expectCanvas(page, 1); await assertClean(); routeRounds.push(`Round ${round}: 1→route 0→1`);
      await openSettings(page); await writeState(page, { ...(await readState(page)), preset: 'silk', analytics: true, motion: 'off' }); await analytics(page); await expectCanvas(page, 0); await topics(page); assert(await page.locator('[data-reactbits-scene="analytics"]').count() === 0, 'Analytics did not unmount while off'); await analytics(page); await expectCanvas(page, 0); await assertClean(); offRouteRounds.push(`Round ${round}: 1→0→route→0`);
    }
    for (let round = 1; round <= 3; round += 1) {
      await openSettings(page); await writeState(page, { ...(await readState(page)), preset: 'silk', analytics: true, motion: 'balanced' }); await analytics(page); await expectCanvas(page, 1); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('[data-reactbits-scene="analytics"]').waitFor({ state: 'visible', timeout: 15_000 }); await expectCanvas(page, 1); balancedReloads.push(`Round ${round}: 1→reload→1`);
      await openSettings(page); await writeState(page, { ...(await readState(page)), preset: 'silk', analytics: true, motion: 'off' }); await analytics(page); await expectCanvas(page, 0); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('[data-reactbits-scene="analytics"]').waitFor({ state: 'visible', timeout: 15_000 }); await expectCanvas(page, 0); offReloads.push(`Round ${round}: 0→reload→0`);
    }
    await openSettings(page); await writeState(page, { ...(await readState(page)), preset: 'silk', analytics: true, motion: 'balanced' });
    const darkPreview = page.getByText('深色真实预览', { exact: true }).locator('xpath=../..'); const lightPreview = page.getByText('浅色真实预览', { exact: true }).locator('xpath=../..');
    const previewCanvasCount = async () => await darkPreview.locator('canvas').count() + await lightPreview.locator('canvas').count();
    await darkPreview.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 }); await lightPreview.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 }); const activePreview = await previewCanvasCount();
    await motion(page).selectOption('off'); await darkPreview.locator('canvas').waitFor({ state: 'detached', timeout: 15_000 }); await lightPreview.locator('canvas').waitFor({ state: 'detached', timeout: 15_000 });
    await motion(page).selectOption('balanced'); await darkPreview.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 }); await lightPreview.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 }); assert(activePreview > 0 && await previewCanvasCount() > 0, 'Settings Silk preview did not recover');
    for (const preset of ['aurora', 'silk', 'linear', 'minimal'] as Preset[]) { await openSettings(page); await writeState(page, { ...(await readState(page)), preset, analytics: true, motion: preset === 'minimal' ? 'reduced' : 'balanced' }); await analytics(page); await expectCanvas(page, preset === 'minimal' ? 0 : 1); await assertClean(); }
  } finally {
    if (original) { try { await openSettings(page); await writeState(page, original); await page.reload({ waitUntil: 'domcontentloaded' }); await dismiss(page); await openSettings(page); restoreSuccess = JSON.stringify(await readState(page)) === JSON.stringify(original); } catch { restoreSuccess = false; } }
    console.log(`[guard-only] silk10=${JSON.stringify(silkRounds)} route=${JSON.stringify(routeRounds)} offRoute=${JSON.stringify(offRouteRounds)} reloadBalanced=${JSON.stringify(balancedReloads)} reloadOff=${JSON.stringify(offReloads)} errors=${JSON.stringify(errors)} restoreSuccess=${restoreSuccess}`);
  }
  assert(restoreSuccess, 'restoreSuccess=false'); await assertClean(); assert(silkRounds.length === 10 && routeRounds.length === 5 && offRouteRounds.length === 5 && balancedReloads.length === 3 && offReloads.length === 3, 'Guard-only coverage incomplete');
});
