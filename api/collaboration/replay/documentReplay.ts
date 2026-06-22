import * as Y from 'yjs';
import { getEventStream } from '../protocol/eventStream.js';
import {
  buildUnifiedTimeline,
  type UnifiedTimelineEvent,
} from '../../../src/editor/timeline/unifiedContentTimeline.js';

export interface ReplayRange {
  from?: number;
  to?: number;
}

function timelinePayloadState(event: UnifiedTimelineEvent, key: 'state' | 'update') {
  return Array.isArray(event.payload?.[key]) ? event.payload[key] as number[] : null;
}

function buildReplayDoc(docId: string, timelineSlice: UnifiedTimelineEvent[]) {
  const snapshots = timelineSlice
    .filter((event) => event.type === 'snapshot' && timelinePayloadState(event, 'state'))
    .sort((a, b) => b.timestamp - a.timestamp);
  const baseSnapshot = snapshots[0] || null;
  const replayDoc = new Y.Doc();

  if (baseSnapshot) {
    Y.applyUpdate(replayDoc, Uint8Array.from(timelinePayloadState(baseSnapshot, 'state') || []));
  }

  const updates = timelineSlice
    .filter((event) => event.type === 'edit' && timelinePayloadState(event, 'update'))
    .filter((event) => (!baseSnapshot || event.timestamp > baseSnapshot.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const update of updates) {
    Y.applyUpdate(replayDoc, Uint8Array.from(timelinePayloadState(update, 'update') || []));
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
      bytes: Number(update.payload?.bytes || timelinePayloadState(update, 'update')?.length || 0),
    })),
  };
}

export function replayDocument(docId: string, timestampRange: ReplayRange = {}) {
  const timeline = buildUnifiedTimeline(docId, { yjsEvents: getEventStream(docId) }).filter((event) => {
    if (timestampRange.from !== undefined && event.timestamp < timestampRange.from) return false;
    if (timestampRange.to !== undefined && event.timestamp > timestampRange.to) return false;
    return true;
  });

  return {
    docId,
    range: timestampRange,
    timeline,
    replayState: buildReplayDoc(docId, timeline),
  };
}

export function restoreToEvent(docId: string, eventId: string) {
  const timeline = buildUnifiedTimeline(docId, { yjsEvents: getEventStream(docId) });
  const event = timeline.find((item) => item.id === eventId);
  if (!event) return null;
  const timelineSlice = timeline.filter((item) => item.timestamp <= event.timestamp);

  return {
    docId,
    event,
    replayState: buildReplayDoc(docId, timelineSlice),
  };
}

export function generateDiffSequence(docId: string) {
  return buildUnifiedTimeline(docId, { yjsEvents: getEventStream(docId) }).filter((event) => event.type === 'edit').map((update) => ({
    id: update.id,
    timestamp: update.timestamp,
    version: Number(update.payload?.version || 0),
    diff: {
      bytes: Number(update.payload?.bytes || timelinePayloadState(update, 'update')?.length || 0),
      metadata: update.payload || {},
    },
  }));
}
