import { chromium, type Page } from 'playwright';

const baseUrl = process.env.XMT_E2E_BASE_URL || 'http://localhost:5174';
const username = process.env.XMT_E2E_USERNAME;
const password = process.env.XMT_E2E_PASSWORD;
const fontSizes = [14, 16, 18, 20, 22, 24];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalUrl(url: string) {
  const host = new URL(url).hostname;
  assert(host === 'localhost' || host === '127.0.0.1', `refusing non-local test target: ${host}`);
}

function isAuthenticatedHomeUrl(rawUrl: string) {
  const target = new URL(rawUrl);
  const base = new URL(baseUrl);
  return target.origin === base.origin && (target.pathname === '/' || target.pathname === '/home');
}

async function dismissSystemUpdateDialog(page: Page) {
  // UpdateNotification is not yet exposed with role="dialog". Identify this
  // specific dialog by its unique, user-visible update content and then use its
  // own labelled acknowledgement control; do not close arbitrary dialogs.
  const updateDialog = page.locator('div.fixed.inset-0').filter({
    has: page.getByText('系统更新', { exact: true }),
  }).filter({
    has: page.getByRole('button', { name: '我知道了', exact: true }),
  }).filter({
    has: page.getByRole('button', { name: '查看完整更新日志', exact: true }),
  });

  const acknowledgement = updateDialog.first().getByRole('button', { name: '我知道了', exact: true });
  if (!await acknowledgement.isVisible().catch(() => false)) {
    await acknowledgement.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => undefined);
  }
  if (!await acknowledgement.isVisible().catch(() => false)) return;

  await acknowledgement.click();
  await updateDialog.first().waitFor({ state: 'hidden', timeout: 5_000 });
}

async function waitForAuthenticatedHome(page: Page) {
  if (!isAuthenticatedHomeUrl(page.url())) {
    await page.waitForFunction((origin) => {
      const url = new URL(window.location.href);
      return url.origin === origin && (url.pathname === '/' || url.pathname === '/home');
    }, new URL(baseUrl).origin, { timeout: 15_000 });
  }

  await dismissSystemUpdateDialog(page);

  const heading = page.getByText('内容生产驾驶舱', { exact: false }).first();
  await heading.waitFor({ state: 'visible', timeout: 15_000 });

  const enterTopics = page.getByRole('button', { name: /进入选题池/ }).first();
  await enterTopics.waitFor({ state: 'visible', timeout: 15_000 });
  assert(await enterTopics.isEnabled(), 'Home enter-topics action is disabled');
  assert(isAuthenticatedHomeUrl(page.url()), `Unexpected authenticated-home URL: ${page.url()}`);
  assert(await page.getByText('页面出错了', { exact: true }).count() === 0, 'React error boundary is visible');
}

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]').first().fill(username!);
  await page.locator('input[name="password"], input[autocomplete="current-password"], input[type="password"]').first().fill(password!);
  await page.locator('button[type="submit"], button:has-text("登录")').first().click();
  await waitForAuthenticatedHome(page);
}

async function selectField(page: Page, label: string, value: string) {
  const select = page.locator('label').filter({ hasText: label }).locator('select');
  if (!await select.isVisible().catch(() => false)) {
    const advanced = page.locator('details').filter({ hasText: '高级设置' }).locator('summary');
    if (await advanced.count() === 1) await advanced.click();
  }
  await select.selectOption(value);
}

async function selectInterfaceFontSize(page: Page, value: string) {
  const control = page.getByRole('combobox', { name: '界面字号', exact: true });
  assert(await control.count() === 1, 'Interface font-size combobox is not uniquely available');
  await control.selectOption(value);
  assert(await control.evaluate((node) => (node as HTMLSelectElement).value) === value, `Interface font-size was not applied: ${value}`);
}

async function getTypography(page: Page) {
  return page.evaluate(() => {
    const business = document.querySelector('main.xmt-business-content');
    if (!business) throw new Error('Business content container is unavailable');
    return {
      root: getComputedStyle(document.documentElement).fontSize,
      business: getComputedStyle(business).fontSize,
    };
  });
}

