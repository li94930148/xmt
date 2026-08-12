import { chromium, type Page } from 'playwright';

const baseUrl = process.env.XMT_E2E_BASE_URL || 'http://localhost:5174';
const username = process.env.XMT_E2E_USERNAME;
const password = process.env.XMT_E2E_PASSWORD;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function dismissUpdate(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForTimeout(300);
    const dialog = page.locator('div.fixed.inset-0').filter({ hasText: '系统更新' });
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.click({ position: { x: 4, y: 4 }, force: true }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    const button = dialog.getByRole('button', { name: '我知道了', exact: true }).first();
    await button.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => undefined);
    if (!await button.isVisible().catch(() => false)) continue;
    await button.click({ force: true });
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
    const overlay = page.locator('div.fixed.inset-0.z-\\[300\\]').first();
    if (await overlay.isVisible().catch(() => false)) await overlay.click({ position: { x: 4, y: 4 }, force: true }).catch(() => undefined);
    if (!await dialog.isVisible().catch(() => false)) break;
  }
}

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]').first().fill(username!);
  await page.locator('input[name="password"], input[autocomplete="current-password"], input[type="password"]').first().fill(password!);
  await page.locator('button[type="submit"], button:has-text("登录")').first().click();
  await page.getByText('内容生产驾驶舱', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await dismissUpdate(page);
}

async function openAppearance(page: Page) {
  await page.goto(`${baseUrl}/notification-settings`, { waitUntil: 'domcontentloaded' });
  await dismissUpdate(page);
  await page.getByRole('button', { name: '外观与动效', exact: true }).click();
  await dismissUpdate(page);
  await page.getByText('React Bits 原生动效外观中心', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
}

async function saveAppearance(page: Page) {
  await page.getByRole('button', { name: '保存外观与动效', exact: true }).click();
}

async function savePreferences(page: Page) {
  await page.getByRole('button', { name: '保存个人偏好', exact: true }).click();
}

async function workflowShell(page: Page) {
  await page.goto(`${baseUrl}/workflow-designer`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-reactbits-scene="workflow"]').waitFor({ state: 'visible', timeout: 15_000 });
  const title = page.locator('[data-reactbits-scene="workflow"] h1');
  assert(await title.count() === 1 && await title.isVisible(), 'Workflow title is not unique');
  const actions = page.getByRole('button', { name: '新建模板', exact: true });
  assert(await actions.count() === 1 && await actions.isVisible(), 'Workflow primary action is unavailable');
  const business = page.locator('[data-reactbits-scene="workflow"] > div.space-y-6');
  assert(await business.count() === 1, 'Workflow business shell is not unique');
  const box = await business.boundingBox();
  assert(box && box.width > 0 && box.height > 0, 'Workflow business shell has invalid geometry');
}

async function auditCanvasAndGeometry(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const audit = await page.evaluate(() => {
    const scene = document.querySelector('[data-reactbits-scene="workflow"]');
    const canvases = Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
      scene: Boolean(canvas.closest('[data-reactbits-scene="workflow"]')),
      width: canvas.getBoundingClientRect().width,
      height: canvas.getBoundingClientRect().height,
    }));
    const business = document.querySelector('[data-reactbits-scene="workflow"] > div.space-y-6');
    const businessCanvas = business ? Array.from(business.querySelectorAll('canvas')).filter((canvas) => !canvas.closest('[data-reactbits-scene="workflow"]')).length : 0;
    const ancestorEffects: string[] = [];
    for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
      for (let node = canvas.parentElement; node && node !== scene; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.transform !== 'none' || style.filter !== 'none' || style.perspective !== 'none') {
          const isInteractionWrapper = node.classList.contains('inline-flex') && node.classList.contains('w-fit');
          if (!isInteractionWrapper) ancestorEffects.push(`${node.tagName}.${node.className}`);
        }
      }
    }
    return { canvases, businessCanvas, ancestorEffects, svg: document.querySelectorAll('[data-reactbits-scene="workflow"] svg').length };
  });
  assert(audit.businessCanvas === 0, `Workflow page unexpectedly has a business canvas: ${JSON.stringify(audit)}`);
  assert(audit.canvases.every((canvas) => canvas.scene && canvas.width > 0 && canvas.height > 0), `Workflow scene canvas audit failed: ${JSON.stringify(audit)}`);
  assert(audit.ancestorEffects.length === 0, `Workflow scene ancestor geometry changed: ${JSON.stringify(audit)}`);
  return audit;
}

async function exerciseEditorShell(page: Page) {
  await page.getByRole('button', { name: '新建模板', exact: true }).click();
  await page.getByRole('heading', { name: '新建审批流', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: '添加节点', exact: true }).click();
  const node = page.getByText('节点 1', { exact: true });
  assert(await node.count() === 1 && await node.isVisible(), 'Workflow node editor did not open');
  const nodeCard = node.locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]');
  assert(await nodeCard.count() === 1, 'Workflow node card is not uniquely available');
  await nodeCard.getByLabel('必须审批', { exact: true }).uncheck();
  await nodeCard.getByLabel('必须审批', { exact: true }).check();
  const inputs = nodeCard.locator('input');
  assert(await inputs.count() >= 3, 'Workflow node form controls are incomplete');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('heading', { name: '新建审批流', exact: true }).waitFor({ state: 'hidden', timeout: 10_000 });
}

