import { chromium, type Page } from 'playwright';

const baseUrl = process.env.XMT_E2E_BASE_URL || 'http://localhost:5174';
const username = process.env.XMT_E2E_USERNAME;
const password = process.env.XMT_E2E_PASSWORD;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function dismissUpdate(page: Page) {
  const dialog = page.locator('div.fixed.inset-0').filter({ hasText: '系统更新' });
  const button = dialog.getByRole('button', { name: '我知道了', exact: true }).first();
  await button.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => undefined);
  if (await button.isVisible().catch(() => false)) {
    await button.click({ force: true });
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
  }
}

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[autocomplete="username"]').fill(username!);
  await page.locator('input[autocomplete="current-password"]').fill(password!);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByText('内容生产驾驶舱', { exact: false }).waitFor({ state: 'visible', timeout: 15_000 });
  await dismissUpdate(page);
}

async function appearance(page: Page) {
  await page.goto(`${baseUrl}/notification-settings`, { waitUntil: 'domcontentloaded' });
  await dismissUpdate(page);
  await page.getByRole('button', { name: '外观与动效', exact: true }).click();
  await page.getByText('React Bits 原生动效外观中心', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
}

async function savePreferences(page: Page) { await page.getByRole('button', { name: '保存个人偏好', exact: true }).click(); }
async function saveAppearance(page: Page) { await page.getByRole('button', { name: '保存外观与动效', exact: true }).click(); }

async function openEditor(page: Page) {
  await page.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-reactbits-scene="editor"]').waitFor({ state: 'visible', timeout: 15_000 });
  const editor = page.locator('[data-reactbits-scene="editor"] [contenteditable="true"]').first();
  await editor.waitFor({ state: 'visible', timeout: 15_000 });
  return editor;
}

async function auditEditorGeometry(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-reactbits-scene="editor"]');
    const editable = root?.querySelector('[contenteditable="true"]') as HTMLElement | null;
    const effects: string[] = [];
    for (let node = editable?.parentElement || null; node && node !== root; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.transform !== 'none' || style.filter !== 'none' || style.perspective !== 'none' || style.overflow === 'hidden') effects.push(`${node.tagName}.${node.className}`);
    }
    const rect = editable?.getBoundingClientRect();
    return { width: rect?.width || 0, height: rect?.height || 0, effects, canvas: root?.querySelectorAll('canvas').length || 0, nestedButtons: root?.querySelectorAll('button button').length || 0 };
  });
}

async function run() {
  if (!username || !password) { console.log('Editor credentials missing'); return; }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  let restoreSuccess = false;
  let original = { theme: 'dark', font: '16', motion: 'balanced', workflow: false, preset: '岚曜极光' };
  try {
    await login(page);
    await appearance(page);
    original.theme = await page.locator('select:has(option[value="light"]):has(option[value="dark"])').inputValue();
    original.font = await page.getByRole('combobox', { name: '界面字号', exact: true }).inputValue();
    original.motion = await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').inputValue();
    original.workflow = await page.getByLabel('应用到Workflow', { exact: true }).isChecked();
    const presets = page.getByRole('region', { name: '视觉方案预设', exact: true });
    const presetNames = ['岚曜极光', '深空科技', '丝绸创意', '线性协作', '极简无扰', '自由搭配'];
    for (const name of presetNames) {
      if (await presets.getByRole('button', { name: new RegExp(`^${name}`) }).getAttribute('aria-pressed') === 'true') original.preset = name;
    }

    for (const theme of ['dark', 'light']) for (const font of ['14', '16', '18', '20', '22', '24']) {
      await appearance(page);
      await page.getByRole('button', { name: new RegExp(theme === 'dark' ? '^深色模式' : '^浅色模式') }).click();
      await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(font);
      await savePreferences(page);
      const editor = await openEditor(page);
      const text = `Editor Scene 安全输入 ${theme} ${font}`;
      await editor.fill(text);
      assert((await editor.innerText()).includes(text), `Editor input failed: ${theme}/${font}`);
      await editor.press('Meta+A');
      const selection = await page.evaluate(() => { const s = window.getSelection(); return { text: s?.toString() || '', range: s?.rangeCount || 0 }; });
      assert(selection.text.includes('Editor Scene'), 'Editor selection failed');
      await editor.press('Backspace');
      assert((await editor.innerText()).trim() === '', 'Editor deletion failed');
      const geometry = await auditEditorGeometry(page);
      assert(geometry.width > 0 && geometry.height > 0 && geometry.canvas === 0 && geometry.nestedButtons === 0 && geometry.effects.length === 0, `Editor geometry gate failed: ${JSON.stringify(geometry)}`);
    }

    for (const preset of presetNames) for (const motion of ['off', 'reduced', 'balanced', 'full']) {
      await appearance(page);
      await presets.getByRole('button', { name: new RegExp(`^${preset}`) }).click();
      await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').selectOption(motion);
      await saveAppearance(page);
      const editor = await openEditor(page);
      const geometry = await auditEditorGeometry(page);
      assert(geometry.width > 0 && geometry.height > 0 && geometry.canvas === 0 && geometry.nestedButtons === 0 && geometry.effects.length === 0, `Editor preset/motion geometry failed: ${preset}/${motion}`);
      await editor.fill('safe');
      await editor.press('Meta+A');
      assert((await page.evaluate(() => window.getSelection()?.toString() || '')) === 'safe', `Editor selection failed: ${preset}/${motion}`);
      await editor.press('Backspace');
    }

    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const editor = await openEditor(page);
      await editor.fill('route lifecycle');
      await page.goto(`${baseUrl}/topics`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '选题管理', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
      await openEditor(page);
      assert(await page.locator('[data-reactbits-scene="editor"] [contenteditable="true"]').count() === 1, `Editor route return failed: ${viewport.width}x${viewport.height}`);
    }
    assert(await page.getByText('页面出错了', { exact: true }).count() === 0, 'Editor ErrorBoundary is visible');
    assert(errors.length === 0, `Editor console/page errors: ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await appearance(page).catch(() => undefined);
    await page.getByRole('button', { name: new RegExp(original.theme === 'dark' ? '^深色模式' : '^浅色模式') }).click().catch(() => undefined);
    await page.getByRole('combobox', { name: '界面字号', exact: true }).selectOption(original.font).catch(() => undefined);
    await page.locator('label').filter({ hasText: '动效强度' }).getByRole('combobox').selectOption(original.motion).catch(() => undefined);
    const workflow = page.getByLabel('应用到Workflow', { exact: true });
    if (await workflow.isChecked().catch(() => original.workflow) !== original.workflow) await workflow.setChecked(original.workflow).catch(() => undefined);
    await page.getByRole('region', { name: '视觉方案预设', exact: true }).getByRole('button', { name: new RegExp(`^${original.preset}`) }).click().catch(() => undefined);
    await saveAppearance(page).catch(() => undefined);
    restoreSuccess = await page.locator('select:has(option[value="light"]):has(option[value="dark"])').inputValue().catch(() => '') === original.theme && await page.getByRole('combobox', { name: '界面字号', exact: true }).inputValue().catch(() => '') === original.font;
    console.log(`[reactbits-editor] restoreSuccess=${restoreSuccess} errors=${errors.length}`);
  }
  await browser.close();
}

void run().catch((error) => { console.error(`[reactbits-editor] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
