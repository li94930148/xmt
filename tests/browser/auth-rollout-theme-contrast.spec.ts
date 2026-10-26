import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const user = { id: 97, username: 'auth-theme-qa', role: 'admin', name: '登录主题验收', enabled: true, force_change_password: false };
const now = '2026-10-19T00:00:00.000Z';
const metricWindow = {
  windowMinutes: 60,
  from: now,
  to: now,
  categories: { login: 3, refresh: 1, logout: 0, failure: 0, securityEvents: 0 },
  counters: { legacy_login_count: 3, v1_login_count: 0, refresh_success: 1, refresh_failed: 0, csrf_failed: 0, token_reuse_detected: 0, logout_success: 0, expired_count: 0 },
  refreshFailureRate: 0,
};
const status = {
  runtime: {
    effectiveConfigSource: 'development_env' as const,
    effectiveAuthV1Enabled: false,
    effectiveAuthWebEnabled: false,
    effectiveLoginRolloutEnabled: false,
    effectiveRolloutMode: 'legacy' as const,
    effectiveSocketBridgeEnabled: false,
    effectiveMobileAuthEnabled: false,
    mobileAuthApproved: false,
    mobileAllowlistCount: 0,
    effectiveMobileSocketEnabled: false,
    allowlistCount: 0,
    processId: 1,
    loadedAt: now,
  },
  rollout: { mode: 'legacy' as const, enabled: false, percentage: 0, allowlistCount: 0, internalCount: 0 },
  socketBridge: { socketBridgeEnabled: false, socketBridgeApproval: false, socketV1EligibleUserCount: 0, currentMode: 'legacy' as const },
  diagnostic: { userId: user.id, mode: 'legacy' as const, enabled: false, matchedRule: 'none' as const, reason: 'disabled' },
  metrics: { last5Minutes: metricWindow, lastHour: metricWindow, last24Hours: metricWindow },
  exporters: {
    source: ['memory'] as Array<'memory' | 'prometheus' | 'opentelemetry'>,
    status: [{ name: 'memory', kind: 'memory' as const, enabled: true, healthy: true, lastExportAt: now, reason: null }],
    lastEventAt: now,
    lastExportAt: now,
  },
  risk: { status: 'healthy' as const, events: [] as Array<{ code: string; severity: 'warning' | 'critical'; value: number; threshold: number; reason: string; createdAt: string }> },
  thresholds: { windowMinutes: 60, refreshFailureRate: 0.05, csrfFailureCount: 5, tokenReuseCount: 1, expiredCount: 10 },
  audits: [] as Array<{ actor: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string; created_at: string }>,
  generatedAt: now,
};
const unexpectedWrites: string[] = [];

const app = express();
app.get('/__qa', (request, response) => {
  const theme = request.query.theme === 'light' ? 'light' : 'dark';
  response.type('html').send(
    '<script>' +
    'localStorage.setItem("xmt_user",' + JSON.stringify(JSON.stringify(user)) + ');' +
    'localStorage.setItem("xmt_token","auth-theme-fixture");' +
    'localStorage.setItem("xmt_theme",' + JSON.stringify(theme) + ');' +
    'localStorage.setItem("xmt_last_version_seen",' + JSON.stringify(version) + ');' +
    'location.replace("/admin/auth-rollout");' +
    '</script>',
  );
});
app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/permissions/my', (_request, response) => response.json([]));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_request, response) => response.json({}));
app.get('/api/v1/auth-rollout/status', (_request, response) => response.json({ success: true, data: status }));
app.use('/api', (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') unexpectedWrites.push(request.method + ' ' + request.path);
  response.json({ data: [] });
});

const server = http.createServer(app);
const socketServer = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
const base = 'http://127.0.0.1:' + address.port;

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  if (process.env.XMT_AUTH_ROLLOUT_THEME_QA_SERVE === '1') {
    console.log('Isolated auth rollout theme fixture: ' + base + '/__qa?theme=dark');
    await new Promise(() => {});
  }

