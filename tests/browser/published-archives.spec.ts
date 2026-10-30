import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const member = { id: 92, username: 'published-archive-qa', role: 'editor', name: '发布归档验收', enabled: true, force_change_password: false };

function luminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

async function contrast(locator: import('playwright').Locator) {
  return locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    const appBackground = getComputedStyle(document.documentElement).getPropertyValue('--xmt-app-bg').match(/[\d.]+/g)?.map(Number) || [];
    let background = appBackground.length >= 3 ? appBackground.slice(0, 3) : [255, 255, 255];
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    for (const ancestor of ancestors.reverse()) {
      const color = getComputedStyle(ancestor).backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
      if (color.length < 3) continue;
      const alpha = color.length >= 4 ? color[3] : 1;
      if (alpha <= 0) continue;
      background = color.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
    }
    return { foreground, background, backgroundColor: `rgb(${background.map(Math.round).join(', ')})` };
  }).then(({ foreground, background, backgroundColor }) => {
    if (foreground.length !== 3 || background.length !== 3) return { ratio: 0, backgroundColor };
    const weights = [0.2126, 0.7152, 0.0722];
    const textLum = foreground.reduce((sum, channel, index) => sum + weights[index] * luminance(channel), 0);
    const backgroundLum = background.reduce((sum, channel, index) => sum + weights[index] * luminance(channel), 0);
    return { ratio: (Math.max(textLum, backgroundLum) + 0.05) / (Math.min(textLum, backgroundLum) + 0.05), backgroundColor };
  });
}
const archiveList = {
  data: [
    {
      id: 701,
      name: '多平台早餐主题',
      file_path: 'archive/topic-71',
      uploader_name: '发布归档验收',
      platform: 'douyin',
      publishedPlatforms: ['douyin', 'weixin'],
      publishedRecordCount: 2,
      scriptVersion: 'v3',
      shootingCommentCount: 1,
      publishedAt: '2026-09-29 10:00:00',
      views: 456789,
      likes: 231,
      archived_at: '2026-09-29 10:30:00',
      created_at: '2026-09-29 10:30:00',
      updated_at: '2026-09-29 10:30:00',
    },
    {
      id: 702,
      name: '旧版单平台归档',
      file_path: 'archive/topic-72',
      uploader_name: '发布归档验收',
      platform: 'xiaohongshu',
      publishedPlatforms: ['xiaohongshu'],
      publishedRecordCount: 1,
      scriptVersion: '',
      shootingCommentCount: 0,
      publishedAt: '2026-09-28 11:00:00',
      views: 88,
      likes: 5,
      archived_at: '2026-09-28 11:30:00',
      created_at: '2026-09-28 11:30:00',
      updated_at: '2026-09-28 11:30:00',
    },
  ],
  total: 2,
  page: 1,
  limit: 12,
};
let archiveItems = [...archiveList.data];
let archiveListReads = 0;
let failNextArchiveListRead = false;
let failedArchiveListReads = 0;
let archiveDeleteWrites = 0;
let archiveDetailReads = 0;
let failNextArchiveDetailRead701 = false;
const archiveDeleteAttempts = new Map<number, number>();
let productionMutationWrites = 0;
const productionHistoryVersionReads: string[] = [];
const productionSourceSnapshotReads: string[] = [];
const app = express();
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  const adminCookie = req.query.admin === '1' ? "document.cookie='xmt_archive_qa_admin=1; path=/';" : '';
  const noProductionViewCookie = req.query.source_permission === '0' ? "document.cookie='xmt_archive_qa_no_production=1; path=/';" : '';
  const crossTopicCookie = req.query.source_permission === '0' ? "document.cookie='xmt_archive_qa_cross_topic=1; path=/';" : '';
  const sourceScopeDeniedCookie = req.query.source_scope === 'denied' ? "document.cookie='xmt_archive_qa_source_scope_denied=1; path=/';" : '';
  const unavailableSourceCookie = req.query.source_unavailable === '1' ? "document.cookie='xmt_archive_qa_source_unavailable=1; path=/';" : '';
  const ambiguousSnapshotCookie = req.query.source_snapshot_ambiguous === '1' ? "document.cookie='xmt_archive_qa_source_snapshot_ambiguous=1; path=/';" : '';
  return res.type('html').send(`<script>${adminCookie}${noProductionViewCookie}${crossTopicCookie}${sourceScopeDeniedCookie}${unavailableSourceCookie}${ambiguousSnapshotCookie}localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(member))});localStorage.setItem('xmt_token','published-archive-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/asset-center');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(member));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/permissions/my', (req, res) => {
  const permissions = req.headers.cookie?.includes('xmt_archive_qa_admin=1') ? ['resource:delete', 'production:view', 'topic:view'] : ['topic:view'];
  if (!req.headers.cookie?.includes('xmt_archive_qa_no_production=1')) permissions.push('production:view');
  res.json(permissions);
});
app.get('/api/resource-center/resources', (_req, res) => res.json({ data: [], pagination: { page: 1, page_size: 1, total: 0, total_pages: 0 } }));
app.post('/__qa/fail-next-archive-list-read', (_req, res) => {
  failNextArchiveListRead = true;
  res.json({ ok: true });
});
app.get('/api/resources/archives', (_req, res) => {
  archiveListReads += 1;
  if (failNextArchiveListRead) {
    failNextArchiveListRead = false;
    failedArchiveListReads += 1;
    return res.status(503).json({ message: '模拟归档列表读取失败' });
  }
  res.json({ ...archiveList, data: archiveItems, total: archiveItems.length });
});
app.delete('/api/resources/archives/:id', (req, res) => {
  archiveDeleteWrites += 1;
  const id = Number(req.params.id);
  const attempt = (archiveDeleteAttempts.get(id) || 0) + 1;
  archiveDeleteAttempts.set(id, attempt);
  if (id === 702 && attempt === 1) {
    archiveItems = archiveItems.filter((item) => item.id !== id);
    return res.status(503).json({ message: '模拟服务端已删除但响应失败' });
  }
  if (id === 701 && attempt === 1) {
    failNextArchiveDetailRead701 = true;
    return res.status(503).json({ message: '模拟服务端暂未删除归档' });
  }
  archiveItems = archiveItems.filter((item) => item.id !== id);
  res.json({ message: '归档已删除' });
});
app.get('/api/resources/archives/701', (req, res) => {
  archiveDetailReads += 1;
  if (failNextArchiveDetailRead701) {
    failNextArchiveDetailRead701 = false;
    return res.status(503).json({ message: '模拟归档状态核实暂不可用' });
  }
  if (!archiveItems.some((item) => item.id === 701)) return res.status(404).json({ message: '归档不存在' });
  const crossTopicSource = req.headers.cookie?.includes('xmt_archive_qa_cross_topic=1')
    || req.headers.cookie?.includes('xmt_archive_qa_source_scope_denied=1');
  return res.json({
  id: 701,
  name: '多平台早餐主题',
  file_path: 'archive/topic-71',
  uploader_name: member.name,
  created_at: '2026-09-29 10:00:00',
  updated_at: '2026-09-29 10:30:00',
  archive: {
    topic: { id: 71, title: '多平台早餐主题', description: '两个平台分别发布，各自查看数据。', platform: 'douyin', deadline: '2026-09-29', created_at: '2026-09-20 09:00:00' },
    script: { version: 'v3.0', content: '<p>归档中的正式稿。</p>', history: [] },
    shooting: { record: { id: 501, script_content: '<p>成片阶段独立稿。</p>' }, comments: [] },
    publishing: { publishing_id: 402, platform: 'weixin', url: 'https://example.test/weixin/402', status: 'published', publish_time: '2026-09-29 10:00:00' },
    script_sources: {
      shooting: { topic_id: 71, production_id: 801, version: 'v2.0', state: 'derived' },
      publishing: {
        topic_id: 71,
        ...(crossTopicSource ? { source_topic_id: 72 } : {}),
        production_id: 801,
        version: 'v1.0',
        state: req.headers.cookie?.includes('xmt_archive_qa_source_unavailable=1') ? 'unavailable' : 'derived',
      },
    },
    script_source_snapshots: [
      { topic_id: 71, production_id: 801, version: 'v2.0', content: '<p>成片剧本引用的创作历史正文。</p>', content_markdown: '成片剧本引用的创作历史正文。' },
      ...(!crossTopicSource ? [{ topic_id: 71, production_id: 801, version: 'v1.0', content: '<p>发布剧本引用的 v1.0 创作历史正文。</p>', content_markdown: '发布剧本引用的 v1.0 创作历史正文。' }] : []),
      ...(req.headers.cookie?.includes('xmt_archive_qa_source_snapshot_ambiguous=1') ? [{ topic_id: 71, production_id: 801, version: 'v1.0', content: '<p>冲突的 v1.0 来源正文副本。</p>', content_markdown: '冲突的 v1.0 来源正文副本。' }] : []),
    ],
    analytics: { data_date: '2026-09-29', views: 1200, likes: 52, shares: 8, comments: 4 },
    published_records: [
      {
        publishing_id: 402, platform: 'weixin', url: 'https://example.test/weixin/402', status: 'published', publish_time: '2026-09-29 10:00:00',
        script_source: {
          topic_id: 71,
          ...(crossTopicSource ? { source_topic_id: 72 } : {}),
          production_id: 801,
          version: 'v1.0',
          state: req.headers.cookie?.includes('xmt_archive_qa_source_unavailable=1') ? 'unavailable' : 'derived',
        },
        analytics: { data_date: '2026-09-29', views: 1200, likes: 52, shares: 8, comments: 4 },
      },
      {
        publishing_id: 401, platform: 'douyin', url: 'https://example.test/douyin/401', status: 'published', publish_time: '2026-09-28 10:00:00',
        script_source: { topic_id: 71, production_id: 801, version: 'v2.0', state: 'derived' },
        analytics: { data_date: '2026-09-28', views: 456789, likes: 231, shares: 15, comments: 28 },
      },
    ],
    archived_at: '2026-09-29 10:30:00',
  },
  });
});
app.get('/api/resources/archives/702', (_req, res) => {
  archiveDetailReads += 1;
  if (!archiveItems.some((item) => item.id === 702)) return res.status(404).json({ message: '归档不存在' });
  return res.json({
  id: 702,
  name: '旧版单平台归档',
  file_path: 'archive/topic-72',
  uploader_name: member.name,
  created_at: '2026-09-28 11:00:00',
  updated_at: '2026-09-28 11:30:00',
  archive: {
    topic: { title: '旧版单平台归档', description: '', platform: 'xiaohongshu', deadline: '', created_at: '' },
    publishing: { platform: 'xiaohongshu', url: '', status: 'published', publish_time: '2026-09-28 11:00:00' },
    analytics: { views: 88, likes: 5, shares: 1, comments: 0 },
    archived_at: '2026-09-28 11:30:00',
  },
  });
});
app.get('/api/workflow/production/801', (_req, res) => res.json({
  id: 801,
  topic_id: 71,
  topic_title: '多平台早餐主题',
  version: 'v3.0',
  content: '<p>这是当前最新的 v3.0 创作稿，不应替代归档来源版本。</p>',
  status: 'draft',
  file_path: '',
  operator_id: member.id,
  operator_name: member.name,
  created_at: '2026-09-20 09:00:00',
  updated_at: '2026-09-29 10:00:00',
}));
app.get('/api/topics/71', (_req, res) => res.json({ data: {
  id: 71,
  title: '多平台早餐主题',
  description: '两个平台分别发布，各自查看数据。',
  status: 'production',
  platform: 'douyin',
  deadline: '2026-09-29',
  creator_id: member.id,
  assignee_id: member.id,
  created_at: '2026-09-20 09:00:00',
  updated_at: '2026-09-29 10:00:00',
} }));
app.get('/api/workflow/production/801/history', (req, res) => {
  const versionFilter = String(req.query.version || '');
  if (versionFilter) productionHistoryVersionReads.push(versionFilter);
  const v1 = {
    id: 801,
    production_id: 801,
    version: 'v1.0',
    content: '<p>准确的 v1.0 创作历史正文。</p>',
    status: 'draft',
    change_type: 'minor',
    operator_id: member.id,
    operator_name: member.name,
    created_at: '2026-09-22 10:00:00',
  };
  const v2 = {
    id: 802,
    production_id: 801,
    version: 'v2.0',
    content: '<p>准确的 v2.0 创作历史正文。</p>',
    status: 'draft',
    change_type: 'major',
    operator_id: member.id,
    operator_name: member.name,
    created_at: '2026-09-25 10:00:00',
  };
  const allHistory = [v2, v1];
  const history = versionFilter ? allHistory.filter((entry) => entry.version === versionFilter) : allHistory;
  res.json({ data: history, total: history.length, page: Number(req.query.page || 1), limit: Number(req.query.limit || 20) });
});
app.get('/api/workflow/production/801/source-snapshot', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const versionFilter = String(req.query.version || '');
  productionSourceSnapshotReads.push(versionFilter);
  if (req.headers.cookie?.includes('xmt_archive_qa_no_production=1')) {
    return res.status(403).json({ message: '无权查看创作来源快照' });
  }
  if (req.headers.cookie?.includes('xmt_archive_qa_source_scope_denied=1')) {
    return res.status(403).json({ message: '无权查看该来源选题' });
  }
  const content = versionFilter === 'v1.0'
    ? '<p>准确的 v1.0 创作历史正文。</p>'
    : versionFilter === 'v2.0'
      ? '<p>准确的 v2.0 创作历史正文。</p>'
      : '';
  if (!content) return res.status(404).json({ message: '来源版本不可用' });
  return res.json({
    production_id: 801,
    source_topic_id: 71,
    source_topic_title: '多平台早餐主题',
    version: versionFilter,
    content,
    content_markdown: content,
    status: 'approved',
    created_at: '2026-09-25 10:00:00',
    version_timestamp: '2026-09-25 10:00:00',
    operator_name: member.name,
  });
});
app.all('/api/workflow/production/801', (req, res, next) => {
  if (req.method === 'GET') return next();
  productionMutationWrites += 1;
  res.status(405).json({ message: '隔离验收不允许修改创作数据' });
});
app.use('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_PUBLISHED_ARCHIVES_QA_SERVE === '1') {
  console.log(`Isolated published archive QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  desktop.on('pageerror', (error) => errors.push(error.message));
  desktop.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('/api/resources/archives') && (message.text().includes('503 (Service Unavailable)') || message.text().includes('404 (Not Found)'))) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  await desktop.goto(`${base}/__qa`);
  await desktop.getByRole('main').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
  const workbenchGroup = desktop.locator('nav[aria-label="侧边导航"] > div').filter({ has: desktop.getByRole('button', { name: '工作台导航分组', exact: true }) });
  const workbenchToggle = workbenchGroup.getByRole('button', { name: '工作台导航分组', exact: true });
  await workbenchToggle.click();
  const workbenchLink = workbenchGroup.locator('ul').getByRole('button', { name: '工作台', exact: true });
  assert.equal(await workbenchToggle.getAttribute('aria-expanded'), 'true', 'the workbench group can be expanded');
  assert.equal(await workbenchLink.count(), 1, 'the workbench page remains available in its group');
  assert.equal(await desktop.getByRole('button', { name: '工作台导航分组', exact: true }).count(), 1, 'the workbench group control has a distinct accessible name');
  assert.equal(await desktop.getByRole('button', { name: '工作台', exact: true }).count(), 1, 'the workbench page retains its own accessible name');
  await workbenchToggle.click();

  const contentProductionGroup = desktop.locator('nav.flex-1 > div').filter({ has: desktop.getByRole('button', { name: '内容生产', exact: true }) });
  const contentProductionToggle = contentProductionGroup.getByRole('button', { name: '内容生产', exact: true });
  const collapsedContentLinks = contentProductionGroup.locator('ul');
  await collapsedContentLinks.waitFor({ state: 'attached' });
  assert.equal(await contentProductionToggle.getAttribute('aria-expanded'), 'false', 'a collapsed navigation group reports its collapsed state');
  assert.equal(await collapsedContentLinks.getAttribute('aria-hidden'), 'true', 'collapsed navigation links are removed from the accessibility tree');
  assert.equal(await collapsedContentLinks.evaluate((list) => (list as HTMLElement).inert), true, 'collapsed navigation links cannot receive keyboard focus');
  const collapsedItems = await collapsedContentLinks.locator('button').evaluateAll((buttons) => buttons.map((button) => ({
    label: button.textContent?.trim() || '',
    tabIndex: (button as HTMLButtonElement).tabIndex,
  })));
  assert.ok(collapsedItems.some((item) => item.label.includes('选题管理')), 'the collapsed content-production group includes its topic link');
  assert.ok(collapsedItems.every((item) => item.tabIndex === -1), 'collapsed content-production links are not tabbable');
  await contentProductionToggle.click();
  assert.equal(await contentProductionToggle.getAttribute('aria-expanded'), 'true', 'expanding a navigation group updates its state');
  assert.equal(await collapsedContentLinks.getAttribute('aria-hidden'), 'false', 'expanded navigation links return to the accessibility tree');
  assert.equal(await collapsedContentLinks.evaluate((list) => (list as HTMLElement).inert), false, 'expanded navigation links are no longer inert');
  assert.ok((await collapsedContentLinks.locator('button').evaluateAll((buttons) => buttons.every((button) => (button as HTMLButtonElement).tabIndex === 0))), 'expanded content-production links return to the normal Tab order');
  await contentProductionToggle.click();
  const expandedSidebarToggle = desktop.getByRole('button', { name: '收起侧边栏', exact: true });
  const expandedSidebarToggleBounds = await expandedSidebarToggle.boundingBox();
  assert.ok(expandedSidebarToggleBounds && expandedSidebarToggleBounds.width >= 40 && expandedSidebarToggleBounds.height >= 40, 'the expanded sidebar toggle has a 40px minimum hit area');
  const expandedSidebarOverlapsMainAction = await desktop.locator('main').evaluate((main, bounds) => Array.from(main.querySelectorAll('button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])')).some((control) => {
    const rect = control.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left < bounds.x + bounds.width && rect.right > bounds.x && rect.top < bounds.y + bounds.height && rect.bottom > bounds.y;
  }), expandedSidebarToggleBounds);
  assert.equal(expandedSidebarOverlapsMainAction, false, 'the expanded sidebar hit area does not cover a main-content control');
  await expandedSidebarToggle.click();
  const collapsedSidebarToggle = desktop.getByRole('button', { name: '展开侧边栏', exact: true });
  const collapsedSidebarToggleBounds = await collapsedSidebarToggle.boundingBox();
  assert.ok(collapsedSidebarToggleBounds && collapsedSidebarToggleBounds.width >= 40 && collapsedSidebarToggleBounds.height >= 40, 'the collapsed sidebar toggle keeps a 40px minimum hit area');
  const collapsedSidebarOverlapsMainAction = await desktop.locator('main').evaluate((main, bounds) => Array.from(main.querySelectorAll('button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])')).some((control) => {
    const rect = control.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left < bounds.x + bounds.width && rect.right > bounds.x && rect.top < bounds.y + bounds.height && rect.bottom > bounds.y;
  }), collapsedSidebarToggleBounds);
  assert.equal(collapsedSidebarOverlapsMainAction, false, 'the collapsed sidebar hit area does not cover a main-content control');
  const compactSectionToggles = desktop.locator('nav.flex-1').first().locator('button[aria-expanded]');
  const compactSectionLabels = await compactSectionToggles.evaluateAll((buttons) => buttons.map((button) => ({
    title: button.getAttribute('title'),
    accessibleName: button.getAttribute('aria-label'),
  })));
  assert.ok(compactSectionLabels.length > 0, 'the compact desktop sidebar keeps its section controls');
  assert.ok(compactSectionLabels.every(({ title, accessibleName }) => title && accessibleName && (
    accessibleName === title
    || accessibleName.startsWith(`${title}，当前视图：`)
    || accessibleName.startsWith(`${title}导航分组`)
  )), 'icon-only section controls keep distinct names and announce the current view when needed');
  await desktop.getByRole('button', { name: '内容生产', exact: true }).click();
  assert.equal(await desktop.getByRole('button', { name: '收起侧边栏', exact: true }).count(), 1, 'activating an icon-only section expands the desktop sidebar');
  assert.equal(await contentProductionToggle.getAttribute('aria-expanded'), 'true', 'activating an icon-only section opens that group');
  assert.equal(await collapsedContentLinks.getAttribute('aria-hidden'), 'false', 'the selected group links become visible after expanding the sidebar');
  const mobileNavigationDrawer = desktop.locator('div.fixed.inset-0').filter({ has: desktop.locator('button[aria-label="关闭导航菜单"]') });
  assert.equal(await mobileNavigationDrawer.evaluate((drawer) => (drawer as HTMLElement).inert), true, 'the closed mobile navigation drawer cannot receive keyboard focus');
  await desktop.setViewportSize({ width: 390, height: 844 });
  await desktop.getByRole('button', { name: '打开导航菜单', exact: true }).click();
  assert.equal(await mobileNavigationDrawer.getAttribute('role'), 'dialog', 'the open mobile navigation drawer is exposed as a dialog');
  assert.equal(await mobileNavigationDrawer.getAttribute('aria-modal'), 'true', 'the open mobile navigation drawer is identified as modal');
  assert.equal(await mobileNavigationDrawer.getAttribute('aria-hidden'), 'false', 'opening the mobile drawer exposes it to assistive technology');
  assert.equal(await mobileNavigationDrawer.evaluate((drawer) => (drawer as HTMLElement).inert), false, 'opening the mobile drawer restores its normal focus behavior');
  assert.equal(await desktop.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('aria-label')), '关闭导航菜单', 'opening the mobile drawer moves focus inside it');
  await desktop.keyboard.press('Shift+Tab');
  assert.equal(await desktop.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim()), '退出登录', 'Shift+Tab from the first drawer control wraps to the last control');
  await desktop.keyboard.press('Tab');
  assert.equal(await desktop.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('aria-label')), '关闭导航菜单', 'Tab from the last drawer control wraps back to the first control');
  await desktop.keyboard.press('Escape');
  assert.equal(await mobileNavigationDrawer.getAttribute('aria-hidden'), 'true', 'Escape closes and hides the mobile drawer');
  assert.equal(await mobileNavigationDrawer.evaluate((drawer) => (drawer as HTMLElement).inert), true, 'Escape returns the closed drawer to an inert state');
  assert.equal(await desktop.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('aria-label')), '打开导航菜单', 'closing the mobile drawer restores focus to its trigger');
  await desktop.getByRole('button', { name: '打开导航菜单', exact: true }).click();
  await desktop.getByRole('button', { name: '关闭导航菜单', exact: true }).click();
  assert.equal(await mobileNavigationDrawer.getAttribute('aria-hidden'), 'true', 'closing the mobile drawer hides it from assistive technology');
  assert.equal(await mobileNavigationDrawer.evaluate((drawer) => (drawer as HTMLElement).inert), true, 'closing the mobile drawer removes its descendants from keyboard interaction');
  await desktop.setViewportSize({ width: 1440, height: 960 });
  const overviewEntry = desktop.locator('a[href="/asset-center/published-archives"]').last();
  await overviewEntry.waitFor();
  const archiveReadsBeforeRecovery = archiveListReads;
  await desktop.evaluate(async () => { await fetch('/__qa/fail-next-archive-list-read', { method: 'POST' }); });
  await overviewEntry.click();
  await desktop.getByRole('heading', { name: '发布归档' }).waitFor();
  await desktop.getByRole('alert').getByText(/归档列表暂时无法读取/).waitFor();
  assert.equal(await desktop.getByText('暂无资源归档', { exact: true }).count(), 0, 'an initial archive-list failure is not presented as an empty archive collection');
  assert.equal(await desktop.getByText('共 — 个存档', { exact: true }).count(), 1, 'an initial read failure does not present an unverified zero archive count');
  assert.deepEqual(await desktop.locator('.xmt-data-number').allTextContents(), ['—', '—', '—', '—'], 'initial summary metrics remain unavailable until the first successful list read');
  assert.equal(archiveListReads, archiveReadsBeforeRecovery + 1, 'the initial failure performs one archive-list read');
  assert.equal(archiveDeleteWrites, 0, 'list recovery does not trigger any archive mutation');
  await desktop.screenshot({ path: '/tmp/xmt-published-archive-list-error-1440.png', fullPage: true });
  await desktop.getByRole('button', { name: '重新加载归档', exact: true }).click();
  const multiTopic = desktop.getByRole('button', { name: /多平台早餐主题/ });
  await multiTopic.waitFor();
  assert.equal(archiveListReads, archiveReadsBeforeRecovery + 2, 'the recovery control retries only the archive-list GET');
  assert.equal(archiveDeleteWrites, 0, 'the successful read retry remains read-only');
  await desktop.evaluate(async () => { await fetch('/__qa/fail-next-archive-list-read', { method: 'POST' }); });
  const archiveSearch = desktop.getByPlaceholder('搜索资源名称...');
  await archiveSearch.fill('多平台早餐主题');
  await desktop.getByRole('alert').getByText(/仍显示最近一次成功读取的内容/).waitFor();
  await multiTopic.waitFor();
  assert.equal(await desktop.getByText('暂无资源归档', { exact: true }).count(), 0, 'a refresh failure preserves the last successful archive list instead of showing an empty state');
  assert.equal(await desktop.getByText('共 2 个存档', { exact: true }).count(), 1, 'a refresh failure retains the last confirmed archive count');
  assert.equal(archiveListReads, archiveReadsBeforeRecovery + 3, 'refresh failure performs one additional read');
  await desktop.getByRole('button', { name: '重新加载归档', exact: true }).click();
  await multiTopic.waitFor();
  assert.equal(archiveListReads, archiveReadsBeforeRecovery + 4, 'the second recovery action performs one read and no write');
  assert.equal(archiveDeleteWrites, 0, 'repeated read recovery never deletes an archive');
  assert.equal(expectedHttpErrors.length, 2, 'the browser logs only the two intentionally injected archive-list 503 responses');
  await archiveSearch.fill('');
  await desktop.getByRole('button', { name: /旧版单平台归档/ }).waitFor();
  await multiTopic.click();
  const navigationButtons = await desktop.locator('nav.flex-1').first().evaluate((nav) => Array.from(nav.querySelectorAll('button')).map((button) => ({
    label: button.textContent?.trim() || '',
    className: button.className,
  })));
  const activePublishedArchive = navigationButtons.find((button) => button.label === '发布归档');
  const activeAssetOverview = navigationButtons.find((button) => button.label === '资料中心概览');
  assert.match(activePublishedArchive?.className || '', /border-studio-border-active/, 'the nested archive route activates its own navigation item');
  assert.doesNotMatch(activeAssetOverview?.className || '', /border-studio-border-active/, 'the broader asset overview is not also marked active');
  await desktop.getByText('抖音', { exact: true }).first().waitFor();
  await desktop.getByText('微信视频号', { exact: true }).waitFor();
  await desktop.getByText(/共 2 条发布记录/).waitFor();
  await desktop.getByText('查看发布记录 #402', { exact: true }).waitFor();
  await desktop.getByText('查看发布记录 #401', { exact: true }).waitFor();
  await desktop.getByText('456,789', { exact: true }).waitFor();
  assert.equal(await desktop.getByRole('button', { name: '删除', exact: true }).count(), 0, 'a member without resource:delete does not see the archive delete action');
  const sourceTopicLink = desktop.getByRole('link', { name: '查看归档来源选题', exact: true });
  assert.equal(await sourceTopicLink.getAttribute('href'), '/topics/71', 'the archive links back to its exact source topic');
  assert.equal(await desktop.getByRole('button', { name: '发布信息', exact: true }).getAttribute('aria-pressed'), 'true', 'the default publishing detail view exposes its selected state');
  assert.equal(await desktop.getByRole('button', { name: '稿件', exact: true }).getAttribute('aria-pressed'), 'false', 'the inactive script detail view exposes its unselected state');
  await desktop.getByRole('button', { name: '稿件', exact: true }).click();
  assert.equal(await desktop.getByRole('button', { name: '稿件', exact: true }).getAttribute('aria-pressed'), 'true', 'the script detail view exposes its selected state after activation');
  const sourcePanel = desktop.getByTestId('archive-script-sources');
  await sourcePanel.getByText('成片剧本', { exact: true }).waitFor();
  const sourceVersionLink = sourcePanel.getByRole('link', { name: '查看成片剧本来源创作稿 v2.0', exact: true });
  assert.equal(await sourceVersionLink.getAttribute('href'), '/production/801/source-snapshot?version=v2.0', 'archive source links target the exact recorded production history version');
  const v2SnapshotResponse = desktop.waitForResponse((response) => response.url().includes('/api/workflow/production/801/source-snapshot?version=v2.0'));
  await sourceVersionLink.click();
  const v2Snapshot = await v2SnapshotResponse;
  assert.equal(v2Snapshot.status(), 200, 'an authorized archive viewer can read the exact source version');
  assert.equal(v2Snapshot.headers()['cache-control'], 'no-store', 'source manuscript responses are not cached');
  await desktop.getByRole('heading', { name: '创作来源快照', exact: true }).waitFor();
  await desktop.getByText('准确的 v2.0 创作历史正文。', { exact: true }).waitFor();
  await desktop.getByRole('region', { name: '来源版本信息' }).waitFor();
  assert.equal(await desktop.getByRole('button', { name: '保存草稿', exact: true }).count(), 0, 'the source snapshot page does not expose manuscript editing');
  assert.equal(await desktop.getByText('这是当前最新的 v3.0 创作稿，不应替代归档来源版本。', { exact: true }).count(), 0, 'following the archive link renders the exact historical body rather than the current manuscript');
  assert(productionSourceSnapshotReads.includes('v2.0'), 'the source snapshot endpoint receives the archive-recorded v2.0 explicitly');
  assert.equal(productionHistoryVersionReads.length, 0, 'the source snapshot page does not call the broader production history endpoint');
  assert.equal(productionMutationWrites, 0, 'opening an archived source version remains read-only');
  await desktop.goto(`${base}/asset-center/published-archives`);
  await desktop.getByRole('heading', { name: '发布归档' }).waitFor();
  await desktop.getByRole('button', { name: /多平台早餐主题/ }).click();
  await desktop.getByRole('button', { name: '稿件', exact: true }).click();
  const publishingVersionLink = sourcePanel.getByRole('link', { name: '查看发布剧本来源创作稿 v1.0', exact: true });
  assert.equal(await publishingVersionLink.getAttribute('href'), '/production/801/source-snapshot?version=v1.0', 'publishing archives link to the exact recorded history version independently from the shooting source');
  await publishingVersionLink.click();
  await desktop.getByRole('heading', { name: '创作来源快照', exact: true }).waitFor();
  await desktop.getByText('准确的 v1.0 创作历史正文。', { exact: true }).waitFor();
  assert.equal(await desktop.getByText('准确的 v2.0 创作历史正文。', { exact: true }).count(), 0, 'the publishing source opens its own recorded v1.0 rather than the shooting source v2.0');
  assert(productionSourceSnapshotReads.includes('v1.0'), 'the source snapshot endpoint explicitly receives the publishing source version');
  assert.equal(productionMutationWrites, 0, 'opening both archived source versions remains read-only');
  await desktop.goto(`${base}/asset-center/published-archives`);
  await desktop.getByRole('heading', { name: '发布归档' }).waitFor();
  await desktop.getByRole('button', { name: /多平台早餐主题/ }).click();
  await desktop.getByRole('button', { name: '稿件', exact: true }).click();
  await sourcePanel.getByRole('link', { name: '查看发布剧本来源创作稿 v1.0', exact: true }).waitFor();
  const archivedSourceDisclosures = sourcePanel.getByText('查看归档保存的来源正文', { exact: true });
  await archivedSourceDisclosures.nth(0).click();
  await sourcePanel.getByText('成片剧本引用的创作历史正文。', { exact: true }).waitFor();
  await archivedSourceDisclosures.nth(1).click();
  await sourcePanel.getByText('发布剧本引用的 v1.0 创作历史正文。', { exact: true }).waitFor();
  await desktop.screenshot({ path: '/tmp/xmt-published-archives-source-lineage-1440.png', fullPage: true });
  await desktop.getByRole('button', { name: '发布信息', exact: true }).click();
  assert.equal(await desktop.getByRole('button', { name: '发布信息', exact: true }).getAttribute('aria-pressed'), 'true', 'the publishing detail view restores selected state after activation');
  const weixinRecordCard = desktop.getByTestId('published-record-card-402');
  const douyinRecordCard = desktop.getByTestId('published-record-card-401');
  const weixinRecordSourceLink = weixinRecordCard.getByRole('link', { name: '查看发布记录 #402的来源创作稿 v1.0', exact: true });
  const douyinRecordSourceLink = douyinRecordCard.getByRole('link', { name: '查看发布记录 #401的来源创作稿 v2.0', exact: true });
  assert.equal(await weixinRecordSourceLink.getAttribute('href'), '/production/801/source-snapshot?version=v1.0', 'each published platform card links to its own exact historical source');
  assert.equal(await douyinRecordSourceLink.getAttribute('href'), '/production/801/source-snapshot?version=v2.0', 'the second platform card does not reuse the latest publication source');
  await weixinRecordCard.getByText('查看归档保存的来源正文', { exact: true }).click();
  await douyinRecordCard.getByText('查看归档保存的来源正文', { exact: true }).click();
  await weixinRecordCard.getByText('发布剧本引用的 v1.0 创作历史正文。', { exact: true }).waitFor();
  await douyinRecordCard.getByText('成片剧本引用的创作历史正文。', { exact: true }).waitFor();
  assert.equal(await weixinRecordCard.getByText('成片剧本引用的创作历史正文。', { exact: true }).count(), 0, 'a publication card never shows a different record’s source snapshot');
  for (const [label, locator] of [
    ['当前“发布信息”页签', desktop.getByRole('button', { name: '发布信息', exact: true })],
    ['发布链接', desktop.getByRole('link', { name: '打开发布链接' }).first()],
    ['发布记录链接', desktop.getByRole('link', { name: '查看发布记录 #402', exact: true })],
  ] as const) {
    const result = await contrast(locator);
    assert.ok(result.ratio >= 4.5, `浅色主题 ${label} 对比度为 ${result.ratio.toFixed(2)}:1 on ${result.backgroundColor}，应不低于 4.5:1`);
  }
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
      const cssViewport = {
        width: Math.round(viewport.width / zoom),
        height: Math.round(viewport.height / zoom),
      };
      await desktop.setViewportSize(cssViewport);
      const viewportMetrics = await desktop.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
      }));
      assert.equal(viewportMetrics.width, cssViewport.width, `CSS viewport width matches ${viewport.width}px physical width at ${zoom * 100}% zoom`);
      assert.equal(viewportMetrics.height, cssViewport.height, `CSS viewport height matches ${viewport.height}px physical height at ${zoom * 100}% zoom`);
      assert.ok(viewportMetrics.documentWidth <= viewportMetrics.width + 1, `document has no horizontal overflow at ${viewport.width}px physical width / ${zoom * 100}% zoom: ${JSON.stringify(viewportMetrics)}`);
      for (const [label, locator] of [
        ['返回发布归档', desktop.getByRole('button', { name: '返回发布归档', exact: true })],
        ['来源选题链接', sourceTopicLink],
        ['打开发布链接', desktop.getByRole('link', { name: '打开发布链接' }).first()],
        ['查看发布记录', desktop.getByRole('link', { name: '查看发布记录 #402', exact: true })],
        ['发布信息页签', desktop.getByRole('button', { name: '发布信息', exact: true })],
      ] as const) {
        await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
        const geometry = await locator.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const clippedBy: string[] = [];
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            const ancestorRect = ancestor.getBoundingClientRect();
            if ((['hidden', 'clip'].includes(style.overflowX) && (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1))
              || (['hidden', 'clip'].includes(style.overflowY) && (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1))) clippedBy.push(`${ancestor.tagName}.${String(ancestor.className)}`);
          }
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight, clippedBy, display: getComputedStyle(element).display, visibility: getComputedStyle(element).visibility };
        });
        assert.ok(geometry.width > 0 && geometry.height > 0, `${label} has a layout box at ${viewport.width}×${viewport.height}px physical size / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
        assert.notEqual(geometry.display, 'none', `${label} is not hidden at ${viewport.width}px physical width / ${zoom * 100}%`);
        assert.notEqual(geometry.visibility, 'hidden', `${label} is visible at ${viewport.width}px physical width / ${zoom * 100}%`);
        assert.deepEqual(geometry.clippedBy, [], `${label} is not clipped at ${viewport.width}px physical width / ${zoom * 100}%`);
        assert.ok(geometry.x >= -1 && geometry.x + geometry.width <= geometry.viewportWidth + 1, `${label} stays horizontally in the CSS viewport at ${viewport.width}px physical width / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
      }
    }
  }
  await desktop.setViewportSize({ width: 1440, height: 960 });
  await desktop.screenshot({ path: '/tmp/xmt-published-archives-1440.png', fullPage: true });

  await desktop.getByRole('button', { name: /返回发布归档/ }).click();
  await desktop.getByRole('button', { name: /旧版单平台归档/ }).click();
  await desktop.getByText(/共 1 条发布记录/).waitFor();
  await desktop.getByText('88', { exact: true }).first().waitFor();
  assert.equal(await desktop.getByRole('link', { name: '查看归档来源选题', exact: true }).count(), 0, 'legacy archive without a topic id does not invent a source-topic link');
  await desktop.getByRole('button', { name: '稿件', exact: true }).click();
  await desktop.getByTestId('archive-script-sources').getByText('旧版归档未保存剧本来源信息', { exact: false }).waitFor();
  assert.equal(await desktop.getByTestId('archive-script-sources').getByRole('link').count(), 0, 'legacy archives without source metadata do not infer a link from current manuscripts');
  await desktop.getByRole('button', { name: '发布信息', exact: true }).click();
  await desktop.screenshot({ path: '/tmp/xmt-published-archives-legacy-1440.png', fullPage: true });
  await desktop.close();

  const unavailableSourcePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  unavailableSourcePage.on('pageerror', (error) => errors.push(error.message));
  await unavailableSourcePage.goto(`${base}/__qa?source_unavailable=1`);
  await unavailableSourcePage.getByRole('main').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
  await unavailableSourcePage.locator('a[href="/asset-center/published-archives"]').last().click();
  await unavailableSourcePage.getByRole('heading', { name: '发布归档' }).waitFor();
  await unavailableSourcePage.getByRole('button', { name: /多平台早餐主题/ }).click();
  await unavailableSourcePage.getByRole('button', { name: '稿件', exact: true }).click();
  const unavailableSourcePanel = unavailableSourcePage.getByTestId('archive-script-sources');
  await unavailableSourcePanel.getByText('来源版本当前不可用', { exact: true }).waitFor();
  assert.equal(await unavailableSourcePanel.getByRole('link', { name: '查看发布剧本来源创作稿 v1.0' }).count(), 0, 'an unavailable publishing source is explicit and has no misleading history link');
  await unavailableSourcePage.getByRole('button', { name: '发布信息', exact: true }).click();
  const unavailableWeixinCard = unavailableSourcePage.getByTestId('published-record-card-402');
  await unavailableWeixinCard.getByText('来源版本当前不可用', { exact: true }).waitFor();
  assert.equal(await unavailableWeixinCard.getByRole('link', { name: '查看发布记录 #402的来源创作稿 v1.0', exact: true }).count(), 0, 'an unavailable per-record source has no misleading link');
  assert.equal(await unavailableWeixinCard.getByText('查看归档保存的来源正文', { exact: true }).count(), 0, 'an unavailable per-record source does not show a source body');
  await unavailableSourcePage.close();

  const ambiguousSnapshotPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  ambiguousSnapshotPage.on('pageerror', (error) => errors.push(error.message));
  await ambiguousSnapshotPage.goto(`${base}/__qa?source_snapshot_ambiguous=1`);
  await ambiguousSnapshotPage.getByRole('main').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
  await ambiguousSnapshotPage.locator('a[href="/asset-center/published-archives"]').last().click();
  await ambiguousSnapshotPage.getByRole('heading', { name: '发布归档' }).waitFor();
  await ambiguousSnapshotPage.getByRole('button', { name: /多平台早餐主题/ }).click();
  await ambiguousSnapshotPage.getByRole('button', { name: '稿件', exact: true }).click();
  const ambiguousSourcePanel = ambiguousSnapshotPage.getByTestId('archive-script-sources');
  const ambiguousSnapshotMessage = '归档中没有唯一匹配的来源正文快照；正文已隐藏。';
  await ambiguousSourcePanel.getByText(ambiguousSnapshotMessage, { exact: true }).waitFor();
  assert.equal(await ambiguousSourcePanel.getByText('发布剧本引用的 v1.0 创作历史正文。', { exact: true }).count(), 0, 'a duplicate v1.0 snapshot does not make the first body appear authoritative');
  assert.equal(await ambiguousSourcePanel.getByText('冲突的 v1.0 来源正文副本。', { exact: true }).count(), 0, 'ambiguous source copies remain hidden');
  assert.equal(await ambiguousSourcePanel.getByRole('link', { name: '查看发布剧本来源创作稿 v1.0', exact: true }).count(), 1, 'the independently validated same-topic source version link remains available');
  await ambiguousSnapshotPage.getByRole('button', { name: '发布信息', exact: true }).click();
  const ambiguousWeixinCard = ambiguousSnapshotPage.getByTestId('published-record-card-402');
  await ambiguousWeixinCard.getByText(ambiguousSnapshotMessage, { exact: true }).waitFor();
  assert.equal(await ambiguousWeixinCard.getByText('查看归档保存的来源正文', { exact: true }).count(), 0, 'a publication record hides its body when the matching version is ambiguous');
  assert.equal(await ambiguousWeixinCard.getByText('发布剧本引用的 v1.0 创作历史正文。', { exact: true }).count(), 0, 'a publication record does not silently select the first conflicting snapshot');
  assert.equal(productionMutationWrites, 0, 'checking ambiguous archived snapshots remains read-only');
  await ambiguousSnapshotPage.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobile.on('pageerror', (error) => errors.push(error.message));
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mobile.goto(`${base}/__qa`);
  await mobile.getByRole('main').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
  await mobile.locator('a[href="/asset-center/published-archives"]').last().click();
  await mobile.getByRole('heading', { name: '发布归档' }).waitFor();
  await mobile.getByRole('button', { name: /多平台早餐主题/ }).click();
  await mobile.getByText(/共 2 条发布记录/).waitFor();
  const mobileTopicLink = mobile.getByRole('link', { name: '查看归档来源选题', exact: true });
  assert.equal(await mobileTopicLink.getAttribute('href'), '/topics/71', 'mobile archives keep the source-topic relationship');
  await mobile.getByRole('button', { name: '稿件', exact: true }).click();
  const mobileSourceLink = mobile.getByTestId('archive-script-sources').getByRole('link', { name: '查看成片剧本来源创作稿 v2.0', exact: true });
  await mobileSourceLink.waitFor();
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the archive detail fits a 390px viewport without horizontal overflow');
  await mobile.setViewportSize({ width: 320, height: 740 });
  await mobileSourceLink.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const mobileSourceBounds = await mobileSourceLink.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight, hitTargetIsLink: hitTarget === element || element.contains(hitTarget) };
  });
  assert(mobileSourceBounds.x >= 0 && mobileSourceBounds.x + mobileSourceBounds.width <= mobileSourceBounds.viewportWidth
    && mobileSourceBounds.y >= 0 && mobileSourceBounds.y + mobileSourceBounds.height <= mobileSourceBounds.viewportHeight
    && mobileSourceBounds.hitTargetIsLink, `the archived source link remains visible and unobstructed at 320px: ${JSON.stringify(mobileSourceBounds)}`);
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the archive source detail fits a 320px viewport without horizontal overflow');
  await mobile.screenshot({ path: '/tmp/xmt-published-archives-source-lineage-320.png', fullPage: true });
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.getByRole('button', { name: '发布信息', exact: true }).click();
  await mobile.screenshot({ path: '/tmp/xmt-published-archives-390.png', fullPage: true });
  assert.deepEqual(errors, [], 'archive pages render without browser or console errors');
  assert.equal(failedArchiveListReads, 2, 'the fixture injects exactly two intentional archive-list failures');
  await mobile.close();

  const restrictedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  restrictedPage.on('pageerror', (error) => errors.push(error.message));
  await restrictedPage.goto(`${base}/__qa?source_permission=0`);
  await restrictedPage.getByRole('main').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
  await restrictedPage.locator('a[href="/asset-center/published-archives"]').last().click();
  await restrictedPage.getByRole('heading', { name: '发布归档' }).waitFor();
  await restrictedPage.getByRole('button', { name: /多平台早餐主题/ }).click();
  await restrictedPage.getByRole('button', { name: '稿件', exact: true }).click();
  const restrictedSourcePanel = restrictedPage.getByTestId('archive-script-sources');
  await restrictedSourcePanel.getByText('可查看归档快照；打开原稿需要创作稿查看权限', { exact: true }).waitFor();
  await restrictedSourcePanel.getByRole('status').getByText('来源选题与当前归档不同，正文未复制进归档；打开原稿仍需来源选题访问权限。', { exact: true }).waitFor();
  assert.equal(await restrictedSourcePanel.getByRole('link', { name: /查看成片剧本来源创作稿/ }).count(), 0, 'archives do not offer a route link when the viewer lacks production:view');
  assert.equal(await restrictedSourcePanel.getByRole('link', { name: /查看发布剧本来源创作稿/ }).count(), 0, 'a viewer without production:view cannot open the cross-topic source');
  await restrictedSourcePanel.getByText('查看归档保存的来源正文', { exact: true }).click();
  await restrictedSourcePanel.getByText('成片剧本引用的创作历史正文。', { exact: true }).waitFor();
  await restrictedPage.getByRole('button', { name: '发布信息', exact: true }).click();
  const restrictedWeixinCard = restrictedPage.getByTestId('published-record-card-402');
  const restrictedDouyinCard = restrictedPage.getByTestId('published-record-card-401');
  await restrictedDouyinCard.getByText('可查看归档快照；打开原稿需要创作稿查看权限', { exact: true }).waitFor();
  await restrictedWeixinCard.getByRole('status').getByText('来源选题与当前归档不同，正文未复制进归档；打开原稿仍需来源选题访问权限。', { exact: true }).waitFor();
  assert.equal(await restrictedWeixinCard.getByRole('link', { name: /查看发布记录 #402的来源创作稿/ }).count(), 0, 'a cross-topic per-record source is never linkable');
  assert.equal(await restrictedDouyinCard.getByRole('link', { name: /查看发布记录 #401的来源创作稿/ }).count(), 0, 'a viewer without production:view cannot open per-record source manuscripts');
  await restrictedPage.close();

  const sourceScopeDeniedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  sourceScopeDeniedPage.on('pageerror', (error) => errors.push(error.message));
  await sourceScopeDeniedPage.goto(`${base}/__qa?source_scope=denied`);
  await sourceScopeDeniedPage.getByRole('main').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
  await sourceScopeDeniedPage.locator('a[href="/asset-center/published-archives"]').last().click();
  await sourceScopeDeniedPage.getByRole('heading', { name: '发布归档' }).waitFor();
  await sourceScopeDeniedPage.getByRole('button', { name: /多平台早餐主题/ }).click();
  await sourceScopeDeniedPage.getByRole('button', { name: '稿件', exact: true }).click();
  const crossTopicSourceStatus = sourceScopeDeniedPage.getByRole('status').getByText('来源选题与当前归档不同，正文未复制进归档；打开原稿仍需来源选题访问权限。', { exact: true });
  await crossTopicSourceStatus.waitFor();
  const crossTopicSourceLink = sourceScopeDeniedPage.getByRole('link', { name: '查看发布剧本来源创作稿 v1.0', exact: true });
  await crossTopicSourceLink.waitFor();
  assert.equal(await sourceScopeDeniedPage.getByText('发布剧本引用的 v1.0 创作历史正文。', { exact: true }).count(), 0, 'the B archive does not embed the cross-topic A source text');
  const deniedSourceRead = sourceScopeDeniedPage.waitForResponse((response) => response.url().includes('/api/workflow/production/801/source-snapshot?version=v1.0'));
  await crossTopicSourceLink.click();
  const deniedBySourceTopic = await deniedSourceRead;
  assert.equal(deniedBySourceTopic.status(), 403, 'production:view without access to the stored source topic cannot read a cross-topic historical manuscript');
  assert.equal(deniedBySourceTopic.headers()['cache-control'], 'no-store', 'permission-denied source responses also disable caching');
  await sourceScopeDeniedPage.getByRole('heading', { name: '创作来源快照暂不可用', exact: true }).waitFor();
  await sourceScopeDeniedPage.getByText('无权查看该来源选题', { exact: true }).waitFor();
  assert.equal(await sourceScopeDeniedPage.getByText('准确的 v1.0 创作历史正文。', { exact: true }).count(), 0, 'the forbidden source page does not render a historical manuscript body');
  await sourceScopeDeniedPage.close();

  for (const theme of ['light', 'dark'] as const) {
    const themedPage = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    await themedPage.goto(`${base}/__qa?theme=${theme}`);
    await themedPage.getByRole('main').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
    await themedPage.locator('a[href="/asset-center/published-archives"]').last().click();
    await themedPage.getByRole('heading', { name: '发布归档' }).waitFor();
    const themedArchiveCard = themedPage.getByRole('button', { name: /多平台早餐主题/ });
    const themedArchiveTitle = themedArchiveCard.locator('h3');
    await themedArchiveCard.hover();
    const archiveTitleHoverContrast = await contrast(themedArchiveTitle);
    assert.ok(archiveTitleHoverContrast.ratio >= 4.5, `${theme}主题归档卡片悬停标题对比度为 ${archiveTitleHoverContrast.ratio.toFixed(2)}:1 on ${archiveTitleHoverContrast.backgroundColor}，应不低于 4.5:1`);
    const archiveTitleColors = await themedArchiveTitle.evaluate((element) => ({
      actual: getComputedStyle(element).color.replace(/\s/g, ''),
      expected: (() => {
        const probe = document.createElement('span');
        probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--xmt-cyan-contrast').trim();
        document.body.append(probe);
        const color = getComputedStyle(probe).color.replace(/\s/g, '');
        probe.remove();
        return color;
      })(),
    }));
    assert.equal(archiveTitleColors.actual, archiveTitleColors.expected, `${theme}主题归档标题悬停颜色应匹配当前主题的青色文字令牌`);
    await themedArchiveCard.click();
    await themedPage.getByRole('button', { name: '稿件', exact: true }).click();
    const sourceLink = themedPage.getByRole('link', { name: '查看成片剧本来源创作稿 v2.0', exact: true });
    const sourceTopicLink = themedPage.getByRole('link', { name: '查看归档来源选题', exact: true });
    const scriptTab = themedPage.getByRole('button', { name: '稿件', exact: true });
    for (const [label, locator] of [['来源创作稿链接', sourceLink], ['来源选题链接', sourceTopicLink], ['当前“稿件”页签', scriptTab]] as const) {
      const result = await contrast(locator);
      assert.ok(result.ratio >= 4.5, `${theme}主题 ${label} 对比度为 ${result.ratio.toFixed(2)}:1 on ${result.backgroundColor}，应不低于 4.5:1`);
    }
    await themedPage.getByRole('button', { name: '发布信息', exact: true }).click();
    const link = themedPage.getByRole('link', { name: '打开发布链接' }).first();
    const publishingTab = themedPage.getByRole('button', { name: '发布信息', exact: true });
    for (const [label, locator] of [['发布链接', link], ['当前“发布信息”页签', publishingTab]] as const) {
      const result = await contrast(locator);
      assert.ok(result.ratio >= 4.5, `${theme}主题 ${label} 对比度为 ${result.ratio.toFixed(2)}:1 on ${result.backgroundColor}，应不低于 4.5:1`);
    }
    await themedPage.close();
  }

  const adminPage = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  adminPage.on('pageerror', (error) => errors.push(error.message));
  adminPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('/api/resources/archives') && (message.text().includes('503 (Service Unavailable)') || message.text().includes('404 (Not Found)'))) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  await adminPage.goto(`${base}/__qa?admin=1`);
  await adminPage.getByRole('main').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
  await adminPage.locator('a[href="/asset-center/published-archives"]').last().click();
  await adminPage.getByRole('heading', { name: '发布归档' }).waitFor();
  await adminPage.getByRole('button', { name: /多平台早餐主题/ }).click();
  const deleteButton = adminPage.getByRole('button', { name: '删除', exact: true });
  await deleteButton.waitFor();
  await deleteButton.click();
  await adminPage.getByRole('heading', { name: '确认删除' }).waitFor();
  const physicalDeleteViewport = { width: 1024, height: 600 };
  const deleteZoom = 1.25;
  const deleteCssViewport = {
    width: Math.round(physicalDeleteViewport.width / deleteZoom),
    height: Math.round(physicalDeleteViewport.height / deleteZoom),
  };
  await adminPage.setViewportSize(deleteCssViewport);
  const deleteViewportMetrics = await adminPage.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(deleteViewportMetrics.width, deleteCssViewport.width, 'delete confirmation uses the CSS viewport width for a 1024×600 physical window at 125% zoom');
  assert.equal(deleteViewportMetrics.height, deleteCssViewport.height, 'delete confirmation uses the CSS viewport height for a 1024×600 physical window at 125% zoom');
  assert.ok(deleteViewportMetrics.documentWidth <= deleteViewportMetrics.width + 1, `delete confirmation has no horizontal overflow at 1024×600 physical size / 125% zoom: ${JSON.stringify(deleteViewportMetrics)}`);
  for (const name of ['取消', '确认删除']) {
    const button = adminPage.getByRole('button', { name, exact: true });
    const bounds = await button.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= deleteCssViewport.width && bounds.y + bounds.height <= deleteCssViewport.height, `archive delete confirmation ${name} remains within the ${deleteCssViewport.width}×${deleteCssViewport.height} CSS viewport for a 1024×600 physical window at 125% zoom: ${JSON.stringify(bounds)}`);
  }
  await adminPage.getByRole('button', { name: '取消', exact: true }).click();
  await adminPage.getByRole('button', { name: '删除', exact: true }).click();
  await adminPage.getByRole('heading', { name: '确认删除' }).waitFor();
  const archiveReadsBeforeDelete = archiveListReads;
  const archiveDetailReadsBeforeDelete = archiveDetailReads;
  await adminPage.getByRole('button', { name: '取消', exact: true }).click();
  await adminPage.getByRole('button', { name: '返回发布归档', exact: true }).click();
  await adminPage.getByRole('button', { name: /旧版单平台归档/ }).click();
  await adminPage.getByRole('button', { name: '删除', exact: true }).click();
  await adminPage.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    (window as Window & { __qaOriginalStorageSetItem?: typeof Storage.prototype.setItem }).__qaOriginalStorageSetItem = originalSetItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key.includes('published-archive-delete-pending')) throw new DOMException('quota exceeded', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };
  });
  await adminPage.getByRole('button', { name: '确认删除', exact: true }).click();
  await adminPage.getByText(/归档删除恢复信息未能可靠保存/).waitFor();
  assert.equal(archiveDeleteWrites, 0, 'a local recovery-storage failure prevents the DELETE request');
  await adminPage.evaluate(() => {
    const windowWithOriginal = window as Window & { __qaOriginalStorageSetItem?: typeof Storage.prototype.setItem };
    if (windowWithOriginal.__qaOriginalStorageSetItem) Storage.prototype.setItem = windowWithOriginal.__qaOriginalStorageSetItem;
    delete windowWithOriginal.__qaOriginalStorageSetItem;
  });
  await adminPage.getByRole('button', { name: '确认删除', exact: true }).click();
  await adminPage.getByRole('heading', { name: '发布归档', exact: true }).waitFor();
  await adminPage.getByRole('alert').getByText(/服务器确认该归档当前不存在/).waitFor();
  assert.equal(await adminPage.getByRole('button', { name: /旧版单平台归档/ }).count(), 0, 'a response-lost deletion is reconciled from a read-only 404');
  assert.equal(archiveDeleteWrites, 1, 'a response-lost delete is sent once and never automatically replayed');
  assert.equal(archiveItems.length, 1, 'the fixture committed the first archive deletion before returning an error');
  assert.equal(archiveListReads, archiveReadsBeforeDelete, 'read-only archive reconciliation does not reload the archive list');
  assert.equal(archiveDetailReads, archiveDetailReadsBeforeDelete + 2, 'the response-lost case performs one opening GET and one read-only reconciliation');

  const remainingArchive = adminPage.getByRole('button', { name: /多平台早餐主题/ });
  await remainingArchive.click();
  await adminPage.getByRole('button', { name: '删除', exact: true }).click();
  await adminPage.getByRole('button', { name: '确认删除', exact: true }).click();
  await adminPage.getByRole('alert').getByText(/暂时无法确认上次删除结果/).waitFor();
  assert.equal(archiveDeleteWrites, 2, 'a failed delete with a still-present record performs no automatic second write');
  assert.equal(await adminPage.getByRole('button', { name: '确认删除', exact: true }).count(), 0, 'the modal closes while the uncertain state awaits an explicit decision');
  assert.equal(archiveDetailReads, archiveDetailReadsBeforeDelete + 4, 'a failed read-back does not start another write');
  await adminPage.getByRole('button', { name: '只读核实归档状态', exact: true }).click();
  await adminPage.getByRole('alert').getByText(/服务器确认这条归档当前仍存在/).waitFor();
  assert.equal(archiveDeleteWrites, 2, 'manual read-only verification never resends the delete');
  assert.equal(archiveDetailReads, archiveDetailReadsBeforeDelete + 5, 'the recovery control performs exactly one detail GET');
  await adminPage.getByRole('button', { name: '删除', exact: true }).click();
  await adminPage.getByRole('button', { name: '确认删除', exact: true }).click();
  await adminPage.getByRole('heading', { name: '发布归档', exact: true }).waitFor();
  assert.equal(await adminPage.getByRole('button', { name: /多平台早餐主题/ }).count(), 0, 'a second deletion only follows a fresh explicit confirmation');
  assert.equal(archiveItems.length, 0, 'the isolated server fixture confirms both confirmed deletions');
  assert.equal(archiveDeleteWrites, 3, 'only the two explicit attempts and one response-lost attempt are sent');
  assert.equal(archiveListReads, archiveReadsBeforeDelete, 'archive deletion and read-back reconcile local state without an extra list read');
  assert.equal(expectedHttpErrors.length, 6, 'the browser logs only the expected list, deletion and read-back HTTP failures');
  assert.deepEqual(errors, [], 'archive pages render without browser or console errors');
  await adminPage.close();
  console.log('Published archive browser test passed: source-topic and exact script lineage, archived snapshots, permission boundaries, light/dark contrast, 320/390px mobile, desktop zoom, and legacy data.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
