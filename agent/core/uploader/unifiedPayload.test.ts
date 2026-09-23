import assert from 'node:assert/strict';
import test from 'node:test';
import { toUnifiedCreatorPayload } from './unifiedPayload.js';

test('collector captures become bounded raw upload records', () => {
  const snapshot = {
    schema_version: 1,
    protocol_version: 1,
    agent_version: 'test-agent',
    contract_version: '2.10.2',
    snapshot_id: 'snapshot-raw-contract',
    collection_mode: 'full_snapshot',
    platform: 'douyin',
    source: 'local_creator_center',
    collected_at: '2026-09-23T00:00:00.000Z',
    collection_stats: {},
    account: { uid: 'account', nickname: '', avatar: '', fans_count: null },
    works: [], work_details: [], dashboard: {}, content_analysis: {}, fans: {}, videos: [], operations: {},
    raw: { api_map: [], captures: [
      { page: 'work-list', url: 'https://creator.example/api/list?token=secret', method: 'GET', status: 200, response: { items: [{ id: 'work-1' }] }, captured_at: '2026-09-23T00:00:00.000Z' },
      { page: 'fans-analysis', url: 'https://creator.example/api/fans', method: 'POST', status: 200, response: { total: 8 }, captured_at: '2026-09-23T00:00:01.000Z' },
    ] },
  } as never;
  const payload = toUnifiedCreatorPayload(snapshot, { taskId: 'task-1' });
  assert.equal(payload.raw_records.length, 2);
  assert.equal(payload.raw_records[0].page_type, 'fans-analysis');
  assert.equal(payload.raw_records[1].api_url, 'https://creator.example/api/list');
  assert.deepEqual(payload.raw_records[1].response_json, { items: [{ id: 'work-1' }] });
});
