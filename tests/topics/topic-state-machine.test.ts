import assert from 'node:assert/strict';
import { isValidAuditAction, isValidTransition, getNextStatuses } from '../../api/utils/workflow.js';
import { canTransition, WORKFLOW_ENGINE_MODE } from '../../shared/workflow/policy.js';
import {
  canTransitionTopicStatus,
  getNextTopicStatuses,
  isTopicAtOrBeyondStage,
  isTopicStatus,
  TOPIC_STATUS_TRANSITIONS,
} from '../../shared/workflow/topic-state-machine.js';

const statuses = Object.keys(TOPIC_STATUS_TRANSITIONS);

assert.equal(WORKFLOW_ENGINE_MODE, 'v2_strict');
for (const from of statuses) {
  assert.ok(isTopicStatus(from), `${from} is a recognized Topic status`);
  assert.deepEqual(getNextStatuses(from as keyof typeof TOPIC_STATUS_TRANSITIONS), getNextTopicStatuses(from));

  for (const to of statuses) {
    const expected = TOPIC_STATUS_TRANSITIONS[from as keyof typeof TOPIC_STATUS_TRANSITIONS].includes(to as never);
    assert.equal(canTransitionTopicStatus(from, to), expected, `${from} -> ${to} matches the shared transition matrix`);
    assert.equal(isValidTransition(from as never, to as never), expected, `${from} -> ${to} matches the API transition guard`);
    assert.equal(canTransition(from, to).allowed, expected, `${from} -> ${to} matches strict workflow policy`);
  }
}

const pipelineOrder = ['pending', 'approved', 'production', 'shooting', 'publishing', 'completed'];
for (const status of statuses) {
  for (const expected of statuses) {
    const statusOrder = pipelineOrder.indexOf(status);
    const expectedOrder = pipelineOrder.indexOf(expected);
    const inOrder = statusOrder >= 0 && expectedOrder >= 0 && statusOrder >= expectedOrder;
    assert.equal(isTopicAtOrBeyondStage(status, expected), inOrder, `${status} stage ordering matches the shared pipeline`);
  }
}

for (const from of statuses) {
  for (const action of ['approved', 'rejected'] as const) {
    assert.equal(
      isValidAuditAction(from as keyof typeof TOPIC_STATUS_TRANSITIONS, action),
      canTransitionTopicStatus(from, action),
      `${from} audit action ${action} follows the shared transition matrix`,
    );
  }
}

for (const unknown of [undefined, null, '', 'archived', 'PENDING', 1]) {
  assert.equal(isTopicStatus(unknown), false, `${String(unknown)} is not a Topic status`);
  assert.equal(canTransitionTopicStatus(unknown, 'approved'), false, 'unknown source status is rejected');
  assert.equal(canTransitionTopicStatus('pending', unknown), false, 'unknown target status is rejected');
  assert.equal(isTopicAtOrBeyondStage(unknown, 'pending'), false, 'unknown current stage has no order');
  assert.equal(isTopicAtOrBeyondStage('completed', unknown), false, 'unknown target stage has no order');
  assert.deepEqual(getNextTopicStatuses(unknown), [], 'unknown statuses have no next stages');
}

console.log('Topic state machine single-source tests passed');
