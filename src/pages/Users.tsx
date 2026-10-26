import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Edit3, History, Lock, Mail, Plus, Search, Shield, Trash2, Unlock, User as UserIcon } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createUser, deleteUser, getAssignableRoles, getLogs, getUser, getUserCreateRequestStatus, getUserDeleteRequestStatus, getUserUpdateRequestStatus, getUsers, updateUser } from '../api';
import EmptyState from '../components/EmptyState';
import { ConfirmModal, FormModal, LoadingState, PageHeader, PageToolbar } from '../components/common';
import { ResponsiveTableShell } from '../components/studio';
import Pagination from '../components/Pagination';
import { usePermission } from '../hooks/usePermission';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { getRoleDisplayName } from '../lib/roles';
import { formatBeijingDate, formatBeijingTime } from '../lib/utils';
import { useAppStore, useAuthStore } from '../store';
import type { ActivityLog, User } from '../types';

interface RoleOption {
  id: number;
  code: string;
  name: string;
}

interface UserFormData {
  username: string;
  password: string;
  email: string;
  role: string;
  name: string;
  enabled: boolean;
}

const roleColors: Record<string, string> = {
  admin: 'bg-studio-coral-soft text-studio-coral-contrast border-studio-border-soft',
  director: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
  editor: 'bg-studio-violet-soft text-studio-violet-contrast border-studio-border-soft',
  copywriter: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
  post_production: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
  camera: 'bg-studio-cyan-soft text-studio-cyan-contrast border-studio-border-soft',
  member: 'bg-studio-surface-soft text-studio-text-secondary border-studio-border-soft',
};

const USER_PAGE_SIZE = 50;
const USER_CREATE_RECOVERY_VERSION = 1;
const USER_EDIT_RECOVERY_VERSION = 1;
const USER_DELETE_RECOVERY_VERSION = 1;
const USER_TOGGLE_RECOVERY_VERSION = 1;
const USER_CREATE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredUserCreateRecovery {
  version: 1;
  requestId: string;
  username: string;
  email: string;
  role: string;
  name: string;
}

type UserCreateRecoveryCheck = 'checking' | 'not_found' | 'unavailable';

interface StoredUserEditRecovery {
  version: 1;
  actorId: number;
  requestId: string;
  targetUserId: number;
  username: string;
  email: string;
  role: string;
  name: string;
  enabled: boolean;
  hasPassword: boolean;
}

type UserEditRecoveryCheck = 'checking' | 'not_found' | 'unavailable';

interface PendingUserEditRequest extends StoredUserEditRecovery {
  requiresPasswordReentry?: boolean;
  recoveryCheck?: UserEditRecoveryCheck;
}

interface StoredUserDeleteRecovery {
  version: 1;
  actorId: number;
  requestId: string;
  targetUserId: number;
  username: string;
  requireTargetAbsenceCheck?: boolean;
}

type UserDeleteRecoveryCheck = 'checking' | 'not_found' | 'unavailable';
type UserDeleteResolution = 'deleted' | 'not_found' | 'already_absent' | 'target_present' | 'unavailable';

interface PendingUserDeleteRequest extends StoredUserDeleteRecovery {
  recoveryCheck?: UserDeleteRecoveryCheck;
}

interface StoredUserToggleRecovery {
  version: 1;
  actorId: number;
  requestId: string;
  targetUserId: number;
  username: string;
  desiredEnabled: boolean;
}

type UserToggleRecoveryCheck = 'checking' | 'not_found' | 'unavailable';

interface PendingUserToggleRequest extends StoredUserToggleRecovery {
  recoveryCheck?: UserToggleRecoveryCheck;
}

function userCreateRecoveryStorageKey(userId: number) {
  return `xmt:user-create-pending:v${USER_CREATE_RECOVERY_VERSION}:user:${userId}`;
}

function readUserCreateRecovery(userId: number): StoredUserCreateRecovery | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(userCreateRecoveryStorageKey(userId));
    if (!raw || raw.length > 8_192) return null;
    const value = JSON.parse(raw) as Partial<StoredUserCreateRecovery> | null;
    if (!value || value.version !== USER_CREATE_RECOVERY_VERSION
      || typeof value.requestId !== 'string' || !USER_CREATE_REQUEST_ID_PATTERN.test(value.requestId)
      || typeof value.username !== 'string' || typeof value.email !== 'string'
      || typeof value.role !== 'string' || typeof value.name !== 'string') return null;
    return {
      version: USER_CREATE_RECOVERY_VERSION,
      requestId: value.requestId.toLowerCase(),
      username: value.username,
      email: value.email,
      role: value.role,
      name: value.name,
    };
  } catch {
    return null;
  }
}

