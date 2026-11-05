import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createUser,
  deleteUser,
  getAssignableRoles,
  getLogs,
  getUser,
  getUserCreateRequestStatus,
  getUserDeleteRequestStatus,
  getUserUpdateRequestStatus,
  getUsers,
  updateUser,
} from '../api';
import { usePermission } from './usePermission';
import { useThemeStyles } from './useThemeStyles';
import { getRoleDisplayName } from '../lib/roles';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import { useAppStore, useAuthStore } from '../store';
import type { ActivityLog, User } from '../types';
import { buildDefaultForm, USER_PAGE_SIZE, type RoleOption, type UserFormData } from '../pages/users/userTypes';
import {
  USER_DELETE_RECOVERY_VERSION,
  USER_TOGGLE_RECOVERY_VERSION,
  clearUserCreateRecovery,
  clearUserDeleteRecovery,
  clearUserEditRecovery,
  clearUserToggleRecovery,
  persistUserCreateRecovery,
  persistUserDeleteRecovery,
  persistUserEditRecovery,
  persistUserToggleRecovery,
  readUserCreateRecovery,
  readUserDeleteRecovery,
  readUserEditRecovery,
  readUserToggleRecovery,
  recoveredUserFromDelete,
  recoveredUserFromEdit,
  snapshotUserDeleteRecoveryStorageKeys,
  snapshotUserEditRecoveryStorageKeys,
  snapshotUserToggleRecoveryStorageKeys,
  userCreateRecoveryStorageKey,
  userDeleteRecoveryStorageKey,
  userEditRecoveryStorageKey,
  userToggleRecoveryStorageKey,
} from '../pages/users/userRecovery';
import type {
  StoredUserDeleteRecovery,
  StoredUserEditRecovery,
  StoredUserToggleRecovery,
  PendingUserDeleteRequest,
  PendingUserEditRequest,
  PendingUserToggleRequest,
  UserDeleteResolution,
  UserCreateRecoveryCheck,
  UserEditRecoveryCheck,
  UserToggleRecoveryCheck,
} from '../pages/users/userRecovery';
const roleColors: Record<string, string> = {
  admin: 'bg-studio-coral-soft text-studio-coral-contrast border-studio-border-soft',
  director: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
  editor: 'bg-studio-violet-soft text-studio-violet-contrast border-studio-border-soft',
  copywriter: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
  post_production: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
  camera: 'bg-studio-cyan-soft text-studio-cyan-contrast border-studio-border-soft',
  member: 'bg-studio-surface-soft text-studio-text-secondary border-studio-border-soft',
};


