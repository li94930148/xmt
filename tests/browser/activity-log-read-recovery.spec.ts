import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 98, username: 'activity-log-qa', role: 'admin', name: '活动日志验收', enabled: true, force_change_password: false };
const logRecord = {
  id: 981,
  user_id: 7,
  user_name: '筛选验收成员',
  action: 'create',
  target: '隔离活动日志记录',
  detail: '仅用于读取失败和恢复测试。',
  created_at: '2026-10-09T09:00:00+08:00',
};
const actionMatrix = ['create', 'update', 'delete', 'login', 'publish', 'audit', 'status_change', 'future_action'];
const actionMatrixLabels = ['创建', '更新', '删除', '登录', '发布', '审核', '状态变更', 'future_action'];

type ParsedColor = { rgb: [number, number, number]; alpha: number };

const parseColor = (color: string): ParsedColor => {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const normalized = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex;
    return {
      rgb: [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [number, number, number],
      alpha: 1,
    };
  }
  const rgb = color.match(/^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)$/i);
  if (rgb) return { rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])], alpha: rgb[4] ? Number(rgb[4]) / (color.includes(`${rgb[4]}%`) ? 100 : 1) : 1 };
  const srgb = color.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%?)?\s*\)$/i);
  assert.ok(srgb, `expected a supported computed RGB color, received ${color}`);
  const channels = [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])].map((value) => value * 255) as [number, number, number];
  const alpha = srgb[4] ? Number(srgb[4]) / (color.includes(`${srgb[4]}%`) ? 100 : 1) : 1;
  return { rgb: channels, alpha };
};

const contrastRatio = (foreground: string, background: string) => {
  const luminance = (color: string) => {
    const channels = parseColor(color).rgb.map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [first, second] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (first + 0.05) / (second + 0.05);
};

const compositeBackground = (layersFromForegroundToCanvas: string[]) => {
  let result: ParsedColor = { rgb: [0, 0, 0], alpha: 0 };
  for (const layer of [...layersFromForegroundToCanvas].reverse()) {
    const foreground = parseColor(layer);
    const alpha = foreground.alpha + result.alpha * (1 - foreground.alpha);
    const rgb = foreground.rgb.map((channel, index) => alpha === 0
      ? 0
      : (channel * foreground.alpha + result.rgb[index] * result.alpha * (1 - foreground.alpha)) / alpha) as [number, number, number];
    result = { rgb, alpha };
  }
  return `rgb(${result.rgb.map((channel) => Math.round(channel)).join(', ')})`;
};

const readActivityBadgeColors = async (page: Page, index = 0) => {
  const badge = await page.locator('[data-activity-action-badge]').nth(index).evaluate((element) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      backgrounds.push(getComputedStyle(current).backgroundColor);
      if (current === document.documentElement) break;
    }
    return {
      foreground: getComputedStyle(element).color,
      badgeBackground: getComputedStyle(element).backgroundColor,
      markerBackground: getComputedStyle(document.querySelector('[data-activity-action-marker]')!).backgroundColor,
      backgroundLayers: backgrounds,
      isHovered: element.matches(':hover'),
    };
  });
  return { ...badge, effectiveBackground: compositeBackground(badge.backgroundLayers) };
};
const readActivityBadgeColorMatrix = async (page: Page) => {
  const badges = await page.locator('[data-activity-action-badge]').evaluateAll((elements) => elements.map((element) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      backgrounds.push(getComputedStyle(current).backgroundColor);
      if (current === document.documentElement) break;
    }
    return { label: element.textContent?.trim() ?? '', foreground: getComputedStyle(element).color, backgrounds };
  }));
  return badges.map((badge) => ({
    ...badge,
    effectiveBackground: compositeBackground(badge.backgrounds),
  }));
};
const logRecordForPage = (page: number) => ({
  ...logRecord,
  id: logRecord.id + page - 1,
  target: page === 1 ? logRecord.target : `${logRecord.target}（第${page}页）`,
});
const logRecordsForActionMatrix = () => actionMatrix.map((action, index) => ({
  ...logRecord,
  id: 2000 + index,
  action,
  target: `动作类型 ${action}`,
}));

