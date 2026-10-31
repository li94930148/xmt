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
  const messageReadMatch = pathname.match(/^\/api\/messages\/(\d+)\/read-status$/);
  if (messageReadMatch) {
    return new Response(JSON.stringify({ state: 'available', id: Number(messageReadMatch[1]), read: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (pathname.startsWith('/api/calendar/create-request/')
    || pathname.startsWith('/api/inspirations/create-request/')
    || pathname.startsWith('/api/inspirations/vote-requests/')) return new Response(null, { status: 404 });
  if (pathname.startsWith('/api/workflow/production/create-request/')
    || pathname.startsWith('/api/workflow/shooting/create-request/')
    || pathname.startsWith('/api/workflow/publishing/create-request/')) {
    return new Response(null, { status: 404 });
  }
  if (pathname === '/api/topics/13' || pathname === '/api/inspirations/31'
    || pathname === '/api/workflow/shooting/35' || pathname === '/api/workflow/publishing/41') {
    return new Response(null, { status: 404 });
  }
  if (pathname === '/api/inspirations/72' || pathname === '/api/inspirations/73') {
    return new Response(JSON.stringify({ inspiration: { id: Number(pathname.split('/').at(-1)) }, comments: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (pathname.startsWith('/api/report-summaries/monthly/requests/')
    || pathname.startsWith('/api/report-summaries/yearly/requests/')) {
    return new Response(JSON.stringify({ status: 'not_found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (pathname.includes('/review-threads/requests/')
    || pathname.includes('/replies/requests/')
    || pathname.includes('/status-requests/')) {
    return new Response(JSON.stringify({ status: 'not_found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (pathname.startsWith('/api/backup/create-requests/')
    || pathname.startsWith('/api/announcements/create-request/')) {
    return new Response(JSON.stringify({ state: 'not_found' }), {
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
  return new Response(JSON.stringify({ data: { state: 'not_found' }, state: 'not_found', status: 'not_found' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

try {
  const inspirations = await import('../../src/api/inspirations.js');
  const retrospectives = await import('../../src/api/retrospectives.js');
  const users = await import('../../src/api/users.js');
  const workflow = await import('../../src/api/workflow.js');
  const topics = await import('../../src/api/topics.js');
  const messages = await import('../../src/api/messages.js');
  const workflowTemplateDetails = await import('../../src/api/workflowTemplateDetails.js');
  const resourceCenter = await import('../../src/api/resourceCenter.js');
  const backup = await import('../../src/api/backup.js');
  const announcements = await import('../../src/api/announcements.js');
  const anonymousFeedback = await import('../../src/api/anonymousFeedback.js');
  const templates = await import('../../src/api/templates.js');
  const dailyReports = await import('../../src/api/dailyReports.js');
  const calendar = await import('../../src/api/calendar.js');
  const creatorCenter = await import('../../src/api/creatorCenter.js');
  const achievementsApi = await import('../../src/api/achievements.js');

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
  await inspirations.getInspirationDetailForRecovery(72);
  await inspirations.getInspirationDetail(73);
  assert.equal(await workflow.getShootingDeleteStatus(35), 'deleted');
  assert.deepEqual(await workflow.getShootingCompletionStatus(35), { state: 'missing' });
  assert.equal(await workflow.getPublishingDeleteStatus(41), 'deleted');
  assert.deepEqual(await workflow.getPublishingUpdateStatus(41, { status: 'published' }, { status: 'pending' }), { status: 'missing' });
  assert.equal((await workflow.getProductionByIdForRecovery(77)).id, 77);
  assert.equal((await workflow.getProductionById(77)).id, 77);
  assert.deepEqual(await workflow.getProductionReviewThreadRequestStatus(77, 'thread-request', {
    version: 'v1.0',
    kind: 'comment',
    anchor: { quote: '', context: '', from: 0, to: 0 },
    summary: '隔离批注',
    proposed_text: null,
  }), { status: 'not_found' });
  assert.deepEqual(await workflow.getProductionReviewReplyRequestStatus(77, 5, 'reply-request', '隔离回复'), { status: 'not_found' });
  assert.deepEqual(await workflow.getProductionReviewStatusRequestStatus(77, 5, 'status-request', 'resolved'), { status: 'not_found' });
  await retrospectives.getRetrospectiveDetailForRecovery(17);
  await retrospectives.getRetrospectiveDetail(17);
  assert.equal((await topics.getTopicCreateRequestStatus('topic-create-key')).state, 'not_found');
  assert.deepEqual(await messages.getMessageReadStatus(42), { state: 'available', id: 42, read: false });
  assert.deepEqual(await messages.getMessageClearRequestStatus('clear-key'), { state: 'cleared', deletedCount: 2 });
  assert.deepEqual(await messages.getMessageReadAllRequestStatus('read-all-key'), { state: 'processed', updatedCount: 3 });
  await workflowTemplateDetails.requestWorkflowTemplateDetail(53, 'test-token', 'no-store');
  await workflowTemplateDetails.requestWorkflowTemplateDetail(53, 'test-token');
  await resourceCenter.getResourceCreateRequestStatus('resource-create-key');
  await resourceCenter.getResourceUpdateRequestStatus(61, 'resource-update-key');
  await resourceCenter.getResourceCategoryMutationRequestStatus('resource-category-key', 'a'.repeat(64));
  assert.deepEqual(await backup.getBackupCreateRequestStatus('backup-create-key'), { state: 'not_found' });
  assert.deepEqual(await announcements.getAnnouncementCreateRequestStatus('announcement-create-key'), { state: 'not_found' });
  assert.equal(await anonymousFeedback.getAnonymousFeedbackSubmissionRequestStatus('feedback-submit-key', 'b'.repeat(64)), 'not_found');
  assert.equal(await anonymousFeedback.getAnonymousFeedbackDeleteRequestStatus(67, 'feedback-delete-key'), 'not_found');
  assert.equal(await anonymousFeedback.getAnonymousFeedbackUpdateRequestStatus(67, 'feedback-update-key', 'c'.repeat(64)), 'not_found');
  assert.equal((await templates.getTemplateMutationStatus('template-mutation-key', 'create', 'd'.repeat(64), null)).state, 'not_found');
  assert.equal((await dailyReports.getMonthlyRecordUpdateStatus(2026, 10, 'monthly-summary-key', 'e'.repeat(64))).status, 'not_found');
  assert.equal((await dailyReports.getYearlyRecordUpdateStatus(2026, 'yearly-summary-key', 'f'.repeat(64))).status, 'not_found');
  assert.deepEqual(await calendar.getCalendarEventCreateStatus('calendar-create-key'), { status: 'missing' });
  assert.equal((await creatorCenter.getCreatorAgentBindingCodeRecovery('account-7', 'agent-binding-key')).status, 'not_found');
  await creatorCenter.getCreatorReports();
  await achievementsApi.getAchievements();
  await achievementsApi.getMyAchievements();
  await achievementsApi.getAchievementProgress();
  await achievementsApi.getAchievementStats();
  await achievementsApi.getLeaderboard();
  await achievementsApi.getRecentAchievements();

  const requiredRecoveryPaths = [
    '/api/inspirations/create-request/inspiration-create-key',
    '/api/inspirations/vote-requests/inspiration-vote-key',
    '/api/retrospectives/create-requests/retro-create-key',
    '/api/retrospectives/17/update-requests/retro-update-key',
    '/api/retrospectives/17/actions/create-requests/retro-action-create-key',
    '/api/retrospectives/actions/19/update-requests/retro-action-update-key',
    '/api/users/create-requests/user-create-key',
    '/api/users/update-requests/user-update-key/23',
    '/api/users/delete-requests/user-delete-key/29',
    '/api/workflow/production/create-request/production-create-key',
    '/api/workflow/shooting/create-request/shooting-create-key',
    '/api/workflow/publishing/create-request/publishing-create-key',
    '/api/topics/13',
    '/api/inspirations/72',
    '/api/topics/create-requests/topic-create-key',
    '/api/inspirations/31',
    '/api/workflow/shooting/35',
    '/api/workflow/publishing/41',
    '/api/workflow/production/77/review-threads/requests/thread-request',
    '/api/workflow/production/77/review-threads/5/replies/requests/reply-request',
    '/api/workflow/production/77/review-threads/5/status-requests/status-request',
    '/api/messages/42/read-status',
    '/api/messages/clear-requests/clear-key',
    '/api/messages/read-all-requests/read-all-key',
    '/api/workflow-templates/53',
    '/api/resource-center/resources/create-requests/resource-create-key',
    '/api/resource-center/resources/61/update-requests/resource-update-key',
    '/api/resource-center/categories/mutation-requests/resource-category-key',
    '/api/backup/create-requests/backup-create-key',
    '/api/announcements/create-request/announcement-create-key',
    '/api/anonymous-feedback/submission-requests/feedback-submit-key',
    '/api/admin/anonymous-feedback/67/delete-requests/feedback-delete-key',
    '/api/admin/anonymous-feedback/67/update-requests/feedback-update-key',
    '/api/templates/requests/template-mutation-key',
    '/api/report-summaries/monthly/requests/monthly-summary-key',
    '/api/report-summaries/yearly/requests/yearly-summary-key',
    '/api/calendar/create-request/calendar-create-key',
    '/api/creator-agent/binding-codes/requests/agent-binding-key',
    '/api/creator-agent/reports',
    '/api/achievements',
    '/api/achievements/me',
    '/api/achievements/progress',
    '/api/achievements/stats',
    '/api/achievements/leaderboard',
    '/api/achievements/recent',
  ];
  const requestedPaths = requests.map((request) => request.url);
  for (const path of requiredRecoveryPaths) {
    assert.ok(requestedPaths.includes(path), `${path} must be exercised by the recovery cache contract`);
  }
  const ordinaryDetailPaths = new Set([
    '/api/workflow/production/77',
    '/api/retrospectives/17',
    '/api/workflow-templates/53',
    '/api/inspirations/73',
  ]);
  for (const request of requests) {
    if (ordinaryDetailPaths.has(request.url) && request.cache === undefined) continue;
    assert.equal(request.cache, 'no-store', `${request.url} must bypass the browser cache`);
  }
  const productionDetailRequests = requests.filter((request) => request.url === '/api/workflow/production/77');
  assert.deepEqual(productionDetailRequests.map((request) => request.cache), ['no-store', undefined],
    'production recovery bypasses cache while ordinary detail reads keep their existing request behavior');
  const retrospectiveDetailRequests = requests.filter((request) => request.url === '/api/retrospectives/17');
  assert.deepEqual(retrospectiveDetailRequests.map((request) => request.cache), ['no-store', undefined],
    'retrospective recovery bypasses cache while ordinary detail reads keep their existing request behavior');
  const templateDetailRequests = requests.filter((request) => request.url === '/api/workflow-templates/53');
  assert.deepEqual(templateDetailRequests.map((request) => request.cache), ['no-store', undefined],
    'template recovery bypasses cache while regular template reads keep existing request behavior');
  const inspirationDetailRequests = requests.filter((request) => request.url === '/api/inspirations/72' || request.url === '/api/inspirations/73');
  assert.deepEqual(inspirationDetailRequests.map((request) => [request.url, request.cache]), [
    ['/api/inspirations/72', 'no-store'],
    ['/api/inspirations/73', undefined],
  ], 'inspiration recovery bypasses cache while ordinary detail reads keep existing request behavior');

  const workflowDesignerSource = fs.readFileSync(new URL('../../src/pages/WorkflowDesigner.tsx', import.meta.url), 'utf8');
  assert.match(workflowDesignerSource, /fetchTemplateDetail\(recovery\.templateId, currentToken, 'no-store'\)/);
  assert.match(workflowDesignerSource, /fetchTemplateDetail\(recovery\.templateId, useAuthStore\.getState\(\)\.token \|\| '', 'no-store'\)/);
  assert.match(workflowDesignerSource, /fetchTemplateDetail\(id\)/,
    'ordinary template edit loads must not force the recovery cache mode');

  const inspirationPageSource = fs.readFileSync(new URL('../../src/pages/Inspirations.tsx', import.meta.url), 'utf8');
  assert.equal((inspirationPageSource.match(/getInspirationDetailForRecovery\(/g) || []).length, 6,
    'vote, promotion, and comment recovery reads must use the uncached detail request');
  assert.equal((inspirationPageSource.match(/getInspirationDetail\(/g) || []).length, 1,
    'ordinary inspiration detail loading must keep its existing request mode');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Recovery status client cache contract passed.');
