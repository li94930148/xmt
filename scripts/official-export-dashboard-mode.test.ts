import assert from 'node:assert/strict';
import { officialDashboardMode, officialReconciliationSummary, reconcileOfficialMetric } from '../api/services/douyinDataCenter.js';

assert.equal(officialDashboardMode(undefined), 'existing_only');
assert.equal(officialDashboardMode('shadow_compare'), 'shadow_compare');
assert.equal(officialDashboardMode('official_preferred'), 'official_preferred');
assert.equal(officialDashboardMode('unsafe-value'), 'existing_only');
assert.equal(reconcileOfficialMetric(1, 1), 'matched');
assert.equal(reconcileOfficialMetric(1, 2), 'different');
assert.equal(reconcileOfficialMetric(1, null), 'existing_only');
assert.equal(reconcileOfficialMetric(null, 1), 'official_only');
assert.equal(reconcileOfficialMetric(null, null), 'not_comparable');
assert.deepEqual(officialReconciliationSummary(1, 2), { comparable: true, status: 'different' });
assert.deepEqual(officialReconciliationSummary(1, null), { comparable: false, status: 'existing_only' });
console.log('官方导出仪表盘模式测试通过：existing_only 默认、影子对账状态和官方优先白名单。');
