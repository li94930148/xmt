export type WorkflowUIStatus = 'normal' | 'warning' | 'blocked';
export type WorkflowUIRisk = 'low' | 'medium' | 'high';

export interface WorkflowDecisionLike {
  allowed: boolean;
  confidence: number;
  reason?: string;
}

export interface WorkflowUIState {
  status: WorkflowUIStatus;
  risk: WorkflowUIRisk;
  reason?: string;
  explain?: {
    summary: string;
    reasons: string[];
  };
}

export interface WorkflowExplainLike {
  summary: string;
  reasons: string[];
}

export function mapDecisionToUI(decision: WorkflowDecisionLike): WorkflowUIState {
  if (!decision.allowed) {
    return {
      status: 'blocked',
      risk: 'high',
      reason: decision.reason,
    };
  }

  if (decision.confidence < 0.6) {
    return {
      status: 'warning',
      risk: 'medium',
      reason: decision.reason,
    };
  }

  return {
    status: 'normal',
    risk: 'low',
    reason: decision.reason,
  };
}

export function mapExplainToUI(explain: WorkflowExplainLike) {
  return {
    tooltip: [
      explain.summary,
      ...explain.reasons,
    ].filter(Boolean).join('\n'),
    warningPopup: explain.reasons.join('\n'),
    blockedReasonPanel: explain.summary,
    explain: {
      summary: explain.summary,
      reasons: explain.reasons,
    },
  };
}
