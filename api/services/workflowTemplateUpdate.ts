import { createHash } from 'node:crypto';
import { queryOne, runInTransaction, type TransactionContext } from '../database/utils';

export type WorkflowTemplateUpdateNode = {
  name: string;
  status_from: string;
  status_to: string;
  approver_type?: string;
  approver_value?: string;
  is_required?: boolean;
};

export type WorkflowTemplateUpdatePayload = {
  name: string;
  description: string;
  nodes: WorkflowTemplateUpdateNode[];
};

export type WorkflowTemplateSnapshot = {
  name: string;
  description?: string | null;
  nodes: Array<{
    name: string;
    status_from: string;
    status_to: string;
    approver_type?: string | null;
    approver_value?: string | null;
    is_required?: boolean | number | null;
  }>;
};

export class WorkflowTemplateUpdateRequestConflictError extends Error {
  constructor() {
    super('WORKFLOW_TEMPLATE_UPDATE_REQUEST_CONFLICT');
    this.name = 'WorkflowTemplateUpdateRequestConflictError';
  }
}

export class WorkflowTemplateUpdateTargetMissingError extends Error {
  constructor() {
    super('WORKFLOW_TEMPLATE_UPDATE_TARGET_MISSING');
    this.name = 'WorkflowTemplateUpdateTargetMissingError';
  }
}

export class WorkflowTemplateUpdateBaseConflictError extends Error {
  readonly currentFingerprint: string;

  constructor(currentFingerprint: string) {
    super('WORKFLOW_TEMPLATE_UPDATE_BASE_CONFLICT');
    this.name = 'WorkflowTemplateUpdateBaseConflictError';
    this.currentFingerprint = currentFingerprint;
  }
}

export function createWorkflowTemplateUpdateFingerprint(payload: WorkflowTemplateUpdatePayload) {
  const normalizedNodes = payload.nodes.map((node) => [
    node.name,
    node.status_from,
    node.status_to,
    node.approver_type || 'role',
    node.approver_value || '',
    node.is_required !== false,
  ]);
  return createHash('sha256').update(JSON.stringify([
    payload.name,
    payload.description || '',
    normalizedNodes,
  ])).digest('hex');
}

export function createWorkflowTemplateBaseFingerprint(snapshot: WorkflowTemplateSnapshot) {
  return createWorkflowTemplateUpdateFingerprint({
    name: snapshot.name,
    description: snapshot.description || '',
    nodes: snapshot.nodes.map((node) => ({
      name: node.name,
      status_from: node.status_from,
      status_to: node.status_to,
      approver_type: node.approver_type || 'role',
      approver_value: node.approver_value || '',
      is_required: Boolean(node.is_required),
    })),
  });
}

export function createWorkflowTemplateUpdateRequestFingerprint(payload: WorkflowTemplateUpdatePayload, baseFingerprint: string) {
  const payloadFingerprint = createWorkflowTemplateUpdateFingerprint(payload);
  return createHash('sha256').update(JSON.stringify([
    baseFingerprint.toLowerCase(),
    payloadFingerprint,
  ])).digest('hex');
}

function isSqliteBusy(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; rawCode?: unknown; cause?: unknown };
    if (candidate.code === 'SQLITE_BUSY' || Number(candidate.rawCode) === 5) return true;
    current = candidate.cause;
  }
  return false;
}

async function runWorkflowTemplateUpdateTransaction<T>(callback: (tx: TransactionContext) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runInTransaction(callback);
    } catch (error) {
      if (!isSqliteBusy(error) || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt));
    }
  }
}

export async function updateWorkflowTemplateWithRequest(
  templateId: number,
  actorId: number,
  payload: WorkflowTemplateUpdatePayload,
  clientRequestId: string,
  baseFingerprint: string,
): Promise<{ templateId: number; replayed: boolean }> {
  const normalizedRequestId = clientRequestId.trim().toLowerCase();
  const normalizedBaseFingerprint = baseFingerprint.trim().toLowerCase();
  const requestFingerprint = createWorkflowTemplateUpdateRequestFingerprint(payload, normalizedBaseFingerprint);
  return runWorkflowTemplateUpdateTransaction(async (tx) => {
    const existing = await tx.queryOne<{
      actor_id: number;
      template_id: number;
      request_fingerprint: string;
    }>(
      `SELECT actor_id,template_id,request_fingerprint
       FROM workflow_template_update_request_keys WHERE client_request_id=?`,
      [normalizedRequestId],
    );
    if (existing) {
      if (Number(existing.actor_id) !== actorId
        || Number(existing.template_id) !== templateId
        || existing.request_fingerprint !== requestFingerprint) {
        throw new WorkflowTemplateUpdateRequestConflictError();
      }
      return { templateId: Number(existing.template_id), replayed: true };
    }

    const template = await tx.queryOne<{ id: number; name: string; description: string | null }>(
      'SELECT id,name,description FROM workflow_templates WHERE id=?', [templateId],
    );
    if (!template) throw new WorkflowTemplateUpdateTargetMissingError();
    const currentNodes = await tx.queryAll<{
      name: string;
      status_from: string;
      status_to: string;
      approver_type: string | null;
      approver_value: string | null;
      is_required: boolean | number | null;
    }>(
      `SELECT name,status_from,status_to,approver_type,approver_value,is_required
       FROM workflow_nodes WHERE template_id=? ORDER BY node_order,id`,
      [templateId],
    );
    const currentFingerprint = createWorkflowTemplateBaseFingerprint({
      name: template.name,
      description: template.description,
      nodes: currentNodes,
    });
    if (currentFingerprint !== normalizedBaseFingerprint) {
      throw new WorkflowTemplateUpdateBaseConflictError(currentFingerprint);
    }

    await tx.execute(
      `UPDATE workflow_templates SET name=?,description=?,updated_at=datetime('now', '+8 hours') WHERE id=?`,
      [payload.name, payload.description || '', templateId],
    );
    await tx.execute('DELETE FROM workflow_nodes WHERE template_id=?', [templateId]);
    for (let index = 0; index < payload.nodes.length; index += 1) {
      const node = payload.nodes[index];
      await tx.execute(
        `INSERT INTO workflow_nodes
          (template_id,name,node_order,status_from,status_to,approver_type,approver_value,is_required)
         VALUES(?,?,?,?,?,?,?,?)`,
        [templateId, node.name, index + 1, node.status_from, node.status_to,
          node.approver_type || 'role', node.approver_value || '', node.is_required !== false ? 1 : 0],
      );
    }
    await tx.execute(
      `INSERT INTO workflow_template_update_request_keys
        (client_request_id,actor_id,template_id,request_fingerprint,created_at)
       VALUES(?,?,?,?,datetime('now', '+8 hours'))`,
      [normalizedRequestId, actorId, templateId, requestFingerprint],
    );
    return { templateId, replayed: false };
  });
}

export async function getWorkflowTemplateUpdateRequestStatus(
  actorId: number,
  templateId: number,
  clientRequestId: string,
  fingerprint: string,
) {
  const request = await queryOne<{ template_id: number; actor_id: number; request_fingerprint: string }>(
    `SELECT template_id,actor_id,request_fingerprint FROM workflow_template_update_request_keys WHERE client_request_id=?`,
    [clientRequestId.trim().toLowerCase()],
  );
  if (!request || Number(request.actor_id) !== actorId || Number(request.template_id) !== templateId) {
    return { state: 'not_found' as const };
  }
  if (request.request_fingerprint !== fingerprint.toLowerCase()) {
    throw new WorkflowTemplateUpdateRequestConflictError();
  }
  return { state: 'updated' as const, templateId: Number(request.template_id) };
}