export function useUsersPage() {
  const [searchParams] = useSearchParams();
  const requestedSearch = searchParams.get('search') || '';
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const [initialCreateRecovery] = useState(() => currentUserId ? readUserCreateRecovery(currentUserId) : null);
  const [initialUserEditRecovery] = useState(() => currentUserId && !initialCreateRecovery ? readUserEditRecovery(currentUserId) : null);
  const [initialUserDeleteRecovery] = useState(() => currentUserId && !initialCreateRecovery && !initialUserEditRecovery ? readUserDeleteRecovery(currentUserId) : null);
  const [initialUserToggleRecovery] = useState(() => currentUserId && !initialCreateRecovery && !initialUserEditRecovery && !initialUserDeleteRecovery
    ? readUserToggleRecovery(currentUserId)
    : null);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [searchTerm, setSearchTerm] = useState(requestedSearch);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(requestedSearch);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  const [loading, setLoading] = useState(true);
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null);
  const [logsLoadError, setLogsLoadError] = useState<string | null>(null);
  const [logsRefreshing, setLogsRefreshing] = useState(false);
  const [usersMutationNotice, setUsersMutationNotice] = useState<string | null>(null);
  const [usersRefreshing, setUsersRefreshing] = useState(false);
  const [usersRefreshSignal, setUsersRefreshSignal] = useState(0);
  const [userMutationPending, setUserMutationPending] = useState(false);
  const [pendingUserToggleRequest, setPendingUserToggleRequest] = useState<PendingUserToggleRequest | null>(
    () => initialUserToggleRecovery ? { ...initialUserToggleRecovery, recoveryCheck: 'checking' } : null,
  );
  const [pendingUserCreateRequest, setPendingUserCreateRequest] = useState<{
    requestId: string;
    requiresPasswordReentry?: boolean;
    recoveryCheck?: UserCreateRecoveryCheck;
  } | null>(
    () => initialCreateRecovery
      ? { requestId: initialCreateRecovery.requestId, requiresPasswordReentry: true, recoveryCheck: 'checking' }
      : null,
  );
  const [pendingUserEditRequest, setPendingUserEditRequest] = useState<PendingUserEditRequest | null>(
    () => initialUserEditRecovery
      ? { ...initialUserEditRecovery, requiresPasswordReentry: initialUserEditRecovery.hasPassword, recoveryCheck: 'checking' }
      : null,
  );
  const [pendingUserDeleteRequest, setPendingUserDeleteRequest] = useState<PendingUserDeleteRequest | null>(
    () => initialUserDeleteRecovery ? { ...initialUserDeleteRecovery, recoveryCheck: 'checking' } : null,
  );
  const [createPermissionBlockedFor, setCreatePermissionBlockedFor] = useState<number | null>(null);
  const userMutationLockRef = useRef(false);
  const createRecoveryLookupStartedRef = useRef(new Set<string>());
  const userEditRecoveryLookupStartedRef = useRef(new Set<string>());
  const userEditRecoveryKeysAtMountRef = useRef<Set<string> | null>(null);
  if (userEditRecoveryKeysAtMountRef.current === null) {
    userEditRecoveryKeysAtMountRef.current = snapshotUserEditRecoveryStorageKeys();
  }
  const userEditRecoveryActorRef = useRef(currentUserId);
  const userDeleteRecoveryLookupStartedRef = useRef(new Set<string>());
  const userDeleteRecoveryKeysAtMountRef = useRef<Set<string> | null>(null);
  if (userDeleteRecoveryKeysAtMountRef.current === null) {
    userDeleteRecoveryKeysAtMountRef.current = snapshotUserDeleteRecoveryStorageKeys();
  }
  const userToggleRecoveryLookupStartedRef = useRef(new Set<string>());
  const userToggleRecoveryKeysAtMountRef = useRef<Set<string> | null>(null);
  if (userToggleRecoveryKeysAtMountRef.current === null) {
    userToggleRecoveryKeysAtMountRef.current = snapshotUserToggleRecoveryStorageKeys();
  }
  const usersRef = useRef<User[]>(users);
  const [showCreateModal, setShowCreateModal] = useState(Boolean(initialCreateRecovery));
  const [showEditModal, setShowEditModal] = useState(Boolean(initialUserEditRecovery));
  const [editingUser, setEditingUser] = useState<User | null>(initialUserEditRecovery ? recoveredUserFromEdit(initialUserEditRecovery) : null);
  const [formData, setFormData] = useState<UserFormData>(() => {
    if (initialCreateRecovery) {
      return {
        ...buildDefaultForm(initialCreateRecovery.role),
        username: initialCreateRecovery.username,
        email: initialCreateRecovery.email,
        name: initialCreateRecovery.name,
      };
    }
    if (initialUserEditRecovery) {
      return {
        username: initialUserEditRecovery.username,
        password: '',
        email: initialUserEditRecovery.email,
        role: initialUserEditRecovery.role,
        name: initialUserEditRecovery.name,
        enabled: initialUserEditRecovery.enabled,
      };
    }
    return buildDefaultForm();
  });
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);

  const addNotification = useAppStore((state) => state.addNotification);
  const styles = useThemeStyles();
  const { hasPermission, loading: permissionsLoading } = usePermission();

  useEffect(() => {
    setSearchTerm(requestedSearch);
    setDebouncedSearchTerm(requestedSearch);
    setUsersPage(1);
  }, [requestedSearch]);

  const canViewUsers = hasPermission('user:view');
  const canCreateUser = hasPermission('user:create');
  const canResolveUserCreate = canCreateUser && createPermissionBlockedFor !== currentUserId;
  const canUpdateUser = hasPermission('user:update');
  const canDeleteUser = hasPermission('user:delete');
  const canViewLogs = hasPermission('user:logs');
  const canManageRoles = hasPermission('system:role');
  const canLoadAssignableRoles = canCreateUser || canUpdateUser;
  const activePendingUserEditRequest = pendingUserEditRequest?.actorId === currentUserId ? pendingUserEditRequest : null;
  const activePendingUserDeleteRequest = pendingUserDeleteRequest?.actorId === currentUserId ? pendingUserDeleteRequest : null;
  const activePendingUserToggleRequest = pendingUserToggleRequest?.actorId === currentUserId ? pendingUserToggleRequest : null;
  const pendingEditCanSubmit = Boolean(activePendingUserEditRequest && canUpdateUser && (
    !activePendingUserEditRequest.recoveryCheck
    || (activePendingUserEditRequest.recoveryCheck === 'not_found'
      && (!activePendingUserEditRequest.hasPassword || Boolean(formData.password)))
  ));
  const userMutationResolutionPending = Boolean(activePendingUserToggleRequest || pendingUserCreateRequest || activePendingUserEditRequest || activePendingUserDeleteRequest);
  const usersSearchTerm = activeTab === 'users' ? debouncedSearchTerm : '';
  const usersReadGenerationRef = useRef(0);
  const usersQueryKey = JSON.stringify([activeTab, usersPage, usersSearchTerm]);
  const currentUsersQueryKeyRef = useRef(usersQueryKey);
  const currentUsersQueryRef = useRef({ key: usersQueryKey, activeTab, page: usersPage, searchTerm: usersSearchTerm });

  useLayoutEffect(() => {
    currentUsersQueryKeyRef.current = usersQueryKey;
    currentUsersQueryRef.current = { key: usersQueryKey, activeTab, page: usersPage, searchTerm: usersSearchTerm };
  }, [activeTab, usersPage, usersQueryKey, usersSearchTerm]);

  useLayoutEffect(() => {
    usersRef.current = users;
  }, [users]);

  const defaultRoleCode = useMemo(() => {
    if (roles.some((role) => role.code === 'member')) return 'member';
    return roles[0]?.code || 'member';
  }, [roles]);

  const roleNameMap = useMemo(
    () => roles.reduce<Record<string, string>>((acc, role) => {
      acc[role.code] = role.name;
      return acc;
    }, {}),
    [roles],
  );

  const getRoleBadgeClass = (roleCode: string) => roleColors[roleCode] || 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary';
  const getRoleLabel = (roleCode: string) => roleNameMap[roleCode] || getRoleDisplayName(roleCode);

  const ensureAssignableRoles = async () => {
    if (!canLoadAssignableRoles) return roles;
    if (roles.length > 0) return roles;

    try {
      const roleList = await getAssignableRoles();
      setRoles(roleList);
      setFormData((current) => ({
        ...current,
        role: current.role || (roleList.some((role) => role.code === 'member') ? 'member' : roleList[0]?.code || ''),
      }));
      return roleList;
    } catch (error) {
      addNotification({ title: '获取角色失败', message: getUserFacingErrorMessage(error, '可分配角色列表暂时无法读取，请稍后重试。'), type: 'error' });
      return [];
    }
  };

  useEffect(() => {
    const nextSearch = searchTerm.trim();
    const timeout = window.setTimeout(() => {
      if (nextSearch !== debouncedSearchTerm) {
        setDebouncedSearchTerm(nextSearch);
        setUsersPage(1);
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [debouncedSearchTerm, searchTerm]);

  useEffect(() => {
    if (activeTab === 'logs' && !canViewLogs) {
      setActiveTab('users');
    }
  }, [activeTab, canViewLogs]);

  useEffect(() => {
    let active = true;
    const requestGeneration = ++usersReadGenerationRef.current;
    const requestQueryKey = usersQueryKey;
    const isCurrentRequest = () => (
      active &&
      requestGeneration === usersReadGenerationRef.current &&
      requestQueryKey === currentUsersQueryKeyRef.current
    );

    async function fetchCurrentTabData() {
      if (!isCurrentRequest()) return;
      setLoading(true);
      setUsersRefreshing(false);
      if (activeTab === 'users') setUsersLoadError(null);
      if (activeTab === 'logs') setLogsLoadError(null);
      try {
        if (activeTab === 'users') {
          if (!canViewUsers) {
            if (!isCurrentRequest()) return;
            setUsers([]);
            setUsersTotal(0);
            return;
          }
          const result = await getUsers({
            page: usersPage,
            limit: USER_PAGE_SIZE,
            ...(usersSearchTerm ? { search: usersSearchTerm } : {}),
          });
          if (!isCurrentRequest()) return;
          setUsers(result.data);
          setUsersTotal(result.total);
          setUsersLoadError(null);
          setUsersMutationNotice(null);
          return;
        }

        if (!canViewLogs) {
          if (!isCurrentRequest()) return;
          setLogs([]);
          return;
        }

        const result = await getLogs();
        if (!isCurrentRequest()) return;
        setLogs(result.data);
        setLogsLoadError(null);
      } catch (error) {
        if (!isCurrentRequest()) return;
        const message = getUserFacingErrorMessage(
          error,
          activeTab === 'users' ? '用户列表暂时无法读取，请检查网络后重试。' : '操作日志暂时无法读取，请检查网络后重试。',
        );
        if (activeTab === 'users') setUsersLoadError(message);
        else setLogsLoadError(message);
        addNotification({ title: '获取数据失败', message, type: 'error' });
      } finally {
        if (isCurrentRequest()) setLoading(false);
      }
    }

    void fetchCurrentTabData();
    return () => { active = false; };
  }, [activeTab, addNotification, canViewLogs, canViewUsers, usersPage, usersSearchTerm, usersQueryKey, usersRefreshSignal]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(usersTotal / USER_PAGE_SIZE));
    if (activeTab === 'users' && !loading && usersPage > totalPages) setUsersPage(totalPages);
  }, [activeTab, loading, usersPage, usersTotal]);

  const filteredUsers = users;

  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(term) ||
      (log.user_name || '').toLowerCase().includes(term) ||
      log.target.toLowerCase().includes(term)
    );
  });

  const openCreateModal = async () => {
    if (!canResolveUserCreate || userMutationResolutionPending) return;
    const roleList = await ensureAssignableRoles();
    const nextRole = roleList.some((role) => role.code === 'member') ? 'member' : roleList[0]?.code || defaultRoleCode;
    setFormData(buildDefaultForm(nextRole));
    setShowCreateModal(true);
  };

  const openEditModal = async (user: User) => {
    if (!canUpdateUser || userMutationResolutionPending) return;
    await ensureAssignableRoles();
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      email: user.email || '',
      role: user.role,
      name: user.name || '',
      enabled: user.enabled,
    });
    setShowEditModal(true);
  };

  const refreshUsers = async (
    query: { key: string; page: number; searchTerm: string } = { key: usersQueryKey, page: usersPage, searchTerm: usersSearchTerm },
  ): Promise<'loaded' | 'failed' | 'stale'> => {
    if (!canViewUsers) return 'loaded';
    const requestQueryKey = query.key;
    if (requestQueryKey !== currentUsersQueryKeyRef.current) return 'stale';
    const requestGeneration = ++usersReadGenerationRef.current;
    const isCurrentRequest = () => (
      requestGeneration === usersReadGenerationRef.current &&
      requestQueryKey === currentUsersQueryKeyRef.current
    );
    setUsersRefreshing(true);
    try {
      const result = await getUsers({
        page: query.page,
        limit: USER_PAGE_SIZE,
        ...(query.searchTerm ? { search: query.searchTerm } : {}),
      });
      if (!isCurrentRequest()) return 'stale';
      setUsers(result.data);
      setUsersTotal(result.total);
      setUsersLoadError(null);
      setUsersMutationNotice(null);
      return 'loaded';
    } catch (error) {
      if (!isCurrentRequest()) return 'stale';
      setUsersLoadError(getUserFacingErrorMessage(error, '用户列表暂时无法读取，请检查网络后重试。'));
      return 'failed';
    } finally {
      if (isCurrentRequest()) setUsersRefreshing(false);
    }
  };

  const refreshAfterConfirmedUserMutation = async (
    action: string,
    query?: { key: string; page: number; searchTerm: string },
  ) => {
    const outcome = await refreshUsers(query);
    if (outcome === 'failed') {
      setUsersMutationNotice(`服务端已确认${action}，但用户列表刷新失败；请重新加载列表确认，不要重复操作。`);
    }
    return outcome;
  };

  const completeUserDelete = async (recovery: StoredUserDeleteRecovery, wasReplay = false) => {
    if (useAuthStore.getState().user?.id !== recovery.actorId) return;
    clearUserDeleteRecovery(recovery.actorId);
    setPendingUserDeleteRequest(null);
    setPendingDeleteUser(null);
    setUsersMutationNotice(null);
    const wasVisibleInCurrentList = usersRef.current.some((user) => user.id === recovery.targetUserId);
    setUsers((current) => current.filter((user) => user.id !== recovery.targetUserId));
    if (wasVisibleInCurrentList) setUsersTotal((current) => Math.max(0, current - 1));
    addNotification({
      title: wasReplay ? '删除已核实' : '删除成功',
      message: `用户 ${recovery.username} 已删除`,
      type: 'success',
    });
    const currentQuery = currentUsersQueryRef.current;
    if (currentQuery.activeTab === 'users') await refreshAfterConfirmedUserMutation('用户删除', currentQuery);
  };

  const resolveUserDeleteTargetAbsence = async (recovery: StoredUserDeleteRecovery): Promise<UserDeleteResolution> => {
    if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
    try {
      const target = await getUser(recovery.targetUserId);
      if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
      if (target) {
        setPendingUserDeleteRequest({ ...recovery, recoveryCheck: 'unavailable' });
        setPendingDeleteUser(null);
        setUsersMutationNotice(`删除请求返回“用户不存在”，但只读核实仍能读取用户 ${recovery.username}；本次删除结果未确认，所有人员修改已暂停，请只读重新核实。`);
        return 'target_present';
      }

      clearUserDeleteRecovery(recovery.actorId);
      setPendingUserDeleteRequest(null);
      setPendingDeleteUser(null);
      const wasVisibleInCurrentList = usersRef.current.some((user) => user.id === recovery.targetUserId);
      setUsers((current) => current.filter((user) => user.id !== recovery.targetUserId));
      if (wasVisibleInCurrentList) setUsersTotal((current) => Math.max(0, current - 1));

      const currentQuery = currentUsersQueryRef.current;
      const refreshOutcome = currentQuery.activeTab === 'users' ? await refreshUsers(currentQuery) : 'loaded';
      const message = refreshOutcome === 'failed'
        ? `用户 ${recovery.username} 已被其他操作移除；本次删除请求未确认删除。列表刷新失败，请重新加载列表。`
        : `用户 ${recovery.username} 已被其他操作移除；本次删除请求未确认删除。`;
      setUsersMutationNotice(message);
      return 'already_absent';
    } catch {
      if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
      setPendingUserDeleteRequest({ ...recovery, recoveryCheck: 'unavailable' });
      setPendingDeleteUser(null);
      setUsersMutationNotice(`删除请求返回“用户不存在”，但无法读取用户 ${recovery.username} 的当前状态；本次删除结果未确认，所有人员修改已暂停，请只读重新核实。`);
      return 'unavailable';
    }
  };

  const resolveUserDeleteRecovery = async (recovery: StoredUserDeleteRecovery): Promise<UserDeleteResolution> => {
    if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
    try {
      const status = await getUserDeleteRequestStatus(recovery.requestId, recovery.targetUserId);
      if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
      if (status.state === 'deleted') {
        await completeUserDelete(recovery, true);
        return 'deleted';
      }
      if (recovery.requireTargetAbsenceCheck) {
        return await resolveUserDeleteTargetAbsence(recovery);
      }
      setPendingUserDeleteRequest({ ...recovery, recoveryCheck: 'not_found' });
      setPendingDeleteUser(null);
      setUsersMutationNotice('暂未找到这次删除的完成记录；所有人员修改已暂停，可用同一请求编号安全重试。');
      return 'not_found';
    } catch {
      if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
      setPendingUserDeleteRequest({ ...recovery, recoveryCheck: 'unavailable' });
      setPendingDeleteUser(null);
      setUsersMutationNotice('暂时无法核实上次删除结果；所有人员修改已暂停，请先只读重新核实。');
      return 'unavailable';
    }
  };

  const verifyUserDeleteRecovery = async (recovery: StoredUserDeleteRecovery) => {
    if (useAuthStore.getState().user?.id !== recovery.actorId || userMutationLockRef.current) return;
    userMutationLockRef.current = true;
    setUserMutationPending(true);
    setPendingUserDeleteRequest({ ...recovery, recoveryCheck: 'checking' });
    setUsersMutationNotice('正在只读核实上次删除结果；核实期间其他人员修改已暂停。');
    try {
      const result = await resolveUserDeleteRecovery(recovery);
      if (result === 'not_found') {
        addNotification({ title: '删除仍待处理', message: '服务器暂未找到删除完成记录；如需继续，可安全重试同一请求。', type: 'warning' });
      } else if (result === 'already_absent') {
        addNotification({ title: '目标用户已移除', message: '目标用户已被其他操作移除；本次删除请求未确认删除。', type: 'info' });
      } else if (result === 'target_present') {
        addNotification({ title: '删除结果待确认', message: '只读读取仍能找到目标用户；所有人员修改已暂停，请重新核实。', type: 'warning' });
      } else if (result === 'unavailable') {
        addNotification({ title: '暂时无法核实删除', message: '原请求已保留；请稍后只读重新核实，不要重复删除。', type: 'warning' });
      }
    } finally {
      userMutationLockRef.current = false;
      setUserMutationPending(false);
    }
  };

  const resolveUserToggleRecovery = async (recovery: StoredUserToggleRecovery): Promise<UserToggleRecoveryCheck | 'updated'> => {
    if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
    try {
      const status = await getUserUpdateRequestStatus(recovery.requestId, recovery.targetUserId);
      if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
      if (status.state === 'updated') {
        clearUserToggleRecovery(recovery.actorId);
        setPendingUserToggleRequest(null);
        setUsers((current) => current.map((item) => (item.id === recovery.targetUserId
          ? { ...item, enabled: recovery.desiredEnabled }
          : item)));
        setUsersMutationNotice(null);
        addNotification({
          title: '操作结果已核实',
          message: recovery.desiredEnabled ? `用户 ${recovery.username} 已启用。` : `用户 ${recovery.username} 已禁用。`,
          type: 'success',
        });
        await refreshAfterConfirmedUserMutation('用户启用状态更新');
        return 'updated';
      }

      setPendingUserToggleRequest({ ...recovery, recoveryCheck: 'not_found' });
      setUsersMutationNotice(canUpdateUser
        ? `服务器暂未找到用户 ${recovery.username} 的启停请求记录；所有人员修改已暂停，可用同一请求编号安全重试。`
        : `服务器暂未找到用户 ${recovery.username} 的启停请求记录；当前账号没有用户编辑权限，所有人员修改继续暂停，请只读重新核实。`);
      return 'not_found';
    } catch {
      if (useAuthStore.getState().user?.id !== recovery.actorId) return 'unavailable';
      setPendingUserToggleRequest({ ...recovery, recoveryCheck: 'unavailable' });
      setUsersMutationNotice(`暂时无法核实用户 ${recovery.username} 的启停结果；原请求已保留，所有人员修改继续暂停，请只读重新核实。`);
      return 'unavailable';
    }
  };

  const verifyUserToggleRecovery = async (recovery: StoredUserToggleRecovery) => {
    if (permissionsLoading || useAuthStore.getState().user?.id !== recovery.actorId || userMutationLockRef.current) return;
    userMutationLockRef.current = true;
    setUserMutationPending(true);
    setPendingUserToggleRequest({ ...recovery, recoveryCheck: 'checking' });
    setUsersMutationNotice('正在只读核实上次用户启停结果；核实期间其他人员修改已暂停。');
    try {
      const result = await resolveUserToggleRecovery(recovery);
      if (result === 'not_found') {
        addNotification({ title: '启停结果待确认', message: canUpdateUser
          ? '服务器暂未找到上次启停记录；可用同一请求编号安全重试。'
          : '服务器暂未找到上次启停记录；当前账号无权重试，原请求仍被锁定。', type: 'warning' });
      } else if (result === 'unavailable') {
        addNotification({ title: '暂时无法核实启停', message: '原请求已保留；请稍后只读重新核实，不要重复发起操作。', type: 'warning' });
      }
    } finally {
      userMutationLockRef.current = false;
      setUserMutationPending(false);
    }
  };

  const refreshLogs = async (): Promise<boolean> => {
    if (!canViewLogs) return false;
    setLogsRefreshing(true);
    try {
      const result = await getLogs();
      setLogs(result.data);
      setLogsLoadError(null);
      return true;
    } catch (error) {
      setLogsLoadError(getUserFacingErrorMessage(error, '操作日志暂时无法读取，请检查网络后重试。'));
      return false;
    } finally {
      setLogsRefreshing(false);
    }
  };

  const verifyUserEditRecovery = useCallback(async (recovery: StoredUserEditRecovery) => {
    if (permissionsLoading || useAuthStore.getState().user?.id !== recovery.actorId) return;
    const pending: PendingUserEditRequest = {
      ...recovery,
      requiresPasswordReentry: recovery.hasPassword,
      recoveryCheck: 'checking',
    };
    setPendingUserEditRequest(pending);
    setEditingUser(recoveredUserFromEdit(recovery));
    setFormData({
      username: recovery.username,
      password: '',
      email: recovery.email,
      role: recovery.role,
      name: recovery.name,
      enabled: recovery.enabled,
    });
    setShowEditModal(true);

    try {
      const status = await getUserUpdateRequestStatus(recovery.requestId, recovery.targetUserId);
      if (useAuthStore.getState().user?.id !== recovery.actorId) return;
      if (status.state === 'updated') {
        clearUserEditRecovery(recovery.actorId);
        setPendingUserEditRequest(null);
        setUsersMutationNotice(null);
        setShowEditModal(false);
        setEditingUser(null);
        setFormData(buildDefaultForm());
        setUsersRefreshSignal((current) => current + 1);
        addNotification({
          title: '更新已核实',
          message: `刷新前对用户 ${recovery.username} 的更新已完成，无需再次提交。`,
          type: 'success',
        });
        return;
      }

      if (!canUpdateUser) {
        clearUserEditRecovery(recovery.actorId);
        setPendingUserEditRequest(null);
        setShowEditModal(false);
        setEditingUser(null);
        setFormData(buildDefaultForm());
        addNotification({ title: '更新未完成', message: '服务器未找到上次更新记录；当前账号没有继续编辑用户的权限。', type: 'warning' });
        return;
      }

      setPendingUserEditRequest({ ...recovery, requiresPasswordReentry: recovery.hasPassword, recoveryCheck: 'not_found' });
    } catch {
      if (useAuthStore.getState().user?.id !== recovery.actorId) return;
      setPendingUserEditRequest({ ...recovery, requiresPasswordReentry: recovery.hasPassword, recoveryCheck: 'unavailable' });
    }
  }, [addNotification, canUpdateUser, permissionsLoading]);

  const verifyUserEditRecoveryRef = useRef(verifyUserEditRecovery);

  useEffect(() => {
    verifyUserEditRecoveryRef.current = verifyUserEditRecovery;
  }, [verifyUserEditRecovery]);

  useEffect(() => {
    if (userEditRecoveryActorRef.current !== currentUserId) {
      userEditRecoveryActorRef.current = currentUserId;
      setPendingUserToggleRequest(null);
      setPendingUserEditRequest(null);
      setPendingUserDeleteRequest(null);
      setPendingDeleteUser(null);
      setShowEditModal(false);
      setEditingUser(null);
      setFormData(buildDefaultForm());
    }
    if (!currentUserId || permissionsLoading) {
      return;
    }

    const recovery = readUserEditRecovery(currentUserId);
    if (!recovery) return;

    const storageKey = userEditRecoveryStorageKey(currentUserId);
    // Only auto-resolve markers that existed when this route mounted. A new
    // ambiguous write on the same page must remain locked for an explicit retry
    // or a later reload; otherwise a store hydration/render race can consume a
    // status read before the user has had a chance to reload.
    if (!userEditRecoveryKeysAtMountRef.current?.has(storageKey)) return;
    if (userEditRecoveryLookupStartedRef.current.has(storageKey)) return;
    userEditRecoveryLookupStartedRef.current.add(storageKey);
    void verifyUserEditRecoveryRef.current(recovery);
  }, [currentUserId, permissionsLoading]);

  const verifyUserDeleteRecoveryRef = useRef(verifyUserDeleteRecovery);
  verifyUserDeleteRecoveryRef.current = verifyUserDeleteRecovery;

  const verifyUserToggleRecoveryRef = useRef(verifyUserToggleRecovery);
  verifyUserToggleRecoveryRef.current = verifyUserToggleRecovery;

  useEffect(() => {
    if (!currentUserId) return;
    const recovery = readUserDeleteRecovery(currentUserId);
    if (!recovery) return;

    const storageKey = userDeleteRecoveryStorageKey(currentUserId);
    if (!userDeleteRecoveryKeysAtMountRef.current?.has(storageKey)) return;
    if (userDeleteRecoveryLookupStartedRef.current.has(storageKey)) return;
    userDeleteRecoveryLookupStartedRef.current.add(storageKey);
    void verifyUserDeleteRecoveryRef.current(recovery);
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || permissionsLoading || pendingUserCreateRequest || activePendingUserEditRequest || activePendingUserDeleteRequest) return;
    const recovery = readUserToggleRecovery(currentUserId);
    if (!recovery) return;

    const storageKey = userToggleRecoveryStorageKey(currentUserId);
    if (!userToggleRecoveryKeysAtMountRef.current?.has(storageKey)) return;
    if (userToggleRecoveryLookupStartedRef.current.has(storageKey)) return;
    userToggleRecoveryLookupStartedRef.current.add(storageKey);
    void verifyUserToggleRecoveryRef.current(recovery);
  }, [activePendingUserDeleteRequest, activePendingUserEditRequest, currentUserId, pendingUserCreateRequest, permissionsLoading]);

  useEffect(() => {
    if (!currentUserId) return;
    const recovery = readUserCreateRecovery(currentUserId);
    if (!recovery) return;

    const storageKey = userCreateRecoveryStorageKey(currentUserId);
    const shouldVerifyRecovery = !createRecoveryLookupStartedRef.current.has(storageKey);
    if (shouldVerifyRecovery) createRecoveryLookupStartedRef.current.add(storageKey);
    setPendingUserCreateRequest((current) => current?.requestId === recovery.requestId
      ? shouldVerifyRecovery
        ? { ...current, requiresPasswordReentry: true, recoveryCheck: 'checking' }
        : current
      : { requestId: recovery.requestId, requiresPasswordReentry: true, recoveryCheck: 'checking' });
    setFormData((current) => current.username === recovery.username
      && current.email === recovery.email && current.name === recovery.name && current.role === recovery.role
      ? { ...current, password: '' }
      : {
        ...buildDefaultForm(recovery.role),
        username: recovery.username,
        email: recovery.email,
        name: recovery.name,
      });
    setShowCreateModal(true);

    if (!shouldVerifyRecovery) return;
    const recoveryUserId = currentUserId;
    void getUserCreateRequestStatus(recovery.requestId).then((status) => {
      if (useAuthStore.getState().user?.id !== recoveryUserId) return;
      if (status.state !== 'created') {
        setPendingUserCreateRequest((current) => current?.requestId === recovery.requestId
          ? { ...current, requiresPasswordReentry: true, recoveryCheck: 'not_found' }
          : current);
        return;
      }
      clearUserCreateRecovery(recoveryUserId);
      setPendingUserCreateRequest(null);
      setShowCreateModal(false);
      setFormData(buildDefaultForm());
      setUsersMutationNotice(null);
      setUsersRefreshSignal((current) => current + 1);
      useAppStore.getState().addNotification({
        title: '创建已核实',
        message: '刷新前提交的用户已创建，无需再次提交。',
        type: 'success',
      });
    }).catch(() => {
      setPendingUserCreateRequest((current) => current?.requestId === recovery.requestId
        ? { ...current, requiresPasswordReentry: true, recoveryCheck: 'unavailable' }
        : current);
    });
  }, [currentUserId]);

  const handleCreate = async () => {
    if (!canResolveUserCreate || activePendingUserToggleRequest || activePendingUserEditRequest || userMutationLockRef.current) return;
    if (!formData.username || !formData.password) {
      addNotification({ title: '创建失败', message: '用户名和密码不能为空', type: 'error' });
      return;
    }
    if (!formData.role) {
      addNotification({ title: '创建失败', message: '请选择角色', type: 'error' });
      return;
    }

    const requestId = pendingUserCreateRequest?.requestId ?? crypto.randomUUID();
    if (!currentUserId) {
      addNotification({ title: '无法安全创建', message: '当前登录状态尚未确认，请刷新后重试。', type: 'error' });
      return;
    }
    try {
      persistUserCreateRecovery(currentUserId, requestId, formData);
    } catch {
      addNotification({ title: '无法安全创建', message: '浏览器暂时无法保存本次请求编号，尚未提交创建操作。', type: 'error' });
      return;
    }

    userMutationLockRef.current = true;
    setUserMutationPending(true);
    try {
      const result = await createUser({ ...formData, client_request_id: requestId });
      clearUserCreateRecovery(currentUserId);
      setPendingUserCreateRequest(null);
      setUsersMutationNotice(null);
      addNotification({
        title: result.idempotent_replay ? '创建已核实' : '创建成功',
        message: '用户已创建',
        type: 'success',
      });
      setShowCreateModal(false);
      setFormData(buildDefaultForm(defaultRoleCode));
      await refreshAfterConfirmedUserMutation('用户创建');
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status);
      if (status === 409 || status === 401 || status === 403) {
        const permissionFailure = status === 401 || status === 403;
        if (permissionFailure) setCreatePermissionBlockedFor(currentUserId);
        let recoveryCheck: UserCreateRecoveryCheck = 'unavailable';
        try {
          const result = await getUserCreateRequestStatus(requestId);
          if (result.state === 'created') {
            clearUserCreateRecovery(currentUserId);
            setPendingUserCreateRequest(null);
            setUsersMutationNotice(null);
            setShowCreateModal(false);
            setFormData(buildDefaultForm(defaultRoleCode));
            addNotification({ title: '创建已核实', message: '用户已创建；请求冲突未产生重复账号。', type: 'success' });
            await refreshAfterConfirmedUserMutation('用户创建');
            return;
          }
          recoveryCheck = 'not_found';
        } catch {
          // Retain the same request key when the read-only confirmation is unavailable.
        }
        setPendingUserCreateRequest({ requestId, requiresPasswordReentry: true, recoveryCheck });
        setFormData((current) => ({ ...current, password: '' }));
        addNotification(permissionFailure
          ? {
            title: '创建权限待恢复',
            message: '本次写入未获准；原请求标记已保留并完成只读核实。当前不会继续写入，请恢复权限后刷新本页再处理。',
            type: 'warning',
          }
          : {
            title: '创建仍待核实',
            message: '该请求编号与本次内容不一致。请重新输入上次创建时使用的密码，再安全重试同一请求。',
            type: 'warning',
          });
      } else if (status >= 400 && status < 500) {
        clearUserCreateRecovery(currentUserId);
        setPendingUserCreateRequest(null);
        addNotification({ title: '创建未完成', message: getUserFacingErrorMessage(error, '用户创建失败，请检查权限和填写内容后重试。'), type: 'error' });
      } else {
        setPendingUserCreateRequest({ requestId });
        setUsersMutationNotice('用户创建结果尚未确认；创建表单已锁定，请在窗口中安全重试，其他人员修改暂不可用。');
        addNotification({ title: '创建结果待确认', message: '再次保存会重用同一请求编号；若服务器已创建，只会返回原结果，不会新增第二个账号。', type: 'warning' });
      }
    } finally {
      userMutationLockRef.current = false;
      setUserMutationPending(false);
    }
  };

  const handleEdit = async () => {
    if (!canUpdateUser || !editingUser || activePendingUserToggleRequest || userMutationLockRef.current) return;
    if (activePendingUserEditRequest && (activePendingUserEditRequest.targetUserId !== editingUser.id
      || activePendingUserEditRequest.actorId !== currentUserId)) return;
    if (!formData.role) {
      addNotification({ title: '更新失败', message: '请选择角色', type: 'error' });
      return;
    }
    if (!currentUserId) {
      addNotification({ title: '无法安全更新', message: '当前登录状态尚未确认，请刷新后重试。', type: 'error' });
      return;
    }

    userMutationLockRef.current = true;
    setUserMutationPending(true);
    const requestId = activePendingUserEditRequest?.targetUserId === editingUser.id
      ? activePendingUserEditRequest.requestId
      : crypto.randomUUID();
    try {
      const updateData: Partial<User> & { password?: string; client_request_id: string } = {
        email: formData.email,
        role: formData.role,
        name: formData.name,
        enabled: formData.enabled,
        client_request_id: requestId,
      };
      if (formData.password) updateData.password = formData.password;

      try {
        userEditRecoveryLookupStartedRef.current.add(userEditRecoveryStorageKey(currentUserId));
        persistUserEditRecovery(currentUserId, editingUser, requestId, formData);
      } catch {
        addNotification({ title: '无法安全更新', message: '浏览器暂时无法保存本次请求编号，尚未提交用户更新。', type: 'error' });
        return;
      }

      const result = await updateUser(editingUser.id, updateData);
      clearUserEditRecovery(currentUserId);
      setPendingUserEditRequest(null);
      setUsersMutationNotice(null);
      addNotification({
        title: result.idempotent_replay ? '更新已核实' : '更新成功',
        message: '用户信息已更新',
        type: 'success',
      });
      setUsers((current) => current.map((user) => user.id === editingUser.id ? {
        ...user,
        email: updateData.email ?? user.email,
        role: updateData.role ?? user.role,
        name: updateData.name ?? user.name,
        enabled: updateData.enabled ?? user.enabled,
      } : user));
      setShowEditModal(false);
      setEditingUser(null);
      await refreshAfterConfirmedUserMutation('用户信息更新');
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status);
      if (status === 409 || status === 401 || status === 403) {
        const recovery = readUserEditRecovery(currentUserId);
        let recoveryCheck: UserEditRecoveryCheck = 'unavailable';
        try {
          const result = await getUserUpdateRequestStatus(requestId, editingUser.id);
          recoveryCheck = result.state === 'updated' ? 'checking' : 'not_found';
          if (result.state === 'updated') {
            clearUserEditRecovery(currentUserId);
            setPendingUserEditRequest(null);
            setUsersMutationNotice(null);
            setShowEditModal(false);
            setEditingUser(null);
            setFormData(buildDefaultForm());
            addNotification({ title: '更新已核实', message: '服务器已确认上次用户更新，无需再次提交。', type: 'success' });
            await refreshAfterConfirmedUserMutation('用户信息更新');
            return;
          }
        } catch {
          // Preserve the request marker unless a read-only status query confirms the write.
        }
        if (recovery) {
          setPendingUserEditRequest({
            ...recovery,
            requiresPasswordReentry: recovery.hasPassword,
            recoveryCheck,
          });
          if (recovery.hasPassword) setFormData((current) => ({ ...current, password: '' }));
          setUsersMutationNotice(`用户 ${recovery.username} 的编辑结果尚未确认；当前只保留原请求并进行只读核实。`);
          addNotification({ title: '更新仍待核实', message: '请求被拒绝或内容不匹配，但不能据此判断之前的请求未生效；恢复记录已保留。', type: 'warning' });
        }
      } else if (status >= 400 && status < 500) {
        clearUserEditRecovery(currentUserId);
        setPendingUserEditRequest(null);
        addNotification({ title: '更新未完成', message: getUserFacingErrorMessage(error, '用户信息更新失败，请检查权限和当前记录后重试。'), type: 'error' });
      } else {
        const recovery = readUserEditRecovery(currentUserId);
        if (recovery) setPendingUserEditRequest(recovery);
        setUsersMutationNotice(`用户 ${editingUser.username} 的编辑结果尚未确认；表单已锁定，请在编辑窗口安全重试，其他修改暂不可用。`);
        addNotification({ title: '更新结果待确认', message: '再次保存会重用同一请求编号；服务器会返回原结果，不会重复变更密码、角色或会话。', type: 'warning' });
      }
    } finally {
      userMutationLockRef.current = false;
      setUserMutationPending(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteUser || (activePendingUserToggleRequest || pendingUserCreateRequest || activePendingUserEditRequest)
      || (activePendingUserDeleteRequest && activePendingUserDeleteRequest.recoveryCheck !== 'not_found')
      || (!pendingDeleteUser && !activePendingUserDeleteRequest) || userMutationLockRef.current) return;
    const retrying = Boolean(activePendingUserDeleteRequest);
    const deletingUser = activePendingUserDeleteRequest
      ? recoveredUserFromDelete(activePendingUserDeleteRequest)
      : pendingDeleteUser;
    if (!deletingUser || !currentUserId) return;
    const recovery: StoredUserDeleteRecovery = activePendingUserDeleteRequest ?? {
      version: USER_DELETE_RECOVERY_VERSION,
      actorId: currentUserId,
      requestId: crypto.randomUUID(),
      targetUserId: deletingUser.id,
      username: deletingUser.username,
    };
    if (!retrying) {
      try {
        persistUserDeleteRecovery(currentUserId, deletingUser, recovery.requestId);
      } catch {
        addNotification({ title: '无法安全删除', message: '浏览器暂时无法保存本次请求编号，尚未提交删除操作。', type: 'error' });
        return;
      }
    }
    userMutationLockRef.current = true;
    setUserMutationPending(true);
    setPendingUserDeleteRequest({ ...recovery, recoveryCheck: 'checking' });
    setUsersMutationNotice('正在提交用户删除；确认结果前，其他人员修改已暂停。');
    try {
      const result = await deleteUser(deletingUser.id, recovery.requestId);
      await completeUserDelete(recovery, Boolean(result.idempotent_replay));
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status);
      const recoveryForResolution = status === 404
        ? { ...recovery, requireTargetAbsenceCheck: true }
        : recovery;
      if (status === 404) {
        try {
          persistUserDeleteRecovery(
            recoveryForResolution.actorId,
            deletingUser,
            recoveryForResolution.requestId,
            true,
          );
        } catch {
          // Keep the existing recovery marker and the in-memory write lock if storage is unavailable.
        }
        setPendingUserDeleteRequest({ ...recoveryForResolution, recoveryCheck: 'checking' });
      }
      const resolution = await resolveUserDeleteRecovery(recoveryForResolution);
      if (Number((error as Error & { status?: number }).status) === 409 && resolution === 'not_found') {
        clearUserDeleteRecovery(recovery.actorId);
        setPendingUserDeleteRequest(null);
        setUsersMutationNotice('删除请求编号发生冲突，服务器没有确认这次删除；请重新检查列表后再发起删除。');
        setUsersRefreshSignal((current) => current + 1);
        addNotification({ title: '删除未完成', message: '请求编号冲突，本次删除没有按该编号执行。', type: 'warning' });
      } else if (resolution === 'not_found') {
        addNotification({ title: '删除仍待处理', message: '服务器暂未找到删除完成记录；可用同一请求编号安全重试。', type: 'warning' });
      } else if (resolution === 'already_absent') {
        addNotification({ title: '目标用户已移除', message: '目标用户已被其他操作移除；本次删除请求未确认删除。', type: 'info' });
      } else if (resolution === 'target_present') {
        addNotification({ title: '删除结果待确认', message: '只读读取仍能找到目标用户；所有人员修改已暂停，请重新核实。', type: 'warning' });
      } else if (resolution === 'unavailable') {
        addNotification({ title: '暂时无法核实删除', message: '原请求已保留；请稍后只读重新核实，不要重复删除。', type: 'warning' });
      }
    } finally {
      userMutationLockRef.current = false;
      setUserMutationPending(false);
    }
  };

  const handleToggleEnable = async (user: User) => {
    const retry = activePendingUserToggleRequest;
    if (!canUpdateUser || userMutationLockRef.current) return;
    if (retry) {
      if (retry.recoveryCheck !== 'not_found' || retry.targetUserId !== user.id || retry.actorId !== currentUserId) return;
    } else if (userMutationResolutionPending) {
      return;
    }

    if (!currentUserId) {
      addNotification({ title: '无法安全操作', message: '当前登录状态尚未确认，请刷新后重试。', type: 'error' });
      return;
    }

    const recovery: StoredUserToggleRecovery = retry
      ? {
        version: USER_TOGGLE_RECOVERY_VERSION,
        actorId: retry.actorId,
        requestId: retry.requestId,
        targetUserId: retry.targetUserId,
        username: retry.username,
        desiredEnabled: retry.desiredEnabled,
      }
      : {
        version: USER_TOGGLE_RECOVERY_VERSION,
        actorId: currentUserId,
        requestId: crypto.randomUUID(),
        targetUserId: user.id,
        username: user.username,
        desiredEnabled: !user.enabled,
      };

    try {
      persistUserToggleRecovery(recovery);
    } catch {
      addNotification({ title: '无法安全操作', message: '浏览器暂时无法保存本次启停请求编号，尚未提交操作。', type: 'error' });
      return;
    }

    userMutationLockRef.current = true;
    setUserMutationPending(true);
    setPendingUserToggleRequest({ ...recovery, recoveryCheck: 'checking' });
    setUsersMutationNotice('正在提交用户启停；确认结果前，其他人员修改已暂停。');
    try {
      await updateUser(recovery.targetUserId, {
        enabled: recovery.desiredEnabled,
        client_request_id: recovery.requestId,
      });
      clearUserToggleRecovery(recovery.actorId);
      setPendingUserToggleRequest(null);
      setUsers((current) => current.map((item) => (item.id === recovery.targetUserId
        ? { ...item, enabled: recovery.desiredEnabled }
        : item)));
      setUsersMutationNotice(null);
      addNotification({
        title: '操作成功',
        message: recovery.desiredEnabled ? `用户 ${recovery.username} 已启用` : `用户 ${recovery.username} 已禁用`,
        type: 'success',
      });
      await refreshAfterConfirmedUserMutation('用户启用状态更新');
    } catch {
      const result = await resolveUserToggleRecovery(recovery);
      if (result === 'not_found') {
        addNotification({ title: '启停结果待确认', message: canUpdateUser
          ? '服务器暂未找到本次启停记录；可用同一请求编号安全重试。'
          : '服务器暂未找到本次启停记录；当前账号无权重试，原请求仍被锁定。', type: 'warning' });
      } else if (result === 'unavailable') {
        addNotification({ title: '启停结果待确认', message: '暂时无法只读核实；原请求已保留，其他人员修改继续暂停。', type: 'warning' });
      }
    } finally {
      userMutationLockRef.current = false;
      setUserMutationPending(false);
    }
  };


  return {
    styles,
    canManageRoles,
    canResolveUserCreate,
    canViewUsers,
    canViewLogs,
    canUpdateUser,
    canDeleteUser,
    permissionsLoading,
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    roles,
    formData,
    setFormData,
    pendingUserCreateRequest,
    activePendingUserEditRequest,
    activePendingUserDeleteRequest,
    activePendingUserToggleRequest,
    pendingEditCanSubmit,
    loading,
    userMutationPending,
    userMutationResolutionPending,
    usersRefreshing,
    usersMutationNotice,
    usersLoadError,
    logsLoadError,
    logsRefreshing,
    filteredUsers,
    filteredLogs,
    usersPage,
    setUsersPage,
    usersTotal,
    USER_PAGE_SIZE,
    getRoleBadgeClass,
    getRoleLabel,
    openCreateModal,
    openEditModal,
    refreshUsers,
    refreshLogs,
    handleCreate,
    handleEdit,
    handleDelete,
    handleToggleEnable,
    verifyUserDeleteRecovery,
    verifyUserToggleRecovery,
    verifyUserEditRecovery,
    showCreateModal,
    setShowCreateModal,
    showEditModal,
    setShowEditModal,
    editingUser,
    setEditingUser,
    pendingDeleteUser,
    setPendingDeleteUser,
    userMutationLockRef,
  };
}
