import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@libsql/client';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const API_BASE = new URL('/api', BASE_URL).toString().replace(/\/$/, '');

const accounts = [
  { username: '1', password: '1', role: 'admin', label: '管理员' },
  { username: '2', password: '2', role: 'director', label: '管理层' },
  { username: '3', password: '3', role: 'member', label: '普通人员' },
  { username: '4', password: '4', role: 'editor', label: '通用编辑' },
  { username: '5', password: '5', role: 'copywriter', label: '文案' },
  { username: '6', password: '6', role: 'post_production', label: '后期' },
  { username: '7', password: '7', role: 'camera', label: '摄像' },
];
const selectedAccounts = process.env.E2E_ONLY_ACCOUNT
  ? accounts.filter((account) => account.username === process.env.E2E_ONLY_ACCOUNT || account.role === process.env.E2E_ONLY_ACCOUNT)
  : accounts;

const coreRoutes = [
  '/',
  '/users',
  '/permissions',
  '/topics',
  '/production',
  '/inspirations',
  '/messages',
  '/notification-settings',
];

const contentRoles = new Set(['editor', 'copywriter', 'post_production', 'camera']);
const expectedRoleNames = ['管理员', '管理层', '普通人员', '通用编辑', '文案', '后期', '摄像'];
const watchedStatuses = new Set([401, 403, 404, 500]);

function getDatabasePath() {
  const configuredPath =
    process.env.XMT_DB_PATH?.trim() ||
    process.env.DATABASE_PATH?.trim() ||
    (process.env.DATABASE_URL || '').replace(/^file:/, '').trim();

  if (!configuredPath) {
    return path.join(process.cwd(), 'data', 'xmt.db');
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

function countPayload(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  if (typeof payload.total === 'number') return payload.total;
  if (Array.isArray(payload.data)) return payload.data.length;
  if (Array.isArray(payload)) return payload.length;
  return 0;
}

function isApiUrl(url) {
  try {
    return new URL(url).pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

async function requestJson(pathname, token) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function loginByApi(account) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: account.username, password: account.password }),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body, token: body.token };
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.fill(value);
      return true;
    }
  }
  return false;
}

async function clickFirst(page, selectors, timeout = 2_000) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.click({ timeout });
      return true;
    }
  }
  return false;
}

