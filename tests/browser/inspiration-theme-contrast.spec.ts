import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Locator, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const user = { id: 1, username: 'inspiration-theme-qa', name: '灵感主题验收', role: 'admin', enabled: true, force_change_password: false };
const inspiration = {
  id: 901,
  title: '主题回归：新评论提示',
  description: '隔离浏览器夹具，不写入业务数据库。',
  category: '故事',
  status: 'active',
  votes: 3,
  creator_id: user.id,
  creator_name: user.name,
  comment_count: 0,
  created_at: '2026-10-08T00:00:00.000Z',
  updated_at: '2026-10-08T00:00:00.000Z',
};
let inspirations = [{ ...inspiration, voted: false }];
let createWriteRequests = 0;
let inspirationListReadRequests = 0;
let nextCreatedInspirationId = 902;

async function contrast(locator: Locator) {
  const styles = await locator.evaluate((element) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) backgrounds.push(getComputedStyle(current).backgroundColor);
    return { foreground: getComputedStyle(element).color, backgrounds };
  });
  function parseColor(value: string) {
    const channels = value.match(/[\d.]+/g)?.map(Number) || [];
    return channels.length >= 3 ? [channels[0], channels[1], channels[2], channels[3] ?? 1] : null;
  }
  function luminance(color: number[]) {
    const red = color[0] / 255 <= 0.04045 ? color[0] / 255 / 12.92 : ((color[0] / 255 + 0.055) / 1.055) ** 2.4;
    const green = color[1] / 255 <= 0.04045 ? color[1] / 255 / 12.92 : ((color[1] / 255 + 0.055) / 1.055) ** 2.4;
    const blue = color[2] / 255 <= 0.04045 ? color[2] / 255 / 12.92 : ((color[2] / 255 + 0.055) / 1.055) ** 2.4;
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }
  const foreground = parseColor(styles.foreground);
  if (!foreground) return 0;
  const background = [255, 255, 255];
  for (const value of styles.backgrounds.reverse()) {
    const layer = parseColor(value);
    if (!layer) continue;
    for (let index = 0; index < 3; index += 1) background[index] = layer[index] * layer[3] + background[index] * (1 - layer[3]);
  }
  const textLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05);
}

async function waitForInspirationRoom(io: SocketServer) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ((io.sockets.adapter.rooms.get('inspirations')?.size || 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.fail('浏览器没有加入灵感实时更新房间');
}

async function assertHoverSurface(page: Page, locator: Locator, label: string) {
  if (await locator.count() === 0) {
    const visibleButtons = await page.locator('main button').allTextContents();
    throw new Error(`${label} hover target was not found; visible buttons: ${JSON.stringify(visibleButtons)}`);
  }
  const before = await locator.evaluate((element) => getComputedStyle(element).backgroundColor);
  try {
    await locator.hover();
  } catch (cause) {
    const visibleButtons = await page.locator('main button').allTextContents();
    throw new Error(`${label} hover target was unavailable; visible buttons: ${JSON.stringify(visibleButtons)}; ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  await page.waitForTimeout(240);
  const after = await locator.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert.notEqual(after, before, `${label} must render a visible hover surface`);
  const ratio = await contrast(locator);
  assert.ok(ratio >= 4.5, `${label} hover text contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
}

async function assertTailwindAlphaUtilities(page: Page, theme: string) {
  await page.evaluate(() => {
    const probe = document.createElement('button');
    probe.type = 'button';
    probe.id = 'studio-alpha-utility-probe';
    probe.className = 'border border-studio-border-soft/25 bg-studio-surface-soft/50 text-studio-primary/80 transition hover:bg-studio-coral/10';
    probe.textContent = '令牌透明度';
    probe.style.cssText = 'position:fixed;left:0;bottom:0;z-index:999999;padding:8px';
    const elevatedProbe = document.createElement('span');
    elevatedProbe.id = 'studio-elevated-opacity-probe';
    elevatedProbe.className = 'block h-2 w-2 transition hover:bg-studio-surface-elevated/65';
    probe.append(elevatedProbe);
    document.body.append(probe);
  });
  const probe = page.locator('#studio-alpha-utility-probe');
  const initial = await probe.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderTopColor,
    text: getComputedStyle(element).color,
  }));
  await probe.hover();
  await page.waitForTimeout(240);
  const hovered = await probe.evaluate((element) => getComputedStyle(element).backgroundColor);
  const initialNumbers = initial.background.match(/[\d.]+/g)?.map(Number) || [];
  const borderNumbers = initial.border.match(/[\d.]+/g)?.map(Number) || [];
  const textNumbers = initial.text.match(/[\d.]+/g)?.map(Number) || [];
  const hoverNumbers = hovered.match(/[\d.]+/g)?.map(Number) || [];
  assert.ok(initialNumbers.length >= 4 && initialNumbers[3] > 0 && initialNumbers[3] < 1, `${theme} surface opacity utility did not render: ${initial.background}`);
  assert.ok(borderNumbers.length >= 4 && borderNumbers[3] > 0 && borderNumbers[3] < 1, `${theme} border opacity utility did not render: ${initial.border}`);
  assert.ok(textNumbers.length >= 4 && Math.abs(textNumbers[3] - 0.8) < 0.01, `${theme} text opacity utility did not render: ${initial.text}`);
  assert.ok(hoverNumbers.length >= 4 && Math.abs(hoverNumbers[3] - 0.1) < 0.01, `${theme} hover opacity utility did not render: ${hovered}`);
  const elevatedProbe = page.locator('#studio-elevated-opacity-probe');
  await elevatedProbe.hover();
  await page.waitForTimeout(240);
  const elevatedBackground = await elevatedProbe.evaluate((element) => getComputedStyle(element).backgroundColor);
  const elevatedNumbers = elevatedBackground.match(/[\d.]+/g)?.map(Number) || [];
  assert.ok(elevatedNumbers.length >= 4 && Math.abs(elevatedNumbers[3] - 0.65) < 0.01, `${theme} elevated surface opacity utility did not render: ${elevatedBackground}`);
  await probe.evaluate((element) => element.remove());
}

