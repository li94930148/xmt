import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const admin = { id: 972, username: 'calendar-qa', role: 'admin', name: '日历隔离验收', enabled: true, force_change_password: false };
const calendarFixtureTimeZone = 'Asia/Shanghai';
const today = new Date('2026-10-15T12:00:00+08:00');
const todayParts = new Intl.DateTimeFormat('en-US', {
  timeZone: calendarFixtureTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).formatToParts(today);
const currentYear = Number(todayParts.find((part) => part.type === 'year')?.value);
const currentMonth = Number(todayParts.find((part) => part.type === 'month')?.value);
const currentDay = Number(todayParts.find((part) => part.type === 'day')?.value);
const todayKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
const formatCalendarMonth = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月`;
const previousDate = new Date(currentYear, currentMonth - 1, 0);
const previousMonthKey = `${previousDate.getFullYear()}-${previousDate.getMonth() + 1}`;
const currentMonthKey = `${currentYear}-${currentMonth}`;
const previousMonthLastDate = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}-${String(previousDate.getDate()).padStart(2, '0')}`;
const currentMonthFirstDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
const semanticEventCases = [
  { eventType: 'deadline', typeLabel: '截止', tone: 'coral', title: '语义色-截止', badgeClass: 'border-studio-coral/30 bg-studio-coral/10 text-studio-coral-contrast', dotClass: 'bg-studio-coral-contrast' },
  { eventType: 'meeting', typeLabel: '会议', tone: 'primary', title: '语义色-会议', badgeClass: 'border-studio-primary/30 bg-studio-primary/10 text-studio-primary-contrast', dotClass: 'bg-studio-primary-contrast' },
  { eventType: 'review', typeLabel: '审核', tone: 'amber', title: '语义色-审核', badgeClass: 'border-studio-amber/30 bg-studio-amber/10 text-studio-amber-contrast', dotClass: 'bg-studio-amber-contrast' },
  { eventType: 'publish', typeLabel: '发布', tone: 'success', title: '语义色-发布', badgeClass: 'border-studio-success/30 bg-studio-success/10 text-studio-success-contrast', dotClass: 'bg-studio-success-contrast' },
  { eventType: 'shooting', typeLabel: '拍摄', tone: 'cyan', title: '语义色-拍摄', badgeClass: 'border-studio-cyan/30 bg-studio-cyan/10 text-studio-cyan-contrast', dotClass: 'bg-studio-cyan-contrast' },
  { eventType: 'other', typeLabel: '事项', tone: 'muted', title: '语义色-其他', badgeClass: 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary', dotClass: 'bg-studio-text-muted' },
] as const;
const semanticEventFixtures = semanticEventCases.map((event, index) => {
  const date = new Date(currentYear, currentMonth - 1, index + 2);
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { ...event, id: 1010 + index, dateKey };
});

let delayMonthKey: string | null = null;
let failMonthKey: string | null = null;
let pendingMonthKey: string | null = null;
let releaseDelayedMonth: (() => void) | null = null;
let delayedMonthRequests = 0;

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => {
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(admin))});localStorage.setItem('xmt_token','calendar-qa-fixture');localStorage.setItem('xmt_theme','dark');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/calendar');</script>`);
});
app.post('/__qa/delay-month', (req, res) => {
  delayMonthKey = String(req.body?.monthKey || '');
  res.json({ delayed: delayMonthKey });
});
app.post('/__qa/fail-month', (req, res) => {
  failMonthKey = String(req.body?.monthKey || '');
  res.json({ failing: failMonthKey });
});
app.get('/__qa/status', (_req, res) => res.json({ pendingMonthKey, delayedMonthRequests }));
app.post('/__qa/release-month', (req, res) => {
  const requestedMonthKey = String(req.body?.monthKey || '');
  const release = requestedMonthKey === pendingMonthKey ? releaseDelayedMonth : null;
  releaseDelayedMonth = null;
  pendingMonthKey = null;
  release?.();
  res.json({ released: Boolean(release) });
});
app.get('/api/auth/me', (_req, res) => res.json(admin));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({
  version,
  system: { name: '日历隔离验收', browserTitle: '日历隔离验收', defaultTheme: 'dark' },
}));
app.get('/api/topics', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 200 }));
app.get('/api/calendar', async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const monthKey = `${year}-${month}`;
  if (delayMonthKey === monthKey) {
    delayMonthKey = null;
    pendingMonthKey = monthKey;
    delayedMonthRequests += 1;
    await new Promise<void>((resolve) => { releaseDelayedMonth = resolve; });
  }
  if (failMonthKey === monthKey) {
    failMonthKey = null;
    res.status(503).json({ message: '隔离夹具模拟旧月份读取失败' });
    return;
  }
  const data = monthKey === currentMonthKey
    ? [
      { id: 1001, title: '当月排期事项', event_date: `${currentMonthFirstDate}T10:00:00`, event_type: 'meeting', topic_id: null, creator_id: admin.id },
      { id: 1003, title: '团队选题会', event_date: `${currentMonthFirstDate}T11:00:00`, event_type: 'meeting', topic_id: null, creator_id: admin.id },
      { id: 1004, title: '脚本审核沟通', event_date: `${currentMonthFirstDate}T13:00:00`, event_type: 'meeting', topic_id: null, creator_id: admin.id },
      { id: 1005, title: '发布复盘', event_date: `${currentMonthFirstDate}T15:00:00`, event_type: 'meeting', topic_id: null, creator_id: admin.id },
      ...semanticEventFixtures.map((event) => ({ id: event.id, title: event.title, event_date: `${event.dateKey}T10:00:00`, event_type: event.eventType, topic_id: null, creator_id: admin.id })),
    ]
    : monthKey === previousMonthKey
      ? [{ id: 1002, title: '上月延迟排期事项', event_date: `${previousMonthLastDate}T10:00:00`, event_type: 'meeting', topic_id: null, creator_id: admin.id }]
      : [];
  res.json({ data });
});
app.use('/api', (_req, res) => res.json({ success: true, data: {} }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
const requestedPort = Number(process.env.XMT_BROWSER_MCP_PORT) || 0;
await new Promise<void>((resolve) => server.listen(requestedPort, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
let expected503Count = 0;

async function assertCalendarReady(page: Page, viewportWidth: number) {
  assert.match(page.url(), /\/calendar$/);
  await page.getByRole('heading', { name: '排期日历', exact: true }).waitFor();
  assert.equal(await page.locator('vite-error-overlay, #vite-error-overlay').count(), 0, 'calendar has no framework error overlay');
  const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth, viewport: window.innerWidth }));
  assert.equal(widths.viewport, viewportWidth);
  assert.ok(widths.document <= viewportWidth && widths.body <= viewportWidth, `calendar must not overflow horizontally: ${JSON.stringify(widths)}`);
}

async function assertCurrentDateMarker(page: Page, expected: boolean) {
  const currentDateButtons = page.locator('button[aria-label*="日程"][aria-current="date"]');
  assert.equal(await currentDateButtons.count(), expected ? 1 : 0, expected
    ? 'the visible calendar month marks exactly one current date'
    : 'a month that does not contain today has no current-date marker');
  if (expected) {
    const label = await currentDateButtons.first().getAttribute('aria-label');
    assert.ok(label?.startsWith(`${todayKey}，`), `the current-date marker names today (${todayKey}): ${label}`);
  }
}

async function assertCalendarCellsFitPanel(page: Page, viewportWidth: number) {
  const geometry = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('.studio-sheen')].find((element) =>
      element.classList.contains('overflow-hidden') && element.querySelector('button[aria-label*="日程"]'),
    );
    const dayGrid = panel?.querySelector('[role="grid"]');
    if (!panel || !dayGrid) return null;
    const panelBounds = panel.getBoundingClientRect();
    const cells = [...dayGrid.querySelectorAll('[role="gridcell"] > button[aria-label*="日程"]')];
    const cellBounds = cells.map((cell) => cell.getBoundingClientRect());
    return {
      panelWidth: panelBounds.width,
      calendarWidth: dayGrid.getBoundingClientRect().width,
      cellCount: cells.length,
      columnCount: new Set(cellBounds.map((bounds) => Math.round(bounds.x))).size,
      clippedCells: cellBounds.filter((bounds) => bounds.left < panelBounds.left + 1 || bounds.right > panelBounds.right - 1).length,
    };
  });
  assert.ok(geometry, `calendar grid is present at ${viewportWidth}px`);
  assert.equal(geometry?.cellCount, 42, `all 42 calendar date cells render at ${viewportWidth}px`);
  assert.equal(geometry?.columnCount, 7, `all seven calendar columns render at ${viewportWidth}px`);
  assert.equal(geometry?.clippedCells, 0, `calendar cells are not clipped by the glass panel at ${viewportWidth}px: ${JSON.stringify(geometry)}`);
}