async function dismissBlockingOverlays(page) {
  await page.evaluate(() => {
    localStorage.setItem('xmt_last_seen_version', 'permission-e2e');
  }).catch(() => {});

  const updateOverlay = page.locator('.z-\\[300\\] button').first();
  if ((await updateOverlay.count().catch(() => 0)) > 0) {
    await updateOverlay.click({ timeout: 1_000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function primeUiSession(page, apiLogin) {
  page.setDefaultTimeout(6_000);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 12_000 });
  await page.evaluate(({ user, token }) => {
    localStorage.setItem('xmt_user', JSON.stringify(user));
    localStorage.setItem('xmt_token', token);
    sessionStorage.removeItem('xmt_user');
    sessionStorage.removeItem('xmt_token');
    localStorage.setItem('xmt_last_seen_version', 'permission-e2e');
  }, { user: apiLogin.body.user, token: apiLogin.token });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(700);
  await dismissBlockingOverlays(page);
  return !new URL(page.url()).pathname.includes('/login');
}

async function collectMenuPaths(page) {
  return page.locator('nav button').evaluateAll((buttons) =>
    buttons
      .map((button) => ({
        title: button.getAttribute('title') || '',
        text: button.textContent?.trim() || '',
      }))
      .filter((item) => item.title || item.text),
  ).catch(() => []);
}

async function openRoute(page, route) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(500);
  await dismissBlockingOverlays(page);
  const text = (await page.locator('body').innerText().catch(() => '')).trim();
  return {
    route,
    finalPath: new URL(page.url()).pathname,
    redirectedToLogin: new URL(page.url()).pathname.includes('/login'),
    hasAccessDenied: /权限不足|没有访问|Access Denied|无权限/.test(text),
    blank: text.length === 0,
  };
}

async function testUsersRoleDropdown(page) {
  const result = {
    createOptions: [],
    editOptions: [],
    assignableStatus: [],
    hasAllExpectedCreateRoles: false,
    hasAllExpectedEditRoles: false,
  };

  const assignableResponses = [];
  const onResponse = (response) => {
    const url = response.url();
    if (isApiUrl(url) && new URL(url).pathname === '/api/users/assignable-roles') {
      assignableResponses.push(response.status());
    }
  };
  page.on('response', onResponse);

  await page.goto(`${BASE_URL}/users`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
  await dismissBlockingOverlays(page);

  const openedCreate = await clickFirst(page, [
    'button:has-text("添加用户")',
    'button:has-text("新增用户")',
    'button:has-text("创建用户")',
  ], 5_000);

  if (openedCreate) {
    await page.waitForTimeout(600);
    result.createOptions = await page.locator('select option').evaluateAll((options) =>
      options.map((option) => option.textContent?.trim() || '').filter(Boolean),
    ).catch(() => []);
    await clickFirst(page, ['button:has-text("取消")', 'button[aria-label="Close"]']).catch(() => {});
  }

  const openedEdit = await clickFirst(page, [
    'button[title="编辑"]',
    'button:has(svg):near(td:has-text("1"))',
  ], 5_000);

  if (openedEdit) {
    await page.waitForTimeout(600);
    result.editOptions = await page.locator('select option').evaluateAll((options) =>
      options.map((option) => option.textContent?.trim() || '').filter(Boolean),
    ).catch(() => []);
    await clickFirst(page, ['button:has-text("取消")', 'button[aria-label="Close"]']).catch(() => {});
  }

  page.off('response', onResponse);
  result.assignableStatus = assignableResponses;
  result.hasAllExpectedCreateRoles = expectedRoleNames.every((name) => result.createOptions.includes(name));
  result.hasAllExpectedEditRoles = expectedRoleNames.every((name) => result.editOptions.includes(name));
  return result;
}

async function readDbExpectations() {
  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) {
    return { available: false, reason: `database not found: ${dbPath}` };
  }

  const db = createClient({ url: `file:${dbPath}` });
  const users = await db.execute("SELECT id, username, role FROM users WHERE username IN ('1','2','3','4','5','6','7')");
  const topicAll = await db.execute('SELECT COUNT(*) AS count FROM topics');
  const productionAll = await db.execute('SELECT COUNT(*) AS count FROM production');
  const shootingAll = await db.execute('SELECT COUNT(*) AS count FROM shooting');
  const publishingAll = await db.execute('SELECT COUNT(*) AS count FROM publishing');

  return {
    available: true,
    accountRows: users.rows.map((row) => ({ username: String(row.username), role: String(row.role) })),
    all: {
      topics: Number(topicAll.rows[0]?.count || 0),
      production: Number(productionAll.rows[0]?.count || 0),
      shooting: Number(shootingAll.rows[0]?.count || 0),
      publishing: Number(publishingAll.rows[0]?.count || 0),
    },
  };
}

async function runAccount(browser, account, dbExpectations) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  await context.addInitScript(() => {
    localStorage.setItem('xmt_last_seen_version', 'permission-e2e');
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const badResponses = [];
  const apiRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!isApiUrl(url)) return;
    const pathname = new URL(url).pathname;
    const status = response.status();
    apiRequests.push({ method: response.request().method(), path: pathname, status });
    if (watchedStatuses.has(status)) {
      badResponses.push({ method: response.request().method(), path: pathname, status });
    }
  });

  const result = {
    account: account.username,
    role: account.role,
    label: account.label,
    login: { api: false, ui: false, status: null },
    menus: [],
    routes: [],
    apiCounts: {},
    usersDropdown: null,
    badResponses,
    consoleMessages,
    unexpectedRequests: [],
    assertions: [],
  };

  const apiLogin = await loginByApi(account);
  result.login.api = apiLogin.ok;
  result.login.status = apiLogin.status;

  if (!apiLogin.ok || !apiLogin.token) {
    await context.close();
    result.assertions.push(`API login failed: ${apiLogin.status}`);
    return result;
  }

  result.login.ui = await primeUiSession(page, apiLogin);
  result.menus = await collectMenuPaths(page);

  for (const route of coreRoutes) {
    console.log(`[permission-e2e] ${account.username}/${account.role} route ${route}`);
    result.routes.push(await openRoute(page, route));
  }

  for (const [key, pathname] of Object.entries({
    topics: '/topics?limit=1000',
    production: '/workflow/production?limit=1000',
    shooting: '/workflow/shooting?limit=1000',
    publishing: '/workflow/publishing?limit=1000',
  })) {
    const response = await requestJson(pathname, apiLogin.token);
    result.apiCounts[key] = { status: response.status, count: countPayload(response.body) };
  }

  if (account.role === 'admin') {
    result.usersDropdown = await testUsersRoleDropdown(page);
  }

  const requestedPaths = apiRequests.map((item) => item.path);
  if (!['admin'].includes(account.role) && requestedPaths.includes('/api/roles')) {
    result.unexpectedRequests.push('requested /api/roles without system:role');
  }
  if (!['admin'].includes(account.role) && requestedPaths.some((path) => path.includes('/api/users/logs') || path.includes('/api/users/activity-logs'))) {
    result.unexpectedRequests.push('requested user logs without user:logs');
  }
  if (!['admin'].includes(account.role) && requestedPaths.includes('/api/users/assignable-roles')) {
    result.unexpectedRequests.push('requested assignable roles without user:create/user:update');
  }

  if ((contentRoles.has(account.role) || account.role === 'member') && dbExpectations.available) {
    for (const key of ['topics', 'production', 'shooting', 'publishing']) {
      const actual = result.apiCounts[key]?.count;
      const expected = dbExpectations.all[key];
      if (actual !== expected) {
        result.assertions.push(`${account.role} ${key} count ${actual} !== all ${expected}`);
      }
    }
  }

  await context.close();
  return result;
}

