import assert from 'node:assert/strict';
import { COLLABORATION_EVENTS, type VersionSupersededPayload } from '../src/collaboration/core/events.js';

const payload: VersionSupersededPayload = {
  productionId: 41, topicId: 9, fromVersion: 'v1.2', toVersion: 'v2.0', toVersionId: 41,
  createdBy: { id: 2, name: '协作者B' }, createdAt: '2026-08-01 16:00:00',
};

assert.equal(COLLABORATION_EVENTS.VERSION_SUPERSEDED, 'version:superseded');
assert.equal(payload.fromVersion !== payload.toVersion, true);
assert.equal(payload.toVersionId, payload.productionId);
assert.equal(payload.createdBy.name, '协作者B');
console.log('production version sync contract tests passed');