function persistUserCreateRecovery(userId: number, requestId: string, formData: UserFormData) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存创建请求编号');
  const recovery: StoredUserCreateRecovery = {
    version: USER_CREATE_RECOVERY_VERSION,
    requestId,
    username: formData.username,
    email: formData.email,
    role: formData.role,
    name: formData.name,
  };
  window.sessionStorage.setItem(userCreateRecoveryStorageKey(userId), JSON.stringify(recovery));
}

function clearUserCreateRecovery(userId: number | null | undefined) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.sessionStorage.removeItem(userCreateRecoveryStorageKey(userId));
  } catch {
    // A stale marker is safe: the server lookup is read-only and actor-scoped.
  }
}

function userEditRecoveryStorageKey(actorId: number) {
  return `xmt:user-update-pending:v${USER_EDIT_RECOVERY_VERSION}:actor:${actorId}`;
}

function snapshotUserEditRecoveryStorageKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const prefix = `xmt:user-update-pending:v${USER_EDIT_RECOVERY_VERSION}:actor:`;
  try {
    return new Set(Object.keys(window.sessionStorage).filter((key) => key.startsWith(prefix)));
  } catch {
    return new Set();
  }
}

function readUserEditRecovery(actorId: number): StoredUserEditRecovery | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(userEditRecoveryStorageKey(actorId));
    if (!raw || raw.length > 8_192) return null;
    const value = JSON.parse(raw) as Partial<StoredUserEditRecovery> | null;
    if (!value || value.version !== USER_EDIT_RECOVERY_VERSION || value.actorId !== actorId
      || typeof value.requestId !== 'string' || !USER_CREATE_REQUEST_ID_PATTERN.test(value.requestId)
      || !Number.isSafeInteger(value.targetUserId) || Number(value.targetUserId) <= 0
      || typeof value.username !== 'string' || typeof value.email !== 'string'
      || typeof value.role !== 'string' || typeof value.name !== 'string'
      || typeof value.enabled !== 'boolean' || typeof value.hasPassword !== 'boolean') return null;
    return {
      version: USER_EDIT_RECOVERY_VERSION,
      actorId,
      requestId: value.requestId.toLowerCase(),
      targetUserId: Number(value.targetUserId),
      username: value.username,
      email: value.email,
      role: value.role,
      name: value.name,
      enabled: value.enabled,
      hasPassword: value.hasPassword,
    };
  } catch {
    return null;
  }
}

function persistUserEditRecovery(actorId: number, targetUser: User, requestId: string, formData: UserFormData) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存更新请求');
  const recovery: StoredUserEditRecovery = {
    version: USER_EDIT_RECOVERY_VERSION,
    actorId,
    requestId,
    targetUserId: targetUser.id,
    username: targetUser.username,
    email: formData.email,
    role: formData.role,
    name: formData.name,
    enabled: formData.enabled,
    hasPassword: Boolean(formData.password),
  };
  window.sessionStorage.setItem(userEditRecoveryStorageKey(actorId), JSON.stringify(recovery));
}

function clearUserEditRecovery(actorId: number | null | undefined) {
  if (typeof window === 'undefined' || !actorId) return;
  try {
    window.sessionStorage.removeItem(userEditRecoveryStorageKey(actorId));
  } catch {
    // A stale marker remains safe because status lookup is read-only and actor-scoped.
  }
}

function userDeleteRecoveryStorageKey(actorId: number) {
  return `xmt:user-delete-pending:v${USER_DELETE_RECOVERY_VERSION}:actor:${actorId}`;
}

function snapshotUserDeleteRecoveryStorageKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const prefix = `xmt:user-delete-pending:v${USER_DELETE_RECOVERY_VERSION}:actor:`;
  try {
    return new Set(Object.keys(window.sessionStorage).filter((key) => key.startsWith(prefix)));
  } catch {
    return new Set();
  }
}

