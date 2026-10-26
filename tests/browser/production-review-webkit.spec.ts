import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit, type Browser, type Locator, type Page } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureScript = path.join(root, 'tests/browser/production-review.spec.ts');
const tsxCli = path.join(root, 'node_modules/tsx/dist/cli.mjs');
const desktopScreenshot = '/tmp/xmt-production-review-webkit-desktop.png';
const mobileScreenshot = '/tmp/xmt-production-review-webkit-mobile-320.png';

async function stopFixture(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish();
    }, 3000);
    timer.unref();
    child.once('exit', finish);
    if (child.exitCode !== null || child.signalCode !== null) finish();
  });
}

async function startFixture(): Promise<{ baseUrl: string; child: ChildProcess }> {
  const child = spawn(process.execPath, [tsxCli, fixtureScript], {
    cwd: root,
    env: { ...process.env, XMT_PRODUCTION_REVIEW_QA_SERVE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  try {
    const baseUrl = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out starting isolated ProductionDetail fixture. stderr: ${stderr.slice(-2000)}`)), 30000);
      timeout.unref();
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout = `${stdout}${chunk.toString()}`.slice(-4000);
        const match = stdout.match(/Isolated production review QA fixture: (http:\/\/127\.0\.0\.1:\d+)\/__qa/);
        if (!match) return;
        clearTimeout(timeout);
        resolve(match[1]);
      });
      child.stderr?.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-4000); });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code, signal) => {
        clearTimeout(timeout);
        reject(new Error(`Isolated ProductionDetail fixture exited before ready (code=${code}, signal=${signal}). stdout: ${stdout} stderr: ${stderr}`));
      });
    });
    return { baseUrl, child };
  } catch (error) {
    await stopFixture(child);
    throw error;
  }
}

async function assertControlFits(page: Page, control: Locator, name: string): Promise<void> {
  await control.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const geometry = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const clippedBy: string[] = [];
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const ancestorRect = ancestor.getBoundingClientRect();
      if ((['hidden', 'clip'].includes(style.overflowX) && (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1))
        || (['hidden', 'clip'].includes(style.overflowY) && (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1))) {
        clippedBy.push(`${ancestor.tagName}.${String(ancestor.className)}`);
      }
    }
    return {
      x: rect.x,
      y: rect.y,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      display: getComputedStyle(element).display,
      visibility: getComputedStyle(element).visibility,
      clippedBy,
    };
  });
  assert.ok(geometry.width > 0 && geometry.height > 0, `${name} has a layout box: ${JSON.stringify(geometry)}`);
  assert.notEqual(geometry.display, 'none', `${name} is not hidden`);
  assert.notEqual(geometry.visibility, 'hidden', `${name} is visible`);
  assert.deepEqual(geometry.clippedBy, [], `${name} is not clipped: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.x >= -1 && geometry.right <= geometry.viewportWidth + 1
    && geometry.y >= -1 && geometry.bottom <= geometry.viewportHeight + 1,
  `${name} stays inside the viewport: ${JSON.stringify(geometry)}`);
}

const fixture = await startFixture();
let browser: Browser | undefined;
try {
  browser = await webkit.launch({ headless: true });
  const apiWrites: string[] = [];
  const pageErrors: string[] = [];
  const desktopPage = await browser.newPage({ viewport: { width: 1024, height: 600 }, reducedMotion: 'reduce' });
  desktopPage.setDefaultTimeout(10000);
  desktopPage.on('pageerror', (error) => pageErrors.push(error.message));
  desktopPage.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
  desktopPage.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === fixture.baseUrl && url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) {
      apiWrites.push(`${request.method()} ${url.pathname}`);
    }
  });

  await desktopPage.goto(`${fixture.baseUrl}/__qa?theme=light`);
  await desktopPage.getByRole('heading', { name: '协作审阅稿件', exact: true }).waitFor();
  assert.match(desktopPage.url(), /\/production\/content\/78$/, 'desktop fixture resolves to the isolated ProductionDetail route');
  const editorToolbar = desktopPage.locator('.editor-toolbar').filter({ has: desktopPage.locator('button[title^="格式刷"]') }).first();
  await editorToolbar.waitFor({ state: 'visible' });

  const zoomEquivalentViewport = { width: 819, height: 480 };
  await desktopPage.setViewportSize(zoomEquivalentViewport);
  assert.deepEqual(await desktopPage.evaluate(() => ({ width: innerWidth, height: innerHeight })), zoomEquivalentViewport, '1024×600 at 125% is represented by its actual CSS layout viewport');
  assert.ok(await desktopPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the 1024×600 / 125% equivalent viewport has no horizontal page overflow');
  for (const name of ['当前版本查看 / 编辑', '小修保存', '另开新版', '提交审核']) {
    await assertControlFits(desktopPage, desktopPage.getByRole('button', { name, exact: true }).last(), `ProductionDetail ${name} at 1024×600 / 125%`);
  }

  const moreTools = editorToolbar.locator('button[title="更多操作"]').last();
  await moreTools.waitFor({ state: 'visible' });
  await moreTools.click();
  const moreMenu = editorToolbar.locator('div.absolute.z-50').filter({ hasText: '左对齐' }).last();
  await moreMenu.waitFor({ state: 'visible' });
  await assertControlFits(desktopPage, moreMenu, 'ProductionDetail editor toolbar “更多操作” menu at 1024×600 / 125%');
  await desktopPage.screenshot({ path: desktopScreenshot, fullPage: false });
  await desktopPage.keyboard.press('Escape');
  await moreMenu.waitFor({ state: 'hidden' });

  const mobilePage = await browser.newPage({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
  mobilePage.setDefaultTimeout(10000);
  mobilePage.on('pageerror', (error) => pageErrors.push(error.message));
  mobilePage.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
  mobilePage.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === fixture.baseUrl && url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) {
      apiWrites.push(`${request.method()} ${url.pathname}`);
    }
  });
  await mobilePage.goto(`${fixture.baseUrl}/__qa?theme=light`);
  await mobilePage.getByRole('button', { name: '保存草稿', exact: true }).waitFor();
  await mobilePage.getByRole('button', { name: '提交审核', exact: true }).waitFor();
  assert.match(mobilePage.url(), /\/production\/content\/78$/, '320px fixture resolves to the isolated production editor route');
  const pageWidth = await mobilePage.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(pageWidth.document <= pageWidth.viewport + 1 && pageWidth.body <= pageWidth.viewport + 1,
    `320px production editor has no horizontal page overflow: ${JSON.stringify(pageWidth)}`);
  await assertControlFits(mobilePage, mobilePage.getByRole('button', { name: '保存草稿', exact: true }), '320px mobile “保存草稿” action');
  await assertControlFits(mobilePage, mobilePage.getByRole('button', { name: '提交审核', exact: true }), '320px mobile “提交审核” action');
  await mobilePage.screenshot({ path: mobileScreenshot, fullPage: false });

  assert.deepEqual(apiWrites, [], 'the smoke test does not write to even the isolated business API');
  assert.deepEqual(pageErrors, [], 'WebKit ProductionDetail smoke has no browser runtime or console errors');
  console.log(`ProductionDetail WebKit smoke passed. Desktop: 1024×600 at 125%; mobile: 320×740; API writes: 0. Screenshots: ${desktopScreenshot}, ${mobileScreenshot}`);
} finally {
  await browser?.close().catch(() => undefined);
  await stopFixture(fixture.child);
}
