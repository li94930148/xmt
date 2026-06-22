import { useEffect, useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  COLLABORATION_EVENTS,
  type CollaborationUserPresence,
} from '../core/events';
import { defineWriteSource } from '../core/writeConsistency';
import { SocketYjsProvider } from './SocketYjsProvider';

const USER_COLORS = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#4f46e5',
];

function colorForUser(userId: number) {
  return USER_COLORS[Math.abs(userId) % USER_COLORS.length];
}

export interface CollaborativeDocumentOptions {
  enabled: boolean;
  roomId?: string;
  socket: Socket | null;
  user?: { id: number; name: string; role?: string } | null;
}

export function useCollaborativeDocument({
  enabled,
  roomId,
  socket,
  user,
}: CollaborativeDocumentOptions) {
  const [provider, setProvider] = useState<SocketYjsProvider | null>(null);
  const [users, setUsers] = useState<CollaborationUserPresence[]>([]);
  const [synced, setSynced] = useState(false);

  const presence = useMemo<CollaborationUserPresence | null>(() => {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name || `User ${user.id}`,
      role: user.role,
      color: colorForUser(user.id),
    };
  }, [user]);

  useEffect(() => {
    if (!enabled || !roomId || !socket || !presence) {
      setProvider(null);
      setUsers([]);
      setSynced(false);
      return;
    }

    setSynced(false);
    const nextProvider = new SocketYjsProvider({
      socket,
      roomId,
      user: presence,
      onSynced: () => setSynced(true),
    });

    const handleUsers = (payload: { roomId: string; users: CollaborationUserPresence[] }) => {
      if (payload.roomId !== roomId) return;
      setUsers(payload.users);
    };

    socket.on(COLLABORATION_EVENTS.USERS, handleUsers);
    setProvider(nextProvider);

    return () => {
      socket.off(COLLABORATION_EVENTS.USERS, handleUsers);
      nextProvider.destroy();
      setProvider(null);
      setUsers([]);
      setSynced(false);
    };
  }, [enabled, presence, roomId, socket]);

  return {
    provider: synced ? provider : null,
    initializing: Boolean(enabled && roomId && socket && presence && !synced),
    writeSource: defineWriteSource({
      docId: roomId || '',
      hasYjsState: Boolean(provider && synced && !provider.isEmpty),
      hasDatabaseContent: Boolean(provider && synced && provider.isEmpty),
      hasSnapshotState: false,
    }),
    users,
    connected: Boolean(provider && synced && socket?.connected),
  };
}
