import type { LibraryType } from '../api/resourceCenter';
import { resourceCategoryMutationCanonicalRequest, type ResourceCategoryMutationOperation } from '../../shared/resource-category-mutation';

export const RESOURCE_CATEGORY_MUTATION_RECOVERY_VERSION = 1;
export const RESOURCE_CATEGORY_MUTATION_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResourceCategoryMutationPayload = { name: string; parent_id: number | null } | Record<string, never>;
export type ResourceCategoryMutationRecovery = {
  version: 1;
  actorId: number;
  libraryType: LibraryType;
  operation: ResourceCategoryMutationOperation;
  categoryId: number | null;
  requestId: string;
  fingerprint: string;
  payload: ResourceCategoryMutationPayload;
  rejectionStatus?: number;
};

export type ResourceCategoryMutationRecoveryRead =
  | { state: 'none' }
  | { state: 'valid'; recovery: ResourceCategoryMutationRecovery }
  | { state: 'invalid' }
  | { state: 'unavailable' };

const libraryTypes = new Set<LibraryType>(['project', 'content_archive', 'knowledge', 'media']);
const stableRejectionStatuses = new Set([400, 401, 403, 404, 409, 422]);

export function resourceCategoryMutationRecoveryKey(actorId: number) {
  return `xmt:resource-category-mutation-pending:v${RESOURCE_CATEGORY_MUTATION_RECOVERY_VERSION}:actor:${actorId}`;
}

function sessionStorageOrNull(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage; } catch { return null; }
}

