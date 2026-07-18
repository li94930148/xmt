import assert from 'node:assert/strict';
import {
  DEFAULT_TOPIC_EDITOR_MODE_POLICY,
  resolveTopicEditorModeFixturePolicy,
  resolveTopicEditorMode,
  type TopicEditorModePolicy,
} from './topicEditorModePolicy';

function caseEmptyPolicyDefaultsToRuntime() {
  assert.equal(resolveTopicEditorMode(12, DEFAULT_TOPIC_EDITOR_MODE_POLICY), 'runtime');
  assert.equal(resolveTopicEditorMode(12, { defaultMode: 'runtime' }), 'runtime');
}

function caseExplicitTopicIdResolvesLegacy() {
  const policy: TopicEditorModePolicy = { defaultMode: 'runtime', legacyTopicIds: [12] };
  assert.equal(resolveTopicEditorMode(12, policy), 'legacy');
  assert.equal(resolveTopicEditorMode(13, policy), 'runtime');
}

function caseCohortTopicIdResolvesLegacy() {
  const policy: TopicEditorModePolicy = {
    defaultMode: 'runtime',
    cohorts: { 'd10-pilot': [21, 22] },
  };
  assert.equal(resolveTopicEditorMode(21, policy), 'legacy');
  assert.equal(resolveTopicEditorMode(23, policy), 'runtime');
}

function caseDuplicateIdsFailSafeToRuntime() {
  const policy = {
    defaultMode: 'runtime',
    legacyTopicIds: [31],
    cohorts: { 'duplicate-scope': [31] },
  } as unknown as TopicEditorModePolicy;
  assert.equal(resolveTopicEditorMode(31, policy), 'runtime');
}

function caseInvalidIdsFailSafeToRuntime() {
  const invalidScope = { defaultMode: 'runtime', legacyTopicIds: [0] } as unknown as TopicEditorModePolicy;
  const invalidCandidateId = { defaultMode: 'runtime', legacyTopicIds: [41] } as TopicEditorModePolicy;
  assert.equal(resolveTopicEditorMode(0, invalidCandidateId), 'runtime');
  assert.equal(resolveTopicEditorMode(41, invalidScope), 'runtime');
}

function caseUndefinedOrMalformedPolicyFailsSafeToRuntime() {
  assert.equal(resolveTopicEditorMode(51), 'runtime');
  assert.equal(resolveTopicEditorMode(51, undefined), 'runtime');
  assert.equal(
    resolveTopicEditorMode(51, { defaultMode: 'legacy', legacyTopicIds: [51] } as unknown as TopicEditorModePolicy),
    'runtime',
  );
  assert.equal(
    resolveTopicEditorMode(51, { defaultMode: 'runtime', cohorts: { broken: [51, '52'] } } as unknown as TopicEditorModePolicy),
    'runtime',
  );
}

function caseLocalDevelopmentFixturePolicyIsExplicitAndFailSafe() {
  const fixturePolicy = resolveTopicEditorModeFixturePolicy({
    development: true,
    legacyFixtureTopicIds: '115, 116',
  });
  assert.equal(resolveTopicEditorMode(115, fixturePolicy), 'legacy');
  assert.equal(resolveTopicEditorMode(116, fixturePolicy), 'legacy');
  assert.equal(
    resolveTopicEditorModeFixturePolicy({ development: false, legacyFixtureTopicIds: '115' }),
    DEFAULT_TOPIC_EDITOR_MODE_POLICY,
  );
  assert.equal(
    resolveTopicEditorModeFixturePolicy({ development: true, legacyFixtureTopicIds: '115,115' }),
    DEFAULT_TOPIC_EDITOR_MODE_POLICY,
  );
  assert.equal(
    resolveTopicEditorModeFixturePolicy({ development: true, legacyFixtureTopicIds: 'invalid' }),
    DEFAULT_TOPIC_EDITOR_MODE_POLICY,
  );
}

function main() {
  caseEmptyPolicyDefaultsToRuntime();
  caseExplicitTopicIdResolvesLegacy();
  caseCohortTopicIdResolvesLegacy();
  caseDuplicateIdsFailSafeToRuntime();
  caseInvalidIdsFailSafeToRuntime();
  caseUndefinedOrMalformedPolicyFailsSafeToRuntime();
  caseLocalDevelopmentFixturePolicyIsExplicitAndFailSafe();
  console.log('Topic editor mode policy tests passed');
}

main();