function parseColor(value: string): { rgb: number[]; alpha: number } | null {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? hex.split('').map((channel) => channel + channel).join('') : hex;
    return { rgb: [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16)), alpha: 1 };
  }
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return channels.length >= 3 ? { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 } : null;
}

function luminance(rgb: number[]) {
  const channels = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, panel: string, appBackground: string) {
  const fg = parseColor(foreground);
  const surface = parseColor(panel);
  const appBg = parseColor(appBackground);
  if (!fg || !surface || !appBg) return 0;
  const background = surface.rgb.map((channel, index) => channel * surface.alpha + appBg.rgb[index] * (1 - surface.alpha));
  const textLuminance = luminance(fg.rgb);
  const backgroundLuminance = luminance(background);
  return (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05);
}

browser = await chromium.launch({ headless: true });
  const errors: string[] = [];
  const dashboardLabels = [
    '当前结论',
    '每一项都通过后，才适合让少量内部账号试用。',
    '当前登录方式',
    '试用账号',
    '近 60 分钟登录次数',
    '登录续期失败率',
    '安全异常次数',
  ];
  const diagnosticLabels = ['配置来源', '新版登录机制 / 网页版', '监控记录来源', '最近监控确认时间', '状态生成时间'];

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(theme + '/' + width + ': ' + error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(theme + '/' + width + ': ' + message.text()); });
      await page.goto(base + '/__qa?theme=' + theme);
      await page.getByRole('heading', { name: '登录安全升级', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/admin/auth-rollout', theme + '/' + width + 'px reaches the intended admin route');

      for (const label of dashboardLabels) {
        const locator = page.getByText(label, { exact: true });
        await locator.waitFor();
        const colors = await locator.evaluate((element) => {
          const panel = element.closest('.studio-sheen') as HTMLElement | null;
          return {
            foreground: getComputedStyle(element).color,
            panel: panel ? getComputedStyle(panel).backgroundColor : '',
            appBackground: getComputedStyle(document.documentElement).getPropertyValue('--xmt-app-bg').trim(),
          };
        });
        const ratio = contrastRatio(colors.foreground, colors.panel, colors.appBackground);
        assert.ok(ratio >= 4.5, theme + '/' + width + 'px "' + label + '" contrast=' + ratio.toFixed(2) + ':1 expected>=4.5:1');
      }

      await page.locator('details summary').click();
      for (const label of diagnosticLabels) {
        const locator = page.getByText(label, { exact: true });
        await locator.waitFor();
        const colors = await locator.evaluate((element) => {
          const panel = element.closest('details') as HTMLElement | null;
          return {
            foreground: getComputedStyle(element).color,
            panel: panel ? getComputedStyle(panel).backgroundColor : '',
            appBackground: getComputedStyle(document.documentElement).getPropertyValue('--xmt-app-bg').trim(),
          };
        });
        const ratio = contrastRatio(colors.foreground, colors.panel, colors.appBackground);
        assert.ok(ratio >= 4.5, theme + '/' + width + 'px diagnostic label "' + label + '" contrast=' + ratio.toFixed(2) + ':1 expected>=4.5:1');
      }

      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(documentWidth <= width, theme + '/' + width + 'px page has no horizontal overflow: document=' + documentWidth);
      if (theme === 'dark' && width === 320) await page.screenshot({ path: '/tmp/xmt-auth-rollout-dark-320.png', fullPage: true });
      await page.close();
    }
  }
  assert.deepEqual(unexpectedWrites, [], 'theme and responsive verification uses no business writes');
  assert.deepEqual(errors, [], 'auth rollout page has no browser errors: ' + errors.join(' | '));
  console.log('Auth rollout theme contrast and responsive checks passed.');
} finally {
  await browser?.close().catch(() => undefined);
  await vite.close();
  await new Promise<void>((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    socketServer.close(() => resolve());
  });
}
