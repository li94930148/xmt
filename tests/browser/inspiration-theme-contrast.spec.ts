import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
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
let createPersistedRows = 0;
const inspirationIdsByRequestId = new Map<string, number>();
let deleteWriteRequests = 0;
let promoteWriteRequests = 0;
let commentWriteRequests = 0;
let inspirationListReadRequests = 0;
let nextCreatedInspirationId = 902;
let nextTopicId = 990;
let nextCommentId = 9902;
const commentRequestIds: string[] = [];
let commentsByInspirationId = new Map<number, Array<{ id: number; inspiration_id: number; creator_id: number; creator_name: string; content: string; created_at: string; client_request_id?: string }>>();
let failNextDelete = false;
let delayNextDelete = false;
let commitNextDeleteThenFailResponse = false;
let failNextDeleteStateRead = false;
let failNextPromotion = false;
let delayNextPromotion = false;
let failNextComment = false;
let delayNextComment = false;
let commentDelayMs = 180;

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

function getInspirationCard(page: Page, title: string) {
  return page.locator('article').filter({ hasText: title }).first();
}

function getInspirationDetailButton(card: Locator, title: string) {
  return card.getByRole('button', { name: `查看灵感详情：${title}`, exact: true });
}

async function closeNotifications(page: Page) {
  const closeNotification = page.getByRole('button', { name: '关闭通知', exact: true });
  while (await closeNotification.count() > 0) await closeNotification.first().click();
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
  const voteRequestIds: string[] = [];
  const voteRequests = new Map<string, { userId: number; inspirationId: number; requestedVoted: boolean }>();
  let commitNextCreateThenFailResponse = false;
  let failNextCreateStateRead = false;
  let failNextVote = false;
  let delayNextVote = false;
  let commitNextVoteThenFailResponse = false;
  let failNextVoteStateRead = false;
  let commitNextCommentThenFailResponse = false;
  let failNextCommentStateRead = false;
  let commitNextPromotionThenFailResponse = false;
  let failNextPromotionStateRead = false;
  const expectedHttpErrors: string[] = [];
  const topicVersionRequestPaths: string[] = [];
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
  app.get('/api/inspirations/create-request/:requestId', (request, response) => {
    if (failNextCreateStateRead) {
      failNextCreateStateRead = false;
      return response.status(503).json({ message: '模拟灵感创建状态读取失败' });
    }
    const id = inspirationIdsByRequestId.get(String(request.params.requestId).toLowerCase());
    const current = id === undefined ? undefined : inspirations.find((item) => item.id === id);
    if (!current) return response.status(404).json({ message: '尚未找到对应灵感' });
    return response.json({ id: current.id, inspiration: current });
  });
  app.get('/api/inspirations/vote-requests/:requestId', (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (failNextVoteStateRead) {
      failNextVoteStateRead = false;
      return response.status(503).json({ message: '模拟点赞请求状态读取失败' });
    }
    const stored = voteRequests.get(String(request.params.requestId).toLowerCase());
    if (!stored || stored.userId !== user.id) return response.status(404).json({ message: '尚未找到对应投票请求' });
    const current = inspirations.find((item) => item.id === stored.inspirationId);
    if (!current) return response.status(410).json({ deleted: true });
    return response.json({
      inspirationId: stored.inspirationId,
      processedVoted: stored.requestedVoted,
      voted: current.voted,
      votes: current.votes,
    });
  });
  app.get('/api/inspirations/:id', (request, response) => {
    if (failNextDeleteStateRead) {
      failNextDeleteStateRead = false;
      return response.status(503).json({ message: '模拟灵感删除状态读取失败' });
    }
    if (failNextCommentStateRead) {
      failNextCommentStateRead = false;
      return response.status(503).json({ message: '模拟评论状态读取失败' });
    }
    if (failNextPromotionStateRead) {
      failNextPromotionStateRead = false;
      return response.status(503).json({ message: '模拟转选题状态读取失败' });
    }
    const id = Number(request.params.id);
    const current = inspirations.find((item) => item.id === id);
    if (!current) return response.status(404).json({ message: '灵感不存在' });
    return response.json({ inspiration: current, comments: commentsByInspirationId.get(id) || [] });
  });
  app.get('/__qa/state', (_request, response) => response.json({ voteWriteRequests, inspiration: inspirations.find((item) => item.id === inspiration.id) }));
  app.post('/__qa/control', (request, response) => {
    commitNextCreateThenFailResponse = request.body.commitNextCreateThenFailResponse === true;
    failNextCreateStateRead = request.body.failNextCreateStateRead === true;
    failNextVote = request.body.failNextVote === true;
    delayNextVote = request.body.delayNextVote === true;
    commitNextVoteThenFailResponse = request.body.commitNextVoteThenFailResponse === true;
    failNextVoteStateRead = request.body.failNextVoteStateRead === true;
    commitNextCommentThenFailResponse = request.body.commitNextCommentThenFailResponse === true;
    failNextCommentStateRead = request.body.failNextCommentStateRead === true;
    commitNextPromotionThenFailResponse = request.body.commitNextPromotionThenFailResponse === true;
    failNextPromotionStateRead = request.body.failNextPromotionStateRead === true;
    failNextDelete = request.body.failNextDelete === true;
    delayNextDelete = request.body.delayNextDelete === true;
    commitNextDeleteThenFailResponse = request.body.commitNextDeleteThenFailResponse === true;
    failNextDeleteStateRead = request.body.failNextDeleteStateRead === true;
    if (request.body.seedDeleteRecoveryInspiration === true && !inspirations.some((item) => item.id === 903)) {
      inspirations = [...inspirations, { ...inspiration, id: 903, title: '删除状态核实：仍保留', votes: 0, comment_count: 0, voted: false }];
    }
    failNextPromotion = request.body.failNextPromotion === true;
    delayNextPromotion = request.body.delayNextPromotion === true;
    failNextComment = request.body.failNextComment === true;
    delayNextComment = request.body.delayNextComment === true;
    if (Number.isFinite(request.body.commentDelayMs) && request.body.commentDelayMs > 0) commentDelayMs = request.body.commentDelayMs;
    return response.json({ ok: true });
  });
  app.get('/api/topics', (_request, response) => response.json({ data: [], total: 0, page: 1, limit: 100 }));
  app.get('/api/topics/:id/versions', (_request, response) => response.json({ data: [] }));
  app.get('/api/topics/:id', (request, response) => response.json({
    data: {
      id: Number(request.params.id),
      title: '已从灵感转化的测试选题',
      description: '隔离浏览器夹具，不写入业务数据库。',
      outline: '',
      status: 'pending',
      platform: '抖音',
      deadline: '2026-10-30',
      creator_id: user.id,
      assignee_id: user.id,
      creator_name: user.name,
      created_at: '2026-10-08T00:00:00.000Z',
      updated_at: '2026-10-08T00:00:00.000Z',
    },
  }));
  app.post('/api/inspirations', async (request, response) => {
    createWriteRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 180));
    const requestId = typeof request.body.client_request_id === 'string' ? String(request.body.client_request_id).toLowerCase() : undefined;
    const existingId = requestId ? inspirationIdsByRequestId.get(requestId) : undefined;
    if (existingId !== undefined) {
      const existing = inspirations.find((item) => item.id === existingId);
      if (!existing || existing.creator_id !== user.id || existing.title !== String(request.body.title)
        || existing.description !== String(request.body.description || '')
        || existing.category !== String(request.body.category || 'general')) {
        return response.status(409).json({ message: '灵感请求编号冲突' });
      }
      return response.json({ message: '灵感创建成功', id: existing.id, inspiration: existing, idempotent_replay: true });
    }
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
    createPersistedRows += 1;
    if (requestId) inspirationIdsByRequestId.set(requestId, created.id);
    if (commitNextCreateThenFailResponse) {
      commitNextCreateThenFailResponse = false;
      return response.status(503).json({ message: '模拟灵感已保存但响应丢失' });
    }
    return response.json({ message: '灵感创建成功', id: created.id, inspiration: created, idempotent_replay: false });
  });
  app.post('/api/inspirations/:id/vote', async (request, response) => {
    voteWriteRequests += 1;
    const clientRequestId = typeof request.body?.client_request_id === 'string'
      ? request.body.client_request_id.toLowerCase()
      : '';
    if (clientRequestId) voteRequestIds.push(clientRequestId);
    if (failNextVote) {
      failNextVote = false;
      return response.status(503).json({ message: '模拟投票保存失败' });
    }
    if (delayNextVote) {
      delayNextVote = false;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    const current = inspirations.find((item) => item.id === Number(request.params.id));
    if (!current) return response.status(404).json({ message: '灵感不存在' });
    const desiredVoted = typeof request.body?.voted === 'boolean' ? request.body.voted : !current.voted;
    const existingRequest = clientRequestId ? voteRequests.get(clientRequestId) : undefined;
    if (existingRequest) {
      if (existingRequest.userId !== user.id || existingRequest.inspirationId !== current.id
        || existingRequest.requestedVoted !== desiredVoted) {
        return response.status(409).json({ message: '投票请求编号冲突' });
      }
      return response.json({
        message: current.voted ? '投票成功' : '取消投票成功',
        voted: current.voted,
        processedVoted: existingRequest.requestedVoted,
        votes: current.votes,
        idempotent_replay: true,
      });
    }
    if (current.voted !== desiredVoted) current.votes += desiredVoted ? 1 : -1;
    current.voted = desiredVoted;
    if (clientRequestId) voteRequests.set(clientRequestId, { userId: user.id, inspirationId: current.id, requestedVoted: desiredVoted });
    if (commitNextVoteThenFailResponse) {
      commitNextVoteThenFailResponse = false;
      return response.status(503).json({ message: '模拟写入已提交但响应丢失' });
    }
    return response.json({
      message: current.voted ? '投票成功' : '取消投票成功',
      voted: current.voted,
      processedVoted: desiredVoted,
      votes: current.votes,
      idempotent_replay: false,
    });
  });
  app.post('/api/inspirations/:id/comments', async (request, response) => {
    commentWriteRequests += 1;
    const id = Number(request.params.id);
    const content = String(request.body.content || '');
    const clientRequestId = typeof request.body.client_request_id === 'string' ? request.body.client_request_id : undefined;
    if (clientRequestId) commentRequestIds.push(clientRequestId);
    if (failNextComment) {
      failNextComment = false;
      return response.status(503).json({ message: '模拟评论保存失败' });
    }
    if (delayNextComment) {
      delayNextComment = false;
      await new Promise((resolve) => setTimeout(resolve, commentDelayMs));
    }
    const comments = commentsByInspirationId.get(id) || [];
    const existing = clientRequestId ? comments.find((item) => item.client_request_id === clientRequestId) : undefined;
    if (existing) {
      if (existing.creator_id !== user.id || existing.content !== content) {
        return response.status(409).json({ message: '评论请求编号冲突' });
      }
      return response.json({ message: '评论已发布', comment: existing, comment_count: comments.length, idempotent_replay: true });
    }
    const comment = {
      id: nextCommentId++,
      inspiration_id: id,
      creator_id: user.id,
      creator_name: user.name,
      content,
      created_at: '2026-10-08T00:02:00.000Z',
      ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
    };
    comments.push(comment);
    commentsByInspirationId.set(id, comments);
    const current = inspirations.find((item) => item.id === id);
    if (current) current.comment_count = comments.length;
    if (commitNextCommentThenFailResponse) {
      commitNextCommentThenFailResponse = false;
      return response.status(503).json({ message: '模拟评论已保存但响应丢失' });
    }
    return response.json({ message: '评论已发布', comment, comment_count: comments.length });
  });
  app.delete('/api/inspirations/:id', async (request, response) => {
    deleteWriteRequests += 1;
    if (failNextDelete) {
      failNextDelete = false;
      return response.status(503).json({ message: '模拟灵感删除失败' });
    }
    if (delayNextDelete) {
      delayNextDelete = false;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    const id = Number(request.params.id);
    inspirations = inspirations.filter((item) => item.id !== id);
    if (commitNextDeleteThenFailResponse) {
      commitNextDeleteThenFailResponse = false;
      return response.status(503).json({ message: '模拟灵感已删除但响应丢失' });
    }
    return response.json({ message: '灵感已删除' });
  });
  app.post('/api/inspirations/:id/promote', async (request, response) => {
    promoteWriteRequests += 1;
    if (failNextPromotion) {
      failNextPromotion = false;
      return response.status(503).json({ message: '模拟转选题失败' });
    }
    if (delayNextPromotion) {
      delayNextPromotion = false;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    const id = Number(request.params.id);
    const current = inspirations.find((item) => item.id === id);
    if (!current) return response.status(404).json({ message: '灵感不存在' });
    const topicId = current.topic_id || nextTopicId++;
    current.status = 'promoted';
    current.topic_id = topicId;
    if (commitNextPromotionThenFailResponse) {
      commitNextPromotionThenFailResponse = false;
      return response.status(503).json({ message: '模拟转化已提交但响应丢失' });
    }
    return response.json({ message: '选题已创建', topicId });
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
  let browser: Browser | null = null;
  const errors: string[] = [];

  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [320, 390, 1440]) {
      for (const theme of ['light', 'dark'] as const) {
        inspiration.votes = 3;
        inspiration.voted = false;
        inspiration.status = 'active';
        commentsByInspirationId = new Map([[inspiration.id, []]]);
        commentDelayMs = 180;
        inspirations = [{ ...inspiration, voted: false }];
        const context = await browser!.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.setDefaultTimeout(7_000);
        page.on('request', (request) => {
          const url = new URL(request.url());
          if (url.pathname.startsWith('/api/topics/') && url.pathname.endsWith('/versions')) topicVersionRequestPaths.push(url.pathname);
        });
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

        const card = getInspirationCard(page, inspiration.title);
        assert.equal(await card.evaluate((element) => element.tagName.toLowerCase()), 'article', `${theme} ${width}px inspiration card uses article semantics`);
        assert.equal(await card.getAttribute('role'), null, `${theme} ${width}px article does not impersonate a button`);
        assert.equal(await card.locator('button, [role="button"]').evaluateAll((controls) => controls.reduce(
          (count, control) => count + control.querySelectorAll('button, [role="button"], a[href], input, select, textarea, [tabindex]').length,
          0,
        )), 0, `${theme} ${width}px card action controls are not nested inside a button role or another interactive control`);
        const detailButton = getInspirationDetailButton(card, inspiration.title);
        const detailButtonBounds = await detailButton.boundingBox();
        assert(detailButtonBounds, `${theme} ${width}px detail action exposes a measurable button target`);
        assert.ok(detailButtonBounds.width >= 40 && detailButtonBounds.height >= 40,
          `${theme} ${width}px detail action has a 40x40px target: ${JSON.stringify(detailButtonBounds)}`);
        await detailButton.focus();
        assert.equal(await detailButton.evaluate((element) => document.activeElement === element), true, `${theme} ${width}px detail button is keyboard-focusable with a descriptive name`);
        const writesBeforeDetail = [voteWriteRequests, createWriteRequests, deleteWriteRequests, promoteWriteRequests, commentWriteRequests, apiWriteRequests];
        await page.keyboard.press('Enter');
        const detailDialog = page.getByRole('dialog', { name: inspiration.title, exact: true });
        await detailDialog.waitFor();
        const detailCloseButton = detailDialog.getByRole('button', { name: '关闭灵感详情', exact: true });
        assert.equal(await detailCloseButton.evaluate((element) => document.activeElement === element), true, `${theme} ${width}px detail dialog moves focus to its close control`);
        assert.equal(await detailDialog.getAttribute('aria-modal'), 'true', `${theme} ${width}px detail dialog is modal`);
        assert.equal(await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          return Array.from(document.body.children).filter((element) => element !== dialog)
            .every((element) => element.hasAttribute('inert') && element.getAttribute('aria-hidden') === 'true');
        }), true, `${theme} ${width}px detail dialog isolates the page background`);
        const detailCloseBounds = await detailCloseButton.boundingBox();
        assert(detailCloseBounds, `${theme} ${width}px detail dialog exposes a measurable close control`);
        assert.ok(detailCloseBounds.width >= 40 && detailCloseBounds.height >= 40, `${theme} ${width}px detail close target is at least 40x40px`);
        await page.keyboard.press('Shift+Tab');
        assert.equal(await detailDialog.getByPlaceholder('写下你的想法，补充角度、风险点、延展方向...').evaluate((element) => document.activeElement === element), true,
          `${theme} ${width}px Shift+Tab from the first control wraps to the last focusable dialog control`);
        await page.keyboard.press('Tab');
        assert.equal(await detailCloseButton.evaluate((element) => document.activeElement === element), true,
          `${theme} ${width}px Tab from the last control wraps to the first dialog control`);
        await page.keyboard.press('Escape');
        await detailDialog.waitFor({ state: 'detached' });
        assert.equal(await detailButton.evaluate((element) => document.activeElement === element), true, `${theme} ${width}px Escape restores focus to the explicit detail button`);
        assert.equal(await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert') ?? false), false,
          `${theme} ${width}px closing the dialog restores background interaction`);
        assert.deepEqual([voteWriteRequests, createWriteRequests, deleteWriteRequests, promoteWriteRequests, commentWriteRequests, apiWriteRequests], writesBeforeDetail,
          `${theme} ${width}px opening and closing the detail dialog does not write business data`);
        await page.keyboard.press('Space');
        await detailDialog.waitFor();
        await page.keyboard.press('Escape');
        await detailDialog.waitFor({ state: 'detached' });
        assert.equal(await detailButton.evaluate((element) => document.activeElement === element), true, `${theme} ${width}px Space also opens details and restores focus on close`);
        await card.locator('[data-inspiration-actions] button').first().scrollIntoViewIfNeeded();
        const inspirationActionTargets = await card.locator('[data-inspiration-actions] button').evaluateAll((actions) => actions.map((action) => {
          const rect = action.getBoundingClientRect();
          return {
            label: action.getAttribute('aria-label') || action.textContent?.trim() || '',
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        }));
        assert.equal(inspirationActionTargets.length, 4, `${theme} ${width}px inspiration card keeps vote, comments, promotion, and delete actions`);
        for (const action of inspirationActionTargets) {
          assert.ok(action.width >= 40 && action.height >= 40, `${action.label} has a 40px inspiration action target: ${JSON.stringify(action)}`);
          assert.ok(action.left >= 0 && action.right <= width && action.top >= 0 && action.bottom <= 900,
            `${action.label} remains reachable within the ${width}px inspiration viewport: ${JSON.stringify(action)}`);
        }
        const badge = card.getByText('有新评论', { exact: true });
        // This badge expires after six seconds; emit only when the test is ready to assert it.
        io.to('inspirations').emit('inspiration:commented', {
          inspirationId: inspiration.id,
          comment: { id: 9901, inspiration_id: inspiration.id, creator_id: 2, creator_name: '同事', content: '新增评论', created_at: '2026-10-08T00:01:00.000Z' },
          comment_count: 1,
        });
        await badge.waitFor({ state: 'visible' });
        assert.ok((await badge.getAttribute('class'))?.includes('bg-studio-cyan-soft'), `${theme} theme uses the semantic comment surface`);
        const ratio = await contrast(badge);
        assert.ok(ratio >= 4.5, `${theme} ${width}px new-comment label contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${theme} ${width}px inspiration page must not overflow horizontally`);
        assert.equal(await card.getByRole('button', { name: '转为选题', exact: true }).isVisible(), true, `${theme} ${width}px promotion action is visible`);
        assert.equal(await page.getByRole('textbox', { name: '搜索灵感', exact: true }).isVisible(), true, 'inspiration search has an accessible name');
        assert.equal(await page.getByRole('combobox', { name: '按分类筛选灵感', exact: true }).isVisible(), true, 'category filter has an accessible name');
        const voteButton = card.getByRole('button', { name: `点赞灵感：${inspiration.title}`, exact: true });
        const discussionButton = card.getByRole('button', { name: `查看灵感讨论：${inspiration.title}`, exact: true });
        await assertHoverSurface(page, voteButton, `${theme} 点赞`);
        await assertHoverSurface(page, discussionButton, `${theme} 评论`);
        await assertHoverSurface(page, card.getByRole('button', { name: '转为选题', exact: true }), `${theme} 转为选题`);

        if (width === 320 && theme === 'light') {
          failNextVote = true;
          const vote = voteButton;
          const failedVote = page.waitForResponse((response) => response.url().endsWith(`/api/inspirations/${inspiration.id}/vote`) && response.request().method() === 'POST' && response.status() === 503);
          await vote.click();
          await failedVote;
          await card.getByText('上次点赞状态已核实；再次操作会沿用原请求编号安全重试。', { exact: true }).waitFor();
          await page.waitForFunction(() => Array.from(document.querySelectorAll('main button[aria-pressed]')).some((button) => button.textContent?.trim() === '3' && !(button as HTMLButtonElement).disabled));
          assert.equal(await voteButton.count(), 1, 'failed vote rolls the visible count back');
          const firstVoteRequestId = voteRequestIds.at(-1);
          await voteButton.click();
          await page.waitForFunction((title) => Array.from(document.querySelectorAll('main button[aria-pressed]'))
            .some((button) => button.getAttribute('aria-label') === `点赞灵感：${title}` && button.textContent?.trim() === '4'), inspiration.title);
          assert.equal(voteWriteRequests, 2, 'the isolated retry sends one additional vote request');
          assert.equal(voteRequestIds.at(-1), firstVoteRequestId, 'safe retry reuses the original idempotency key');

          await page.waitForFunction(() => Array.from(document.querySelectorAll('main button[aria-pressed]')).some((button) => button.textContent?.trim() === '4' && !(button as HTMLButtonElement).disabled));
          delayNextVote = true;
          const votedButton = voteButton;
          const delayedVote = page.waitForResponse((response) => response.url().endsWith(`/api/inspirations/${inspiration.id}/vote`) && response.request().method() === 'POST' && response.status() === 200);
          await votedButton.evaluate((element) => {
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          });
          await delayedVote;
          await page.waitForFunction((title) => Array.from(document.querySelectorAll('main button[aria-pressed]'))
            .some((button) => button.getAttribute('aria-label') === `点赞灵感：${title}` && button.textContent?.trim() === '3'), inspiration.title);
          assert.equal(voteWriteRequests, 3, 'rapid repeated activation during a pending toggle sends only one vote request');
          assert.equal(await voteButton.getAttribute('aria-pressed'), 'false', 'one confirmed toggle updates the visible pressed state once');

          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitNextVoteThenFailResponse: true, failNextVoteStateRead: true }) });
          });
          const ambiguousVote = page.waitForResponse((response) => response.url().endsWith(`/api/inspirations/${inspiration.id}/vote`) && response.request().method() === 'POST' && response.status() === 503);
          const failedVoteStateRead = page.waitForResponse((response) => response.url().includes('/api/inspirations/vote-requests/') && response.request().method() === 'GET' && response.status() === 503);
          await voteButton.click();
          await Promise.all([ambiguousVote, failedVoteStateRead]);
          await card.getByText('点赞结果待确认；再次操作已暂停。', { exact: true }).waitFor();
          const unverifiedVoteButton = card.locator('button[aria-pressed]');
          assert.equal(await unverifiedVoteButton.isDisabled(), true, 'unknown toggle outcome blocks another vote until read-back');
          assert.equal(voteWriteRequests, 4, 'the lost-response case performs only its original vote write');

          const uncertainRequestId = voteRequestIds.at(-1);
          await page.reload();
          await card.getByText('点赞结果待确认；再次操作已暂停。', { exact: true }).waitFor();

          const verifiedVoteState = page.waitForResponse((response) => response.url().includes('/api/inspirations/vote-requests/') && response.request().method() === 'GET' && response.status() === 200);
          await card.getByRole('button', { name: `只读核实点赞状态：${inspiration.title}`, exact: true }).click();
          await verifiedVoteState;
          await page.waitForFunction((title) => Array.from(document.querySelectorAll('main button[aria-pressed]'))
            .some((button) => button.getAttribute('aria-label') === `点赞灵感：${title}` && button.textContent?.trim() === '4'), inspiration.title);
          assert.equal(await voteButton.getAttribute('aria-pressed'), 'true', 'read-only recovery shows the server-confirmed committed vote');
          assert.equal(voteWriteRequests, 4, 'vote-state recovery does not issue another write');
          assert.equal(voteRequestIds.at(-1), uncertainRequestId, 'refresh restores the original request receipt without creating a new write key');

          await voteButton.click();
          await page.waitForFunction((title) => Array.from(document.querySelectorAll('main button[aria-pressed]'))
            .some((button) => button.getAttribute('aria-label') === `点赞灵感：${title}` && button.textContent?.trim() === '3'), inspiration.title);
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

          const ambiguousCreateTitle = '隔离验收：提交成功但响应丢失';
          await page.getByRole('button', { name: '提交灵感', exact: true }).click();
          await page.getByLabel('标题 *', { exact: true }).fill(ambiguousCreateTitle);
          await page.getByLabel('描述', { exact: true }).fill('服务器已保存；首次核实也会失败。');
          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitNextCreateThenFailResponse: true, failNextCreateStateRead: true }) });
          });
          const lostCreateResponse = page.waitForResponse((response) => response.url().endsWith('/api/inspirations') && response.request().method() === 'POST' && response.status() === 503);
          const failedCreateRead = page.waitForResponse((response) => response.url().includes('/api/inspirations/create-request/') && response.request().method() === 'GET' && response.status() === 503);
          await page.getByRole('button', { name: '提交', exact: true }).click();
          await Promise.all([lostCreateResponse, failedCreateRead]);
          await page.getByText('上次创建结果待确认；再次提交已暂停。', { exact: true }).waitFor();
          assert.equal(await page.getByLabel('标题 *', { exact: true }).isDisabled(), true, 'an uncertain create locks the original payload');
          assert.equal(createWriteRequests, 2, 'uncertain create does not automatically send a second POST');
          assert.equal(createPersistedRows, 2, 'the injected response loss committed exactly one new inspiration row');

          await page.reload();
          await page.getByRole('heading', { name: '提交灵感', exact: true }).waitFor();
          assert.equal(await page.getByLabel('标题 *', { exact: true }).inputValue(), ambiguousCreateTitle, 'reload restores the pending create content');
          assert.equal(await page.getByLabel('标题 *', { exact: true }).isDisabled(), true, 'reload prevents changing the content bound to its request key');
          const recoveredCreateRead = page.waitForResponse((response) => response.url().includes('/api/inspirations/create-request/') && response.request().method() === 'GET' && response.status() === 200);
          await page.getByRole('button', { name: '只读核实上次灵感创建状态', exact: true }).click();
          await recoveredCreateRead;
          await page.getByRole('heading', { name: ambiguousCreateTitle, exact: true }).waitFor();
          await page.getByText('创建结果已核实', { exact: true }).waitFor();
          assert.equal(await page.getByRole('heading', { name: ambiguousCreateTitle, exact: true }).count(), 1, 'read-back recovery displays the created inspiration only once');
          assert.equal(createWriteRequests, 2, 'read-only create recovery sends no duplicate POST');
          assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:inspiration-create-pending:v1:1')), null, 'confirmed create recovery clears its session request key');

          const createdCard = getInspirationCard(page, title);
          await closeNotifications(page);
          const createdDetailButton = getInspirationDetailButton(createdCard, title);
          await createdDetailButton.focus();
          await page.keyboard.press('Enter');
          await page.getByText('讨论区', { exact: true }).waitFor();
          const commentBox = page.getByPlaceholder('写下你的想法，补充角度、风险点、延展方向...');
          const commentText = '这条评论用于验证失败保留与重复提交保护。';
          await commentBox.fill(commentText);
          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextComment: true }) });
          });
          const failedComment = page.waitForResponse((response) => response.url().endsWith(`/api/inspirations/902/comments`) && response.request().method() === 'POST' && response.status() === 503);
          await page.getByRole('button', { name: '发表评论', exact: true }).click();
          await failedComment;
          await page.getByText('发表评论失败', { exact: true }).waitFor();
          assert.equal(await commentBox.inputValue(), commentText, 'failed comments retain the entered text for retry');
          assert.equal(commentWriteRequests, 1, 'the isolated comment failure sends one request');

          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delayNextComment: true }) });
          });
          const commentResponse = page.waitForResponse((response) => response.url().endsWith(`/api/inspirations/902/comments`) && response.request().method() === 'POST' && response.status() === 200);
          const commentButton = page.getByRole('button', { name: '发表评论', exact: true });
          await commentButton.evaluate((element) => {
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          });
          await commentResponse;
          await page.getByText(commentText, { exact: true }).waitFor();
          await page.getByText('评论已发布', { exact: true }).waitFor();
          assert.equal(commentWriteRequests, 2, 'failed comment retry with rapid repeated activation sends one additional comment');
          assert.equal(commentRequestIds[0], commentRequestIds[1], 'a definite failed retry reuses the same idempotency key');
          assert.equal(await page.getByText(commentText, { exact: true }).count(), 1, 'a guarded comment appears only once');
          assert.equal(await commentBox.inputValue(), '', 'confirmed comments clear the submitted text');

          const ambiguousCommentText = '服务器已保存但响应与首次核实均丢失的评论。';
          await commentBox.fill(ambiguousCommentText);
          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitNextCommentThenFailResponse: true, failNextCommentStateRead: true }) });
          });
          const ambiguousComment = page.waitForResponse((response) => response.url().endsWith(`/api/inspirations/902/comments`) && response.request().method() === 'POST' && response.status() === 503);
          const failedCommentRead = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/902') && response.request().method() === 'GET' && response.status() === 503);
          await page.getByRole('button', { name: '发表评论', exact: true }).click();
          await Promise.all([ambiguousComment, failedCommentRead]);
          await page.getByText('评论结果待确认；再次发表评论已暂停。', { exact: true }).waitFor();
          assert.equal(await commentBox.isDisabled(), true, 'uncertain comment outcome locks the draft until read-only verification');
          assert.equal(await page.getByRole('button', { name: '发表评论', exact: true }).isDisabled(), true, 'uncertain comment outcome blocks resubmission');
          assert.equal(commentWriteRequests, 3, 'uncertain result does not trigger an automatic second comment write');
          await page.reload();
          await page.getByRole('heading', { name: '灵感池' }).waitFor();
          const recoveredCard = getInspirationCard(page, title);
          await closeNotifications(page);
          await getInspirationDetailButton(recoveredCard, title).click();
          await page.getByText('讨论区', { exact: true }).waitFor();
          const recoveredCommentBox = page.getByPlaceholder('写下你的想法，补充角度、风险点、延展方向...');
          await page.getByText('评论结果待确认；再次发表评论已暂停。', { exact: true }).waitFor();
          assert.equal(await recoveredCommentBox.inputValue(), ambiguousCommentText, 'reload restores the pending comment draft with its idempotency key');
          assert.equal(await recoveredCommentBox.isDisabled(), true, 'reload restores the duplicate-submit lock until read-back');
          assert.equal(commentWriteRequests, 3, 'reopening after reload does not send another comment write');
          const verifiedCommentRead = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/902') && response.request().method() === 'GET' && response.status() === 200);
          await page.getByRole('button', { name: '只读核实评论状态：隔离验收：创建后立即显示', exact: true }).click();
          await verifiedCommentRead;
          await page.getByText(ambiguousCommentText, { exact: true }).waitFor();
          await page.getByText('评论状态已核实', { exact: true }).waitFor();
          assert.equal(await page.getByText(ambiguousCommentText, { exact: true }).count(), 1, 'read-back finds and renders the already committed comment only once');
          assert.equal(await commentBox.inputValue(), '', 'read-back confirmation clears the submitted draft');
          assert.equal(commentWriteRequests, 3, 'read-only recovery does not send a duplicate comment write');

          const recoveredDetailDialog = page.getByRole('dialog', { name: title, exact: true });
          await page.keyboard.press('Escape');
          await recoveredDetailDialog.waitFor({ state: 'detached' });
          await closeNotifications(page);
          await getInspirationDetailButton(createdCard, title).click();
          await page.getByText('讨论区', { exact: true }).waitFor();
          const lateComment = '另一条灵感中未提交的草稿';
          const createdCommentBox = page.getByPlaceholder('写下你的想法，补充角度、风险点、延展方向...');
          await createdCommentBox.fill('较早发出的延迟评论');
          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delayNextComment: true, commentDelayMs: 1200 }) });
          });
          const lateCommentResponse = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/902/comments') && response.request().method() === 'POST' && response.status() === 200);
          await page.getByRole('button', { name: '发表评论', exact: true }).click();
          await page.waitForFunction(() => document.querySelector('button[aria-busy="true"]') !== null);
          await page.locator('div.fixed.inset-0').last().getByRole('button').first().click();
          const originalCard = getInspirationCard(page, inspiration.title);
          await getInspirationDetailButton(originalCard, inspiration.title).click();
          await page.getByText('讨论区', { exact: true }).waitFor();
          const otherCommentBox = page.getByPlaceholder('写下你的想法，补充角度、风险点、延展方向...');
          await otherCommentBox.fill(lateComment);
          await lateCommentResponse;
          assert.equal(await otherCommentBox.inputValue(), lateComment, 'a late comment response from a closed detail does not clear another inspiration draft');
          assert.equal(commentWriteRequests, 4, 'the closed-detail comment remains a single confirmed write');
          await page.locator('div.fixed.inset-0').last().getByRole('button').first().click();

          const deleteButton = createdCard.getByRole('button', { name: `删除灵感：${title}`, exact: true });
          page.on('dialog', (dialog) => { void dialog.accept(); });
          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextDelete: true }) });
          });
          const failedDelete = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/902') && response.request().method() === 'DELETE' && response.status() === 503);
          const preservedDeleteRead = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/902') && response.request().method() === 'GET' && response.status() === 200);
          await deleteButton.click();
          await Promise.all([failedDelete, preservedDeleteRead]);
          await page.getByText('删除未完成', { exact: true }).waitFor();
          assert.equal(await page.getByRole('heading', { name: title, exact: true }).count(), 1, 'failed deletion leaves the inspiration visible');
          assert.equal(deleteWriteRequests, 1, 'the isolated delete failure sends one request');

          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delayNextDelete: true }) });
          });
          const deleteResponse = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/902') && response.request().method() === 'DELETE' && response.status() === 200);
          await deleteButton.evaluate((element) => {
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          });
          await deleteResponse;
          await page.getByRole('heading', { name: title, exact: true }).waitFor({ state: 'detached' });
          await page.getByText('删除成功', { exact: true }).waitFor();
          assert.equal(deleteWriteRequests, 2, 'failed delete retry with rapid repeated activation sends one additional delete');

          await closeNotifications(page);
          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextPromotion: true }) });
          });
          const promoteButton = getInspirationCard(page, inspiration.title).getByRole('button', { name: '转为选题', exact: true });
          const failedPromotion = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/901/promote') && response.request().method() === 'POST' && response.status() === 503);
          await Promise.all([promoteButton.click(), failedPromotion]);
          await page.getByText('转为选题失败', { exact: true }).waitFor();
          assert.equal(await page.getByRole('heading', { name: inspiration.title, exact: true }).count(), 1, 'failed promotion keeps the inspiration available');
          assert.equal(promoteWriteRequests, 1, 'the isolated promotion failure sends one request');

          await closeNotifications(page);
          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitNextPromotionThenFailResponse: true, failNextPromotionStateRead: true }) });
          });
          const ambiguousPromotion = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/901/promote') && response.request().method() === 'POST' && response.status() === 503);
          const failedPromotionRead = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/901') && response.request().method() === 'GET' && response.status() === 503);
          await promoteButton.click();
          await Promise.all([ambiguousPromotion, failedPromotionRead]);
          await page.getByText('转选题结果待确认；再次转化已暂停。', { exact: true }).waitFor();
          assert.equal(await promoteButton.isDisabled(), true, 'unknown promotion outcome blocks duplicate conversion until read-back');
          assert.equal(promoteWriteRequests, 2, 'the ambiguous conversion sends only its original POST');
          await closeNotifications(page);
          const verifiedPromotionRead = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/901') && response.request().method() === 'GET' && response.status() === 200);
          await page.getByRole('button', { name: `只读核实转选题状态：${inspiration.title}`, exact: true }).click();
          await verifiedPromotionRead;
          await page.waitForURL('**/topics/990');
          const linkedTopicTitle = page.getByRole('textbox', { name: '选题标题', exact: true });
          await linkedTopicTitle.waitFor();
          assert.equal(await linkedTopicTitle.inputValue(), '已从灵感转化的测试选题', 'promotion recovery opens the linked mobile topic detail with the server title');
          await page.getByText('转选题状态已核实', { exact: true }).waitFor();
          assert.equal(promoteWriteRequests, 2, 'read-only recovery finds the already-linked topic without sending another conversion POST');
          assert.deepEqual(topicVersionRequestPaths, [], 'mobile topic detail loads outline history only when a source version is requested');

          await page.goto(`${base}/inspirations`);
          await page.getByRole('heading', { name: '灵感池' }).waitFor();
          if (width === 320 && theme === 'light') await page.screenshot({ path: '/tmp/xmt-inspiration-comment-light-320.png', fullPage: true });
          const ambiguousDeleteCard = getInspirationCard(page, inspiration.title);
          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitNextDeleteThenFailResponse: true }) });
          });
          const committedDeleteWithoutResponse = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/901') && response.request().method() === 'DELETE' && response.status() === 503);
          const missingDeleteRead = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/901') && response.request().method() === 'GET' && response.status() === 404);
          await ambiguousDeleteCard.getByRole('button', { name: `删除灵感：${inspiration.title}`, exact: true }).click();
          await Promise.all([committedDeleteWithoutResponse, missingDeleteRead]);
          await page.getByText('删除状态已核实', { exact: true }).waitFor();
          await page.getByRole('heading', { name: inspiration.title, exact: true }).waitFor({ state: 'detached' });
          assert.equal(deleteWriteRequests, 3, 'a committed delete with a lost response is confirmed with a read-only 404, not a second delete');

          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seedDeleteRecoveryInspiration: true }) });
          });
          await page.reload();
          await page.getByRole('heading', { name: '删除状态核实：仍保留', exact: true }).waitFor();
          const uncertainDeleteCard = getInspirationCard(page, '删除状态核实：仍保留');
          await page.evaluate(async () => {
            await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextDelete: true, failNextDeleteStateRead: true }) });
          });
          const uncertainDeleteResponse = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/903') && response.request().method() === 'DELETE' && response.status() === 503);
          const uncertainDeleteRead = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/903') && response.request().method() === 'GET' && response.status() === 503);
          await uncertainDeleteCard.getByRole('button', { name: '删除灵感：删除状态核实：仍保留', exact: true }).click();
          await Promise.all([uncertainDeleteResponse, uncertainDeleteRead]);
          await uncertainDeleteCard.getByText('删除结果待确认；再次删除已暂停。', { exact: true }).waitFor();
          const pausedDeleteButton = uncertainDeleteCard.getByRole('button', { name: '删除灵感：删除状态核实：仍保留', exact: true });
          assert.equal(await pausedDeleteButton.isDisabled(), true, 'an unreadable delete outcome pauses another destructive request');
          assert.equal(deleteWriteRequests, 4, 'an uncertain delete does not issue an automatic retry');

          const verifyDeleteRead = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/903') && response.request().method() === 'GET' && response.status() === 200);
          await uncertainDeleteCard.getByRole('button', { name: '只读核实删除状态：删除状态核实：仍保留', exact: true }).click();
          await verifyDeleteRead;
          await page.getByText('服务端仍保留这条灵感；当前没有删除，可在确认后重新操作。', { exact: true }).waitFor();
          assert.equal(await pausedDeleteButton.isDisabled(), false, 'read-back confirms the item still exists and re-enables an explicit delete');
          const finalDeleteResponse = page.waitForResponse((response) => response.url().endsWith('/api/inspirations/903') && response.request().method() === 'DELETE' && response.status() === 200);
          await pausedDeleteButton.click();
          await finalDeleteResponse;
          await page.getByRole('heading', { name: '删除状态核实：仍保留', exact: true }).waitFor({ state: 'detached' });
          assert.equal(deleteWriteRequests, 5, 'only the user-confirmed retry deletes the verified remaining item');
        } else {
          await page.getByRole('button', { name: '取消', exact: true }).click();
        }

        if (width === 1440 && theme === 'dark') await page.screenshot({ path: '/tmp/xmt-inspiration-comment-dark-1440.png', fullPage: true });
        await context.close();
      }
    }
    assert.deepEqual(errors, [], `unexpected browser errors: ${errors.slice(0, 5).join(' | ')}`);
    assert.equal(expectedHttpErrors.length, 15, 'the isolated fixtures return fifteen intentional 503 responses, including ambiguous create, vote, comment, deletion, and promotion writes plus failed state reads');
    assert.equal(voteWriteRequests, 5, 'vote tests cover failure/retry, in-flight deduplication, committed-but-unconfirmed state recovery, and a deliberate final toggle');
    assert.equal(createWriteRequests, 2, 'the isolated create tests cover a normal create and one committed-but-unconfirmed create without retrying its POST');
    assert.equal(createPersistedRows, 2, 'create retries/read-back do not create extra inspiration rows');
    assert.equal(commentWriteRequests, 4, 'the isolated comment test covers a failure/retry, ambiguous commit/read-back, and a late confirmed write');
    assert.equal(new Set(commentRequestIds).size, 3, 'the comment retry reuses one key while separate comments receive distinct keys');
    assert.equal(deleteWriteRequests, 5, 'deletion tests cover failed retry, lost response read-back, and explicit recovery without duplicate writes');
    assert.equal(promoteWriteRequests, 2, 'promotion tests cover one definite failure and one committed-but-unconfirmed conversion recovered read-only');
    assert.equal(apiWriteRequests, 0, 'other browser acceptance flows do not send business writes');
    console.log('灵感新评论提示亮暗主题对比、320/390/1440px可见性与横向溢出回归通过');
  } finally {
    await browser?.close();
    await vite.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
}

run().catch((error) => {
  console.error(`[inspiration-theme-contrast] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
