import { chromium, type Page } from 'playwright';

const baseUrl = process.env.XMT_E2E_BASE_URL || 'http://localhost:5174';
const username = process.env.XMT_E2E_USERNAME;
const password = process.env.XMT_E2E_PASSWORD;
const fontSizes = ['14', '16', '18', '20', '22', '24'];
const presetNames = {
  aurora: '岚曜极光',
  'deep-space': '深空科技',
  silk: '丝绸创意',
  linear: '线性协作',
  minimal: '极简无扰',
  custom: '自由搭配',
} as const;
type PresetId = keyof typeof presetNames;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalUrl(url: string) {
  const host = new URL(url).hostname;
  assert(host === 'localhost' || host === '127.0.0.1', `refusing non-local test target: ${host}`);
}

async function dismissSystemUpdateDialog(page: Page) {
  const dialog = page.locator('div.fixed.inset-0').filter({
    has: page.getByText('系统更新', { exact: true }),
  }).filter({
    has: page.getByRole('button', { name: '我知道了', exact: true }),
  });
  const acknowledgement = dialog.first().getByRole('button', { name: '我知道了', exact: true });
  await acknowledgement.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => undefined);
  if (!await acknowledgement.isVisible().catch(() => false)) return;
  await acknowledgement.click();
  await dialog.first().waitFor({ state: 'hidden', timeout: 5_000 });
}

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]').first().fill(username!);
  await page.locator('input[name="password"], input[autocomplete="current-password"], input[type="password"]').first().fill(password!);
  await page.locator('button[type="submit"], button:has-text("登录")').first().click();
  await page.getByText('内容生产驾驶舱', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await dismissSystemUpdateDialog(page);
}

