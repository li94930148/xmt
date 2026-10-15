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
const insertion = buildMaterialInsertionHtml([
  { resource_id: 42, title: '资料一', content_html: '<p>资料一正文</p>' },
  { resource_id: 43, title: '资料二', content_html: '<p>资料二正文</p>' },
]);
assert.match(insertion, /资料一正文/);
assert.match(insertion, /href="\/asset-center\/resources\/42"/);
assert.match(insertion, /来源：资料一/);
assert.match(insertion, /href="\/asset-center\/resources\/43"/);
assert.match(insertion, /来源：资料二/);
assert.match(insertion, /<p><br><\/p>/);
assert.equal(buildMaterialInsertionHtml([{ resource_id: 44, title: '空资料', content_html: ' ' }]), '');
assert.deepEqual(resolveEditorInsertionSelection({ from: 3, to: 3 }, 10), { from: 3, to: 3 });
assert.deepEqual(resolveEditorInsertionSelection(null, 10), { from: 10, to: 10 });
assert.deepEqual(resolveEditorInsertionSelection({ from: 11, to: 11 }, 10), { from: 10, to: 10 });
assert.equal(canPersistMaterialDraft(false), false, 'read-only materials never persist editor changes');
assert.equal(canPersistMaterialDraft(true), true, 'editable materials retain autosave');
console.log('material workspace UI logic tests passed');