async function main() {
  const dbExpectations = await readDbExpectations().catch((error) => ({
    available: false,
    reason: error instanceof Error ? error.message : String(error),
  }));

  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Executable doesn't exist|playwright install/i.test(message)) {
      console.error('[permission-e2e] Playwright Chromium is not installed. Run `npx playwright install chromium` first.');
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const results = [];
  try {
    for (const account of selectedAccounts) {
      console.log(`[permission-e2e] testing ${account.username}/${account.role}`);
      results.push(await runAccount(browser, account, dbExpectations));
    }
  } finally {
    await browser.close();
  }

  const summary = {
    baseUrl: BASE_URL,
    apiBase: API_BASE,
    dbExpectations,
    results,
  };

  if (process.env.E2E_VERBOSE_JSON === 'true') {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const compactResults = results.map((result) => ({
      account: result.account,
      role: result.role,
      login: result.login,
      menuCount: result.menus.length,
      visibleMenus: result.menus.map((item) => item.text).filter(Boolean),
      routeStatuses: Object.fromEntries(result.routes.map((route) => [route.route, route.status])),
      apiCounts: result.apiCounts,
      badResponses: result.badResponses,
      unexpectedRequests: result.unexpectedRequests,
      consoleWarnings: result.consoleMessages.length,
      assertions: result.assertions,
      usersDropdown: result.usersDropdown
        ? {
            createOptions: result.usersDropdown.createOptions,
            editOptions: result.usersDropdown.editOptions,
            assignableStatus: result.usersDropdown.assignableStatus,
            hasAllExpectedCreateRoles: result.usersDropdown.hasAllExpectedCreateRoles,
            hasAllExpectedEditRoles: result.usersDropdown.hasAllExpectedEditRoles,
          }
        : undefined,
    }));
    console.log(JSON.stringify({
      baseUrl: summary.baseUrl,
      apiBase: summary.apiBase,
      dbExpectations: summary.dbExpectations,
      results: compactResults,
    }, null, 2));
  }

  const failures = results.flatMap((result) => {
    const issues = [];
    if (!result.login.api || !result.login.ui) issues.push(`${result.account}/${result.role}: login failed`);
    if (result.badResponses.length) issues.push(`${result.account}/${result.role}: bad API statuses ${JSON.stringify(result.badResponses)}`);
    if (result.unexpectedRequests.length) issues.push(`${result.account}/${result.role}: ${result.unexpectedRequests.join('; ')}`);
    if (result.assertions.length) issues.push(`${result.account}/${result.role}: ${result.assertions.join('; ')}`);
    if (result.consoleMessages.some((item) => /validateDOMNesting|cannot appear as a descendant of <button>/i.test(item.text))) {
      issues.push(`${result.account}/${result.role}: validateDOMNesting warning still present`);
    }
    return issues;
  });

  const admin = results.find((result) => result.role === 'admin');
  if (admin?.usersDropdown) {
    const dropdown = admin.usersDropdown;
    if (dropdown.assignableStatus.some((status) => status === 404)) failures.push('admin: /api/users/assignable-roles returned 404');
    if (!dropdown.hasAllExpectedCreateRoles) failures.push(`admin: create role dropdown missing roles: ${JSON.stringify(dropdown.createOptions)}`);
    if (!dropdown.hasAllExpectedEditRoles) failures.push(`admin: edit role dropdown missing roles: ${JSON.stringify(dropdown.editOptions)}`);
  } else if (selectedAccounts.some((account) => account.role === 'admin')) {
    failures.push('admin: users dropdown test did not run');
  }

  if (failures.length > 0) {
    console.error('[permission-e2e] FAIL');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('[permission-e2e] PASS');
}

main().catch((error) => {
  console.error(`[permission-e2e] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
