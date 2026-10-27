import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';

const app = express();
const user = { id: 1, username: 'browser-admin', role: 'admin', name: '浏览器管理员', enabled: true, force_change_password: false };
let failNextWorksGet = false;
let worksGetCount = 0;
let failNextReviewGet = false;
let reviewGetCount = 0;

app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/permissions/my', (_request, response) => response.json(['creator:data:view']));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get('/api/system-settings', (_request, response) => response.json({}));
app.get('/api/system-settings/public', (_request, response) => response.json({}));
app.get('/api/creator-agent/status', (_request, response) => response.json({ agents: [], protocol_version: 1 }));
app.get('/api/creator-agent/douyin/dashboard', (_request, response) => response.json({
  account: { account_id: 'browser-account', douyin_uid: 'browser-account', nickname: '样例账号', account_name: '样例账号' },
  metrics: { fans_count: 1200, works_count: 1, play_count: 1000, interaction_count: 115, interaction_rate: 0.115, share_rate: 0.005, viral_works_count: 0 },
  health: { score: 82, level: 'healthy', available_weight: 1, dimensions: { data_freshness: { score: 80, weight: 0.25, days_since_sync: 0 }, content_activity: { score: 80, weight: 0.25, works_published_30d: 1 }, engagement_quality: { score: 80, weight: 0.25, interaction_rate: 0.115 }, fan_growth: { score: 80, weight: 0.25, growth_rate: 0.01, status: 'ready', reason: null } }, data_notes: [] },
  growth_7d: { fans: 1, plays: 300, interactions: 30, collected_at: '2026-09-16T08:00:00.000Z', observed_through_date: '2026-09-16' },
  growth_30d: { fans: 10, plays: 1000, interactions: 115 },
  top_works: [work(11, '测试作品一')], snapshot_count: 1, snapshot_start_date: '2026-09-16', data_status: 'partial', data_source: 'douyin_official_export', official_snapshot_at: '2026-09-16T08:00:00.000Z', last_success_at: '2026-09-16T08:00:00.000Z', missing_fields: [], warnings: [], access_level: 'manage', metric_sources: {}, formulas: {},
}));
app.get('/api/creator-agent/douyin/sync-logs', (_request, response) => response.json([]));
app.get('/__qa', (_request, response) => response.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','browser-token');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen','8.5.9');location.replace('/analytics/creator-center/works');</script>`));
app.use('/socket.io', (request, response) => request.method === 'GET'
  ? response.type('text/plain').send('0{"sid":"browser-socket","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}')
  : response.type('text/plain').send('ok'));
app.get('/api/creator-agent/douyin/works', (request, response) => {
  worksGetCount += 1;
  if (failNextWorksGet) {
    failNextWorksGet = false;
    return response.status(503).json({ message: '抖音作品库加载失败' });
  }
  const cursor = String(request.query.cursor || '');
  return response.json(cursor ? {
    items: [work(12, '测试作品二')], next_cursor: null, has_more: false, page_size: 20,
  } : {
    items: [work(11, '测试作品一')], next_cursor: 'cursor-two', has_more: true, page_size: 20,
  });
});
app.get('/api/creator-agent/douyin/works/:id/review', (_request, response) => {
  reviewGetCount += 1;
  if (failNextReviewGet) {
    failNextReviewGet = false;
    return response.status(503).json({ message: '作品复盘加载失败' });
  }
  const item = work(11, '测试作品一');
  return response.json({
    work: item,
    snapshots: [{ snapshot_time: '2026-09-16T08:00:00.000Z', play_count: 1000, like_count: 100, comment_count: 10, share_count: 5, collect_count: 2, completion_rate: 0.6, interaction_rate: 0.115 }],
    analysis: null,
    performance: item.performance,
    baselines: {}, formulas: {}, metric_sources: [],
  });
});
app.post('/__test__/fail-next-works-get', (_request, response) => {
  failNextWorksGet = true;
  response.sendStatus(204);
});
app.get('/__test__/works-get-count', (_request, response) => response.json({ worksGetCount }));
app.post('/__test__/fail-next-review-get', (_request, response) => {
  failNextReviewGet = true;
  response.sendStatus(204);
});
app.get('/__test__/review-get-count', (_request, response) => response.json({ reviewGetCount }));

function work(id: number, title: string) {
  return {
    id, account_id: 1, aweme_id: `browser-${id}`, title, cover_url: '', managed_cover_available: false,
    publish_time: '2026-09-16T08:00:00.000Z', play_count: 1000, like_count: 100, comment_count: 10,
    share_count: 5, collect_count: 2, duration: 30, completion_rate: .6, interaction_rate: .115,
    share_rate: .005, content_category: '知识',
    performance: {
      score: 85, level: 'excellent', is_viral: false, interaction_count: 115, interaction_rate: .115,
      share_rate: .005, completion_rate: .6, completion_rate_available: true,
      score_components: { play: 20, interaction: 25, share: 10, completion: 30 }, viral_reasons: [],
    },
  };
}

function parseCssColor(value: string) {
  const channels = value.match(/[0-9.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 } : null;
}

function luminance(rgb: number[]) {
  const linear = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function contrastRatio(element: import('playwright').Locator) {
  const styles = await element.evaluate(node => {
    const ancestors: Element[] = [];
    for (let current: Element | null = node; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    return {
      foreground: getComputedStyle(node).color,
      backgrounds: [getComputedStyle(document.documentElement).backgroundColor, ...ancestors.map(ancestor => getComputedStyle(ancestor).backgroundColor)],
    };
  });
  const foreground = parseCssColor(styles.foreground)?.rgb;
  if (!foreground) return 0;
  let background = [255, 255, 255];
  for (const value of styles.backgrounds) {
    const layer = parseCssColor(value);
    if (layer) background = layer.rgb.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
  }
  const text = luminance(foreground);
  const surface = luminance(background);
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}

async function assertCreatorPageCopyContrast(page: Page, theme: 'light' | 'dark', screen: string) {
  const candidates = page.locator('main [class~="text-studio-text-muted"], main [class~="text-studio-text-secondary"]');
  let checked = 0;
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    const text = (await candidate.textContent() || '').trim();
    if (!text || !(await candidate.isVisible())) continue;
    const ratio = await contrastRatio(candidate);
    assert.ok(ratio >= 4.5, `${screen} ${theme}主题文案“${text.slice(0, 40)}”对比度为 ${ratio.toFixed(2)}:1，应不低于 4.5:1`);
    checked += 1;
  }
  assert.ok(checked >= 6, `${screen} ${theme}主题应检查至少 6 项普通说明，实际检查 ${checked} 项`);
}

async function assertWorkScoreContrast(page: Page, theme: 'light' | 'dark', screen: string) {
  const score = page.getByRole('button', { name: /测试作品一/ }).getByText('85', { exact: true });
  const ratio = await contrastRatio(score);
  assert.ok(ratio >= 4.5, `${screen} ${theme}主题作品评分对比度为 ${ratio.toFixed(2)}:1，应不低于 4.5:1`);
}

async function assertSequentialHeadingLevels(page: Page, screen: string) {
  const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll(elements => elements
    .filter(element => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getAttribute('aria-hidden') !== 'true';
    })
    .map(element => Number(element.tagName.slice(1))));
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(levels[index] <= levels[index - 1] + 1, `${screen}标题层级从 h${levels[index - 1]} 跳到了 h${levels[index]}`);
  }
}

const server = http.createServer(app);
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address !== 'string');
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
if (process.env.XMT_CREATOR_WORKS_QA_SERVE === '1') {
  console.log(`Isolated Creator Works QA fixture: http://127.0.0.1:${address.port}/__qa`);
  await new Promise<void>(() => {});
}
const browser = await chromium.launch({ headless: true });