async function saveInterfaceFontSize(page: Page, value: string) {
  const saveButton = page.getByRole('button', { name: '保存个人偏好', exact: true });
  assert(await saveButton.count() === 1, 'Save personal preferences button is not uniquely available');
  await saveButton.click();
  await page.waitForFunction((expected) => {
    const business = document.querySelector('main.xmt-business-content');
    return business != null && getComputedStyle(business).fontSize === expected;
  }, `${value}px`, { timeout: 15_000 });
  const typography = await page.evaluate(() => ({ root: getComputedStyle(document.documentElement).fontSize, business: getComputedStyle(document.querySelector('main.xmt-business-content')!).fontSize }));
  assert(typography.root === '16px', `Root font size changed unexpectedly: ${typography.root}`);
  assert(typography.business === `${value}px`, `Business font size was not applied: ${typography.business}`);
}

async function assertNoOverflow(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const result = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert(result.scrollWidth <= result.clientWidth, `${width}x${height} has horizontal overflow`);
}

function parseCssColor(value: string) {
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1 } : null;
}

function contrastRatio(foreground: NonNullable<ReturnType<typeof parseCssColor>>, background: NonNullable<ReturnType<typeof parseCssColor>>) {
  const channel = (value: number) => value / 255 <= 0.03928 ? value / 255 / 12.92 : Math.pow((value / 255 + 0.055) / 1.055, 2.4);
  const luminance = (color: typeof foreground) => 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function getEffectiveBackground(colors: string[]) {
  let result = { r: 0, g: 0, b: 0, a: 0 };
  for (const value of [...colors].reverse()) {
    const foreground = parseCssColor(value);
    if (!foreground || foreground.a === 0) continue;
    const alpha = foreground.a + result.a * (1 - foreground.a);
    result = {
      r: (foreground.r * foreground.a + result.r * result.a * (1 - foreground.a)) / alpha,
      g: (foreground.g * foreground.a + result.g * result.a * (1 - foreground.a)) / alpha,
      b: (foreground.b * foreground.a + result.b * result.a * (1 - foreground.a)) / alpha,
      a: alpha,
    };
  }
  return result.a > 0 ? result : null;
}

async function assertButtonPresentation(page: Page) {
  const buttons = page.locator('button[data-reactbits-button]');
  assert(await buttons.count() > 0, 'React Bits button matrix is not visible');
  for (let index = 0; index < await buttons.count(); index += 1) {
    const button = buttons.nth(index);
    const box = await button.boundingBox();
    const inspection = await button.evaluate((node) => {
      const element = node as HTMLButtonElement;
      const style = getComputedStyle(element);
      const backgroundColors: string[] = [];
      for (let current: HTMLElement | null = element; current; current = current.parentElement) backgroundColors.push(getComputedStyle(current).backgroundColor);
      const variant = element.dataset.reactbitsButton || 'unknown';
      const name = element.getAttribute('aria-label') || element.innerText.trim();
      return { variant, name, disabled: element.disabled, visible: style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0, icon: variant === 'icon', hasNestedButton: Boolean(element.querySelector('button')), foregroundColor: style.color, backgroundColors };
    });
    const label = `variant=${inspection.variant} name=${inspection.name || 'unnamed'}`;
    assert(box && box.width > 0 && box.height >= 32 && box.width < 500 && box.height < 500, `invalid React Bits button: ${label}`);
    assert(inspection.visible, `hidden React Bits button: ${label}`);
    assert(!inspection.hasNestedButton, `nested button detected: ${label}`);
    const foreground = parseCssColor(inspection.foregroundColor);
    const background = getEffectiveBackground(inspection.backgroundColors);
    if (inspection.icon) assert(Boolean(inspection.name) && Boolean(foreground && foreground.a > 0), `invalid icon button: ${label}`);
    else {
      const contrast = foreground && background ? contrastRatio(foreground, background) : 0;
      assert(contrast >= 4.5, `unreadable React Bits button: ${label} contrast=${contrast.toFixed(2)}`);
    }
  }
}

async function waitForElementGeometryStable(locator: ReturnType<Page['locator']>) {
  let stableSamples = 0;
  let previous = '';
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline && stableSamples < 3) {
    const box = await locator.boundingBox();
    assert(box, 'Animated heading is not measurable');
    const sample = [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10) / 10).join(',');
    stableSamples = sample === previous ? stableSamples + 1 : 0;
    previous = sample;
    await locator.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  assert(stableSamples >= 3, 'Animated heading geometry did not stabilize within 3 seconds');
}

