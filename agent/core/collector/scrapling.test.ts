import assert from 'node:assert/strict';
import test from 'node:test';
import { ScraplingCreatorCollector } from './scrapling.js';

test('collector forwards bounded XHR evidence into the upload snapshot', async () => {
  const bridge = {
    request: async () => ({ data: {
      xhrResponses: 1,
      works: [],
      account: { metadata_observed: {} },
      captures: [{ page: 'work-list', url: 'https://example.invalid/list', method: 'GET', status: 200, response: { items: [] }, captured_at: '2026-09-22T00:00:00Z' }],
    } }),
  } as never;
  const collector = new ScraplingCreatorCollector(bridge, '/tmp/profile', '/tmp/output', 'account', {} as never);
  const snapshot = await collector.collect({ collectionMode: 'metrics_refresh' });
  assert.equal(snapshot.raw.captures.length, 1);
  assert.equal(snapshot.raw.captures[0].url, 'https://example.invalid/list');
  assert.deepEqual(snapshot.raw.captures[0].response, { items: [] });
});
