import assert from 'node:assert/strict';
import test from 'node:test';
import { persistVerifiedRoleRecovery } from '../../src/pages/permission-management/roleRecoveryStorage.js';

test('role recovery snapshot is saved and read back exactly', () => {
  const values = new Map<string, string>();
  const snapshot = { roleId: 12, name: '内容编辑', permissionIds: [3, 8] };
  persistVerifiedRoleRecovery({
    setItem: (key, value) => values.set(key, value),
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => { values.delete(key); },
  }, 'xmt:role-update-pending:v1:user:7', snapshot);

  assert.equal(values.get('xmt:role-update-pending:v1:user:7'), JSON.stringify(snapshot));
});

test('a silently dropped role recovery write fails closed', () => {
  assert.throws(() => persistVerifiedRoleRecovery({
    setItem: () => undefined,
    getItem: () => null,
    removeItem: () => undefined,
  }, 'xmt:role-create-pending:v1:user:7', { code: 'content_editor' }), /未能完整保存/);
});

test('a role recovery mismatch fails closed', () => {
  let saved = '';
  assert.throws(() => persistVerifiedRoleRecovery({
    setItem: (_key, value) => { saved = `${value} `; },
    getItem: () => saved,
    removeItem: () => undefined,
  }, 'xmt:role-delete-pending:v1:user:7', { roleId: 12, name: '内容编辑' }), /未能完整保存/);
});

test('role recovery read failure propagates to the handler before its API request', () => {
  assert.throws(() => persistVerifiedRoleRecovery({
    setItem: () => undefined,
    getItem: () => { throw new Error('storage unavailable'); },
    removeItem: () => undefined,
  }, 'xmt:role-update-pending:v1:user:7', { roleId: 12, name: '内容编辑', permissionIds: [] }), /storage unavailable/);
});