async function assertTextNotClipped(locator: ReturnType<Page['locator']>) {
  const clipping = await locator.evaluate((node) => {
    const root = node as HTMLElement;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.split-char')).filter((element) => {
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none';
    });
    const bounds = (targets.length ? targets : [root]).map((element) => element.getBoundingClientRect());
    const union = bounds.reduce((result, rect) => ({
      left: Math.min(result.left, rect.left), top: Math.min(result.top, rect.top), right: Math.max(result.right, rect.right), bottom: Math.max(result.bottom, rect.bottom),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const clippedBy: string[] = [];
    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (!['hidden', 'clip'].includes(style.overflowX) && !['hidden', 'clip'].includes(style.overflowY)) continue;
      const rect = ancestor.getBoundingClientRect();
      const tolerance = 2;
      if (union.left < rect.left - tolerance || union.right > rect.right + tolerance || union.top < rect.top - tolerance || union.bottom > rect.bottom + tolerance) {
        clippedBy.push(`${ancestor.tagName}.${ancestor.className}`);
      }
    }
    return clippedBy;
  });
  assert(clipping.length === 0, `Home animated title is clipped by ${clipping.join(', ')}`);
}

type MetricPreviewDiagnostic = {
  text: string;
  visible: boolean;
  box: { width: number; height: number };
  clippedBy: string[];
};

async function readMetricPreviewDiagnostics(locator: ReturnType<Page['locator']>): Promise<MetricPreviewDiagnostic[]> {
  return locator.evaluateAll((nodes) => nodes.map((node) => {
    const root = node as HTMLElement;
    const style = getComputedStyle(root);
    const box = root.getBoundingClientRect();
    const clippedBy: string[] = [];
    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const ancestorStyle = getComputedStyle(ancestor);
      if (!['hidden', 'clip'].includes(ancestorStyle.overflowX) && !['hidden', 'clip'].includes(ancestorStyle.overflowY)) continue;
      const ancestorBox = ancestor.getBoundingClientRect();
      const tolerance = 2;
      if (box.left < ancestorBox.left - tolerance || box.right > ancestorBox.right + tolerance || box.top < ancestorBox.top - tolerance || box.bottom > ancestorBox.bottom + tolerance) {
        clippedBy.push(`${ancestor.tagName}.${ancestor.className}`);
      }
    }
    return {
      text: root.textContent?.trim() || '',
      visible: style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0 && box.width > 0 && box.height > 0,
      box: { width: box.width, height: box.height },
      clippedBy,
    };
  }));
}

async function assertAnimatedMetricPreviews(page: Page) {
  // Scope to the two real dark/light preview cards. The development-only
  // compatibility matrix is not a product preview and must not supply this check.
  const metricCards = page.getByText('今日内容生产指数', { exact: true }).locator('xpath=..');
  const metadata = async () => ({
    page: 'appearance-preview',
    route: new URL(page.url()).pathname,
    preset: await page.getByRole('region', { name: '视觉方案预设', exact: true }).getByRole('button', { pressed: true }).textContent(),
    theme: await page.evaluate(() => document.documentElement.classList.contains('light') ? 'light' : 'dark'),
    fontSize: await page.getByRole('combobox', { name: '界面字号', exact: true }).inputValue(),
    viewport: page.viewportSize(),
    motionMode: await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').inputValue(),
  });
  assert(await metricCards.count() === 2, `Animated metric preview cards are not uniquely available: ${JSON.stringify(await metadata())}; matched=${await metricCards.count()}`);
  const context = JSON.stringify(await metadata());
  for (const card of await metricCards.all()) {
    await card.scrollIntoViewIfNeeded();
    const metric = card.locator('.reactbits-text-safe');
    const unit = card.getByText('%', { exact: true });
    const deadline = Date.now() + 6_000;
    let reachedTarget = false;
    while (Date.now() < deadline && !reachedTarget) {
      const diagnostics = await readMetricPreviewDiagnostics(metric);
      reachedTarget = await metric.count() === 1
        && await unit.count() === 1
        && diagnostics[0]?.text === '86'
        && diagnostics[0]?.visible
        && await unit.isVisible();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    }
    const diagnostics = await readMetricPreviewDiagnostics(metric);
    assert(reachedTarget, `Animated metric did not reach its business target 86% within 6 seconds: ${context}; metrics=${JSON.stringify(diagnostics)}`);
    for (let sample = 0; sample < 3; sample += 1) {
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      const terminal = await readMetricPreviewDiagnostics(metric);
      assert(terminal.length === 1 && terminal[0].text === '86' && terminal[0].visible && await unit.isVisible(), `Animated metric visibly regressed after reaching 86%: ${context}; metrics=${JSON.stringify(terminal)}`);
    }
    assert(diagnostics.length === 1 && diagnostics[0].visible && diagnostics[0].box.width > 0 && diagnostics[0].box.height > 0 && diagnostics[0].clippedBy.length === 0, `Animated metric is clipped: ${context}; metrics=${JSON.stringify(diagnostics)}`);
  }
}

