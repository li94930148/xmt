import type { Message } from '../../types';

export const MESSAGE_PAGE_SIZE = 20;
export const MESSAGE_CLEAR_RECOVERY_VERSION = 1;
export const MESSAGE_CLEAR_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MESSAGE_READ_ALL_RECOVERY_VERSION = 1;
export const MESSAGE_READ_ALL_REQUEST_ID_PATTERN = MESSAGE_CLEAR_REQUEST_ID_PATTERN;

export interface StoredMessageClearRecovery {
  version: 1;
  actorId: number;
  requestId: string;
}

export type MessageClearRecoveryState = 'checking' | 'not_found' | 'unavailable' | 'submitting' | null;

export interface StoredMessageReadAllRecovery {
  actorId: number;
  requestId: string;
}

export type MessageReadAllRecoveryState = 'checking' | 'not_found' | 'unavailable' | 'submitting' | null;

export interface PendingSingleMessageReadVerification {
  message: Message;
  error: string;
}

export type MessageReadAllRecoveryRead =
  | { recovery: StoredMessageReadAllRecovery | null; error: null }
  | { recovery: null; error: string };

export function messageClearRecoveryStorageKey(actorId: number) {
  return `xmt:message-clear-pending:v${MESSAGE_CLEAR_RECOVERY_VERSION}:actor:${actorId}`;
}

export function readMessageClearRecovery(actorId: number | null | undefined): StoredMessageClearRecovery | null {
  if (typeof window === 'undefined' || !actorId) return null;
  try {
    const raw = window.sessionStorage.getItem(messageClearRecoveryStorageKey(actorId));
    if (!raw || raw.length > 2_048) return null;
    const value = JSON.parse(raw) as Partial<StoredMessageClearRecovery> | null;
    if (!value || value.version !== MESSAGE_CLEAR_RECOVERY_VERSION || value.actorId !== actorId
      || typeof value.requestId !== 'string' || !MESSAGE_CLEAR_REQUEST_ID_PATTERN.test(value.requestId)) return null;
    return { version: MESSAGE_CLEAR_RECOVERY_VERSION, actorId, requestId: value.requestId.toLowerCase() };
  } catch {
    return null;
  }
}

export function persistMessageClearRecovery(recovery: StoredMessageClearRecovery) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存清空请求编号');
  const key = messageClearRecoveryStorageKey(recovery.actorId);
  const serialized = JSON.stringify(recovery);
  window.sessionStorage.setItem(key, serialized);
  if (window.sessionStorage.getItem(key) !== serialized) {
    throw new Error('无法安全保存清空请求编号；请检查浏览器存储后重试');
  }
}

export function removeMessageClearRecovery(actorId: number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(messageClearRecoveryStorageKey(actorId));
  } catch {
    // A stale marker is safe: recovery only performs an actor-scoped status read.
  }
}

export function createMessageClearRequestId() {
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues) {
    throw new Error('当前浏览器无法生成安全的清空请求编号');
  }
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export function messageReadAllRecoveryStorageKey(actorId: number) {
  return `xmt:message-read-all-pending:v${MESSAGE_READ_ALL_RECOVERY_VERSION}:actor:${actorId}`;
}

export function readMessageReadAllRecovery(actorId: number | null | undefined): MessageReadAllRecoveryRead {
  if (typeof window === 'undefined' || !Number.isSafeInteger(actorId) || !actorId) return { recovery: null, error: null };
  try {
    const raw = window.sessionStorage.getItem(messageReadAllRecoveryStorageKey(actorId));
    if (!raw) return { recovery: null, error: null };
    if (raw.length > 2_048) throw new Error('恢复标记超出允许大小');
    const value = JSON.parse(raw) as Partial<StoredMessageReadAllRecovery> | null;
    if (!value || value.actorId !== actorId || typeof value.requestId !== 'string'
      || !MESSAGE_READ_ALL_REQUEST_ID_PATTERN.test(value.requestId)) {
      throw new Error('恢复标记格式无法确认');
    }
    return { recovery: { actorId, requestId: value.requestId.toLowerCase() }, error: null };
  } catch {
    return { recovery: null, error: '无法安全读取批量已读恢复标记；核实前不会再次提交。请重试只读检查。' };
  }
}

export function persistMessageReadAllRecovery(recovery: StoredMessageReadAllRecovery) {
  if (typeof window === 'undefined') throw new Error('当前环境无法安全保存批量已读请求编号');
  try {
    const key = messageReadAllRecoveryStorageKey(recovery.actorId);
    const serialized = JSON.stringify(recovery);
    window.sessionStorage.setItem(key, serialized);
    if (window.sessionStorage.getItem(key) !== serialized) throw new Error('恢复编号未能完整保存');
  } catch {
    throw new Error('当前浏览器无法安全保存批量已读请求编号');
  }
}

export function removeMessageReadAllRecovery(actorId: number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(messageReadAllRecoveryStorageKey(actorId));
  } catch {
    // A stale marker is safe: the next visit only performs an actor-scoped status read.
  }
}

export function createMessageReadAllRequestId() {
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues) {
    throw new Error('当前浏览器无法生成安全的批量已读请求编号');
  }
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}
