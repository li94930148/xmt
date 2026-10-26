export const WORKFLOW_TEMPLATE_UPDATE_RECOVERY_VERSION = 1 as const;
export const WORKFLOW_TEMPLATE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKFLOW_TEMPLATE_UPDATE_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/i;

export interface WorkflowTemplateUpdatePayload {
  name: string;
  description: string;
  nodes: Array<{
    id?: number;
    name: string;
    node_order: number;
    status_from: string;
    status_to: string;
    approver_type: 'role' | 'user' | 'creator';
    approver_value: string;
    is_required: boolean;
  }>;
}

export interface WorkflowTemplateUpdateRecovery {
  version: typeof WORKFLOW_TEMPLATE_UPDATE_RECOVERY_VERSION;
  actorId: number;
  templateId: number;
  requestId: string;
  requestFingerprint: string;
  baseFingerprint: string;
  payload: WorkflowTemplateUpdatePayload;
  basePayload: WorkflowTemplateUpdatePayload;
  rejected: boolean;
}

export type WorkflowTemplateUpdateRecoveryRead = WorkflowTemplateUpdateRecovery | 'invalid' | null;

export function sameWorkflowTemplateUpdateRecovery(
  current: WorkflowTemplateUpdateRecovery | null | undefined,
  expected: WorkflowTemplateUpdateRecovery,
) {
  return Boolean(current)
    && current!.version === expected.version
    && current!.actorId === expected.actorId
    && current!.templateId === expected.templateId
    && current!.requestId === expected.requestId
    && current!.requestFingerprint === expected.requestFingerprint
    && current!.baseFingerprint === expected.baseFingerprint
    && JSON.stringify(current!.payload) === JSON.stringify(expected.payload)
    && JSON.stringify(current!.basePayload) === JSON.stringify(expected.basePayload)
    && current!.rejected === expected.rejected;
}

function sameWorkflowTemplateUpdateIdentity(
  current: WorkflowTemplateUpdateRecovery,
  expected: WorkflowTemplateUpdateRecovery,
) {
  return current.version === expected.version
    && current.actorId === expected.actorId
    && current.templateId === expected.templateId
    && current.requestId === expected.requestId
    && current.requestFingerprint === expected.requestFingerprint
    && current.baseFingerprint === expected.baseFingerprint
    && JSON.stringify(current.payload) === JSON.stringify(expected.payload)
    && JSON.stringify(current.basePayload) === JSON.stringify(expected.basePayload);
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function workflowTemplateUpdateRecoveryStorageKey(actorId: number) {
  return `xmt:workflow-template-update-pending:v${WORKFLOW_TEMPLATE_UPDATE_RECOVERY_VERSION}:actor:${actorId}`;
}

export function workflowTemplateUpdateRejectedRecoveryStorageKey(actorId: number) {
  return `xmt:workflow-template-update-rejected:v${WORKFLOW_TEMPLATE_UPDATE_RECOVERY_VERSION}:actor:${actorId}`;
}

export function isWorkflowTemplateUpdatePayload(value: unknown): value is WorkflowTemplateUpdatePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.name === 'string'
    && typeof payload.description === 'string'
    && Array.isArray(payload.nodes)
    && payload.nodes.every((node) => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
      const item = node as Record<string, unknown>;
      return typeof item.name === 'string'
        && Number.isSafeInteger(item.node_order)
        && typeof item.status_from === 'string'
        && typeof item.status_to === 'string'
        && ['role', 'user', 'creator'].includes(String(item.approver_type))
        && typeof item.approver_value === 'string'
        && typeof item.is_required === 'boolean'
        && (item.id === undefined || (Number.isSafeInteger(item.id) && Number(item.id) > 0));
    });
}

export function readWorkflowTemplateUpdateRecovery(
  storage: SessionStorageLike | null | undefined,
  actorId: number | null | undefined,
  rejectedStorage?: SessionStorageLike | null,
): WorkflowTemplateUpdateRecoveryRead {
  if (!Number.isSafeInteger(actorId) || Number(actorId) <= 0) return null;
  try {
    const sessionRecovery = readStoredRecovery(storage, workflowTemplateUpdateRecoveryStorageKey(Number(actorId)), Number(actorId));
    const rejectedRecovery = readStoredRecovery(rejectedStorage, workflowTemplateUpdateRejectedRecoveryStorageKey(Number(actorId)), Number(actorId));
    if (sessionRecovery === 'invalid' || rejectedRecovery === 'invalid') return 'invalid';
    if (!rejectedRecovery) return sessionRecovery;
    if (!rejectedRecovery.rejected) return 'invalid';
    if (!sessionRecovery) return rejectedRecovery;
    if (!sameWorkflowTemplateUpdateIdentity(sessionRecovery, rejectedRecovery)) return 'invalid';
    return rejectedRecovery;
  } catch {
    return 'invalid';
  }
}