async function openCreatorFromNavigation(page: Page) {
  if ((page.viewportSize()?.width || 0) < 768) {
    const openNavigation = page.getByRole('button', { name: '打开导航菜单', exact: true });
    assert(await openNavigation.count() === 1, 'Mobile navigation trigger is not uniquely available');
    await openNavigation.click();
    await page.getByRole('button', { name: '关闭导航菜单', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  }
  const section = page.getByRole('button', { name: '抖音运营中心', exact: true });
  await section.waitFor({ state: 'visible', timeout: 15_000 });
  if (await section.getAttribute('aria-expanded') !== 'true') await section.click();
  const dashboard = page.getByRole('button', { name: '数据驾驶舱', exact: true });
  await dashboard.waitFor({ state: 'visible', timeout: 10_000 });
  await dashboard.click();
  await page.waitForFunction(() => new URL(window.location.href).pathname === '/analytics/creator-center', undefined, { timeout: 10_000 });
  await page.locator('[data-reactbits-scene="creator"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('heading', { name: '抖音数据驾驶舱', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
}

async function openAnalyticsFromCommandPalette(page: Page) {
  await page.keyboard.press('Meta+k');
  const command = page.getByRole('button', { name: '实时数据看板', exact: true });
  assert(await command.count() === 1, 'Analytics command is not uniquely available');
  await command.click();
  await page.locator('[data-reactbits-scene="analytics"]').waitFor({ state: 'visible', timeout: 15_000 });
  const title = analyticsTitle(page);
  await title.waitFor({ state: 'visible', timeout: 15_000 });
  assert(await title.count() === 1, `Analytics title is not unique: ${await title.count()}`);
}

async function openAppearance(page: Page) {
  await page.goto(`${baseUrl}/notification-settings`, { waitUntil: 'domcontentloaded' });
  await dismissSystemUpdateDialog(page);
  const tab = page.getByRole('button', { name: '外观与动效', exact: true });
  await tab.waitFor({ state: 'visible', timeout: 15_000 });
  await tab.click();
  await page.getByText('React Bits 原生动效外观中心', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
}

async function selectAppearanceField(page: Page, label: string, value: string) {
  const control = page.locator('label').filter({ hasText: label }).getByRole('combobox');
  assert(await control.count() === 1, `appearance field is not uniquely available: ${label}`);
  await control.selectOption(value);
  assert(await control.inputValue() === value, `appearance field was not selected: ${label}=${value}`);
}

async function saveAppearance(page: Page) {
  await page.getByRole('button', { name: '保存外观与动效', exact: true }).click();
}

async function savePersonalPreferences(page: Page) {
  await page.getByRole('button', { name: '保存个人偏好', exact: true }).click();
}

function appearancePanel(page: Page) {
  return page.getByRole('heading', { name: '外观与动效', exact: true }).locator('xpath=../..');
}

function themeCombobox(page: Page) {
  // Temporary structural locator: the theme select has no accessible name.
  // Keep it scoped to the Appearance panel and require unique light/dark options.
  return appearancePanel(page).locator('select:has(option[value="light"]):has(option[value="dark"])');
}

function themeButton(page: Page, theme: 'light' | 'dark') {
  const name = theme === 'light' ? '浅色模式' : '深色模式';
  return page.getByRole('button', { name: new RegExp(`^${name}(?:\\s|$)`) });
}

function analyticsTitle(page: Page) {
  // Presets may render the title with a cursor or a duplicated animated text
  // layer; the semantic Analytics h1 remains the unique business heading.
  return page.locator('h1').filter({ hasText: /数据复盘/ });
}

async function getThemeMode(page: Page) {
  const control = themeCombobox(page);
  assert(await control.count() === 1, 'Theme combobox is not uniquely available');
  const value = await control.inputValue();
  assert(value === 'light' || value === 'dark', `Unknown theme value: ${value}`);
  return value;
}

async function logComboboxDiagnostics(page: Page) {
  const diagnostics = await page.getByRole('combobox').evaluateAll((nodes) => nodes.map((node) => {
    const control = node as HTMLSelectElement;
    const label = control.closest('label');
    const heading = control.closest('div')?.parentElement?.querySelector('h2, h3')?.textContent?.trim() || '';
    return { accessibleName: control.getAttribute('aria-label') || label?.textContent?.trim() || '', id: control.id, name: control.name, value: control.value, label: label?.textContent?.trim() || '', heading, visible: Boolean(control.offsetParent) };
  }));
  console.log(`[reactbits-scene] comboboxes: ${JSON.stringify(diagnostics)}`);
}

async function setThemeMode(page: Page, theme: 'light' | 'dark') {
  const button = themeButton(page, theme);
  assert(await button.count() === 1, `Theme action is not uniquely available: ${theme}`);
  await button.click();
  assert(await getThemeMode(page) === theme, `Theme draft was not selected: ${theme}`);
  await savePersonalPreferences(page);
  await page.waitForFunction((expected) => document.documentElement.classList.contains(expected), theme, { timeout: 10_000 });
}

async function getPresetId(page: Page): Promise<PresetId> {
  const region = page.getByRole('region', { name: '视觉方案预设', exact: true });
  for (const [id, name] of Object.entries(presetNames) as Array<[PresetId, string]>) {
    const button = region.getByRole('button', { name: new RegExp(`^${name}(?:\\s|$)`) });
    if (await button.getAttribute('aria-pressed') === 'true') return id;
  }
  throw new Error('No saved React Bits preset is selected');
}

async function selectPreset(page: Page, presetId: PresetId) {
  const button = page.getByRole('region', { name: '视觉方案预设', exact: true }).getByRole('button', {
    name: new RegExp(`^${presetNames[presetId]}(?:\\s|$)`),
  });
  assert(await button.count() === 1, `Preset is not uniquely available: ${presetId}`);
  await button.click();
  assert(await button.getAttribute('aria-pressed') === 'true', `Preset was not selected: ${presetId}`);
}

async function logThemeButtons(page: Page) {
  const details = await page.getByRole('button').evaluateAll((nodes) => nodes
    .filter((node) => /^(浅色模式|深色模式)(\s|$)/.test((node as HTMLElement).innerText.trim()))
    .map((node) => ({ name: (node as HTMLElement).innerText.trim().replace(/\s+/g, ' '), ariaPressed: node.getAttribute('aria-pressed'), ariaSelected: node.getAttribute('aria-selected'), className: node.className })));
  console.log(`[reactbits-scene] theme actions: ${JSON.stringify(details)}`);
}

async function assertNoOverflow(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const result = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert(result.scrollWidth <= result.clientWidth, `${width}x${height} has horizontal overflow`);
}

async function inspectCreatorProfileImages(profile: ReturnType<Page['locator']>) {
  return profile.getByRole('img').evaluateAll((nodes) => nodes.map((node) => {
    const image = node as HTMLImageElement;
    const box = image.getBoundingClientRect();
    const parent = image.parentElement;
    const src = image.currentSrc || image.src;
    return {
      alt: image.alt,
      ariaLabel: image.getAttribute('aria-label'),
      source: src.startsWith('data:') ? 'data' : src.startsWith('blob:') ? 'blob' : src.startsWith('http') ? new URL(src).host : 'local',
      box: { width: Math.round(box.width), height: Math.round(box.height) },
      objectFit: getComputedStyle(image).objectFit,
      parentClass: parent?.className || '',
      isAccountAvatar: /mini avatar$/i.test(image.alt),
    };
  }));
}

async function waitForLoadedImage(image: ReturnType<Page['locator']>) {
  assert(await image.count() === 1, 'Expected one semantic image before waiting for load');
  await image.scrollIntoViewIfNeeded();
  await image.waitFor({ state: 'visible', timeout: 5_000 });
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = await image.evaluate(async (node) => {
      const img = node as HTMLImageElement;
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) return true;
      try { await img.decode(); } catch { return false; }
      return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
    });
    if (state) return;
    await image.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  throw new Error('Creator mini avatar did not reach a loaded state within 5 seconds');
}

async function assertCreatorStructure(page: Page) {
  const scene = page.locator('[data-reactbits-scene="creator"]');
  assert(await scene.count() === 1, 'Creator page scene is not unique');
  const headings = page.getByRole('heading', { name: '抖音数据驾驶舱', exact: true });
  assert(await headings.count() === 1, `expected one Creator title, received ${await headings.count()}`);
  const heading = headings.first();
  const headingBox = await heading.boundingBox();
  assert(headingBox && headingBox.width > 0 && headingBox.height > 0, 'Creator title is clipped or unavailable');

  const profile = page.locator('[aria-label="创作者账号概览"]');
  assert(await profile.count() === 1, 'Creator profile is not uniquely available');
  await profile.waitFor({ state: 'visible', timeout: 15_000 });
  const imageDiagnostics = await inspectCreatorProfileImages(profile);
  console.log(`[reactbits-scene] creator-profile images: ${JSON.stringify(imageDiagnostics)}`);
  const profileAvatar = profile.getByRole('img', { name: /mini avatar$/i });
  assert(await profileAvatar.count() === 1, 'Creator account avatar is not uniquely available by its accessible name');
  await waitForLoadedImage(profileAvatar);
  const avatar = await profileAvatar.evaluate((node) => {
    const image = node as HTMLImageElement;
    const box = image.getBoundingClientRect();
    const parentBox = image.parentElement?.getBoundingClientRect();
    return {
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      objectFit: getComputedStyle(image).objectFit,
      width: box.width,
      height: box.height,
      parentWidth: parentBox?.width || 0,
      parentHeight: parentBox?.height || 0,
    };
  });
  assert(avatar.complete && avatar.naturalWidth > 0 && avatar.naturalHeight > 0, 'Creator account avatar did not load');
  assert(avatar.objectFit === 'cover', `Creator account avatar no longer uses cover crop: ${avatar.objectFit}`);
  assert(avatar.width > 0 && avatar.height > 0 && avatar.parentWidth > 0 && avatar.parentHeight > 0, 'Creator account avatar has invalid geometry');
  assert(avatar.width / avatar.height >= 0.95 && avatar.width / avatar.height <= 1.05, `Creator account avatar is no longer square: ${avatar.width}x${avatar.height}`);

  const metrics = page.getByTestId('creator-core-metrics');
  assert(await metrics.count() === 1, 'Creator core metrics are not uniquely available');
  for (const label of ['粉丝', '入库作品', '累计播放', '互动率']) {
    const metric = metrics.getByText(label, { exact: true }).first();
    await metric.waitFor({ state: 'visible', timeout: 10_000 });
    const parent = metric.locator('..');
    const box = await parent.boundingBox();
    assert(box && box.width > 0 && box.height > 0, `Creator metric is not measurable: ${label}`);
  }

  const topWorks = page.getByRole('heading', { name: '作品表现 TOP 5', exact: true });
  assert(await topWorks.count() === 1, 'Creator TOP 5 heading is unavailable');
  const binding = page.getByRole('button', { name: '创建一次性绑定码', exact: true });
  assert(await binding.count() === 1, 'Creator binding entry is unavailable');
  assert(await binding.isEnabled(), 'Creator binding entry is unexpectedly disabled');
  assert(await page.getByText('页面出错了', { exact: true }).count() === 0, 'React error boundary is visible');
}

async function assertCanvasHealth(page: Page, maximum: number) {
  const canvases = await page.locator('[data-reactbits-scene="creator"] canvas').count();
  assert(canvases <= maximum, `Creator scene has duplicate canvases: ${canvases}`);
}

async function assertAnalyticsInitialStructure(page: Page) {
  const scene = page.locator('[data-reactbits-scene="analytics"]');
  assert(await scene.count() === 1, 'Analytics page scene is not unique');
  const heading = analyticsTitle(page);
  assert(await heading.count() === 1, `expected one Analytics title, received ${await heading.count()}`);
  const headingBox = await heading.boundingBox();
  assert(headingBox && headingBox.width > 0 && headingBox.height > 0, 'Analytics title is clipped or unavailable');

  const navigation = page.locator('[data-reactbits-navigation^="analytics-dimensions:"]');
  assert(await navigation.count() === 1, 'Analytics dimensions navigation is not unique');
  for (const label of ['数据复盘', '数据导出', '周报生成']) {
    const tab = navigation.getByRole('button', { name: label, exact: true });
    assert(await tab.count() === 1 && await tab.isVisible(), `Analytics tab is unavailable: ${label}`);
  }

  for (const label of ['本月完成', '完成率', '逾期率', '平均耗时', '播放量', '点赞量', '分享量', '评论量']) {
    const metric = page.getByText(label, { exact: true });
    assert(await metric.count() === 1 && await metric.isVisible(), `Analytics metric is unavailable: ${label}`);
  }

  const selects = page.locator('select');
  assert(await selects.count() === 3, `expected three Analytics filter selects, received ${await selects.count()}`);
  const topicSelect = page.locator('select').filter({ has: page.getByRole('option', { name: '选择一个已完成选题', exact: true }) });
  assert(await topicSelect.count() === 1 && await topicSelect.isVisible(), 'Analytics topic filter is unavailable');

  const ranking = page.getByRole('heading', { name: '个人统计排行', exact: true });
  assert(await ranking.count() === 1, 'Analytics personal ranking heading is unavailable');
  const tableScroll = ranking.locator('xpath=..').locator('div.overflow-x-auto');
  assert(await tableScroll.count() === 1, 'Analytics personal ranking lost its horizontal scroll container');
  const heatmap = page.locator('[data-analytics-runtime="heatmap"]');
  assert(await heatmap.count() === 1 && await heatmap.isVisible(), 'Analytics heatmap runtime is unavailable');
  await page.getByRole('heading', { name: '协作热力图', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await assertNoOverflow(page, 1440, 900);
  assert(await page.getByText('页面出错了', { exact: true }).count() === 0, 'React error boundary is visible');
}

type AnalyticsMetric = { label: string; value: string; unit: string; clippedBy: string[] };

async function readAnalyticsMetrics(page: Page): Promise<AnalyticsMetric[]> {
  return page.evaluate(() => {
    const labels = ['本月完成', '完成率', '逾期率', '平均耗时', '播放量', '点赞量', '分享量', '评论量'];
    return labels.map((label) => {
      const labelElement = Array.from(document.querySelectorAll<HTMLElement>('p, span')).find((node) => node.textContent?.trim() === label);
      if (!labelElement) throw new Error(`Analytics metric label not found: ${label}`);
      // CardSlot has no test-only attribute: derive the semantic card boundary
      // from the largest ancestor that still contains exactly this one metric.
      // This intentionally stops before the metric grid/page shell.
      let card: HTMLElement = labelElement;
      for (let parent = labelElement.parentElement; parent; parent = parent.parentElement) {
        const metricLabels = Array.from(parent.querySelectorAll<HTMLElement>('p, span')).filter((node) => labels.includes(node.textContent?.trim() || '')).length;
        if (metricLabels !== 1) break;
        card = parent;
      }
      const valueElement = card.querySelector<HTMLElement>('.reactbits-text-safe');
      const fallbackParagraph = labelElement.tagName === 'P'
        ? labelElement.nextElementSibling
        : card.querySelector<HTMLElement>('p.text-2xl, p.text-3xl, p.text-xl') || card.querySelector<HTMLElement>('p');
      const valueParagraph = valueElement?.closest('p') || fallbackParagraph as HTMLElement | null;
      const unitElement = valueParagraph?.nextElementSibling instanceof HTMLElement ? valueParagraph.nextElementSibling : null;
      const clippedBy: string[] = [];
      if (valueElement) {
        const rect = valueElement.getBoundingClientRect();
        for (let ancestor = valueElement.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY)) {
            const ancestorRect = ancestor.getBoundingClientRect();
            if (rect.left < ancestorRect.left - 2 || rect.right > ancestorRect.right + 2 || rect.top < ancestorRect.top - 2 || rect.bottom > ancestorRect.bottom + 2) clippedBy.push(`${ancestor.tagName}.${ancestor.className}`);
          }
          if (ancestor === card) break;
        }
      }
      return { label, value: valueElement?.textContent?.trim() || valueParagraph?.textContent?.trim() || '', unit: unitElement?.textContent?.trim() || '', clippedBy };
    });
  });
}

async function assertAnalyticsRuntime(page: Page) {
  const heatmap = page.locator('[data-analytics-runtime="heatmap"]');
  await heatmap.scrollIntoViewIfNeeded();
  const heatmapState = await heatmap.evaluate((node) => {
    const root = node as HTMLElement;
    const box = root.getBoundingClientRect();
    const overflowOrTransforms: string[] = [];
    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.transform !== 'none' || style.filter !== 'none' || style.perspective !== 'none') overflowOrTransforms.push(`${ancestor.tagName}.${ancestor.className}`);
    }
    return { width: box.width, height: box.height, overflowOrTransforms };
  });
  assert(heatmapState.width > 0 && heatmapState.height > 0, `Analytics heatmap has invalid geometry: ${JSON.stringify(heatmapState)}`);
  assert(heatmapState.overflowOrTransforms.length === 0, `Analytics heatmap is inside a runtime-affecting ancestor: ${JSON.stringify(heatmapState)}`);

  const ranking = page.getByRole('heading', { name: '个人统计排行', exact: true });
  const tableScroll = ranking.locator('xpath=..').locator('div.overflow-x-auto');
  const tableState = await tableScroll.evaluate((node) => {
    const element = node as HTMLElement;
    const before = element.scrollLeft;
    if (element.scrollWidth > element.clientWidth) element.scrollLeft = Math.min(32, element.scrollWidth - element.clientWidth);
    return { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, before, after: element.scrollLeft };
  });
  assert(tableState.scrollWidth <= tableState.clientWidth || tableState.after > tableState.before, `Analytics ranking local scroll is not usable: ${JSON.stringify(tableState)}`);

  const metrics = await readAnalyticsMetrics(page);
  assert(metrics.every((metric) => metric.value && metric.clippedBy.length === 0), `Analytics metric is missing or clipped: ${JSON.stringify(metrics)}`);
  return metrics;
}

async function assertAnalyticsCanvasOwnership(page: Page, expectedMaximum: number) {
  const facts = await page.evaluate(() => Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
    inAnalyticsScene: Boolean(canvas.closest('[data-reactbits-scene="analytics"]')),
    inReactBitsButton: Boolean(canvas.closest('[data-reactbits-button]')),
    parentClasses: canvas.parentElement ? Array.from(canvas.parentElement.classList) : [],
  })));
  const interaction = facts.filter((canvas) => canvas.inReactBitsButton && canvas.parentClasses.includes('pointer-events-none') && canvas.parentClasses.includes('-inset-5') && canvas.parentClasses.includes('z-[1]'));
  const audit = {
    total: facts.length,
    scene: facts.filter((canvas) => canvas.inAnalyticsScene).length,
    interaction: interaction.length,
    unknown: facts.filter((canvas) => !canvas.inAnalyticsScene && !interaction.includes(canvas)).length,
  };
  assert(audit.scene <= expectedMaximum, `Analytics scene background duplicated: ${JSON.stringify(audit)}`);
  assert(audit.unknown === 0, `Analytics has UNKNOWN canvas: ${JSON.stringify(audit)}`);
  return audit;
}

