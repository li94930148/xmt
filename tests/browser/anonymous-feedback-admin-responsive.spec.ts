import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const admin = { id: 98, username: 'anonymous-feedback-responsive-qa', role: 'admin', name: '匿名意见管理验收', enabled: true, force_change_password: false };
const feedback = {
  id: 981,
  type: 'process',
  content: '验证窄屏下管理操作仍可见。',
  need_reply: true,
  reply_content: null,
  status: 'pending',
  is_public: true,
  created_at: '2026-10-08 09:00:00',
  updated_at: '2026-10-08 09:00:00',
};
let storedFeedback = { ...feedback };
let feedbackPresent = true;
let failNextFeedbackUpdate = false;
let failNextFeedbackListGet = false;
let feedbackUpdateCount = 0;
let feedbackDeleteCount = 0;
let feedbackListGetCount = 0;

function luminance(rgb: number[]) {
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function contrastRatio(locator: import('playwright').Locator) {
  const colors = await locator.evaluate((element) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) backgrounds.push(getComputedStyle(current).backgroundColor);
    return { foreground: getComputedStyle(element).color, backgrounds };
  });
  const foreground = colors.foreground.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
  if (foreground.length !== 3) return 0;
  let background = [255, 255, 255];
  for (const value of colors.backgrounds.reverse()) {
    const channels = value.match(/[\d.]+/g)?.map(Number) || [];
    if (channels.length < 3) continue;
    const alpha = channels[3] ?? 1;
    if (alpha <= 0) continue;
    background = channels.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
  }
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(admin))});localStorage.setItem('xmt_token','anonymous-feedback-admin-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/admin/anonymous-feedback');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(admin));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/admin/anonymous-feedback', (_req, res) => {
  feedbackListGetCount += 1;
  if (failNextFeedbackListGet) {
    failNextFeedbackListGet = false;
    return res.status(503).json({ message: '模拟列表刷新失败' });
  }
  return res.json({ data: feedbackPresent ? [{ ...storedFeedback }] : [] });
});
app.patch('/api/admin/anonymous-feedback/:id', (req, res) => {
  feedbackUpdateCount += 1;
  if (failNextFeedbackUpdate) {
    failNextFeedbackUpdate = false;
    res.status(503).json({ message: '模拟更新失败' });
    return;
  }
  storedFeedback = { ...storedFeedback, ...req.body, updated_at: new Date().toISOString() };
  res.json({ data: storedFeedback });
});
app.delete('/api/admin/anonymous-feedback/:id', (_req, res) => {
  feedbackDeleteCount += 1;
  feedbackPresent = false;
  res.sendStatus(204);
});
app.post('/__qa/reset', (_req, res) => {
  storedFeedback = { ...feedback };
  feedbackPresent = true;
  failNextFeedbackUpdate = false;
  failNextFeedbackListGet = false;
  res.sendStatus(204);
});
app.post('/__qa/fail-next-list-get', (_req, res) => {
  failNextFeedbackListGet = true;
  res.sendStatus(204);
});
app.get('/__qa/mutation-counts', (_req, res) => res.json({ feedbackUpdateCount, feedbackDeleteCount, feedbackListGetCount }));
app.use('/api', (_req, res) => res.json({ data: [] }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
const inspectionPort = Number(process.env.XMT_BROWSER_MCP_PORT) || 0;
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(inspectionPort, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      storedFeedback = { ...feedback };
      feedbackPresent = true;
      failNextFeedbackUpdate = false;
      failNextFeedbackListGet = false;
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
        else errors.push(message.text());
      });
      await page.goto(`${base}/__qa?theme=${theme}`);
      await page.getByRole('heading', { name: '匿名意见管理' }).waitFor();
      const actions = page.getByTestId(`feedback-row-actions-${feedback.id}`);
      await actions.waitFor();
      const geometry = await actions.evaluate((cell) => {
        const scrollArea = cell.closest('div.overflow-x-auto');
        const rect = cell.getBoundingClientRect();
        return {
          position: getComputedStyle(cell).position,
          cellLeft: rect.left,
          cellRight: rect.right,
          viewportWidth: document.documentElement.clientWidth,
          pageWidth: document.documentElement.scrollWidth,
          scrollAreaLeft: scrollArea?.getBoundingClientRect().left ?? -1,
          scrollAreaRight: scrollArea?.getBoundingClientRect().right ?? -1,
          buttons: [...cell.querySelectorAll('button')].map((button) => {
            const buttonRect = button.getBoundingClientRect();
            return { left: buttonRect.left, right: buttonRect.right };
          }),
        };
      });
      assert.equal(geometry.position, 'sticky', `${theme}/${width}px operation cell remains fixed during table scrolling`);
      const outerCardOverflow = await page.getByTestId('anonymous-feedback-admin-table-panel').evaluate((panel) => ({ x: getComputedStyle(panel).overflowX, y: getComputedStyle(panel).overflowY }));
      assert.deepEqual(outerCardOverflow, { x: 'visible', y: 'visible' }, `${theme}/${width}px outer card does not clip the responsive table shell`);
      assert.ok(geometry.cellLeft >= geometry.scrollAreaLeft - 1, `${theme}/${width}px actions are inside the left viewport edge`);
      assert.ok(geometry.cellRight <= geometry.scrollAreaRight + 1, `${theme}/${width}px actions are inside the right viewport edge: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.buttons.length >= 5 && geometry.buttons.every((button) => button.left >= geometry.scrollAreaLeft - 1 && button.right <= geometry.scrollAreaRight + 1), `${theme}/${width}px every row action is visible: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.pageWidth <= geometry.viewportWidth, `${theme}/${width}px page has no horizontal overflow`);
      assert.ok(await contrastRatio(page.getByText('待处理', { exact: true })) >= 4.5, `${theme}/${width}px status text contrast is at least 4.5:1`);
      assert.ok(await contrastRatio(actions.locator('button[title="删除"] svg')) >= 3, `${theme}/${width}px delete icon contrast is at least 3:1`);
      if (theme === 'dark' && width === 1440) {
        await actions.locator('button[title="标记处理中"]').click();
        await page.getByText('状态已更新', { exact: true }).waitFor();
        assert.equal(storedFeedback.status, 'processing', 'successful status mutation persists in the isolated fixture');

        await actions.locator('button[title="隐藏意见"]').click();
        await page.getByText('公开状态已更新', { exact: true }).waitFor();
        assert.equal(Number(storedFeedback.is_public), 0, 'successful visibility mutation persists in the isolated fixture');

        failNextFeedbackUpdate = true;
        await actions.locator('button[title="公开意见"]').click();
        await page.getByText('更新失败', { exact: true }).waitFor();
        assert.equal(Number(storedFeedback.is_public), 0, 'failed visibility mutation leaves the persisted state unchanged');
        assert.equal(await actions.locator('button[title="公开意见"]').count(), 1, 'the failed mutation does not optimistically change the row action');

        const updateCountBeforeRefreshFailure = feedbackUpdateCount;
        const getCountBeforeRefreshFailure = feedbackListGetCount;
        failNextFeedbackListGet = true;
        await actions.locator('button[title="标记完成"]').click();
        await page.getByRole('alert').filter({ hasText: '意见已标记为已完成' }).waitFor();
        assert.equal(storedFeedback.status, 'completed', 'the confirmed status change remains persisted when its list refresh fails');
        assert.equal(await page.getByText('已完成', { exact: true }).count(), 1, 'the confirmed status change remains visible locally');
        assert.equal(feedbackUpdateCount, updateCountBeforeRefreshFailure + 1, 'the confirmed status update is sent once');
        assert.equal(feedbackListGetCount, getCountBeforeRefreshFailure + 1, 'the status update is followed by one failed list read');
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await page.getByText('已完成', { exact: true }).waitFor();
        assert.equal(feedbackUpdateCount, updateCountBeforeRefreshFailure + 1, 'list retry does not repeat the status update');
        assert.equal(feedbackListGetCount, getCountBeforeRefreshFailure + 2, 'list retry adds only one GET');

        const updateCountBeforeVisibilityRefresh = feedbackUpdateCount;
        const getCountBeforeVisibilityRefresh = feedbackListGetCount;
        failNextFeedbackListGet = true;
        await actions.locator('button[title="公开意见"]').click();
        await page.getByRole('alert').filter({ hasText: '该条意见已公开' }).waitFor();
        assert.equal(Number(storedFeedback.is_public), 1, 'the confirmed visibility change remains persisted when its list refresh fails');
        assert.equal(await actions.locator('button[title="隐藏意见"]').count(), 1, 'the confirmed visibility change remains visible locally');
        assert.equal(feedbackUpdateCount, updateCountBeforeVisibilityRefresh + 1, 'the visibility update is sent once');
        assert.equal(feedbackListGetCount, getCountBeforeVisibilityRefresh + 1, 'the visibility update is followed by one failed list read');
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await actions.locator('button[title="隐藏意见"]').waitFor();
        assert.equal(feedbackUpdateCount, updateCountBeforeVisibilityRefresh + 1, 'list retry does not repeat the visibility update');
        assert.equal(feedbackListGetCount, getCountBeforeVisibilityRefresh + 2, 'visibility retry adds only one GET');

        const updateCountBeforeReply = feedbackUpdateCount;
        const getCountBeforeReply = feedbackListGetCount;
        failNextFeedbackListGet = true;
        await actions.locator('button[title="回复"]').click();
        await page.getByRole('heading', { name: '回复意见' }).waitFor();
        await page.getByRole('textbox').fill('已核实，安排在本周改进。');
        await page.getByRole('button', { name: '保存回复', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: '回复已保存，意见已标记为完成' }).waitFor();
        assert.equal(storedFeedback.reply_content, '已核实，安排在本周改进。', 'the confirmed reply remains saved when its list refresh fails');
        assert.equal(feedbackUpdateCount, updateCountBeforeReply + 1, 'the reply update is sent once');
        assert.equal(feedbackListGetCount, getCountBeforeReply + 1, 'the reply update is followed by one failed list read');
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await page.getByText(feedback.content, { exact: true }).waitFor();
        assert.equal(feedbackUpdateCount, updateCountBeforeReply + 1, 'list retry does not repeat the reply update');

      }
      await actions.locator('button[title="回复"]').click();
      await page.getByRole('heading', { name: '回复意见' }).waitFor();
      await page.getByRole('button', { name: '取消' }).click();
      await page.screenshot({ path: `/tmp/xmt-anonymous-feedback-admin-${theme}-${width}.png`, fullPage: true });
      if (theme === 'dark' && width === 1440) {
        const deleteCountBefore = feedbackDeleteCount;
        const getCountBeforeDelete = feedbackListGetCount;
        failNextFeedbackListGet = true;
        await actions.locator('button[title="删除"]').click();
        await page.getByRole('heading', { name: '删除意见' }).waitFor();
        await page.getByRole('button', { name: '删除', exact: true }).last().click();
        await page.getByRole('alert').filter({ hasText: '匿名意见已删除' }).waitFor();
        assert.equal(feedbackPresent, false, 'the delete operation is confirmed by the isolated server');
        assert.equal(await page.getByTestId(`feedback-row-actions-${feedback.id}`).count(), 0, 'the confirmed deleted row is removed before refresh completes');
        assert.equal(feedbackDeleteCount, deleteCountBefore + 1, 'the delete request is sent once');
        assert.equal(feedbackListGetCount, getCountBeforeDelete + 1, 'delete is followed by one failed list read');
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await page.getByText('暂无匿名意见', { exact: true }).waitFor();
        assert.equal(feedbackDeleteCount, deleteCountBefore + 1, 'list retry does not repeat the delete');
        assert.equal(feedbackListGetCount, getCountBeforeDelete + 2, 'delete retry adds only one GET');
      }
      if (theme === 'light' && width === 320) {
        failNextFeedbackListGet = true;
        await actions.locator('button[title="标记处理中"]').click();
        await page.getByRole('alert').filter({ hasText: '意见已标记为处理中' }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), '320px refresh warning does not cause horizontal overflow');
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await page.getByText('处理中', { exact: true }).waitFor();
      }
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'anonymous feedback admin has no browser errors');
  assert.equal(expectedHttpErrors.length, 6, 'the isolated update and refresh failure fixtures return exactly six intentional 503 responses');
  console.log('匿名意见管理亮/暗主题 × 320/390/1440px 操作可见与对比度回归通过');
  if (process.env.XMT_BROWSER_MCP_HOLD === '1') {
    console.log(`Local anonymous feedback browser MCP fixture ready at ${base}; press Ctrl-C to stop it.`);
    await new Promise<void>((resolve) => process.once('SIGINT', resolve));
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
  io.close();
}
