import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ScraplingWorkerBridge, resolveCollectorRuntime, workerTerminalError } from './workerBridge.js';
import { CollectorLoginRequiredError } from './workerBridge.js';
import { ScraplingCreatorCollector } from './scrapling.js';
import { collectorBrowserLaunch } from './browserLaunch.js';
import { creatorFallbackBrowsers } from '../browser/discovery.js';
import { capabilities } from '../browser/capabilities.js';
import type { BrowserInfo } from '../browser/types.js';

test('Scrapling Worker 支持 health 与受控 shutdown', async () => {
  const root = path.resolve(process.cwd(), '..');
  const bridge = new ScraplingWorkerBridge(root);
  const health = await bridge.request('health', {}, 30_000);
  assert.equal(health.event, 'completed');
  assert.equal(health.data.ready, true);
  await bridge.shutdown();
});

test('Collector runtime resolver 覆盖开发、打包和缺失 Python', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-runtime-'));
  try {
    const collector = path.join(root, 'collector');
    fs.mkdirSync(path.join(collector, '.venv', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(collector, '.venv', 'Scripts'), { recursive: true });
    fs.mkdirSync(path.join(collector, 'xmt_collector', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(collector, '.venv', 'bin', 'python'), ''); fs.writeFileSync(path.join(collector, '.venv', 'Scripts', 'python.exe'), '');
    fs.writeFileSync(path.join(collector, 'xmt_collector', 'runtime', 'worker.py'), ''); fs.writeFileSync(path.join(collector, 'requirements.lock'), '');
    assert.equal(resolveCollectorRuntime(root, 'darwin').code, 'READY');
    assert.equal(resolveCollectorRuntime(root, 'win32').code, 'READY');
    const packaged = path.join(root, 'resources', 'collector-runtime');
    fs.mkdirSync(packaged, { recursive: true });
    fs.mkdirSync(path.join(packaged, 'xmt-collector-worker'), { recursive: true });
    fs.writeFileSync(path.join(packaged, 'xmt-collector-worker', 'xmt-collector-worker.exe'), '');
    assert.equal(resolveCollectorRuntime(path.join(root, 'resources'), 'win32', true).mode, 'packaged-worker');
    assert.equal(resolveCollectorRuntime(path.join(root, 'resources'), 'win32', true).code, 'READY');
    assert.equal(resolveCollectorRuntime(path.join(root, 'missing-resources'), 'win32', true).code, 'PACKAGED_RUNTIME_NOT_FOUND');
    fs.rmSync(path.join(collector, '.venv', 'bin', 'python'));
    assert.equal(resolveCollectorRuntime(root, 'darwin').code, 'PYTHON_NOT_FOUND');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Scrapling 使用 BrowserSession 已解析的非 default Profile', async () => {
  let received: Record<string, unknown> | undefined;
  const bridge = { request: async (_event: string, data: Record<string, unknown>) => { received = data; return { data: { xhrResponses: 1, works: [], exports: [{ taskId: "task-a", page: "内容管理" }], collectionCompleteness: { exhausted: true, viewScope: { verified: true } } } }; } } as unknown as ScraplingWorkerBridge;
  const profilePath = '/tmp/XMT Creator Agent/profiles/custom/account-a/profile-a';
  const browser = collectorBrowserLaunch({ id: 'edge', type: 'edge', engine: 'chromium', runtime: 'system', executablePath: '/tmp/msedge', sessionMode: 'persistent', profileName: 'default', headless: false, launchArgs: [], autoFallback: false });
  const snapshot = await new ScraplingCreatorCollector(bridge, profilePath, '/tmp/XMT Creator Agent', 'account-a', browser).collect();
  assert.equal(received?.profilePath, profilePath);
  assert.deepEqual(received?.browser, browser);
  assert.equal(snapshot.export_receipts?.[0]?.taskId, 'task-a');
});

test('Worker terminal events 保留 completed/error/login_required 语义', () => {
  assert.equal(workerTerminalError({ id: 'done', event: 'completed', data: {} }), null);
  assert.ok(workerTerminalError({ id: 'error', event: 'error', data: { message: '失败' } }) instanceof Error);
  const failure = workerTerminalError({ id: 'login', event: 'login_required', data: { message: '需要登录' } });
  assert.ok(failure instanceof CollectorLoginRequiredError);
  assert.equal((failure as CollectorLoginRequiredError).code, "COLLECTOR_LOGIN_REQUIRED");
});

test('Creator 自动回退不选择 Firefox 或 WebKit', () => {
  const browser = (id: string, engine: 'chromium'|'firefox'|'webkit'): BrowserInfo => ({ id, displayName: id, browserType: engine === 'chromium' ? 'edge' : engine, engine, runtime: 'playwright', executablePath: `/tmp/${id}`, source: 'test', capabilities: capabilities(engine, 'playwright'), compatibilityStatus: 'partially_compatible', compatibilityReason: 'test' });
  assert.deepEqual(creatorFallbackBrowsers([browser('firefox', 'firefox'), browser('webkit', 'webkit'), browser('edge', 'chromium')]).map(item => item.id), ['edge']);
});