async function assertCanvasHostIsolation(page: Page) {
  const audit = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const backgroundHosts = Array.from(document.querySelectorAll('.pointer-events-none.absolute.inset-0.overflow-hidden')) as HTMLElement[];
    const hostCounts = backgroundHosts.map((host) => ({
      canvasCount: host.querySelectorAll('canvas').length,
      visibleCanvasCount: Array.from(host.querySelectorAll('canvas')).filter((canvas) => {
        const box = canvas.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(canvas).visibility !== 'hidden';
      }).length,
    }));
    const interactionCanvases = canvases.filter((canvas) => Boolean(canvas.closest('[data-reactbits-button]') && canvas.parentElement?.classList.contains('pointer-events-none') && canvas.parentElement?.classList.contains('-inset-5') && canvas.parentElement?.classList.contains('z-[1]')));
    const unhosted = canvases.filter((canvas) => !canvas.closest('[data-testid="reactbits-compatibility-matrix"]') && !canvas.closest('[data-reactbits-scene]') && !canvas.closest('.pointer-events-none.absolute.inset-0.overflow-hidden') && !(canvas.closest('[data-reactbits-button]') && canvas.parentElement?.classList.contains('pointer-events-none') && canvas.parentElement?.classList.contains('-inset-5') && canvas.parentElement?.classList.contains('z-[1]')));
    const sceneCounts = Array.from(document.querySelectorAll('[data-reactbits-scene]')).map((scene) => Array.from(scene.querySelectorAll('canvas')).filter((canvas) => !(canvas.closest('[data-reactbits-button]') && canvas.parentElement?.classList.contains('pointer-events-none') && canvas.parentElement?.classList.contains('-inset-5') && canvas.parentElement?.classList.contains('z-[1]'))).length);
    return { total: canvases.length, hostCounts, sceneCounts, interactionCanvases: interactionCanvases.length, unhosted: unhosted.length };
  });
  assert(audit.unhosted === 0, `Canvas without a React Bits host: ${JSON.stringify(audit)}`);
  assert(audit.hostCounts.every((host) => host.canvasCount <= 1 && host.visibleCanvasCount <= 1), `Background host has duplicate canvases: ${JSON.stringify(audit)}`);
  assert(audit.sceneCounts.every((count) => count <= 1), `Page Scene has duplicate canvases: ${JSON.stringify(audit)}`);
  console.log(`[reactbits-theme] canvas host audit: ${JSON.stringify(audit)}`);
}

