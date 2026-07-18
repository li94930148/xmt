import assert from 'node:assert/strict';
import { resolveTopicDetailEditorBranch } from './topicDetailEditorBranch';
import type { TopicEditorModePolicy } from '../editor/topic/topicEditorModePolicy';

function caseDefaultPolicyKeepsRuntimeRenderer() {
  const branch = resolveTopicDetailEditorBranch(112, false);
  assert.equal(branch.topicEditorMode, 'runtime');
  assert.equal(branch.contentEditorMode, 'rich');
  assert.equal(branch.usesRuntimeManualSave, true);
  assert.equal(branch.saveOwner, 'page-aggregate');
}

function caseMockLegacyTopicUsesOnlyLegacyRenderer() {
  const policy: TopicEditorModePolicy = { defaultMode: 'runtime', legacyTopicIds: [112] };
  const branch = resolveTopicDetailEditorBranch(112, false, policy);
  assert.equal(branch.topicEditorMode, 'legacy');
  assert.equal(branch.contentEditorMode, 'legacy');
  assert.equal(branch.usesRuntimeManualSave, false);
  assert.equal(branch.saveOwner, 'page-aggregate');
}

function caseReadonlyIsIdenticalForBothRenderers() {
  const runtimeBranch = resolveTopicDetailEditorBranch(113, true);
  const legacyBranch = resolveTopicDetailEditorBranch(113, true, {
    defaultMode: 'runtime',
    cohorts: { 'test-only': [113] },
  });

  assert.equal(runtimeBranch.readonly, true);
  assert.equal(legacyBranch.readonly, true);
}

function caseCapturedBranchDoesNotHotSwitchWhenPolicyChangesElsewhere() {
  const policy: TopicEditorModePolicy = { defaultMode: 'runtime', legacyTopicIds: [114] };
  const capturedBranch = resolveTopicDetailEditorBranch(114, false, policy);
  const nextPageBranch = resolveTopicDetailEditorBranch(114, false, { defaultMode: 'runtime' });

  assert.equal(capturedBranch.contentEditorMode, 'legacy');
  assert.equal(nextPageBranch.contentEditorMode, 'rich');
  assert.equal(Object.isFrozen(capturedBranch), true);
}

function main() {
  caseDefaultPolicyKeepsRuntimeRenderer();
  caseMockLegacyTopicUsesOnlyLegacyRenderer();
  caseReadonlyIsIdenticalForBothRenderers();
  caseCapturedBranchDoesNotHotSwitchWhenPolicyChangesElsewhere();
  console.log('TopicDetail renderer branch tests passed');
}

main();
