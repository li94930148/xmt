import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const fixtureOnly = process.env.XMT_RESOURCE_ARCHIVE_FIXTURE_ONLY === '1';
const user = { id: 94, username: 'resource-archive-qa', role: 'editor', name: '归档页面验收', enabled: true, force_change_password: false };
const currentSnapshot = {
  topic: { id: 71, title: '多平台早餐主题', description: '历史选题摘要', platform: 'douyin', deadline: '2026-09-30' },
  script: { version: 'v2.0', content: '<p>安全归档正文</p><img src="x" onerror="alert(1)"><a href="javascript:alert(2)">危险锚点</a>' },
  shooting: { comments: [{ content: '制作时保留的批注', operator_name: '验收成员', created_at: '2026-09-28 09:00:00' }] },
  publishing: { publishing_id: 402, platform: 'weixin', status: 'published', publish_time: '2026-09-29 10:00:00' },
  analytics: { data_date: '2026-09-29', views: 1200, likes: 52, shares: 8, comments: 4 },
  published_records: [
    { publishing_id: 402, platform: 'weixin', status: 'published', publish_time: '2026-09-29 10:00:00', url: 'https://example.test/weixin/402', analytics: { data_date: '2026-09-29', views: 1200, likes: 52, shares: 8, comments: 4 } },
    { publishing_id: 401, platform: 'douyin', status: 'failed', publish_time: '2026-09-28 10:00:00', url: 'javascript:alert(3)', analytics: null },
  ],
  archived_at: '2026-09-29 10:30:00',
};
const legacySnapshot = {
  topic: { id: 72, title: '旧版单平台主题', platform: 'xiaohongshu' },
  publishing: { platform: 'xiaohongshu', status: 'published', publish_time: '2026-09-28 11:00:00', url: 'https://example.test/legacy/72' },
  analytics: { data_date: '2026-09-28', views: 88, likes: 5, shares: 1, comments: 0 },
  archived_at: '2026-09-28 11:30:00',
};
const nullableSnapshot = {
  topic: { id: 76, title: '可空字段归档', description: null, platform: null, deadline: null },
  script: null,
  shooting: null,
  publishing: { id: 406, platform: null, status: null, url: null, publish_time: null },
  analytics: { data_date: null, views: 17, likes: 3, shares: 1, comments: 0 },
  published_records: [{
    id: 406,
    publishing_id: 406,
    platform: null,
    status: null,
    url: null,
    publish_time: null,
    analytics: { data_date: null, views: 17, likes: 3, shares: 1, comments: 0 },
  }],
  archived_at: '2026-09-29 10:30:00',
};
const apiRequests: Array<{ method: string; path: string }> = [];
const app = express();
app.get('/__qa', (req, res) => {
  const id = Number(req.query.id || 701);
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','resource-archive-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/asset-center/resources/${id}?library_type=content_archive');</script>`);
});
app.use('/api', (req, _res, next) => {
  apiRequests.push({ method: req.method, path: req.path });
  next();
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['resource:view', 'resource:audit']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/resource-center/resources/:id/audit', (_req, res) => res.json({ data: [] }));

function resource(id: number) {
  const defaults = {
    id,
    title: `隔离归档 ${id}`,
    name: `隔离归档 ${id}`,
    library_type: 'content_archive',
    visibility: 'team',
    status: 'published',
    category: null,
    tags: [],
    file_count: 0,
    owner: { id: user.id, username: user.username, real_name: user.name },
    created_at: '2026-09-28 10:00:00',
    updated_at: '2026-09-29 10:30:00',
    content_text: null,
    source_uri: null,
    parent_id: null,
    files: [],
    relations: [],
    versions: [],
    audit_summary: null,
  };
  if (id === 701) return { ...defaults, title: '新格式多平台归档', name: '新格式多平台归档', file_path: 'archive/topic-71', source_type: 'system_archive', content: JSON.stringify(currentSnapshot) };
  if (id === 702) return { ...defaults, title: '旧格式单平台归档', name: '旧格式单平台归档', file_path: 'archive/topic-72', source_type: 'system_archive', content: JSON.stringify(legacySnapshot) };
  if (id === 706) return { ...defaults, title: '可空字段归档', name: '可空字段归档', file_path: 'archive/topic-76', source_type: 'system_archive', content: JSON.stringify(nullableSnapshot) };
  if (id === 703) return { ...defaults, title: '损坏 JSON 归档', name: '损坏 JSON 归档', file_path: 'archive/topic-73', source_type: 'system_archive', content: '{"published_records":[' };
  if (id === 705) return { ...defaults, title: '错误形状归档', name: '错误形状归档', file_path: 'archive/topic-75', source_type: 'system_archive', content: JSON.stringify({ published_records: [null] }) };
  return {
    ...defaults,
    id: 704,
    title: '普通内容档案',
    name: '普通内容档案',
    file_path: 'archive/topic-74',
    source_type: 'manual',
    content_text: '普通档案纯文本内容',
    content: JSON.stringify(currentSnapshot),
  };
}

app.get('/api/resource-center/resources/:id', (req, res) => {
  const id = Number(req.params.id);
  if (![701, 702, 703, 704, 705, 706].includes(id)) return res.status(404).json({ message: '资料不存在' });
  return res.json(resource(id));
});
app.get('/api/resource-center/categories', (_req, res) => res.json({ data: [] }));
app.get('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let failure: unknown;

try {
  if (fixtureOnly) {
    console.log(`Resource archive MCP fixture ready: ${base}/__qa?id=701; press Ctrl-C to stop it.`);
    await new Promise<void>((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  } else {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${base}/__qa?id=701`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '新格式多平台归档' }).waitFor();
  await page.getByTestId('legacy-published-archive-snapshot').waitFor();
  assert.equal(await page.getByTestId('legacy-published-record').count(), 2, 'the new snapshot renders each platform as its own record');
  assert.equal(await page.getByRole('heading', { name: '微信视频号' }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: '抖音' }).count(), 1);
  const failedStatus = page.getByText('发布异常', { exact: true });
  assert.equal(await failedStatus.count(), 1);
  const failedStatusClass = await failedStatus.getAttribute('class');
  assert.match(failedStatusClass || '', /text-studio-coral-contrast/);
  assert.doesNotMatch(failedStatusClass || '', /text-studio-success-contrast/);
  assert.equal(await page.getByText('1,200', { exact: true }).count(), 1, 'the first platform keeps its own metric');
  assert.equal(await page.getByText('危险锚点', { exact: true }).count(), 1, 'sanitization preserves harmless text');
  assert.equal(await page.locator('[onerror]').count(), 0, 'historical HTML event attributes are removed');
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0, 'unsafe historical HTML links are removed');
  assert.equal(await page.locator('a[href="https://example.test/weixin/402"]').count(), 1, 'absolute HTTPS publication links remain available');
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0, 'unsafe snapshot publication URLs are not rendered as links');
  const renderedText = await page.locator('body').innerText();
  assert.match(renderedText, /归档正文/);
  assert.match(renderedText, /制作时保留的批注/);
  assert.doesNotMatch(renderedText, /published_records|publishing_id|\{"topic"/i, 'the detail view never falls back to serialized JSON');
  const inspectArchiveLayout = async (width: number, theme: 'light' | 'dark') => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const layout = await page.evaluate(() => {
      const bounds = (element: Element | null) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        returnLink: bounds(document.querySelector('[aria-label="返回所属资料库"]')),
        archive: bounds(document.querySelector('[data-testid="legacy-published-archive-snapshot"]')),
        records: [...document.querySelectorAll('[data-testid="legacy-published-record"]')].map(bounds),
        links: [...document.querySelectorAll('[data-testid="legacy-published-record"] a')].map(bounds),
      };
    });
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `the structured ${theme} archive fits a ${width}px viewport`);
    for (const [label, element] of [['return link', layout.returnLink], ['archive snapshot', layout.archive], ...layout.records.map((item, index) => [`published record ${index + 1}`, item] as const), ...layout.links.map((item, index) => [`published link ${index + 1}`, item] as const)] as const) {
      assert.ok(element && element.left >= -1 && element.right <= layout.viewportWidth + 1, `${label} stays inside the ${width}px ${theme} viewport`);
    }
    await page.screenshot({ path: `/tmp/xmt-resource-archive-${theme}-${width}.png`, fullPage: true });
  };

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?id=701&theme=${theme}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '新格式多平台归档' }).waitFor();
    await page.getByTestId('legacy-published-archive-snapshot').waitFor();
    assert.equal(await page.evaluate((expectedTheme) => document.documentElement.classList.contains(expectedTheme), theme), true, `the ${theme} theme is active for the structured archive matrix`);
    for (const width of [320, 390, 1440]) await inspectArchiveLayout(width, theme);
  }

  await page.goto(`${base}/__qa?id=702`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '旧格式单平台归档' }).waitFor();
  await page.getByTestId('legacy-published-archive-snapshot').waitFor();
  assert.equal(await page.getByTestId('legacy-published-record').count(), 1, 'the old singular publishing/analytics snapshot renders once');
  assert.equal(await page.getByText('88', { exact: true }).count(), 1);
  assert.equal(await page.locator('a[href="https://example.test/legacy/72"]').count(), 1);

  await page.goto(`${base}/__qa?id=706`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '可空字段归档' }).waitFor();
  await page.getByTestId('legacy-published-archive-snapshot').waitFor();
  assert.equal(await page.getByTestId('legacy-published-record').count(), 1, 'producer-nullable fields do not hide an otherwise valid archive');
  assert.equal(await page.getByText('选题平台：平台未记录', { exact: true }).count(), 1, 'topic platform null uses a neutral placeholder');
  assert.equal(await page.getByText('平台未记录', { exact: true }).count(), 1, 'publication platform null uses a neutral heading');
  assert.equal(await page.getByText('17', { exact: true }).count(), 1, 'nullable analytics date does not discard valid metrics');
  assert.equal(await page.getByText('安全归档正文', { exact: true }).count(), 0, 'nullable script content is omitted without exposing raw JSON');

  for (const id of [703, 705]) {
    await page.goto(`${base}/__qa?id=${id}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('legacy-published-archive-invalid').waitFor();
    assert.equal(await page.getByTestId('legacy-published-archive-snapshot').count(), 0, 'invalid archive JSON/shapes are not partially rendered');
    const fallbackText = await page.locator('body').innerText();
    assert.match(fallbackText, /旧版归档内容暂时无法识别/);
    assert.doesNotMatch(fallbackText, /published_records|publishing_id|\{"topic"/i, 'invalid raw JSON is not exposed in the page');
  }

  await page.goto(`${base}/__qa?id=704`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '普通内容档案' }).waitFor();
  assert.equal(await page.getByTestId('legacy-published-archive-snapshot').count(), 0, 'manual content archives do not enter the system snapshot renderer');
  assert.equal(await page.getByText('普通档案纯文本内容', { exact: true }).count(), 1, 'normal content archives keep their plain-text body');

  const verifyMutedContrast = async (width: number, height: number, expectedTheme: 'light' | 'dark') => {
    await page.setViewportSize({ width, height });
    const audit = await page.evaluate(() => {
      const parseColor = (value: string) => {
        const numbers = (value.match(/[0-9.]+/g) || []).map(Number);
        if (value.startsWith('color(srgb')) {
          return [numbers[0] * 255, numbers[1] * 255, numbers[2] * 255, numbers[3] ?? 1];
        }
        return [numbers[0] ?? 255, numbers[1] ?? 255, numbers[2] ?? 255, numbers[3] ?? 1];
      };
      const composite = (foreground: number[], background: number[]) => [
        foreground[0] * foreground[3] + background[0] * (1 - foreground[3]),
        foreground[1] * foreground[3] + background[1] * (1 - foreground[3]),
        foreground[2] * foreground[3] + background[2] * (1 - foreground[3]),
        1,
      ];
      const luminance = (color: number[]) => {
        const channels = color.slice(0, 3).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const contrast = (foreground: number[], background: number[]) => {
        const foregroundLuminance = luminance(foreground);
        const backgroundLuminance = luminance(background);
        return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
          / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
      };
      const samples = [...document.querySelectorAll<HTMLElement>('.text-studio-text-muted')]
        .filter((element) => element.textContent?.trim() && element.getBoundingClientRect().width > 0)
        .map((element) => {
          let background = [255, 255, 255, 1];
          const ancestors: HTMLElement[] = [];
          let ancestor = element.parentElement;
          while (ancestor) {
            ancestors.push(ancestor);
            ancestor = ancestor.parentElement;
          }
          for (const node of ancestors.reverse()) {
            const color = parseColor(getComputedStyle(node).backgroundColor);
            if (color[3] > 0) background = composite(color, background);
          }
          return { text: element.textContent?.trim() || '', contrast: contrast(parseColor(getComputedStyle(element).color), background) };
        });
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        theme: document.documentElement.dataset.theme,
        minimumContrast: Math.min(...samples.map((sample) => sample.contrast)),
        failures: samples.filter((sample) => sample.contrast < 4.5),
        sampleCount: samples.length,
      };
    });
    assert.equal(audit.viewportWidth, width, `${width}px test uses the real CSS viewport`);
    assert.equal(audit.documentWidth <= width + 1, true, `the resource detail fits ${width}px without horizontal overflow`);
    assert.equal(audit.theme, expectedTheme, `the resource detail uses the ${expectedTheme} theme`);
    assert.ok(audit.sampleCount > 0, 'the detail exposes visible muted text to inspect');
    assert.ok(audit.minimumContrast >= 4.5, `${expectedTheme} ${width}px muted text contrast: ${JSON.stringify(audit.failures)}`);
  };

  for (const [width, height] of [[1440, 900], [390, 844], [320, 740]] as const) {
    await verifyMutedContrast(width, height, 'light');
  }
  await page.evaluate(() => localStorage.setItem('xmt_theme', 'dark'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '普通内容档案' }).waitFor();
  for (const [width, height] of [[1440, 900], [390, 844], [320, 740]] as const) {
    await verifyMutedContrast(width, height, 'dark');
  }

  const legacyEndpointReads = apiRequests.filter(({ path }) => path.startsWith('/resources/archives'));
  assert.deepEqual(legacyEndpointReads, [], 'the detail renderer does not call the legacy archives endpoint');
  const writes = apiRequests.filter(({ method }) => method !== 'GET' && !method.startsWith('OPTIONS'));
  assert.deepEqual(writes, [], 'archive detail checks use read-only API requests');
  assert.deepEqual(pageErrors, [], 'archive detail pages render without uncaught browser errors');
  console.log('Resource archive detail browser contracts passed: new multi-platform and old single-platform snapshots, invalid data fallback, manual text fallback, safe links/HTML, GET-only access, and 320/390px layout.');
  }
} catch (error) {
  failure = error;
} finally {
  if (browser) await browser.close();
  await vite.close();
  io.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

if (failure) throw failure;
