import { createEvent } from '../protocol/collaborationProtocol.js';
import { appendEvent } from '../protocol/eventStream.js';

export interface CollaborationLock {
  docId: string;
  reason: string;
  lockedAt: number;
}

export interface CollaborationLockEvent {
  id: string;
  docId: string;
  action: 'locked' | 'unlocked';
  reason?: string;
  userId: string;
  timestamp: number;
}

const locks = new Map<string, CollaborationLock>();
const lockEvents: CollaborationLockEvent[] = [];

export function canEdit(_userId: string | number, docId: string) {
  return !isReadOnly(docId);
}

export function isReadOnly(docId: string) {
  return locks.has(docId);
}

export function setDocLocked(docId: string, reason = 'Document locked', userId = 'system') {
  const lock: CollaborationLock = {
    docId,
    reason,
    lockedAt: Date.now(),
  };
  locks.set(docId, lock);
  appendEvent(createEvent({
    id: `${docId}:event:lock:${lock.lockedAt}`,
    docId,
    type: 'lock',
    userId,
    timestamp: lock.lockedAt,
    source: 'system',
    payload: { reason },
  }));
  lockEvents.push({
    id: `${docId}:lock:${lock.lockedAt}`,
    docId,
    action: 'locked',
    reason,
    userId,
    timestamp: lock.lockedAt,
  });
  return lock;
}

export function releaseLock(docId: string, userId = 'system') {
  const released = locks.delete(docId);
  if (released) {
    const timestamp = Date.now();
    appendEvent(createEvent({
      id: `${docId}:event:unlock:${timestamp}`,
      docId,
      type: 'unlock',
      userId,
      timestamp,
      source: 'system',
    }));
    lockEvents.push({
      id: `${docId}:unlock:${timestamp}`,
      docId,
      action: 'unlocked',
      userId,
      timestamp,
    });
  }
  return released;
}

export function getDocLock(docId: string) {
  return locks.get(docId) ?? null;
}

export function getLockEvents(docId?: string) {
  return docId ? lockEvents.filter((event) => event.docId === docId) : [...lockEvents];
}
