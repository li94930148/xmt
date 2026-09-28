import assert from 'node:assert/strict';
import { ROLE_MAP } from '../../src/constants';

const expectedRoleLabels = {
  admin: '管理员',
  director: '编导',
  editor: '编辑',
  copywriter: '文案',
  post_production: '后期',
  camera: '摄像',
  member: '成员',
};

assert.deepEqual(ROLE_MAP, expectedRoleLabels, 'mobile account role labels should cover every built-in role in Chinese');
for (const [role, label] of Object.entries(ROLE_MAP)) {
  assert.notEqual(label, role, `${role} should not be exposed as a raw role code`);
}

console.log('Mobile built-in role labels passed');
