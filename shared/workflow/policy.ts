export const WORKFLOW_ENGINE_MODE = 'v2_strict' as const;

export type WorkflowEngineMode = typeof WORKFLOW_ENGINE_MODE;

export interface WorkflowPolicyResult {
  allowed: boolean;
  reason: string;
}

export interface WorkflowPolicyUser {
  id?: number;
  role?: string;
}

export interface WorkflowPolicyNode {
  id?: number | string;
  template_id?: number | string | null;
  status_from?: string | null;
  status_to?: string | null;
  approver_type?: string | null;
  approver_value?: string | null;
  is_required?: boolean | number | null;
}

export interface WorkflowPolicyTopic {
  id?: number | string;
  status?: string | null;
  creator_id?: number | null;
  assignee_id?: number | null;
  workflow_template_id?: number | null;
}

export interface WorkflowPolicyContext {
  source?: 'designer' | 'runtime' | 'manual';
  topic?: WorkflowPolicyTopic | null;
  node?: WorkflowPolicyNode | null;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['approved', 'rejected'],
  approved: ['production'],
  rejected: ['pending'],
  production: ['shooting'],
  shooting: ['publishing'],
  publishing: ['completed'],
  completed: [],
};

export function canTransition(
  from: string | null | undefined,
  to: string | null | undefined,
  _user?: WorkflowPolicyUser | null,
  _context?: WorkflowPolicyContext,
): WorkflowPolicyResult {
  if (WORKFLOW_ENGINE_MODE !== 'v2_strict') {
    return { allowed: true, reason: 'non-strict mode - no enforcement' };
  }

  const normalizedFrom = String(from || '');
  const normalizedTo = String(to || '');
  const allowed = ALLOWED_TRANSITIONS[normalizedFrom]?.includes(normalizedTo) ?? false;

  return {
    allowed,
    reason: allowed
      ? 'strict mode - transition allowed'
      : `strict mode - transition ${normalizedFrom || 'unknown'} -> ${normalizedTo || 'unknown'} is not allowed`,
  };
}

export function canApproveNode(
  user?: WorkflowPolicyUser | null,
  node?: WorkflowPolicyNode | null,
  topic?: WorkflowPolicyTopic | null,
): WorkflowPolicyResult {
  if (WORKFLOW_ENGINE_MODE !== 'v2_strict') {
    return { allowed: true, reason: 'non-strict mode - no enforcement' };
  }

  if (!user || !node) {
    return { allowed: false, reason: 'strict mode - missing user or node' };
  }

  if (user.role === 'admin' || user.role === 'director') {
    return { allowed: true, reason: 'strict mode - privileged approver' };
  }

  const approverType = String(node.approver_type || 'role');
  const approverValue = String(node.approver_value || '').trim();

  if (approverType === 'creator') {
    const allowed = Number(topic?.creator_id) === Number(user.id);
    return {
      allowed,
      reason: allowed ? 'strict mode - creator approver allowed' : 'strict mode - user is not topic creator',
    };
  }

  if (approverType === 'user') {
    const allowed = approverValue !== '' && Number(approverValue) === Number(user.id);
    return {
      allowed,
      reason: allowed ? 'strict mode - assigned user approver allowed' : 'strict mode - user does not match approver_value',
    };
  }

  if (approverType === 'role') {
    const allowed = approverValue !== '' && approverValue === user.role;
    return {
      allowed,
      reason: allowed ? 'strict mode - role approver allowed' : 'strict mode - user role does not match approver_value',
    };
  }

  return { allowed: false, reason: `strict mode - unsupported approver_type ${approverType}` };
}

export function canConfigureTransition(
  from: string | null | undefined,
  to: string | null | undefined,
): WorkflowPolicyResult {
  if (WORKFLOW_ENGINE_MODE !== 'v2_strict') {
    return { allowed: true, reason: 'non-strict mode - no enforcement' };
  }

  return canTransition(from, to);
}