async function assertCalendarGridKeyboardNavigation(page: Page) {
  const gridName = `${formatCalendarMonth(today)}日历`;
  const grid = page.getByRole('grid', { name: gridName });
  assert.equal(await grid.getByRole('row').count(), 7, 'the calendar exposes a weekday header and six week rows');
  assert.equal(await grid.getByRole('columnheader').count(), 7, 'the calendar names its seven weekday columns');
  assert.equal(await grid.getByRole('gridcell').count(), 42, 'all 42 dates are exposed as grid cells');

  const dateButton = (date: string) => grid.locator(`[role="gridcell"] > button[aria-label^="${date}，"]`);
  const assertFocusedDate = async (date: string) => {
    await page.waitForFunction((expectedDate) => {
      const currentGrid = document.querySelector('[role="grid"]');
      const tabStops = [...(currentGrid?.querySelectorAll('[role="gridcell"] > button[tabindex="0"]') || [])];
      return tabStops.length === 1
        && tabStops[0].getAttribute('aria-label')?.startsWith(`${expectedDate}，`)
        && document.activeElement === tabStops[0];
    }, date);
  };

  await dateButton(todayKey).focus();
  await assertFocusedDate(todayKey);
  await page.keyboard.press('ArrowRight');
  await assertFocusedDate('2026-10-16');
  await page.keyboard.press('ArrowLeft');
  await assertFocusedDate(todayKey);
  await page.keyboard.press('ArrowDown');
  await assertFocusedDate('2026-10-22');
  await page.keyboard.press('ArrowUp');
  await assertFocusedDate(todayKey);
  await page.keyboard.press('Home');
  await assertFocusedDate('2026-10-12');
  await page.keyboard.press('End');
  await assertFocusedDate('2026-10-18');

  await dateButton('2026-10-31').focus();
  await assertFocusedDate('2026-10-31');
  const novemberResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/calendar'
      && url.searchParams.get('year') === '2026'
      && url.searchParams.get('month') === '11'
      && response.status() === 200;
  });
  await page.keyboard.press('ArrowRight');
  await novemberResponse;
  await assertFocusedDate('2026-11-01');
  assert.equal(await page.getByRole('grid', { name: '2026年11月日历' }).count(), 1, 'crossing into a new month updates the grid label');

  const octoberResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/calendar'
      && url.searchParams.get('year') === '2026'
      && url.searchParams.get('month') === '10'
      && response.status() === 200;
  });
  await page.getByRole('button', { name: '上月' }).click();
  await octoberResponse;
  const activeDate = await page.locator('[role="grid"] [role="gridcell"] > button[tabindex="0"]').getAttribute('aria-label');
  assert.ok(activeDate?.startsWith('2026-10-01，'), `toolbar month navigation leaves one date tab stop in the displayed month: ${activeDate}`);
  assert.deepEqual(businessWrites, [], 'calendar keyboard navigation and month loading issue no business mutation requests');
}

