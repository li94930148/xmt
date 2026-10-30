import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const user = { id: 169, username: 'backup-race-fixture', name: '备份竞态验收', role: 'admin', enabled: true, force_change_password: false };

type BackupFile = { id: string; name: string; size: number; created: string; source: string; sourceLabel: string };
type Inventory = {
  files: BackupFile[];
  sources: Array<{ id: string; label: string; available: boolean; fileCount: number }>;
};
type Deferred = { promise: Promise<void>; resolve: () => void };
type Gate = { started: Deferred; released: Deferred; fail: boolean; snapshot?: Inventory };

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function createGate(fail = false): Gate {
  const gate = { started: deferred(), released: deferred(), fail };
  gates.push(gate);
  return gate;
}

function cloneInventory(value: Inventory): Inventory {
  return { files: value.files.map((file) => ({ ...file })), sources: value.sources.map((source) => ({ ...source })) };
}

const gates: Gate[] = [];
const unexpectedApiWrites: string[] = [];
let inventory: Inventory;
let nextInventoryGate: Gate | null = null;
let failNextInventoryRead = false;
let failInventoryAfterNextCreate = false;
let nextCreateGate: Gate | null = null;
let createAttempts = 0;

function resetFixture() {
  inventory = {
    files: [],
    sources: [{ id: 'application', label: '应用内备份', available: true, fileCount: 0 }],
  };
  nextInventoryGate = null;
  failNextInventoryRead = false;
  failInventoryAfterNextCreate = false;
  nextCreateGate = null;
  createAttempts = 0;
  unexpectedApiWrites.length = 0;
}

resetFixture();

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  resetFixture();
  if (req.query.inventory === 'sample') {
    inventory = {
      files: [
        { id: 'application:xmt-backup-fixture-20261019.db.gz', name: 'xmt-backup-fixture-20261019.db.gz', size: 2359296, created: '2026-10-19T00:30:00.000Z', source: 'application', sourceLabel: '应用内备份' },
        { id: 'scheduled:xmt-scheduled-fixture-20261018.db', name: 'xmt-scheduled-fixture-20261018.db', size: 52428800, created: '2026-10-18T16:00:00.000Z', source: 'scheduled', sourceLabel: '服务器定时备份' },
      ],
      sources: [
        { id: 'application', label: '应用内备份', available: true, fileCount: 1 },
        { id: 'deployment', label: '部署应急备份', available: true, fileCount: 0 },
        { id: 'scheduled', label: '服务器定时备份', available: true, fileCount: 1 },
        { id: 'unavailable', label: '不可用测试来源', available: false, fileCount: 0 },
      ],
    };
  }
  if (req.query.failAfterCreate === '1') failInventoryAfterNextCreate = true;
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  return res.type('html').send(`<script>
  localStorage.setItem('xmt_user', ${JSON.stringify(JSON.stringify(user))});
  localStorage.setItem('xmt_token', 'backup-inventory-race-fixture');
  localStorage.setItem('xmt_theme', ${JSON.stringify(theme)});
  localStorage.setItem('xmt_last_version_seen', ${JSON.stringify(version)});
  location.replace('/backup');
</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['system:backup']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/backup/inventory', async (_req, res) => {
  const snapshot = cloneInventory(inventory);
  const gate = nextInventoryGate;
  nextInventoryGate = null;
  if (gate) {
    gate.snapshot = snapshot;
    gate.started.resolve();
    await gate.released.promise;
    if (gate.fail) return res.status(503).json({ message: '模拟旧备份清单读取失败' });
    return res.json(snapshot);
  }
  if (failNextInventoryRead) {
    failNextInventoryRead = false;
    return res.status(503).json({ message: '模拟备份清单刷新失败' });
  }
  return res.json(snapshot);
});
app.post('/api/backup/create', async (_req, res) => {
  createAttempts += 1;
  const gate = nextCreateGate;
  nextCreateGate = null;
  if (gate) {
    gate.started.resolve();
    await gate.released.promise;
  }
  const name = `xmt-backup-fixture-${createAttempts}.db`;
  const file: BackupFile = {
    id: `application:${name}`,
    name,
    size: 2048,
    created: '2026-10-19T04:00:00.000Z',
    source: 'application',
    sourceLabel: '应用内备份',
  };
  inventory = {
    files: [file, ...inventory.files.filter((existing) => existing.name !== name)],
    sources: inventory.sources.map((source) => source.id === 'application' ? { ...source, fileCount: source.fileCount + 1 } : source),
  };
  if (failInventoryAfterNextCreate) {
    failInventoryAfterNextCreate = false;
    failNextInventoryRead = true;
  }
  return res.json({ message: '备份已创建', name });
});
app.use('/api', (req, res) => {
  if (req.method !== 'GET') unexpectedApiWrites.push(`${req.method} ${req.path}`);
  return req.method === 'GET'
    ? res.json({})
    : res.status(404).json({ message: '未配置的隔离 API' });
});

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
let browser: Browser | undefined;

async function openBackupPage(
  query = '',
  beforeNavigate?: (page: Page) => Promise<void>,
): Promise<{ page: Page; errors: string[] }> {
  assert(browser);
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const expectedNetworkFailure = query.includes('network-error=1') || query.includes('download-error=1');
    if (expectedNetworkFailure && /Failed to load resource/i.test(message.text())) return;
    errors.push(message.text());
  });
  if (beforeNavigate) await beforeNavigate(page);
  await page.goto(`${base}/__qa${query}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '备份管理', exact: true }).waitFor();
  if (query.includes('inventory=sample')) await page.getByTestId('backup-file-list').waitFor();
  else if (query.includes('network-error=1')) await page.getByRole('alert').waitFor();
  else await page.getByText('没有发现备份文件', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/backup', 'the fixture mounts the protected backup route');
  return { page, errors };
}

