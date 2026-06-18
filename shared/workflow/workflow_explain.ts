import {
  checkApproval,
  checkTransition,
  getDecision,
  getRiskContext,
  type WorkflowEngineFacadeContext,
} from './workflow_engine_facade';

export interface WorkflowExplainResult {
  summary: string;
  reasons: string[];
  riskFactors: string[];
  matchedRules: string[];
  confidenceBreakdown: {
    policy: number;
    decision: number;
    historical: number;
  };
}

export interface WorkflowBlockExplainResult {
  blockedReason: string;
  failedRule: string;
  suggestion: string;
}

export interface WorkflowExplainContext {
  decision: ReturnType<typeof getDecision>;
  risk: ReturnType<typeof getRiskContext>;
  transition: ReturnType<typeof checkTransition>;
  approval: ReturnType<typeof checkApproval>;
  shadowReasons: string[];
}

function getTransitionLabel(ctx: WorkflowEngineFacadeContext) {
  const from = ctx.from ?? ctx.node?.status_from ?? ctx.topic?.status ?? 'unknown';
  const to = ctx.to ?? ctx.node?.status_to ?? 'unknown';
  return `${from || 'unknown'} -> ${to || 'unknown'}`;
}

function getShadowReasons(ctx: WorkflowEngineFacadeContext) {
  return (ctx.logs || [])
    .map((log) => log.reason)
    .filter((reason): reason is string => Boolean(reason && reason.trim()));
}

function getHistoricalConfidence(ctx: WorkflowEngineFacadeContext) {
  const count = ctx.logs?.length || 0;
  if (count >= 50) return 0.9;
  if (count >= 10) return 0.7;
  if (count > 0) return 0.4;
  return 0.2;
}

export function buildExplainContext(ctx: WorkflowEngineFacadeContext): WorkflowExplainContext {
  return {
    decision: getDecision(ctx),
    risk: getRiskContext(ctx),
    transition: checkTransition(ctx),
    approval: checkApproval(ctx),
    shadowReasons: getShadowReasons(ctx),
  };
}

export function explainDecision(ctx: WorkflowEngineFacadeContext): WorkflowExplainResult {
  const explainContext = buildExplainContext(ctx);
  const transitionLabel = getTransitionLabel(ctx);
  const reasons = [
    explainContext.transition.reason,
    explainContext.approval.reason,
    explainContext.decision.reason,
  ].filter(Boolean);
  const riskFactors = [
    `risk=${explainContext.risk.risk}`,
    `shadowCount=${explainContext.risk.shadowCount || 0}`,
    ...explainContext.shadowReasons.slice(0, 3),
  ];
  const matchedRules = [
    explainContext.transition.allowed ? 'transition policy matched' : 'transition policy failed',
    explainContext.approval.allowed ? 'approval policy matched' : 'approval policy failed',
    explainContext.decision.allowed ? 'decision allowed' : 'decision denied',
  ];

  return {
    summary: `Workflow check for ${transitionLabel}: ${explainContext.transition.allowed && explainContext.approval.allowed && explainContext.decision.allowed ? 'allowed' : 'requires attention'}.`,
    reasons,
    riskFactors,
    matchedRules,
    confidenceBreakdown: {
      policy: explainContext.transition.allowed && explainContext.approval.allowed ? 1 : 0,
      decision: explainContext.decision.confidence,
      historical: getHistoricalConfidence(ctx),
    },
  };
}

export function explainBlockReason(ctx: WorkflowEngineFacadeContext): WorkflowBlockExplainResult {
  const explainContext = buildExplainContext(ctx);

  if (!explainContext.transition.allowed) {
    return {
      blockedReason: explainContext.transition.reason,
      failedRule: 'canTransition',
      suggestion: 'Adjust the workflow transition to an allowed status path.',
    };
  }

  if (!explainContext.approval.allowed) {
    return {
      blockedReason: explainContext.approval.reason,
      failedRule: 'canApproveNode',
      suggestion: 'Update the approver rule or use a permitted approver.',
    };
  }

  if (!explainContext.decision.allowed) {
    return {
      blockedReason: explainContext.decision.reason,
      failedRule: 'buildWorkflowDecisions',
      suggestion: explainContext.decision.suggestedTransition
        ? `Consider changing target transition to ${explainContext.decision.suggestedTransition}.`
        : 'Review recent workflow shadow logs and risk signals.',
    };
  }

  return {
    blockedReason: 'No strict block detected.',
    failedRule: 'none',
    suggestion: 'No change required.',
  };
}
