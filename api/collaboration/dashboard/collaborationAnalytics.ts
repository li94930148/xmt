import { getEventStream } from '../protocol/eventStream.js';

function getActiveUserCount(docId: string) {
  const latestByUser = new Map<string, string>();
  for (const event of getEventStream(docId)) {
    if (event.type === 'join' || event.type === 'leave') {
      latestByUser.set(event.userId, event.type);
    }
  }
  return Array.from(latestByUser.values()).filter((type) => type === 'join').length;
}

export function getDocStats(docId: string) {
  const events = getEventStream(docId);
  const updates = events.filter((event) => event.type === 'update');
  const typing = events.filter((event) => event.type === 'typing');
  const conflicts = events.filter((event) => event.type === 'conflict');
  const snapshots = events.filter((event) => event.type === 'snapshot');
  const firstAt = events[0]?.timestamp ?? Date.now();
  const lastAt = events[events.length - 1]?.timestamp ?? null;
  const durationMinutes = Math.max(((lastAt ?? Date.now()) - firstAt) / 60000, 1);

  return {
    docId,
    totalEdits: updates.length,
    activeUsers: getActiveUserCount(docId),
    conflictCount: conflicts.length,
    typingFrequency: typing.length / durationMinutes,
    documentChangeFrequency: updates.length / durationMinutes,
    snapshotCount: snapshots.length,
    lastSnapshotAt: snapshots[snapshots.length - 1]?.timestamp ?? null,
    lastEventAt: lastAt,
  };
}

export function getUserContributionMap(docId: string) {
  const updateEvents = getEventStream(docId).filter((event) => event.type === 'update');
  const total = Math.max(updateEvents.length, 1);
  const counts = new Map<string, number>();

  for (const event of updateEvents) {
    counts.set(event.userId, (counts.get(event.userId) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([userId, edits]) => ({
      userId,
      edits,
      ratio: edits / total,
    }))
    .sort((a, b) => b.edits - a.edits);
}