let failNextActivityLogRead = true;
let failNextUserListRead = true;
let activityLogReads = 0;
let userListReads = 0;
let writes = 0;
let holdNextActivityLogRead = false;
let releaseHeldActivityLogRead: (() => void) | null = null;
const activityLogPagesToHold = new Set<number>();
const heldActivityLogPageResponses = new Map<number, () => void>();
const app = express();
app.post('/__qa/hold-next-activity-log-read', (_req, res) => {
  holdNextActivityLogRead = true;
  res.json({ ok: true });
});
app.post('/__qa/release-held-activity-log-read', (_req, res) => {
  if (!releaseHeldActivityLogRead) return res.status(409).json({ message: '没有等待释放的活动日志读取' });
  const release = releaseHeldActivityLogRead;
  releaseHeldActivityLogRead = null;
  release();
  return res.json({ ok: true });
});
app.post('/__qa/hold-activity-log-page/:page', (req, res) => {
  activityLogPagesToHold.add(Number(req.params.page));
  return res.json({ ok: true });
});
app.post('/__qa/release-activity-log-page/:page', (req, res) => {
  const page = Number(req.params.page);
  const release = heldActivityLogPageResponses.get(page);
  if (!release) return res.status(409).json({ message: `第 ${page} 页没有等待释放的活动日志读取` });
  heldActivityLogPageResponses.delete(page);
  release();
  return res.json({ ok: true });
});
app.post('/__qa/fail-next-activity-log-read', (_req, res) => {
  failNextActivityLogRead = true;
  res.json({ ok: true });
});
const fixturePage = (theme: 'light' | 'dark', redirectPath = '/activity') => `<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','activity-log-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace(${JSON.stringify(redirectPath)});</script>`;
app.get('/__qa', (_req, res) => res.type('html').send(fixturePage('light')));
app.get('/__qa/loaded', (req, res) => {
  failNextActivityLogRead = false;
  failNextUserListRead = false;
  res.type('html').send(fixturePage(req.query.theme === 'dark' ? 'dark' : 'light'));
});
app.get('/__qa/empty', (_req, res) => {
  failNextActivityLogRead = false;
  failNextUserListRead = false;
  res.type('html').send(fixturePage('light', '/activity?activity_empty=1'));
});
app.get('/__qa/action-matrix', (req, res) => {
  failNextActivityLogRead = false;
  failNextUserListRead = false;
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  return res.type('html').send(fixturePage(theme, '/activity?activity_matrix=1'));
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['user:logs']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/users/activity-logs', (req, res) => {
  activityLogReads += 1;
  const page = Number(req.query.page || 1);
  const referer = req.get('referer') || '';
  const response = referer.includes('activity_empty=1')
    ? { data: [], total: 0, page: 1, limit: Number(req.query.limit || 20) }
    : referer.includes('activity_matrix=1')
    ? { data: logRecordsForActionMatrix(), total: actionMatrix.length, page: 1, limit: Number(req.query.limit || 20) }
    : { data: [logRecordForPage(page)], total: 41, page, limit: Number(req.query.limit || 20) };
  if (holdNextActivityLogRead) {
    holdNextActivityLogRead = false;
    releaseHeldActivityLogRead = () => res.json(response);
    return;
  }
  if (activityLogPagesToHold.delete(page)) {
    heldActivityLogPageResponses.set(page, () => res.json(response));
    return;
  }
  if (failNextActivityLogRead) {
    failNextActivityLogRead = false;
    return res.status(503).json({ message: '模拟活动日志读取失败' });
  }
  return res.json(response);
});
app.get('/api/users', (_req, res) => {
  userListReads += 1;
  if (failNextUserListRead) {
    failNextUserListRead = false;
    return res.status(503).json({ message: '模拟成员筛选列表读取失败' });
  }
  return res.json({ data: [{ id: 7, username: 'filter-member', name: '筛选验收成员' }], total: 1, page: 1, limit: 100 });
});
app.use('/api', (req, res) => {
  if (req.method !== 'GET') writes += 1;
  res.json({ data: [], total: 0, page: 1, limit: 20 });
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
const fixtureMode = process.argv.includes('--mcp-fixture');
const browser = fixtureMode ? undefined : await chromium.launch({ headless: true });

try {
  if (fixtureMode) {
    console.log(`Activity-log MCP fixture ready: ${base}/__qa/loaded?theme=light`);
    await new Promise<void>((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  } else {
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const waitForNoHorizontalOverflow = () => page.waitForFunction(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    undefined,
    { timeout: 3000 },
  );
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '活动日志', exact: true }).waitFor();
  const identity = await page.evaluate(() => ({
    path: window.location.pathname,
    title: document.title,
    content: document.querySelector('#root')?.textContent?.trim() || '',
    frameworkOverlays: document.querySelectorAll('vite-error-overlay, [data-vite-error-overlay]').length,
  }));
  assert.equal(identity.path, '/activity', 'the fixture renders the requested activity-log page');
  assert.ok(identity.title && identity.content.includes('活动日志'), 'the app renders non-empty activity-log content with a document title');
  assert.equal(identity.frameworkOverlays, 0, 'the page has no Vite error overlay');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'the desktop activity-log error state has no horizontal overflow');
  const memberFilter = page.getByRole('combobox', { name: '筛选活动日志成员', exact: true });
  assert.equal(await memberFilter.count(), 1, 'the member filter exposes a descriptive accessible name');
  assert.equal(await memberFilter.getAttribute('id'), 'activity-log-user-filter', 'the member filter has a stable id for browser and assistive-technology identification');
  await page.getByRole('alert').getByText(/活动日志暂时无法读取/).waitFor();
  await page.getByRole('status').getByText(/成员筛选暂不可用/).waitFor();
  assert.equal(await page.getByText('暂无活动记录', { exact: true }).count(), 0, 'an initial log read failure is not shown as an empty log');
  assert.equal(await page.getByText(/已加载第 \d+\/\d+ 页，共 \d+ 条记录。/).count(), 0, 'an initial read failure does not announce a successful page');
  assert.equal(activityLogReads, 1, 'the initial activity-log failure makes one GET');

  await page.setViewportSize({ width: 320, height: 844 });
  await waitForNoHorizontalOverflow();
  const initialMobileLayout = await page.evaluate(() => {
    const rect = (element: Element | null) => {
      if (!element) return null;
      const { x, y, width, height, bottom, right } = element.getBoundingClientRect();
      return { x, y, width, height, bottom, right };
    };
    const heading = [...document.querySelectorAll('h1')].find((element) => element.textContent?.trim() === '活动日志') ?? null;
    const subtitle = heading?.parentElement?.querySelector('p') ?? null;
    const logRetry = [...document.querySelectorAll('button')].find((element) => element.textContent?.includes('重新加载日志')) ?? null;
    const memberRetry = [...document.querySelectorAll('button')].find((element) => element.textContent?.includes('重试成员筛选')) ?? null;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      heading: rect(heading),
      subtitle: rect(subtitle),
      filter: rect(document.querySelector('select')),
      logRetry: rect(logRetry),
      memberRetry: rect(memberRetry),
    };
  });
  assert.ok(initialMobileLayout.scrollWidth <= initialMobileLayout.clientWidth, 'the 320px activity-log error state has no horizontal overflow');
  assert.ok(initialMobileLayout.filter && initialMobileLayout.filter.height >= 40, 'the member filter meets the 40px mobile touch target');
  assert.ok(initialMobileLayout.logRetry && initialMobileLayout.logRetry.height >= 40, 'the read-only recovery action meets the 40px mobile touch target');
  assert.ok(initialMobileLayout.memberRetry && initialMobileLayout.memberRetry.height >= 40, 'the member-filter recovery action meets the 40px mobile touch target');
  assert.ok(initialMobileLayout.subtitle && initialMobileLayout.filter && initialMobileLayout.filter.y >= initialMobileLayout.subtitle.bottom, 'the filter stacks below the activity-log title instead of overlapping it');
  await page.getByRole('button', { name: '重试成员筛选', exact: true }).click();
  assert.equal(await page.locator('select option[value="7"]').count(), 1, 'the member retry restores the selectable user option');
  assert.equal(userListReads, 2, 'the member-filter retry performs one read');
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForNoHorizontalOverflow();
  await page.screenshot({ path: '/tmp/xmt-activity-log-read-error-390.png' });

  await page.request.post(`${base}/__qa/hold-next-activity-log-read`);
  const recoveredActivityLogRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/activity-logs') && response.status() === 200);
  await page.getByRole('button', { name: '重新加载日志', exact: true }).click();
  const activityLogLoadingStatus = page.getByRole('status').getByText('正在加载活动日志…', { exact: true });
  await activityLogLoadingStatus.waitFor();
  assert.equal(await page.getByText(/已加载第 \d+\/\d+ 页，共 \d+ 条记录。/).count(), 0, 'the pending retry keeps the loading announcement without announcing success early');
  assert.equal(activityLogReads, 2, 'the pending retry performs one activity-log GET');
  await page.request.post(`${base}/__qa/release-held-activity-log-read`);
  await recoveredActivityLogRead;
  await page.getByText(logRecord.target, { exact: true }).waitFor();
  await activityLogLoadingStatus.waitFor({ state: 'hidden' });
  await page.getByRole('status').getByText('已加载第 1/3 页，共 41 条记录。', { exact: true }).waitFor();
  assert.equal(activityLogReads, 2, 'the log recovery control performs one additional GET');
  assert.equal(writes, 0, 'read recovery does not issue any write');
  const createBadgeColors = await readActivityBadgeColors(page);
  assert.notEqual(createBadgeColors.badgeBackground, 'rgba(0, 0, 0, 0)', 'the action badge receives its semantic token tint');
  assert.notEqual(createBadgeColors.markerBackground, 'rgba(0, 0, 0, 0)', 'the timeline action marker receives its semantic token tint');
  assert.ok(contrastRatio(createBadgeColors.foreground, createBadgeColors.effectiveBackground) >= 4.5,
    `small activity-action labels meet 4.5:1 contrast against the composited badge background (foreground ${createBadgeColors.foreground}, background ${createBadgeColors.effectiveBackground})`);

  for (const theme of ['light', 'dark'] as const) {
    const matrixPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const matrixErrors: string[] = [];
    matrixPage.on('pageerror', (error) => matrixErrors.push(error.message));
    matrixPage.on('console', (message) => {
      if (message.type() === 'error') matrixErrors.push(message.text());
    });
    await matrixPage.goto(`${base}/__qa/action-matrix?theme=${theme}`);
    await matrixPage.getByRole('heading', { name: '活动日志', exact: true }).waitFor();
    await matrixPage.waitForFunction((count) => document.querySelectorAll('[data-activity-action-badge]').length === count, actionMatrix.length);
    const badges = await readActivityBadgeColorMatrix(matrixPage);
    assert.deepEqual(badges.map((badge) => badge.label), actionMatrixLabels, `${theme} theme renders every known action and the unknown-action fallback`);
    for (const badge of badges) {
      const ratio = contrastRatio(badge.foreground, badge.effectiveBackground);
      assert.ok(ratio >= 4.5,
        `${theme} ${badge.label} action badge meets 4.5:1 in its composited resting state (foreground ${badge.foreground}, background ${badge.effectiveBackground}, ratio ${ratio.toFixed(2)}:1)`);
    }
    for (const [index, badge] of badges.entries()) {
      const badgeLocator = matrixPage.locator('[data-activity-action-badge]').nth(index);
      await badgeLocator.hover();
      await matrixPage.waitForTimeout(250);
      const hovered = await readActivityBadgeColors(matrixPage, index);
      assert.equal(hovered.isHovered, true, `${theme} ${badge.label} badge is measured while its actual row is hovered`);
      assert.notEqual(hovered.effectiveBackground, badge.effectiveBackground,
        `${theme} ${badge.label} hover state includes the row's changed background (resting ${badge.effectiveBackground}, hover ${hovered.effectiveBackground})`);
      const ratio = contrastRatio(hovered.foreground, hovered.effectiveBackground);
      assert.ok(ratio >= 4.5,
        `${theme} ${badge.label} action badge meets 4.5:1 in its composited hover state (foreground ${hovered.foreground}, background ${hovered.effectiveBackground}, ratio ${ratio.toFixed(2)}:1)`);
    }
    assert.equal(writes, 0, `${theme} action contrast matrix remains read-only`);
    assert.deepEqual(matrixErrors, [], `${theme} action contrast fixture has no browser errors`);
    await matrixPage.close();
  }

  await page.evaluate(async () => { await fetch('/__qa/fail-next-activity-log-read', { method: 'POST' }); });
  await memberFilter.focus();
  assert.equal(await memberFilter.evaluate((element) => document.activeElement === element), true, 'the named member filter can receive keyboard focus');
  await memberFilter.selectOption(String(logRecord.user_id));
  await page.getByRole('alert').getByText(/仍显示最近一次成功读取的记录/).waitFor();
  await page.getByText(logRecord.target, { exact: true }).waitFor();
  assert.equal(await page.getByText('暂无活动记录', { exact: true }).count(), 0, 'a refresh failure preserves previously loaded log records');
  assert.equal(await page.getByText(/已加载第 \d+\/\d+ 页，共 \d+ 条记录。/).count(), 0, 'a failed refresh clears the prior success announcement and does not announce the failed read');
  assert.equal(activityLogReads, 3, 'filter refresh failure performs one GET');
  const filteredRetryReads = activityLogReads;
  await page.getByRole('button', { name: '重新加载日志', exact: true }).click();
  await page.getByRole('status').getByText('已加载第 1/3 页，共 41 条记录。', { exact: true }).waitFor();
  assert.equal(activityLogReads, filteredRetryReads + 1, 'retrying the filtered log view performs exactly one additional GET');
  assert.equal(userListReads, 2, 'activity-log retries do not repeat the member-list read');
  assert.equal(writes, 0, 'all recovery actions remain read-only');
  assert.equal(expectedHttpErrors.length, 3, 'the browser records only the three intentionally injected read failures');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'the activity-log recovery view fits a 390px viewport');
  assert.deepEqual(errors, [], 'the activity-log page has no unexpected browser errors');

  await page.setViewportSize({ width: 320, height: 844 });
  await waitForNoHorizontalOverflow();
  const paginationLayout = await page.evaluate(() => {
    const rect = (element: Element | null) => {
      if (!element) return null;
      const { x, y, width, height, bottom, right } = element.getBoundingClientRect();
      return { x, y, width, height, bottom, right };
    };
    const summary = [...document.querySelectorAll('p')].find((element) => element.textContent?.includes('共 41 条记录')) ?? null;
    const pagination = [...document.querySelectorAll('button[aria-label="上一页"], button[aria-label="下一页"], button[aria-current="page"]')].map(rect);
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, summary: rect(summary), pagination };
  });
  assert.ok(paginationLayout.scrollWidth <= paginationLayout.clientWidth, 'the 320px activity-log pagination has no horizontal overflow');
  assert.ok(paginationLayout.summary && paginationLayout.pagination.every((control) => control && control.height >= 40 && control.x >= 0 && control.right <= paginationLayout.clientWidth), 'all mobile pagination touch targets are at least 40px and remain within the viewport');
  assert.ok(paginationLayout.summary && paginationLayout.pagination[0] && paginationLayout.pagination[0].y >= paginationLayout.summary.bottom, 'pagination wraps below the result count at narrow widths');

  const currentPageButtons = page.locator('button[aria-current="page"]');
  assert.equal(await currentPageButtons.count(), 1, 'exactly one page button exposes the current-page state');
  assert.equal(await page.getByRole('button', { name: '第 1 页', exact: true }).getAttribute('aria-current'), 'page', 'the initial page is named and identified as current');
  await page.request.post(`${base}/__qa/hold-next-activity-log-read`);
  const readsBeforePageTwo = activityLogReads;
  const pageTwoRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/activity-logs') && response.status() === 200);
  await page.getByRole('button', { name: '下一页', exact: true }).focus();
  await page.keyboard.press('Enter');
  await activityLogLoadingStatus.waitFor();
  assert.equal(await page.getByText(/已加载第 \d+\/\d+ 页，共 \d+ 条记录。/).count(), 0, 'page navigation keeps announcing loading until its read succeeds');
  assert.equal(activityLogReads, readsBeforePageTwo + 1, 'moving to page two makes exactly one GET');
  await page.request.post(`${base}/__qa/release-held-activity-log-read`);
  await pageTwoRead;
  await page.getByText(logRecordForPage(2).target, { exact: true }).waitFor();
  await page.getByRole('status').getByText('已加载第 2/3 页，共 41 条记录。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '第 2 页', exact: true }).getAttribute('aria-current'), 'page', 'keyboard activation of next page updates the named current-page state');
  assert.equal(await currentPageButtons.count(), 1, 'page two remains the only current page');

  await page.request.post(`${base}/__qa/fail-next-activity-log-read`);
  const readsBeforePageThreeFailure = activityLogReads;
  await page.getByRole('button', { name: '第 3 页', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('alert').getByText(/仍显示最近一次成功读取的记录/).waitFor();
  assert.equal(await page.getByText(/已加载第 \d+\/\d+ 页，共 \d+ 条记录。/).count(), 0, 'a failed page-three read does not announce the requested page as loaded');
  assert.equal(activityLogReads, readsBeforePageThreeFailure + 1, 'the failed page-three attempt performs one GET');
  const pageThreeRetryReads = activityLogReads;
  await page.getByRole('button', { name: '重新加载日志', exact: true }).click();
  await page.getByText(logRecordForPage(3).target, { exact: true }).waitFor();
  await page.getByRole('status').getByText('已加载第 3/3 页，共 41 条记录。', { exact: true }).waitFor();
  assert.equal(activityLogReads, pageThreeRetryReads + 1, 'retrying page three performs exactly one GET');
  assert.equal(await page.getByRole('button', { name: '第 3 页', exact: true }).getAttribute('aria-current'), 'page', 'keyboard activation of a numbered page updates the named current-page state');
  assert.equal(await currentPageButtons.count(), 1, 'page three remains the only current page');

  await page.request.post(`${base}/__qa/hold-activity-log-page/2`);
  const readsBeforeOutOfOrderPages = activityLogReads;
  const delayedPageTwoRequest = page.waitForRequest((request) => request.method() === 'GET'
    && request.url().includes('/api/users/activity-logs')
    && new URL(request.url()).searchParams.get('page') === '2');
  const delayedPageTwoResponse = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/activity-logs')
    && new URL(response.url()).searchParams.get('page') === '2'
    && response.status() === 200);
  await page.getByRole('button', { name: '上一页', exact: true }).focus();
  await page.keyboard.press('Enter');
  await delayedPageTwoRequest;
  await activityLogLoadingStatus.waitFor();

  await page.request.post(`${base}/__qa/hold-activity-log-page/3`);
  const currentPageThreeRequest = page.waitForRequest((request) => request.method() === 'GET'
    && request.url().includes('/api/users/activity-logs')
    && new URL(request.url()).searchParams.get('page') === '3');
  const currentPageThreeResponse = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users/activity-logs')
    && new URL(response.url()).searchParams.get('page') === '3'
    && response.status() === 200);
  await page.getByRole('button', { name: '第 3 页', exact: true }).focus();
  await page.keyboard.press('Enter');
  await currentPageThreeRequest;
  await activityLogLoadingStatus.waitFor();
  assert.equal(await page.getByRole('button', { name: '第 3 页', exact: true }).getAttribute('aria-current'), 'page', 'the newest requested page is named and current before its response arrives');

  await page.request.post(`${base}/__qa/release-activity-log-page/2`);
  await delayedPageTwoResponse;
  await activityLogLoadingStatus.waitFor();
  assert.equal(await page.getByText(logRecordForPage(2).target, { exact: true }).count(), 0, 'a late response for the previous page cannot replace the active loading state');
  assert.equal(await page.getByRole('status').getByText('已加载第 2/3 页，共 41 条记录。', { exact: true }).count(), 0, 'a stale response cannot announce the wrong page as loaded');

  await page.request.post(`${base}/__qa/release-activity-log-page/3`);
  await currentPageThreeResponse;
  await page.getByText(logRecordForPage(3).target, { exact: true }).waitFor();
  await page.getByRole('status').getByText('已加载第 3/3 页，共 41 条记录。', { exact: true }).waitFor();
  assert.equal(await page.getByText(logRecordForPage(2).target, { exact: true }).count(), 0, 'the latest page remains visible after all out-of-order responses settle');
  assert.equal(activityLogReads, readsBeforeOutOfOrderPages + 2, 'rapid page changes each issue one read and do not duplicate requests');
  assert.equal(await currentPageButtons.count(), 1, 'only the latest page remains current after the race');

  const readsBeforePageTwoReturn = activityLogReads;
  await page.getByRole('button', { name: '上一页', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByText(logRecordForPage(2).target, { exact: true }).waitFor();
  await page.getByRole('status').getByText('已加载第 2/3 页，共 41 条记录。', { exact: true }).waitFor();
  assert.equal(activityLogReads, readsBeforePageTwoReturn + 1, 'returning to page two performs exactly one GET');
  assert.equal(await page.getByRole('button', { name: '第 2 页', exact: true }).getAttribute('aria-current'), 'page', 'keyboard activation of previous page restores its record and named current-page state');
  assert.equal(await currentPageButtons.count(), 1, 'only one page remains current after moving backward');
  assert.equal(writes, 0, 'keyboard pagination remains read-only');

  // 1024×600 at 125% native zoom is represented here by its equivalent 819×480 CSS viewport.
  // This is a layout-viewport regression only; it does not emulate or claim to verify native Chrome zoom.
  await page.setViewportSize({ width: 819, height: 480 });
  await page.evaluate(() => { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; });
  await waitForNoHorizontalOverflow();
  const desktopZoomHeader = await page.evaluate(() => {
    const rect = (element: Element | null) => {
      if (!element) return null;
      const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
      return { x, y, width, height, right, bottom };
    };
    const heading = [...document.querySelectorAll('h1')].find((element) => element.textContent?.trim() === '活动日志') ?? null;
    const titleBlock = heading?.parentElement ?? null;
    const memberFilter = document.querySelector('select[aria-label="筛选活动日志成员"]');
    return {
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      documentWidth: document.documentElement.scrollWidth,
      titleBlock: rect(titleBlock),
      memberFilter: rect(memberFilter?.parentElement ?? null),
    };
  });
  assert.equal(desktopZoomHeader.viewportWidth, 819, 'the 1024×600 at 125% equivalent CSS viewport is 819px wide');
  assert.equal(desktopZoomHeader.viewportHeight, 480, 'the 1024×600 at 125% equivalent CSS viewport is 480px high');
  assert.ok(desktopZoomHeader.documentWidth <= desktopZoomHeader.viewportWidth + 1, 'the 819×480 CSS viewport has no horizontal overflow');
  assert.ok(desktopZoomHeader.titleBlock && desktopZoomHeader.memberFilter
    && desktopZoomHeader.titleBlock.x >= 0 && desktopZoomHeader.titleBlock.y >= 0
    && desktopZoomHeader.titleBlock.bottom <= desktopZoomHeader.viewportHeight + 1
    && desktopZoomHeader.memberFilter.x >= 0 && desktopZoomHeader.memberFilter.y >= 0
    && desktopZoomHeader.memberFilter.right <= desktopZoomHeader.viewportWidth + 1
    && desktopZoomHeader.memberFilter.bottom <= desktopZoomHeader.viewportHeight + 1
    && (desktopZoomHeader.titleBlock.right <= desktopZoomHeader.memberFilter.x + 1
      || desktopZoomHeader.memberFilter.right <= desktopZoomHeader.titleBlock.x + 1
      || desktopZoomHeader.titleBlock.bottom <= desktopZoomHeader.memberFilter.y + 1
      || desktopZoomHeader.memberFilter.bottom <= desktopZoomHeader.titleBlock.y + 1),
  `the activity-log title and member filter remain visible without overlapping at 819×480 CSS pixels: ${JSON.stringify({ title: desktopZoomHeader.titleBlock, filter: desktopZoomHeader.memberFilter })}`);

  const desktopRecordTarget = page.getByText(logRecordForPage(2).target, { exact: true });
  await desktopRecordTarget.scrollIntoViewIfNeeded();
  const desktopRecordBounds = await desktopRecordTarget.evaluate((element) => {
    const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
    return { x, y, width, height, right, bottom, viewportWidth: document.documentElement.clientWidth, viewportHeight: document.documentElement.clientHeight };
  });
  assert.ok(await desktopRecordTarget.isVisible() && desktopRecordBounds.width > 0 && desktopRecordBounds.height > 0
    && desktopRecordBounds.x >= 0 && desktopRecordBounds.y >= 0
    && desktopRecordBounds.right <= desktopRecordBounds.viewportWidth + 1
    && desktopRecordBounds.bottom <= desktopRecordBounds.viewportHeight + 1,
  `the successful activity-log record content is readable in the 819×480 CSS viewport: ${JSON.stringify(desktopRecordBounds)}`);

  const desktopNextPage = page.getByRole('button', { name: '下一页', exact: true });
  await desktopNextPage.scrollIntoViewIfNeeded();
  const desktopPagination = await page.evaluate(() => {
    const summary = [...document.querySelectorAll('p')].find((element) => element.textContent?.includes('共 41 条记录')) ?? null;
    const controls = Array.from(summary?.parentElement?.querySelectorAll('button') ?? []);
    return controls.map((element) => {
      const bounds = element.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      return {
        name: element.getAttribute('aria-label') || element.textContent?.trim() || '',
        x: bounds.x,
        y: bounds.y,
        right: bounds.right,
        bottom: bounds.bottom,
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
        receivesCenterHit: hit === element || Boolean(hit && element.contains(hit)),
      };
    });
  });
  assert.equal(desktopPagination.length, 5, 'previous, all three page-number, and next-page controls are present');
  assert.ok(desktopPagination.every((control) => control.x >= 0 && control.y >= 0
    && control.right <= control.viewportWidth + 1 && control.bottom <= control.viewportHeight + 1
    && control.receivesCenterHit),
  `all pagination controls are visible and hit-testable after scrolling at 819×480 CSS pixels: ${JSON.stringify(desktopPagination)}`);
  await desktopNextPage.focus();
  assert.equal(await desktopNextPage.evaluate((element) => document.activeElement === element), true, 'the desktop-zoom pagination control receives keyboard focus');
  await page.keyboard.press('Enter');
  await page.getByText(logRecordForPage(3).target, { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '第 3 页', exact: true }).getAttribute('aria-current'), 'page', 'keyboard Enter advances to the named current page at the 819×480 CSS viewport');
  assert.equal(writes, 0, 'the desktop-zoom layout and pagination checks issue no business writes');

  for (const width of [320, 390]) {
    const darkPage = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const darkErrors: string[] = [];
    const darkExpectedHttpErrors: string[] = [];
    darkPage.on('pageerror', (error) => darkErrors.push(error.message));
    darkPage.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (message.text().includes('503 (Service Unavailable)')) darkExpectedHttpErrors.push(message.text());
      else darkErrors.push(message.text());
    });

    const logsBeforeDark = activityLogReads;
    const usersBeforeDark = userListReads;
    const writesBeforeDark = writes;
    await darkPage.goto(`${base}/__qa/loaded?theme=dark`);
    await darkPage.getByRole('heading', { name: '活动日志', exact: true }).waitFor();
    await darkPage.getByText(logRecord.target, { exact: true }).waitFor();
    const darkFilter = darkPage.getByRole('combobox', { name: '筛选活动日志成员', exact: true });
    await darkFilter.locator('option[value="7"]').waitFor();
    const darkTheme = await darkPage.evaluate(() => ({
      enabled: document.documentElement.classList.contains('dark'),
      surface: getComputedStyle(document.documentElement).getPropertyValue('--xmt-surface').trim(),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      filterHeight: document.querySelector('select')?.getBoundingClientRect().height ?? 0,
      paginationTargets: Array.from(document.querySelectorAll('button[aria-label="上一页"], button[aria-label="下一页"], button[aria-current="page"]'))
        .map((element) => {
          const { width: targetWidth, height } = element.getBoundingClientRect();
          return { width: targetWidth, height };
        }),
    }));
    assert.equal(darkTheme.enabled, true, `${width}px fixture applies the dark theme class`);
    assert.equal(darkTheme.surface, '#121826', `${width}px fixture uses the dark Studio surface token`);
    assert.ok(darkTheme.scrollWidth <= darkTheme.clientWidth, `${width}px dark success state has no horizontal overflow`);
    assert.ok(darkTheme.filterHeight >= 40, `${width}px dark member filter meets the 40px touch target`);
    assert.ok(darkTheme.paginationTargets.length >= 3 && darkTheme.paginationTargets.every((target) => target.width >= 40 && target.height >= 40), `${width}px dark pagination controls meet 40×40px`);
    const darkBadgeColors = await readActivityBadgeColors(darkPage);
    assert.ok(contrastRatio(darkBadgeColors.foreground, darkBadgeColors.effectiveBackground) >= 4.5,
      `${width}px dark action label meets 4.5:1 contrast against the composited badge background (foreground ${darkBadgeColors.foreground}, background ${darkBadgeColors.effectiveBackground})`);
    assert.equal(activityLogReads, logsBeforeDark + 1, `${width}px dark success page performs one activity-log GET`);
    assert.equal(userListReads, usersBeforeDark + 1, `${width}px dark success page performs one member-list GET`);
    assert.equal(writes, writesBeforeDark, `${width}px dark success state performs no API writes`);

    if (width === 320) {
      await darkPage.request.post(`${base}/__qa/fail-next-activity-log-read`);
      await darkFilter.selectOption(String(logRecord.user_id));
      await darkPage.getByRole('alert').getByText(/仍显示最近一次成功读取的记录/).waitFor();
      await darkPage.getByText(logRecord.target, { exact: true }).waitFor();
      const retryTarget = darkPage.getByRole('button', { name: '重新加载日志', exact: true });
      assert.ok(await retryTarget.evaluate((element) => element.getBoundingClientRect().height >= 40), '320px dark log retry meets the 40px touch target');
      assert.equal(activityLogReads, logsBeforeDark + 2, '320px dark injected failure performs one additional activity-log GET');
      assert.equal(userListReads, usersBeforeDark + 1, '320px dark log failure does not reload member options');
      assert.equal(writes, writesBeforeDark, '320px dark failure state remains read-only');

      await retryTarget.click();
      await darkPage.waitForFunction(() => {
        const retryButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === '重新加载日志') as HTMLButtonElement | undefined;
        return Boolean(retryButton && !retryButton.disabled && !document.querySelector('[role="alert"]'));
      });
      await darkPage.getByText(logRecord.target, { exact: true }).waitFor();
      assert.equal(activityLogReads, logsBeforeDark + 3, '320px dark retry performs exactly one additional activity-log GET');
      assert.equal(darkExpectedHttpErrors.length, 1, '320px dark flow records only the intentionally injected 503');
      assert.deepEqual(darkErrors, [], '320px dark failure and retry have no unexpected browser errors');
      assert.equal(writes, writesBeforeDark, '320px dark retry remains GET-only');
    } else {
      assert.deepEqual(darkExpectedHttpErrors, [], '390px dark success state has no injected HTTP failures');
      assert.deepEqual(darkErrors, [], '390px dark success state has no browser errors');
    }
    await darkPage.close();
  }

  const emptyPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await emptyPage.goto(`${base}/__qa/empty`);
  await emptyPage.getByRole('heading', { name: '活动日志', exact: true }).waitFor();
  const emptyLogStatus = emptyPage.getByRole('status').filter({ hasText: '暂无活动记录' });
  await emptyLogStatus.waitFor();
  assert.equal(await emptyLogStatus.getAttribute('aria-live'), 'polite', 'a successful empty activity-log result is announced politely');
  assert.equal(await emptyLogStatus.getAttribute('aria-atomic'), 'true', 'the empty activity-log announcement is read as one complete status');
  assert.equal(await emptyPage.getByRole('alert').count(), 0, 'a successful empty result is not presented as an error');
  await emptyPage.close();

  console.log('Activity-log browser test passed: log and member reads recover independently, initial errors do not masquerade as empty data, successful empty results are announced, stale records remain visible, and retries are read-only.');
  }
} finally {
  await browser?.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
