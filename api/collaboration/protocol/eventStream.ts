import type { CollaborationEvent, CollaborationEventType } from './collaborationProtocol.js';
import { validateEvent } from './collaborationProtocol.js';

const events: CollaborationEvent[] = [];
const MAX_EVENTS = 10000;

export function appendEvent(event: CollaborationEvent) {
  if (!validateEvent(event)) {
    throw new Error(`Invalid collaboration event: ${JSON.stringify(event)}`);
  }

  events.push(event);

  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  return event;
}

export function getEventStream(docId?: string) {
  return docId ? events.filter((event) => event.docId === docId) : [...events];
}

export function queryByType(docId: string, type: CollaborationEventType) {
  return getEventStream(docId).filter((event) => event.type === type);
}
