import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmManualEditorSave } from '../../src/components/editor/manualSaveConfirmation.js';

test('waits for an asynchronous server-confirmed save before reporting success', async () => {
  let resolveSave!: (value: boolean) => void;
  let settled = false;
  const save = new Promise<boolean>((resolve) => { resolveSave = resolve; });
  const result = confirmManualEditorSave(() => save).then((confirmed) => {
    settled = true;
    return confirmed;
  });

  await Promise.resolve();
  assert.equal(settled, false, 'a pending save must not be reported as complete');
  resolveSave(true);
  assert.equal(await result, true);
});

test('does not treat rejected or explicitly unconfirmed saves as successful', async () => {
  assert.equal(await confirmManualEditorSave(async () => false), false);
  assert.equal(await confirmManualEditorSave(async () => { throw new Error('save rejected'); }), false);
});

test('keeps synchronous void callbacks compatible', async () => {
  assert.equal(await confirmManualEditorSave(() => undefined), true);
});
