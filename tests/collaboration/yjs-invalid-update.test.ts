import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { MAX_COLLAB_UPDATE_BYTES, isValidCollaborationUpdate } from '../../api/collaboration/yjs/documentStore.js';

const malformed = [1];
assert.equal(isValidCollaborationUpdate(malformed), true);
assert.equal(isValidCollaborationUpdate([256]), false);
assert.equal(isValidCollaborationUpdate([-1]), false);
assert.equal(isValidCollaborationUpdate([1.5]), false);
assert.equal(isValidCollaborationUpdate(new Array(MAX_COLLAB_UPDATE_BYTES + 1).fill(0)), false);
assert.throws(() => Y.applyUpdate(new Y.Doc(), Uint8Array.from(malformed)));
console.log('Malformed Yjs update boundary fixtures passed');
