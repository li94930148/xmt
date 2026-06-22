import { getEventStream } from '../protocol/eventStream.js';
import { buildNarrative } from './documentNarrative.js';

function mostFrequent(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
}

export function explainUserActions(docId: string) {
  const events = getEventStream(docId);
  const updates = events.filter((event) => event.type === 'update');
  const conflicts = events.filter((event) => event.type === 'conflict');
  const snapshots = events.filter((event) => event.type === 'snapshot');
  const activeUsers = new Set(events.filter((event) => event.userId !== 'system').map((event) => event.userId));
  const narrative = buildNarrative(docId).map((item) => item.text);
  const mostActiveUser = mostFrequent(updates.map((event) => event.userId));
  const sections = updates.map((event) => {
    const section = event.payload?.section || event.payload?.path || event.payload?.field;
    return typeof section === 'string' && section.trim() ? section : '正文区域';
  });
  const mostEditedSection = mostFrequent(sections);
  const conflictHotspots = Array.from(new Set(conflicts.map((event) => {
    const section = event.payload?.section || event.payload?.reason;
    return typeof section === 'string' && section.trim() ? section : '文档写入控制';
  })));

  return {
    summary: `该文档记录了 ${events.length} 个协作事件，${activeUsers.size} 位用户参与，发生 ${updates.length} 次编辑、${snapshots.length} 次快照、${conflicts.length} 次冲突。`,
    narrative,
    highlights: {
      mostActiveUser,
      mostEditedSection,
      conflictHotspots,
    },
  };
}