async function assertStudioColorAliases(page: Page, theme: string) {
  await page.evaluate(() => {
    const legacy = document.createElement('div');
    legacy.id = 'studio-color-alias-probe';
    legacy.className = 'bg-studio-bg text-studio-text';
    const canonical = document.createElement('div');
    canonical.id = 'studio-color-canonical-probe';
    canonical.className = 'bg-studio-app-bg text-studio-text-primary';
    const aliasTokens = [
      ['bg-studio-card', 'bg-studio-surface-glass'],
      ['border border-studio-border', 'border border-studio-border-soft'],
      ['border border-studio-border-strong', 'border border-studio-border-active'],
      ['text-studio-danger', 'text-studio-coral'],
      ['text-studio-emerald', 'text-studio-success'],
    ];
    for (const [alias, canonicalToken] of aliasTokens) {
      const aliasElement = document.createElement('span');
      aliasElement.className = alias;
      const canonicalElement = document.createElement('span');
      canonicalElement.className = canonicalToken;
      legacy.append(aliasElement);
      canonical.append(canonicalElement);
    }
    document.body.append(legacy, canonical);
  });
  const colors = await page.evaluate(() => {
    const aliases = document.getElementById('studio-color-alias-probe')!;
    const canonical = document.getElementById('studio-color-canonical-probe')!;
    const aliasStyle = getComputedStyle(aliases);
    const canonicalStyle = getComputedStyle(canonical);
    const aliasChildren = [];
    const canonicalChildren = [];
    for (const element of Array.from(aliases.children)) {
      const style = getComputedStyle(element);
      aliasChildren.push({ backgroundColor: style.backgroundColor, borderTopColor: style.borderTopColor, color: style.color });
    }
    for (const element of Array.from(canonical.children)) {
      const style = getComputedStyle(element);
      canonicalChildren.push({ backgroundColor: style.backgroundColor, borderTopColor: style.borderTopColor, color: style.color });
    }
    return {
      aliases: { backgroundColor: aliasStyle.backgroundColor, color: aliasStyle.color, children: aliasChildren },
      canonical: { backgroundColor: canonicalStyle.backgroundColor, color: canonicalStyle.color, children: canonicalChildren },
    };
  });
  assert.deepEqual(colors.aliases, colors.canonical, `${theme} legacy studio color utilities must resolve to their canonical Studio Atelier tokens`);
  await page.evaluate(() => {
    document.getElementById('studio-color-alias-probe')?.remove();
    document.getElementById('studio-color-canonical-probe')?.remove();
  });
}

