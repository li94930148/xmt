import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const user = { id: 95, username: 'pomodoro-theme-qa', name: '番茄钟主题验收', role: 'admin', enabled: true, force_change_password: false };
const unexpectedWrites: string[] = [];
let failNextStats = false;
let failNextRanking = false;

const app = express();
app.get('/__qa', (request, response) => {
  const theme = request.query.theme === 'light' ? 'light' : 'dark';
  failNextStats = request.query.failStats === '1';
  failNextRanking = request.query.failRanking === '1';
  response.type('html').send(`<script>
    localStorage.setItem('xmt_user', ${JSON.stringify(JSON.stringify(user))});
    localStorage.setItem('xmt_token', 'pomodoro-theme-fixture');
    localStorage.setItem('xmt_theme', ${JSON.stringify(theme)});
    localStorage.setItem('xmt_last_version_seen', ${JSON.stringify(version)});
    location.replace('/pomodoro');
  </script>`);
});
app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_request, response) => response.json({}));
app.get('/api/pomodoro/stats', (_request, response) => {
  if (failNextStats) {
    failNextStats = false;
    return response.status(503).json({ message: '隔离验收模拟统计读取失败，请重试' });
  }
  return response.json({ today: 0, week: 0, totalMinutes: 0 });
});
app.get('/api/pomodoro/ranking', (_request, response) => {
  if (failNextRanking) {
    failNextRanking = false;
    return response.status(503).json({ message: '隔离验收模拟排行榜读取失败，请重试' });
  }
  return response.json({ data: [] });
});
app.use('/api', (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') unexpectedWrites.push(`${request.method} ${request.path}`);
  response.status(404).json({ message: '未配置的隔离验收 API' });
});

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.get('/__qa/compact', async (request, response, next) => {
  try {
    const theme = request.query.theme === 'dark' ? 'dark' : 'light';
    failNextStats = request.query.failStats === '1';
    const html = await vite.transformIndexHtml('/__qa/compact', `<!doctype html>
      <html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" href="data:,"><title>番茄钟隔离验收</title></head>
      <body><div id="root"></div><script>
        localStorage.setItem('xmt_user', ${JSON.stringify(JSON.stringify(user))});
        localStorage.setItem('xmt_token', 'pomodoro-theme-fixture');
        localStorage.setItem('xmt_theme', ${JSON.stringify(theme)});
      </script><script type="module" src="/tests/browser/pomodoro-compact-entry.tsx"></script></body></html>`);
    response.type('html').send(html);
  } catch (error) {
    next(error);
  }
});
app.use(vite.middlewares);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_POMODORO_AMBER_QA_SERVE === '1') {
  console.log(`Isolated pomodoro amber contrast fixture: ${base}/__qa?theme=dark`);
  await new Promise(() => {});
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const errors: string[] = [];
  const expected503ConsoleErrors: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1440]) {
      const height = width === 320 ? 720 : width === 390 ? 844 : 900;
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce' });
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(`${theme}/${width}: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (message.text().includes('server responded with a status of 503')) expected503ConsoleErrors.push(`${theme}/${width}: ${message.text()}`);
        else errors.push(`${theme}/${width}: ${message.text()}`);
      });
      await page.goto(`${base}/__qa?theme=${theme}${width === 320 ? '&failStats=1&failRanking=1' : ''}`);
      await page.getByRole('heading', { name: '番茄钟', exact: true }).waitFor();
      await page.getByRole('heading', { name: '专注排行榜', exact: true }).waitFor();

      const returnHome = page.getByRole('button', { name: '返回首页', exact: true });
      assert.equal(await returnHome.count(), 1, `${theme}/${width}px should expose one return-home action without duplicating the mobile shell control`);
      assert.equal(await returnHome.isVisible(), true, `${theme}/${width}px return-home action remains visible`);
      const resetButton = page.getByTestId('pomodoro-reset-button');
      const resetBounds = await resetButton.boundingBox();
      assert.ok(resetBounds && resetBounds.width >= 40 && resetBounds.height >= 40, `${theme}/${width}px full timer reset target is at least 40x40px: ${JSON.stringify(resetBounds)}`);
      if (width === 320) {
        const rankingRetry = page.getByRole('button', { name: '重试', exact: true });
        await rankingRetry.waitFor({ state: 'visible' });
        const rankingRetryBounds = await rankingRetry.boundingBox();
        assert.ok(rankingRetryBounds && rankingRetryBounds.width >= 40 && rankingRetryBounds.height >= 40, `${theme}/${width}px ranking retry target is at least 40x40px: ${JSON.stringify(rankingRetryBounds)}`);
        await rankingRetry.click();
        await rankingRetry.waitFor({ state: 'hidden' });

        const statsRetry = page.getByRole('button', { name: /统计加载失败/ });
        await statsRetry.waitFor({ state: 'visible' });
        const statsRetryBounds = await statsRetry.boundingBox();
        assert.ok(statsRetryBounds && statsRetryBounds.width >= 40 && statsRetryBounds.height >= 40, `${theme}/${width}px stats retry target is at least 40x40px: ${JSON.stringify(statsRetryBounds)}`);
        await statsRetry.click();
        await statsRetry.waitFor({ state: 'hidden' });
        await resetButton.click();
        assert.equal(await page.getByText('25:00', { exact: true }).count(), 1, `${theme}/${width}px reset restores the ready timer state`);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const mobileReachability = await page.evaluate(() => {
          const heading = [...document.querySelectorAll('h2')].find((item) => item.textContent?.trim() === '专注排行榜');
          const panel = heading?.parentElement?.parentElement;
          const navigation = document.querySelector('[aria-label="移动主导航"]');
          if (!panel || !navigation) return null;
          const panelBounds = panel.getBoundingClientRect();
          const navigationBounds = navigation.getBoundingClientRect();
          return { panelBottom: panelBounds.bottom, navigationTop: navigationBounds.top };
        });
        assert.ok(mobileReachability && mobileReachability.panelBottom <= mobileReachability.navigationTop, `${theme}/${width}px leaderboard can scroll fully above the fixed bottom navigation: ${JSON.stringify(mobileReachability)}`);
      }

      const contrast = await page.getByTestId('pomodoro-ranking-icon').evaluate((element) => {
        const parse = (value: string) => {
          const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
          if (hex) {
            const expanded = hex.length === 3 ? hex.split('').map((channel) => channel + channel).join('') : hex;
            return [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16));
          }
          const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
          return channels.length >= 3 ? channels.slice(0, 3) : null;
        };
        const luminance = (rgb: number[]) => {
          const channels = rgb.map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const foreground = parse(getComputedStyle(element).color);
        const background = parse(getComputedStyle(document.documentElement).getPropertyValue('--xmt-amber'));
        if (!foreground || !background) return { ratio: 0, foreground, background };
        const foregroundLuminance = luminance(foreground);
        const backgroundLuminance = luminance(background);
        return {
          ratio: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
          foreground,
          background,
        };
      });
      assert.ok(contrast.ratio >= 3, `${theme}/${width}px trophy icon contrast=${contrast.ratio.toFixed(2)} expected>=3:1 ${JSON.stringify(contrast)}`);

      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(documentWidth <= width, `${theme}/${width}px page does not overflow horizontally: document=${documentWidth}`);
      await page.close();
    }

    const compactPage = await browser.newPage({ viewport: { width: 320, height: 720 }, colorScheme: theme, reducedMotion: 'reduce' });
    compactPage.setDefaultTimeout(10000);
    compactPage.on('pageerror', (error) => errors.push(`${theme}/compact: ${error.message}`));
    compactPage.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (message.text().includes('server responded with a status of 503')) expected503ConsoleErrors.push(`${theme}/compact: ${message.text()}`);
      else errors.push(`${theme}/compact: ${message.text()}`);
    });
    await compactPage.goto(`${base}/__qa/compact?theme=${theme}&failStats=1`);
    await compactPage.getByTestId('pomodoro-reset-button').waitFor({ state: 'visible' });
    const compactStatsRetry = compactPage.getByRole('button', { name: /统计加载失败/ });
    await compactStatsRetry.waitFor({ state: 'visible' });
    const compactStatsRetryBounds = await compactStatsRetry.boundingBox();
    assert.ok(compactStatsRetryBounds && compactStatsRetryBounds.width >= 40 && compactStatsRetryBounds.height >= 40, `${theme}/320px compact stats retry target is at least 40x40px: ${JSON.stringify(compactStatsRetryBounds)}`);
    await compactStatsRetry.click();
    await compactStatsRetry.waitFor({ state: 'hidden' });
    const compactResetBounds = await compactPage.getByTestId('pomodoro-reset-button').boundingBox();
    assert.ok(compactResetBounds && compactResetBounds.width >= 40 && compactResetBounds.height >= 40, `${theme}/320px compact timer reset target is at least 40x40px: ${JSON.stringify(compactResetBounds)}`);
    await compactPage.getByTestId('pomodoro-reset-button').click();
    assert.equal(await compactPage.getByText('25:00', { exact: true }).count(), 1, `${theme}/320px compact reset restores the ready timer state`);
    await compactPage.close();
  }
  assert.deepEqual(unexpectedWrites, [], 'theme and responsive checks issue no business writes');
  assert.equal(expected503ConsoleErrors.length, 6, 'the deliberately injected mobile stats and leaderboard failures are isolated and retryable');
  assert.deepEqual(errors, [], `pomodoro theme and responsive rendering has no browser errors: ${errors.join(' | ')}`);
  console.log('Pomodoro amber contrast and responsive browser checks passed.');
} finally {
  if (browser) await browser.close();
  io.close();
  await vite.close();
  if (server.listening) {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
