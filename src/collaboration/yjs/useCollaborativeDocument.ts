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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);

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
      setSyncError(null);
      setRecoveryBlocked(false);
      return;
    }

    setSynced(false);
    setSyncError(null);
    setRecoveryBlocked(false);
    const nextProvider = new SocketYjsProvider({
      socket,
      roomId,
      user: presence,
      onSynced: () => {
        setSynced(true);
        setSyncError(null);
        setRecoveryBlocked(false);
      },
      onUpdatesConfirmed: () => setSyncError(null),
      onConflict: (payload) => {
        if (payload.code === 'LOCAL_OUTBOX_RESTORE_FAILED') setRecoveryBlocked(true);
        const messages: Record<string, string> = {
          PERSISTENCE_FAILED: '协作中间内容暂未确认保存，系统会保留并自动重试；请同时使用正文保存。',
          ACK_TIMEOUT: '暂未收到协作保存确认，系统会保留并自动重试；请同时使用正文保存。',
          RECOVERY_FAILED: '协作文档恢复失败，正文自动保存状态不受影响；请确认实时连接恢复后再继续协作。',
          DOCUMENT_TOO_LARGE: '协作文档已超过安全容量上限，请保存正文并联系管理员。',
          LOCAL_OUTBOX_RESTORE_FAILED: '本机未能恢复尚未确认的协作内容，已暂时锁定编辑以避免覆盖；请检查浏览器存储后重新打开稿件。',
          LOCAL_OUTBOX_WRITE_FAILED: '本机未能暂存尚未确认的协作更新，系统仍会尝试发送；页面关闭前若未收到服务端确认，内容可能无法恢复，请立即保存正文。',
          LOCAL_OUTBOX_CLEANUP_FAILED: '协作内容已由服务器确认，但本机未能清理确认副本；刷新后可能安全地重复同步，请保持正文已保存。',
        };
        setSyncError(messages[payload.code || ''] || '协作更新尚未确认，当前页面会保留待发送内容；请先保存正文，确认权限或连接后重试。');
      },
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
      setSyncError(null);
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
      syncError,
      recoveryBlocked,
    };
}
