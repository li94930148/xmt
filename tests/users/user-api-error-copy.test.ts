import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const {
  createUser,
  deleteUser,
  getActivityLogs,
  getAssignableRoles,
  getLogs,
  getUser,
  getUserCreateRequestStatus,
  getUserDeleteRequestStatus,
  getUserUpdateRequestStatus,
  getUsers,
  updateUser,
} = await import('../../src/api/users.js');

try {
  const fallbackCases = [
    ['member list', () => getUsers(), '成员列表加载失败'],
    ['member detail', () => getUser(7), '成员信息加载失败'],
    ['member creation verification', () => getUserCreateRequestStatus('request'), '无法确认成员是否已创建，请重新核实'],
    ['member update verification', () => getUserUpdateRequestStatus('request', 7), '无法确认成员信息是否已更新，请重新核实'],
    ['member deletion verification', () => getUserDeleteRequestStatus('request', 7), '无法确认成员是否已删除，请重新核实'],
    ['assignable roles', () => getAssignableRoles(), '可分配角色列表加载失败'],
    ['member creation', () => createUser({ username: 'test', password: 'unused' }), '成员创建失败'],
    ['member update', () => updateUser(7, { name: 'test' }), '成员信息更新失败'],
    ['member deletion', () => deleteUser(7), '成员删除失败'],
    ['member operation logs', () => getLogs(), '成员操作记录加载失败'],
    ['member activity logs', () => getActivityLogs(), '成员活动记录加载失败'],
  ] as const;
  globalThis.fetch = async () => new Response('not-json', { status: 503 });

  for (const [label, request, expectedMessage] of fallbackCases) {
    await assert.rejects(
      () => request(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, expectedMessage, `${label} uses a Chinese fallback`);
        return true;
      },
    );
  }

  globalThis.fetch = async () => new Response(JSON.stringify({ message: '成员目录暂时不可用，请稍后重试。' }), { status: 503 });
  await assert.rejects(
    () => getUsers(),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, '成员目录暂时不可用，请稍后重试。');
      return true;
    },
    'a server-provided error remains visible instead of being replaced by the fallback',
  );

  console.log('User API error copy tests passed.');
} finally {
  globalThis.fetch = originalFetch;
}
