import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
type Layout = 'style1' | 'style2' | 'style3';
let selectedLayout: Layout = 'style1';

const app = express();
app.use(express.json());
app.get('/__qa/:layout/:theme', (req, res) => {
  if (['style1', 'style2', 'style3'].includes(req.params.layout)) selectedLayout = req.params.layout as Layout;
  const theme = req.params.theme === 'light' ? 'light' : 'dark';
  return res.type('html').send(`<script>localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/login');</script>`);
});
app.get('/api/system-settings/public', (_req, res) => res.json({
  system: { name: '新媒体协作管理系统', browserTitle: '新媒体协作管理系统', description: '统一管理内容生产。', icon: '新', defaultTheme: 'dark' },
  branding: { brandName: '岚曜新媒体', logo: '', brandDescription: '让团队在同一套流程里协作。' },
  login: { layout: selectedLayout, welcomeTitle: '欢迎回来', welcomeMessage: '请输入账号密码登录系统' },
}));
app.post('/api/auth/login', (req, res) => {
  if (req.body?.username === 'theme-qa-forced') {
    res.json({
      user: { id: 92, username: 'theme-qa-forced', name: '主题验收账号', email: 'qa@example.test', role: 'admin', enabled: true, force_change_password: false },
      token: 'isolated-login-theme-fixture-token',
      forceChangePassword: true,
    });
    return;
  }
  res.status(401).json({ message: '账号或密码错误' });
});
app.get('/api/auth/me', (_req, res) => res.json({ id: 92, username: 'theme-qa-forced', name: '主题验收账号', email: 'qa@example.test', role: 'admin', enabled: true, force_change_password: false }));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.use('/api', (_req, res) => res.json({ data: [] }));

const server = http.createServer(app);
new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

function parseColor(value: string) {
  const normalized = value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)\)$/);
  if (normalized) {
    return {
      r: Number(normalized[1]) * 255,
      g: Number(normalized[2]) * 255,
      b: Number(normalized[3]) * 255,
      a: Number(normalized[4]),
    };
  }
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1 } : null;
}

