import assert from 'node:assert/strict';
import { resourceStatusLabel, resourceVisibilityLabel } from '../src/components/resource-center/resourceLabels';
import { productionStatusLabel } from '../src/components/production/productionStatusLabel';
import { topicStatusLabel } from '../src/components/topics/topicStatusLabel';
import { dailyReportStatusLabel } from '../src/components/daily-report/dailyReportStatusLabel';
import {
  getWorkflowRiskLabel,
  getWorkflowRuleLabel,
  localizeWorkflowMessage,
  mapExplainToUI,
} from '../src/components/workflow/WorkflowUIBridge';

const explanation = mapExplainToUI({
  summary: 'Workflow check for pending -> shooting: requires attention.',
  reasons: [
    'strict mode - transition pending -> shooting is not allowed; workflow facade - no decision signal available',
  ],
});

assert.match(explanation.tooltip, /流程检查：待审核 → 成片制作；需要处理。/);
assert.match(explanation.tooltip, /不允许从「待审核」直接进入「成片制作」。/);
assert.match(explanation.warningPopup, /暂无可用于辅助判断的历史记录。/);
assert.doesNotMatch(explanation.tooltip, /Workflow check|strict mode|workflow facade|Shadow decision/i);
assert.equal(localizeWorkflowMessage('Update the approver rule or use a permitted approver.'), '请检查审批人设置，或选择符合规则的审批人。');
assert.equal(localizeWorkflowMessage('Consider changing target transition to publishing.'), '可考虑将下一阶段调整为「发布中」。');
assert.equal(localizeWorkflowMessage('Adjust the workflow transition to an allowed status path.'), '请将阶段顺序调整为允许的下一步。');
assert.equal(getWorkflowRiskLabel('high'), '高风险');
assert.equal(getWorkflowRiskLabel('medium'), '中风险');
assert.equal(getWorkflowRiskLabel('low'), '低风险');
assert.equal(getWorkflowRuleLabel('canTransition'), '阶段顺序');
assert.equal(getWorkflowRuleLabel('canApproveNode'), '审批人设置');

for (const value of ['constructor', '__proto__', 'future_status']) {
  assert.equal(resourceVisibilityLabel(value), '范围待确认', 'unknown resource visibility must not resolve inherited object properties');
  for (const label of [resourceStatusLabel, productionStatusLabel, topicStatusLabel, dailyReportStatusLabel]) {
    assert.equal(label(value), '状态待确认', 'unknown status must always return a renderable business label');
  }
}

console.log('Workflow business language and unknown-status fallback mapping passed');
