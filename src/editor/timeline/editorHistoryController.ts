import {
  buildUnifiedTimeline,
  getTimelineView,
  type BuildUnifiedTimelineSources,
  type UnifiedTimelineEvent,
} from './unifiedContentTimeline';

export function getFullHistory(docId: string, sources: BuildUnifiedTimelineSources = {}) {
  return getTimelineView(docId, sources);
}

export function jumpToTimestamp(docId: string, timestamp: number, sources: BuildUnifiedTimelineSources = {}) {
  const timeline = buildUnifiedTimeline(docId, sources);
  const previous = [...timeline].reverse().find((event) => event.timestamp <= timestamp) || null;
  const next = timeline.find((event) => event.timestamp > timestamp) || null;

  return {
    docId,
    timestamp,
    readonly: true,
    currentEvent: previous,
    nextEvent: next,
  };
}

export function compareTimeline(a: UnifiedTimelineEvent | null, b: UnifiedTimelineEvent | null) {
  if (!a || !b) {
    return {
      changed: Boolean(a || b),
      from: a,
      to: b,
      diff: {},
    };
  }

  return {
    changed: a.id !== b.id || a.timestamp !== b.timestamp || JSON.stringify(a.payload || {}) !== JSON.stringify(b.payload || {}),
    from: a,
    to: b,
    diff: {
      typeChanged: a.type !== b.type,
      sourceChanged: a.source !== b.source,
      payloadChanged: JSON.stringify(a.payload || {}) !== JSON.stringify(b.payload || {}),
    },
  };
}
