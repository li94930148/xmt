import type { EditorState } from './editorStateManager';
import { reduceEditorStateBatch } from './editorStateReducer';
import {
  recordEventQueueSize,
  recordSyncLatency,
} from '../performance/editorPerformanceMonitor';

export type EditorStateEventType =
  | 'yjs:update'
  | 'collaboration:remote-change'
  | 'writeConsistency:save'
  | 'writeConsistency:saved'
  | 'conflict:event'
  | 'editor:local-change'
  | 'editor:synced';

export interface EditorStateEvent {
  type: EditorStateEventType;
  docId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

type Listener = () => void;

const BATCH_WINDOW_MS = 16;
const REMOTE_MERGE_MS = 50;
const TYPING_THROTTLE_MS = 100;
const SAVE_DEBOUNCE_MS = 2000;

const stateByDoc = new Map<string, EditorState>();
const eventByDoc = new Map<string, EditorStateEvent>();
const listeners = new Map<string, Set<Listener>>();
const pendingEvents = new Map<string, EditorStateEvent[]>();
const batchTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastAcceptedAt = new Map<string, number>();
const lastSaveAt = new Map<string, number>();

function throttleKey(event: EditorStateEvent) {
  return `${event.docId}:${event.type}`;
}

function shouldDropEvent(event: EditorStateEvent) {
  const now = event.timestamp;
  const key = throttleKey(event);
  const previous = lastAcceptedAt.get(key) || 0;

  if (event.type === 'collaboration:remote-change' && now - previous < REMOTE_MERGE_MS) return true;
  if (event.metadata?.typing === true && now - previous < TYPING_THROTTLE_MS) return true;

  if (event.type === 'writeConsistency:save') {
    const lastSave = lastSaveAt.get(event.docId) || 0;
    if (now - lastSave < SAVE_DEBOUNCE_MS) return true;
    lastSaveAt.set(event.docId, now);
  }

  lastAcceptedAt.set(key, now);
  return false;
}

export function createEditorStateEvent(
  type: EditorStateEventType,
  docId: string,
  metadata?: Record<string, unknown>,
): EditorStateEvent {
  return {
    type,
    docId,
    timestamp: Date.now(),
    metadata,
  };
}

export function emitEditorStateEvent(event: EditorStateEvent) {
  if (shouldDropEvent(event)) {
    return stateByDoc.get(event.docId) || 'idle';
  }

  if (event.type === 'conflict:event' || event.type === 'writeConsistency:saved') {
    return flushEvents(event.docId, [event]);
  }

  const queue = pendingEvents.get(event.docId) || [];
  queue.push(event);
  pendingEvents.set(event.docId, queue);
  recordEventQueueSize(event.docId, queue.length);

  if (!batchTimers.has(event.docId)) {
    batchTimers.set(event.docId, setTimeout(() => flushEvents(event.docId), BATCH_WINDOW_MS));
  }

  return stateByDoc.get(event.docId) || 'idle';
}

export function emitEditorState(
  type: EditorStateEventType,
  docId: string,
  metadata?: Record<string, unknown>,
) {
  return emitEditorStateEvent(createEditorStateEvent(type, docId, metadata));
}

export function getEditorEventState(docId: string): EditorState {
  return stateByDoc.get(docId) || 'idle';
}

export function getLastEditorStateEvent(docId: string) {
  return eventByDoc.get(docId) || null;
}

export function batchEvents(events: EditorStateEvent[], windowMs = BATCH_WINDOW_MS) {
  if (events.length === 0) return;

  const grouped = new Map<string, EditorStateEvent[]>();
  for (const event of events) {
    grouped.set(event.docId, [...(grouped.get(event.docId) || []), event]);
  }

  for (const [docId, docEvents] of grouped.entries()) {
    const queue = pendingEvents.get(docId) || [];
    queue.push(...docEvents.filter((event) => !shouldDropEvent(event)));
    pendingEvents.set(docId, queue);
    recordEventQueueSize(docId, queue.length);
    if (!batchTimers.has(docId)) {
      batchTimers.set(docId, setTimeout(() => flushEvents(docId), windowMs));
    }
  }
}

function flushEvents(docId: string, immediateEvents: EditorStateEvent[] = []) {
  const queued = pendingEvents.get(docId) || [];
  pendingEvents.delete(docId);
  const timer = batchTimers.get(docId);
  if (timer) clearTimeout(timer);
  batchTimers.delete(docId);

  const events = [...queued, ...immediateEvents];
  if (events.length === 0) return stateByDoc.get(docId) || 'idle';

  const previous = stateByDoc.get(docId) || 'idle';
  const next = reduceEditorStateBatch(previous, events);
  const latest = events[events.length - 1];

  stateByDoc.set(docId, next);
  eventByDoc.set(docId, latest);
  recordEventQueueSize(docId, 0);
  recordSyncLatency(docId, Date.now() - latest.timestamp);
  listeners.get(docId)?.forEach((listener) => listener());

  return next;
}

export function subscribeEditorState(docId: string, listener: Listener) {
  const docListeners = listeners.get(docId) || new Set<Listener>();
  docListeners.add(listener);
  listeners.set(docId, docListeners);

  return () => {
    docListeners.delete(listener);
    if (docListeners.size === 0) {
      listeners.delete(docId);
    }
  };
}
