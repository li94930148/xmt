import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { ScraplingWorkerBridge } from './workerBridge.js';

test('Scrapling Worker 支持 health 与受控 shutdown', async () => {
  const root = path.resolve(process.cwd(), '..');
  const bridge = new ScraplingWorkerBridge(root);
  const health = await bridge.request('health', {}, 30_000);
  assert.equal(health.event, 'completed');
  assert.equal(health.data.ready, true);
  await bridge.shutdown();
});
