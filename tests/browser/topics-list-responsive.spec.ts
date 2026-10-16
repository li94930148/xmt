import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';
import { topicStatusLabel } from '../../src/components/topics/topicStatusLabel';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
assert.deepEqual(
  ['pending', 'approved', 'rejected', 'production', 'shooting', 'publishing', 'completed'].map(topicStatusLabel),
  ['待审核', '已通过', '已驳回', '创作中', '成片制作', '发布中', '已完成'],
  'known topic status codes should use consistent business labels',
);
assert.equal(topicStatusLabel('future_status'), '状态待确认', 'unknown topic status codes should not leak into the UI');
assert.equal(topicStatusLabel(undefined), '状态待确认', 'missing topic status should use a neutral label');
const user = { id: 95, username: 'topics-list-qa', role: 'admin', name: '选题列表验收', enabled: true, force_change_password: false };
const topic = {
  id: 951,
  title: '响应式操作列验收选题',
  description: '只读浏览器夹具，不写入业务数据库。',
  outline: '',
  status: 'production',
  platform: '抖音',
  creator_id: user.id,
  creator_name: user.name,
  assignee_id: user.id,
  assignee_name: user.name,
  submitted_at: '2026-10-07 09:00:00',
  created_at: '2026-10-07 09:00:00',
  deadline: '2026-10-20',
};
const boardAuditTopic = {
  ...topic,
  id: 952,
  title: '看板审核重复提交验收选题',
  description: '隔离看板审核互斥验收。',
  status: 'pending' as string,
};
let topicExists = true;
let failNextTopicDelete = false;
let holdNextBoardAudit = false;
let boardAuditStartedCallback: (() => void) | null = null;
let releaseBoardAudit: (() => void) | null = null;
let boardAuditAttempts = 0;
let boardAuditWrites = 0;

function luminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

async function textContrast(locator: import('playwright').Locator) {
  return locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    const row = element.closest('tr');
    const background = (row ? getComputedStyle(row).backgroundColor : getComputedStyle(document.body).backgroundColor).match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    return { foreground, background, rowBackground: row ? getComputedStyle(row).backgroundColor : '' };
  }).then(({ foreground, background, rowBackground }) => {
    if (foreground.length !== 3 || background.length !== 3) return { ratio: 0, rowBackground };
    const textLuminance = foreground.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
    const backgroundLuminance = background.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
    return { ratio: (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05), rowBackground };
  });
}

async function elementBackgroundContrast(locator: import('playwright').Locator) {
  const { foreground, background } = await locator.evaluate((element) => ({
    foreground: getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [],
    background: getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [],
  }));
  if (foreground.length !== 3 || background.length !== 3) return 0;
  const textLuminance = foreground.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
  const backgroundLuminance = background.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
  return (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05);
}

function hasVisibleAlpha(color: string) {
  if (color === 'transparent') return false;
  const slashAlpha = color.match(/\/\s*([\d.]+)\s*\)$/)?.[1];
  if (slashAlpha !== undefined) return Number(slashAlpha) > 0;
  const rgbaAlpha = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/i)?.[1];
  return rgbaAlpha === undefined || Number(rgbaAlpha) > 0;
}

