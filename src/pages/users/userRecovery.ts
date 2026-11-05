import type { User } from '../../types';
import type { UserFormData } from './userTypes';
import { persistVerifiedUserRecovery } from './userRecoveryStorage';

export const USER_CREATE_RECOVERY_VERSION = 1;
export const USER_EDIT_RECOVERY_VERSION = 1;
export const USER_DELETE_RECOVERY_VERSION = 1;
export const USER_TOGGLE_RECOVERY_VERSION = 1;
export const USER_CREATE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StoredUserCreateRecovery {
  version: 1;
  requestId: string;
  username: string;
  email: string;
  role: string;
  name: string;
}

export type UserCreateRecoveryCheck = 'checking' | 'not_found' | 'unavailable';

export interface StoredUserEditRecovery {
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

export type UserEditRecoveryCheck = 'checking' | 'not_found' | 'unavailable';

export interface PendingUserEditRequest extends StoredUserEditRecovery {
  requiresPasswordReentry?: boolean;
  recoveryCheck?: UserEditRecoveryCheck;
}

export interface StoredUserDeleteRecovery {
  version: 1;
  actorId: number;
  requestId: string;
  targetUserId: number;
  username: string;
  requireTargetAbsenceCheck?: boolean;
}

export type UserDeleteRecoveryCheck = 'checking' | 'not_found' | 'unavailable';
export type UserDeleteResolution = 'deleted' | 'not_found' | 'already_absent' | 'target_present' | 'unavailable';

export interface PendingUserDeleteRequest extends StoredUserDeleteRecovery {
  recoveryCheck?: UserDeleteRecoveryCheck;
}

export interface StoredUserToggleRecovery {
  version: 1;
  actorId: number;
  requestId: string;
  targetUserId: number;
  username: string;
  desiredEnabled: boolean;
}

export type UserToggleRecoveryCheck = 'checking' | 'not_found' | 'unavailable';

export interface PendingUserToggleRequest extends StoredUserToggleRecovery {
  recoveryCheck?: UserToggleRecoveryCheck;
}

export function userCreateRecoveryStorageKey(userId: number) {
  return `xmt:user-create-pending:v${USER_CREATE_RECOVERY_VERSION}:user:${userId}`;
}

export function readUserCreateRecovery(userId: number): StoredUserCreateRecovery | null {
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

export function persistUserCreateRecovery(userId: number, requestId: string, formData: UserFormData) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存创建请求编号');
  const recovery: StoredUserCreateRecovery = {
    version: USER_CREATE_RECOVERY_VERSION,
    requestId,
    username: formData.username,
    email: formData.email,
    role: formData.role,
    name: formData.name,
  };
  persistVerifiedUserRecovery(window.sessionStorage, userCreateRecoveryStorageKey(userId), recovery);
}

export function clearUserCreateRecovery(userId: number | null | undefined) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.sessionStorage.removeItem(userCreateRecoveryStorageKey(userId));
  } catch {
    // A stale marker is safe: the server lookup is read-only and actor-scoped.
  }
}

export function userEditRecoveryStorageKey(actorId: number) {
  return `xmt:user-update-pending:v${USER_EDIT_RECOVERY_VERSION}:actor:${actorId}`;
}

export function snapshotUserEditRecoveryStorageKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const prefix = `xmt:user-update-pending:v${USER_EDIT_RECOVERY_VERSION}:actor:`;
  try {
    return new Set(Object.keys(window.sessionStorage).filter((key) => key.startsWith(prefix)));
  } catch {
    return new Set();
  }
}

export function readUserEditRecovery(actorId: number): StoredUserEditRecovery | null {
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

export function persistUserEditRecovery(actorId: number, targetUser: User, requestId: string, formData: UserFormData) {
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
  persistVerifiedUserRecovery(window.sessionStorage, userEditRecoveryStorageKey(actorId), recovery);
}

export function clearUserEditRecovery(actorId: number | null | undefined) {
  if (typeof window === 'undefined' || !actorId) return;
  try {
    window.sessionStorage.removeItem(userEditRecoveryStorageKey(actorId));
  } catch {
    // A stale marker remains safe because status lookup is read-only and actor-scoped.
  }
}

export function userDeleteRecoveryStorageKey(actorId: number) {
  return `xmt:user-delete-pending:v${USER_DELETE_RECOVERY_VERSION}:actor:${actorId}`;
}

export function snapshotUserDeleteRecoveryStorageKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const prefix = `xmt:user-delete-pending:v${USER_DELETE_RECOVERY_VERSION}:actor:`;
  try {
    return new Set(Object.keys(window.sessionStorage).filter((key) => key.startsWith(prefix)));
  } catch {
    return new Set();
  }
}

export function readUserDeleteRecovery(actorId: number): StoredUserDeleteRecovery | null {
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

export function persistUserDeleteRecovery(actorId: number, targetUser: User, requestId: string, requireTargetAbsenceCheck = false) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存删除请求编号');
  const recovery: StoredUserDeleteRecovery = {
    version: USER_DELETE_RECOVERY_VERSION,
    actorId,
    requestId,
    targetUserId: targetUser.id,
    username: targetUser.username,
    ...(requireTargetAbsenceCheck ? { requireTargetAbsenceCheck: true } : {}),
  };
  persistVerifiedUserRecovery(window.sessionStorage, userDeleteRecoveryStorageKey(actorId), recovery);
}

export function clearUserDeleteRecovery(actorId: number | null | undefined) {
  if (typeof window === 'undefined' || !actorId) return;
  try {
    window.sessionStorage.removeItem(userDeleteRecoveryStorageKey(actorId));
  } catch {
    // A stale marker remains safe because status lookup is read-only and actor-scoped.
  }
}

export function userToggleRecoveryStorageKey(actorId: number) {
  return `xmt:user-toggle-pending:v${USER_TOGGLE_RECOVERY_VERSION}:actor:${actorId}`;
}

export function snapshotUserToggleRecoveryStorageKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const prefix = `xmt:user-toggle-pending:v${USER_TOGGLE_RECOVERY_VERSION}:actor:`;
  try {
    return new Set(Object.keys(window.sessionStorage).filter((key) => key.startsWith(prefix)));
  } catch {
    return new Set();
  }
}

export function readUserToggleRecovery(actorId: number): StoredUserToggleRecovery | null {
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

export function persistUserToggleRecovery(recovery: StoredUserToggleRecovery) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存启停请求编号');
  persistVerifiedUserRecovery(window.sessionStorage, userToggleRecoveryStorageKey(recovery.actorId), recovery);
}

export function clearUserToggleRecovery(actorId: number | null | undefined) {
  if (typeof window === 'undefined' || !actorId) return;
  try {
    window.sessionStorage.removeItem(userToggleRecoveryStorageKey(actorId));
  } catch {
    // A stale marker is safe because request-status lookup is read-only and actor-scoped.
  }
}

export function recoveredUserFromEdit(recovery: StoredUserEditRecovery): User {
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

export function recoveredUserFromDelete(recovery: StoredUserDeleteRecovery): User {
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

export function recoveredUserFromToggle(recovery: StoredUserToggleRecovery): User {
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
