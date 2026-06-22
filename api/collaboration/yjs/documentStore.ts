import * as Y from 'yjs';
import type { DocumentSnapshot } from '../recovery/documentSnapshot.js';
import { createEvent } from '../protocol/collaborationProtocol.js';
import { appendEvent } from '../protocol/eventStream.js';

export interface RuntimeDocumentRecord {
  doc: Y.Doc;
  version: number;
  lastActive: number;
  snapshots: DocumentSnapshot[];
  updates: RuntimeDocumentUpdate[];
}

export interface RuntimeDocumentUpdate {
  id: string;
  docId: string;
  version: number;
  update: number[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

const documents = new Map<string, RuntimeDocumentRecord>();
const MAX_SNAPSHOTS_PER_DOC = 20;

export function getRuntimeDocumentRecord(roomId: string) {
  let record = documents.get(roomId);
  if (!record) {
    record = {
      doc: new Y.Doc(),
      version: 0,
      lastActive: Date.now(),
      snapshots: [],
      updates: [],
    };
    documents.set(roomId, record);
  }

  record.lastActive = Date.now();
  return record;
}

export function getRuntimeDocument(roomId: string) {
  return getRuntimeDocumentRecord(roomId).doc;
}

export function getRuntimeDocumentState(roomId: string) {
  const record = getRuntimeDocumentRecord(roomId);
  return Array.from(Y.encodeStateAsUpdate(record.doc));
}

export function applyRuntimeDocumentUpdate(roomId: string, update: number[], metadata: Record<string, unknown> = {}) {
  const record = getRuntimeDocumentRecord(roomId);
  Y.applyUpdate(record.doc, Uint8Array.from(update));
  record.version += 1;
  record.lastActive = Date.now();
  const timestamp = Date.now();
  record.updates.push({
    id: `${roomId}:update:${record.version}:${timestamp}`,
    docId: roomId,
    version: record.version,
    update,
    timestamp,
    metadata: { bytes: update.length, ...metadata },
  });
  appendEvent(createEvent({
    id: `${roomId}:event:update:${record.version}:${timestamp}`,
    docId: roomId,
    type: 'update',
    userId: String(metadata.userId || 'system'),
    timestamp,
    source: 'yjs',
    payload: {
      version: record.version,
      bytes: update.length,
      update,
      ...metadata,
    },
  }));
  if (record.updates.length > 1000) {
    record.updates.splice(0, record.updates.length - 1000);
  }
  return record.version;
}

export function registerRuntimeSnapshot(roomId: string, snapshot: DocumentSnapshot) {
  const record = getRuntimeDocumentRecord(roomId);
  record.snapshots.push(snapshot);
  if (record.snapshots.length > MAX_SNAPSHOTS_PER_DOC) {
    record.snapshots.splice(0, record.snapshots.length - MAX_SNAPSHOTS_PER_DOC);
  }
}

export function getRuntimeSnapshots(roomId: string) {
  return [...getRuntimeDocumentRecord(roomId).snapshots];
}

export function getRuntimeUpdateLog(roomId: string) {
  return [...getRuntimeDocumentRecord(roomId).updates];
}

export function getRuntimeDocumentVersion(roomId: string) {
  return getRuntimeDocumentRecord(roomId).version;
}

export function getRuntimeDocumentLastActive(roomId: string) {
  return getRuntimeDocumentRecord(roomId).lastActive;
}

export function touchRuntimeDocument(roomId: string) {
  const record = documents.get(roomId);
  if (record) {
    record.lastActive = Date.now();
  }
}

export function getActiveDocumentIds() {
  return Array.from(documents.keys());
}

export function cleanupInactiveRooms(maxIdleMs = 5 * 60 * 1000) {
  const cutoff = Date.now() - maxIdleMs;
  const removed: string[] = [];

  for (const [roomId, record] of documents.entries()) {
    if (record.lastActive >= cutoff) continue;
    record.doc.destroy();
    documents.delete(roomId);
    removed.push(roomId);
  }

  return removed;
}

export function dropRuntimeDocument(roomId: string) {
  const record = documents.get(roomId);
  if (!record) return;
  record.doc.destroy();
  documents.delete(roomId);
}
