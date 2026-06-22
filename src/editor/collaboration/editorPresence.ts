import type { CollaborationUserPresence } from '../../collaboration/core/events';

const presenceByDoc = new Map<string, CollaborationUserPresence[]>();

export function setActiveUsers(docId: string, users: CollaborationUserPresence[]) {
  presenceByDoc.set(docId, users);
}

export function getActiveUsers(docId: string) {
  return presenceByDoc.get(docId) || [];
}

export function getUserCursorMap(users: CollaborationUserPresence[] = []) {
  return users.map((user) => ({
    userId: user.id,
    name: user.name,
    color: user.color,
    cursorLabel: `${user.name || '协作者'}的光标`,
  }));
}

export function getEditingRegions(users: CollaborationUserPresence[] = []) {
  return users
    .filter((user) => user.typing)
    .map((user) => ({
      userId: user.id,
      userName: user.name,
      region: '正文区域',
      message: `${user.name || '协作者'}正在编辑正文`,
    }));
}
