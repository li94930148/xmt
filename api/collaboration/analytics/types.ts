export type { CollaborationEvent, CollaborationEventType } from '../protocol/collaborationProtocol.js';

export interface CollaborationDocumentMetrics {
  docId: string;
  joinCount: number;
  leaveCount: number;
  updateCount: number;
  typingCount: number;
  conflictCount: number;
  documentChangeFrequency: number;
  typingFrequency: number;
  lastEventAt: number | null;
}
