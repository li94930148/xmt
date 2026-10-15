import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 97, username: 'anonymous-feedback-theme-qa', role: 'admin', name: '匿名意见箱主题验收', enabled: true, force_change_password: false };
const feedback = {
  id: 971,
  type: 'process',
  content: '让团队协作流程更加清晰。',
  need_reply: false,
  reply_content: null,
  status: 'pending',
  created_at: '2026-10-08 09:00:00',
  updated_at: '2026-10-08 09:00:00',
};

function luminance(rgb: number[]) {
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function iconContrast(locator: import('playwright').Locator) {
  const colors = await locator.locator('svg').evaluate((element) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      backgrounds.push(getComputedStyle(current).backgroundColor);
    }
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
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','anonymous-feedback-theme-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/anonymous-feedback');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/anonymous-feedback', (_req, res) => res.json({ data: [feedback] }));
app.use('/api', (_req, res) => res.json({ data: [] }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?theme=${theme}`);
    await page.getByRole('heading', { name: '匿名意见箱' }).waitFor();
    await page.getByText(feedback.content, { exact: true }).waitFor();
    const icon = page.getByTestId('anonymous-feedback-icon');
    const classes = await icon.getAttribute('class') || '';
    assert.match(classes, /bg-studio-cyan-soft/, `${theme} icon uses the semantic cyan surface`);
    assert.match(classes, /text-studio-cyan-contrast/, `${theme} icon uses the contrast-safe cyan foreground`);
    const ratio = await iconContrast(icon);
    assert.ok(ratio >= 3, `${theme} icon contrast is ${ratio.toFixed(2)}:1; expected at least 3:1`);
    await page.screenshot({ path: `/tmp/xmt-anonymous-feedback-icon-${theme}.png`, fullPage: true });
  }

  assert.deepEqual(errors, [], 'anonymous feedback page has no browser errors');
  console.log('匿名意见箱亮/暗主题图标对比回归通过');
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
  io.close();
}
