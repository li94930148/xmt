import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement, useState } from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://xmt.test/' });
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failRemove = false;
  failSet = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) {
    if (this.failRemove) throw new Error('storage remove blocked');
    this.values.delete(key);
  }
  setItem(key: string, value: string) { if (this.failSet) throw new Error('storage quota exceeded'); this.values.set(key, String(value)); }
}

const storage = new MemoryStorage();
const rejectionStorage = new MemoryStorage();
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
Object.defineProperty(dom.window, 'sessionStorage', { configurable: true, value: storage });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
Object.defineProperty(dom.window, 'localStorage', { configurable: true, value: rejectionStorage });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: rejectionStorage });

const [{ createRoot }, { useTopicCreateRecovery }, { useAuthStore }] = await Promise.all([
  import('react-dom/client'),
  import('../../src/hooks/useTopicCreateRecovery'),
  import('../../src/store'),
]);

type RecoveryHook = ReturnType<typeof useTopicCreateRecovery>;
const payload = {
  title: '恢复 hook 测试选题',
  description: '隔离测试内容',
  platform: '抖音',
  deadline: '2026-11-02',
};

let postRequests = 0;
let statusRequests = 0;
let postRequestIds: string[] = [];
let fetchHandler: typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => fetchHandler(input, init)) as typeof fetch;

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function mount(onCreated: () => void, initialDraftsReady = true) {
  document.body.innerHTML = '<div id="root"></div>';
  let current: RecoveryHook | null = null;
  let updateDraftReadiness!: (ready: boolean) => void;
  function Harness() {
    const [draftsReady, setDraftsReady] = useState(initialDraftsReady);
    updateDraftReadiness = setDraftsReady;
    const hook = useTopicCreateRecovery(17, () => onCreated(), draftsReady);
    current = hook;
    return createElement('output', { 'data-phase': hook.pending?.phase ?? 'none' }, hook.message);
  }
  const root = createRoot(document.getElementById('root')!);
  act(() => root.render(createElement(Harness)));
  return {
    root,
    get hook() { assert(current); return current; },
    setDraftsReady(ready: boolean) { act(() => updateDraftReadiness(ready)); },
  };
}

function reset() {
  storage.clear();
  storage.failRemove = false;
  storage.failSet = false;
  rejectionStorage.clear();
  postRequests = 0;
  statusRequests = 0;
  postRequestIds = [];
  useAuthStore.setState({ user: { id: 17 } as never, token: 'test-token' });
  fetchHandler = async (input, init) => {
    const path = String(input);
    if (path.endsWith('/api/topics') && init?.method === 'POST') {
      postRequests += 1;
      postRequestIds.push(String((JSON.parse(String(init.body)) as { client_request_id?: string }).client_request_id));
      return jsonResponse(201, { message: 'created', data: { topicId: 171 } });
    }
    if (path.includes('/api/topics/create-requests/')) {
      statusRequests += 1;
      return jsonResponse(200, { state: 'created', topicId: 171 });
    }
    return jsonResponse(404, { message: `No fixture for ${path}` });
  };
}