async function assertAnalyticsButtons(page: Page) {
  for (const name of ['导出报表', '录入数据']) {
    const button = page.getByRole('button', { name, exact: true });
    assert(await button.count() === 1 && await button.isEnabled(), `Analytics business button is not available: ${name}`);
    const box = await button.boundingBox();
    const state = await button.evaluate((node) => {
      const style = getComputedStyle(node as HTMLElement);
      return { color: style.color, visible: style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0 };
    });
    assert(Boolean(box && box.width > 0 && box.height >= 32 && state.visible && state.color), `Analytics business button is not readable: ${name}`);
  }
}

async function assertAnalyticsSelectors(page: Page) {
  const selects = page.locator('[data-reactbits-scene="analytics"] select');
  assert(await selects.count() === 3, `Analytics selector matrix expected three selects, received ${await selects.count()}`);
  const originalValues = await selects.evaluateAll((nodes) => nodes.map((node) => (node as HTMLSelectElement).value));
  for (let index = 0; index < 3; index += 1) {
    const select = selects.nth(index);
    const options = await select.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: (node as HTMLOptionElement).value, disabled: (node as HTMLOptionElement).disabled })));
    const candidate = options.find((option) => !option.disabled && option.value !== originalValues[index]);
    if (!candidate) continue;
    await select.selectOption(candidate.value);
    assert(await select.inputValue() === candidate.value, `Analytics selector did not change: ${index}`);
  }
  for (let index = 0; index < 3; index += 1) {
    await selects.nth(index).selectOption(originalValues[index]);
    assert(await selects.nth(index).inputValue() === originalValues[index], `Analytics selector did not restore: ${index}`);
  }
}

