import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Locator } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const admin = { id: 91, username: 'publishing-assets-qa', role: 'admin', name: '多平台数据验收', enabled: true, force_change_password: false };
const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(admin))});localStorage.setItem('xmt_token','publishing-assets-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/asset-center/content-topics');</script>`));
app.get('/api/auth/me', (_req, res) => res.json(admin));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
const topicAssets = [{
    id: 41,
    title: '多平台早餐主题',
    status: 'completed',
    platform: 'douyin',
    created_at: '2026-09-28 09:00:00',
    updated_at: '2026-09-29 12:00:00',
    production_count: 1,
    latest_production_id: 42,
    latest_production_version: 'v2',
    latest_production_updated_at: '2026-09-28 12:00:00',
    shooting_count: 1,
    publishing_count: 3,
    resource_count: 2,
    dimensions: [{ id: 601, type: 'city', value: '杭州' }],
    can_manage_dimensions: false,
    latest_analytics: {
      publishing_id: 501,
      platform: 'weixin',
      data_date: '2026-09-29 10:00:00',
      views: 450,
      likes: 23,
      shares: 4,
      comments: 7,
      sources: { views: 'manual', likes: 'manual', shares: 'manual', comments: 'manual' },
    },
  }, {
    id: 43,
    title: '夜市街巷主题',
    status: 'production',
    platform: 'weixin',
    created_at: '2026-09-27 09:00:00',
    updated_at: '2026-09-30 12:00:00',
    production_count: 0,
    latest_production_id: null,
    latest_production_version: null,
    latest_production_updated_at: null,
    shooting_count: 0,
    publishing_count: 0,
    resource_count: 1,
    dimensions: [{ id: 602, type: 'city', value: '绍兴' }],
    can_manage_dimensions: false,
    latest_analytics: null,
  }];
app.get('/api/resource-center/content-topics', (req, res) => {
  const keyword = String(req.query.keyword || '').trim().toLocaleLowerCase('zh-CN');
  const dimensionType = String(req.query.dimension_type || '');
  const dimensionValue = String(req.query.dimension_value || '');
  const filtered = topicAssets.filter((item) => (!keyword || item.title.toLocaleLowerCase('zh-CN').includes(keyword))
    && (!dimensionType || item.dimensions.some((dimension) => dimension.type === dimensionType && (!dimensionValue || dimension.value === dimensionValue))));
  const dimensions = topicAssets.flatMap((item) => item.dimensions);
  res.json({
    data: filtered,
    pagination: { page: Number(req.query.page) || 1, page_size: 12, total: filtered.length, total_pages: 1 },
    analytics_visible: true,
    available_dimensions: dimensions.map(({ type, value }) => ({ dimension_type: type, value })),
    dimension_summaries: dimensions.map((dimension) => ({
      dimension_type: dimension.type,
      value: dimension.value,
      topic_count: 1,
      production_count: 1,
      resource_count: 1,
      shooting_count: 1,
      publishing_count: 1,
    })),
  });
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

if (process.env.XMT_PUBLISHING_ASSETS_QA_SERVE === '1') {
  console.log(`Isolated publishing assets QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });

function channelLuminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

async function textContrast(locator: Locator) {
  const { foreground, background } = await locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    const root = getComputedStyle(document.documentElement).getPropertyValue('--xmt-app-bg').match(/[\d.]+/g)?.map(Number) || [];
    let background = root.length >= 3 ? root.slice(0, 3) : [255, 255, 255];
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    for (const ancestor of ancestors.reverse()) {
      const layer = getComputedStyle(ancestor).backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
      if (layer.length < 3) continue;
      const alpha = layer.length >= 4 ? layer[3] : 1;
      if (alpha <= 0) continue;
      background = layer.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
    }
    return { foreground, background };
  });
  if (foreground.length !== 3 || background.length !== 3) return 0;
  const weights = [0.2126, 0.7152, 0.0722];
  const textLuminance = foreground.reduce((sum, channel, index) => sum + weights[index] * channelLuminance(channel), 0);
  const backgroundLuminance = background.reduce((sum, channel, index) => sum + weights[index] * channelLuminance(channel), 0);
  return (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05);
}

async function assertTopicAssetTextContrast(page: import('playwright').Page, label: string) {
  const checks: Array<[string, Locator]> = [
    ['标题', page.getByRole('heading', { name: '主题内容资产' })],
    ['更新时间', page.getByText(/抖音 · 更新于/).first()],
    ['状态', page.getByText('已完成', { exact: true }).first()],
    ['指标标签', page.getByText('创作稿件', { exact: true }).first()],
    ['数据来源', page.getByText(/来源：播放/).first()],
  ];
  for (const [name, locator] of checks) {
    const ratio = await textContrast(locator);
    assert(ratio >= 4.5, `${label} ${name}对比度为 ${ratio.toFixed(2)}:1，应不低于 4.5:1`);
  }
}

