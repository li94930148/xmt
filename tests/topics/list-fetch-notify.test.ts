import assert from 'node:assert/strict';
import { createListFetchController, listErrorKey } from '../../src/utils/listFetchNotify.js';

function testControllerDedupsIdenticalErrors() {
  const controller = createListFetchController();
  const key = listErrorKey('获取选题列表失败', '获取选题列表失败', 'error');

  const id1 = controller.begin();
  assert.equal(controller.isCurrent(id1), true);
  assert.equal(controller.shouldNotifyError(key), true, '首次失败应提示');
  assert.equal(controller.shouldNotifyError(key), false, '相同错误连续失败只提示一次');

  controller.markSettledSuccess();
  assert.equal(controller.shouldNotifyError(key), true, '成功后的再次失败应重新提示');
}

function testControllerAllowsDistinctErrors() {
  const controller = createListFetchController();
  assert.equal(controller.shouldNotifyError(listErrorKey('A', 'm1')), true);
  assert.equal(controller.shouldNotifyError(listErrorKey('A', 'm2')), true);
  assert.equal(controller.shouldNotifyError(listErrorKey('A', 'm2')), false);
}

function testControllerDropsStaleResponses() {
  const controller = createListFetchController();
  const first = controller.begin();
  const second = controller.begin();
  assert.equal(controller.isCurrent(first), false, '过期请求应被丢弃');
  assert.equal(controller.isCurrent(second), true);
}

function testControllerResetAllowsRetryToast() {
  const controller = createListFetchController();
  const key = listErrorKey('获取选题列表失败', '超时');
  assert.equal(controller.shouldNotifyError(key), true);
  assert.equal(controller.shouldNotifyError(key), false);
  controller.resetErrorNotify();
  assert.equal(controller.shouldNotifyError(key), true, '用户重试前应允许再次提示');
}

function testStoreDedupsConsecutiveIdenticalNotifications() {
  // 同步导入 store（zustand create 在 import 时执行）
  return import('../../src/store/index.js').then(({ useAppStore }) => {
    useAppStore.getState().notifications.forEach((item) => {
      useAppStore.getState().removeNotification(item.id);
    });

    const payload = { title: '获取选题列表失败', message: '获取选题列表失败', type: 'error' as const };
    useAppStore.getState().addNotification({ ...payload });
    const afterFirst = useAppStore.getState().notifications.length;
    useAppStore.getState().addNotification({ ...payload });
    const afterDup = useAppStore.getState().notifications.length;
    assert.equal(afterFirst, 1);
    assert.equal(afterDup, 1, '连续相同错误 toast 应去重');

    useAppStore.getState().addNotification({ ...payload, message: '网络错误' });
    assert.equal(useAppStore.getState().notifications.length, 2, '不同 message 仍应展示');

    // 唯一 id
    const ids = useAppStore.getState().notifications.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, 'notification id 不应冲突');

    useAppStore.getState().notifications.forEach((item) => {
      useAppStore.getState().removeNotification(item.id);
    });
  });
}

function testGetTopicsUsesServerErrorMessage() {
  return (async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return {
        ok: false,
        json: async () => ({ message: '没有权限访问选题列表' }),
      } as Response;
    }) as typeof fetch;

    try {
      // 动态导入，避免顶层 await 与 store 初始化相互干扰
      const { getTopics } = await import('../../src/api/topics.js');
      await assert.rejects(
        () => getTopics(),
        (error: Error) => {
          assert.equal(error.message, '没有权限访问选题列表');
          return true;
        },
        '失败时应透出服务端真实错误，而不是吞掉',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  })();
}


async function testGetTopicsOmitsEmptyFilters() {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return {
      ok: true,
      json: async () => ({ success: true, data: [], pagination: { total: 0, page: 1, limit: 15 } }),
    } as Response;
  }) as typeof fetch;

  try {
    const { getTopics } = await import('../../src/api/topics.js');
    await getTopics({ status: '', search: '', page: 1, limit: 15 });
    assert.ok(!requestedUrl.includes('status='), '空 status 不应进入查询串');
    assert.ok(!requestedUrl.includes('search='), '空 search 不应进入查询串');
    assert.ok(requestedUrl.includes('page=1'));
    assert.ok(requestedUrl.includes('limit=15'));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testGetTopicsReadsErrorField() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: false,
    json: async () => ({ success: false, error: '请求参数不合法' }),
  } as Response)) as typeof fetch;

  try {
    const { getTopics } = await import('../../src/api/topics.js');
    await assert.rejects(
      () => getTopics({ status: '', search: '', page: 1, limit: 15 }),
      (error: Error) => {
        assert.equal(error.message, '请求参数不合法');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testTopicQuerySchemaAcceptsEmptyStrings() {
  const { topicQuerySchema } = await import('../../shared/schema/topics.schema.js');
  const parsed = topicQuerySchema.parse({ status: '', search: '', page: '1', limit: '15' });
  assert.equal(parsed.status, undefined);
  assert.equal(parsed.search, undefined);
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 15);
}

testControllerDedupsIdenticalErrors();
testControllerAllowsDistinctErrors();
testControllerDropsStaleResponses();
testControllerResetAllowsRetryToast();
await testStoreDedupsConsecutiveIdenticalNotifications();
await testGetTopicsUsesServerErrorMessage();
await testGetTopicsOmitsEmptyFilters();
await testGetTopicsReadsErrorField();
await testTopicQuerySchemaAcceptsEmptyStrings();

console.log('list-fetch-notify tests passed');
