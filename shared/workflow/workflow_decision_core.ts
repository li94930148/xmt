export interface WorkflowShadowLogInput {
  node_id?: number | null;
  from_state?: string | null;
  to_state?: string | null;
  action?: string | null;
  reason?: string | null;
}

export interface WorkflowDecision {
  node_id: number | null;
  from_state: string;
  to_state: string;
  allowed: boolean;
  shouldBlock: boolean;
  shouldWarn: boolean;
  suggestedTransition?: string;
  confidence: number;
  reason: string;
}

type TransitionStats = {
  from: string;
  to: string;
  count: number;
};

type NodeRiskStats = {
  transitionCount: number;
  rejectionCount: number;
  abnormalPatternCount: number;
};

function transitionKey(from: string, to: string) {
  return `${from}->${to}`;
}

function normalizeState(value?: string | null) {
  return value || 'unknown';
}

function isAbnormalReason(reason?: string | null) {
  return Boolean(reason && !reason.includes('shadow mode - no enforcement'));
}

export function buildWorkflowDecisions(logs: WorkflowShadowLogInput[]): WorkflowDecision[] {
  const transitionStats = new Map<string, TransitionStats>();
  const nodeRiskStats = new Map<number, NodeRiskStats>();
  const latestByNode = new Map<number, WorkflowShadowLogInput>();

  for (const log of logs) {
    const from = normalizeState(log.from_state);
    const to = normalizeState(log.to_state);
    const key = transitionKey(from, to);
    const existingTransition = transitionStats.get(key);

    transitionStats.set(key, {
      from,
      to,
      count: (existingTransition?.count || 0) + 1,
    });

    if (log.node_id !== null && log.node_id !== undefined) {
      const nodeId = Number(log.node_id);
      const existingRisk = nodeRiskStats.get(nodeId) || {
        transitionCount: 0,
        rejectionCount: 0,
        abnormalPatternCount: 0,
      };

      nodeRiskStats.set(nodeId, {
        transitionCount: existingRisk.transitionCount + 1,
        rejectionCount: existingRisk.rejectionCount + (String(log.action || '').includes('rejected') ? 1 : 0),
        abnormalPatternCount: existingRisk.abnormalPatternCount + (isAbnormalReason(log.reason) ? 1 : 0),
      });

      if (!latestByNode.has(nodeId)) {
        latestByNode.set(nodeId, log);
      }
    }
  }

  const mostFrequentByFrom = new Map<string, TransitionStats>();
  for (const stats of transitionStats.values()) {
    const existing = mostFrequentByFrom.get(stats.from);
    if (!existing || stats.count > existing.count) {
      mostFrequentByFrom.set(stats.from, stats);
    }
  }

  return Array.from(latestByNode.entries()).map(([nodeId, latest]) => {
    const from = normalizeState(latest.from_state);
    const to = normalizeState(latest.to_state);
    const risk = nodeRiskStats.get(nodeId) || {
      transitionCount: 0,
      rejectionCount: 0,
      abnormalPatternCount: 0,
    };
    const frequentTransition = mostFrequentByFrom.get(from);
    const suggestedTransition =
      frequentTransition && frequentTransition.to !== to
        ? frequentTransition.to
        : undefined;
    const warningScore = risk.rejectionCount + risk.abnormalPatternCount;
    const shouldWarn = warningScore > 0 || Boolean(suggestedTransition);
    const confidence = Math.min(
      0.95,
      Math.max(0.1, (risk.transitionCount + (frequentTransition?.count || 0)) / Math.max(10, logs.length || 1)),
    );

    return {
      node_id: nodeId,
      from_state: from,
      to_state: to,
      allowed: !shouldWarn,
      shouldBlock: false,
      shouldWarn,
      suggestedTransition,
      confidence: Number(confidence.toFixed(2)),
      reason: shouldWarn
        ? `Shadow decision: ${warningScore} risk signal(s), ${frequentTransition?.count || 0} matching transition sample(s).`
        : 'Shadow decision: no risk signal detected.',
    };
  });
}
