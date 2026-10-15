import * as Y from 'yjs';
import { apiLogger } from '../../observability/logger.js';
import type { DocumentSnapshot } from '../recovery/documentSnapshot.js';
import { createEvent } from '../protocol/collaborationProtocol.js';
import { appendEvent } from '../protocol/eventStream.js';
import {
  PersistedRuntimeDocumentLockedError,
  PersistedRuntimeVersionConflictError,
  checkpointRuntimeDocument,
  loadPersistedRuntimeDocument,
  persistRuntimeUpdate,
  RUNTIME_CHECKPOINT_INTERVAL,
} from './persistence.js';

export interface RuntimeDocumentRecord {
  doc: Y.Doc;
  version: number;
  lastActive: number;
  snapshots: DocumentSnapshot[];
  updates: RuntimeDocumentUpdate[];
  checkpointVersion: number;
  persistenceLoaded: boolean;
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
const loadingDocuments = new Map<string, Promise<RuntimeDocumentRecord>>();
const updateQueues = new Map<string, Promise<void>>();
const MAX_SNAPSHOTS_PER_DOC = 20;
const MAX_UPDATE_SIZE = 500 * 1024;
const MAX_UPDATES_PER_DOC = 1000;
const MAX_RUNTIME_DOCUMENT_STATE_BYTES = 16 * 1024 * 1024;
const MAX_PERSISTED_VERSION_RETRIES = 8;
/** Input boundary limit. Retains room for normal full-document Yjs updates without trusting transport limits alone. */
export const MAX_COLLAB_UPDATE_BYTES = 500 * 1024;

export function isValidCollaborationUpdate(update: unknown): update is number[] {
  return Array.isArray(update)
    && update.length > 0
    && update.length <= MAX_COLLAB_UPDATE_BYTES
    && update.every((value) => Number.isInteger(value) && value >= 0 && value <= 255);
}

export function getRuntimeDocumentRecord(roomId: string) {
  let record = documents.get(roomId);
  if (!record) {
    record = {
      doc: new Y.Doc(),
      version: 0,
      lastActive: Date.now(),
      snapshots: [],
      updates: [],
      checkpointVersion: 0,
      persistenceLoaded: false,
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

export async function ensureRuntimeDocumentLoaded(roomId: string) {
  const existing = documents.get(roomId);
  if (existing?.persistenceLoaded) return existing;

  const pending = loadingDocuments.get(roomId);
  if (pending) return pending;

  const load = (async () => {
    const persisted = await loadPersistedRuntimeDocument(roomId);
    const record = recordFromPersisted(roomId, persisted);

    const previous = documents.get(roomId);
    if (previous && !previous.persistenceLoaded) previous.doc.destroy();
    documents.set(roomId, record);
    return record;
  })();
  loadingDocuments.set(roomId, load);
  try {
    return await load;
  } finally {
    if (loadingDocuments.get(roomId) === load) loadingDocuments.delete(roomId);
  }
}

function recordFromPersisted(roomId: string, persisted: Awaited<ReturnType<typeof loadPersistedRuntimeDocument>>): RuntimeDocumentRecord {
  const doc = new Y.Doc();
  try {
    if (persisted.state.length > 0) Y.applyUpdate(doc, Uint8Array.from(persisted.state));
    for (const item of persisted.updates) {
      Y.applyUpdate(doc, Uint8Array.from(item.update));
    }
  } catch (error) {
    doc.destroy();
    const recoveryError = new Error('Stored collaboration state could not be recovered');
    (recoveryError as Error & { cause?: unknown }).cause = error;
    throw recoveryError;
  }

  return {
    doc,
    version: persisted.version,
    lastActive: Date.now(),
    snapshots: [],
    updates: persisted.updates.map((item) => ({
      id: `${roomId}:update:${item.version}:${item.timestamp}`,
      docId: roomId,
      version: item.version,
      update: item.update,
      timestamp: item.timestamp,
      metadata: { bytes: item.update.length, userId: item.userId, recovered: true },
    })),
    checkpointVersion: persisted.checkpointVersion,
    persistenceLoaded: true,
  };
}

async function reloadRuntimeDocumentFromPersistence(roomId: string) {
  const persisted = await loadPersistedRuntimeDocument(roomId);
  const previous = documents.get(roomId);
  if (previous?.persistenceLoaded && persisted.version < previous.version) {
    throw new Error('Persisted collaboration state is behind the active runtime version');
  }
  const next = recordFromPersisted(roomId, persisted);
  if (previous) previous.doc.destroy();
  documents.set(roomId, next);
  return next;
}

/** Refresh a process-local Y.Doc before a newly joined socket receives its initial SYNC. */
export async function refreshRuntimeDocument(roomId: string) {
  await ensureRuntimeDocumentLoaded(roomId);
  return serializeRoomUpdate(roomId, () => reloadRuntimeDocumentFromPersistence(roomId));
}

async function serializeRoomUpdate<T>(roomId: string, operation: () => Promise<T>) {
  const previous = updateQueues.get(roomId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  updateQueues.set(roomId, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (updateQueues.get(roomId) === current) updateQueues.delete(roomId);
  }
}

export class RuntimeDocumentTooLargeError extends Error {
  constructor() {
    super('Collaboration document exceeds the runtime persistence limit');
    this.name = 'RuntimeDocumentTooLargeError';
  }
}

export class RuntimeDocumentPersistenceError extends Error {
  constructor(cause: unknown) {
    super('Collaboration update could not be persisted');
    this.name = 'RuntimeDocumentPersistenceError';
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

export class RuntimeDocumentLockedError extends Error {
  constructor(readonly reason: string) {
    super('Collaboration document is locked');
    this.name = 'RuntimeDocumentLockedError';
  }
}

export class RuntimeDocumentContentionError extends Error {
  constructor() {
    super('Collaboration document changed repeatedly while applying an update');
    this.name = 'RuntimeDocumentContentionError';
  }
}

function isSqliteWriteContention(error: unknown) {
  let current = error;
  const visited = new Set<object>();
  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === 'SQLITE_BUSY' || candidate.code === 'SQLITE_LOCKED') return true;
    current = candidate.cause;
  }
  return false;
}

export async function applyRuntimeDocumentUpdate(roomId: string, update: number[], metadata: Record<string, unknown> = {}) {
  if (!isValidCollaborationUpdate(update)) throw new Error('Invalid collaboration update');
  await ensureRuntimeDocumentLoaded(roomId);

  return serializeRoomUpdate(roomId, async () => {
    for (let attempt = 1; attempt <= MAX_PERSISTED_VERSION_RETRIES; attempt += 1) {
      const record = await ensureRuntimeDocumentLoaded(roomId);
      const candidate = new Y.Doc();
      let installed = false;
      try {
        Y.applyUpdate(candidate, Y.encodeStateAsUpdate(record.doc));
        Y.applyUpdate(candidate, Uint8Array.from(update));
        const state = Y.encodeStateAsUpdate(candidate);
        if (state.byteLength > MAX_RUNTIME_DOCUMENT_STATE_BYTES) throw new RuntimeDocumentTooLargeError();

        const nextVersion = record.version + 1;
        const timestamp = Date.now();
        try {
          await persistRuntimeUpdate(roomId, nextVersion, update, metadata.userId as string | number | undefined, timestamp);
        } catch (error) {
          if (error instanceof PersistedRuntimeVersionConflictError || isSqliteWriteContention(error)) {
            candidate.destroy();
            if (isSqliteWriteContention(error)) {
              await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 20, 200)));
            }
            try {
              await reloadRuntimeDocumentFromPersistence(roomId);
            } catch (reloadError) {
              throw new RuntimeDocumentPersistenceError(reloadError);
            }
            continue;
          }
          if (error instanceof PersistedRuntimeDocumentLockedError) {
            throw new RuntimeDocumentLockedError(error.reason);
          }
          throw new RuntimeDocumentPersistenceError(error);
        }

        record.doc.destroy();
        record.doc = candidate;
        installed = true;
        record.version = nextVersion;
        record.lastActive = timestamp;
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

        if (record.version - record.checkpointVersion >= RUNTIME_CHECKPOINT_INTERVAL) {
          try {
            await checkpointRuntimeDocument(roomId, record.version, Array.from(state), timestamp);
            record.checkpointVersion = record.version;
            record.updates = record.updates.filter((item) => item.version > record.checkpointVersion);
          } catch (error) {
            // The just-accepted update remains durable in the append log; checkpoint failure is retryable.
            apiLogger.warn({
              module: 'collaboration',
              operation: 'runtime.checkpoint_deferred',
              version: record.version,
              error: { code: 'CHECKPOINT_DEFERRED', name: error instanceof Error ? error.name : 'UnknownError' },
            }, 'api.collaboration.checkpoint_deferred');
          }
        }

        const bufferedBytes = record.updates.reduce((total, item) => total + item.update.length, 0);
        if (bufferedBytes > MAX_UPDATE_SIZE || record.updates.length > MAX_UPDATES_PER_DOC) {
          compactUpdates(roomId);
        }
        return record.version;
      } catch (error) {
        if (!installed) candidate.destroy();
        throw error;
      }
    }

    throw new RuntimeDocumentContentionError();
  });
}

function createCompactionSnapshot(roomId: string, record: RuntimeDocumentRecord) {
  const state = Array.from(Y.encodeStateAsUpdate(record.doc));
  const timestamp = Date.now();
  const snapshot: DocumentSnapshot = {
    id: `${roomId}:snapshot:compacted:${timestamp}`,
    docId: roomId,
    state,
    version: record.version,
    createdAt: timestamp,
  };

  registerRuntimeSnapshot(roomId, snapshot);
  appendEvent(createEvent({
    id: snapshot.id,
    docId: roomId,
    type: 'snapshot',
    userId: 'system',
    timestamp,
    source: 'system',
    payload: {
      snapshotId: snapshot.id,
      version: snapshot.version,
      bytes: state.length,
      state,
      reason: 'update compaction',
    },
  }));

  return snapshot;
}

export function compactUpdates(roomId?: string) {
  const targetIds = roomId ? [roomId] : Array.from(documents.keys());
  const results: Array<{ roomId: string; before: number; after: number; snapshotId?: string }> = [];

  for (const targetId of targetIds) {
    const record = documents.get(targetId);
    if (!record || record.updates.length === 0) continue;

    const before = record.updates.reduce((total, item) => total + item.update.length, 0);
    const merged = Array.from(Y.mergeUpdates(record.updates.map((item) => Uint8Array.from(item.update))));
    const snapshot = before > MAX_UPDATE_SIZE ? createCompactionSnapshot(targetId, record) : null;
    const timestamp = Date.now();

    record.updates = [{
      id: `${targetId}:update:compacted:${record.version}:${timestamp}`,
      docId: targetId,
      version: record.version,
      update: merged,
      timestamp,
      metadata: {
        bytes: merged.length,
        compacted: true,
        previousBytes: before,
        stateVector: Array.from(Y.encodeStateVector(record.doc)),
      },
    }];

    results.push({
      roomId: targetId,
      before,
      after: merged.length,
      snapshotId: snapshot?.id,
    });
  }

  return results;
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

export function cleanupInactiveDocs(timeout = 5 * 60 * 1000) {
  return cleanupInactiveRooms(timeout);
}

export function dropRuntimeDocument(roomId: string) {
  const record = documents.get(roomId);
  if (!record) return;
  record.doc.destroy();
  documents.delete(roomId);
}
