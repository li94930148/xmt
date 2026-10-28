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
const searchResult = {
  resource_id: 76,
  title: '资料搜索对比度验收',
  summary: '只用于隔离浏览器主题测试',
  snippet: '只用于隔离<mark>浏览器</mark>主题测试',
  library_type: 'knowledge',
  category: { id: 81, library_type: 'knowledge', parent_id: null, name: '浅色主题分类', code: 'light-theme', path: null, sort_order: 1, enabled: 1, resource_count: 1 },
};
let createdResource = { ...createdResourceBase };
const existingResourceIds = new Set([listResource.id, detailResource.id, raceFirstResource.id, raceSecondResource.id]);
let failNextDeleteId: number | null = null;
let failNextResourceListRead = false;
let failNextCategoryRead = false;
let failNextCreatedResourceDetailRead = false;
let delayedDeleteId: number | null = null;
let resourceListReads = 0;
let categoryReads = 0;
let resourceDeleteRequests = 0;
let successfulResourceDeletes = 0;
let resourceCreateRequests = 0;
let createdResourceDetailReads = 0;
let resourceDetailReads = 0;
let resourceAuditReads = 0;
const resourceSearchQueries: string[] = [];
let failNextAuditRead = false;
let delayNextRaceDetailRead = false;
let resolveRaceDetailReadStarted: (() => void) | null = null;
let resolveRaceDetailReadFinished: (() => void) | null = null;
const raceDetailReadStarted = new Promise<void>((resolve) => { resolveRaceDetailReadStarted = resolve; });
const raceDetailReadFinished = new Promise<void>((resolve) => { resolveRaceDetailReadFinished = resolve; });
const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  if (req.query.fail_audit === 'true') failNextAuditRead = true;
  if (req.query.fail_categories === 'true') failNextCategoryRead = true;
  const route = req.query.view === 'knowledge' ? '/asset-center/knowledge'
    : req.query.view === 'search' ? '/asset-center/search'
    : req.query.view === 'detail' ? `/asset-center/resources/${detailResource.id}`
      : req.query.view === 'race' ? `/asset-center/resources/${raceFirstResource.id}?library_type=project`
      : '/asset-center/resources?library_type=project';
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','resource-hover-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace(${JSON.stringify(route)});</script>`);
});
app.get('/__qa/search-queries', (_req, res) => res.json(resourceSearchQueries));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['resource:update', 'resource:delete', 'resource:audit']));
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
app.get('/api/resource-center/search', (req, res) => {
  resourceSearchQueries.push(req.originalUrl);
  if (req.query.keyword === '没有匹配') return res.json({ data: [], total: 0 });
  return res.json({ data: [searchResult], total: 1 });
});
app.get('/api/resource-center/resources/:id', (req, res) => {
  resourceDetailReads += 1;
  if (Number(req.params.id) === createdResource.id) {
    createdResourceDetailReads += 1;
    if (failNextCreatedResourceDetailRead) {
      failNextCreatedResourceDetailRead = false;
      return res.status(503).json({ message: '模拟创建后的详情读取失败' });
    }
    return res.json(createdResource);
  }
  const requestedId = Number(req.params.id);
  const resource = [listResource, detailResource, raceFirstResource, raceSecondResource].find((item) => item.id === requestedId);
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
app.get('/api/resource-center/resources/:id/audit', (_req, res) => {
  resourceAuditReads += 1;
  if (failNextAuditRead) {
    failNextAuditRead = false;
    return res.status(503).json({ message: '模拟资料审计记录读取失败' });
  }
  return res.json({ data: [] });
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
app.get('/api/resource-center/categories', (req, res) => {
  categoryReads += 1;
  if (failNextCategoryRead) {
    failNextCategoryRead = false;
    return res.status(503).json({ message: '模拟分类列表读取失败' });
  }
  return res.json({ data: req.query.library_type === 'knowledge' ? [
    { id: 81, library_type: 'knowledge', parent_id: null, name: '浅色主题分类', code: 'light-theme', path: null, sort_order: 1, enabled: 1, resource_count: 1 },
    { id: 82, library_type: 'knowledge', parent_id: 81, name: '子分类', code: 'child-category', path: null, sort_order: 1, enabled: 1, resource_count: 1 },
  ] : [] });
});
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
    const previousPage = page.getByRole('button', { name: '上一页', exact: true });
    const nextPage = page.getByRole('button', { name: '下一页', exact: true });
    assert.equal(await previousPage.count(), 1, `${theme} resource pagination exposes a named previous-page control`);
    assert.equal(await nextPage.count(), 1, `${theme} resource pagination exposes a named next-page control`);
    assert.equal(await previousPage.isDisabled(), true, `${theme} previous-page control is disabled on the first page`);
    assert.equal(await nextPage.isDisabled(), true, `${theme} next-page control is disabled on the only page`);
    const projectBreadcrumb = page.getByRole('navigation', { name: '面包屑' }).getByText('项目资料库', { exact: true });
    assert.equal(await projectBreadcrumb.count(), 1, `${theme} project-library route uses the project breadcrumb`);
    const projectNavActiveCount = await page.locator('aside button').filter({ hasText: '项目资料库' }).evaluateAll((elements) => elements.filter((element) => element.className.includes('bg-studio-primary/14')).length);
    const archiveNavActiveCount = await page.locator('aside button').filter({ hasText: '内容档案库' }).evaluateAll((elements) => elements.filter((element) => element.className.includes('bg-studio-primary/14')).length);
    assert.ok(projectNavActiveCount > 0, `${theme} project-library route highlights its own sidebar item`);
    assert.equal(archiveNavActiveCount, 0, `${theme} project-library route does not highlight content archives`);
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
    const resourceActions = [
      page.getByRole('link', { name: '查看资料 悬停对比度验收资料', exact: true }),
      page.getByRole('link', { name: '编辑资料 悬停对比度验收资料', exact: true }),
      deleteAction,
    ];
    const paginationActions = [
      page.getByRole('button', { name: '上一页', exact: true }),
      page.getByRole('button', { name: '下一页', exact: true }),
    ];
    const deleteBackgroundBefore = await deleteAction.evaluate((element) => getComputedStyle(element).backgroundColor);
    await deleteAction.hover();
    const deleteBackgroundAfter = await deleteAction.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.notEqual(deleteBackgroundAfter, deleteBackgroundBefore, `${theme} resource delete hover changes its background`);
    assert.ok(await renderedAlpha(deleteAction) > 0, `${theme} resource delete hover uses a visible background`);
    assert.ok(await renderedContrast(deleteAction.locator('svg')) >= 3, `${theme} hovered resource delete icon maintains at least 3:1 contrast`);

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const action of [...resourceActions, ...paginationActions]) {
        const bounds = await action.boundingBox();
        assert(bounds, `${theme} resource operation remains visible at ${width}px`);
        assert.ok(bounds.width >= 40 && bounds.height >= 40,
          `${theme} ${await action.getAttribute('aria-label')} meets the 40×40px touch target at ${width}px: ${JSON.stringify(bounds)}`);
      }
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

    for (const [libraryType, pageTitle, navigationLabel] of [
      ['content_archive', '内容档案库', '内容档案库'],
      ['media', '素材归档库', '素材归档'],
    ] as const) {
      await page.goto(`${base}/asset-center/resources?library_type=${libraryType}`);
      await page.getByRole('heading', { name: pageTitle, exact: true }).waitFor();
      assert.equal(await page.getByRole('navigation', { name: '面包屑' }).getByText(navigationLabel, { exact: true }).count(), 1, `${theme} ${libraryType} route uses its own breadcrumb`);
      const activeCount = await page.locator('aside button').filter({ hasText: navigationLabel }).evaluateAll((elements) => elements.filter((element) => element.className.includes('bg-studio-primary/14')).length);
      assert.ok(activeCount > 0, `${theme} ${libraryType} route highlights its own sidebar item`);
    }

    await page.goto(`${base}/__qa?theme=${theme}&view=search`);
    await page.getByRole('heading', { name: '资料搜索', exact: true }).waitFor();
    const searchInput = page.getByRole('textbox', { name: '搜索资料关键词', exact: true });
    await page.getByLabel('资料库').selectOption('knowledge');
    const categorySelect = page.getByLabel('分类');
    const categoryOption = categorySelect.locator('option[value="81"]');
    await categoryOption.waitFor({ state: 'attached' });
    assert.equal((await categoryOption.textContent())?.trim(), '浅色主题分类', `${theme} knowledge category option is present in the native select`);
    await categorySelect.selectOption('81');
    assert.equal(await categorySelect.inputValue(), '81', `${theme} native category select applies the selected option`);
    await page.getByLabel('标签').fill('内容 规划');
    await page.getByLabel('排序').selectOption('title_asc');
    await searchInput.fill('验收');
    const searchButton = page.getByRole('button', { name: '搜索', exact: true });
    const searchCard = page.getByRole('link', { name: /资料搜索对比度验收/ });
    for (const viewport of [
      { width: 320, height: 844 },
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      assert.equal(await searchButton.isVisible(), true, `${theme} ${viewport.width}px search action remains visible`);
      assert.equal(await searchButton.isEnabled(), true, `${theme} ${viewport.width}px search action remains enabled`);
      const actionGeometry = await searchButton.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          type: element.getAttribute('type'),
          height: rect.height,
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          pageWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          unifiedButton: element.classList.contains('xmt-btn') && element.getAttribute('data-reactbits-button') === 'primary',
          display: style.display,
          visibility: style.visibility,
          opacity: Number(style.opacity),
        };
      });
      assert.equal(actionGeometry.type, 'submit', `${theme} ${viewport.width}px search action remains a form submit button`);
      assert.ok(actionGeometry.unifiedButton, `${theme} ${viewport.width}px search action uses the shared primary button style`);
      assert.ok(actionGeometry.height >= 40,
        `${theme} ${viewport.width}px search action is at least 40px tall: ${JSON.stringify(actionGeometry)}`);
      assert.ok(actionGeometry.x >= 0 && actionGeometry.y >= 0
        && actionGeometry.right <= actionGeometry.viewportWidth
        && actionGeometry.bottom <= actionGeometry.viewportHeight
        && actionGeometry.display !== 'none'
        && actionGeometry.visibility !== 'hidden'
        && actionGeometry.opacity > 0,
      `${theme} ${viewport.width}px search action is fully within the viewport: ${JSON.stringify(actionGeometry)}`);
      assert.ok(actionGeometry.pageWidth <= actionGeometry.clientWidth + 1,
        `${theme} ${viewport.width}px search form does not overflow horizontally: ${JSON.stringify(actionGeometry)}`);
      await searchInput.focus();
      await page.keyboard.press('Tab');
      const focusState = await searchButton.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          active: document.activeElement === element,
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          outlineColor: style.outlineColor,
        };
      });
      assert.ok(focusState.active, `${theme} ${viewport.width}px search action is reachable from the keyboard after the keyword field`);
      assert.ok(focusState.outlineStyle !== 'none' && focusState.outlineWidth >= 2 && (colorChannels(focusState.outlineColor)?.alpha ?? 1) > 0,
        `${theme} ${viewport.width}px keyboard focus has a visible indicator: ${JSON.stringify(focusState)}`,
      );
      const queryCountBeforeSubmit = (await page.evaluate(async () => await (await fetch('/__qa/search-queries')).json() as string[])).length;
      await page.keyboard.press('Enter');
      await page.waitForFunction(async (previousCount) => {
        const queries = await (await fetch('/__qa/search-queries')).json() as string[];
        return queries.length > previousCount;
      }, queryCountBeforeSubmit);
      await searchCard.waitFor();
      const resultLayout = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      assert.ok(resultLayout.pageWidth <= resultLayout.clientWidth + 1,
        `${theme} ${viewport.width}px search results do not overflow horizontally: ${JSON.stringify(resultLayout)}`);
      const queryHistory = await page.evaluate(async () => await (await fetch('/__qa/search-queries')).json() as string[]);
      const submittedQuery = new URL(queryHistory.at(-1)!, base);
      assert.equal(submittedQuery.searchParams.get('keyword'), '验收', `${theme} ${viewport.width}px keyboard submit sends the original search keyword`);
      assert.equal(submittedQuery.searchParams.get('library_type'), 'knowledge', `${theme} ${viewport.width}px search applies its library filter`);
      assert.equal(submittedQuery.searchParams.get('category_id'), '81', `${theme} ${viewport.width}px search applies its category filter`);
      assert.equal(submittedQuery.searchParams.get('tag'), '内容 规划', `${theme} ${viewport.width}px search applies its tag filter`);
      assert.equal(submittedQuery.searchParams.get('sort'), 'title_asc', `${theme} ${viewport.width}px search applies its selected order`);
    }
    await searchCard.waitFor();
    const queryHistory = await page.evaluate(async () => await (await fetch('/__qa/search-queries')).json() as string[]);
    const submittedQuery = new URL(queryHistory.at(-1)!, base);
    assert.equal(submittedQuery.searchParams.get('keyword'), '验收', `${theme} keyboard submit sends the original search keyword`);
    assert.equal(submittedQuery.searchParams.get('library_type'), 'knowledge', `${theme} search applies its library filter`);
    assert.equal(submittedQuery.searchParams.get('category_id'), '81', `${theme} search applies its category filter`);
    assert.equal(submittedQuery.searchParams.get('tag'), '内容 规划', `${theme} search applies the tag filter`);
    assert.equal(submittedQuery.searchParams.get('sort'), 'title_asc', `${theme} search applies its selected order`);
    const searchHighlight = searchCard.locator('mark');
    assert.equal(await searchHighlight.count(), 1, `${theme} resource search displays the backend FTS hit as a semantic mark`);
    assert.equal(await searchHighlight.innerText(), '浏览器', `${theme} resource search preserves the matched term`);
    const searchHighlightContrast = await renderedContrast(searchHighlight);
    assert.ok(searchHighlightContrast >= 4.5,
      `${theme} resource search highlight contrast is ${searchHighlightContrast.toFixed(2)}:1; expected at least 4.5:1`);
    const searchCategory = searchCard.locator('span.text-xs').first();
    const searchCategoryContrast = await renderedContrast(searchCategory);
    assert.ok(searchCategoryContrast >= 4.5,
      `${theme} resource search category contrast is ${searchCategoryContrast.toFixed(2)}:1; expected at least 4.5:1`);
    await searchInput.fill('没有匹配');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.getByText('试试缩短关键词，或调整资料库、分类和标签条件。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '清除筛选条件并重新搜索', exact: true }).click();
    assert.equal(await page.getByLabel('资料库').inputValue(), '', `${theme} empty-state recovery clears the library filter`);
    assert.equal(await page.getByLabel('分类').inputValue(), '', `${theme} empty-state recovery clears the category filter`);
    assert.equal(await page.getByLabel('标签').inputValue(), '', `${theme} empty-state recovery clears the tag filter`);
    assert.equal(await page.getByLabel('排序').inputValue(), 'relevance', `${theme} empty-state recovery restores relevance sorting`);
    const queriesAfterReset = await page.evaluate(async () => await (await fetch('/__qa/search-queries')).json() as string[]);
    const resetQuery = new URL(queriesAfterReset.at(-1)!, base);
    assert.equal(resetQuery.searchParams.get('keyword'), '没有匹配', `${theme} empty-state recovery preserves the keyword`);
    assert.equal(resetQuery.searchParams.get('library_type'), null, `${theme} empty-state recovery removes the library filter from the request`);
    assert.equal(resetQuery.searchParams.get('category_id'), null, `${theme} empty-state recovery removes the category filter from the request`);
    assert.equal(resetQuery.searchParams.get('tag'), null, `${theme} empty-state recovery removes the tag filter from the request`);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const geometry = await page.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      assert.ok(geometry.pageWidth <= geometry.clientWidth + 1,
        `${theme} resource search results do not overflow horizontally at ${width}px: ${JSON.stringify(geometry)}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${base}/__qa?theme=${theme}&view=knowledge`);
    await page.getByRole('heading', { name: '知识库', exact: true }).waitFor();
    const selectedCategory = page.getByRole('button', { name: '全部分类', exact: true });
    const collapseRoot = page.getByRole('button', { name: '收起 浅色主题分类', exact: true });
    await collapseRoot.waitFor();
    assert.equal(await page.getByRole('button', { name: /^(展开|收起) 子分类$/ }).count(), 0,
      `${theme} leaf knowledge categories do not expose an inert expand/collapse button`);
    await collapseRoot.click();
    await page.getByRole('button', { name: '展开 浅色主题分类', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '子分类 1', exact: true }).count(), 0,
      `${theme} collapsing a knowledge category hides its child`);
    await page.getByRole('button', { name: '展开 浅色主题分类', exact: true }).click();
    const categoryButton = page.getByRole('button', { name: '浅色主题分类 1', exact: true });
    await categoryButton.waitFor();
    const categoryCount = categoryButton.locator('span.text-xs');
    const categoryCountContrast = await renderedContrast(categoryCount);
    assert.ok(categoryCountContrast >= 4.5,
      `${theme} knowledge category count contrast is ${categoryCountContrast.toFixed(2)}:1; expected at least 4.5:1`);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const geometry = await selectedCategory.evaluate((element) => ({
        categoryPanelHeight: element.parentElement?.getBoundingClientRect().height ?? 0,
        pageWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      assert.ok(geometry.categoryPanelHeight <= 180,
        `${theme} knowledge category panel should follow its contents rather than reserve desktop height at ${width}px: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.pageWidth <= geometry.clientWidth + 1,
        `${theme} knowledge page should not overflow horizontally at ${width}px: ${JSON.stringify(geometry)}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
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
    await categoryButton.click();
    const namedCategory = categoryButton;
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

  await page.goto(`${base}/__qa?theme=light&fail_categories=true`);
  await page.getByRole('heading', { name: '项目资料库', exact: true }).waitFor();
  await page.getByRole('link', { name: listResource.title, exact: true }).waitFor();
  const categoryFailure = page.getByRole('alert').filter({ hasText: '分类暂时无法读取' });
  await categoryFailure.waitFor();
  assert.equal(await page.getByText(listResource.title, { exact: true }).count(), 1, 'the resource list remains visible when its category request fails');
  const listReadsBeforeCategoryRetry = resourceListReads;
  const categoryReadsBeforeRetry = categoryReads;
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await page.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert.ok(geometry.pageWidth <= geometry.clientWidth + 1, `the category recovery notice does not overflow at ${width}px: ${JSON.stringify(geometry)}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await categoryFailure.getByRole('button', { name: '重新加载分类', exact: true }).click();
  await categoryFailure.waitFor({ state: 'detached' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('分类管理') && !(button as HTMLButtonElement).disabled));
  assert.equal(categoryReads, categoryReadsBeforeRetry + 1, 'category retry performs one category-list request');
  assert.equal(resourceListReads, listReadsBeforeCategoryRetry, 'category retry does not reload the resource list');

  const knowledgeListReadsBeforeFailure = resourceListReads;
  await page.goto(`${base}/__qa?theme=light&view=knowledge&fail_categories=true`);
  await page.getByRole('heading', { name: '知识库', exact: true }).waitFor();
  await page.getByRole('link', { name: listResource.title, exact: true }).waitFor();
  const knowledgeCategoryFailure = page.getByRole('alert').filter({ hasText: '分类目录暂不可用' });
  await knowledgeCategoryFailure.waitFor();
  assert.equal(await page.getByText(listResource.title, { exact: true }).count(), 1, 'the knowledge results remain visible when its category-tree request fails');
  const knowledgeCategoryReadsBeforeRetry = categoryReads;
  assert.equal(await page.getByRole('button', { name: '分类管理', exact: true }).isDisabled(), true, 'category management stays closed while its directory is unavailable');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await page.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert.ok(geometry.pageWidth <= geometry.clientWidth + 1, `the knowledge category recovery notice does not overflow at ${width}px: ${JSON.stringify(geometry)}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await knowledgeCategoryFailure.getByRole('button', { name: '重新加载分类', exact: true }).click();
  await knowledgeCategoryFailure.waitFor({ state: 'detached' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('分类管理') && !(button as HTMLButtonElement).disabled));
  assert.equal(categoryReads, knowledgeCategoryReadsBeforeRetry + 1, 'knowledge category retry performs one category-list request');
  assert.equal(resourceListReads, knowledgeListReadsBeforeFailure + 1, 'knowledge category failure and retry do not duplicate the resource-list request');
  assert.equal(await page.getByRole('button', { name: '分类管理', exact: true }).isDisabled(), false, 'category management becomes available after the directory is restored');

  await page.goto(`${base}/__qa?theme=light`);
  await page.getByRole('heading', { name: '项目资料库', exact: true }).waitFor();
  failNextDeleteId = listResource.id;
  await page.getByRole('button', { name: `删除资料 ${listResource.title}`, exact: true }).click();
  await page.getByRole('heading', { name: '删除资料', exact: true }).waitFor();
  const failedDeleteResponse = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith(`/api/resource-center/resources/${listResource.id}`) && response.status() === 503);
  const deleteStatusResponse = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/resource-center/resources/${listResource.id}`) && response.status() === 200);
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await Promise.all([failedDeleteResponse, deleteStatusResponse]);
  const deleteNotice = page.getByRole('status').filter({ hasText: '仍未移入回收站，可以安全地重新确认删除。' });
  await deleteNotice.waitFor();
  assert.equal(existingResourceIds.has(listResource.id), true, 'failed list deletion keeps the resource in the isolated fixture');
  assert.equal(resourceDeleteRequests, 1, 'uncertain deletion is followed by a read-only status lookup, not a repeated delete');
  assert.equal(await page.getByRole('heading', { name: '删除资料', exact: true }).count(), 0, 'read-back closes the delete confirmation and keeps retry deliberate');
  await page.getByRole('button', { name: `删除资料 ${listResource.title}`, exact: true }).click();
  await page.getByRole('heading', { name: '删除资料', exact: true }).waitFor();
  await page.evaluate(() => document.documentElement.style.setProperty('--xmt-z-modal', '250'));
  const deleteDialog = page.getByRole('dialog', { name: '删除资料', exact: true });
  assert.equal(await deleteDialog.evaluate((element) => getComputedStyle(element).zIndex), '250', 'the modal layer must consume the shared token');
  await page.keyboard.press('Control+k');
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
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await deleteDialog.waitFor({ state: 'detached' });
  await page.evaluate(() => document.documentElement.style.removeProperty('--xmt-z-modal'));
  await page.getByRole('button', { name: `删除资料 ${listResource.title}`, exact: true }).click();
  await page.getByRole('heading', { name: '删除资料', exact: true }).waitFor();
  failNextResourceListRead = true;
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByText('删除成功', { exact: true }).waitFor();
  assert.equal(existingResourceIds.has(listResource.id), false, 'successful list deletion removes the isolated resource');
  const confirmedDeleteMessage = `服务端已确认资料「${listResource.title}」已删除，但列表刷新失败；请重新加载列表确认，不要重复删除。`;
  await page.getByRole('alert').getByText(confirmedDeleteMessage, { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: listResource.title, exact: true }).count(), 1, 'the confirmed deletion remains visible with an explicit deleted status when refresh fails');
  await page.getByText('已移入回收站', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: `删除资料 ${listResource.title}`, exact: true }).count(), 0, 'a confirmed deleted resource cannot be submitted for deletion again');
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
  assert.equal(new URL(page.url()).searchParams.get('library_type'), 'project', 'resource creation preserves the source library on its detail route');
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
  }, `/asset-center/resources/${raceSecondResource.id}?library_type=project`);
  await racePage.getByRole('heading', { name: raceSecondResource.title, exact: true }).waitFor();
  await raceDetailReadFinished;
  await racePage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  assert.equal(racePage.url().endsWith(`/asset-center/resources/${raceSecondResource.id}?library_type=project`), true, 'the route changes to the current resource while the prior read is pending');
  assert.equal(await racePage.getByRole('heading', { name: raceFirstResource.title, exact: true }).count(), 0, 'a late response from the prior resource cannot replace current detail state');
  await racePage.close();

  failNextDeleteId = detailResource.id;
  failNextAuditRead = true;
  const detailReadsBeforeAuditFailure = resourceDetailReads;
  const auditReadsBeforeFailure = resourceAuditReads;
  await page.goto(`${base}/__qa?theme=dark&view=detail`);
  await page.getByRole('heading', { name: detailResource.title, exact: true }).waitFor();
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get('library_type') === 'project');
  assert.equal(new URL(page.url()).searchParams.get('library_type'), 'project', 'legacy detail routes learn and preserve the resource library type');
  assert.equal(await page.getByRole('navigation', { name: '面包屑' }).getByText('项目资料库', { exact: true }).count(), 1, 'resource detail breadcrumb follows the resource library type');
  assert.equal(await page.getByRole('link', { name: '返回所属资料库' }).getAttribute('href'), '/asset-center/projects', 'resource detail returns to its owning library');
  const auditFailure = page.getByRole('alert').filter({ hasText: '审计记录暂时无法读取' });
  await auditFailure.waitFor();
  assert.equal(await page.getByText(detailResource.content_text!, { exact: true }).count(), 1, 'the resource detail remains usable when its optional audit request fails');
  assert.equal(await page.getByRole('heading', { name: '资料详情暂时无法读取', exact: true }).count(), 0, 'an audit-only failure is not presented as a resource detail failure');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await page.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert.ok(geometry.pageWidth <= geometry.clientWidth + 1, `the audit recovery notice does not overflow at ${width}px: ${JSON.stringify(geometry)}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(resourceDetailReads, detailReadsBeforeAuditFailure + 1, 'the initial audit failure does not cause a second resource detail read');
  assert.equal(resourceAuditReads, auditReadsBeforeFailure + 1, 'the audit panel makes one initial read');
  const createsBeforeAuditRetry = resourceCreateRequests;
  const deletesBeforeAuditRetry = resourceDeleteRequests;
  await auditFailure.getByRole('button', { name: '重新加载审计记录', exact: true }).click();
  await auditFailure.waitFor({ state: 'detached' });
  assert.equal(resourceAuditReads, auditReadsBeforeFailure + 2, 'retry performs one additional audit read');
  assert.equal(resourceDetailReads, detailReadsBeforeAuditFailure + 1, 'audit retry does not reload the resource detail');
  assert.equal(resourceCreateRequests, createsBeforeAuditRetry, 'audit retry does not create a resource');
  assert.equal(resourceDeleteRequests, deletesBeforeAuditRetry, 'audit retry does not delete a resource');
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
  const failedDetailDeleteResponse = page.waitForResponse((response) => response.request().method() === 'DELETE'
    && response.url().endsWith(`/api/resource-center/resources/${detailResource.id}`) && response.status() === 503);
  const detailDeleteStatusResponse = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().endsWith(`/api/resource-center/resources/${detailResource.id}`) && response.status() === 200);
  await page.getByRole('button', { name: '删除', exact: true }).last().click();
  await Promise.all([failedDetailDeleteResponse, detailDeleteStatusResponse]);
  await page.getByRole('status').filter({ hasText: '仍未移入回收站，可以安全地重新确认删除。' }).waitFor();
  assert.equal(existingResourceIds.has(detailResource.id), true, 'failed detail deletion keeps the isolated resource');
  assert.equal(await page.getByRole('heading', { name: detailResource.title, exact: true }).count(), 1, 'failed detail deletion does not navigate away');
  const detailDeleteRequestsBeforeRetry = resourceDeleteRequests;
  delayedDeleteId = detailResource.id;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('heading', { name: '删除资料', exact: true }).waitFor();
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
  await page.getByRole('heading', { name: '项目资料库', exact: true }).waitFor();
  assert.equal(page.url().endsWith('/asset-center/projects'), true, 'successful detail deletion returns to the resource’s owning library');

  assert.deepEqual(errors, [], 'resource table light/dark hover states render without browser errors');
  assert.equal(expectedHttpErrors.length, 7, 'two intentional delete failures, post-delete list failure, post-create detail failure, two isolated category read failures and audit read failure each return one 503 response');
  console.log('Resource browser test passed: resource search preserves semantic FTS highlights with readable category labels at 320/390px; list pagination actions have names and correct disabled states; fixed table actions stay visible; category/audit recovery, detail request ownership and list/detail delete feedback meet their contracts.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
