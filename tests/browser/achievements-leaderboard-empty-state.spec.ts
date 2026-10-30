import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 96, username: 'achievement-empty-qa', role: 'member', name: '隔离成就验收', enabled: true, force_change_password: false };
const manager = { id: 97, username: 'achievement-manager-qa', role: 'admin', name: '成就管理验收', enabled: true, force_change_password: false };
let activeUser = user;
let activePermissions: string[] = [];
const app = express();
let apiWrites = 0;
let seedScenario = 'none';
let seedPostRequests = 0;
let seedListReads = 0;
let seedDefinitions: Array<Record<string, unknown>> = [];
const seededAchievement = {
  id: 501,
  name: '预设成就',
  description: '隔离预设成就内容',
  icon: '🏆',
  condition_type: 'topic_count',
  condition_value: 1,
  points: 10,
  category: 'production',
  rarity: 'common',
  sort_order: 1,
};

app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  const canManage = req.query.manage === '1';
  activeUser = canManage ? manager : user;
  activePermissions = canManage ? ['system:achievement'] : [];
  seedScenario = String(req.query.seedScenario || 'none');
  seedPostRequests = 0;
  seedListReads = 0;
  seedDefinitions = [];
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(activeUser))});localStorage.setItem('xmt_token','achievement-empty-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/achievements');</script>`);
});
app.get('/__qa/seed-state', (_req, res) => res.json({ seedPostRequests, seedListReads, definitionCount: seedDefinitions.length }));
app.get('/api/auth/me', (_req, res) => res.json(activeUser));
app.get('/api/permissions/my', (_req, res) => res.json(activePermissions));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/achievements', (_req, res) => {
  seedListReads += 1;
  if (seedScenario === 'readback-fails' && seedListReads === 2) {
    return res.status(503).json({ message: '隔离核实读取失败' });
  }
  return res.json({ data: seedDefinitions });
});
app.get('/api/achievements/me', (_req, res) => res.json({ data: [] }));
app.get('/api/achievements/progress', (_req, res) => res.json({ data: {} }));
app.get('/api/achievements/stats', (_req, res) => res.json({ data: { totalPoints: 0 } }));
app.get('/api/achievements/leaderboard', (_req, res) => res.json({ data: [] }));
app.get('/api/achievements/recent', (_req, res) => res.json({ data: [] }));
app.post('/api/achievements/seed', (_req, res) => {
  apiWrites += 1;
  seedPostRequests += 1;
  if (seedScenario === 'definitive-reject') {
    return res.status(403).json({ message: '没有初始化权限' });
  }
  if (seedPostRequests === 1 && ['commit-lost', 'not-submitted', 'readback-fails'].includes(seedScenario)) {
    if (seedScenario === 'commit-lost') seedDefinitions = [seededAchievement];
    return res.status(503).json({ message: '隔离写入响应不明' });
  }
  if (seedDefinitions.length === 0) seedDefinitions = [seededAchievement];
  return res.json({ message: '预设成就初始化完成' });
});
app.use('/api', (req, res) => {
  if (req.method !== 'GET') apiWrites += 1;
  return res.json({ data: [], total: 0, page: 1, limit: 20 });
});

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
if (process.env.XMT_ACHIEVEMENTS_QA_SERVE === '1') {
  console.log(`Isolated achievements QA fixture: ${base}/__qa?theme=dark`);
  await new Promise<void>(() => {});
}
const browser = await chromium.launch({ headless: true });

function relativeLuminance(channels: number[]) {
  const linear = channels.slice(0, 3).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function composedTextContrastRatio(locator: import('playwright').Locator) {
  const colors = await locator.evaluate((element) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      backgrounds.push(getComputedStyle(current).backgroundColor);
    }
    return { foreground: getComputedStyle(element).color, backgrounds };
  });
  const readColor = (value: string) => {
    const channels = value.match(/[\d.]+/g)?.map(Number) || [];
    return channels.length >= 3 ? [channels[0], channels[1], channels[2], channels[3] ?? 1] : null;
  };
  const foreground = readColor(colors.foreground);
  if (!foreground) return 0;
  const background = [255, 255, 255];
  for (const value of colors.backgrounds.reverse()) {
    const layer = readColor(value);
    if (!layer) continue;
    for (let index = 0; index < 3; index += 1) background[index] = layer[index] * layer[3] + background[index] * (1 - layer[3]);
  }
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

async function assertTextContrast(locator: import('playwright').Locator, label: string) {
  const ratio = await composedTextContrastRatio(locator);
  assert(ratio >= 4.5, `${label} contrast=${ratio.toFixed(2)} expected>=4.5`);
}

const achievementViewModes = [
  { name: '卡片视图', heading: '成就列表' },
  { name: '排行榜', heading: '积分排行榜' },
  { name: '动态', heading: '最近获得的成就' },
] as const;

async function assertAchievementView(page: import('playwright').Page, selectedView: (typeof achievementViewModes)[number]['name']) {
  const group = page.getByRole('group', { name: '成就视图' });
  assert.equal(await group.getByRole('button').count(), achievementViewModes.length, 'the achievement view selector exposes all three modes');

  for (const viewMode of achievementViewModes) {
    const button = group.getByRole('button', { name: viewMode.name, exact: true });
    const selected = viewMode.name === selectedView;
    assert.equal(await button.getAttribute('aria-label'), viewMode.name, `${viewMode.name} has a stable accessible name`);
    assert.equal(await button.getAttribute('aria-pressed'), String(selected), `${viewMode.name} exposes whether it is selected`);
    assert.equal(await page.getByRole('heading', { name: viewMode.heading, exact: true }).count(), Number(selected), `${viewMode.name} selected state matches the visible content view`);
  }

  assert.equal(await group.locator('button[aria-pressed="true"]').count(), 1, 'exactly one achievement view is selected');
}

async function getSeedFixtureState(page: import('playwright').Page) {
  const response = await page.request.get(`${base}/__qa/seed-state`);
  assert.equal(response.status(), 200, 'the isolated seed fixture state is readable');
  return response.json() as Promise<{ seedPostRequests: number; seedListReads: number; definitionCount: number }>;
}

try {
  const errors: string[] = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?theme=${theme}`);
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN', 'the document language matches the Chinese UI');
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    assert.ok(description?.includes('选题、创作、成片、发布'), 'the app entry has an accurate product description');
    await page.getByRole('heading', { name: '成就系统', exact: true }).waitFor();
    const categoryFilter = page.getByLabel('按成就类别筛选');
    const rarityFilter = page.getByLabel('按成就稀有度筛选');
    await categoryFilter.waitFor();
    await rarityFilter.waitFor();
    assert.equal(await categoryFilter.getAttribute('id'), 'achievement-category-filter');
    assert.equal(await categoryFilter.getAttribute('name'), 'achievementCategory');
    assert.equal(await rarityFilter.getAttribute('id'), 'achievement-rarity-filter');
    assert.equal(await rarityFilter.getAttribute('name'), 'achievementRarity');
    await page.getByRole('heading', { name: '暂无可查看的成就' }).waitFor();
    await page.getByText('当前还没有可查看的成就，请联系管理员启用成就内容。', { exact: true }).waitFor();
    const achievementFilters = page.getByRole('group', { name: '按成就状态筛选' });
    const allFilter = achievementFilters.getByRole('button', { name: /^全部/ });
    const earnedFilter = achievementFilters.getByRole('button', { name: /^已获得/ });
    const lockedFilter = achievementFilters.getByRole('button', { name: /^未解锁/ });
    assert.equal(await allFilter.getAttribute('aria-pressed'), 'true', `${theme} all-achievements filter exposes its initial selected state`);
    assert.equal(await earnedFilter.getAttribute('aria-pressed'), 'false', `${theme} earned filter exposes its initial unselected state`);
    assert.equal(await lockedFilter.getAttribute('aria-pressed'), 'false', `${theme} locked filter exposes its initial unselected state`);
    await earnedFilter.click();
    assert.equal(await earnedFilter.getAttribute('aria-pressed'), 'true', `${theme} earned filter exposes selected state after activation`);
    await lockedFilter.click();
    assert.equal(await lockedFilter.getAttribute('aria-pressed'), 'true', `${theme} locked filter exposes selected state after activation`);
    await allFilter.click();
    await assertAchievementView(page, '卡片视图');
    await assertTextContrast(page.getByText('0 积分 · 距下一级还需 50', { exact: true }), `${theme} level progress summary`);
    await assertTextContrast(page.getByText('/0', { exact: true }), `${theme} earned count denominator`);
    await assertTextContrast(page.getByText('已解锁成就', { exact: true }), `${theme} earned count label`);
    await assertTextContrast(page.getByText('总积分', { exact: true }), `${theme} total points label`);
    await assertTextContrast(page.getByText('完成度', { exact: true }), `${theme} completion label`);
    assert.equal(await page.getByRole('button', { name: '启用预设成就' }).count(), 0, 'members do not see an admin-only action prompt');
    assert.equal(await page.getByRole('button', { name: '检查新成就' }).count(), 0, 'the empty catalog does not offer a no-op check action');
    if (theme === 'dark') {
      await page.getByRole('heading', { name: '暂无可查看的成就' }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/xmt-achievements-no-config-member-dark-1440.png', fullPage: false });
    }
    const leaderboardButton = page.getByRole('group', { name: '成就视图' }).getByRole('button', { name: '排行榜', exact: true });
    await leaderboardButton.click();
    await assertAchievementView(page, '排行榜');
    const emptyState = page.getByRole('status').filter({ hasText: '当前没有可显示的成员积分排行' });
    await emptyState.getByText('当前没有可显示的成员积分排行', { exact: true }).waitFor();
    const leaderboardDescription = emptyState.getByText('启用成员后，这里会显示成就积分排行。', { exact: true });
    await leaderboardDescription.waitFor();
    await assertTextContrast(leaderboardDescription, `${theme} leaderboard empty-state description`);
    assert.equal(await page.getByText('暂无数据', { exact: true }).count(), 0, `${theme} leaderboard no longer shows a generic empty state`);

    const feedButton = page.getByRole('group', { name: '成就视图' }).getByRole('button', { name: '动态', exact: true });
    await page.keyboard.press('Tab');
    assert.equal(await feedButton.evaluate((button) => button === document.activeElement), true, `${theme} keyboard Tab moves from leaderboard to dynamic view`);
    await page.keyboard.press('Enter');
    await assertAchievementView(page, '动态');
    const feedEmptyState = page.getByText('暂无人获得成就', { exact: true });
    await feedEmptyState.waitFor();
    await assertTextContrast(feedEmptyState, `${theme} achievement feed empty-state message`);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await leaderboardButton.evaluate((button) => button === document.activeElement), true, `${theme} keyboard Shift+Tab returns from dynamic to leaderboard view`);
    await page.keyboard.press('Space');
    await assertAchievementView(page, '排行榜');
    await page.keyboard.press('Shift+Tab');
    const cardButton = page.getByRole('group', { name: '成就视图' }).getByRole('button', { name: '卡片视图', exact: true });
    assert.equal(await cardButton.evaluate((button) => button === document.activeElement), true, `${theme} keyboard Shift+Tab moves to card view`);
    await page.keyboard.press('Enter');
    await assertAchievementView(page, '卡片视图');
    await leaderboardButton.click();
    await assertAchievementView(page, '排行榜');

    for (const testId of ['achievement-filter-count', 'achievement-category-count', 'achievement-rarity-count']) {
      const labels = page.getByTestId(testId);
      for (let index = 0; index < await labels.count(); index += 1) {
        const ratio = await composedTextContrastRatio(labels.nth(index));
        assert(ratio >= 4.5, `${theme} theme ${testId} #${index + 1} contrast=${ratio.toFixed(2)} expected>=4.5`);
      }
    }

    const headingLevels = await page.locator('main h1, main h2, main h3, main h4').evaluateAll((nodes) => nodes.map((node) => Number(node.tagName.slice(1))));
    for (let index = 1; index < headingLevels.length; index += 1) {
      assert(headingLevels[index] <= headingLevels[index - 1] + 1, `${theme} theme heading level must not skip from h${headingLevels[index - 1]} to h${headingLevels[index]}`);
    }

    if (theme === 'dark') {
      await emptyState.scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/xmt-achievements-leaderboard-empty-dark-1440.png', fullPage: false });
    }
  }

  await page.goto(`${base}/__qa?theme=dark&manage=1`);
  await page.getByRole('heading', { name: '成就系统', exact: true }).waitFor();
  await page.getByRole('heading', { name: '暂无可查看的成就' }).waitFor();
  await page.getByText('启用预设成就后，成员即可查看并解锁。', { exact: true }).waitFor();
  const enablePresetButton = page.getByRole('button', { name: '启用预设成就' });
  await enablePresetButton.waitFor();
  assert.equal(await page.getByRole('button', { name: '检查新成就' }).count(), 0, 'managers enable the empty catalog before checking for achievements');
  await page.getByRole('heading', { name: '暂无可查看的成就' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/xmt-achievements-no-config-manager-dark-1440.png', fullPage: false });

  const robots = await page.request.get(`${base}/robots.txt`);
  assert.equal(robots.status(), 200, 'the authenticated workspace crawler policy is served as a static file');
  assert.match(await robots.text(), /User-agent:\s*\*\s+Disallow:\s*\//, 'the private workspace is not intended for search indexing');

  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto(`${base}/__qa?theme=dark`);
  await page.getByRole('heading', { name: '成就系统', exact: true }).waitFor();
  await assertAchievementView(page, '卡片视图');
  const narrowViewButtons = page.getByRole('group', { name: '成就视图' }).getByRole('button');
  const narrowViewButtonSizes = await narrowViewButtons.evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  assert.equal(narrowViewButtonSizes.length, achievementViewModes.length, 'the narrow achievement view selector keeps all three controls');
  assert(narrowViewButtonSizes.every(({ width, height }) => width >= 40 && height >= 40), '320px view controls provide at least 40×40px touch targets');
  const narrowLayout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.equal(narrowLayout.scrollWidth, narrowLayout.width, '320px achievement view has no horizontal overflow');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/__qa?theme=dark`);
  await page.getByRole('heading', { name: '成就系统', exact: true }).waitFor();
  await page.getByRole('heading', { name: '暂无可查看的成就' }).waitFor();
  await page.getByText('当前还没有可查看的成就，请联系管理员启用成就内容。', { exact: true }).waitFor();
  await assertAchievementView(page, '卡片视图');
  assert.equal(await page.getByRole('button', { name: '启用预设成就' }).count(), 0, 'the mobile member view does not offer a hidden admin-only action');
  assert.equal(await page.getByRole('button', { name: '检查新成就' }).count(), 0, 'the mobile empty catalog does not offer a no-op check action');
  await page.getByRole('heading', { name: '暂无可查看的成就' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/xmt-achievements-no-config-member-dark-390.png', fullPage: false });
  await page.getByRole('group', { name: '成就视图' }).getByRole('button', { name: '排行榜', exact: true }).click();
  await assertAchievementView(page, '排行榜');
  const mobileEmptyState = page.getByRole('status').filter({ hasText: '当前没有可显示的成员积分排行' });
  await mobileEmptyState.getByText('当前没有可显示的成员积分排行', { exact: true }).waitFor();
  await assertTextContrast(page.getByText('0 积分 · 距下一级还需 50', { exact: true }), '390px dark level progress summary');
  await assertTextContrast(mobileEmptyState.getByText('启用成员后，这里会显示成就积分排行。', { exact: true }), '390px dark leaderboard empty-state description');
  const mobileLayout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.equal(mobileLayout.scrollWidth, mobileLayout.width, '390px leaderboard has no horizontal overflow');
  await mobileEmptyState.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/xmt-achievements-leaderboard-empty-dark-390.png', fullPage: false });

  const identity = await page.evaluate(() => ({
    path: window.location.pathname,
    title: document.title,
    content: document.querySelector('#root')?.textContent?.trim() || '',
    overlays: document.querySelectorAll('vite-error-overlay, [data-vite-error-overlay]').length,
  }));
  assert.equal(identity.path, '/achievements', 'the fixture renders the mounted achievements route');
  assert.ok(identity.title && identity.content.includes('成员积分排行'), 'the page renders meaningful achievement content');
  assert.equal(identity.overlays, 0, 'the page has no Vite error overlay');
  assert.equal(apiWrites, 0, 'viewing the empty leaderboard does not write business data');
  assert.deepEqual(errors, [], 'the isolated empty leaderboard flow has no unexpected browser errors');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/__qa?theme=dark&manage=1&seedScenario=commit-lost`);
  await page.getByRole('heading', { name: '成就系统', exact: true }).waitFor();
  await page.getByRole('button', { name: '启用预设成就' }).click();
  await page.getByText('只读核实确认服务器当前已有预设成就内容，页面已同步；未重复提交。', { exact: true }).waitFor();
  await page.getByText('预设成就', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '启用预设成就' }).count(), 0, 'a committed seed response loss removes the empty-catalog action after read-back');
  assert.equal(await page.getByRole('button', { name: '检查新成就' }).count(), 1, 'the page adopts the read-back catalog without claiming a created count');
  assert.deepEqual(await getSeedFixtureState(page), { seedPostRequests: 1, seedListReads: 2, definitionCount: 1 }, 'a commit-then-503 outcome is resolved by exactly one read-only GET and no repeated POST');

  await page.goto(`${base}/__qa?theme=dark&manage=1&seedScenario=not-submitted`);
  await page.getByRole('heading', { name: '成就系统', exact: true }).waitFor();
  await page.getByRole('button', { name: '启用预设成就' }).click();
  const notFoundRecovery = page.getByTestId('achievement-seed-recovery');
  await notFoundRecovery.getByText('只读核实确认服务器当前成就列表为空；确认后可显式重试初始化。', { exact: true }).waitFor();
  assert.equal(await notFoundRecovery.getByRole('button', { name: '明确重试初始化' }).count(), 1, 'an empty read-back provides an explicit retry action');
  assert.deepEqual(await getSeedFixtureState(page), { seedPostRequests: 1, seedListReads: 2, definitionCount: 0 }, 'the uncommitted response loss performs one POST and one read-only GET before retry');
  await notFoundRecovery.getByRole('button', { name: '明确重试初始化' }).click();
  await page.getByRole('button', { name: '检查新成就' }).waitFor();
  assert.deepEqual(await getSeedFixtureState(page), { seedPostRequests: 2, seedListReads: 3, definitionCount: 1 }, 'the user-confirmed retry sends exactly one additional POST and its success refreshes the list');

  await page.goto(`${base}/__qa?theme=dark&manage=1&seedScenario=readback-fails`);
  await page.getByRole('heading', { name: '成就系统', exact: true }).waitFor();
  await page.getByRole('button', { name: '启用预设成就' }).click();
  const unknownRecovery = page.getByTestId('achievement-seed-recovery');
  await unknownRecovery.getByText('暂时无法核实预设成就初始化结果；写入已锁定，请只读重新核实。', { exact: true }).waitFor();
  assert.equal(await unknownRecovery.getByRole('button', { name: '只读重新核实' }).count(), 1, 'a failed read-back retains a read-only recovery action');
  assert.equal(await unknownRecovery.getByRole('button', { name: '明确重试初始化' }).count(), 0, 'a failed read-back does not offer a write retry');
  assert.equal(await page.getByRole('button', { name: '启用预设成就' }).count(), 0, 'the original seed action stays locked while the result is unknown');
  assert.deepEqual(await getSeedFixtureState(page), { seedPostRequests: 1, seedListReads: 2, definitionCount: 0 }, 'failed read-back does not create another POST');
  await unknownRecovery.getByRole('button', { name: '只读重新核实' }).click();
  await page.getByRole('button', { name: '明确重试初始化' }).waitFor();
  assert.deepEqual(await getSeedFixtureState(page), { seedPostRequests: 1, seedListReads: 3, definitionCount: 0 }, 'manual verification retries only GET and unlocks explicit retry only after confirming an empty list');

  await page.goto(`${base}/__qa?theme=dark&manage=1&seedScenario=definitive-reject`);
  await page.getByRole('heading', { name: '成就系统', exact: true }).waitFor();
  await page.getByRole('button', { name: '启用预设成就' }).click();
  await page.getByRole('button', { name: '启用预设成就' }).waitFor();
  assert.equal(await page.getByTestId('achievement-seed-recovery').count(), 0, 'a definitive 4xx preserves the existing failure path without recovery state');
  assert.deepEqual(await getSeedFixtureState(page), { seedPostRequests: 1, seedListReads: 1, definitionCount: 0 }, 'a definitive 4xx is not followed by a verification GET');
  assert.deepEqual(errors, [], 'the isolated achievement flows have no unexpected browser errors');
  console.log('Achievements browser test passed: empty-state views plus commit-loss read-back, explicit retry, read-back lock, and definitive rejection request counts.');

} finally {
  await browser.close();
  io.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
}