function readUserDeleteRecovery(actorId: number): StoredUserDeleteRecovery | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(userDeleteRecoveryStorageKey(actorId));
    if (!raw || raw.length > 8_192) return null;
    const value = JSON.parse(raw) as Partial<StoredUserDeleteRecovery> | null;
    if (!value || value.version !== USER_DELETE_RECOVERY_VERSION || value.actorId !== actorId
      || typeof value.requestId !== 'string' || !USER_CREATE_REQUEST_ID_PATTERN.test(value.requestId)
      || !Number.isSafeInteger(value.targetUserId) || Number(value.targetUserId) <= 0
      || typeof value.username !== 'string') return null;
    return {
      version: USER_DELETE_RECOVERY_VERSION,
      actorId,
      requestId: value.requestId.toLowerCase(),
      targetUserId: Number(value.targetUserId),
      username: value.username,
      ...(value.requireTargetAbsenceCheck === true ? { requireTargetAbsenceCheck: true } : {}),
    };
  } catch {
    return null;
  }
}

function persistUserDeleteRecovery(actorId: number, targetUser: User, requestId: string, requireTargetAbsenceCheck = false) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存删除请求编号');
  const recovery: StoredUserDeleteRecovery = {
    version: USER_DELETE_RECOVERY_VERSION,
    actorId,
    requestId,
    targetUserId: targetUser.id,
    username: targetUser.username,
    ...(requireTargetAbsenceCheck ? { requireTargetAbsenceCheck: true } : {}),
  };
  window.sessionStorage.setItem(userDeleteRecoveryStorageKey(actorId), JSON.stringify(recovery));
}

function clearUserDeleteRecovery(actorId: number | null | undefined) {
  if (typeof window === 'undefined' || !actorId) return;
  try {
    window.sessionStorage.removeItem(userDeleteRecoveryStorageKey(actorId));
  } catch {
    // A stale marker remains safe because status lookup is read-only and actor-scoped.
  }
}

function userToggleRecoveryStorageKey(actorId: number) {
  return `xmt:user-toggle-pending:v${USER_TOGGLE_RECOVERY_VERSION}:actor:${actorId}`;
}

function snapshotUserToggleRecoveryStorageKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const prefix = `xmt:user-toggle-pending:v${USER_TOGGLE_RECOVERY_VERSION}:actor:`;
  try {
    return new Set(Object.keys(window.sessionStorage).filter((key) => key.startsWith(prefix)));
  } catch {
    return new Set();
  }
}

function readUserToggleRecovery(actorId: number): StoredUserToggleRecovery | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(userToggleRecoveryStorageKey(actorId));
    if (!raw || raw.length > 8_192) return null;
    const value = JSON.parse(raw) as Partial<StoredUserToggleRecovery> | null;
    if (!value || value.version !== USER_TOGGLE_RECOVERY_VERSION || value.actorId !== actorId
      || typeof value.requestId !== 'string' || !USER_CREATE_REQUEST_ID_PATTERN.test(value.requestId)
      || !Number.isSafeInteger(value.targetUserId) || Number(value.targetUserId) <= 0
      || typeof value.username !== 'string' || typeof value.desiredEnabled !== 'boolean') return null;
    return {
      version: USER_TOGGLE_RECOVERY_VERSION,
      actorId,
      requestId: value.requestId.toLowerCase(),
      targetUserId: Number(value.targetUserId),
      username: value.username,
      desiredEnabled: value.desiredEnabled,
    };
  } catch {
    return null;
  }
}

function persistUserToggleRecovery(recovery: StoredUserToggleRecovery) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存启停请求编号');
  window.sessionStorage.setItem(userToggleRecoveryStorageKey(recovery.actorId), JSON.stringify(recovery));
}

function clearUserToggleRecovery(actorId: number | null | undefined) {
  if (typeof window === 'undefined' || !actorId) return;
  try {
    window.sessionStorage.removeItem(userToggleRecoveryStorageKey(actorId));
  } catch {
    // A stale marker is safe because request-status lookup is read-only and actor-scoped.
  }
}

function recoveredUserFromEdit(recovery: StoredUserEditRecovery): User {
  return {
    id: recovery.targetUserId,
    username: recovery.username,
    email: recovery.email,
    role: recovery.role,
    name: recovery.name,
    enabled: recovery.enabled,
    created_at: '',
    updated_at: '',
  };
}

function recoveredUserFromDelete(recovery: StoredUserDeleteRecovery): User {
  return {
    id: recovery.targetUserId,
    username: recovery.username,
    email: '',
    role: 'member',
    name: recovery.username,
    enabled: true,
    created_at: '',
    updated_at: '',
  };
}

function recoveredUserFromToggle(recovery: StoredUserToggleRecovery): User {
  return {
    id: recovery.targetUserId,
    username: recovery.username,
    email: '',
    role: 'member',
    name: recovery.username,
    enabled: !recovery.desiredEnabled,
    created_at: '',
    updated_at: '',
  };
}