async function measureContrast(locator: Locator, foregroundMode: 'text' | 'background' = 'text') {
  return locator.evaluate((element, mode) => {
    const parseColor = (value: string) => {
      const rgb = value.match(/rgba?\(([^)]+)\)/);
      if (rgb) {
        const channels = rgb[1].split(',').map(Number);
        return [channels[0], channels[1], channels[2], channels[3] ?? 1];
      }
      const srgb = value.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
      return srgb ? [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, Number(srgb[4] ?? 1)] : null;
    };
    const luminance = (color: number[]) => color.slice(0, 3)
      .map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const blend = (foreground: number[], background: number[]) => foreground.slice(0, 3)
      .map((channel, index) => channel * foreground[3] + background[index] * (1 - foreground[3]));

    let background = [255, 255, 255];
    const ancestry: Element[] = [];
    for (let current: Element | null = mode === 'text' ? element : element.parentElement; current; current = current.parentElement) {
      ancestry.push(current);
      if (current === document.documentElement) break;
    }
    ancestry.reverse().forEach((ancestor) => {
      const color = parseColor(getComputedStyle(ancestor).backgroundColor);
      if (color && color[3] > 0) background = blend(color, background);
    });

    const foreground = parseColor(mode === 'text' ? getComputedStyle(element).color : getComputedStyle(element).backgroundColor);
    if (!foreground) return 0;
    const foregroundColor = blend(foreground, background);
    const foregroundLuminance = luminance(foregroundColor);
    const backgroundLuminance = luminance(background);
    return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
      / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
  }, foregroundMode);
}

