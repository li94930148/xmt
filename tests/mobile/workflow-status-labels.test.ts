import assert from 'node:assert/strict';
import { getWorkflowStatusLabel, isKnownWorkflowStatus } from '../../src/platform/workflow-status-labels';

const shootingLabels = {
  planned: '计划中',
  pending: '计划中',
  in_progress: '制作中',
  completed: '已完成',
  cancelled: '已取消',
} as const;

const publishingLabels = {
  pending: '待发布',
  published: '已发布',
  failed: '发布异常',
  scheduled: '已定时',
} as const;

for (const [status, label] of Object.entries(shootingLabels)) {
  assert.equal(getWorkflowStatusLabel('shooting', status), label);
  assert.equal(isKnownWorkflowStatus('shooting', status), true);
}

for (const [status, label] of Object.entries(publishingLabels)) {
  assert.equal(getWorkflowStatusLabel('publishing', status), label);
  assert.equal(isKnownWorkflowStatus('publishing', status), true);
}

for (const kind of ['shooting', 'publishing'] as const) {
  assert.equal(getWorkflowStatusLabel(kind, 'legacy_waiting'), '状态待确认');
  assert.equal(getWorkflowStatusLabel(kind, null), '状态待确认');
  assert.equal(isKnownWorkflowStatus(kind, 'legacy_waiting'), false);
}

console.log('Shooting and publishing status labels passed');
