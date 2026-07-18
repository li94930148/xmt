import assert from 'node:assert/strict';
import {
  resolveContentEditorSaveStrategy,
  type AggregateDisposeOutcome,
  type ContentEditorAdapter,
  type ManualSaveResult,
} from './contentEditorAdapter';

function createAdapter(overrides: Partial<ContentEditorAdapter> = {}): ContentEditorAdapter {
  return {
    documentId: 'contract-test:1',
    collaborationRoom: '',
    initialContent: '',
    readonly: false,
    capabilities: {
      collaboration: false,
      manualSave: false,
      immersive: false,
      pageScroll: false,
    },
    persist: async () => undefined,
    ...overrides,
  };
}

function caseDefaultAdapterResolvesAutosave() {
  assert.equal(resolveContentEditorSaveStrategy(createAdapter()), 'autosave');
}

function caseNoAdapterResolvesExternal() {
  assert.equal(resolveContentEditorSaveStrategy(), 'external');
  assert.equal(resolveContentEditorSaveStrategy(null), 'external');
}

function caseManualStrategyIsPreserved() {
  assert.equal(resolveContentEditorSaveStrategy(createAdapter({ saveStrategy: 'manual' })), 'manual');
}

function caseNotApplicableAndManualSaveResultAreContractValues() {
  const outcome: AggregateDisposeOutcome = 'not_applicable';
  const result: ManualSaveResult = { status: 'cancelled', revision: 3 };

  assert.equal(outcome, 'not_applicable');
  assert.equal(result.status, 'cancelled');
  assert.equal(result.revision, 3);
}

function main() {
  caseDefaultAdapterResolvesAutosave();
  caseNoAdapterResolvesExternal();
  caseManualStrategyIsPreserved();
  caseNotApplicableAndManualSaveResultAreContractValues();
  console.log('SaveStrategy contract tests passed');
}

main();
