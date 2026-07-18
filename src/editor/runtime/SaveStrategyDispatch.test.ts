import assert from 'node:assert/strict';
import { ManualSaveController } from './ManualSaveController';
import {
  createNotApplicableDisposeResult,
  dispatchManualSave,
  shouldScheduleRuntimeAutosave,
} from './SaveStrategyDispatch';

async function caseAutosavePathRemainsSelected() {
  assert.equal(shouldScheduleRuntimeAutosave('autosave'), true);
  assert.equal(shouldScheduleRuntimeAutosave('manual'), false);
  assert.equal(shouldScheduleRuntimeAutosave('external'), false);
}

async function caseManualSavePersistsOnlyForManualStrategy() {
  let calls = 0;
  const controller = new ManualSaveController({
    documentId: 'dispatch:manual',
    persist: async () => { calls += 1; },
  });

  assert.equal((await dispatchManualSave('manual', controller, 'content', 1)).status, 'saved');
  assert.equal(calls, 1);
  assert.equal((await dispatchManualSave('autosave', controller, 'content', 2)).status, 'cancelled');
  assert.equal((await dispatchManualSave('external', controller, 'content', 3)).status, 'cancelled');
  assert.equal(calls, 1);
}

function caseNonAutosaveDisposeCannotBeDurable() {
  const result = createNotApplicableDisposeResult('route_transition', 4, 2);
  assert.equal(result.outcome, 'not_applicable');
  assert.equal(result.durability.status, 'skipped');
  assert.equal(result.durability.detail, 'not_applicable');
}

async function main() {
  await caseAutosavePathRemainsSelected();
  await caseManualSavePersistsOnlyForManualStrategy();
  caseNonAutosaveDisposeCannotBeDurable();
  console.log('SaveStrategy dispatch tests passed');
}

void main();
