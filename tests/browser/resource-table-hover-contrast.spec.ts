import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';
import { resourceStatusLabel, resourceVisibilityLabel } from '../../src/components/resource-center/resourceLabels';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
assert.deepEqual(['private', 'project', 'team', 'company'].map(resourceVisibilityLabel), ['私有', '项目关联', '团队', '企业']);
assert.deepEqual(['active', 'published', 'deleted'].map(resourceStatusLabel), ['可用', '已发布', '已移入回收站']);
assert.equal(resourceVisibilityLabel('new_scope'), '范围待确认', 'unknown visibility values must not leak raw server codes');
assert.equal(resourceStatusLabel('new_status'), '状态待确认', 'unknown status values must not leak raw server codes');
const user = { id: 91, username: 'resource-hover-qa', role: 'admin', name: '资料悬停验收', enabled: true, force_change_password: false };
const listResource = {
  id: 71,
  title: '悬停对比度验收资料',
  summary: '仅用于隔离浏览器主题测试',
  library_type: 'project',
  visibility: 'team',
  status: 'active',
  category: null,
  tags: [],
  file_count: 0,
  owner: { id: user.id, username: user.username, real_name: user.name },
  created_at: '2026-10-08 09:00:00',
  updated_at: '2026-10-08 09:00:00',
};
const detailResource = {
  ...listResource,
  id: 72,
  title: '资料详情删除反馈验收',
  content_text: '仅用于隔离浏览器删除反馈测试',
  source_type: null,
  source_uri: null,
  parent_id: null,
  files: [],
  relations: [],
  versions: [],
  audit_summary: null,
};
const raceFirstResource = { ...detailResource, id: 74, title: '旧资料详情回包' };
const raceSecondResource = { ...detailResource, id: 75, title: '当前资料详情回包' };
const createdResourceBase = {
  ...listResource,
  id: 73,
  title: '资料创建详情恢复验收',
  summary: '只用于隔离浏览器验收',
  content_text: '服务端已确认创建的资料正文。',
  source_type: null,
  source_uri: null,
  parent_id: null,
  files: [],
  relations: [],
  versions: [],
  audit_summary: null,
};
let createdResource = { ...createdResourceBase };
const existingResourceIds = new Set([listResource.id, detailResource.id, raceFirstResource.id, raceSecondResource.id]);
let failNextDeleteId: number | null = null;
let failNextResourceListRead = false;
let failNextCreatedResourceDetailRead = false;
let delayedDeleteId: number | null = null;
let resourceListReads = 0;
let resourceDeleteRequests = 0;
let successfulResourceDeletes = 0;
let resourceCreateRequests = 0;
let createdResourceDetailReads = 0;
let delayNextRaceDetailRead = false;
let resolveRaceDetailReadStarted: (() => void) | null = null;
let resolveRaceDetailReadFinished: (() => void) | null = null;
const raceDetailReadStarted = new Promise<void>((resolve) => { resolveRaceDetailReadStarted = resolve; });
const raceDetailReadFinished = new Promise<void>((resolve) => { resolveRaceDetailReadFinished = resolve; });
const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  const route = req.query.view === 'knowledge' ? '/asset-center/knowledge'
    : req.query.view === 'detail' ? `/asset-center/resources/${detailResource.id}`
      : req.query.view === 'race' ? `/asset-center/resources/${raceFirstResource.id}`
      : '/asset-center/resources?library_type=project';
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','resource-hover-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace(${JSON.stringify(route)});</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['resource:update', 'resource:delete']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/resource-center/resources', (_req, res) => {
  resourceListReads += 1;
  if (failNextResourceListRead) {
    failNextResourceListRead = false;
    return res.status(503).json({ message: '模拟删除后的列表刷新失败' });
  }
  return res.json({
    data: existingResourceIds.has(listResource.id) ? [listResource] : [],
    pagination: { page: 1, page_size: 20, total: existingResourceIds.has(listResource.id) ? 1 : 0, total_pages: 1 },
  });
});
app.get('/api/resource-center/resources/:id', (req, res) => {
  if (Number(req.params.id) === createdResource.id) {
    createdResourceDetailReads += 1;
    if (failNextCreatedResourceDetailRead) {
      failNextCreatedResourceDetailRead = false;
      return res.status(503).json({ message: '模拟创建后的详情读取失败' });
    }
    return res.json(createdResource);
  }
  const requestedId = Number(req.params.id);
  const resource = [detailResource, raceFirstResource, raceSecondResource].find((item) => item.id === requestedId);
  if (!resource || !existingResourceIds.has(requestedId)) return res.status(404).json({ message: '资料不存在' });
  if (requestedId === raceFirstResource.id && delayNextRaceDetailRead) {
    delayNextRaceDetailRead = false;
    resolveRaceDetailReadStarted?.();
    return void setTimeout(() => {
      resolveRaceDetailReadFinished?.();
      res.json(resource);
    }, 500);
  }
  return res.json(resource);
});
app.post('/api/resource-center/resources', (req, res) => {
  resourceCreateRequests += 1;
  createdResource = { ...createdResourceBase, title: String(req.body?.title || createdResourceBase.title) };
  failNextCreatedResourceDetailRead = true;
  return res.status(201).json({ message: '资料已创建', id: createdResource.id });
});
app.delete('/api/resource-center/resources/:id', async (req, res) => {
  resourceDeleteRequests += 1;
  const id = Number(req.params.id);
  if (failNextDeleteId === id) {
    failNextDeleteId = null;
    return res.status(503).json({ message: '模拟删除失败' });
  }
  if (delayedDeleteId === id) await new Promise((resolve) => setTimeout(resolve, 450));
  if (!existingResourceIds.has(id)) return res.status(404).json({ message: '资料不存在' });
  existingResourceIds.delete(id);
  successfulResourceDeletes += 1;
  return res.json({ message: '资料已删除' });
});
app.get('/api/resource-center/categories', (req, res) => res.json({ data: req.query.library_type === 'knowledge' ? [{ id: 81, library_type: 'knowledge', parent_id: null, name: '浅色主题分类', code: 'light-theme', path: null, sort_order: 1, enabled: 1, resource_count: 1 }] : [] }));
app.use('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_RESOURCE_HOVER_QA_SERVE === '1') {
  console.log(`Isolated resource hover QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

function luminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function colorChannels(value: string) {
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 } : null;
}

function contrastRatio(foreground: number[], background: number[]) {
  const lum = (rgb: number[]) => rgb.map((channel) => channel / 255 <= 0.04045 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + [0.2126, 0.7152, 0.0722][index] * value, 0);
  const foregroundLum = lum(foreground);
  const backgroundLum = lum(background);
  return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05);
}

async function renderedContrast(locator: import('playwright').Locator) {
  return locator.evaluate((element) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    context.fillStyle = getComputedStyle(element).color;
    context.fillRect(0, 0, 1, 1);
    const foreground = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    const background = [255, 255, 255];
    const backgrounds = [getComputedStyle(document.documentElement).backgroundColor, ...ancestors.map((ancestor) => getComputedStyle(ancestor).backgroundColor)];
    for (const value of backgrounds) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const layer = Array.from(context.getImageData(0, 0, 1, 1).data);
      const alpha = layer[3] / 255;
      for (let index = 0; index < 3; index += 1) background[index] = layer[index] * alpha + background[index] * (1 - alpha);
    }
    const foregroundLuminance = foreground.reduce((sum, channel, index) => {
      const normalized = channel / 255;
      const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      return sum + [0.2126, 0.7152, 0.0722][index] * linear;
    }, 0);
    const backgroundLuminance = background.reduce((sum, channel, index) => {
      const normalized = channel / 255;
      const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      return sum + [0.2126, 0.7152, 0.0722][index] * linear;
    }, 0);
    return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
  });
}

async function renderedAlpha(locator: import('playwright').Locator) {
  return locator.evaluate((element) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[3] / 255;
  });
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?theme=${theme}`);
    await page.getByRole('heading', { name: '项目资料库' }).waitFor();
    const title = page.getByRole('link', { name: '悬停对比度验收资料', exact: true });
    await title.hover();
    const result = await title.evaluate((element) => {
      const foreground = getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number) || [];
      const row = element.closest('tr');
      const background = row ? getComputedStyle(row).backgroundColor.match(/[\d.]+/g)?.map(Number) || [] : [];
      return { foreground: foreground.slice(0, 3), background: background.slice(0, 3), rowBackground: row ? getComputedStyle(row).backgroundColor : '' };
    });
    assert.equal(result.foreground.length, 3, `${theme} hover foreground color is available`);
    assert.equal(result.background.length, 3, `${theme} row background color is available`);
    const textLuminance = result.foreground.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
    const backgroundLuminance = result.background.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
    const ratio = (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05);
    assert.ok(ratio >= 4.5, `${theme} resource table title hover contrast is ${ratio.toFixed(2)}:1 on ${result.rowBackground}; expected at least 4.5:1`);

    const deleteAction = page.getByRole('button', { name: '删除资料 悬停对比度验收资料', exact: true });
    const deleteBackgroundBefore = await deleteAction.evaluate((element) => getComputedStyle(element).backgroundColor);
    await deleteAction.hover();
    const deleteBackgroundAfter = await deleteAction.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.notEqual(deleteBackgroundAfter, deleteBackgroundBefore, `${theme} resource delete hover changes its background`);
    assert.ok(await renderedAlpha(deleteAction) > 0, `${theme} resource delete hover uses a visible background`);
    assert.ok(await renderedContrast(deleteAction.locator('svg')) >= 3, `${theme} hovered resource delete icon maintains at least 3:1 contrast`);

    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const geometry = await deleteAction.evaluate((element) => {
        const action = element.getBoundingClientRect();
        const scrollport = element.closest('div.overflow-x-auto');
        const viewport = scrollport?.getBoundingClientRect();
        return {
          action: { left: action.left, right: action.right, width: action.width },
          viewport: viewport ? { left: viewport.left, right: viewport.right, width: viewport.width } : null,
          pageWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollLeft: scrollport?.scrollLeft ?? -1,
        };
      });
      assert(geometry.viewport, `${theme} resource table has a horizontal scroll viewport at ${width}px`);
      assert.ok(geometry.action.width > 0 && geometry.action.left >= geometry.viewport.left - 1 && geometry.action.right <= geometry.viewport.right + 1,
        `${theme} resource delete action stays visible before horizontal scrolling at ${width}px: ${JSON.stringify(geometry)}`);
      assert.equal(geometry.scrollLeft, 0, `${theme} resource delete action is reachable without first scrolling the table at ${width}px`);
      assert.ok(geometry.pageWidth <= geometry.clientWidth + 1, `${theme} resource page does not overflow horizontally at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${base}/__qa?theme=${theme}&view=knowledge`);
    await page.getByRole('heading', { name: '知识库', exact: true }).waitFor();
    const selectedCategory = page.getByRole('button', { name: '全部分类', exact: true });
    const selectedColors = await selectedCategory.evaluate((element) => {
      const layers: string[] = [];
      for (let current: Element | null = element; current; current = current.parentElement) layers.push(getComputedStyle(current).backgroundColor);
      const root = getComputedStyle(document.documentElement);
      return { foreground: getComputedStyle(element).color, layers, appBackground: root.getPropertyValue('--xmt-app-bg').trim() };
    });
    const foreground = colorChannels(selectedColors.foreground)?.rgb;
    let background = colorChannels(selectedColors.appBackground)?.rgb || [255, 255, 255];
    for (const layerValue of selectedColors.layers.reverse()) {
      const layer = colorChannels(layerValue);
      if (!layer || layer.alpha === 0) continue;
      background = layer.rgb.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
    }
    assert.ok(foreground && contrastRatio(foreground, background) >= 4.5, `${theme} selected knowledge category contrast is ${foreground ? contrastRatio(foreground, background).toFixed(2) : 'unavailable'}:1; expected at least 4.5:1`);
    await page.getByRole('button', { name: /浅色主题分类/ }).click();
    const namedCategory = page.getByRole('button', { name: /浅色主题分类/ });
    await namedCategory.waitFor();
    const namedColors = await namedCategory.evaluate((element) => {
      const layers: string[] = [];
      for (let current: Element | null = element; current; current = current.parentElement) layers.push(getComputedStyle(current).backgroundColor);
      const root = getComputedStyle(document.documentElement);
      return { foreground: getComputedStyle(element).color, layers, appBackground: root.getPropertyValue('--xmt-app-bg').trim() };
    });
    const namedForeground = colorChannels(namedColors.foreground)?.rgb;
    let namedBackground = colorChannels(namedColors.appBackground)?.rgb || [255, 255, 255];
    for (const layerValue of namedColors.layers.reverse()) {
      const layer = colorChannels(layerValue);
      if (!layer || layer.alpha === 0) continue;
      namedBackground = layer.rgb.map((channel, index) => channel * layer.alpha + namedBackground[index] * (1 - layer.alpha));
    }
    assert.ok(namedForeground && contrastRatio(namedForeground, namedBackground) >= 4.5, `${theme} selected named knowledge category contrast is ${namedForeground ? contrastRatio(namedForeground, namedBackground).toFixed(2) : 'unavailable'}:1; expected at least 4.5:1`);
  }

  await page.goto(`${base}/__qa?theme=light`);
  await page.getByRole('heading', { name: '项目资料库', exact: true }).waitFor();
  failNextDeleteId = listResource.id;
  await page.getByRole('button', { name: `删除资料 ${listResource.title}`, exact: true }).click();
  await page.getByRole('heading', { name: '删除资料', exact: true }).waitFor();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByText('删除失败', { exact: true }).waitFor();
  assert.equal(existingResourceIds.has(listResource.id), true, 'failed list deletion keeps the resource in the isolated fixture');
  assert.equal(await page.getByRole('heading', { name: '删除资料', exact: true }).count(), 1, 'failed list deletion leaves its confirmation open for retry');
  await page.evaluate(() => document.documentElement.style.setProperty('--xmt-z-modal', '250'));
  const deleteDialog = page.getByRole('dialog', { name: '删除资料', exact: true });
  assert.equal(await deleteDialog.evaluate((element) => getComputedStyle(element).zIndex), '250', 'the modal layer must consume the shared token');
  const failureNotification = page.getByRole('status').filter({ hasText: '删除失败' });
  assert.equal(await failureNotification.evaluate((element) => getComputedStyle(element).zIndex), '260', 'operation feedback remains above the modal when the shared layer changes');
  await page.keyboard.press('Meta+k');
  const globalSearch = page.getByRole('textbox', { name: '全局搜索' });
  await globalSearch.waitFor();
  await globalSearch.click();
  await page.keyboard.type('a');
  assert.equal(await globalSearch.inputValue(), 'a', 'the command palette accepts real input above an open confirmation dialog');
  const paletteLayer = page.locator('.xmt-overlay').filter({ has: globalSearch });
  assert.equal(await paletteLayer.evaluate((element) => getComputedStyle(element).zIndex), '300', 'the command palette has its own shared layer above modals');
  await page.screenshot({ path: '/tmp/xmt-layer-command-over-modal.png', fullPage: false });
  await page.keyboard.press('Escape');
  await globalSearch.waitFor({ state: 'hidden' });
  await deleteDialog.waitFor();
  await page.evaluate(() => document.documentElement.style.removeProperty('--xmt-z-modal'));
  failNextResourceListRead = true;
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByText('删除成功', { exact: true }).waitFor();
  assert.equal(existingResourceIds.has(listResource.id), false, 'successful list deletion removes the isolated resource');
  const confirmedDeleteMessage = `服务端已确认资料「${listResource.title}」已删除，但列表刷新失败；请重新加载列表确认，不要重复删除。`;
  await page.getByRole('alert').getByText(confirmedDeleteMessage, { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: listResource.title, exact: true }).count(), 0, 'the confirmed deletion is removed from the current list even when refresh fails');
  assert.equal(successfulResourceDeletes, 1, 'the fixture confirms exactly one resource deletion');
  const resourceReadsBeforeRetry = resourceListReads;
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText('暂无资料', { exact: true }).waitFor();
  assert.equal(resourceDeleteRequests, 2, 'retrying the failed-delete attempt succeeded once and the read retry did not repeat the deletion');
  assert.equal(successfulResourceDeletes, 1, 'read-only retry did not repeat the successful deletion');
  assert.equal(resourceListReads, resourceReadsBeforeRetry + 1, 'the retry performs one fresh resource-list read');

  await page.goto(`${base}/__qa?theme=light`);
  await page.getByRole('heading', { name: '项目资料库', exact: true }).waitFor();
  await page.getByRole('button', { name: '新增资料', exact: true }).click();
  await page.getByLabel('标题').fill('隔离新建确认与详情恢复');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  const createdDetailNotice = '服务端已确认资料「隔离新建确认与详情恢复」创建成功，但详情暂时无法读取；请重新加载详情，不要重复创建。';
  await page.getByRole('alert').getByText(createdDetailNotice, { exact: true }).waitFor();
  assert.equal(resourceCreateRequests, 1, 'the server confirms one resource create before its detail read fails');
  await page.getByRole('button', { name: '重新加载详情', exact: true }).click();
  await page.getByRole('heading', { name: '隔离新建确认与详情恢复', exact: true }).waitFor();
  await page.getByRole('status').getByText('资料「隔离新建确认与详情恢复」已创建。', { exact: true }).waitFor();
  assert.equal(resourceCreateRequests, 1, 'retrying the detail read does not repeat the resource create');
  assert.equal(createdResourceDetailReads, 2, 'the recovery path performs one initial and one read-only detail request');

  delayNextRaceDetailRead = true;
  const racePage = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  racePage.on('pageerror', (error) => errors.push(error.message));
  await racePage.goto(`${base}/__qa?theme=light&view=race`);
  await raceDetailReadStarted;
  await racePage.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/asset-center/resources/${raceSecondResource.id}`);
  await racePage.getByRole('heading', { name: raceSecondResource.title, exact: true }).waitFor();
  await raceDetailReadFinished;
  await racePage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  assert.equal(racePage.url().endsWith(`/asset-center/resources/${raceSecondResource.id}`), true, 'the route changes to the current resource while the prior read is pending');
  assert.equal(await racePage.getByRole('heading', { name: raceFirstResource.title, exact: true }).count(), 0, 'a late response from the prior resource cannot replace current detail state');
  await racePage.close();

  failNextDeleteId = detailResource.id;
  await page.goto(`${base}/__qa?theme=dark&view=detail`);
  await page.getByRole('heading', { name: detailResource.title, exact: true }).waitFor();
  const detailPageIdentity = await page.evaluate(() => ({
    path: window.location.pathname,
    title: document.title,
    content: document.querySelector('#root')?.textContent?.trim() || '',
    frameworkOverlays: document.querySelectorAll('vite-error-overlay, [data-vite-error-overlay]').length,
  }));
  assert.equal(detailPageIdentity.path, `/asset-center/resources/${detailResource.id}`, 'the isolated flow is on the intended resource detail route');
  assert.ok(detailPageIdentity.title, 'the resource detail page has a document title');
  assert.ok(detailPageIdentity.content.includes(detailResource.title), 'the application root contains rendered detail content');
  assert.equal(detailPageIdentity.frameworkOverlays, 0, 'the detail page has no Vite error overlay');
  const visibilityField = page.getByText('可见范围', { exact: true }).locator('..');
  const statusField = page.getByText('状态', { exact: true }).locator('..');
  await visibilityField.getByText('团队', { exact: true }).waitFor();
  await statusField.getByText('可用', { exact: true }).waitFor();
  assert.equal(await page.getByText('team', { exact: true }).count(), 0, 'raw visibility codes are not rendered');
  assert.equal(await page.getByText('active', { exact: true }).count(), 0, 'raw resource status codes are not rendered');
  await page.screenshot({ path: '/tmp/xmt-resource-detail-business-labels-1440.png', fullPage: true });
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('heading', { name: '删除资料', exact: true }).waitFor();
  await page.getByRole('button', { name: '删除', exact: true }).last().click();
  await page.getByText('删除失败', { exact: true }).waitFor();
  assert.equal(existingResourceIds.has(detailResource.id), true, 'failed detail deletion keeps the isolated resource');
  assert.equal(await page.getByRole('heading', { name: detailResource.title, exact: true }).count(), 1, 'failed detail deletion does not navigate away');
  await page.getByRole('button', { name: '关闭通知', exact: true }).click();
  const detailDeleteRequestsBeforeRetry = resourceDeleteRequests;
  delayedDeleteId = detailResource.id;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '删除', exact: true }).last().evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const processingButton = page.getByRole('button', { name: '处理中...', exact: true });
  await processingButton.waitFor();
  await page.screenshot({ path: '/tmp/xmt-resource-delete-inflight-390.png' });
  assert.equal(await processingButton.isDisabled(), true, 'the confirm action is disabled while detail deletion is pending');
  assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isDisabled(), true, 'the cancel action is disabled while a write is pending');
  assert.equal(await page.getByRole('button', { name: '关闭弹窗', exact: true }).count(), 0, 'the close control is unavailable while a write is pending');
  await page.keyboard.press('Escape');
  await page.locator('.xmt-overlay').click({ position: { x: 1, y: 1 } });
  assert.equal(await page.getByRole('heading', { name: '删除资料', exact: true }).count(), 1, 'escape and overlay clicks cannot dismiss an in-flight confirmation');
  await page.getByText('删除成功', { exact: true }).waitFor();
  assert.equal(existingResourceIds.has(detailResource.id), false, 'successful detail deletion removes the isolated resource');
  assert.equal(resourceDeleteRequests, detailDeleteRequestsBeforeRetry + 1, 'a rapid double trigger sends only one detail delete request');

  assert.deepEqual(errors, [], 'resource table light/dark hover states render without browser errors');
  assert.equal(expectedHttpErrors.length, 4, 'two intentional delete failures, post-delete list failure and post-create detail failure each return one 503 response');
  console.log('Resource browser test passed: fixed table actions stay visible at 320/390px; resource hover, selected knowledge categories, detail request ownership and list/detail delete success/failure feedback meet their contracts.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
