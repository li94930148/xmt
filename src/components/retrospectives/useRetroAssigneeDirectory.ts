import { useCallback, useEffect, useRef, useState } from 'react';
import { getUsers } from '../../api/users';
import type { User } from '../../types';
import { useAuthStore } from '../../store';
import { toFriendlyRetroError } from './retroLabels';
import type { RetroAssigneeDirectoryStatus } from './RetroAssigneeDirectoryNotice';

type Props = {
  currentUser: User | null;
  token: string | null;
  canViewUsers: boolean;
  permissionsLoading: boolean;
  refreshPermissions: () => void;
};

type DirectoryState = {
  userId: number | null;
  status: RetroAssigneeDirectoryStatus;
  users: User[];
  error: string | null;
};

export function useRetroAssigneeDirectory({
  currentUser,
  token,
  canViewUsers,
  permissionsLoading,
  refreshPermissions,
}: Props) {
  const currentUserId = currentUser?.id ?? null;
  const requestSequenceRef = useRef(0);
  const [directory, setDirectory] = useState<DirectoryState>({
    userId: null,
    status: 'loading',
    users: [],
    error: null,
  });

  const loadUsers = useCallback(async () => {
    const requestId = ++requestSequenceRef.current;
    const selfOption = currentUser ? [currentUser] : [];
    const isCurrent = () => {
      const auth = useAuthStore.getState();
      return requestId === requestSequenceRef.current
        && auth.user?.id === currentUserId
        && auth.token === token;
    };

    if (!currentUserId) {
      setDirectory({ userId: null, status: 'ready', users: [], error: null });
      return;
    }

    if (permissionsLoading) {
      setDirectory({ userId: currentUserId, status: 'loading', users: selfOption, error: null });
      return;
    }

    if (!canViewUsers) {
      setDirectory({ userId: currentUserId, status: 'restricted', users: selfOption, error: null });
      return;
    }

    setDirectory({ userId: currentUserId, status: 'loading', users: selfOption, error: null });
    try {
      const result = await getUsers({ page: 1, limit: 200 });
      if (!isCurrent()) return;
      setDirectory({ userId: currentUserId, status: 'ready', users: result.data || [], error: null });
    } catch (error) {
      if (!isCurrent()) return;
      setDirectory({
        userId: currentUserId,
        status: 'error',
        users: selfOption,
        error: toFriendlyRetroError(error),
      });
    }
  }, [canViewUsers, currentUser, currentUserId, permissionsLoading, token]);

  useEffect(() => {
    void loadUsers();
    return () => { requestSequenceRef.current += 1; };
  }, [loadUsers]);

  const retry = useCallback(() => {
    if (directory.userId === currentUserId && directory.status === 'restricted') {
      refreshPermissions();
    }
    void loadUsers();
  }, [currentUserId, directory.status, directory.userId, loadUsers, refreshPermissions]);

  const currentDirectory = directory.userId === currentUserId
    ? directory
    : { userId: currentUserId, status: 'loading' as const, users: currentUser ? [currentUser] : [], error: null };

  return { ...currentDirectory, retry };
}