function readStoredRecovery(
  storage: SessionStorageLike | null | undefined,
  key: string,
  actorId: number,
): WorkflowTemplateUpdateRecoveryRead {
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  if (raw.length > 400_000) return 'invalid';
  const value = JSON.parse(raw) as Partial<WorkflowTemplateUpdateRecovery> | null;
  if (!value || value.version !== WORKFLOW_TEMPLATE_UPDATE_RECOVERY_VERSION
    || value.actorId !== actorId
    || !Number.isSafeInteger(value.templateId) || Number(value.templateId) <= 0
    || typeof value.requestId !== 'string' || !WORKFLOW_TEMPLATE_REQUEST_ID_PATTERN.test(value.requestId)
    || typeof value.requestFingerprint !== 'string' || !WORKFLOW_TEMPLATE_UPDATE_FINGERPRINT_PATTERN.test(value.requestFingerprint)
    || typeof value.baseFingerprint !== 'string' || !WORKFLOW_TEMPLATE_UPDATE_FINGERPRINT_PATTERN.test(value.baseFingerprint)
    || !isWorkflowTemplateUpdatePayload(value.payload)
    || !isWorkflowTemplateUpdatePayload(value.basePayload)
    || (value.rejected !== undefined && typeof value.rejected !== 'boolean')) return 'invalid';
  return {
    version: WORKFLOW_TEMPLATE_UPDATE_RECOVERY_VERSION,
    actorId,
    templateId: Number(value.templateId),
    requestId: value.requestId.toLowerCase(),
    requestFingerprint: value.requestFingerprint.toLowerCase(),
    baseFingerprint: value.baseFingerprint.toLowerCase(),
    payload: value.payload,
    basePayload: value.basePayload,
    rejected: value.rejected === true,
  };
}

export function persistWorkflowTemplateUpdateRecovery(
  storage: SessionStorageLike | null | undefined,
  rejectedStorage: SessionStorageLike | null | undefined,
  recovery: WorkflowTemplateUpdateRecovery,
) {
  if (!storage) throw new Error('当前环境无法安全保存更新请求');
  const existing = readWorkflowTemplateUpdateRecovery(storage, recovery.actorId, rejectedStorage);
  if (existing === 'invalid' || (existing && !sameWorkflowTemplateUpdateRecovery(existing, recovery))) {
    throw new Error('存在其他更新恢复记录，当前操作保持锁定');
  }
  const key = workflowTemplateUpdateRecoveryStorageKey(recovery.actorId);
  storage.setItem(key, JSON.stringify(recovery));
  const stored = readWorkflowTemplateUpdateRecovery(storage, recovery.actorId, rejectedStorage);
  if (!stored || stored === 'invalid'
    || stored.requestId !== recovery.requestId
    || stored.templateId !== recovery.templateId
    || stored.requestFingerprint !== recovery.requestFingerprint
    || stored.baseFingerprint !== recovery.baseFingerprint
    || JSON.stringify(stored.payload) !== JSON.stringify(recovery.payload)
    || JSON.stringify(stored.basePayload) !== JSON.stringify(recovery.basePayload)
    || stored.rejected !== recovery.rejected) {
    throw new Error('更新请求恢复状态未能完整保存');
  }
}

