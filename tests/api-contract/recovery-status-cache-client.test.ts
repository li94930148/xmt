import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; cache?: RequestCache }> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const pathname = new URL(url, 'http://localhost').pathname;
  requests.push({ url: pathname, cache: init?.cache });

  if (pathname.startsWith('/api/retrospectives/')) {
    return new Response(JSON.stringify({ data: { state: 'not_found' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (pathname.startsWith('/api/users/')) {
    return new Response(JSON.stringify({ state: 'not_found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(null, { status: 404 });
}) as typeof fetch;

try {
  const inspirations = await import('../../src/api/inspirations.js');
  const retrospectives = await import('../../src/api/retrospectives.js');
  const users = await import('../../src/api/users.js');
  const workflow = await import('../../src/api/workflow.js');
  const topics = await import('../../src/api/topics.js');

  assert.equal(await inspirations.getInspirationCreateRequest('inspiration-create-key'), null);
  assert.equal(await inspirations.getInspirationVoteRequest('inspiration-vote-key'), null);

  assert.deepEqual(await retrospectives.getRetrospectiveCreateRequestStatus('retro-create-key'), { state: 'not_found' });
  assert.deepEqual(await retrospectives.getRetrospectiveUpdateRequestStatus(17, 'retro-update-key'), { state: 'not_found' });
  assert.deepEqual(await retrospectives.getRetroActionCreateRequestStatus(17, 'retro-action-create-key'), { state: 'not_found' });
  assert.deepEqual(await retrospectives.getRetroActionUpdateRequestStatus(19, 'retro-action-update-key'), { state: 'not_found' });

  assert.deepEqual(await users.getUserCreateRequestStatus('user-create-key'), { state: 'not_found' });
  assert.deepEqual(await users.getUserUpdateRequestStatus('user-update-key', 23), { state: 'not_found' });
  assert.deepEqual(await users.getUserDeleteRequestStatus('user-delete-key', 29), { state: 'not_found' });

  assert.deepEqual(await workflow.getProductionCreateStatus('production-create-key'), { status: 'missing' });
  assert.deepEqual(await workflow.getShootingCreateStatus('shooting-create-key'), { status: 'missing' });
  assert.deepEqual(await workflow.getPublishingCreateStatus('publishing-create-key'), { status: 'missing' });

  assert.equal(await topics.getTopicDeleteStatus(13), 'missing');
  assert.equal(await inspirations.getInspirationDeleteStatus(31), 'missing');
  assert.equal(await workflow.getShootingDeleteStatus(35), 'deleted');
  assert.deepEqual(await workflow.getShootingCompletionStatus(35), { state: 'missing' });
  assert.equal(await workflow.getPublishingDeleteStatus(41), 'deleted');
  assert.deepEqual(await workflow.getPublishingUpdateStatus(41, { status: 'published' }, { status: 'pending' }), { status: 'missing' });

  assert.equal(requests.length, 18, 'every recovery status helper must issue one status request');
  for (const request of requests) {
    assert.equal(request.cache, 'no-store', `${request.url} must bypass the browser cache`);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Recovery status client cache contract passed.');