function buildDefaultForm(roleCode = 'member'): UserFormData {
  return {
    username: '',
    password: '',
    email: '',
    role: roleCode,
    name: '',
    enabled: true,
  };
}

export default function Users() {
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
  const { hasPermission } = usePermission();

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
      addNotification({ title: '获取角色失败', message: (error as Error).message, type: 'error' });
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
        if (activeTab === 'users') {
          setUsersLoadError(error instanceof Error ? error.message : '请检查网络后重试');
        } else {
          setLogsLoadError(error instanceof Error ? error.message : '请检查网络后重试');
        }
        addNotification({ title: '获取数据失败', message: error instanceof Error ? error.message : '请检查网络后重试', type: 'error' });
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
      setUsersLoadError(error instanceof Error ? error.message : '请检查网络后重试');
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
    if (useAuthStore.getState().user?.id !== recovery.actorId || userMutationLockRef.current) return;
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
      setLogsLoadError(error instanceof Error ? error.message : '请检查网络后重试');
      return false;
    } finally {
      setLogsRefreshing(false);
    }
  };

  const verifyUserEditRecovery = useCallback(async (recovery: StoredUserEditRecovery) => {
    if (useAuthStore.getState().user?.id !== recovery.actorId) return;
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
  }, [addNotification, canUpdateUser]);

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
    if (!currentUserId) {
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
  }, [currentUserId]);

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
    if (!currentUserId || pendingUserCreateRequest || activePendingUserEditRequest || activePendingUserDeleteRequest) return;
    const recovery = readUserToggleRecovery(currentUserId);
    if (!recovery) return;

    const storageKey = userToggleRecoveryStorageKey(currentUserId);
    if (!userToggleRecoveryKeysAtMountRef.current?.has(storageKey)) return;
    if (userToggleRecoveryLookupStartedRef.current.has(storageKey)) return;
    userToggleRecoveryLookupStartedRef.current.add(storageKey);
    void verifyUserToggleRecoveryRef.current(recovery);
  }, [activePendingUserDeleteRequest, activePendingUserEditRequest, currentUserId, pendingUserCreateRequest]);

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
        addNotification({ title: '创建未完成', message: (error as Error).message, type: 'error' });
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
        addNotification({ title: '更新未完成', message: (error as Error).message, type: 'error' });
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

  const tabSwitch = (
    <div className={`flex w-fit gap-2 rounded-xl p-1 ${styles.bgSecondary} ${styles.border}`}>
      <button
        onClick={() => setActiveTab('users')}
        className={`rounded-lg px-4 py-2 transition-colors ${activeTab === 'users' ? styles.buttonPrimary : `${styles.textSecondary} ${styles.hoverBg}`}`}
      >
        用户列表
      </button>
      {canViewLogs && (
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${activeTab === 'logs' ? styles.buttonPrimary : `${styles.textSecondary} ${styles.hoverBg}`}`}
        >
          <History className="h-4 w-4" />
          操作日志
        </button>
      )}
    </div>
  );

  const searchInput = (
    <div className="relative">
      <Search className={`absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 ${styles.textSecondary}`} />
      <input
        type="text"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder={activeTab === 'users' ? '搜索用户名、姓名或邮箱...' : '搜索操作、用户或目标...'}
        className={`w-full rounded-lg py-2 pl-10 pr-4 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
      />
    </div>
  );

  const renderRoleSelect = (
    <select
      id="user-role"
      value={formData.role}
      disabled={Boolean(pendingUserCreateRequest || activePendingUserEditRequest)}
      onChange={(event) => setFormData({ ...formData, role: event.target.value })}
      className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
    >
      {roles.map((role) => (
        <option key={role.id} value={role.code}>
          {role.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="人员管理"
          description={canManageRoles ? '管理系统用户、角色分配和操作日志' : '查看系统用户和可访问的操作信息'}
          actions={
            activeTab === 'users' && canResolveUserCreate ? (
              <button type="button" disabled={loading || userMutationPending || usersRefreshing || userMutationResolutionPending} onClick={() => void openCreateModal()} className={`flex items-center gap-2 rounded-lg px-4 py-2 ${styles.buttonPrimary} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}>
                <Plus className="h-5 w-5" />
                添加用户
              </button>
            ) : undefined
          }
        />

        <PageToolbar left={tabSwitch} search={searchInput} />

        {activeTab === 'users' && (usersMutationNotice || usersLoadError || activePendingUserDeleteRequest || activePendingUserToggleRequest) ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0">{activePendingUserDeleteRequest
              ? activePendingUserDeleteRequest.recoveryCheck === 'checking'
                ? '正在核实上次删除结果；核实期间其他人员修改已暂停。'
                : activePendingUserDeleteRequest.recoveryCheck === 'not_found'
                  ? '暂未找到删除完成记录；可用同一请求编号安全重试，服务端会避免重复删除。'
                  : usersMutationNotice || '暂时无法核实上次删除结果；原请求已保留，请先只读重新核实。'
              : activePendingUserToggleRequest
                ? activePendingUserToggleRequest.recoveryCheck === 'checking'
                  ? '正在核实上次用户启停结果；核实期间其他人员修改已暂停。'
                  : activePendingUserToggleRequest.recoveryCheck === 'not_found'
                    ? canUpdateUser
                      ? '暂未找到启停完成记录；可用同一请求编号安全重试。'
                      : '暂未找到启停完成记录；当前账号无权重试，原请求仍锁定，请只读重新核实。'
                    : `暂时无法核实用户 ${activePendingUserToggleRequest.username} 的启停结果；原请求已保留，所有人员修改继续暂停，请只读重新核实。`
                : usersMutationNotice || `用户列表暂不可用：${usersLoadError}`}</p>
            {activePendingUserDeleteRequest ? (
              <button
                type="button"
                disabled={userMutationPending || activePendingUserDeleteRequest.recoveryCheck === 'checking'}
                onClick={() => activePendingUserDeleteRequest.recoveryCheck === 'not_found' && canDeleteUser
                  ? void handleDelete()
                  : void verifyUserDeleteRecovery(activePendingUserDeleteRequest)}
                className={`self-start rounded-lg px-4 py-2 ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto`}
              >
                {userMutationPending || activePendingUserDeleteRequest.recoveryCheck === 'checking'
                  ? '正在核实删除'
                  : activePendingUserDeleteRequest.recoveryCheck === 'not_found' && canDeleteUser
                    ? '安全重试上次删除'
                    : '只读重新核实删除'}
              </button>
            ) : activePendingUserToggleRequest ? (
              <button
                type="button"
                disabled={userMutationPending || activePendingUserToggleRequest.recoveryCheck === 'checking'}
                onClick={() => activePendingUserToggleRequest.recoveryCheck === 'not_found' && canUpdateUser
                  ? void handleToggleEnable(recoveredUserFromToggle(activePendingUserToggleRequest))
                  : void verifyUserToggleRecovery(activePendingUserToggleRequest)}
                className={`self-start rounded-lg px-4 py-2 ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto`}
              >
                {userMutationPending || activePendingUserToggleRequest.recoveryCheck === 'checking'
                  ? '正在核实启停'
                  : activePendingUserToggleRequest.recoveryCheck === 'not_found' && canUpdateUser
                    ? '安全重试上次启停'
                    : '只读重新核实启停'}
              </button>
            ) : (
              canViewUsers ? (
                <button type="button" disabled={loading || usersRefreshing} onClick={() => void refreshUsers()} className={`self-start rounded-lg px-4 py-2 ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto`}>
                  {usersRefreshing ? '正在重新加载' : '重新加载列表'}
                </button>
              ) : null
            )}
          </div>
        ) : null}

        {activeTab === 'logs' && logsLoadError ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0">操作日志暂不可用：{logsLoadError}</p>
            {canViewLogs ? (
              <button type="button" disabled={loading || logsRefreshing} onClick={() => void refreshLogs()} className={`self-start rounded-lg px-4 py-2 ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto`}>
                {logsRefreshing ? '正在重新加载' : '重新加载日志'}
              </button>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'users' && (
          <div className="min-w-0" data-testid="users-list" aria-busy={loading || usersRefreshing}>
            {loading ? (
              <div className={`${styles.bgSecondary} rounded-xl ${styles.border} px-6 py-12`}><LoadingState type="section" text="加载用户中..." /></div>
            ) : usersLoadError && filteredUsers.length === 0 ? null : filteredUsers.length === 0 ? (
              <div className={`${styles.bgSecondary} rounded-xl ${styles.border}`}><EmptyState icon={UserIcon} title="暂无用户" description="当前没有可显示的用户记录。" /></div>
            ) : (
              <ResponsiveTableShell footer={<Pagination page={usersPage} total={usersTotal} limit={USER_PAGE_SIZE} onChange={setUsersPage} />}>
                <table className="w-full min-w-[1240px] table-fixed">
                  <thead>
                    <tr className={styles.tableHeader}>
                      <th className={`w-[200px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>用户名</th>
                      <th className={`w-[140px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>姓名</th>
                      <th className={`w-[220px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>邮箱</th>
                      <th className={`w-[160px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>角色</th>
                      <th className={`w-[120px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>状态</th>
                      <th className={`w-[180px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>创建时间</th>
                      <th className="sticky right-0 z-20 w-[168px] border-l border-studio-border-soft bg-studio-surface-soft px-1.5 py-3 text-right text-sm font-medium text-studio-text-secondary sm:w-[260px] sm:px-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-studio-primary to-studio-cyan">
                              <UserIcon className="h-5 w-5 text-white" />
                            </div>
                            <span className={`truncate font-medium ${styles.textPrimary}`} title={user.username}>{user.username}</span>
                          </div>
                        </td>
                        <td className={`truncate px-6 py-4 ${styles.textSecondary}`} title={user.name || undefined}>{user.name || '-'}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>
                          <div className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0" /><span className="truncate" title={user.email || undefined}>{user.email || '-'}</span></div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${getRoleBadgeClass(user.role)}`}>
                            <Shield className="h-3 w-3" />
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${user.enabled ? 'border-studio-border-soft bg-studio-success-soft text-studio-success-contrast' : 'border-studio-border-soft bg-studio-coral-soft text-studio-coral-contrast'}`}>
                            {user.enabled ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                            {user.enabled ? '已启用' : '已禁用'}
                          </span>
                        </td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>
                          <div className="flex items-center gap-2 whitespace-nowrap"><Calendar className="h-4 w-4 shrink-0" />{formatBeijingDate(user.created_at)}</div>
                        </td>
                        <td data-testid={`user-row-actions-${user.id}`} className="sticky right-0 z-10 w-[168px] border-l border-studio-border-soft bg-studio-surface px-1.5 py-4 sm:w-[260px] sm:px-3">
                          <div className="flex flex-wrap items-center justify-end gap-0.5 sm:flex-nowrap sm:gap-1">
                            {canUpdateUser && (
                              <button
                                onClick={() => void handleToggleEnable(user)}
                                aria-label={`${user.enabled ? '禁用' : '启用'}用户 ${user.username}`}
                                disabled={userMutationPending || usersRefreshing || userMutationResolutionPending}
                                className={`xmt-btn inline-flex min-h-10 items-center gap-1 rounded-lg border px-1.5 py-2 text-xs transition-opacity hover:opacity-85 sm:px-2.5 ${user.enabled ? 'border-studio-border-soft bg-studio-coral-soft text-studio-coral-contrast' : 'border-studio-border-soft bg-studio-success-soft text-studio-success-contrast'}`}
                              >
                                {user.enabled ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                {user.enabled ? '禁用' : '启用'}
                              </button>
                            )}
                            {canUpdateUser && (
                              <button type="button" disabled={userMutationPending || usersRefreshing || userMutationResolutionPending} onClick={() => void openEditModal(user)} className={`xmt-btn min-h-10 min-w-10 rounded-lg p-0 text-studio-primary ${styles.hoverBg} hover:text-studio-primary disabled:opacity-50`} title="编辑" aria-label={`编辑用户 ${user.username}`}>
                                <Edit3 className="h-4 w-4 sm:h-5 sm:w-5" />
                              </button>
                            )}
                            {canDeleteUser && (
                              <button type="button" disabled={userMutationPending || usersRefreshing || userMutationResolutionPending} onClick={() => setPendingDeleteUser(user)} className={`xmt-btn min-h-10 min-w-10 rounded-lg p-0 text-studio-coral ${styles.hoverBg} hover:text-studio-coral disabled:opacity-50`} title="删除" aria-label={`删除用户 ${user.username}`}>
                                <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTableShell>
            )}
          </div>
        )}

        {activeTab === 'logs' && canViewLogs && (
          <div className={`${styles.bgSecondary} overflow-hidden rounded-xl ${styles.border}`}>
            {loading ? (
              <div className="px-6 py-12"><LoadingState type="section" text="加载日志中..." /></div>
            ) : logsLoadError && filteredLogs.length === 0 ? null : filteredLogs.length === 0 ? (
              <EmptyState icon={History} title="暂无操作日志" description="当前没有可显示的操作记录。" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={styles.tableHeader}>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>操作人</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>操作</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>目标</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>详情</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                        <td className={`px-6 py-4 font-medium ${styles.textPrimary}`}>{log.user_name || '-'}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>{log.action}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>{log.target}</td>
                        <td className={`max-w-xs truncate px-6 py-4 ${styles.textSecondary}`} title={log.detail}>{log.detail}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>{formatBeijingTime(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <FormModal
        open={showCreateModal}
        title="添加用户"
        onCancel={() => { if (!userMutationLockRef.current && !pendingUserCreateRequest) setShowCreateModal(false); }}
        onSubmit={handleCreate}
        submitText={pendingUserCreateRequest ? '安全重试上次创建' : '保存'}
        cancelText="取消"
        loading={userMutationPending}
        locked={Boolean(pendingUserCreateRequest)}
        allowChildrenWhenLocked={Boolean(pendingUserCreateRequest?.requiresPasswordReentry)}
        allowSubmitWhenLocked={canResolveUserCreate && (!pendingUserCreateRequest?.requiresPasswordReentry || Boolean(formData.password))}
      >
        <div className="space-y-4">
          {pendingUserCreateRequest ? (
            <p role="alert" className="rounded-xl border border-studio-border-soft bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast">
              {!canResolveUserCreate
                ? pendingUserCreateRequest.recoveryCheck === 'checking'
                  ? '当前账号没有创建权限；系统仍会只读核实上次请求，权限恢复前不会重试。用户名、姓名、邮箱和角色已锁定，密码不会保存在浏览器恢复记录中。'
                  : pendingUserCreateRequest.recoveryCheck === 'not_found'
                    ? '服务器未找到上次创建记录，但当前账号没有创建权限。原请求标记会保留；权限恢复并刷新页面后，才能重新核实并安全重试同一请求。'
                    : '当前账号没有创建权限，且暂时无法核实上次创建结果。原请求标记会保留；请恢复权限后刷新页面继续核实，不会发起写入。'
                : pendingUserCreateRequest.requiresPasswordReentry
                  ? pendingUserCreateRequest.recoveryCheck === 'checking'
                    ? '正在只读核实上次创建结果。用户名、姓名、邮箱和角色已锁定；密码不会保存在浏览器恢复记录中。'
                    : pendingUserCreateRequest.recoveryCheck === 'not_found'
                      ? '服务器未找到上次创建记录。用户名、姓名、邮箱和角色已锁定；请输入上次创建时使用的密码，再安全重试同一请求。密码不会保存在浏览器恢复记录中。'
                      : pendingUserCreateRequest.recoveryCheck === 'unavailable'
                        ? '当前无法核实上次创建结果。用户名、姓名、邮箱和角色已锁定；请输入上次创建时使用的密码，再安全重试同一请求。密码不会保存在浏览器恢复记录中。'
                        : '刷新后尚未核实上次创建结果。用户名、姓名、邮箱和角色已锁定；请输入上次创建时使用的密码，再安全重试同一请求。密码不会保存在浏览器恢复记录中。'
                  : '上次创建结果尚未确认。为避免重复创建账号，表单已锁定；再次保存会安全重试同一请求。'}
            </p>
          ) : null}
          <div>
            <label htmlFor="create-user-username" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>用户名 *</label>
            <input id="create-user-username" type="text" value={formData.username} disabled={Boolean(pendingUserCreateRequest)} onChange={(event) => setFormData({ ...formData, username: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} placeholder="请输入用户名" />
          </div>
          <div>
            <label htmlFor="create-user-password" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>密码 *</label>
            <input id="create-user-password" type="password" value={formData.password} disabled={Boolean(pendingUserCreateRequest && (!pendingUserCreateRequest.requiresPasswordReentry || !canResolveUserCreate))} onChange={(event) => setFormData({ ...formData, password: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} placeholder={pendingUserCreateRequest?.requiresPasswordReentry ? '请输入上次创建时使用的密码' : '请输入密码'} />
          </div>
          <div>
            <label htmlFor="create-user-name" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>姓名</label>
            <input id="create-user-name" type="text" value={formData.name} disabled={Boolean(pendingUserCreateRequest)} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} placeholder="请输入姓名" />
          </div>
          <div>
            <label htmlFor="create-user-email" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>邮箱</label>
            <input id="create-user-email" type="email" value={formData.email} disabled={Boolean(pendingUserCreateRequest)} onChange={(event) => setFormData({ ...formData, email: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} placeholder="请输入邮箱" />
          </div>
          <div>
            <label htmlFor="user-role" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>角色</label>
            {renderRoleSelect}
          </div>
        </div>
      </FormModal>

      <FormModal
        open={showEditModal && Boolean(editingUser)}
        title="编辑用户"
        onCancel={() => { if (!userMutationLockRef.current && !activePendingUserEditRequest) { setShowEditModal(false); setEditingUser(null); } }}
        onSubmit={handleEdit}
        submitText={activePendingUserEditRequest ? '安全重试上次保存' : '保存'}
        cancelText="取消"
        loading={userMutationPending}
        locked={Boolean(activePendingUserEditRequest && editingUser?.id === activePendingUserEditRequest.targetUserId)}
        allowChildrenWhenLocked={Boolean(activePendingUserEditRequest?.recoveryCheck)}
        allowSubmitWhenLocked={pendingEditCanSubmit}
      >
        <div className="space-y-4">
          {activePendingUserEditRequest ? (
            <p role="alert" className="rounded-xl border border-studio-border-soft bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast">
              {activePendingUserEditRequest.recoveryCheck === 'checking'
                ? '正在只读核实刷新前的用户更新。所有字段已锁定，恢复记录不含密码。'
                : activePendingUserEditRequest.recoveryCheck === 'not_found'
                  ? activePendingUserEditRequest.hasPassword
                    ? '服务器未找到上次更新记录。原字段已锁定；请输入上次更新时使用的密码，再用同一请求安全重试。密码不会保存在浏览器恢复记录中。'
                    : '服务器未找到上次更新记录。原字段已锁定，可用同一请求安全重试。'
                  : activePendingUserEditRequest.recoveryCheck === 'unavailable'
                    ? '当前暂时无法核实上次更新结果。原字段已锁定；请只读重新核实，暂不重发更新。'
                    : '上次保存结果尚未确认。为避免重复修改密码、角色或会话，表单已锁定；再次保存会安全重试同一请求。'}
              {activePendingUserEditRequest.recoveryCheck === 'unavailable' ? (
                <button type="button" disabled={userMutationPending} onClick={() => void verifyUserEditRecovery(activePendingUserEditRequest)} className={`ml-2 min-h-10 rounded-lg px-3 py-1 ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-50`}>
                  {userMutationPending ? '正在核实' : '只读重新核实'}
                </button>
              ) : null}
            </p>
          ) : null}
          <div>
            <label htmlFor="edit-user-username" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>用户名</label>
            <input id="edit-user-username" type="text" value={formData.username} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`} disabled />
          </div>
          <div>
            <label htmlFor="edit-user-password" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>密码（留空则不修改）</label>
            <input id="edit-user-password" type="password" value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} disabled={Boolean(activePendingUserEditRequest && !(activePendingUserEditRequest.requiresPasswordReentry && activePendingUserEditRequest.recoveryCheck === 'not_found'))} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} placeholder={activePendingUserEditRequest?.requiresPasswordReentry ? '请输入上次更新时使用的密码' : '留空则不修改密码'} />
          </div>
          <div>
            <label htmlFor="edit-user-name" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>姓名</label>
            <input id="edit-user-name" type="text" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={Boolean(activePendingUserEditRequest)} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} />
          </div>
          <div>
            <label htmlFor="edit-user-email" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>邮箱</label>
            <input id="edit-user-email" type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} disabled={Boolean(activePendingUserEditRequest)} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} />
          </div>
          <div>
            <label htmlFor="user-role" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>角色</label>
            {renderRoleSelect}
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="enabled" checked={formData.enabled} onChange={(event) => setFormData({ ...formData, enabled: event.target.checked })} disabled={Boolean(activePendingUserEditRequest)} className={`h-5 w-5 rounded ${styles.borderInput} ${styles.bgInput} text-studio-primary focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} />
            <label htmlFor="enabled" className={styles.textSecondary}>启用用户</label>
          </div>
        </div>
      </FormModal>

      <ConfirmModal
        open={Boolean(pendingDeleteUser)}
        title="确认删除用户"
        description={pendingDeleteUser ? `确定要删除用户「${pendingDeleteUser.username}」吗？该操作执行后将无法恢复。` : '确定要删除该用户吗？'}
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={userMutationPending}
        onConfirm={handleDelete}
        onCancel={() => { if (!userMutationLockRef.current) setPendingDeleteUser(null); }}
      />
    </>
  );
}