export function removeWorkflowTemplateUpdateRecovery(
  storage: SessionStorageLike | null | undefined,
  rejectedStorage: SessionStorageLike | null | undefined,
  recovery: WorkflowTemplateUpdateRecovery,
) {
  if (!storage && !rejectedStorage) return false;
  try {
    const stored = readWorkflowTemplateUpdateRecovery(storage, recovery.actorId, rejectedStorage);
    const sessionKey = workflowTemplateUpdateRecoveryStorageKey(recovery.actorId);
    const rejectedKey = workflowTemplateUpdateRejectedRecoveryStorageKey(recovery.actorId);
    if (!stored) return (!storage || storage.getItem(sessionKey) === null)
      && (!rejectedStorage || rejectedStorage.getItem(rejectedKey) === null);
    if (stored === 'invalid' || !sameWorkflowTemplateUpdateRecovery(stored, recovery)) return false;
    if (storage && storage.getItem(sessionKey) !== null) {
      storage.removeItem(sessionKey);
      if (storage.getItem(sessionKey) !== null) return false;
    }
    if (rejectedStorage && rejectedStorage.getItem(rejectedKey) !== null) {
      rejectedStorage.removeItem(rejectedKey);
      if (rejectedStorage.getItem(rejectedKey) !== null) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function markWorkflowTemplateUpdateRecoveryRejected(
  storage: SessionStorageLike | null | undefined,
  rejectedStorage: SessionStorageLike | null | undefined,
  recovery: WorkflowTemplateUpdateRecovery,
): WorkflowTemplateUpdateRecovery | null {
  if (!storage && !rejectedStorage) return null;
  try {
    const current = readWorkflowTemplateUpdateRecovery(storage, recovery.actorId, rejectedStorage);
    if (!current || current === 'invalid' || !sameWorkflowTemplateUpdateRecovery(current, recovery)) return null;
    const rejectedRecovery = { ...recovery, rejected: true };
    let persisted = false;
    if (rejectedStorage) {
      try {
        const fallbackKey = workflowTemplateUpdateRejectedRecoveryStorageKey(recovery.actorId);
        rejectedStorage.setItem(fallbackKey, JSON.stringify(rejectedRecovery));
        const fallback = readStoredRecovery(rejectedStorage, fallbackKey, recovery.actorId);
        persisted = Boolean(fallback && fallback !== 'invalid' && sameWorkflowTemplateUpdateRecovery(fallback, rejectedRecovery));
      } catch {
        // Try the session marker as a second independent way to preserve the rejection.
      }
    }
    if (storage) {
      try {
        const sessionKey = workflowTemplateUpdateRecoveryStorageKey(recovery.actorId);
        storage.setItem(sessionKey, JSON.stringify(rejectedRecovery));
        const session = readStoredRecovery(storage, sessionKey, recovery.actorId);
        persisted = persisted || Boolean(session && session !== 'invalid' && sameWorkflowTemplateUpdateRecovery(session, rejectedRecovery));
      } catch {
        // The independent rejected marker remains sufficient to block a retry after reload.
      }
    }
    if (!persisted) return null;
    const stored = readWorkflowTemplateUpdateRecovery(storage, recovery.actorId, rejectedStorage);
    return stored && stored !== 'invalid' && sameWorkflowTemplateUpdateRecovery(stored, rejectedRecovery)
      ? rejectedRecovery
      : null;
  } catch {
    return null;
  }
}

export async function createWorkflowTemplateUpdateFingerprint(
  payload: WorkflowTemplateUpdatePayload,
  cryptoApi: Pick<Crypto, 'subtle'> | null | undefined,
) {
  if (!cryptoApi?.subtle) throw new Error('当前浏览器无法安全核实更新内容');
  const normalizedNodes = payload.nodes.map((node) => [
    node.name,
    node.status_from,
    node.status_to,
    node.approver_type || 'role',
    node.approver_value || '',
    node.is_required !== false,
  ]);
  const serializedPayload = JSON.stringify([
    payload.name,
    payload.description || '',
    normalizedNodes,
  ]);
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(serializedPayload));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function createWorkflowTemplateUpdateRequestFingerprint(
  payload: WorkflowTemplateUpdatePayload,
  baseFingerprint: string,
  cryptoApi: Pick<Crypto, 'subtle'> | null | undefined,
) {
  if (!WORKFLOW_TEMPLATE_UPDATE_FINGERPRINT_PATTERN.test(baseFingerprint)) {
    throw new Error('原模板快照指纹无效');
  }
  const payloadFingerprint = await createWorkflowTemplateUpdateFingerprint(payload, cryptoApi);
  if (!cryptoApi?.subtle) throw new Error('当前浏览器无法安全核实更新内容');
  const digest = await cryptoApi.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([baseFingerprint.toLowerCase(), payloadFingerprint])),
  );
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