async function run() {
  let apiWriteRequests = 0;
  let voteWriteRequests = 0;
  let failNextVote = false;
  let delayNextVote = false;
  const app = express();
  app.use(express.json());
  app.get('/__qa', (request, response) => {
    const theme = request.query.theme === 'dark' ? 'dark' : 'light';
    response.type('html').send(`<script>
      localStorage.setItem('xmt_user', ${JSON.stringify(JSON.stringify(user))});
      localStorage.setItem('xmt_token', 'inspiration-theme-fixture');
      localStorage.setItem('xmt_theme', ${JSON.stringify(theme)});
      localStorage.setItem('xmt_last_version_seen', ${JSON.stringify(version)});
      location.replace('/inspirations');
    </script>`);
  });
  app.get('/api/auth/me', (_request, response) => response.json(user));
  app.get('/api/permissions/my', (_request, response) => response.json(['inspiration:promote', 'inspiration:delete']));
  app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
  app.get(['/api/system-settings', '/api/system-settings/public'], (_request, response) => response.json({}));
  app.get('/api/inspirations', (_request, response) => {
    inspirationListReadRequests += 1;
    return response.json({ data: inspirations, total: inspirations.length });
  });
  app.post('/api/inspirations', async (request, response) => {
    createWriteRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 180));
    const created = {
      ...inspiration,
      id: nextCreatedInspirationId++,
      title: String(request.body.title),
      description: String(request.body.description || ''),
      category: String(request.body.category || '其他'),
      votes: 0,
      comment_count: 0,
      voted: false,
    };
    inspirations = [created, ...inspirations];
    return response.json({ message: '灵感创建成功', id: created.id, inspiration: created });
  });
  app.post('/api/inspirations/:id/vote', async (_request, response) => {
    voteWriteRequests += 1;
    if (failNextVote) {
      failNextVote = false;
      return response.status(503).json({ message: '模拟投票保存失败' });
    }
    if (delayNextVote) {
      delayNextVote = false;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    inspiration.votes += 1;
    return response.json({ message: '投票成功', voted: true });
  });
  app.use('/api', (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') apiWriteRequests += 1;
    response.json({ data: [], total: 0, page: 1, limit: 20 });
  });

  const server = http.createServer(app);
  const io = new SocketServer(server);
  io.on('connection', (socket) => {
    socket.on('join', (room: string) => socket.join(room));
    socket.on('leave', (room: string) => socket.leave(room));
  });
  app.get('/__qa/emit-comment', (_request, response) => {
    io.to('inspirations').emit('inspiration:commented', {
      inspirationId: inspiration.id,
      comment: { id: 9901, inspiration_id: inspiration.id, creator_id: 2, creator_name: '同事', content: '新增评论', created_at: '2026-10-08T00:01:00.000Z' },
      comment_count: 1,
    });
    response.json({ emitted: true });
  });
  const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
  app.use(vite.middlewares);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  if (process.env.XMT_INSPIRATION_THEME_QA_SERVE === '1') {
    console.log(`Isolated inspiration theme QA fixture: ${base}/__qa?theme=light`);
    await new Promise(() => {});
  }
  const browser = await chromium.launch({ headless: true });
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];

  try {
    for (const width of [320, 390, 1440]) {
      for (const theme of ['light', 'dark'] as const) {
        inspiration.votes = 3;
        inspiration.voted = false;
        inspirations = [{ ...inspiration, voted: false }];
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.setDefaultTimeout(7_000);
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() !== 'error') return;
          if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
          else errors.push(message.text());
        });

        await page.goto(`${base}/__qa?theme=${theme}`);
        await page.getByRole('heading', { name: '灵感池' }).waitFor();
        await page.getByRole('heading', { name: inspiration.title }).waitFor();
        await assertTailwindAlphaUtilities(page, theme);
        await assertStudioColorAliases(page, theme);
        await waitForInspirationRoom(io);
        io.to('inspirations').emit('inspiration:commented', {
          inspirationId: inspiration.id,
          comment: { id: 9901, inspiration_id: inspiration.id, creator_id: 2, creator_name: '同事', content: '新增评论', created_at: '2026-10-08T00:01:00.000Z' },
          comment_count: 1,
        });

        const card = page.getByRole('heading', { name: inspiration.title }).locator('xpath=ancestor::div[@role="button"]');
        const badge = card.getByText('有新评论', { exact: true });
        await badge.waitFor({ state: 'visible' });
        assert.ok((await badge.getAttribute('class'))?.includes('bg-studio-cyan-soft'), `${theme} theme uses the semantic comment surface`);
        const ratio = await contrast(badge);
        assert.ok(ratio >= 4.5, `${theme} ${width}px new-comment label contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${theme} ${width}px inspiration page must not overflow horizontally`);
        assert.equal(await card.getByRole('button', { name: '转为选题', exact: true }).isVisible(), true, `${theme} ${width}px promotion action is visible`);
        assert.equal(await page.getByRole('textbox', { name: '搜索灵感', exact: true }).isVisible(), true, 'inspiration search has an accessible name');
        assert.equal(await page.getByRole('combobox', { name: '按分类筛选灵感', exact: true }).isVisible(), true, 'category filter has an accessible name');
        await assertHoverSurface(page, card.getByRole('button', { name: '3', exact: true }), `${theme} 点赞`);
        await assertHoverSurface(page, card.getByRole('button', { name: '1', exact: true }), `${theme} 评论`);
        await assertHoverSurface(page, card.getByRole('button', { name: '转为选题', exact: true }), `${theme} 转为选题`);

        if (width === 320 && theme === 'light') {
          failNextVote = true;
          const vote = card.getByRole('button', { name: '3', exact: true });
          const failedVote = page.waitForResponse((response) => response.url().endsWith(`/api/inspirations/${inspiration.id}/vote`) && response.request().method() === 'POST' && response.status() === 503);
          await vote.click();
          await failedVote;
          await page.getByText('投票未保存，点赞状态已恢复，请稍后重试。', { exact: true }).waitFor();
          await page.waitForFunction(() => Array.from(document.querySelectorAll('main button[aria-pressed]')).some((button) => button.textContent?.trim() === '3' && !(button as HTMLButtonElement).disabled));
          assert.equal(await card.getByRole('button', { name: '3', exact: true }).count(), 1, 'failed vote rolls the visible count back');
          await card.getByRole('button', { name: '3', exact: true }).click();
          await page.getByRole('button', { name: '4', exact: true }).waitFor();
          assert.equal(voteWriteRequests, 2, 'the isolated retry sends one additional vote request');

          await page.waitForFunction(() => Array.from(document.querySelectorAll('main button[aria-pressed]')).some((button) => button.textContent?.trim() === '4' && !(button as HTMLButtonElement).disabled));
          delayNextVote = true;
          const votedButton = card.getByRole('button', { name: '4', exact: true });
          const delayedVote = page.waitForResponse((response) => response.url().endsWith(`/api/inspirations/${inspiration.id}/vote`) && response.request().method() === 'POST' && response.status() === 200);
          await votedButton.evaluate((element) => {
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          });
          await delayedVote;
          await card.getByRole('button', { name: '3', exact: true }).waitFor();
          assert.equal(voteWriteRequests, 3, 'rapid repeated activation during a pending toggle sends only one vote request');
          assert.equal(await card.getByRole('button', { name: '3', exact: true }).getAttribute('aria-pressed'), 'false', 'one confirmed toggle updates the visible pressed state once');
        }

        await page.getByRole('button', { name: '提交灵感', exact: true }).click();
        assert.equal(await page.getByLabel('标题 *', { exact: true }).isVisible(), true, 'creation title is associated with its label');
        assert.equal(await page.getByLabel('描述', { exact: true }).isVisible(), true, 'creation description is associated with its label');
        assert.equal(await page.getByLabel('分类', { exact: true }).isVisible(), true, 'creation category is associated with its label');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${theme} ${width}px create dialog must not overflow horizontally`);
        if (width === 320 && theme === 'light') {
          const title = '隔离验收：创建后立即显示';
          const listReadsBeforeCreate = inspirationListReadRequests;
          await page.getByLabel('标题 *', { exact: true }).fill(title);
          await page.getByLabel('描述', { exact: true }).fill('由创建响应直接确认，不依赖实时广播。');
          const createResponse = page.waitForResponse((response) => response.url().endsWith('/api/inspirations') && response.request().method() === 'POST');
          await page.getByRole('button', { name: '提交', exact: true }).click();
          const submittingButton = page.locator('button[aria-busy="true"]');
          await submittingButton.waitFor({ state: 'visible' });
          assert.equal(await submittingButton.isDisabled(), true, 'submit button is disabled while the create request is pending');
          await submittingButton.evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
          await createResponse;
          await page.getByRole('heading', { name: title, exact: true }).waitFor();
          await page.getByText('提交成功', { exact: true }).waitFor();
          assert.equal(createWriteRequests, 1, 'rapid repeated activation sends only one create request');
          assert.equal(inspirationListReadRequests, listReadsBeforeCreate, 'the saved inspiration is rendered without depending on a follow-up list read');
          assert.equal(await page.getByRole('heading', { name: '提交灵感', exact: true }).count(), 0, 'confirmed creation closes the dialog');
        } else {
          await page.getByRole('button', { name: '取消', exact: true }).click();
        }

        if (width === 320 && theme === 'light') await page.screenshot({ path: '/tmp/xmt-inspiration-comment-light-320.png', fullPage: true });
        if (width === 1440 && theme === 'dark') await page.screenshot({ path: '/tmp/xmt-inspiration-comment-dark-1440.png', fullPage: true });
        await context.close();
      }
    }
    assert.deepEqual(errors, [], `unexpected browser errors: ${errors.slice(0, 5).join(' | ')}`);
    assert.equal(expectedHttpErrors.length, 1, 'the isolated vote failure fixture returns one intentional 503 response');
    assert.equal(voteWriteRequests, 3, 'the isolated vote test sends one failed request, one retry, and one request for the guarded repeated toggle');
    assert.equal(createWriteRequests, 1, 'the isolated create test sends one business write');
    assert.equal(apiWriteRequests, 0, 'other browser acceptance flows do not send business writes');
    console.log('灵感新评论提示亮暗主题对比、320/390/1440px可见性与横向溢出回归通过');
  } finally {
    await browser.close();
    await vite.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
}

run().catch((error) => {
  console.error(`[inspiration-theme-contrast] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