try {
  failNextWorksGet = true;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ user }) => {
    localStorage.setItem('xmt_user', JSON.stringify(user));
    localStorage.setItem('xmt_token', 'browser-token');
    localStorage.setItem('xmt_theme', 'dark');
    localStorage.setItem('xmt_last_version_seen', '3.0.0');
  }, { user });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/analytics/creator-center/works`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '作品库' }).waitFor();
  await page.getByRole('combobox', { name: '作品排序' }).waitFor();
  await page.getByRole('alert').waitFor();
  await page.getByText('作品数据暂不可用').waitFor();
  assert.equal(await page.getByText('没有识别到合法抖音作品', { exact: true }).count(), 0, '首次 GET 失败不能误示作品库为空');
  assert.match(await page.getByRole('alert').innerText(), /作品列表暂时无法读取.*抖音作品库加载失败/);
  await page.getByRole('button', { name: '重试加载作品' }).click();
  await page.getByRole('button', { name: /测试作品一/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /测试作品一/ }).count(), 1, '窄屏应以可直读的作品卡片呈现，而非要求横向滚动整张桌面表格');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, '窄屏作品库页面不应横向溢出');
  await assertCreatorPageCopyContrast(page, 'dark', '390px作品库');
  await assertWorkScoreContrast(page, 'dark', '390px作品库');

  await page.evaluate(async () => { await fetch('/__test__/fail-next-works-get', { method: 'POST' }); });
  await page.getByRole('button', { name: '重新读取' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('button', { name: /测试作品一/ }).count(), 1, '刷新失败时保留已确认的作品卡片');
  assert.match(await page.getByRole('alert').innerText(), /仍保留已确认的 1 条作品.*抖音作品库加载失败/);
  await page.getByRole('button', { name: '重试加载作品' }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: /测试作品一/ }).waitFor();

  await page.evaluate(async () => { await fetch('/__test__/fail-next-works-get', { method: 'POST' }); });
  await page.getByRole('button', { name: '下一页' }).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /下一页作品暂时无法读取，已保留已加载的 1 条作品/);
  assert.equal(await page.getByRole('button', { name: /测试作品一/ }).count(), 1, '下一页失败时保留已加载内容');
  await page.getByRole('button', { name: '重试加载下一页' }).click();
  await page.getByRole('button', { name: /测试作品二/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /测试作品一/ }).count(), 1, '下一页恢复后保留上一页内容');
  assert.equal(await page.evaluate(async () => (await fetch('/__test__/works-get-count')).json().then(value => value.worksGetCount)), 6, '初次读取、列表重试与下一页恢复均只发送预期 GET');
  await page.evaluate(async () => { await fetch('/__test__/fail-next-review-get', { method: 'POST' }); });
  await page.getByRole('button', { name: /测试作品一/ }).click();
  await page.getByRole('heading', { name: '作品复盘暂不可用' }).waitFor();
  assert.match(await page.getByRole('alert').innerText(), /作品复盘加载失败.*不会修改作品或复盘数据/);
  const failedDetailReturn = page.getByRole('button', { name: '返回作品库', exact: true });
  const failedDetailReturnRect = await failedDetailReturn.boundingBox();
  assert.ok(failedDetailReturnRect && failedDetailReturnRect.width >= 40 && failedDetailReturnRect.height >= 40, '390px 错误详情返回作品库入口至少为 40×40px');
  const failedMobileNavigation = await page.getByRole('navigation', { name: '移动主导航' }).boundingBox();
  assert.ok(failedMobileNavigation && failedDetailReturnRect && failedDetailReturnRect.y + failedDetailReturnRect.height <= failedMobileNavigation.y, '错误详情返回入口不被移动底栏遮挡');
  await page.getByRole('button', { name: '重试读取' }).click();
  await page.getByRole('heading', { name: '测试作品一', exact: true }).waitFor();
  await assertCreatorPageCopyContrast(page, 'dark', '390px作品详情');
  assert.equal(await page.evaluate(async () => (await fetch('/__test__/review-get-count')).json().then(value => value.reviewGetCount)), 2, '详情重试仅重新读取一次作品复盘');
  await page.getByRole('button', { name: '返回作品库' }).click();
  await page.getByRole('heading', { name: '作品库' }).waitFor();
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await desktopContext.addInitScript(({ user }) => {
    localStorage.setItem('xmt_user', JSON.stringify(user));
    localStorage.setItem('xmt_token', 'browser-token');
    localStorage.setItem('xmt_theme', 'light');
    localStorage.setItem('xmt_last_version_seen', '8.5.10');
  }, { user });
  const desktopPage = await desktopContext.newPage();
  const desktopErrors: string[] = [];
  desktopPage.on('console', message => { if (message.type() === 'error') desktopErrors.push(message.text()); });
  desktopPage.on('pageerror', error => desktopErrors.push(error.message));
  await desktopPage.goto(`http://127.0.0.1:${address.port}/__qa`, { waitUntil: 'domcontentloaded' });
  await desktopPage.getByRole('heading', { name: '作品库' }).waitFor();
  await assertCreatorPageCopyContrast(desktopPage, 'light', '1440px作品库');
  await assertWorkScoreContrast(desktopPage, 'light', '1440px作品库');
  const desktopWorkLink = desktopPage.getByRole('link', { name: '打开作品 测试作品一', exact: true });
  await desktopWorkLink.waitFor();
  await desktopWorkLink.focus();
  assert.equal(await desktopWorkLink.evaluate(element => document.activeElement === element), true, 'desktop work title is a keyboard-focusable detail link');
  await desktopPage.screenshot({ path: '/tmp/xmt-creator-works-desktop-link.png', fullPage: false });
  await desktopPage.keyboard.press('Enter');
  await desktopPage.waitForURL('**/analytics/creator-center/work/11');
  await desktopPage.getByRole('heading', { name: '测试作品一', exact: true }).waitFor();
  await assertCreatorPageCopyContrast(desktopPage, 'light', '1440px作品详情');
  await desktopPage.screenshot({ path: '/tmp/xmt-creator-works-desktop-keyboard.png', fullPage: false });
  assert.deepEqual(desktopErrors, [], 'desktop work navigation should render without browser errors');
  await desktopContext.close();
  const narrowContext = await browser.newContext({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
  await narrowContext.addInitScript(({ user }) => {
    localStorage.setItem('xmt_user', JSON.stringify(user));
    localStorage.setItem('xmt_token', 'browser-token');
    localStorage.setItem('xmt_theme', 'dark');
    localStorage.setItem('xmt_last_version_seen', '9.2.50');
  }, { user });
  const narrowPage = await narrowContext.newPage();
  const narrowErrors: string[] = [];
  narrowPage.on('console', message => { if (message.type() === 'error') narrowErrors.push(message.text()); });
  narrowPage.on('pageerror', error => narrowErrors.push(error.message));
  await narrowPage.goto(`http://127.0.0.1:${address.port}/analytics/creator-center/works`, { waitUntil: 'domcontentloaded' });
  await narrowPage.getByRole('heading', { name: '作品库' }).waitFor();
  await narrowPage.getByRole('button', { name: /测试作品一/ }).waitFor();
  await assertCreatorPageCopyContrast(narrowPage, 'dark', '320px作品库');
  await assertWorkScoreContrast(narrowPage, 'dark', '320px作品库');
  assert.ok(await narrowPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '320px 作品库无横向溢出');
  await narrowPage.getByRole('button', { name: /测试作品一/ }).click();
  await narrowPage.getByRole('heading', { name: '测试作品一', exact: true }).waitFor();
  await assertCreatorPageCopyContrast(narrowPage, 'dark', '320px作品详情');
  assert.ok(await narrowPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '320px 作品详情无横向溢出');
  const narrowReturnButton = narrowPage.getByRole('button', { name: '返回作品库', exact: true });
  const narrowReturnRect = await narrowReturnButton.boundingBox();
  assert.ok(narrowReturnRect && narrowReturnRect.width >= 40 && narrowReturnRect.height >= 40, '320px 详情页返回作品库入口至少为 40×40px');
  const mobileNavigation = await narrowPage.getByRole('navigation', { name: '移动主导航' }).boundingBox();
  assert.ok(mobileNavigation && narrowReturnRect && narrowReturnRect.y + narrowReturnRect.height <= mobileNavigation.y, '返回作品库入口不被移动底栏遮挡');
  await narrowReturnButton.click();
  await narrowPage.getByRole('heading', { name: '作品库' }).waitFor();
  await narrowPage.goto(`http://127.0.0.1:${address.port}/analytics/creator-center`, { waitUntil: 'domcontentloaded' });
  await narrowPage.getByRole('heading', { name: '抖音数据驾驶舱' }).waitFor();
  await assertCreatorPageCopyContrast(narrowPage, 'dark', '320px运营概览');
  await assertSequentialHeadingLevels(narrowPage, '320px运营概览');
  await narrowPage.getByRole('button', { name: '查看作品', exact: true }).waitFor();
  assert.ok(await narrowPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '320px 运营概览无横向溢出');
  assert.deepEqual(narrowErrors, []);
  await narrowContext.close();
  assert.equal(errors.length, 4, '控制台仅记录四次测试主动注入的 HTTP 503');
  assert.ok(errors.every(error => error.includes('503 (Service Unavailable)')));
  await context.close();
  console.log('Creator works read recovery browser tests passed.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
