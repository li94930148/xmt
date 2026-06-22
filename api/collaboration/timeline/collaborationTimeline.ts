import { getEventStream } from '../protocol/eventStream.js';
import type { CollaborationEvent } from '../protocol/collaborationProtocol.js';

export type TimelineEventType = 'join' | 'leave' | 'update' | 'snapshot' | 'lock' | 'conflict';

export interface CollaborationTimelineEvent {
  id: string;
  timestamp: number;
  type: TimelineEventType;
  userId: string;
  diff?: Record<string, unknown>;
  snapshotId?: string;
}

function mapEventType(type: CollaborationEvent['type']): TimelineEventType | null {
  if (type === 'join' || type === 'leave' || type === 'update') return type;
  if (type === 'snapshot') return 'snapshot';
  if (type === 'lock' || type === 'unlock') return 'lock';
  if (type === 'conflict') return 'conflict';
  return null;
}

export function buildTimeline(docId: string): CollaborationTimelineEvent[] {
  return getEventStream(docId)
    .flatMap<CollaborationTimelineEvent>((event, index) => {
      const type = mapEventType(event.type);
      if (!type) return [];
      return [{
        id: event.id || `${docId}:event:${event.timestamp}:${index}`,
        timestamp: event.timestamp,
        type,
        userId: event.userId,
        diff: {
          source: event.source,
          ...(event.type === 'unlock' ? { action: 'unlock' } : {}),
          ...(event.payload || {}),
        },
        snapshotId: typeof event.payload?.snapshotId === 'string' ? event.payload.snapshotId : undefined,
      }];
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function getTimelineEvents(docId: string) {
  return buildTimeline(docId);
}