async function contrastRatio(locator: import('playwright').Locator) {
  return locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    context.fillStyle = getComputedStyle(element).color;
    context.fillRect(0, 0, 1, 1);
    const foreground = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    const background = [255, 255, 255];
    const backgroundColors = [getComputedStyle(document.documentElement).backgroundColor];
    for (const ancestor of ancestors) backgroundColors.push(getComputedStyle(ancestor).backgroundColor);
    for (const color of backgroundColors) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const layer = Array.from(context.getImageData(0, 0, 1, 1).data);
      const alpha = layer[3] / 255;
      for (let index = 0; index < 3; index += 1) background[index] = layer[index] * alpha + background[index] * (1 - alpha);
    }
    let textLuminance = 0;
    let backgroundLuminance = 0;
    const weights = [0.2126, 0.7152, 0.0722];
    for (let index = 0; index < 3; index += 1) {
      const textValue = foreground[index] / 255;
      const backgroundValue = background[index] / 255;
      const linearText = textValue <= 0.04045 ? textValue / 12.92 : ((textValue + 0.055) / 1.055) ** 2.4;
      const linearBackground = backgroundValue <= 0.04045 ? backgroundValue / 12.92 : ((backgroundValue + 0.055) / 1.055) ** 2.4;
      textLuminance += weights[index] * linearText;
      backgroundLuminance += weights[index] * linearBackground;
    }
    return (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05);
  });
}

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','topics-list-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(req.query.theme === 'dark' ? 'dark' : 'light')});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics');</script>`));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/topics', (req, res) => {
  const isBoardRequest = Number(req.query.limit) >= 200;
  const data = topicExists ? (isBoardRequest ? [topic, boardAuditTopic] : [topic]) : [];
  return res.json({ data, total: topicExists ? 31 : 30, page: 1, limit: Number(req.query.limit) || 15 });
});
app.post('/api/topics/:id/audit', async (req, res) => {
  if (Number(req.params.id) === boardAuditTopic.id) {
    boardAuditAttempts += 1;
    if (holdNextBoardAudit) {
      holdNextBoardAudit = false;
      boardAuditStartedCallback?.();
      boardAuditStartedCallback = null;
      await new Promise<void>((resolve) => { releaseBoardAudit = resolve; });
      releaseBoardAudit = null;
    }
    boardAuditWrites += 1;
    boardAuditTopic.status = String(req.body?.status);
    return res.json({ message: '审核结果已保存' });
  }
  return res.status(404).json({ message: '选题不存在' });
});
app.delete('/api/topics/:id', (_req, res) => {
  if (failNextTopicDelete) {
    failNextTopicDelete = false;
    return res.status(503).json({ message: '模拟删除失败' });
  }
  topicExists = false;
  return res.json({ message: '选题已删除' });
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

if (process.env.XMT_TOPICS_RESPONSIVE_QA_SERVE === '1') {
  console.log(`Isolated Topics responsive QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  await page.goto(`${base}/__qa`);
  await page.getByRole('table').getByText('创作中', { exact: true }).waitFor();
  await page.getByRole('heading', { name: '选题管理' }).waitFor();
  await page.getByRole('textbox', { name: '搜索选题标题或描述' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '搜索选题标题或描述' }).getAttribute('id'), 'topics-search');
  assert.equal(await page.getByRole('textbox', { name: '搜索选题标题或描述' }).getAttribute('name'), 'topicsSearch');
  const statusFilter = page.getByRole('combobox', { name: '按状态筛选选题' });
  await statusFilter.waitFor();
  assert.equal(await statusFilter.getAttribute('id'), 'topics-status-filter');
  assert.equal(await statusFilter.getAttribute('name'), 'topicsStatusFilter');
  await page.getByRole('button', { name: topic.title, exact: true }).waitFor();
  const lightCurrentPage = page.getByRole('button', { name: '1', exact: true });
  await lightCurrentPage.waitFor();
  assert.ok((await lightCurrentPage.getAttribute('class'))?.includes('bg-studio-primary-button'), 'active pagination uses the theme-aware primary-button token');
  assert.ok((await elementBackgroundContrast(lightCurrentPage)) >= 4.5, 'light theme current page number maintains at least 4.5:1 contrast');

  const boardPage = await context.newPage();
  boardPage.setDefaultTimeout(5000);
  boardPage.on('pageerror', (error) => errors.push(error.message));
  boardPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await boardPage.goto(`${base}/__qa`);
  await boardPage.getByRole('heading', { name: '选题管理' }).waitFor();
  await boardPage.goto(`${base}/topics?view=board`);
  for (const [name, id, controlName] of [
    ['看板平台筛选', 'topics-board-platform-filter', 'topicsBoardPlatformFilter'],
    ['看板负责人筛选', 'topics-board-assignee-filter', 'topicsBoardAssigneeFilter'],
  ]) {
    const filter = boardPage.getByRole('combobox', { name });
    await filter.waitFor();
    assert.equal(await filter.getAttribute('id'), id);
    assert.equal(await filter.getAttribute('name'), controlName);
  }
  const boardAuditCard = boardPage.locator('article').filter({ hasText: boardAuditTopic.title });
  const boardAuditAttemptsBefore = boardAuditAttempts;
  let resolveBoardAuditStarted!: () => void;
  const boardAuditStarted = new Promise<void>((resolve) => { resolveBoardAuditStarted = resolve; });
  boardAuditStartedCallback = resolveBoardAuditStarted;
  holdNextBoardAudit = true;
  await boardAuditCard.getByRole('button', { name: '通过', exact: true }).click();
  await boardAuditStarted;
  const pendingBoardAuditButtons = boardAuditCard.getByRole('button', { name: '处理中…', exact: true });
  await pendingBoardAuditButtons.first().waitFor();
  assert.equal(await pendingBoardAuditButtons.count(), 2, 'all stage changes for the same topic expose one in-flight state');
  assert.equal(await pendingBoardAuditButtons.nth(0).isDisabled(), true, 'the in-flight board audit action is disabled');
  assert.equal(await pendingBoardAuditButtons.nth(1).isDisabled(), true, 'a second transition for the topic is disabled');
  assert.equal(boardAuditAttempts, boardAuditAttemptsBefore + 1, 'the board starts only one audit request for the topic');
  releaseBoardAudit?.();
  releaseBoardAudit = null;
  await boardPage.getByText('状态已更新', { exact: true }).waitFor();
  assert.equal(boardAuditTopic.status, 'approved', 'the delayed board audit updates the isolated topic after confirmation');
  assert.equal(boardAuditWrites, 1, 'the board audit is written exactly once');
  assert.equal(boardAuditAttempts, boardAuditAttemptsBefore + 1, 'the board does not issue a duplicate audit write');
  await boardPage.close();

  boardAuditTopic.status = 'pending';
  const mobileBoard = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobileBoard.setDefaultTimeout(5000);
  mobileBoard.on('pageerror', (error) => errors.push(error.message));
  mobileBoard.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mobileBoard.goto(`${base}/__qa`);
  await mobileBoard.getByRole('textbox', { name: '搜索选题' }).waitFor();
  await mobileBoard.goto(`${base}/topics?view=board`);
  const mobileBoardAuditCard = mobileBoard.locator('article').filter({ hasText: boardAuditTopic.title });
  let resolveMobileBoardAuditStarted!: () => void;
  const mobileBoardAuditStarted = new Promise<void>((resolve) => { resolveMobileBoardAuditStarted = resolve; });
  boardAuditStartedCallback = resolveMobileBoardAuditStarted;
  holdNextBoardAudit = true;
  const mobileAttemptsBefore = boardAuditAttempts;
  await mobileBoardAuditCard.getByRole('button', { name: '通过', exact: true }).click();
  await mobileBoardAuditStarted;
  const pendingMobileBoardButtons = mobileBoardAuditCard.getByRole('button', { name: '处理中…', exact: true });
  await pendingMobileBoardButtons.first().waitFor();
  assert.equal(await pendingMobileBoardButtons.count(), 2, 'mobile board blocks all transitions for the in-flight topic');
  assert.ok(await pendingMobileBoardButtons.nth(0).isDisabled() && await pendingMobileBoardButtons.nth(1).isDisabled(), 'mobile board transition buttons are disabled until confirmation');
  assert.equal(boardAuditAttempts, mobileAttemptsBefore + 1, 'the mobile board starts one audit request');
  releaseBoardAudit?.();
  releaseBoardAudit = null;
  await mobileBoard.getByText('状态已更新', { exact: true }).waitFor();
  assert.equal(boardAuditTopic.status, 'approved', 'the mobile board applies the confirmed audit result');
  assert.equal(boardAuditWrites, 2, 'desktop and mobile board audits each write exactly once');
  assert.equal(boardAuditAttempts, mobileAttemptsBefore + 1, 'the mobile board does not issue a duplicate audit write');
  await mobileBoard.close();

  const darkContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const darkPage = await darkContext.newPage();
  darkPage.on('pageerror', (error) => errors.push(error.message));
  darkPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await darkPage.goto(`${base}/__qa?theme=dark`);
  await darkPage.getByRole('heading', { name: '选题管理' }).waitFor();
  const darkCurrentPage = darkPage.getByRole('button', { name: '1', exact: true });
  await darkCurrentPage.waitFor();
  assert.ok((await darkCurrentPage.getAttribute('class'))?.includes('bg-studio-primary-button'), 'dark active pagination uses the theme-aware primary-button token');
  const darkContrast = await elementBackgroundContrast(darkCurrentPage);
  assert.ok(darkContrast >= 4.5, `dark theme current page number maintains at least 4.5:1 contrast; received ${darkContrast.toFixed(2)}:1`);

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
      await page.evaluate((value) => { document.documentElement.style.zoom = `${value * 100}%`; }, zoom);
      for (const name of ['查看', '删除']) {
        const accessibleName = name === '查看' ? `查看选题 ${topic.title}` : `删除选题 ${topic.title}`;
        const button = page.locator('tbody').getByRole('button', { name: accessibleName, exact: true }).first();
        await button.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
        const geometry = await button.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const clippedBy: string[] = [];
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            const ancestorRect = ancestor.getBoundingClientRect();
            const clipsX = ['hidden', 'clip'].includes(style.overflowX);
            const clipsY = ['hidden', 'clip'].includes(style.overflowY);
            if ((clipsX && (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1))
              || (clipsY && (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1))) {
              clippedBy.push(`${ancestor.tagName}.${String(ancestor.className)}`);
            }
          }
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            display: getComputedStyle(element).display,
            visibility: getComputedStyle(element).visibility,
            opacity: Number(getComputedStyle(element).opacity),
            clippedBy,
          };
        });
        assert.ok(geometry.width > 0 && geometry.height > 0, `${name} has a layout box at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
        assert.notEqual(geometry.display, 'none', `${name} is not hidden at ${viewport.width}px / ${zoom * 100}%`);
        assert.notEqual(geometry.visibility, 'hidden', `${name} is visible at ${viewport.width}px / ${zoom * 100}%`);
        assert.ok(geometry.opacity >= 0.69, `${name} remains visually discoverable before hover at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
        assert.deepEqual(geometry.clippedBy, [], `${name} is not clipped at ${viewport.width}px / ${zoom * 100}%`);
        assert.ok(geometry.x >= -1 && geometry.x + geometry.width <= geometry.viewportWidth + 1, `${name} stays within the viewport at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
      }
      const nextStep = page.locator('tbody').getByRole('button', { name: '进入创作', exact: true });
      const nextStepGeometry = await nextStep.evaluate((element) => {
        const nextRect = element.getBoundingClientRect();
        const row = element.closest('tr');
        const actionRect = row?.querySelector('td:last-child')?.getBoundingClientRect();
        const overlap = actionRect ? Math.max(0, Math.min(nextRect.right, actionRect.right) - Math.max(nextRect.left, actionRect.left)) : 0;
        return { x: nextRect.x, width: nextRect.width, right: nextRect.right, overlapWithStickyActions: overlap, viewportWidth: window.innerWidth };
      });
      assert.ok(nextStepGeometry.overlapWithStickyActions <= 1, `下一步按钮必须避开固定操作列 at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(nextStepGeometry)}`);
      const workflowCell = page.locator('tbody tr').filter({ hasText: topic.title }).first().locator('td').nth(6);
      const renderedStageLabels = await workflowCell.locator('span').filter({ hasText: /^(审核|通过|创作|成片|发布|完成)$/ }).evaluateAll((elements) => elements.map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return { label: element.textContent?.trim(), lineCount: range.getClientRects().length };
      }));
      assert.deepEqual(renderedStageLabels.map((stage) => stage.label), ['审核', '通过', '创作', '成片', '发布', '完成']);
      assert.deepEqual(renderedStageLabels.map((stage) => stage.lineCount), [1, 1, 1, 1, 1, 1], `选题流程阶段文字须保持单行 at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(renderedStageLabels)}`);
    }
  }

  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.setViewportSize({ width: 1366, height: 768 });
  const topicTitle = page.getByRole('button', { name: topic.title, exact: true });
  await topicTitle.hover();
  await page.waitForTimeout(250);
  const titleContrast = await textContrast(topicTitle);
  assert.ok(titleContrast.ratio >= 4.5, `选题标题悬停文字需保持 4.5:1 对比度，实际 ${titleContrast.ratio.toFixed(2)}:1 on ${titleContrast.rowBackground}`);
  const sortButton = page.locator('thead th button').filter({ hasText: '选题' });
  await sortButton.hover();
  await page.waitForTimeout(250);
  const sortContrast = await textContrast(sortButton);
  assert.ok(sortContrast.ratio >= 4.5, `选题列表排序表头悬停文字需保持 4.5:1 对比度，实际 ${sortContrast.ratio.toFixed(2)}:1 on ${sortContrast.rowBackground}`);
  const darkTopicTitle = darkPage.getByRole('button', { name: topic.title, exact: true });
  await darkTopicTitle.hover();
  const darkTitleContrast = await textContrast(darkTopicTitle);
  assert.ok(darkTitleContrast.ratio >= 4.5, `深色主题选题标题悬停文字需保持 4.5:1 对比度，实际 ${darkTitleContrast.ratio.toFixed(2)}:1 on ${darkTitleContrast.rowBackground}`);
  const darkSortButton = darkPage.locator('thead th button').filter({ hasText: '选题' });
  await darkSortButton.hover();
  const darkSortContrast = await textContrast(darkSortButton);
  assert.ok(darkSortContrast.ratio >= 4.5, `深色主题排序表头悬停文字需保持 4.5:1 对比度，实际 ${darkSortContrast.ratio.toFixed(2)}:1 on ${darkSortContrast.rowBackground}`);

  const lightDeleteAction = page.getByRole('button', { name: `删除选题 ${topic.title}` });
  await lightDeleteAction.hover();
  const lightDeleteBackground = await lightDeleteAction.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(hasVisibleAlpha(lightDeleteBackground), `light theme topic delete hover applies a visible semantic background; received ${lightDeleteBackground}`);
  assert.ok(await contrastRatio(lightDeleteAction.locator('svg')) >= 3, 'light theme hovered topic delete icon maintains at least 3:1 contrast');
  const lightViewAction = page.getByRole('button', { name: `查看选题 ${topic.title}` });
  await lightViewAction.hover();
  const lightViewBackground = await lightViewAction.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(hasVisibleAlpha(lightViewBackground), 'light theme topic view hover applies a visible surface');
  assert.ok(await contrastRatio(lightViewAction.locator('svg')) >= 3, 'light theme hovered topic view icon maintains at least 3:1 contrast');

  const darkDeleteAction = darkPage.getByRole('button', { name: `删除选题 ${topic.title}` });
  await darkDeleteAction.hover();
  const darkDeleteBackground = await darkDeleteAction.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(hasVisibleAlpha(darkDeleteBackground), `dark theme topic delete hover applies a visible semantic background; received ${darkDeleteBackground}`);
  assert.ok(await contrastRatio(darkDeleteAction.locator('svg')) >= 3, 'dark theme hovered topic delete icon maintains at least 3:1 contrast');
  const darkViewAction = darkPage.getByRole('button', { name: `查看选题 ${topic.title}` });
  await darkViewAction.hover();
  const darkViewBackground = await darkViewAction.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(hasVisibleAlpha(darkViewBackground), 'dark theme topic view hover applies a visible surface');
  assert.ok(await contrastRatio(darkViewAction.locator('svg')) >= 3, 'dark theme hovered topic view icon maintains at least 3:1 contrast');

  for (const [qaPage, theme] of [[page, 'light'], [darkPage, 'dark']] as const) {
    const selectTopic = qaPage.getByRole('button', { name: `选择选题：${topic.title}` });
    assert.equal(await selectTopic.getAttribute('aria-pressed'), 'false', `${theme} theme topic selection control starts unselected`);
    await selectTopic.click();
    assert.equal(await selectTopic.getAttribute('aria-pressed'), 'true', `${theme} theme topic selection control exposes its selected state`);
    const rejectAction = qaPage.getByRole('button', { name: '驳回', exact: true });
    const deleteAction = qaPage.getByRole('button', { name: '删除', exact: true });
    for (const [action, label] of [[rejectAction, 'reject'], [deleteAction, 'delete']] as const) {
      const beforeHover = await action.evaluate((element) => getComputedStyle(element).backgroundColor);
      await action.hover();
      const hoverBackground = await action.evaluate((element) => getComputedStyle(element).backgroundColor);
      assert(hasVisibleAlpha(hoverBackground) && hoverBackground !== beforeHover, `${theme} bulk ${label} action applies a visible hover change`);
      assert.ok(await contrastRatio(action) >= 4.5, `${theme} bulk ${label} action text maintains at least 4.5:1 contrast`);
    }
    await qaPage.getByRole('button', { name: '取消选择', exact: true }).click();
    assert.equal(await qaPage.getByRole('button', { name: '驳回', exact: true }).count(), 0, `${theme} bulk actions hide when selection is canceled`);
  }

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    await page.getByRole('heading', { name: '选题管理' }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `Topics page fits a ${width}px viewport without page-level horizontal overflow`);
    const tableScroller = page.locator('table').locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")]').first();
    await tableScroller.evaluate((element) => { element.scrollLeft = 0; });
    await page.getByRole('button', { name: `选择选题：${topic.title}` }).click();
    const selectionToolbar = page.getByText('已选 1 个选题', { exact: true }).locator('..');
    await selectionToolbar.waitFor();
    const toolbarBox = await selectionToolbar.boundingBox();
    assert(toolbarBox && toolbarBox.x >= 0 && toolbarBox.x + toolbarBox.width <= width + 1, `selected-topic toolbar stays within the ${width}px viewport: ${JSON.stringify(toolbarBox)}`);
    for (const label of ['通过', '驳回', '删除', '取消选择']) {
      const action = selectionToolbar.getByRole('button', { name: label, exact: true });
      const box = await action.boundingBox();
      assert(box && box.width > 0 && box.x >= 0 && box.x + box.width <= width + 1, `bulk ${label} action stays visible in the ${width}px viewport: ${JSON.stringify(box)}`);
    }
    await selectionToolbar.getByRole('button', { name: '取消选择', exact: true }).click();
    assert.equal(await page.getByText('已选 1 个选题', { exact: true }).count(), 0, `selection toolbar closes after cancel at ${width}px`);
    await tableScroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    for (const label of [`查看选题 ${topic.title}`, `删除选题 ${topic.title}`]) {
      const action = page.getByRole('button', { name: label });
      const box = await action.boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width + 1, `${label} stays visible in the sticky action column at ${width}px`);
    }
  }

  await page.getByRole('button', { name: `删除选题 ${topic.title}` }).click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  failNextTopicDelete = true;
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除失败', { exact: true }).waitFor();
  assert.equal(topicExists, true, 'failed topic deletion leaves the isolated topic intact');
  assert.equal(await page.getByRole('heading', { name: '确认删除', exact: true }).count(), 1, 'failed topic deletion keeps its confirmation open for retry');
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除成功', { exact: true }).waitFor();
  assert.equal(topicExists, false, 'successful topic deletion removes the isolated topic');
  assert.equal(await page.getByRole('button', { name: topic.title, exact: true }).count(), 0, 'successful topic deletion removes its row from the list');

  await page.screenshot({ path: '/tmp/xmt-topics-list-responsive-1366.png', fullPage: true });
  assert.deepEqual(errors, [], 'Topics list should render without browser errors');
  assert.equal(expectedHttpErrors.length, 1, 'the isolated topic deletion fixture returns one intentional 503 response');
  await context.close();
  await darkContext.close();
  console.log('Topics list responsive browser test passed: topic board transition locking at desktop/mobile widths, sticky actions, and desktop zoom matrix.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
