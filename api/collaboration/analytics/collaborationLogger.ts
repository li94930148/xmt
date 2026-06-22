import type { CollaborationDocumentMetrics, CollaborationEvent } from './types.js';
import { normalizeEvent } from '../protocol/collaborationProtocol.js';
import { appendEvent, getEventStream } from '../protocol/eventStream.js';

function now() {
  return Date.now();
}

export function logCollaborationEvent(
  event: Omit<CollaborationEvent, 'id' | 'timestamp' | 'source' | 'payload'> & {
    id?: string;
    timestamp?: number;
    source?: CollaborationEvent['source'];
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
) {
  return appendEvent(normalizeEvent({
    ...event,
    source: event.source || 'socket',
  }));
}

export function getCollaborationEvents(docId?: string) {
  return getEventStream(docId);
}

export function getCollaborationMetrics(docId: string): CollaborationDocumentMetrics {
  const docEvents = getCollaborationEvents(docId);
  const firstAt = docEvents[0]?.timestamp ?? now();
  const lastAt = docEvents[docEvents.length - 1]?.timestamp ?? null;
  const durationMinutes = Math.max(((lastAt ?? now()) - firstAt) / 60000, 1);

  const count = (type: CollaborationEvent['type']) =>
    docEvents.filter((event) => event.type === type).length;

  const updateCount = count('update');
  const typingCount = count('typing');

  return {
    docId,
    joinCount: count('join'),
    leaveCount: count('leave'),
    updateCount,
    typingCount,
    conflictCount: count('conflict'),
    documentChangeFrequency: updateCount / durationMinutes,
    typingFrequency: typingCount / durationMinutes,
    lastEventAt: lastAt,
  };
}