async function assertTextContrast(locator: Locator, label: string) {
  const ratio = await measureContrast(locator);
  assert.ok(ratio >= 4.5, `${label} text contrast is ${ratio.toFixed(2)}:1, expected at least 4.5:1`);
}

async function assertMarkerContrast(locator: Locator, label: string) {
  const ratio = await measureContrast(locator, 'background');
  assert.ok(ratio >= 3, `${label} marker contrast is ${ratio.toFixed(2)}:1, expected at least 3:1`);
}

async function assertCalendarEventBadgeContrast(page: Page) {
  for (const event of semanticEventFixtures) {
    const dayCell = page.getByRole('button', { name: `${event.dateKey}，1 项日程` });
    const badge = dayCell.getByText(event.title, { exact: true });
    await badge.waitFor({ state: 'visible' });
    const className = await badge.getAttribute('class');
    assert.ok(className?.includes(event.badgeClass), `${event.eventType} month badge uses its ${event.tone} semantic foreground/background tokens`);
    await assertTextContrast(badge, `${event.eventType} month-view badge`);
  }
}

async function assertCalendarEventMarkers(page: Page, viewportWidth: number) {
  for (const event of semanticEventFixtures) {
    const dayCell = page.getByRole('button', { name: `${event.dateKey}，1 项日程` });
    const marker = dayCell.locator('div[aria-hidden="true"] > span').first();
    await marker.waitFor({ state: 'visible' });
    const className = await marker.getAttribute('class');
    assert.ok(className?.includes(event.dotClass), `${event.eventType} marker keeps its semantic dot color at ${viewportWidth}px`);
    await assertMarkerContrast(marker, `${event.eventType} marker at ${viewportWidth}px`);
  }
}

async function assertCalendarEventAccessibleDescriptions(page: Page, viewportWidth: number, theme: 'dark' | 'light') {
  await assertCalendarReady(page, viewportWidth);
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme, `calendar is using the ${theme} theme at ${viewportWidth}px`);

  const dayCells = page.locator('[role="gridcell"] > button[aria-label*="日程"]');
  const references = await dayCells.evaluateAll((buttons) => buttons.map((button) => ({
    label: button.getAttribute('aria-label') || '',
    descriptionId: button.getAttribute('aria-describedby'),
  })));
  assert.equal(references.length, 42, `all date buttons expose accessible names at ${viewportWidth}px`);
  const populatedReferences = references.filter((reference) => reference.label.endsWith('项日程'));
  const emptyReferences = references.filter((reference) => reference.label.endsWith('无日程'));
  const descriptionIds = populatedReferences.map((reference) => reference.descriptionId);
  assert.ok(descriptionIds.every((id) => Boolean(id)), `every eventful date has an accessible description reference at ${viewportWidth}px`);
  assert.equal(new Set(descriptionIds).size, populatedReferences.length, `event description IDs are unique at ${viewportWidth}px`);
  assert.ok(emptyReferences.length > 0, `the fixture includes empty dates at ${viewportWidth}px`);
  assert.ok(emptyReferences.every((reference) => reference.descriptionId === null), `empty dates have no dangling description reference at ${viewportWidth}px`);

  for (const reference of populatedReferences) {
    const id = reference.descriptionId;
    assert.ok(id, `eventful day ${reference.label} has a description ID`);
    const description = page.locator(`[id="${id}"]`);
    assert.equal(await description.count(), 1, `${reference.label} points to exactly one description element`);
    assert.ok((await description.getAttribute('class'))?.split(/\s+/).includes('sr-only'), `${reference.label} description is visually hidden but available to assistive technology`);
    assert.ok((await description.textContent())?.trim(), `${reference.label} description is not empty`);
  }

  for (const event of semanticEventFixtures) {
    const accessibleName = `${event.dateKey}，1 项日程`;
    const cell = page.getByRole('button', { name: accessibleName, exact: true });
    const snapshot = await cell.ariaSnapshot();
    assert.ok(snapshot.includes(`button "${accessibleName}"`), `${event.eventType} ARIA snapshot retains its date-and-count button name at ${viewportWidth}px`);
    const expectedDescription = `${event.typeLabel}：${event.title}`;
    assert.equal(
      await page.getByRole('button', { name: accessibleName, description: expectedDescription, exact: true }).count(),
      1,
      `${event.eventType} accessible description is present at ${viewportWidth}px even when mobile dots are aria-hidden`,
    );
    const descriptionId = await cell.getAttribute('aria-describedby');
    assert.ok(descriptionId, `${event.eventType} event button references its description`);
    assert.equal(await page.locator(`[id="${descriptionId}"]`).textContent(), expectedDescription, `${event.eventType} description contains its type and title`);
  }
}

