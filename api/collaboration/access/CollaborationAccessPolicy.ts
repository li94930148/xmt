import { getTopicScopeByProductionId, getTopicScopeByShootingId } from '../../utils/access.js';
import type { User } from '../../types/index.js';

export type CollaborationDocument = { kind: 'production' | 'shooting'; id: number; roomId: string };

export function parseCollaborationRoom(roomId: unknown): CollaborationDocument | null {
  const match = typeof roomId === 'string' ? /^(production|shooting):(\d+)$/.exec(roomId) : null;
  if (!match) return null;
  const id = Number(match[2]);
  return Number.isSafeInteger(id) && id > 0 ? { kind: match[1] as CollaborationDocument['kind'], id, roomId: String(roomId) } : null;
}

export class CollaborationAccessPolicy {
  private async scope(roomId: unknown) {
    const document = parseCollaborationRoom(roomId);
    if (!document) return null;
    const scope = document.kind === 'production' ? await getTopicScopeByProductionId(document.id) : await getTopicScopeByShootingId(document.id);
    return scope ? { document, scope } : null;
  }

  private hasDocumentScope(user: User, scope: { creator_id: number | null; assignee_id: number | null; participant_id?: number | null }) {
    return user.role === 'admin' || user.role === 'director' || Number(scope.creator_id) === user.id || Number(scope.assignee_id) === user.id || Number(scope.participant_id) === user.id;
  }

  async canViewDocument(user: User | undefined, roomId: unknown): Promise<boolean> {
    if (!user || user.enabled === false) return false;
    const resolved = await this.scope(roomId);
    return Boolean(resolved && this.hasDocumentScope(user, resolved.scope));
  }

  async canEditDocument(user: User | undefined, roomId: unknown): Promise<boolean> {
    if (!user || user.enabled === false) return false;
    const resolved = await this.scope(roomId);
    if (!resolved) return false;
    if (user.role === 'admin' || user.role === 'editor' || user.role === 'copywriter' || user.role === 'post_production' || user.role === 'camera') return true;
    return this.hasDocumentScope(user, resolved.scope);
  }

  async canManageDocument(user: User | undefined, roomId: unknown): Promise<boolean> {
    if (!user || user.enabled === false || !parseCollaborationRoom(roomId)) return false;
    return user.role === 'admin' || user.role === 'director';
  }
}

export const collaborationAccessPolicy = new CollaborationAccessPolicy();
