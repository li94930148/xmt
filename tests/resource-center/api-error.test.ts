import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const { createResourceCenterResource, getResourceCenterResource, getResourceCreateRequestStatus, ResourceCenterApiError } = await import('../../src/api/resourceCenter.js');
let submittedBody: Record<string, unknown> | null = null;
let statusCacheMode: RequestCache | undefined;
let detailCacheMode: RequestCache | undefined;

try {
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/resources/41')) {
      detailCacheMode = init?.cache;
      return new Response(JSON.stringify({ data: { id: 41, title: '只读资料详情' } }), { status: 200 });
    }
    if (String(input).includes('/resources/create-requests/')) {
      statusCacheMode = init?.cache;
      return new Response(JSON.stringify({ state: 'created', resourceId: 41 }), { status: 200 });
    }
    submittedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      message: '资料创建请求编号已用于其他账号或内容，请先核实原请求状态。',
      code: 'RESOURCE_CREATE_REQUEST_CONFLICT',
    }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  };

  await assert.rejects(
    () => createResourceCenterResource({
      title: '状态码合同',
      library_type: 'knowledge',
      visibility: 'team',
      client_request_id: '61e33e45-2db0-4e0e-87f3-84a84d2b2050',
    }),
    (error) => {
      assert.ok(error instanceof ResourceCenterApiError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'RESOURCE_CREATE_REQUEST_CONFLICT');
      assert.equal(error.message, '资料创建请求编号已用于其他账号或内容，请先核实原请求状态。');
      return true;
    },
  );
  assert.equal(submittedBody?.client_request_id, '61e33e45-2db0-4e0e-87f3-84a84d2b2050', 'the API helper forwards the idempotency key');
  assert.deepEqual(await getResourceCreateRequestStatus('61e33e45-2db0-4e0e-87f3-84a84d2b2050'), { state: 'created', resourceId: 41 });
  assert.equal(statusCacheMode, 'no-store', 'the status helper disables browser caching');
  await getResourceCenterResource(41);
  assert.equal(detailCacheMode, 'no-store', 'the resource detail helper bypasses browser caching for post-mutation read-back');
  console.log('Resource center API error and recovery helper tests passed.');
} finally {
  globalThis.fetch = originalFetch;
}