async function run() {
  if (!username || !password) { console.log('Workflow credentials missing'); return; }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(15_000);
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  let restoreSuccess = false;
  let originalTheme = 'dark';
  let originalFont = '16';
  let originalMotion = 'balanced';
  let originalApply = false;
  let originalPreset = '岚曜极光';
  try {
    await login(page);
    await openAppearance(page);
    originalTheme = await page.locator('select:has(option[value="light"]):has(option[value="dark"])').inputValue();
    originalFont = await page.getByRole('combobox', { name: '界面字号', exact: true }).inputValue();
    originalMotion = await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').inputValue();
  const workflowApply = page.getByLabel('应用到Workflow', { exact: true });
    originalApply = await workflowApply.isChecked();
    const presetRegion = page.getByRole('region', { name: '视觉方案预设', exact: true });
    const presetNames = ['岚曜极光', '深空科技', '丝绸创意', '线性协作', '极简无扰', '自由搭配'];
    const preset = (await Promise.all(presetNames.map(async (name) => (await presetRegion.getByRole('button', { name: new RegExp(`^${name}`) }).getAttribute('aria-pressed')) === 'true'))).findIndex(Boolean);
    originalPreset = presetNames[preset < 0 ? 0 : preset];
    if (process.env.XMT_WORKFLOW_SMOKE === '1') {
      await workflowShell(page);
      return;
    }

    for (const scenario of [
      { theme: 'dark', font: '14' }, { theme: 'light', font: '16' }, { theme: 'dark', font: '20' },
      { theme: 'light', font: '24' },
    ]) {
      await openAppearance(page);
      const themeButton = page.getByRole('button', { name: new RegExp(scenario.theme === 'dark' ? '^深色模式' : '^浅色模式') });
      await themeButton.click();
      await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(scenario.font);
      await savePreferences(page);
      await workflowShell(page);
    }

    for (const name of presetNames) {
      await openAppearance(page);
      await presetRegion.getByRole('button', { name: new RegExp(`^${name}`) }).click();
      await saveAppearance(page);
      await workflowShell(page);
    }

    for (const mode of ['off', 'reduced', 'balanced', 'full']) {
      await openAppearance(page);
      await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').selectOption(mode);
      await saveAppearance(page);
      await workflowShell(page);
      const audit = await auditCanvasAndGeometry(page, 1440, 900);
      if (mode === 'off') assert(audit.canvases.length === 0, `Workflow off mode retained scene canvas: ${JSON.stringify(audit)}`);
    }

    await openAppearance(page);
    if (await workflowApply.isChecked()) await workflowApply.uncheck();
    await saveAppearance(page);
    await workflowShell(page);
    await openAppearance(page);
    if (!await workflowApply.isChecked()) await workflowApply.check();
    await saveAppearance(page);
    await workflowShell(page);

    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await auditCanvasAndGeometry(page, viewport.width, viewport.height);
      assert(await page.locator('[data-reactbits-scene="workflow"] h1').count() === 1, `Workflow title duplicated at ${viewport.width}x${viewport.height}`);
    }
    await exerciseEditorShell(page);
    assert(await page.locator('button button').count() === 0, 'Nested button detected in Workflow scene');
    assert(await page.getByText('页面出错了', { exact: true }).count() === 0, 'Workflow ErrorBoundary is visible');
    assert(errors.length === 0, `Workflow console/page errors: ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await openAppearance(page).catch(() => undefined);
  const workflowApply = page.getByLabel('应用到Workflow', { exact: true });
    const presetRegion = page.getByRole('region', { name: '视觉方案预设', exact: true });
    const presetNames = ['岚曜极光', '深空科技', '丝绸创意', '线性协作', '极简无扰', '自由搭配'];
    await page.getByRole('button', { name: new RegExp(originalTheme === 'dark' ? '^深色模式' : '^浅色模式') }).click().catch(() => undefined);
    await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(originalFont).catch(() => undefined);
    await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').selectOption(originalMotion).catch(() => undefined);
    if (await workflowApply.isChecked().catch(() => originalApply) !== originalApply) await workflowApply.setChecked(originalApply).catch(() => undefined);
    await presetRegion.getByRole('button', { name: new RegExp(`^${originalPreset}`) }).click().catch(() => undefined);
    await saveAppearance(page).catch(() => undefined);
    restoreSuccess = await page.locator('select:has(option[value="light"]):has(option[value="dark"])').inputValue().catch(() => '') === originalTheme
      && await page.getByRole('combobox', { name: '界面字号', exact: true }).inputValue().catch(() => '') === originalFont
      && await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').inputValue().catch(() => '') === originalMotion
      && await page.getByLabel('应用到Workflow', { exact: true }).isChecked().catch(() => !originalApply) === originalApply;
    console.log(`[reactbits-workflow] restoreSuccess=${restoreSuccess}`);
  }
  await Promise.race([browser.close(), new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
}

void run().catch((error) => { console.error(`[reactbits-workflow] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
