import assert from 'node:assert/strict';
import {
  buildMaterialInsertionHtml,
  canPersistMaterialDraft,
  clampMaterialWorkspaceHeight,
  DEFAULT_MATERIAL_WORKSPACE_HEIGHT,
  materialWorkspaceStorageKey,
  MIN_MATERIAL_WORKSPACE_HEIGHT,
} from '../../src/components/production/materialWorkspace.js';
import { resolveEditorInsertionSelection } from '../../src/components/editor/editorInsertion.js';

assert.equal(clampMaterialWorkspaceHeight(10, 1000), MIN_MATERIAL_WORKSPACE_HEIGHT);
assert.equal(clampMaterialWorkspaceHeight(9999, 1000), 750);
assert.equal(clampMaterialWorkspaceHeight(DEFAULT_MATERIAL_WORKSPACE_HEIGHT, 1000), DEFAULT_MATERIAL_WORKSPACE_HEIGHT);
assert.notEqual(materialWorkspaceStorageKey(1), materialWorkspaceStorageKey(2));
assert.match(materialWorkspaceStorageKey(42), /user:42$/);
const insertion = buildMaterialInsertionHtml(['<p>资料一</p>', '', '<p>资料二</p>']);
assert.equal(insertion, '<p><br></p><p>资料一</p><p><br></p><p>资料二</p><p><br></p>');
assert.deepEqual(resolveEditorInsertionSelection({ from: 3, to: 3 }, 10), { from: 3, to: 3 });
assert.deepEqual(resolveEditorInsertionSelection(null, 10), { from: 10, to: 10 });
assert.deepEqual(resolveEditorInsertionSelection({ from: 11, to: 11 }, 10), { from: 10, to: 10 });
assert.equal(canPersistMaterialDraft(false), false, 'read-only materials never persist editor changes');
assert.equal(canPersistMaterialDraft(true), true, 'editable materials retain autosave');
console.log('material workspace UI logic tests passed');