async function assertAnalyticsModal(page: Page) {
  const trigger = page.getByRole('button', { name: '录入数据', exact: true });
  await trigger.click();
  const title = page.getByRole('heading', { name: '录入数据', exact: true });
  await title.waitFor({ state: 'visible', timeout: 10_000 });
  const close = page.getByRole('button', { name: '关闭弹窗', exact: true });
  assert(await close.count() === 1 && await close.isVisible(), 'Analytics FormModal close control is unavailable');
  await close.click();
  await title.waitFor({ state: 'hidden', timeout: 10_000 });
}

async function diagnoseLinearAnalyticsHeading(page: Page, errors: string[]) {
  await openAppearance(page);
  const originalTheme = await getThemeMode(page);
  const originalPreset = await getPresetId(page);
  const originalMotionMode = await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').inputValue();
  const originalFontSize = await page.getByRole('combobox', { name: '界面字号', exact: true }).inputValue();
  const analyticsApply = page.getByLabel('应用到Analytics', { exact: true });
  const originalAnalyticsApply = await analyticsApply.isChecked();
  try {
    for (let round = 1; round <= 3; round += 1) {
      await openAppearance(page);
      await selectPreset(page, 'linear');
      await saveAppearance(page);
      const startedAt = Date.now();
      await page.keyboard.press('Meta+k');
      const command = page.getByRole('button', { name: '实时数据看板', exact: true });
      assert(await command.count() === 1, 'Analytics command is not uniquely available during linear heading diagnosis');
      await command.click();
      const samples: Array<Record<string, unknown>> = [];
      let headingVisible = false;
      while (Date.now() - startedAt < 16_000 && !headingVisible) {
        const title = page.locator('h1').filter({ hasText: '数据复盘' });
        const attached = await title.count() === 1;
        if (attached) await title.scrollIntoViewIfNeeded();
        const state = await page.evaluate(() => {
          const heading = Array.from(document.querySelectorAll('h1')).find((node) => node.textContent?.includes('数据复盘')) as HTMLElement | undefined;
          const box = heading?.getBoundingClientRect();
          const style = heading ? getComputedStyle(heading) : null;
          const updateDialog = Array.from(document.querySelectorAll<HTMLElement>('div.fixed.inset-0')).some((node) => node.innerText.includes('系统更新'));
          const overlays = Array.from(document.querySelectorAll<HTMLElement>('[class*="fixed"]')).filter((node) => {
            const computed = getComputedStyle(node);
            return computed.position === 'fixed' && computed.visibility !== 'hidden' && Number(computed.opacity) > 0;
          }).length;
          return {
            url: window.location.pathname,
            readyState: document.readyState,
            scene: document.querySelectorAll('[data-reactbits-scene="analytics"]').length,
            allH1: Array.from(document.querySelectorAll('h1')).map((node) => ({ text: node.textContent, ariaLabel: node.getAttribute('aria-label'), role: node.getAttribute('role') })),
            headingCount: Array.from(document.querySelectorAll('h1')).filter((node) => node.textContent?.includes('数据复盘')).length,
            heading: heading ? { text: heading.textContent, display: style?.display, visibility: style?.visibility, opacity: style?.opacity, transform: style?.transform, clipPath: style?.clipPath, filter: style?.filter, ariaHidden: heading.getAttribute('aria-hidden'), width: box?.width || 0, height: box?.height || 0, top: box?.top || 0 } : null,
            navigation: document.querySelectorAll('[data-reactbits-navigation^="analytics-dimensions:"]').length,
            metrics: ['本月完成', '完成率', '逾期率', '平均耗时', '播放量', '点赞量', '分享量', '评论量'].filter((label) => Array.from(document.querySelectorAll('p,span')).some((node) => node.textContent?.trim() === label)).length,
            toolbar: Array.from(document.querySelectorAll('button')).filter((node) => node.textContent?.includes('录入数据')).length,
            loading: document.querySelectorAll('.animate-spin').length,
            updateDialog,
            overlays,
          };
        });
        samples.push({ elapsedMs: Date.now() - startedAt, attached, ...state });
        headingVisible = attached && Boolean(state.heading && state.heading.width > 0 && state.heading.height > 0 && state.heading.visibility !== 'hidden' && state.heading.display !== 'none' && Number(state.heading.opacity) > 0);
        if (!headingVisible) await page.waitForTimeout(1_000);
      }
      console.log(`[reactbits-scene] linear heading round=${round}: ${JSON.stringify(samples)}`);
      assert(headingVisible, `Analytics linear heading did not become visible: ${JSON.stringify(samples)}`);
      assert(errors.length === 0, `console errors during linear heading diagnosis: ${errors.slice(0, 3).join(' | ')}`);
    }
  } finally {
    await openAppearance(page);
    await selectPreset(page, originalPreset);
    if (await analyticsApply.isChecked() !== originalAnalyticsApply) await analyticsApply.setChecked(originalAnalyticsApply);
    await selectAppearanceField(page, '动效强度', originalMotionMode);
    await saveAppearance(page);
    await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(originalFontSize);
    await setThemeMode(page, originalTheme);
  }
}