test('topic create recovery hook blocks false completion, ignores unmounted results, and suppresses deterministic retries', async (t) => {
  try {
    await t.test('刷新后等待本机草稿加载完毕再核实并完成已创建的选题', async () => {
      reset();
      const requestId = '11111111-1111-4111-8111-111111111111';
      storage.setItem('xmt:topic-create-pending:v1:actor:17', JSON.stringify({
        version: 1,
        actorId: 17,
        requestId,
        payload,
        draftId: 'draft-mobile-1',
        draftSnapshot: {
          title: payload.title, platform: payload.platform, deadline: payload.deadline,
          assignee_id: '', projectBackground: '', targetAudience: '', expectedGoal: '', budget: '', outline: '',
        },
      }));
      const completions: number[] = [];
      const mounted = mount(() => completions.push(1), false);
      try {
        await settle();
        assert.equal(mounted.hook.ready, false, 'submission and recovery stay locked until the caller has loaded its draft collection');
        assert.equal(statusRequests, 0, 'server recovery lookup waits for local draft hydration');
        assert.equal(completions.length, 0);
        assert.notEqual(storage.getItem('xmt:topic-create-pending:v1:actor:17'), null, 'the recovery receipt remains until draft cleanup can be evaluated');

        mounted.setDraftsReady(true);
        await settle();
        assert.equal(statusRequests, 1, 'draft hydration starts exactly one read-only status lookup');
        assert.equal(completions.length, 1, 'confirmed creation completes only after draft hydration');
        assert.equal(storage.getItem('xmt:topic-create-pending:v1:actor:17'), null, 'the recovery receipt is cleared only after a safe completion callback');
      } finally {
        await act(async () => mounted.root.unmount());
      }
    });

    await t.test('状态查询进行时草稿就绪状态变化会保留恢复记录并重新核实', async () => {
      reset();
      const recoveryKey = 'xmt:topic-create-pending:v1:actor:17';
      storage.setItem(recoveryKey, JSON.stringify({
        version: 1,
        actorId: 17,
        requestId: '22222222-2222-4222-8222-222222222222',
        payload,
        draftId: 'draft-mobile-2',
        draftSnapshot: {
          title: payload.title, platform: payload.platform, deadline: payload.deadline,
          assignee_id: '', projectBackground: '', targetAudience: '', expectedGoal: '', budget: '', outline: '',
        },
      }));
      let resolveFirstStatus!: (response: Response) => void;
      fetchHandler = async (input) => {
        if (!String(input).includes('/api/topics/create-requests/')) return jsonResponse(404, { message: 'unexpected request' });
        statusRequests += 1;
        if (statusRequests === 1) return new Promise<Response>((resolve) => { resolveFirstStatus = resolve; });
        return jsonResponse(200, { state: 'created', topicId: 172 });
      };
      const completions: number[] = [];
      const mounted = mount(() => completions.push(1), true);
      try {
        await settle();
        assert.equal(statusRequests, 1, 'the first status read starts after the initial draft collection is ready');
        mounted.setDraftsReady(false);
        await settle();
        resolveFirstStatus(jsonResponse(200, { state: 'created', topicId: 172 }));
        await settle();
        assert.equal(completions.length, 0, 'a response from an obsolete not-ready scope cannot complete or navigate');
        assert.notEqual(storage.getItem(recoveryKey), null, 'the receipt remains available for a later safe read');
        assert.equal(mounted.hook.ready, false, 'the recovery hook locks while the draft collection is not ready');

        mounted.setDraftsReady(true);
        await settle();
        assert.equal(statusRequests, 2, 'restoring readiness performs one fresh read-only check');
        assert.equal(completions.length, 1, 'completion occurs only after readiness is restored');
        assert.equal(storage.getItem(recoveryKey), null, 'the recovery marker is cleared after the safe completion');
      } finally {
        await act(async () => mounted.root.unmount());
      }
    });

    await t.test('恢复标记删除失败时保持锁定，显式重试清理成功后才回调', async () => {
      reset();
      const completions: number[] = [];
      const mounted = mount(() => completions.push(1));
      try {
        await settle();
        storage.failRemove = true;
        await act(async () => { await mounted.hook.create(payload); });
        assert.equal(postRequests, 1);
        assert.equal(completions.length, 0, 'failed marker cleanup must not navigate or complete');
        assert.equal(mounted.hook.pending?.phase, 'cleanup_failed');
        assert.equal(mounted.hook.locked, true, 'the form stays locked until cleanup succeeds');
        assert.equal(document.querySelector('output')?.textContent?.includes('恢复记录未能清理'), true);

        storage.failRemove = false;
        await act(async () => { mounted.hook.retryCleanup(); });
        assert.equal(mounted.hook.pending, null);
        assert.equal(mounted.hook.locked, false);
        assert.equal(completions.length, 1);
        assert.equal(storage.length, 0);
        assert.equal(postRequests, 1, 'cleanup retry must not replay the create POST');
      } finally {
        await act(async () => mounted.root.unmount());
      }
    });

    await t.test('卸载后迟到的创建响应不会触发页面回调', async () => {
      reset();
      let resolvePost!: (response: Response) => void;
      fetchHandler = async (_input, init) => {
        if (init?.method === 'POST') {
          postRequests += 1;
          return new Promise<Response>((resolve) => { resolvePost = resolve; });
        }
        return jsonResponse(200, { state: 'created', topicId: 171 });
      };
      const completions: number[] = [];
      const mounted = mount(() => completions.push(1));
      try {
        await settle();
        let operation!: Promise<void>;
        await act(async () => { operation = mounted.hook.create(payload); await Promise.resolve(); });
        assert.equal(postRequests, 1);
        await act(async () => mounted.root.unmount());
        resolvePost(jsonResponse(201, { message: 'created', data: { topicId: 171 } }));
        await operation;
        assert.equal(completions.length, 0, 'unmounted page callbacks are suppressed');
        assert.equal(storage.length, 1, 'the recovery marker remains available for the next mount');
      } finally {
        // The root is already unmounted in this test.
      }
    });

    await t.test('确定性 4xx 保留恢复记录、提示修正或授权且不开放原载荷重试', async () => {
      reset();
      fetchHandler = async (input, init) => {
        const path = String(input);
        if (path.endsWith('/api/topics') && init?.method === 'POST') {
          postRequests += 1;
          postRequestIds.push(String((JSON.parse(String(init.body)) as { client_request_id?: string }).client_request_id));
          return jsonResponse(403, { message: '无提报权限' });
        }
        if (path.includes('/api/topics/create-requests/')) {
          statusRequests += 1;
          return jsonResponse(200, { state: 'not_found' });
        }
        return jsonResponse(404, { message: `No fixture for ${path}` });
      };
      const completions: number[] = [];
      const mounted = mount(() => completions.push(1));
      let activeRoot = mounted.root;
      try {
        await settle();
        await act(async () => { await mounted.hook.create(payload); });
        assert.equal(mounted.hook.pending?.phase, 'rejected');
        assert.equal(mounted.hook.pending?.confirmedNotFound, true, 'the release action requires a successful not_found read');
        assert.match(mounted.hook.message, /重新登录或确认提报权限/);
        assert.equal(statusRequests, 1, 'deterministic rejection is followed by read-only status confirmation');
        assert.equal(storage.length, 1, 'the exact recovery receipt is preserved');
        const stored = JSON.parse(storage.getItem('xmt:topic-create-pending:v1:actor:17') || 'null');
        assert.equal(stored.rejectionStatus, 403, 'rejection classification survives refresh');

        await act(async () => { await mounted.hook.retry(); });
        assert.equal(postRequests, 1, 'the same rejected payload is not replayed');
        await act(async () => { await mounted.hook.verify(); });
        assert.equal(mounted.hook.pending?.phase, 'rejected', 'read-only not_found does not expose a retry');
        assert.equal(postRequests, 1);
        assert.equal(completions.length, 0);

        await act(async () => mounted.root.unmount());
        const reopened = mount(() => completions.push(1));
        activeRoot = reopened.root;
        await settle();
        assert.equal(statusRequests, 3, 'initial rejection, manual verification, and refresh perform read-only status checks');
        assert.equal(reopened.hook.pending?.phase, 'rejected', 'the persisted rejection still blocks replay after refresh');
        await act(async () => { await reopened.hook.retry(); });
        assert.equal(postRequests, 1, 'refresh does not make the rejected payload retryable');

        storage.failRemove = true;
        await act(async () => { reopened.hook.releaseRejected(); });
        assert.equal(reopened.hook.pending?.phase, 'rejected', 'failed marker cleanup keeps the rejected request locked');
        assert.equal(reopened.hook.locked, true);
        assert.equal(storage.length, 1);
        storage.failRemove = false;
        await act(async () => { reopened.hook.releaseRejected(); });
        assert.equal(reopened.hook.pending, null, 'explicit confirmation releases only after successful local cleanup');
        assert.equal(reopened.hook.locked, false);
        assert.equal(storage.length, 0);
        assert.equal(completions.length, 0, 'releasing a rejection is not a success callback');

        fetchHandler = async (_input, init) => {
          if (init?.method === 'POST') {
            postRequests += 1;
            postRequestIds.push(String((JSON.parse(String(init.body)) as { client_request_id?: string }).client_request_id));
            return jsonResponse(201, { message: 'created', data: { topicId: 172 } });
          }
          return jsonResponse(200, { state: 'created', topicId: 172 });
        };
        await act(async () => { await reopened.hook.create(payload); });
        assert.equal(postRequests, 2, 'the user can start a new create after explicitly releasing the rejected request');
        assert.notEqual(postRequestIds[1], postRequestIds[0], 'a new submission uses a new request UUID');
        assert.equal(completions.length, 1);
      } finally {
        await act(async () => activeRoot.unmount());
      }
    });

    await t.test('拒绝状态写回标签页存储失败时跨刷新保留拒绝锁', async () => {
      reset();
      fetchHandler = async (input, init) => {
        const path = String(input);
        if (path.endsWith('/api/topics') && init?.method === 'POST') {
          postRequests += 1;
          postRequestIds.push(String((JSON.parse(String(init.body)) as { client_request_id?: string }).client_request_id));
          storage.failSet = true;
          return jsonResponse(403, { message: '无提报权限' });
        }
        if (path.includes('/api/topics/create-requests/')) {
          statusRequests += 1;
          return jsonResponse(200, { state: 'not_found' });
        }
        return jsonResponse(404, { message: `No fixture for ${path}` });
      };
      const first = mount(() => {});
      let unmountRoot = first.root.unmount.bind(first.root);
      try {
        await settle();
        await act(async () => { await first.hook.create(payload); });
        assert.equal(first.hook.pending?.phase, 'rejected');
        assert.equal(rejectionStorage.length, 1, 'the rejection is written to the fallback store');
        assert.equal(first.hook.storageUnavailable, false, 'the confirmed fallback keeps recovery durable');
        await act(async () => first.root.unmount());

        const reopened = mount(() => {});
        unmountRoot = reopened.root.unmount.bind(reopened.root);
        await settle();
        assert.equal(reopened.hook.pending?.phase, 'rejected', 'refresh reads the fallback rejection instead of enabling same-key retry');
        assert.equal(statusRequests, 2, 'refresh performs only a read-only status check');
        await act(async () => { await reopened.hook.retry(); });
        assert.equal(postRequests, 1, 'the rejected request is not replayed');
        storage.failSet = false;
        await act(async () => { reopened.hook.releaseRejected(); });
        assert.equal(rejectionStorage.length, 0, 'explicit release removes the fallback rejection record');
      } finally {
        storage.failSet = false;
        await act(async () => unmountRoot());
      }
    });

    for (const status of [409, 500]) {
      await t.test(`HTTP ${status} 不会进入确定拒绝解除流程`, async () => {
        reset();
        fetchHandler = async (input, init) => {
          const path = String(input);
          if (path.endsWith('/api/topics') && init?.method === 'POST') {
            postRequests += 1;
            return jsonResponse(status, { message: 'request not accepted' });
          }
          if (path.includes('/api/topics/create-requests/')) {
            statusRequests += 1;
            return jsonResponse(200, { state: 'not_found' });
          }
          return jsonResponse(404, { message: `No fixture for ${path}` });
        };
        const mounted = mount(() => {});
        try {
          await settle();
          await act(async () => { await mounted.hook.create(payload); });
          assert.equal(mounted.hook.pending?.phase, 'not_found');
          assert.equal(mounted.hook.pending?.recovery.rejectionStatus, undefined);
          assert.equal(storage.length, 1, 'the request receipt remains until an explicit safe action');
          assert.equal(mounted.hook.locked, true);
          await act(async () => { mounted.hook.releaseRejected(); });
          assert.equal(mounted.hook.pending?.phase, 'not_found', 'only the approved deterministic statuses can be released');
          assert.equal(storage.length, 1);
        } finally {
          await act(async () => mounted.root.unmount());
        }
      });
    }
  } finally {
    dom.window.close();
  }
});
