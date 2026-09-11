import assert from 'node:assert/strict';
import {
  clampMaterialWorkspaceHeight,
  DEFAULT_MATERIAL_WORKSPACE_HEIGHT,
  materialWorkspaceStorageKey,
  MIN_MATERIAL_WORKSPACE_HEIGHT,
} from '../../src/components/production/materialWorkspace.js';

assert.equal(clampMaterialWorkspaceHeight(10, 1000), MIN_MATERIAL_WORKSPACE_HEIGHT);
assert.equal(clampMaterialWorkspaceHeight(9999, 1000), 750);
assert.equal(clampMaterialWorkspaceHeight(DEFAULT_MATERIAL_WORKSPACE_HEIGHT, 1000), DEFAULT_MATERIAL_WORKSPACE_HEIGHT);
assert.notEqual(materialWorkspaceStorageKey(1), materialWorkspaceStorageKey(2));
assert.match(materialWorkspaceStorageKey(42), /user:42$/);
console.log('material workspace UI logic tests passed');