async function run() {
  if (!username || !password) {
    console.log('未提供认证测试环境变量，跳过认证态测试');
    return;
  }
  assertLocalUrl(baseUrl);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await login(page);
    const heroButton = page.getByRole('button', { name: /进入选题池/ }).first();
    await heroButton.waitFor({ timeout: 15_000 });
    const heroBox = await heroButton.boundingBox();
    assert(heroBox && heroBox.width > 0 && heroBox.height >= 32, 'Home Hero button is clipped or unavailable');
    await heroButton.click();
    await page.waitForFunction(() => new URL(window.location.href).pathname === '/topics', undefined, { timeout: 10_000 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await waitForAuthenticatedHome(page);
    const headings = page.getByRole('heading', { name: /内容生产驾驶舱/ });
    assert(await headings.count() === 1, `expected one Home main heading, received ${await headings.count()}`);
    const heading = headings.first();
    assert(await heading.locator('h1, h2, h3, h4, h5, h6').count() === 0, 'Home main heading contains a nested heading');
    await waitForElementGeometryStable(heading);
    await assertTextNotClipped(heading);
    await page.goto(`${baseUrl}/notification-settings`, { waitUntil: 'domcontentloaded' });
    await dismissSystemUpdateDialog(page);
    const appearanceSettings = page.getByRole('button', { name: '外观与动效', exact: true });
    await appearanceSettings.waitFor({ state: 'visible', timeout: 15_000 });
    await appearanceSettings.click();
    await page.getByText('React Bits 原生动效外观中心', { exact: true }).waitFor();
    const themeControl = page.getByRole('combobox', { name: '主题', exact: true });
    assert(await themeControl.count() === 1, 'Theme combobox is not uniquely accessible by its label');
    const advancedSettings = page.getByText('高级设置', { exact: true }).locator('..');
    await advancedSettings.locator('summary').click();
    assert(await page.getByRole('combobox', { name: '动效强度', exact: true }).count() === 1, 'Motion combobox is not accessible');

    for (const themeButton of ['深色模式', '浅色模式']) {
      const theme = page.getByRole('button', { name: themeButton, exact: true });
      if (await theme.count()) await theme.click();
      await page.getByText(themeButton === '深色模式' ? '深色真实预览' : '浅色真实预览', { exact: true }).waitFor();
      await assertButtonPresentation(page);
    }

    const presetRegion = page.getByRole('region', { name: '视觉方案预设', exact: true });
    assert(await presetRegion.count() === 1, 'React Bits preset region is not uniquely available');
    const presetButtons = presetRegion.getByRole('button');
    const expectedPresets = ['岚曜极光', '深空科技', '丝绸创意', '线性协作', '极简无扰', '自由搭配'];
    assert(await presetButtons.count() === expectedPresets.length, `expected ${expectedPresets.length} preset buttons, received ${await presetButtons.count()}`);
    const compatibilityMatrix = page.getByTestId('reactbits-compatibility-matrix');
    assert(await presetButtons.evaluateAll((nodes) => nodes.every((node) => !node.closest('[data-testid="reactbits-compatibility-matrix"]'))), 'Preset locator includes compatibility matrix buttons');
    assert(await compatibilityMatrix.count() === 1, 'React Bits compatibility matrix is not uniquely available');
    for (const preset of expectedPresets) {
      const presetButton = presetRegion.getByRole('button', { name: new RegExp(`^${preset}`) });
      assert(await presetButton.count() === 1, `preset is not uniquely available: ${preset}`);
      await presetButton.click();
      assert(await presetButton.getAttribute('aria-pressed') === 'true', `preset selection was not applied: ${preset}`);
      assert(await page.getByText('页面出错了', { exact: true }).count() === 0, `error boundary after preset=${preset}`);
    }

    const fontSizeControl = page.getByRole('combobox', { name: '界面字号', exact: true });
    const originalFontSize = await fontSizeControl.evaluate((node) => (node as HTMLSelectElement).value);
    let fontSizeTestError: unknown;
    try {
      for (const fontSize of fontSizes) {
        const appliedBeforeSave = await getTypography(page);
        await selectInterfaceFontSize(page, String(fontSize));
        const draftTypography = await getTypography(page);
        assert(draftTypography.business === appliedBeforeSave.business, `Draft font size unexpectedly changed global business typography: ${draftTypography.business}`);
        assert(draftTypography.root === '16px', `Root font size changed during draft selection: ${draftTypography.root}`);
        await saveInterfaceFontSize(page, String(fontSize));
        await assertNoOverflow(page, 1440, 900);
        await assertNoOverflow(page, 1024, 768);
        await assertNoOverflow(page, 390, 844);
      }

      await selectInterfaceFontSize(page, '20');
      await saveInterfaceFontSize(page, '20');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await dismissSystemUpdateDialog(page);
      const reloadedAppearance = page.getByRole('button', { name: '外观与动效', exact: true });
      await reloadedAppearance.waitFor({ state: 'visible', timeout: 15_000 });
      await reloadedAppearance.click();
      await page.getByText('React Bits 原生动效外观中心', { exact: true }).waitFor();
      assert(await fontSizeControl.evaluate((node) => (node as HTMLSelectElement).value) === '20', 'Saved font size was not restored after reload');
      const persistedTypography = await getTypography(page);
      assert(persistedTypography.root === '16px' && persistedTypography.business === '20px', `Saved font size was not restored after reload: ${JSON.stringify(persistedTypography)}`);

      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      await waitForAuthenticatedHome(page);
      const homeTypography = await getTypography(page);
      assert(homeTypography.root === '16px' && homeTypography.business === '20px', `Saved font size was not preserved on Home: ${JSON.stringify(homeTypography)}`);

      await page.goto(`${baseUrl}/notification-settings`, { waitUntil: 'domcontentloaded' });
      await dismissSystemUpdateDialog(page);
      await reloadedAppearance.waitFor({ state: 'visible', timeout: 15_000 });
      await reloadedAppearance.click();
      await page.getByText('React Bits 原生动效外观中心', { exact: true }).waitFor();
      assert(await fontSizeControl.evaluate((node) => (node as HTMLSelectElement).value) === '20', 'Saved font size was not preserved when returning to settings');
    } catch (error) {
      fontSizeTestError = error;
      throw error;
    } finally {
      try {
        await selectInterfaceFontSize(page, originalFontSize);
        await saveInterfaceFontSize(page, originalFontSize);
      } catch (restoreError) {
        if (!fontSizeTestError) throw restoreError;
        console.error(`[reactbits-theme] font-size restoration failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
      }
    }
    await selectField(page, '标题文本动画', 'true-focus');
    await assertNoOverflow(page, 390, 844);
    await assertAnimatedMetricPreviews(page);
    await assertButtonPresentation(page);

    await selectField(page, '主按钮外观', 'specular-button');
    await selectField(page, '按钮交互', 'magnet');
    await assertButtonPresentation(page);
    await selectField(page, '主按钮外观', 'star-border');
    await selectField(page, '按钮交互', 'click-spark');
    await assertButtonPresentation(page);
    await selectField(page, '按钮交互', 'glare-hover');
    await assertButtonPresentation(page);

    for (const motion of ['off', 'reduced', 'balanced', 'full']) {
      await page.getByRole('combobox', { name: '动效强度', exact: true }).selectOption(motion);
      assert(await page.getByRole('combobox', { name: '动效强度', exact: true }).inputValue() === motion, `motion mode was not applied: ${motion}`);
    }
    const workflowApply = page.getByRole('checkbox', { name: '应用到Workflow', exact: true });
    const workflowBefore = await workflowApply.isChecked();
    await workflowApply.setChecked(!workflowBefore);
    assert(await workflowApply.isChecked() !== workflowBefore, 'applyTo.workflow did not update through the real control');

    const exportButton = page.getByRole('button', { name: '导出配置', exact: true });
    const download = page.waitForEvent('download');
    await exportButton.click();
    const exported = await download;
    const exportedText = await exported.createReadStream().then(async (stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString('utf8');
    });
    assert(!/token|credential|业务数据/i.test(exportedText), 'Appearance export contains sensitive or business data');
    const invalidImport = await page.getByLabel('导入外观配置文件').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"invalid":true}') });
    void invalidImport;
    await page.getByText('配置格式无效，未导入。', { exact: true }).waitFor();

    for (let cycle = 0; cycle < 5; cycle += 1) {
      for (const preset of ['岚曜极光', '丝绸创意', '线性协作', '极简无扰']) {
        const presetButton = presetRegion.getByRole('button', { name: new RegExp(`^${preset}`) });
        await presetButton.click();
        assert(await presetButton.getAttribute('aria-pressed') === 'true', `canvas lifecycle preset was not selected: ${preset}`);
        await assertCanvasHostIsolation(page);
      }
    }
    assert(await page.getByText('页面出错了', { exact: true }).count() === 0, 'React error boundary is visible');
    await page.getByRole('button', { name: '保存外观与动效', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissSystemUpdateDialog(page);
    const reloadedAppearanceSettings = page.getByRole('button', { name: '外观与动效', exact: true });
    await reloadedAppearanceSettings.waitFor({ state: 'visible', timeout: 15_000 });
    await reloadedAppearanceSettings.click();
    await page.getByText('React Bits 原生动效外观中心', { exact: true }).waitFor();
    await page.getByRole('button', { name: '恢复默认', exact: true }).click();
    await page.getByRole('button', { name: '保存外观与动效', exact: true }).click();
    assert(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(`[reactbits-theme] ${error.message}`); process.exitCode = 1; });
