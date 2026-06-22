import * as Y from 'yjs';
import {
  getActiveDocumentIds,
  getRuntimeDocumentRecord,
  registerRuntimeSnapshot,
} from '../yjs/documentStore.js';
import { createEvent } from '../protocol/collaborationProtocol.js';
import { appendEvent } from '../protocol/eventStream.js';
import { syncToYjs } from '../../../src/collaboration/core/writeConsistency.js';

export interface DocumentSnapshot {
  id: string;
  docId: string;
  state: number[];
  version: number;
  createdAt: number;
}

let snapshotTimer: ReturnType<typeof setInterval> | null = null;

function createSnapshotId(docId: string) {
  return `${docId}:snapshot:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function createSnapshot(docId: string): DocumentSnapshot {
  const record = getRuntimeDocumentRecord(docId);
  const state = Array.from(Y.encodeStateAsUpdate(record.doc));
  const createdAt = Date.now();
  const snapshot: DocumentSnapshot = {
    id: createSnapshotId(docId),
    docId,
    state,
    version: record.version,
    createdAt,
  };
  registerRuntimeSnapshot(docId, snapshot);
  appendEvent(createEvent({
    id: snapshot.id,
    docId,
    type: 'snapshot',
    userId: 'system',
    timestamp: createdAt,
    source: 'system',
    payload: {
      snapshotId: snapshot.id,
      version: snapshot.version,
      bytes: state.length,
      state,
    },
  }));
  return snapshot;
}

export function restoreSnapshot(docId: string, snapshotId: string) {
  const record = getRuntimeDocumentRecord(docId);
  const snapshot = record.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return null;

  record.doc.destroy();
  record.doc = new Y.Doc();
  syncToYjs({ snapshotUpdate: snapshot.state, targetDoc: record.doc });
  record.version = snapshot.version;
  record.lastActive = Date.now();
  return snapshot;
}

export function autoSnapshot(
  interval = 30000,
  onSnapshot?: (snapshot: DocumentSnapshot) => void,
) {
  if (snapshotTimer) clearInterval(snapshotTimer);

  snapshotTimer = setInterval(() => {
    for (const docId of getActiveDocumentIds()) {
      const snapshot = createSnapshot(docId);
      onSnapshot?.(snapshot);
    }
  }, interval);

  return () => {
    if (snapshotTimer) clearInterval(snapshotTimer);
    snapshotTimer = null;
  };
}