function waitForInventoryResponse(page: Page, status?: number) {
  return page.waitForResponse((response) => (
    response.request().method() === 'GET' &&
    response.url().endsWith('/api/backup/inventory') &&
    (status === undefined || response.status() === status)
  ));
}

try {
  if (process.env.XMT_BACKUP_INVENTORY_QA_SERVE === '1') {
    console.log(`Isolated backup fixture ready at ${base}/__qa?inventory=sample&theme=light (Ctrl+C to stop).`);
    await new Promise<void>((resolve) => {
      const stop = () => {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
        resolve();
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
  } else {
  browser = await chromium.launch({ headless: true });

  // A direct network rejection gets a localized message and a manual read-only retry.
  resetFixture();
  let rejectInitialInventoryRead = true;
  const networkRead = await openBackupPage('?network-error=1', async (page) => {
    await page.route('**/api/backup/inventory', async (route) => {
      if (rejectInitialInventoryRead) {
        rejectInitialInventoryRead = false;
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
  });
  const networkReadAlert = await networkRead.page.getByRole('alert').first().innerText();
  assert.match(networkReadAlert, /备份清单暂不可用：服务器备份清单暂时无法读取，请检查连接后重试。/);
  assert.doesNotMatch(networkReadAlert, /Failed to fetch|ERR_FAILED|TypeError/i, 'inventory network errors stay in Chinese');
  const retriedInventory = waitForInventoryResponse(networkRead.page, 200);
  await networkRead.page.getByRole('button', { name: '重新加载清单', exact: true }).click();
  await retriedInventory;
  await networkRead.page.getByText('没有发现备份文件', { exact: true }).waitFor();
  assert.deepEqual(unexpectedApiWrites, [], 'inventory retry performs no business writes');
  assert.deepEqual(networkRead.errors, [], networkRead.errors.join('\n'));
  await networkRead.page.close();

  // A failed backup download displays a readable notification and creates no file.
  resetFixture();
  const downloadFailure = await openBackupPage('?inventory=sample&download-error=1', async (page) => {
    await page.route('**/api/backup/download/**', (route) => route.abort('failed'));
  });
  const downloadEvent = downloadFailure.page.waitForEvent('download', { timeout: 500 }).catch(() => null);
  await downloadFailure.page.getByRole('button', { name: '下载备份 xmt-backup-fixture-20261019.db.gz' }).click();
  await downloadFailure.page.getByText('备份文件下载失败，请检查连接后重试。', { exact: true }).waitFor();
  assert.equal(await downloadEvent, null, 'a rejected download does not create a file');
  assert.deepEqual(unexpectedApiWrites, [], 'download failure performs no business writes');
  assert.deepEqual(downloadFailure.errors, [], downloadFailure.errors.join('\n'));
  await downloadFailure.page.close();

  // An old successful snapshot must not replace the post-create read-back.
  resetFixture();
  const first = await openBackupPage();
  const createGateA = createGate();
  nextCreateGate = createGateA;
  const createResponseA = first.page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/backup/create') && response.status() === 200);
  await first.page.getByRole('button', { name: '立即备份', exact: true }).click();
  await createGateA.started.promise;

  const staleSuccessA = createGate();
  nextInventoryGate = staleSuccessA;
  const staleSuccessResponseA = waitForInventoryResponse(first.page, 200);
  await first.page.getByRole('button', { name: '刷新清单', exact: true }).click();
  await staleSuccessA.started.promise;
  assert.deepEqual(staleSuccessA.snapshot?.files, [], 'old GET A captures the pre-create fixture snapshot');

  const postCreateReadB = waitForInventoryResponse(first.page, 200);
  createGateA.released.resolve();
  await createResponseA;
  await postCreateReadB;
  await first.page.getByText('xmt-backup-fixture-1.db', { exact: true }).waitFor();
  staleSuccessA.released.resolve();
  await staleSuccessResponseA;
  await first.page.waitForTimeout(50);
  assert.equal(await first.page.getByText('xmt-backup-fixture-1.db', { exact: true }).count(), 1, 'late successful GET A cannot replace the confirmed post-create inventory');
  assert.equal(await first.page.getByRole('alert').count(), 0, 'late successful GET A cannot change the current read notice');
  assert.equal(await first.page.getByRole('button', { name: '刷新清单', exact: true }).isEnabled(), true, 'late successful GET A cannot leave the current list busy');
  assert.equal(createAttempts, 1, 'the first race scenario sends exactly one backup creation');
  assert.deepEqual(first.errors, [], first.errors.join('\n'));
  await first.page.screenshot({ path: '/tmp/xmt-backup-inventory-race-success.png' });
  await first.page.close();

  // A late failed old request must not set an error or clear the current loading state while B is held.
  resetFixture();
  const second = await openBackupPage();
  const createGateB = createGate();
  nextCreateGate = createGateB;
  const createResponseB = second.page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/backup/create') && response.status() === 200);
  await second.page.getByRole('button', { name: '立即备份', exact: true }).click();
  await createGateB.started.promise;

  const staleFailureA = createGate(true);
  nextInventoryGate = staleFailureA;
  const staleFailureResponseA = waitForInventoryResponse(second.page, 503);
  await second.page.getByRole('button', { name: '刷新清单', exact: true }).click();
  await staleFailureA.started.promise;
  const currentReadGateB = createGate();
  nextInventoryGate = currentReadGateB;
  const currentReadResponseB = waitForInventoryResponse(second.page, 200);
  createGateB.released.resolve();
  await createResponseB;
  await currentReadGateB.started.promise;
  staleFailureA.released.resolve();
  await staleFailureResponseA;
  await second.page.waitForTimeout(50);
  assert.equal(await second.page.getByRole('alert').count(), 0, 'late failed GET A cannot publish an error over the current read');
  assert.equal(await second.page.getByRole('button', { name: '刷新清单', exact: true }).isDisabled(), true, 'late failed GET A cannot clear loading while current GET B is pending');
  currentReadGateB.released.resolve();
  await currentReadResponseB;
  await second.page.getByText('xmt-backup-fixture-1.db', { exact: true }).waitFor();
  assert.equal(await second.page.getByRole('button', { name: '刷新清单', exact: true }).isEnabled(), true, 'current GET B alone clears the list busy state');
  assert.equal(createAttempts, 1, 'the second race scenario sends exactly one backup creation');
  assert.deepEqual(second.errors, [], second.errors.join('\n'));
  await second.page.close();

  // A successful stale snapshot must not erase the durable notice when the current post-create read fails.
  resetFixture();
  const third = await openBackupPage();
  const createGateC = createGate();
  nextCreateGate = createGateC;
  const createResponseC = third.page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/backup/create') && response.status() === 200);
  await third.page.getByRole('button', { name: '立即备份', exact: true }).click();
  await createGateC.started.promise;

  const staleSuccessC = createGate();
  nextInventoryGate = staleSuccessC;
  const staleSuccessResponseC = waitForInventoryResponse(third.page, 200);
  await third.page.getByRole('button', { name: '刷新清单', exact: true }).click();
  await staleSuccessC.started.promise;
  failNextInventoryRead = true;
  const currentReadFailureC = waitForInventoryResponse(third.page, 503);
  createGateC.released.resolve();
  await createResponseC;
  await currentReadFailureC;
  const confirmedNotice = '服务端已确认备份 xmt-backup-fixture-1.db，但备份清单刷新失败；请重新加载清单确认，不要重复创建。';
  await third.page.getByRole('alert').getByText(confirmedNotice, { exact: true }).waitFor();
  assert.equal(await third.page.getByRole('alert').count(), 1, 'a confirmed-write recovery state presents one actionable alert');
  assert.equal(await third.page.getByRole('button', { name: '重试', exact: true }).count(), 0, 'the recovery state does not duplicate the reload action');
  staleSuccessC.released.resolve();
  await staleSuccessResponseC;
  await third.page.waitForTimeout(50);
  assert.equal(await third.page.getByRole('alert').getByText(confirmedNotice, { exact: true }).count(), 1, 'late successful GET A cannot clear the confirmed-write recovery notice');
  assert.equal(await third.page.getByRole('button', { name: '刷新清单', exact: true }).isEnabled(), true, 'late successful GET A cannot change the failed current read busy state');
  assert.equal(await third.page.getByRole('button', { name: '立即备份', exact: true }).isDisabled(), true, 'a confirmed write with an unreadable inventory prevents duplicate creation');
  const recoveryRead = waitForInventoryResponse(third.page, 200);
  await third.page.getByRole('button', { name: '重新加载清单', exact: true }).click();
  await recoveryRead;
  await third.page.getByText('xmt-backup-fixture-1.db', { exact: true }).waitFor();
  assert.equal(await third.page.getByRole('alert').count(), 0, 'a successful read-back clears the recovery notice');
  assert.equal(await third.page.getByRole('button', { name: '立即备份', exact: true }).isEnabled(), true, 'creation becomes available after the server inventory is confirmed');
  assert.equal(createAttempts, 1, 'the third race scenario sends exactly one backup creation');
  assert.deepEqual(unexpectedApiWrites, [], 'all observed writes stay inside the isolated backup fixture');
  assert.equal(await third.page.locator('vite-error-overlay, [data-vite-error-overlay]').count(), 0, 'the page has no Vite error overlay');
  assert.deepEqual(third.errors, [], third.errors.join('\n'));
  await third.page.close();

  // The Studio Atelier backup page remains readable and contained at narrow viewports.
  resetFixture();
  const visual = await openBackupPage('?inventory=sample&theme=light');
  for (const width of [320, 390, 768, 1440]) {
    await visual.page.setViewportSize({ width, height: 900 });
    const dimensions = await visual.page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= dimensions.viewport, `light theme has no horizontal overflow at ${width}px`);
    assert.equal(await visual.page.getByTestId('backup-file-row').count(), 2, `sample inventory renders at ${width}px`);
  }
  const copy = await visual.page.locator('body').innerText();
  assert.doesNotMatch(copy, /SQLite|(?:\/Users\/|\/var\/|\/data\/)/i, 'the user-facing backup page hides engine and absolute path details');
  assert.deepEqual(visual.errors, [], visual.errors.join('\n'));
  await visual.page.close();

  resetFixture();
  const darkVisual = await openBackupPage('?inventory=sample&theme=dark');
  for (const width of [320, 390, 768, 1440]) {
    await darkVisual.page.setViewportSize({ width, height: 900 });
    const dimensions = await darkVisual.page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= dimensions.viewport, `dark theme has no horizontal overflow at ${width}px`);
    assert.equal(await darkVisual.page.getByTestId('backup-file-row').count(), 2, `dark theme renders sample inventory at ${width}px`);
  }
  const darkCopy = await darkVisual.page.locator('body').innerText();
  assert.doesNotMatch(darkCopy, /SQLite|(?:\/Users\/|\/var\/|\/data\/)/i, 'dark theme also hides engine and absolute path details');
  assert.deepEqual(darkVisual.errors, [], darkVisual.errors.join('\n'));
  await darkVisual.page.close();

  console.log('Backup inventory browser test passed: request race recovery, Studio Atelier page rendering, responsive containment, and internal-path privacy.');
  }
} finally {
  for (const gate of gates) gate.released.resolve();
  if (browser) await browser.close();
  io.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
}
