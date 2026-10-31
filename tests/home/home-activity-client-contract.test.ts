import assert from 'node:assert/strict';
import test from 'node:test';
import { getHomeActivity } from '../../src/api/homeDashboard';

const validSummary = {
  scope: 'personal',
  generated_at: '2026-10-31T12:00:00+08:00',
  events: [{
    id: 'version-42',
    kind: 'version',
    label: '稿件版本',
    title: '选题标题',
    detail: '小修 · 基于 v1.0',
    occurred_at: '2026-10-31 11:00:00',
    path: '/production/42?version=v1.0',
  }],
};

async function withResponse(body: string, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('最近变化合法空列表与事件保留服务端响应', async () => {
  await withResponse(JSON.stringify({ ...validSummary, events: [] }), async () => {
    assert.deepEqual(await getHomeActivity(), { ...validSummary, events: [] });
  });

  await withResponse(JSON.stringify(validSummary), async () => {
    assert.deepEqual(await getHomeActivity(), validSummary);
  });
});

test('最近变化拒绝 HTTP 200 畸形摘要和事件', async () => {
  const invalidSummaries = [
    { ...validSummary, events: undefined },
    { ...validSummary, events: {} },
    { ...validSummary, events: [{ ...validSummary.events[0], kind: 'unexpected' }] },
    { ...validSummary, events: [{ ...validSummary.events[0], occurred_at: '' }] },
    { ...validSummary, events: [{ ...validSummary.events[0], path: 'https://example.com/' }] },
  ];

  for (const summary of invalidSummaries) {
    await withResponse(JSON.stringify(summary), async () => {
      await assert.rejects(getHomeActivity(), /最近变化数据格式暂不兼容/);
    });
  }
});

test('最近变化拒绝无法解析的 HTTP 200 响应', async () => {
  await withResponse('not-json', async () => {
    await assert.rejects(getHomeActivity(), /最近变化数据格式暂不兼容/);
  });
});
