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

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  production: '创作中',
  shooting: '成片制作',
  publishing: '发布中',
  completed: '已完成',
  unknown: '未知阶段',
};

const FAILED_RULE_LABELS: Record<string, string> = {
  canTransition: '阶段顺序',
  canApproveNode: '审批人设置',
  buildWorkflowDecisions: '历史处理记录',
  none: '无',
};

function statusLabel(value: string) {
  return STATUS_LABELS[value] || '未知阶段';
}

export function localizeWorkflowMessage(value: string): string {
  const message = String(value || '').trim();
  if (!message) return '流程规则需要复核。';
  if (message.includes(';')) {
    return message.split(';').map((part) => localizeWorkflowMessage(part)).join('；');
  }

  const summary = message.match(/^Workflow check for (.+?) -> (.+?): (allowed|requires attention)\.$/);
  if (summary) {
    return `流程检查：${statusLabel(summary[1])} → ${statusLabel(summary[2])}；${summary[3] === 'allowed' ? '当前设置可用' : '需要处理'}。`;
  }

  const transition = message.match(/^strict mode - transition (.+?) -> (.+?) is not allowed$/);
  if (transition) return `不允许从「${statusLabel(transition[1])}」直接进入「${statusLabel(transition[2])}」。`;

  const shadowDecision = message.match(/^Shadow decision: (\d+) risk signal\(s\), (\d+) matching transition sample\(s\)\.$/);
  if (shadowDecision) return `历史记录包含 ${shadowDecision[1]} 项风险提示、${shadowDecision[2]} 条相同阶段流转记录。`;

  if (message === 'strict mode - transition allowed') return '阶段顺序符合当前流程规则。';
  if (message === 'strict mode - privileged approver') return '当前审批人符合负责人审批规则。';
  if (message === 'strict mode - missing user or node') return '审批人或审批节点信息不完整。';
  if (message === 'strict mode - creator approver allowed') return '选题创建人符合此节点的审批规则。';
  if (message === 'strict mode - user is not topic creator') return '此节点仅允许选题创建人审批。';
  if (message === 'strict mode - assigned user approver allowed') return '指定的审批人符合此节点规则。';
  if (message === 'strict mode - user does not match approver_value') return '当前账号不是此节点指定的审批人。';
  if (message === 'strict mode - role approver allowed') return '当前角色符合此节点的审批规则。';
  if (message === 'strict mode - user role does not match approver_value') return '当前角色与此节点指定的审批角色不一致。';
  if (message === 'workflow facade - no decision signal available') return '暂无可用于辅助判断的历史记录。';
  if (message === 'Shadow decision: no risk signal detected.') return '未发现需要关注的历史风险提示。';
  if (message === 'No strict block detected.') return '当前没有阻断流程的问题。';
  if (message === 'Adjust the workflow transition to an allowed status path.') return '请将阶段顺序调整为允许的下一步。';
  if (message === 'Update the approver rule or use a permitted approver.') return '请检查审批人设置，或选择符合规则的审批人。';
  if (message === 'Review recent workflow shadow logs and risk signals.') return '请核对近期审批处理情况后再决定是否调整。';
  if (message === 'No change required.') return '当前无需调整。';

  const suggestedTransition = message.match(/^Consider changing target transition to (.+)\.$/);
  if (suggestedTransition) return `可考虑将下一阶段调整为「${statusLabel(suggestedTransition[1])}」。`;
  if (message.startsWith('strict mode - unsupported approver_type')) return '此审批方式暂不支持，请调整审批人设置。';
  return '流程配置需要复核，请检查阶段顺序和审批人设置。';
}

export function getWorkflowRiskLabel(risk: WorkflowUIRisk) {
  if (risk === 'high') return '高风险';
  if (risk === 'medium') return '中风险';
  return '低风险';
}

export function getWorkflowRuleLabel(rule: string) {
  return FAILED_RULE_LABELS[rule] || '流程规则';
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
  const summary = localizeWorkflowMessage(explain.summary);
  const reasons = explain.reasons.map(localizeWorkflowMessage);
  return {
    tooltip: [summary, ...reasons].filter(Boolean).join('\n'),
    warningPopup: reasons.join('\n'),
    blockedReasonPanel: summary,
    explain: {
      summary,
      reasons,
    },
  };
}
