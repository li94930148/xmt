export type EditorTelemetryEventType = 'edit start' | 'edit stop' | 'remote edit' | 'save trigger' | 'conflict event';

export interface EditorTelemetryEvent {
  type: EditorTelemetryEventType;
  docId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

const telemetryEvents: EditorTelemetryEvent[] = [];

export function recordEditorTelemetry(type: EditorTelemetryEventType, metadata: Record<string, unknown> = {}) {
  const event: EditorTelemetryEvent = {
    type,
    docId: typeof metadata.docId === 'string' ? metadata.docId : undefined,
    timestamp: Date.now(),
    metadata,
  };
  telemetryEvents.push(event);
  if (telemetryEvents.length > 500) {
    telemetryEvents.splice(0, telemetryEvents.length - 500);
  }
  return event;
}

export function getEditorTelemetry(docId?: string) {
  if (!docId) return [...telemetryEvents];
  return telemetryEvents.filter((event) => event.docId === docId);
}
