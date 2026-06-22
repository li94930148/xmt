import type { CollaborationEvent } from '../protocol/collaborationProtocol.js';
import { getEventStream } from '../protocol/eventStream.js';

export interface NarrativeItem {
  id: string;
  timestamp: number;
  text: string;
  type: CollaborationEvent['type'];
  userId: string;
}

function sectionLabel(event: CollaborationEvent) {
  const section = event.payload?.section || event.payload?.path || event.payload?.field;
  return typeof section === 'string' && section.trim() ? section : '正文区域';
}

export function describeEvent(event: CollaborationEvent) {
  const section = sectionLabel(event);
  const version = event.payload?.version ? `，版本推进到 ${event.payload.version}` : '';
  const reason = typeof event.payload?.reason === 'string' ? event.payload.reason : '协作控制策略';

  switch (event.type) {
    case 'join':
      return `用户 ${event.userId} 加入了协作文档。`;
    case 'leave':
      return `用户 ${event.userId} 离开了协作文档。`;
    case 'update':
      return `用户 ${event.userId} 修改了${section}${version}。`;
    case 'typing':
      return `用户 ${event.userId} 正在编辑${section}。`;
    case 'snapshot':
      return `系统创建了一个可恢复快照。`;
    case 'lock':
      return `文档被锁定，原因是：${reason}。`;
    case 'unlock':
      return `文档锁定已解除。`;
    case 'conflict':
      return `检测到一次协作冲突，系统已阻止不安全写入并保留当前 CRDT 状态。`;
    default:
      return `发生了一次协作事件。`;
  }
}

export function buildNarrative(docId: string): NarrativeItem[] {
  return getEventStream(docId)
    .filter((event) => event.type !== 'typing')
    .map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      text: describeEvent(event),
      type: event.type,
      userId: event.userId,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