async function assertCalendarTextContrast(page: Page, includesOverflowLabel: boolean) {
  await assertTextContrast(page.getByText('周一', { exact: true }), 'weekday label');
  const previousMonthDay = page.getByRole('button', { name: `${previousMonthLastDate}，无日程` }).locator('span').first();
  await assertTextContrast(previousMonthDay, 'previous-month day');
  const firstDay = page.getByRole('button', { name: `${currentMonthFirstDate}，4 项日程` });
  await assertTextContrast(firstDay.locator('span').nth(1), 'calendar event count');
  if (includesOverflowLabel) await assertTextContrast(page.getByText('+1 更多', { exact: true }), 'calendar overflow count');
}

if (process.env.XMT_CALENDAR_RACE_QA_SERVE === '1') {
  console.log(`Isolated calendar month-race fixture: ${base}/__qa`);
  await new Promise<void>(() => {});
}

let browser: Browser | undefined;
const errors: string[] = [];
const businessWrites: string[] = [];
const businessReads: string[] = [];

async function dropSessionStorageWrite(page: Page, key: string) {
  await page.evaluate((markerKey) => {
    const storage = window.sessionStorage;
    const originalSetItem = Storage.prototype.setItem.bind(storage);
    Object.defineProperty(storage, 'setItem', {
      configurable: true,
      value: (candidateKey: string, value: string) => {
        if (candidateKey === markerKey) return;
        originalSetItem(candidateKey, value);
      },
    });
  }, key);
}

