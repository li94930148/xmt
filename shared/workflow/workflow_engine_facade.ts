import {
  WORKFLOW_ENGINE_MODE,
  canApproveNode,
  canTransition,
  type WorkflowPolicyContext,
  type WorkflowPolicyNode,
  type WorkflowPolicyTopic,
  type WorkflowPolicyUser,
} from './policy';
import {
  buildWorkflowDecisions,
  type WorkflowDecision,
  type WorkflowShadowLogInput,
} from '../../api/services/workflow_decision_engine';

export type WorkflowRiskLevel = 'low' | 'medium' | 'high';

export { WORKFLOW_ENGINE_MODE };

export interface WorkflowEngineFacadeContext {
  from?: string | null;
  to?: string | null;
  user?: WorkflowPolicyUser | null;
  node?: WorkflowPolicyNode | null;
  topic?: WorkflowPolicyTopic | null;
  logs?: WorkflowShadowLogInput[];
  source?: WorkflowPolicyContext['source'];
}

export interface WorkflowTransitionCheckResult {
  allowed: boolean;
  reason: string;
  risk: WorkflowRiskLevel;
}

export interface WorkflowApprovalCheckResult {
  allowed: boolean;
  reason: string;
  strictBlocked: boolean;
  transition: {
    allowed: boolean;
    reason: string;
  };
  approve: {
    allowed: boolean;
    reason: string;
  };
  decision: WorkflowDecisionResult;
}

export interface WorkflowDecisionResult {
  allowed: boolean;
  confidence: number;
  suggestedTransition?: string;
  reason: string;
}

export interface WorkflowRiskContext {
  risk: WorkflowRiskLevel;
  heatmap?: Record<string, number>;
  shadowCount?: number;
}

function getFromState(ctx: WorkflowEngineFacadeContext) {
  return ctx.from ?? ctx.node?.status_from ?? ctx.topic?.status ?? null;
}

function getToState(ctx: WorkflowEngineFacadeContext) {
  return ctx.to ?? ctx.node?.status_to ?? null;
}

function getDecisionForContext(ctx: WorkflowEngineFacadeContext): WorkflowDecision | undefined {
  const decisions = buildWorkflowDecisions(ctx.logs || []);
  const nodeId = ctx.node?.id;

  if (nodeId !== undefined && nodeId !== null) {
    return decisions.find((decision) => Number(decision.node_id) === Number(nodeId));
  }

  const from = getFromState(ctx);
  const to = getToState(ctx);

  return decisions.find((decision) => (
    decision.from_state === String(from || 'unknown')
    && decision.to_state === String(to || 'unknown')
  )) || decisions[0];
}

function riskFromDecision(decision: WorkflowDecisionResult): WorkflowRiskLevel {
  if (!decision.allowed) {
    return 'high';
  }

  if (decision.confidence < 0.6) {
    return 'medium';
  }

  return 'low';
}

function buildHeatmap(logs: WorkflowShadowLogInput[]) {
  return logs.reduce<Record<string, number>>((heatmap, log) => {
    const from = log.from_state || 'unknown';
    const to = log.to_state || 'unknown';
    const key = `${from}->${to}`;
    heatmap[key] = (heatmap[key] || 0) + 1;
    return heatmap;
  }, {});
}

export function getDecision(ctx: WorkflowEngineFacadeContext): WorkflowDecisionResult {
  const decision = getDecisionForContext(ctx);

  if (!decision) {
    return {
      allowed: true,
      confidence: 1,
      reason: 'workflow facade - no decision signal available',
    };
  }

  return {
    allowed: decision.allowed,
    confidence: decision.confidence,
    suggestedTransition: decision.suggestedTransition,
    reason: decision.reason,
  };
}

export function checkTransition(ctx: WorkflowEngineFacadeContext): WorkflowTransitionCheckResult {
  const policy = canTransition(getFromState(ctx), getToState(ctx), ctx.user, {
    source: ctx.source,
    topic: ctx.topic,
    node: ctx.node,
  });
  const decision = getDecision(ctx);
  const allowed = policy.allowed && decision.allowed;

  return {
    allowed,
    reason: allowed ? policy.reason : `${policy.reason}; ${decision.reason}`,
    risk: riskFromDecision({
      ...decision,
      allowed,
    }),
  };
}

export function checkApproval(ctx: WorkflowEngineFacadeContext): WorkflowApprovalCheckResult {
  const transition = canTransition(getFromState(ctx), getToState(ctx), ctx.user, {
    source: ctx.source,
    topic: ctx.topic,
    node: ctx.node,
  });
  const approval = canApproveNode(ctx.user, ctx.node, ctx.topic);
  const decision = getDecision(ctx);
  const allowed = transition.allowed && approval.allowed && decision.allowed;

  return {
    allowed,
    reason: allowed
      ? approval.reason
      : `${transition.reason}; ${approval.reason}; ${decision.reason}`,
    strictBlocked: !allowed,
    transition,
    approve: approval,
    decision,
  };
}

export function getRiskContext(ctx: WorkflowEngineFacadeContext): WorkflowRiskContext {
  const decision = getDecision(ctx);
  const logs = ctx.logs || [];

  return {
    risk: riskFromDecision(decision),
    heatmap: logs.length > 0 ? buildHeatmap(logs) : undefined,
    shadowCount: logs.length,
  };
}
