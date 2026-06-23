import { getEditorTelemetry } from '../telemetry/editorTelemetry';

export type UnifiedTimelineType = 'edit' | 'save' | 'version' | 'snapshot' | 'conflict';
export type UnifiedTimelineSource = 'realtime' | 'db' | 'version';

export interface UnifiedTimelineEvent {
  id: string;
  docId: string;
  timestamp: number;
  type: UnifiedTimelineType;
  source: UnifiedTimelineSource;
  userId?: string;
  payload?: Record<string, unknown>;
}

export interface UnifiedTimelineSession {
  id: string;
  start: number;
  end: number;
  events: UnifiedTimelineEvent[];
}

export interface BuildUnifiedTimelineSources {
  yjsEvents?: Array<Record<string, any>>;
  saveEvents?: Array<Record<string, any>>;
  versionEvents?: Array<Record<string, any>>;
}

const timelineRegistry: UnifiedTimelineEvent[] = [];
const SESSION_GAP_MS = 5 * 60 * 1000;
const TIMELINE_BATCH_WINDOW_MS = 100;
const pendingTimelineEvents: UnifiedTimelineEvent[] = [];
let timelineFlushTimer: ReturnType<typeof setTimeout> | null = null;

function eventId(prefix: string, docId: string, timestamp: number) {
  return `${docId}:${prefix}:${timestamp}:${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeType(type?: string): UnifiedTimelineType {
  if (type === 'snapshot') return 'snapshot';
  if (type === 'conflict') return 'conflict';
  if (type === 'save' || type === 'save trigger') return 'save';
  if (type === 'version' || type === 'major' || type === 'minor' || type === 'current') return 'version';
  return 'edit';
}

function normalizeSource(raw: Record<string, any>, type: UnifiedTimelineType): UnifiedTimelineSource {
  if (type === 'version') return 'version';
  if (type === 'save' || raw.source === 'db') return 'db';
  return 'realtime';
}

export function normalizeTimelineEvent(raw: Record<string, any>, fallbackDocId?: string): UnifiedTimelineEvent {
  const timestamp = Number(raw.timestamp || raw.createdAt || raw.created_at || Date.now());
  const docId = String(raw.docId || raw.doc_id || fallbackDocId || '');
  const type = normalizeType(raw.type || raw.changeType || raw.change_type);
  const source = normalizeSource(raw, type);

  return {
    id: String(raw.id || eventId(type, docId, timestamp)),
    docId,
    timestamp,
    type,
    source,
    userId: raw.userId ? String(raw.userId) : raw.operatorName || raw.operator_name,
    payload: {
      ...raw.payload,
      ...raw.metadata,
      version: raw.version || raw.payload?.version,
      label: raw.label,
      changeType: raw.changeType || raw.change_type,
      state: raw.payload?.state,
      update: raw.payload?.update,
      bytes: raw.payload?.bytes,
    },
  };
}

export function recordTimelineEvent(event: Omit<UnifiedTimelineEvent, 'id'> & { id?: string }) {
  const normalized: UnifiedTimelineEvent = {
    ...event,
    id: event.id || eventId(event.type, event.docId, event.timestamp),
  };
  pendingTimelineEvents.push(normalized);
  if (!timelineFlushTimer) {
    timelineFlushTimer = setTimeout(flushPendingTimelineEvents, TIMELINE_BATCH_WINDOW_MS);
  }
  return normalized;
}

function shouldMergeTimelineEvents(previous: UnifiedTimelineEvent, next: UnifiedTimelineEvent) {
  return previous.docId === next.docId
    && previous.type === next.type
    && previous.source === next.source
    && next.timestamp - previous.timestamp <= TIMELINE_BATCH_WINDOW_MS
    && (next.type === 'edit' || next.type === 'save');
}

function mergeTimelineEvents(previous: UnifiedTimelineEvent, next: UnifiedTimelineEvent): UnifiedTimelineEvent {
  return {
    ...next,
    id: previous.id,
    timestamp: next.timestamp,
    payload: {
      ...previous.payload,
      ...next.payload,
      bytes: Number(previous.payload?.bytes || 0) + Number(next.payload?.bytes || 0),
      merged: Number(previous.payload?.merged || 1) + 1,
    },
  };
}

export function flushPendingTimelineEvents() {
  if (timelineFlushTimer) {
    clearTimeout(timelineFlushTimer);
    timelineFlushTimer = null;
  }

  if (pendingTimelineEvents.length === 0) return;

  const sorted = pendingTimelineEvents.splice(0).sort((a, b) => a.timestamp - b.timestamp);

  for (const event of sorted) {
    const previous = timelineRegistry[timelineRegistry.length - 1];
    if (previous && shouldMergeTimelineEvents(previous, event)) {
      timelineRegistry[timelineRegistry.length - 1] = mergeTimelineEvents(previous, event);
      continue;
    }

    timelineRegistry.push(event);
  }

  if (timelineRegistry.length > 1000) {
    timelineRegistry.splice(0, timelineRegistry.length - 1000);
  }
}

export function buildUnifiedTimeline(docId: string, sources: BuildUnifiedTimelineSources = {}) {
  flushPendingTimelineEvents();
  const registered = timelineRegistry.filter((event) => event.docId === docId);
  const telemetry = getEditorTelemetry(docId).map((event) => normalizeTimelineEvent({
    id: `${docId}:telemetry:${event.type}:${event.timestamp}`,
    docId,
    timestamp: event.timestamp,
    type: event.type,
    source: event.type === 'save trigger' ? 'db' : 'realtime',
    payload: event.metadata,
  }, docId));
  const yjsEvents = (sources.yjsEvents || []).map((event) => normalizeTimelineEvent(event, docId));
  const saveEvents = (sources.saveEvents || []).map((event) => normalizeTimelineEvent({ ...event, type: 'save' }, docId));
  const versionEvents = (sources.versionEvents || []).map((event) => normalizeTimelineEvent({ ...event, type: 'version' }, docId));
  const seen = new Set<string>();

  return [...registered, ...telemetry, ...yjsEvents, ...saveEvents, ...versionEvents]
    .filter((event) => event.docId === docId)
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((event) => {
      const key = `${event.id}:${event.type}:${event.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getTimelineView(docId: string, sources: BuildUnifiedTimelineSources = {}) {
  const timeline = buildUnifiedTimeline(docId, sources);
  const sessions: UnifiedTimelineSession[] = [];

  for (const event of timeline) {
    const current = sessions[sessions.length - 1];
    if (!current || event.timestamp - current.end > SESSION_GAP_MS) {
      sessions.push({
        id: `${docId}:session:${event.timestamp}`,
        start: event.timestamp,
        end: event.timestamp,
        events: [event],
      });
      continue;
    }

    current.events.push(event);
    current.end = event.timestamp;
  }

  return {
    docId,
    timeline,
    sessions,
  };
}
