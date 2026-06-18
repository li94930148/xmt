import {
  WORKFLOW_ENGINE_MODE,
  checkApproval,
  checkTransition,
  getDecision,
  getRiskContext,
  type WorkflowEngineFacadeContext,
} from './workflow_engine_facade';
import { explainBlockReason, explainDecision } from './workflow_explain';
import type { WorkflowRuntimeContext } from './types';

export type WorkflowRuntimeInput = WorkflowEngineFacadeContext;

export interface WorkflowTransitionRuntimeResult extends WorkflowRuntimeContext {
  decision: ReturnType<typeof getDecision>;
  policy: ReturnType<typeof checkTransition>;
}

export interface WorkflowApprovalRuntimeResult {
  allowed: boolean;
  reason: string;
  strictBlocked: boolean;
  transition: ReturnType<typeof checkApproval>['transition'];
  approve: ReturnType<typeof checkApproval>['approve'];
  decision: ReturnType<typeof checkApproval>['decision'];
}

export interface WorkflowExplainabilityResult {
  explain: ReturnType<typeof explainDecision>;
  blockExplain: ReturnType<typeof explainBlockReason>;
}

export { WORKFLOW_ENGINE_MODE };

export function buildWorkflowRuntimeContext(ctx: WorkflowRuntimeInput): WorkflowRuntimeContext {
  const decision = getDecision(ctx);
  const riskContext = getRiskContext(ctx);

  return {
    allowed: decision.allowed,
    risk: riskContext.risk,
    confidence: decision.confidence,
    reason: decision.reason,
    suggestedTransition: decision.suggestedTransition,
    shadowCount: riskContext.shadowCount,
    heatmap: riskContext.heatmap,
    strictBlocked: !decision.allowed,
  };
}

export function runTransitionCheck(ctx: WorkflowRuntimeInput): WorkflowTransitionRuntimeResult {
  const policy = checkTransition(ctx);
  const decision = getDecision(ctx);
  const runtimeContext = buildWorkflowRuntimeContext(ctx);
  const allowed = policy.allowed && decision.allowed;

  return {
    ...runtimeContext,
    allowed,
    risk: policy.risk,
    reason: allowed ? policy.reason : `${policy.reason}; ${decision.reason}`,
    strictBlocked: !allowed,
    decision,
    policy,
  };
}

export function runApprovalCheck(ctx: WorkflowRuntimeInput): WorkflowApprovalRuntimeResult {
  return checkApproval(ctx);
}

export function getExplainability(ctx: WorkflowRuntimeInput): WorkflowExplainabilityResult {
  return {
    explain: explainDecision(ctx),
    blockExplain: explainBlockReason(ctx),
  };
}
