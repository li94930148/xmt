import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { getRoleDisplayName } from '../../src/lib/roles';

const expectedRoleLabels = {
  admin: '管理员',
  director: '管理层',
  editor: '通用编辑',
  copywriter: '文案',
  post_production: '后期',
  camera: '摄像',
  member: '普通人员',
};

describe('mobile role labels', () => {
  it('maps built-in role codes to canonical business labels', () => {
    for (const [role, label] of Object.entries(expectedRoleLabels)) {
      assert.equal(getRoleDisplayName(role), label, `${role} should match its canonical database role name`);
      assert.notEqual(label, role, `${role} should not be exposed as a raw role code`);
    }
  });

  it('hides unknown internal role codes', () => {
    assert.equal(getRoleDisplayName('custom_video_editor'), '自定义角色', 'unknown role codes must not leak internal codes or be mislabeled as built-in roles');
  });

  it('describes a missing role explicitly', () => {
    assert.equal(getRoleDisplayName(null), '未分配角色', 'missing roles should be described explicitly');
  });
});
