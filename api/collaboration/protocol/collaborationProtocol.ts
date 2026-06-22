export type CollaborationEventType =
  | 'join'
  | 'leave'
  | 'update'
  | 'typing'
  | 'snapshot'
  | 'lock'
  | 'unlock'
  | 'conflict';

export type CollaborationEventSource = 'socket' | 'yjs' | 'system';

export interface CollaborationEvent {
  id: string;
  docId: string;
  type: CollaborationEventType;
  userId: string;
  timestamp: number;
  payload?: Record<string, unknown>;
  source: CollaborationEventSource;
}

export type RawCollaborationEvent = Partial<CollaborationEvent> & {
  roomId?: string;
  metadata?: Record<string, unknown>;
};

const VALID_TYPES = new Set<CollaborationEventType>([
  'join',
  'leave',
  'update',
  'typing',
  'snapshot',
  'lock',
  'unlock',
  'conflict',
]);

const VALID_SOURCES = new Set<CollaborationEventSource>(['socket', 'yjs', 'system']);

function createEventId(event: Pick<CollaborationEvent, 'docId' | 'type' | 'userId' | 'timestamp'>) {
  return `${event.docId}:${event.type}:${event.userId}:${event.timestamp}:${Math.random().toString(36).slice(2, 8)}`;
}

export function validateEvent(event: Partial<CollaborationEvent>): event is CollaborationEvent {
  return (
    typeof event.id === 'string' &&
    event.id.length > 0 &&
    typeof event.docId === 'string' &&
    event.docId.length > 0 &&
    typeof event.userId === 'string' &&
    event.userId.length > 0 &&
    typeof event.timestamp === 'number' &&
    Number.isFinite(event.timestamp) &&
    typeof event.type === 'string' &&
    VALID_TYPES.has(event.type as CollaborationEventType) &&
    typeof event.source === 'string' &&
    VALID_SOURCES.has(event.source as CollaborationEventSource)
  );
}

export function createEvent(input: {
  id?: string;
  docId: string;
  type: CollaborationEventType;
  userId: string | number;
  timestamp?: number;
  payload?: Record<string, unknown>;
  source?: CollaborationEventSource;
}) {
  const timestamp = input.timestamp ?? Date.now();
  const event: CollaborationEvent = {
    id: input.id || createEventId({
      docId: input.docId,
      type: input.type,
      userId: String(input.userId),
      timestamp,
    }),
    docId: input.docId,
    type: input.type,
    userId: String(input.userId),
    timestamp,
    payload: input.payload,
    source: input.source || 'system',
  };

  if (!validateEvent(event)) {
    throw new Error(`Invalid collaboration event: ${JSON.stringify(event)}`);
  }

  return event;
}

export function normalizeEvent(rawEvent: RawCollaborationEvent) {
  return createEvent({
    id: rawEvent.id,
    docId: String(rawEvent.docId || rawEvent.roomId || ''),
    type: rawEvent.type as CollaborationEventType,
    userId: String(rawEvent.userId || 'system'),
    timestamp: rawEvent.timestamp,
    payload: rawEvent.payload || rawEvent.metadata,
    source: rawEvent.source || 'system',
  });
}
