import * as Y from 'yjs';
import { buildTimeline } from '../timeline/collaborationTimeline.js';
import { getEventStream } from '../protocol/eventStream.js';
import type { CollaborationEvent } from '../protocol/collaborationProtocol.js';

export interface ReplayRange {
  from?: number;
  to?: number;
}

function getSnapshotState(event: CollaborationEvent) {
  return Array.isArray(event.payload?.state) ? event.payload.state as number[] : null;
}

function getUpdateState(event: CollaborationEvent) {
  return Array.isArray(event.payload?.update) ? event.payload.update as number[] : null;
}

function buildReplayDoc(docId: string, untilTimestamp?: number) {
  const stream = getEventStream(docId);
  const snapshots = stream
    .filter((event) => event.type === 'snapshot' && getSnapshotState(event))
    .filter((event) => untilTimestamp === undefined || event.timestamp <= untilTimestamp)
    .sort((a, b) => b.timestamp - a.timestamp);
  const baseSnapshot = snapshots[0] || null;
  const replayDoc = new Y.Doc();

  if (baseSnapshot) {
    Y.applyUpdate(replayDoc, Uint8Array.from(getSnapshotState(baseSnapshot) || []));
  }

  const updates = stream
    .filter((event) => event.type === 'update' && getUpdateState(event))
    .filter((event) => (!baseSnapshot || event.timestamp > baseSnapshot.timestamp))
    .filter((event) => untilTimestamp === undefined || event.timestamp <= untilTimestamp)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const update of updates) {
    Y.applyUpdate(replayDoc, Uint8Array.from(getUpdateState(update) || []));
  }

  const state = Array.from(Y.encodeStateAsUpdate(replayDoc));
  replayDoc.destroy();

  return {
    state,
    baseSnapshotId: baseSnapshot?.payload?.snapshotId || baseSnapshot?.id || null,
    appliedUpdates: updates.map((update) => ({
      id: update.id,
      version: Number(update.payload?.version || 0),
      timestamp: update.timestamp,
      bytes: Number(update.payload?.bytes || getUpdateState(update)?.length || 0),
    })),
  };
}

export function replayDocument(docId: string, timestampRange: ReplayRange = {}) {
  const timeline = buildTimeline(docId).filter((event) => {
    if (timestampRange.from !== undefined && event.timestamp < timestampRange.from) return false;
    if (timestampRange.to !== undefined && event.timestamp > timestampRange.to) return false;
    return true;
  });

  return {
    docId,
    range: timestampRange,
    timeline,
    replayState: buildReplayDoc(docId, timestampRange.to),
  };
}

export function restoreToEvent(docId: string, eventId: string) {
  const event = buildTimeline(docId).find((item) => item.id === eventId);
  if (!event) return null;

  return {
    docId,
    event,
    replayState: buildReplayDoc(docId, event.timestamp),
  };
}

export function generateDiffSequence(docId: string) {
  return getEventStream(docId).filter((event) => event.type === 'update').map((update) => ({
    id: update.id,
    timestamp: update.timestamp,
    version: Number(update.payload?.version || 0),
    diff: {
      bytes: Number(update.payload?.bytes || getUpdateState(update)?.length || 0),
      metadata: update.payload || {},
    },
  }));
}