function localStorageOrNull(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

function fallbackKey(actorId: number) {
  return `${resourceCategoryMutationRecoveryKey(actorId)}:rejection-fallback`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function normalizeResourceCategoryMutationRecovery(value: unknown, expectedActorId: number): ResourceCategoryMutationRecovery | null {
  if (!isRecord(value)
    || value.version !== RESOURCE_CATEGORY_MUTATION_RECOVERY_VERSION
    || value.actorId !== expectedActorId
    || !Number.isSafeInteger(expectedActorId) || expectedActorId <= 0
    || typeof value.libraryType !== 'string' || !libraryTypes.has(value.libraryType as LibraryType)
    || (value.operation !== 'create' && value.operation !== 'update' && value.operation !== 'delete')
    || typeof value.requestId !== 'string' || !RESOURCE_CATEGORY_MUTATION_REQUEST_ID_PATTERN.test(value.requestId)
    || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)
    || !(value.categoryId === null || (Number.isSafeInteger(value.categoryId) && Number(value.categoryId) > 0))) return null;

  let payload: ResourceCategoryMutationPayload;
  if (value.operation === 'delete') {
    if (!isRecord(value.payload) || Object.keys(value.payload).length !== 0 || value.categoryId === null) return null;
    payload = {};
  } else {
    if (!isRecord(value.payload)
      || typeof value.payload.name !== 'string' || !value.payload.name.trim() || value.payload.name.length > 100
      || !(value.payload.parent_id === null || (Number.isSafeInteger(value.payload.parent_id) && Number(value.payload.parent_id) > 0))
      || (value.operation === 'create' ? value.categoryId !== null : value.categoryId === null)) return null;
    payload = { name: value.payload.name, parent_id: value.payload.parent_id as number | null };
  }

  const recovery: ResourceCategoryMutationRecovery = {
    version: 1,
    actorId: expectedActorId,
    libraryType: value.libraryType as LibraryType,
    operation: value.operation,
    categoryId: value.categoryId as number | null,
    requestId: value.requestId.toLowerCase(),
    fingerprint: value.fingerprint,
    payload,
  };
  if (value.rejectionStatus !== undefined) {
    const rejectionStatus = Number(value.rejectionStatus);
    if (!stableRejectionStatuses.has(rejectionStatus)) return null;
    recovery.rejectionStatus = rejectionStatus;
  }
  return recovery;
}

export function readResourceCategoryMutationRecovery(
  actorId: number,
  storage: Storage | null = sessionStorageOrNull(),
  fallbackStorage: Storage | null = localStorageOrNull(),
): ResourceCategoryMutationRecoveryRead {
  if (!storage || !fallbackStorage) return { state: 'unavailable' };
  let primary: ResourceCategoryMutationRecovery | null = null;
  let fallback: ResourceCategoryMutationRecovery | null = null;
  try {
    const primaryRaw = storage.getItem(resourceCategoryMutationRecoveryKey(actorId));
    if (primaryRaw) {
      primary = normalizeResourceCategoryMutationRecovery(JSON.parse(primaryRaw), actorId);
      if (!primary) return { state: 'invalid' };
    }
    const fallbackRaw = fallbackStorage.getItem(fallbackKey(actorId));
    if (fallbackRaw) {
      fallback = normalizeResourceCategoryMutationRecovery(JSON.parse(fallbackRaw), actorId);
      if (!fallback?.rejectionStatus) return { state: 'invalid' };
    }
  } catch {
    return { state: 'unavailable' };
  }
  if (!primary && !fallback) return { state: 'none' };
  if (!primary && fallback) return { state: 'valid', recovery: fallback };
  if (primary && !fallback) return { state: 'valid', recovery: primary };
  if (!primary || !fallback) return { state: 'invalid' };
  if (primary.requestId !== fallback.requestId
    || primary.operation !== fallback.operation
    || primary.libraryType !== fallback.libraryType
    || primary.categoryId !== fallback.categoryId
    || primary.fingerprint !== fallback.fingerprint
    || JSON.stringify(primary.payload) !== JSON.stringify(fallback.payload)) return { state: 'invalid' };
  return { state: 'valid', recovery: { ...primary, rejectionStatus: fallback.rejectionStatus } };
}

export function persistResourceCategoryMutationRecovery(
  recovery: ResourceCategoryMutationRecovery,
  storage: Storage | null = sessionStorageOrNull(),
  fallbackStorage: Storage | null = localStorageOrNull(),
) {
  if (!storage) throw new Error('当前浏览器无法保存分类操作恢复信息；本次未提交修改。');
  const normalized = normalizeResourceCategoryMutationRecovery(recovery, recovery.actorId);
  if (!normalized) throw new Error('分类操作恢复信息无效；本次未提交修改。');
  const existing = readResourceCategoryMutationRecovery(recovery.actorId, storage, fallbackStorage);
  if (existing.state === 'unavailable' || existing.state === 'invalid') throw new Error('已有分类操作恢复信息无法安全读取；本次未提交修改。');
  if (existing.state === 'valid' && existing.recovery.requestId !== recovery.requestId) {
    throw new Error('已有分类操作结果尚未核实；请先完成只读核实。');
  }
  const key = resourceCategoryMutationRecoveryKey(recovery.actorId);
  const serialized = JSON.stringify(normalized);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('分类操作恢复信息未能可靠保存；本次未提交修改。');
}

export function persistResourceCategoryMutationRejection(
  recovery: ResourceCategoryMutationRecovery,
  storage: Storage | null = sessionStorageOrNull(),
  fallbackStorage: Storage | null = localStorageOrNull(),
) {
  if (recovery.rejectionStatus === undefined) return false;
  try {
    persistResourceCategoryMutationRecovery(recovery, storage, fallbackStorage);
    return true;
  } catch {
    if (!fallbackStorage) return false;
    try {
      const normalized = normalizeResourceCategoryMutationRecovery(recovery, recovery.actorId);
      if (!normalized || normalized.rejectionStatus === undefined) return false;
      const key = fallbackKey(recovery.actorId);
      const serialized = JSON.stringify(normalized);
      fallbackStorage.setItem(key, serialized);
      return fallbackStorage.getItem(key) === serialized;
    } catch {
      return false;
    }
  }
}

export function clearResourceCategoryMutationRecovery(
  actorId: number,
  requestId: string,
  storage: Storage | null = sessionStorageOrNull(),
  fallbackStorage: Storage | null = localStorageOrNull(),
) {
  if (!storage || !fallbackStorage) return false;
  try {
    const key = resourceCategoryMutationRecoveryKey(actorId);
    const raw = storage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const current = normalizeResourceCategoryMutationRecovery(parsed, actorId);
      if (current?.requestId !== requestId) return false;
      storage.removeItem(key);
    }
    const fallback = fallbackStorage.getItem(fallbackKey(actorId));
    if (fallback) {
      const current = normalizeResourceCategoryMutationRecovery(JSON.parse(fallback), actorId);
      if (current?.requestId !== requestId || current.rejectionStatus === undefined) return false;
      fallbackStorage.removeItem(fallbackKey(actorId));
    }
    return storage.getItem(key) === null && fallbackStorage.getItem(fallbackKey(actorId)) === null;
  } catch {
    return false;
  }
}

export async function createResourceCategoryMutationFingerprint(
  operation: ResourceCategoryMutationOperation,
  libraryType: LibraryType,
  categoryId: number | null,
  payload: Record<string, unknown>,
) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
    throw new Error('当前浏览器无法生成安全的分类操作校验值；本次未提交修改。');
  }
  const material = resourceCategoryMutationCanonicalRequest(operation, libraryType, categoryId, payload);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createResourceCategoryMutationRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new Error('当前浏览器不支持安全的分类操作请求编号；本次未提交修改。');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