async function runAnalyticsMetricSpecial(page: Page) {
  for (const scenario of [
    { theme: 'dark' as const, fontSize: '16', viewport: { width: 1440, height: 900 } },
    { theme: 'light' as const, fontSize: '16', viewport: { width: 1440, height: 900 } },
    { theme: 'dark' as const, fontSize: '24', viewport: { width: 390, height: 844 } },
    { theme: 'light' as const, fontSize: '24', viewport: { width: 390, height: 844 } },
  ]) {
    await openAppearance(page);
    await setThemeMode(page, scenario.theme);
    await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(scenario.fontSize);
    await savePersonalPreferences(page);
    await openAnalyticsFromCommandPalette(page);
    await page.setViewportSize(scenario.viewport);
    const metrics = await assertAnalyticsRuntime(page);
    console.log(`[reactbits-scene] Analytics metric special ${scenario.theme} ${scenario.viewport.width}x${scenario.viewport.height} ${scenario.fontSize}px: ${JSON.stringify(metrics)}`);
  }
  for (const presetId of ['aurora', 'silk', 'linear', 'minimal'] as PresetId[]) {
    await openAppearance(page);
    await selectPreset(page, presetId);
    await saveAppearance(page);
    await openAnalyticsFromCommandPalette(page);
    const metrics = await assertAnalyticsRuntime(page);
    console.log(`[reactbits-scene] Analytics metric preset ${presetId}: ${JSON.stringify(metrics)}`);
  }
}

