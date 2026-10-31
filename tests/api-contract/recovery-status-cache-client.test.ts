import assert from 'node:assert/strict';
import fs from 'node:fs';

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
  if (/^\/api\/workflow\/production\/\d+$/.test(pathname)) {
    return new Response(JSON.stringify({ id: 77, topic_id: 9 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (pathname.startsWith('/api/messages/clear-requests/')) {
    return new Response(JSON.stringify({ state: 'cleared', deletedCount: 2 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (pathname.startsWith('/api/messages/read-all-requests/')) {
    return new Response(JSON.stringify({ state: 'processed', updatedCount: 3 }), {
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
  const messages = await import('../../src/api/messages.js');
  const workflowTemplateDetails = await import('../../src/api/workflowTemplateDetails.js');

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
  assert.equal((await workflow.getProductionByIdForRecovery(77)).id, 77);
  assert.equal((await workflow.getProductionById(77)).id, 77);
  await retrospectives.getRetrospectiveDetailForRecovery(17);
  await retrospectives.getRetrospectiveDetail(17);
  assert.deepEqual(await messages.getMessageClearRequestStatus('clear-key'), { state: 'cleared', deletedCount: 2 });
  assert.deepEqual(await messages.getMessageReadAllRequestStatus('read-all-key'), { state: 'processed', updatedCount: 3 });
  await workflowTemplateDetails.requestWorkflowTemplateDetail(53, 'test-token', 'no-store');
  await workflowTemplateDetails.requestWorkflowTemplateDetail(53, 'test-token');

  assert.equal(requests.length, 26, 'every status and detail helper issues one request');
  for (const request of requests.slice(0, 18)) {
    assert.equal(request.cache, 'no-store', `${request.url} must bypass the browser cache`);
  }
  const productionDetailRequests = requests.filter((request) => request.url === '/api/workflow/production/77');
  assert.deepEqual(productionDetailRequests.map((request) => request.cache), ['no-store', undefined],
    'production recovery bypasses cache while ordinary detail reads keep their existing request behavior');
  const retrospectiveDetailRequests = requests.filter((request) => request.url === '/api/retrospectives/17');
  assert.deepEqual(retrospectiveDetailRequests.map((request) => request.cache), ['no-store', undefined],
    'retrospective recovery bypasses cache while ordinary detail reads keep their existing request behavior');
  for (const suffix of ['/api/messages/clear-requests/clear-key', '/api/messages/read-all-requests/read-all-key']) {
    assert.equal(requests.find((request) => request.url === suffix)?.cache, 'no-store', `${suffix} must bypass browser cache`);
  }
  const templateDetailRequests = requests.filter((request) => request.url === '/api/workflow-templates/53');
  assert.deepEqual(templateDetailRequests.map((request) => request.cache), ['no-store', undefined],
    'template recovery bypasses cache while regular template reads keep existing request behavior');

  const workflowDesignerSource = fs.readFileSync(new URL('../../src/pages/WorkflowDesigner.tsx', import.meta.url), 'utf8');
  assert.match(workflowDesignerSource, /fetchTemplateDetail\(recovery\.templateId, currentToken, 'no-store'\)/);
  assert.match(workflowDesignerSource, /fetchTemplateDetail\(recovery\.templateId, useAuthStore\.getState\(\)\.token \|\| '', 'no-store'\)/);
  assert.match(workflowDesignerSource, /fetchTemplateDetail\(id\)/,
    'ordinary template edit loads must not force the recovery cache mode');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Recovery status client cache contract passed.');
