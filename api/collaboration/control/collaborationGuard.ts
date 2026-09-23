import { createEvent } from '../protocol/collaborationProtocol.js';
import { appendEvent } from '../protocol/eventStream.js';
import { randomUUID } from 'node:crypto';
import { queryAll, queryOne, runInTransaction } from '../../database/utils.js';

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

export async function isDocUnlocked(docId: string) {
  return !await isReadOnly(docId);
}

export async function isReadOnly(docId: string) {
  return Boolean(await getDocLock(docId));
}

export async function setDocLocked(docId: string, reason = 'Document locked', userId = 'system') {
  const lock: CollaborationLock = {
    docId,
    reason,
    lockedAt: Date.now(),
  };
  const eventId = `${docId}:lock:${lock.lockedAt}:${randomUUID()}`;
  await runInTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO collaboration_document_locks (doc_id, reason, locked_at, user_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(doc_id) DO UPDATE SET reason = excluded.reason, locked_at = excluded.locked_at, user_id = excluded.user_id`,
      [docId, reason, lock.lockedAt, userId],
    );
    await tx.execute(
      `INSERT INTO collaboration_lock_events (id, doc_id, action, reason, user_id, timestamp)
       VALUES (?, ?, 'locked', ?, ?, ?)`,
      [eventId, docId, reason, userId, lock.lockedAt],
    );
  });
  appendEvent(createEvent({
    id: `${docId}:event:lock:${lock.lockedAt}`,
    docId,
    type: 'lock',
    userId,
    timestamp: lock.lockedAt,
    source: 'system',
    payload: { reason },
  }));
  return lock;
}

export async function releaseLock(docId: string, userId = 'system') {
  const timestamp = Date.now();
  const eventId = `${docId}:unlock:${timestamp}:${randomUUID()}`;
  const released = await runInTransaction(async (tx) => {
    const rowsAffected = await tx.execute('DELETE FROM collaboration_document_locks WHERE doc_id = ?', [docId]);
    if (rowsAffected) {
      await tx.execute(
        `INSERT INTO collaboration_lock_events (id, doc_id, action, user_id, timestamp)
         VALUES (?, ?, 'unlocked', ?, ?)`,
        [eventId, docId, userId, timestamp],
      );
    }
    return rowsAffected > 0;
  });
  if (released) {
    appendEvent(createEvent({
      id: `${docId}:event:unlock:${timestamp}`,
      docId,
      type: 'unlock',
      userId,
      timestamp,
      source: 'system',
    }));
  }
  return released;
}

export async function getDocLock(docId: string) {
  const row = await queryOne<{ doc_id: string; reason: string; locked_at: number }>(
    'SELECT doc_id, reason, locked_at FROM collaboration_document_locks WHERE doc_id = ?',
    [docId],
  );
  return row ? { docId: row.doc_id, reason: row.reason, lockedAt: Number(row.locked_at) } : null;
}

export async function getLockEvents(docId?: string, limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = await queryAll<{ id: string; doc_id: string; action: 'locked' | 'unlocked'; reason: string | null; user_id: string; timestamp: number }>(
    `SELECT id, doc_id, action, reason, user_id, timestamp
     FROM collaboration_lock_events
     ${docId ? 'WHERE doc_id = ?' : ''}
     ORDER BY timestamp DESC LIMIT ?`,
    docId ? [docId, safeLimit] : [safeLimit],
  );
  return rows.map((row) => ({
    id: row.id,
    docId: row.doc_id,
    action: row.action,
    reason: row.reason ?? undefined,
    userId: row.user_id,
    timestamp: Number(row.timestamp),
  }));
}
