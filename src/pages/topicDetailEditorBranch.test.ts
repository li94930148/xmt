import assert from 'node:assert/strict';
import { canSaveTopicDetailDraft, resolveTopicDetailEditorBranch } from './topicDetailEditorBranch';
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

function caseManualSaveWaitsOnlyWhenTheOutlineRuntimeIsNeeded() {
  const runtimeBranch = resolveTopicDetailEditorBranch(115, false);
  const legacyBranch = resolveTopicDetailEditorBranch(115, false, {
    defaultMode: 'runtime',
    legacyTopicIds: [115],
  });

  assert.equal(canSaveTopicDetailDraft(runtimeBranch, true, false), false, 'outline save waits until the runtime handle is ready');
  assert.equal(canSaveTopicDetailDraft(runtimeBranch, true, true), true, 'outline save is enabled after the runtime handle is ready');
  assert.equal(canSaveTopicDetailDraft(runtimeBranch, false, false), true, 'non-outline topic edits do not require a mounted editor runtime');
  assert.equal(canSaveTopicDetailDraft(legacyBranch, true, false), true, 'legacy content does not require a runtime manual-save handle');
}

function main() {
  caseDefaultPolicyKeepsRuntimeRenderer();
  caseMockLegacyTopicUsesOnlyLegacyRenderer();
  caseReadonlyIsIdenticalForBothRenderers();
  caseCapturedBranchDoesNotHotSwitchWhenPolicyChangesElsewhere();
  caseManualSaveWaitsOnlyWhenTheOutlineRuntimeIsNeeded();
  console.log('TopicDetail renderer branch tests passed');
}

main();
