import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthRolloutModeLabel, getExistingLoginReadiness } from '../../src/pages/authRolloutPresentation';

test('reports each effective login rollout mode accurately', () => {
  assert.equal(getAuthRolloutModeLabel('legacy', 25), '现有登录方式');
  assert.equal(getAuthRolloutModeLabel('disabled', 25), '新版登录已关闭');
  assert.equal(getAuthRolloutModeLabel('internal', 25), '内部账号试用');
  assert.equal(getAuthRolloutModeLabel('allowlist', 25), '白名单账号试用');
  assert.equal(getAuthRolloutModeLabel('percentage', 25), '按比例试用（25%）');
});

test('only marks the actual legacy or aligned allowlist modes ready', () => {
  assert.equal(getExistingLoginReadiness('legacy', 'percentage', 25).ready, true);
  assert.equal(getExistingLoginReadiness('allowlist', 'allowlist', 25).ready, true);
  assert.equal(getExistingLoginReadiness('allowlist', 'percentage', 25).ready, false);
  assert.equal(getExistingLoginReadiness('internal', 'internal', 25).ready, false);
  assert.equal(getExistingLoginReadiness('percentage', 'percentage', 25).ready, false);
  assert.equal(getExistingLoginReadiness('disabled', 'disabled', 25).ready, true);

  const percentage = getExistingLoginReadiness('percentage', 'percentage', 25);
  assert.match(percentage.description, /按比例试用（25%）/);
  assert.doesNotMatch(percentage.description, /当前仅允许指定试用名单/);

  const mismatch = getExistingLoginReadiness('allowlist', 'percentage', 25);
  assert.match(mismatch.description, /运行时为白名单账号试用/);
  assert.match(mismatch.description, /按比例试用（25%）/);
});
