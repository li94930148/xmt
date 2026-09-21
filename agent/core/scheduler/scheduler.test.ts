import assert from 'node:assert/strict';
import test from 'node:test';
import { usesExportFocusedSync } from './scheduler.js';

test('automatic intervals use the export-focused collection path', () => {
  assert.equal(usesExportFocusedSync('12h'), true);
  assert.equal(usesExportFocusedSync('daily'), true);
  assert.equal(usesExportFocusedSync('manual'), false);
});
