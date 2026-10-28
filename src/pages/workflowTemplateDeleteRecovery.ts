import type { SessionStorageLike } from './workflowTemplateUpdateRecovery';

export const WORKFLOW_TEMPLATE_DELETE_RECOVERY_VERSION = 1 as const;

export interface WorkflowTemplateDeleteRecovery {
  version: typeof WORKFLOW_TEMPLATE_DELETE_RECOVERY_VERSION;
  actorId: number;
  templateId: number;
  name: string;
}

export type WorkflowTemplateDeleteRecoveryRead = WorkflowTemplateDeleteRecovery | 'invalid' | null;

export function workflowTemplateDeleteRecoveryStorageKey(actorId: number) {
  return `xmt:workflow-template-delete-pending:v${WORKFLOW_TEMPLATE_DELETE_RECOVERY_VERSION}:actor:${actorId}`;
}

export function sameWorkflowTemplateDeleteRecovery(
  current: WorkflowTemplateDeleteRecovery | null | undefined,
  expected: WorkflowTemplateDeleteRecovery,
) {
  return Boolean(current)
    && current!.version === expected.version
    && current!.actorId === expected.actorId
    && current!.templateId === expected.templateId
    && current!.name === expected.name;
}

export function readWorkflowTemplateDeleteRecovery(
  storage: SessionStorageLike | null | undefined,
  actorId: number | null | undefined,
): WorkflowTemplateDeleteRecoveryRead {
  if (!Number.isSafeInteger(actorId) || Number(actorId) <= 0) return null;
  if (!storage) return 'invalid';
  try {
    const raw = storage.getItem(workflowTemplateDeleteRecoveryStorageKey(Number(actorId)));
    if (!raw) return null;
    if (raw.length > 1_000) return 'invalid';
    const value = JSON.parse(raw) as Partial<WorkflowTemplateDeleteRecovery> | null;
    if (!value
      || value.version !== WORKFLOW_TEMPLATE_DELETE_RECOVERY_VERSION
      || value.actorId !== actorId
      || !Number.isSafeInteger(value.templateId) || Number(value.templateId) <= 0
      || typeof value.name !== 'string' || value.name.length === 0 || value.name.length > 200) return 'invalid';
    return {
      version: WORKFLOW_TEMPLATE_DELETE_RECOVERY_VERSION,
      actorId: Number(actorId),
      templateId: Number(value.templateId),
      name: value.name,
    };
  } catch {
    return 'invalid';
  }
}

export function persistWorkflowTemplateDeleteRecovery(
  storage: SessionStorageLike | null | undefined,
  recovery: WorkflowTemplateDeleteRecovery,
) {
  if (!storage) throw new Error('当前环境无法安全保存删除恢复记录');
  const existing = readWorkflowTemplateDeleteRecovery(storage, recovery.actorId);
  if (existing === 'invalid' || (existing && !sameWorkflowTemplateDeleteRecovery(existing, recovery))) {
    throw new Error('存在其他删除恢复记录，当前操作保持锁定');
  }
  const key = workflowTemplateDeleteRecoveryStorageKey(recovery.actorId);
  storage.setItem(key, JSON.stringify(recovery));
  const stored = readWorkflowTemplateDeleteRecovery(storage, recovery.actorId);
  if (!stored || stored === 'invalid' || !sameWorkflowTemplateDeleteRecovery(stored, recovery)) {
    throw new Error('删除恢复记录未能完整保存');
  }
}

export function removeWorkflowTemplateDeleteRecovery(
  storage: SessionStorageLike | null | undefined,
  recovery: WorkflowTemplateDeleteRecovery,
) {
  if (!storage) return false;
  try {
    const key = workflowTemplateDeleteRecoveryStorageKey(recovery.actorId);
    const stored = readWorkflowTemplateDeleteRecovery(storage, recovery.actorId);
    if (!stored) return storage.getItem(key) === null;
    if (stored === 'invalid' || !sameWorkflowTemplateDeleteRecovery(stored, recovery)) return false;
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}