function luminance(color: { r: number; g: number; b: number }) {
  const channels = [color.r, color.g, color.b].map((value) => value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function directContrast(foregroundValue: string, backgroundValue: string) {
  const foreground = parseColor(foregroundValue);
  const background = parseColor(backgroundValue);
  if (!foreground || !background) return 0;
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

async function contrast(locator: import('playwright').Locator) {
  const styles = await locator.evaluate((node) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = node; current; current = current.parentElement) backgrounds.push(getComputedStyle(current).backgroundColor);
    return { foreground: getComputedStyle(node).color, backgrounds };
  });
  const foreground = parseColor(styles.foreground);
  if (!foreground) return { ratio: 0, foreground: styles.foreground, backgrounds: styles.backgrounds };
  let background = { r: 255, g: 255, b: 255 };
  for (const value of styles.backgrounds.reverse()) {
    const layer = parseColor(value);
    if (!layer || layer.a === 0) continue;
    background = {
      r: layer.r * layer.a + background.r * (1 - layer.a),
      g: layer.g * layer.a + background.g * (1 - layer.a),
      b: layer.b * layer.a + background.b * (1 - layer.a),
    };
  }
  const visibleForeground = {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
  };
  const foregroundLuminance = luminance(visibleForeground);
  const backgroundLuminance = luminance(background);
  return {
    ratio: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
    foreground: styles.foreground,
    background,
    backgrounds: styles.backgrounds,
  };
}

const browser = await chromium.launch({ headless: true });
try {
  for (const layout of ['style1', 'style2', 'style3'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const errors: string[] = [];
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${base}/__qa/${layout}/${theme}`);
      await page.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor();
      await page.waitForFunction((mode) => document.documentElement.dataset.theme === mode, theme);
      const heroFallback = page.locator('.fixed.inset-0.z-0').locator('div.absolute.inset-0').first().locator('div.absolute.inset-0').first();
      const heroFallbackClass = await heroFallback.getAttribute('class');
      assert.ok(heroFallbackClass?.includes('var(--xmt-ambient-a)') && heroFallbackClass.includes('var(--xmt-app-bg)'), `${layout}/${theme} login background must follow the active theme tokens; class=${heroFallbackClass}`);
      if (layout === 'style3') {
        assert.equal(await page.locator('.xmt-theme-scope').getAttribute('data-theme'), 'light', 'style3 keeps its intentionally light canvas readable in either system theme');
      }
      if (layout === 'style2') {
        const brandMark = page.getByTestId('login-brand-mark');
        const brandContrast = await contrast(brandMark);
        assert.ok(brandContrast.ratio >= 4.5, `${layout}/${theme} brand mark contrast=${brandContrast.ratio.toFixed(2)} expected>=4.5 ${JSON.stringify(brandContrast)}`);
      }
      const welcomeLabels = page.getByText('欢迎回来', { exact: true });
      const visibleWelcomeIndexes = await welcomeLabels.evaluateAll((nodes) => nodes.flatMap((node, index) => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 ? [index] : [];
      }));
      assert.ok(visibleWelcomeIndexes.length > 0, `${layout}/${theme} should render a visible welcome label`);
      for (const index of visibleWelcomeIndexes) {
        const result = await contrast(welcomeLabels.nth(index));
        assert.ok(result.ratio >= 4.5, `${layout}/${theme} welcome label ${index + 1} contrast=${result.ratio.toFixed(2)} expected>=4.5 ${JSON.stringify(result)}`);
      }
      const accountLabel = page.locator('label').filter({ hasText: /账号|用户名/ }).first();
      await accountLabel.waitFor();
      assert.ok((await contrast(accountLabel)).ratio >= 4.5, `${layout}/${theme} account label must remain readable`);
      if (layout === 'style1') {
        assert.equal(await page.getByText('其他方式', { exact: true }).count(), 0, 'unavailable auxiliary login methods are not presented as working actions');
        assert.equal(await page.getByRole('button').filter({ hasText: /微信|企微|邮箱/ }).count(), 0, 'login has no placeholder social or email buttons without a configured login flow');
        const passwordToggle = page.getByRole('button', { name: '切换密码可见状态' });
        await passwordToggle.hover();
        assert.ok((await contrast(passwordToggle)).ratio >= 4.5, `${layout}/${theme} password toggle remains readable on hover`);
        const rememberLabel = page.locator('label').filter({ hasText: '记住密码' });
        await rememberLabel.hover();
        assert.ok((await contrast(rememberLabel)).ratio >= 4.5, `${layout}/${theme} remember-password label remains readable on hover`);
        if (theme === 'light') {
          await page.locator('input[autocomplete="username"]').fill('theme-qa-invalid');
          await page.locator('input[autocomplete="current-password"]').fill('invalid-password');
          const failedLoginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.status() === 401);
          await page.getByRole('button', { name: '登录', exact: true }).click();
          await failedLoginResponse;
          const error = page.getByText('用户名或密码不正确，请检查后重试。', { exact: true });
          await error.waitFor();
          const errorContrast = await contrast(error);
          assert.ok(errorContrast.ratio >= 4.5, `${layout}/${theme} login error remains readable: ${errorContrast.ratio.toFixed(2)} ${JSON.stringify(errorContrast)}`);
          const expectedAuthFailure = errors.indexOf('Failed to load resource: the server responded with a status of 401 (Unauthorized)');
          if (expectedAuthFailure >= 0) errors.splice(expectedAuthFailure, 1);
        }

        await page.locator('input[autocomplete="username"]').fill('theme-qa-forced');
        await page.locator('input[autocomplete="current-password"]').fill('initial-password');
        const forcedLoginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.status() === 200);
        await page.getByRole('button', { name: '登录', exact: true }).click();
        await forcedLoginResponse;
        const passwordDialog = page.getByRole('dialog', { name: '请先修改初始密码' });
        await passwordDialog.waitFor();
        const passwordPanel = page.getByTestId('first-login-password-panel');
        const panelTokens = await passwordPanel.evaluate((element) => {
          const style = getComputedStyle(element);
          const probe = document.createElement('span');
          element.append(probe);
          probe.style.backgroundColor = 'var(--xmt-surface)';
          const tokenSurface = getComputedStyle(probe).backgroundColor;
          probe.style.color = 'var(--xmt-text-primary)';
          const tokenText = getComputedStyle(probe).color;
          probe.remove();
          return { surface: style.backgroundColor, tokenSurface, text: style.color, tokenText };
        });
        assert.equal(panelTokens.surface, panelTokens.tokenSurface, `${theme} first-login password panel uses the active Studio surface`);
        assert.equal(panelTokens.text, panelTokens.tokenText, `${theme} first-login password panel uses the active Studio text token`);
        for (const label of [
          passwordDialog.getByText('首次登录', { exact: true }),
          passwordDialog.getByRole('heading', { name: '请先修改初始密码' }),
          passwordDialog.getByText('为保障账号安全，首次登录后需先设置新密码。', { exact: true }),
        ]) {
          const result = await contrast(label);
          assert.ok(result.ratio >= 4.5, `${theme} first-login password dialog text contrast=${result.ratio.toFixed(2)} expected>=4.5 ${JSON.stringify(result)}`);
        }
        const cancelButton = passwordDialog.getByRole('button', { name: '退出登录' });
        const updateButton = passwordDialog.getByRole('button', { name: '更新密码' });
        assert.ok((await cancelButton.getAttribute('class'))?.includes('xmt-btn-secondary'), `${theme} cancel action uses the Studio secondary button`);
        assert.ok((await updateButton.getAttribute('class'))?.includes('xmt-btn-primary'), `${theme} update action uses the Studio primary button`);
        const primaryButtonStops = await updateButton.evaluate((button) => {
          const probe = document.createElement('span');
          button.append(probe);
          probe.style.backgroundColor = 'color-mix(in srgb, var(--xmt-primary-button) 96%, white)';
          const topStop = getComputedStyle(probe).backgroundColor;
          probe.style.backgroundColor = 'var(--xmt-primary-button)';
          const baseStop = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return { foreground: getComputedStyle(button).color, topStop, baseStop };
        });
        assert.ok(directContrast(primaryButtonStops.foreground, primaryButtonStops.topStop) >= 4.5, `${theme} update action text remains readable on its lightest gradient stop: ${JSON.stringify(primaryButtonStops)}`);
        assert.ok(directContrast(primaryButtonStops.foreground, primaryButtonStops.baseStop) >= 4.5, `${theme} update action text remains readable on its base gradient stop: ${JSON.stringify(primaryButtonStops)}`);
        for (const field of await passwordDialog.locator('input').all()) {
          assert.ok((await contrast(field)).ratio >= 4.5, `${theme} first-login password input text remains readable`);
        }
        if (theme === 'light') await page.screenshot({ path: '/tmp/xmt-login-first-password-light.png', fullPage: true });
        await passwordDialog.getByRole('button', { name: '退出登录' }).click();
        await page.getByRole('button', { name: '登录', exact: true }).waitFor();
      }
      await page.getByRole('button', { name: layout === 'style1' ? '登录' : '进入系统', exact: true }).waitFor();
      assert.deepEqual(errors, [], `${layout}/${theme} should render without browser errors`);
      if (layout === 'style1' && theme === 'light') {
        await page.waitForTimeout(300);
        await page.screenshot({ path: '/tmp/xmt-login-style1-light-after.png', fullPage: true });
      }
      if (layout === 'style3' && theme === 'dark') {
        await page.waitForTimeout(300);
        await page.screenshot({ path: '/tmp/xmt-login-style3-dark-after.png', fullPage: true });
      }
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        assert.equal(horizontalOverflow, false, `${layout}/${theme} login should not overflow horizontally at ${width}px`);
        const submit = page.getByRole('button', { name: layout === 'style1' ? '登录' : '进入系统', exact: true });
        await submit.scrollIntoViewIfNeeded();
        assert.equal(await submit.isVisible(), true, `${layout}/${theme} primary login action remains visible at ${width}px`);
        assert.equal(await page.locator('input[autocomplete="username"]').isVisible(), true, `${layout}/${theme} account field remains visible at ${width}px`);
        assert.equal(await page.locator('input[autocomplete="current-password"]').isVisible(), true, `${layout}/${theme} password field remains visible at ${width}px`);
        const interactiveBounds = await page.locator('input[autocomplete="username"], input[autocomplete="current-password"], button[aria-label="切换密码可见状态"], button[type="submit"]').evaluateAll((elements) => elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }));
        assert.ok(interactiveBounds.every((bounds) => bounds.left >= 0 && bounds.right <= width), `${layout}/${theme} account, password, visibility, and submit controls stay inside ${width}px: ${JSON.stringify(interactiveBounds)}`);
        if (layout === 'style1' && theme === 'light' && width === 320) await page.screenshot({ path: '/tmp/xmt-login-style1-light-320.png', fullPage: true });
        if (layout === 'style3' && theme === 'dark' && width === 390) await page.screenshot({ path: '/tmp/xmt-login-style3-dark-390.png', fullPage: true });
      }
      await context.close();
    }
  }
  console.log('Login theme contrast browser test passed: style1/style2/style3 across light/dark themes, 4.5:1 key text contrast, no browser errors.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