async function runAnalyticsMatrix(page: Page, errors: string[], phase: 'metrics' | 'canvas' | 'all') {
  await openAppearance(page);
  const originalTheme = await getThemeMode(page);
  const originalPreset = await getPresetId(page);
  const analyticsApply = page.getByLabel('应用到Analytics', { exact: true });
  const originalAnalyticsApply = await analyticsApply.isChecked();
  const originalMotionMode = await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').inputValue();
  const originalFontSize = await page.getByRole('combobox', { name: '界面字号', exact: true }).inputValue();
  const originalMetrics = await (async () => { await openAnalyticsFromCommandPalette(page); return assertAnalyticsRuntime(page); })();
  let restoreSuccess = false;
  try {
    if (phase === 'metrics') {
      await runAnalyticsMetricSpecial(page);
      assert(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
      return;
    }
    if (phase === 'canvas') {
      for (let cycle = 0; cycle < 5; cycle += 1) {
        for (const presetId of ['aurora', 'silk', 'linear', 'minimal'] as PresetId[]) {
          await openAppearance(page);
          await selectPreset(page, presetId);
          if (!await analyticsApply.isChecked()) await analyticsApply.check();
          await saveAppearance(page);
          await openAnalyticsFromCommandPalette(page);
          const audit = await assertAnalyticsCanvasOwnership(page, presetId === 'minimal' ? 0 : 1);
          console.log(`[reactbits-scene] Analytics canvas cycle=${cycle + 1} preset=${presetId}: ${JSON.stringify(audit)}`);
        }
      }
      await openAppearance(page);
      await selectPreset(page, 'silk');
      if (!await analyticsApply.isChecked()) await analyticsApply.check();
      await saveAppearance(page);
      await openAnalyticsFromCommandPalette(page);
      await assertAnalyticsCanvasOwnership(page, 1);
      for (let cycle = 0; cycle < 5; cycle += 1) {
        await openAppearance(page);
        await selectAppearanceField(page, '动效强度', 'off');
        await saveAppearance(page);
        await openAnalyticsFromCommandPalette(page);
        const offAudit = await assertAnalyticsCanvasOwnership(page, 0);
        await openAppearance(page);
        await selectAppearanceField(page, '动效强度', 'balanced');
        await saveAppearance(page);
        await openAnalyticsFromCommandPalette(page);
        const enabledAudit = await assertAnalyticsCanvasOwnership(page, 1);
        console.log(`[reactbits-scene] Analytics Silk direct-off cycle=${cycle + 1}: off=${JSON.stringify(offAudit)} enabled=${JSON.stringify(enabledAudit)}`);
      }
      assert(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
      return;
    }
    for (const theme of ['dark', 'light'] as const) {
      await openAppearance(page);
      await setThemeMode(page, theme);
      await openAnalyticsFromCommandPalette(page);
      await assertAnalyticsInitialStructure(page);
      await assertAnalyticsRuntime(page);
      await assertAnalyticsButtons(page);
    }

    for (const fontSize of fontSizes) {
      await openAppearance(page);
      await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(fontSize);
      await savePersonalPreferences(page);
      await openAnalyticsFromCommandPalette(page);
      await assertAnalyticsRuntime(page);
      for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) await assertNoOverflow(page, viewport.width, viewport.height);
    }

    for (const presetId of Object.keys(presetNames) as PresetId[]) {
      await openAppearance(page);
      await selectPreset(page, presetId);
      await saveAppearance(page);
      await openAnalyticsFromCommandPalette(page);
      await assertAnalyticsRuntime(page);
      await assertAnalyticsCanvasOwnership(page, presetId === 'minimal' ? 0 : 1);
    }

    for (const motionMode of ['off', 'reduced', 'balanced', 'full']) {
      await openAppearance(page);
      await selectAppearanceField(page, '动效强度', motionMode);
      await saveAppearance(page);
      await openAnalyticsFromCommandPalette(page);
      await assertAnalyticsRuntime(page);
      await assertAnalyticsCanvasOwnership(page, motionMode === 'off' ? 0 : 1);
    }

    await openAppearance(page);
    if (await analyticsApply.isChecked()) await analyticsApply.uncheck();
    await saveAppearance(page);
    await openAnalyticsFromCommandPalette(page);
    await assertAnalyticsRuntime(page);
    await assertAnalyticsCanvasOwnership(page, 0);
    await openAppearance(page);
    if (!await analyticsApply.isChecked()) await analyticsApply.check();
    await saveAppearance(page);
    await openAnalyticsFromCommandPalette(page);
    await assertAnalyticsRuntime(page);

    for (let cycle = 0; cycle < 5; cycle += 1) {
      for (const presetId of ['aurora', 'silk', 'linear', 'minimal'] as PresetId[]) {
        await openAppearance(page);
        await selectPreset(page, presetId);
        await saveAppearance(page);
        await openAnalyticsFromCommandPalette(page);
        await assertAnalyticsRuntime(page);
        await assertAnalyticsCanvasOwnership(page, presetId === 'minimal' ? 0 : 1);
      }
    }

    await openAnalyticsFromCommandPalette(page);
    for (const label of ['数据导出', '周报生成', '数据复盘']) {
      await page.locator('[data-reactbits-navigation^="analytics-dimensions:"]').getByRole('button', { name: label, exact: true }).click();
      await page.getByText(label, { exact: true }).last().waitFor({ state: 'visible', timeout: 10_000 });
    }
    await assertAnalyticsSelectors(page);
    await assertAnalyticsModal(page);
    assert(JSON.stringify(await assertAnalyticsRuntime(page)) === JSON.stringify(originalMetrics), 'Analytics business metrics changed during appearance matrix');
    assert(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await openAppearance(page);
    await selectPreset(page, originalPreset);
    if (await analyticsApply.isChecked() !== originalAnalyticsApply) await analyticsApply.setChecked(originalAnalyticsApply);
    await selectAppearanceField(page, '动效强度', originalMotionMode);
    await saveAppearance(page);
    await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(originalFontSize);
    await setThemeMode(page, originalTheme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissSystemUpdateDialog(page);
    await page.getByRole('button', { name: '外观与动效', exact: true }).click();
    restoreSuccess = await getThemeMode(page) === originalTheme && await getPresetId(page) === originalPreset && await analyticsApply.isChecked() === originalAnalyticsApply;
    assert(restoreSuccess, 'Analytics appearance state did not restore after matrix');
    console.log(`[reactbits-scene] Analytics appearance restoreSuccess=${restoreSuccess}`);
  }
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
    if (process.env.XMT_SCENE_TARGET === 'analytics') {
      await openAnalyticsFromCommandPalette(page);
      await assertAnalyticsInitialStructure(page);
      assert(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
      console.log('[reactbits-scene] Analytics initial structure passed without console errors');
      const analyticsPhase = process.env.XMT_ANALYTICS_MATRIX_PHASE;
      if (analyticsPhase === 'heading-diagnostic') {
        await diagnoseLinearAnalyticsHeading(page, errors);
        console.log('[reactbits-scene] Analytics linear heading diagnosis completed');
      } else if (analyticsPhase === 'metrics' || analyticsPhase === 'canvas' || analyticsPhase === 'all') {
        await runAnalyticsMatrix(page, errors, analyticsPhase);
        console.log(`[reactbits-scene] Analytics ${analyticsPhase} matrix passed without console errors`);
      }
      return;
    }
    const phase = process.env.XMT_CREATOR_MATRIX_PHASE || 'all';
    if (phase === 'all' || phase === 'structure') {
      await openCreatorFromNavigation(page);
      await assertCreatorStructure(page);
      console.log('[reactbits-scene] initial Creator structure passed');
    }

    await openAppearance(page);
    await logComboboxDiagnostics(page);
    await logThemeButtons(page);
    const originalTheme = await getThemeMode(page);
    const originalPreset = await getPresetId(page);
    const originalCreatorApply = await page.getByLabel('应用到Creator', { exact: true }).isChecked();
    const originalMotionMode = await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').inputValue();
    const originalFontSize = await page.getByRole('combobox', { name: '界面字号', exact: true }).inputValue();
    const requestedFontSize = process.env.XMT_CREATOR_FONT_SIZE;
    const requestedPreset = process.env.XMT_CREATOR_PRESET;
    const requestedMotionMode = process.env.XMT_CREATOR_MOTION_MODE;
    let failure: unknown;
    try {
      const creatorApply = page.getByLabel('应用到Creator', { exact: true });
      if (phase === 'all' || phase === 'structure') {
        if (await creatorApply.isChecked()) await creatorApply.uncheck();
        await saveAppearance(page);
        await openCreatorFromNavigation(page);
        await assertCreatorStructure(page);
        await assertCanvasHealth(page, 0);
        console.log('[reactbits-scene] applyTo.creator=false passed');

        await openAppearance(page);
        if (!await creatorApply.isChecked()) await creatorApply.check();
        await saveAppearance(page);
        await openCreatorFromNavigation(page);
        await assertCreatorStructure(page);
        console.log('[reactbits-scene] applyTo.creator=true passed');
      }

      if (phase === 'all' || phase === 'theme') {
        for (const theme of ['dark', 'light'] as const) {
          await openAppearance(page);
          await setThemeMode(page, theme);
          await openCreatorFromNavigation(page);
          await assertCreatorStructure(page);
          assert(await page.evaluate((expected) => document.documentElement.classList.contains(expected), theme), `Creator page did not apply ${theme} theme`);
        }
        console.log('[reactbits-scene] light/dark matrix passed');
      }

      for (const fontSize of (requestedFontSize ? [requestedFontSize] : fontSizes)) {
        if (phase !== 'all' && phase !== 'font') break;
        await openAppearance(page);
        const fontControl = page.getByRole('combobox', { name: '界面字号', exact: true });
        await fontControl.selectOption(fontSize);
        await savePersonalPreferences(page);
        await page.waitForFunction((expected) => getComputedStyle(document.querySelector('main.xmt-business-content')!).fontSize === expected, `${fontSize}px`, { timeout: 15_000 });
        await openCreatorFromNavigation(page);
        await assertCreatorStructure(page);
        await assertNoOverflow(page, 1440, 900);
        await assertNoOverflow(page, 1024, 768);
        await assertNoOverflow(page, 390, 844);
      }
      if (phase === 'all' || phase === 'font') console.log('[reactbits-scene] font and viewport matrix passed');

      for (const preset of (requestedPreset ? [requestedPreset] : ['岚曜极光', '深空科技', '丝绸创意', '线性协作', '极简无扰', '自由搭配'])) {
        if (phase !== 'all' && phase !== 'preset') break;
        await openAppearance(page);
        const presetButton = page.getByRole('region', { name: '视觉方案预设', exact: true }).getByRole('button', { name: new RegExp(`^${preset}`) });
        await presetButton.click();
        assert(await presetButton.getAttribute('aria-pressed') === 'true', `Creator preset did not select: ${preset}`);
        await saveAppearance(page);
        await openCreatorFromNavigation(page);
        await assertCreatorStructure(page);
        await assertCanvasHealth(page, 1);
      }
      if (phase === 'all' || phase === 'preset') console.log('[reactbits-scene] preset matrix passed');

      for (const motionMode of (requestedMotionMode ? [requestedMotionMode] : ['off', 'reduced', 'balanced', 'full'])) {
        if (phase !== 'all' && phase !== 'motion') break;
        await openAppearance(page);
        await selectAppearanceField(page, '动效强度', motionMode);
        await saveAppearance(page);
        await openCreatorFromNavigation(page);
        await assertCreatorStructure(page);
        await assertCanvasHealth(page, motionMode === 'off' ? 0 : 1);
      }
      assert(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
      console.log(`[reactbits-scene] Creator ${phase} phase completed without console errors`);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      try {
        await openAppearance(page);
        await selectPreset(page, originalPreset);
        const creatorApply = page.getByLabel('应用到Creator', { exact: true });
        if (await creatorApply.isChecked() !== originalCreatorApply) await creatorApply.setChecked(originalCreatorApply);
        await selectAppearanceField(page, '动效强度', originalMotionMode);
        await saveAppearance(page);
        await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(originalFontSize);
        await setThemeMode(page, originalTheme);
        assert(await getThemeMode(page) === originalTheme, 'Theme did not restore to the test baseline');
        assert(await getPresetId(page) === originalPreset, 'Preset did not restore to the test baseline');
    assert(await page.getByLabel('应用到Creator', { exact: true }).isChecked() === originalCreatorApply, 'Creator apply scope did not restore to the test baseline');
        assert(await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').inputValue() === originalMotionMode, 'Motion mode did not restore to the test baseline');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await dismissSystemUpdateDialog(page);
        await page.getByRole('button', { name: '外观与动效', exact: true }).click();
        assert(await getThemeMode(page) === originalTheme && await getPresetId(page) === originalPreset, 'Appearance state did not persist after restoration');
      } catch (restoreError) {
        if (!failure) throw restoreError;
        console.error(`[reactbits-scene] Creator appearance restoration failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
      }
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(`[reactbits-scene] ${error.message}`); process.exitCode = 1; });
