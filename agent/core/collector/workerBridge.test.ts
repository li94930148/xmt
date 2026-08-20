import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { ScraplingWorkerBridge } from './workerBridge.js';
import { ScraplingCreatorCollector } from './scrapling.js';

test('Scrapling Worker 支持 health 与受控 shutdown', async () => {
  const root = path.resolve(process.cwd(), '..');
  const bridge = new ScraplingWorkerBridge(root);
  const health = await bridge.request('health', {}, 30_000);
  assert.equal(health.event, 'completed');
  assert.equal(health.data.ready, true);
  await bridge.shutdown();
});

test('Scrapling 使用 BrowserSession 已解析的非 default Profile', async () => {
  let received: Record<string, unknown> | undefined;
  const bridge = { request: async (_event: string, data: Record<string, unknown>) => { received = data; return { data: { xhrResponses: 1, works: [] } }; } } as unknown as ScraplingWorkerBridge;
  const profilePath = '/tmp/XMT Creator Agent/profiles/custom/account-a/profile-a';
  await new ScraplingCreatorCollector(bridge, profilePath, '/tmp/XMT Creator Agent', 'account-a').collect();
  assert.equal(received?.profilePath, profilePath);
});