try {
  const errors: string[] = [];
  const openPage = async (width: number, height: number, theme: 'light' | 'dark') => {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      const text = message.text();
      const expectedReducedMotionNotice = message.type() === 'warning' && text.startsWith('You have Reduced Motion enabled on your device.');
      if ((message.type() === 'error' || message.type() === 'warning') && !expectedReducedMotionNotice) errors.push(`${message.type()}: ${text}`);
    });
    await page.addInitScript((preference) => localStorage.setItem('xmt_theme', preference), theme);
    await page.goto(`${base}/__qa`);
    await page.getByRole('heading', { name: '主题内容资产' }).waitFor();
    assert.equal(await page.locator('vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count(), 0, 'topic assets has no framework error overlay');
    return page;
  };

  const desktop = await openPage(1440, 960, 'dark');
  const latestPublication = desktop.getByRole('link', { name: /最近发布 · 微信视频号 · 记录 #501/ });
  await latestPublication.waitFor();
  assert.equal(await latestPublication.getAttribute('href'), '/publishing/501', 'the asset links to the exact publication that owns its metrics');
  assert.equal(await desktop.getByText('发布记录', { exact: true }).count(), 2, 'both topic cards expose their publication count label');
  assert.equal(await desktop.locator('html').evaluate((element) => element.classList.contains('dark')), true, 'desktop renders in dark theme');
  const breakfastSearch = desktop.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/resource-center/content-topics' && url.searchParams.get('keyword') === '早餐';
  });
  await desktop.getByPlaceholder('搜索主题名称').fill('早餐');
  await breakfastSearch;
  await desktop.getByRole('link', { name: '多平台早餐主题' }).waitFor();
  assert.equal(await desktop.getByRole('link', { name: '夜市街巷主题' }).count(), 0, 'search removes topics outside the requested name');
  const clearSearch = desktop.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/resource-center/content-topics' && !url.searchParams.has('keyword');
  });
  await desktop.getByPlaceholder('搜索主题名称').fill('');
  await clearSearch;
  await desktop.getByRole('link', { name: '夜市街巷主题' }).waitFor();
  const cityFilter = desktop.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/resource-center/content-topics' && url.searchParams.get('dimension_type') === 'city' && url.searchParams.get('dimension_value') === '杭州';
  });
  await desktop.getByLabel('按内容维度筛选').selectOption('city');
  await desktop.getByLabel('按维度名称筛选').selectOption('杭州');
  await cityFilter;
  await desktop.getByRole('link', { name: '多平台早餐主题' }).waitFor();
  assert.equal(await desktop.getByRole('link', { name: '夜市街巷主题' }).count(), 0, 'city filter leaves only topics with the selected asset dimension');
  await assertTopicAssetTextContrast(desktop, '1440px 深色');
  await desktop.screenshot({ path: '/tmp/xmt-publishing-assets-1440.png', fullPage: true });
  await desktop.close();

  const mobile = await openPage(390, 844, 'light');
  await mobile.getByRole('link', { name: /最近发布 · 微信视频号 · 记录 #501/ }).waitFor();
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the latest publication label fits a narrow viewport');
  assert.equal(await mobile.locator('html').evaluate((element) => element.classList.contains('light')), true, 'mobile renders in light theme');
  await assertTopicAssetTextContrast(mobile, '390px 浅色');
  await mobile.screenshot({ path: '/tmp/xmt-publishing-assets-390-light.png', fullPage: true });
  await mobile.close();

  const narrow = await openPage(320, 844, 'dark');
  await narrow.getByRole('link', { name: '多平台早餐主题' }).waitFor();
  assert(await narrow.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'the content assets page does not overflow at 320px');
  assert.equal(await narrow.locator('html').evaluate((element) => element.classList.contains('dark')), true, '320px renders in dark theme');
  await assertTopicAssetTextContrast(narrow, '320px 深色');
  await narrow.screenshot({ path: '/tmp/xmt-publishing-assets-320-dark.png', fullPage: true });
  await narrow.close();

  assert.deepEqual(errors, [], 'the desktop and mobile asset pages render without browser errors');
  console.log('Publishing asset browser test passed: publication-level identity, search and dimension filters, light/dark themes, 320/390/1440px layout, no browser errors or warnings.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