async function restoreSessionStorageWrite(page: Page) {
  await page.evaluate(() => {
    Reflect.deleteProperty(window.sessionStorage, 'setItem');
  });
}

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', timezoneId: calendarFixtureTimeZone });
  await page.clock.install({ time: today });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      if (request.method() === 'GET') businessReads.push(`${request.method()} ${url.pathname}`);
      else businessWrites.push(`${request.method()} ${url.pathname}`);
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expected503Count > 0 && message.text().includes('503')) { expected503Count -= 1; return; }
    errors.push(message.text());
  });
  await page.goto(`${base}/__qa`);
  await assertCalendarReady(page, 1440);
  await page.getByText('当月排期事项', { exact: true }).waitFor();
  await assertCurrentDateMarker(page, true);
  await assertCalendarEventBadgeContrast(page);
  await assertCalendarEventAccessibleDescriptions(page, 1440, 'dark');
  const monthAnnouncement = page.locator('[role="status"][aria-live="polite"][aria-atomic="true"]')
    .filter({ hasText: /^\d{4}年\d{1,2}月$/ });
  assert.equal(await monthAnnouncement.count(), 1, 'the visible month uses one polite, atomic status region');
  assert.equal(await monthAnnouncement.textContent(), formatCalendarMonth(today), 'the status region announces the initial month');
  await assertCalendarGridKeyboardNavigation(page);
  await assertCalendarTextContrast(page, true);
  await page.screenshot({ path: '/tmp/xmt-calendar-month-race-1440.png', fullPage: false });

  for (const viewportWidth of [768, 1024, 1280, 1366, 1440]) {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    await assertCalendarReady(page, viewportWidth);
    await assertCalendarCellsFitPanel(page, viewportWidth);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate(async (monthKey) => {
    await fetch('/__qa/delay-month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthKey }) });
  }, previousMonthKey);
  const previousMonthRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/calendar' && url.searchParams.get('year') === String(previousDate.getFullYear()) && url.searchParams.get('month') === String(previousDate.getMonth() + 1);
  });
  await page.getByRole('button', { name: '上月' }).click();
  await previousMonthRequest;
  await assertCurrentDateMarker(page, false);
  assert.equal(await monthAnnouncement.textContent(), formatCalendarMonth(previousDate), 'the same month status region announces the previous month');
  await page.waitForFunction(async (monthKey) => {
    const status = await fetch('/__qa/status').then((response) => response.json());
    return status.pendingMonthKey === monthKey;
  }, previousMonthKey);

  const currentMonthResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/calendar' && url.searchParams.get('year') === String(currentYear) && url.searchParams.get('month') === String(currentMonth) && response.status() === 200;
  });
  await page.getByRole('button', { name: '下月' }).click();
  await currentMonthResponse;
  assert.equal(await monthAnnouncement.count(), 1, 'month changes do not create duplicate announcement regions');
  assert.equal(await monthAnnouncement.textContent(), formatCalendarMonth(today), 'the status region announces the current month after returning');
  await assertCurrentDateMarker(page, true);
  await page.getByText('当月排期事项', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.querySelectorAll('button').length > 0), true, 'calendar day controls remain available while current month data is visible');

  const delayedResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/calendar' && url.searchParams.get('year') === String(previousDate.getFullYear()) && url.searchParams.get('month') === String(previousDate.getMonth() + 1) && response.status() === 200;
  });
  const release = await page.evaluate(async (monthKey) => fetch('/__qa/release-month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthKey }) }).then((response) => response.json()), previousMonthKey);
  assert.equal(release.released, true, 'the delayed previous-month response was released');
  await delayedResponse;
  await page.waitForTimeout(50);
  assert.equal(await page.getByText('当月排期事项', { exact: true }).count(), 1, 'the current month event remains visible after the stale response completes');
  assert.equal(await page.getByText('上月延迟排期事项', { exact: true }).count(), 0, 'the stale previous-month event never replaces current month data');

  await page.evaluate(async (monthKey) => {
    await fetch('/__qa/delay-month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthKey }) });
    await fetch('/__qa/fail-month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthKey }) });
  }, previousMonthKey);
  const delayedFailingRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/calendar' && url.searchParams.get('year') === String(previousDate.getFullYear()) && url.searchParams.get('month') === String(previousDate.getMonth() + 1);
  });
  await page.getByRole('button', { name: '上月' }).click();
  await delayedFailingRequest;
  await page.waitForFunction(async (monthKey) => {
    const status = await fetch('/__qa/status').then((response) => response.json());
    return status.pendingMonthKey === monthKey;
  }, previousMonthKey);
  const currentMonthAfterFailureResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/calendar' && url.searchParams.get('year') === String(currentYear) && url.searchParams.get('month') === String(currentMonth) && response.status() === 200;
  });
  await page.getByRole('button', { name: '下月' }).click();
  await currentMonthAfterFailureResponse;
  await page.getByText('当月排期事项', { exact: true }).waitFor();
  const delayedFailureResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/calendar' && url.searchParams.get('year') === String(previousDate.getFullYear()) && url.searchParams.get('month') === String(previousDate.getMonth() + 1) && response.status() === 503;
  });
  expected503Count = 1;
  const releaseFailure = await page.evaluate(async (monthKey) => fetch('/__qa/release-month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthKey }) }).then((response) => response.json()), previousMonthKey);
  assert.equal(releaseFailure.released, true, 'the delayed previous-month failure was released');
  await delayedFailureResponse;
  await page.waitForTimeout(50);
  assert.equal(await page.getByText('当月排期事项', { exact: true }).count(), 1, 'a stale error does not replace the successful current month');
  assert.equal(await page.getByText('日历加载失败', { exact: true }).count(), 0, 'a stale error does not display a current-month error state');
  assert.equal(errors.length, 0, `calendar should render without browser errors: ${errors.slice(0, 3).join(' | ')}`);
  await page.screenshot({ path: '/tmp/xmt-calendar-month-race-1440-after.png', fullPage: false });

  const announceMonthAfterClick = async (direction: '上月' | '下月', date: Date) => {
    const expectedLabel = formatCalendarMonth(date);
    await page.getByRole('button', { name: direction }).click();
    await page.waitForFunction((label) => [...document.querySelectorAll('[role="status"][aria-live="polite"][aria-atomic="true"]')]
      .some((element) => element.textContent?.trim() === label), expectedLabel);
    assert.equal(await monthAnnouncement.count(), 1, 'there is still one month announcement region after navigation');
    assert.equal(await monthAnnouncement.textContent(), expectedLabel, `month navigation announces ${expectedLabel}`);
  };
  let monthCursor = new Date(currentYear, currentMonth - 1, 1);
  while (monthCursor.getMonth() !== 11) {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    await announceMonthAfterClick('下月', monthCursor);
  }
  monthCursor = new Date(currentYear, 12, 1);
  await announceMonthAfterClick('下月', monthCursor);
  monthCursor = new Date(currentYear, 11, 1);
  await announceMonthAfterClick('上月', monthCursor);
  while (monthCursor.getMonth() + 1 > currentMonth) {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
    await announceMonthAfterClick('上月', monthCursor);
  }

  await page.getByRole('button', { name: '切换主题' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await assertCalendarEventAccessibleDescriptions(page, 1440, 'light');
  await assertCalendarTextContrast(page, true);
  await assertCalendarEventBadgeContrast(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await assertCalendarEventAccessibleDescriptions(page, 390, 'light');
  await assertCalendarTextContrast(page, false);
  await assertCalendarEventMarkers(page, 390);
  await page.getByRole('navigation', { name: '移动主导航' }).waitFor();
  await page.getByRole('button', { name: '切换主题' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.reload();
  await assertCalendarEventAccessibleDescriptions(page, 390, 'dark');
  await assertCalendarTextContrast(page, false);
  await assertCalendarEventMarkers(page, 390);
  await page.getByRole('navigation', { name: '移动主导航' }).waitFor();
  await page.getByRole('button', { name: `${currentMonthFirstDate}，4 项日程` }).click();
  for (const label of ['标题 *', '描述', '类型', '关联选题']) {
    assert.equal(await page.getByLabel(label).count(), 1, `calendar event field "${label}" has an associated accessible label`);
  }
  const eventDialog = page.getByRole('dialog', { name: '创建事件' });
  const titleField = eventDialog.getByLabel('标题 *');
  assert.equal(await titleField.getAttribute('required'), '', 'the accessible event title field exposes native required semantics');
  await page.getByRole('heading', { name: '创建事件' }).waitFor();
  await eventDialog.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByText('请输入事件标题', { exact: true }).waitFor();
  assert.deepEqual(businessWrites, [], 'an empty event title is rejected before any event-creation request');
  await titleField.fill('恢复编号静默丢写不得创建');
  await dropSessionStorageWrite(page, 'xmt:calendar-create-pending:v1:user:972');
  await eventDialog.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByText('浏览器无法保存本次恢复信息，请检查会话存储后重试。', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:calendar-create-pending:v1:user:972')), null, 'a silently dropped calendar recovery marker is not treated as persisted');
  assert.deepEqual(businessWrites, [], 'a silently dropped calendar recovery marker prevents the event-creation request');
  await restoreSessionStorageWrite(page);
  await page.screenshot({ path: '/tmp/xmt-calendar-month-race-390.png', fullPage: false });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  await assertCalendarEventAccessibleDescriptions(page, 320, 'dark');
  await assertCalendarTextContrast(page, false);
  await assertCalendarEventMarkers(page, 320);
  await page.getByRole('button', { name: '切换主题' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await assertCalendarEventAccessibleDescriptions(page, 320, 'light');
  await assertCalendarTextContrast(page, false);
  await assertCalendarEventMarkers(page, 320);
  assert.deepEqual(businessWrites, [], `calendar visual checks must remain read-only: ${businessWrites.join(', ')}`);
  assert.ok(businessReads.length > 0, 'calendar isolated checks issue read-only API GET requests');
  console.log('日历月份读屏语义、跨年播报、六类事件徽标/标记明暗主题对比度、320/390/桌面视口与只读 API 回归通过；旧月份迟到成功/失败响应均未覆盖当前月份，所有日期列未被面板裁切。');
} finally {
  await browser?.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
}
