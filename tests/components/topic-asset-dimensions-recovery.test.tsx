import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: false,
});
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { flushSync } = await import('react-dom');
const { TopicDimensionRequestError, isTopicDimensionWriteOutcomeUnknown } = await import('../../src/api/resourceCenter');
const TopicAssetDimensionsPanel = (await import('../../src/components/topics/TopicAssetDimensionsPanel')).default;

type Dimension = { id: number; type: 'city' | 'person' | 'project'; value: string };
let dimensions: Dimension[] = [{ id: 1, type: 'city', value: '杭州' }];
let nextId = 2;
let addRequests = 0;
let removeRequests = 0;
let readRequests = 0;
let nextAddBehavior: 'success' | 'commit-then-drop' | 'drop-before-commit' = 'success';
let failNextRead = false;
let dropNextRemoveResponse = false;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

globalThis.fetch = async (input, init) => {
  const path = String(input);
  const method = init?.method ?? 'GET';
  if (path.endsWith('/asset-dimensions') && method === 'GET') {
    readRequests += 1;
    if (failNextRead) {
      failNextRead = false;
      return jsonResponse(503, { message: '只读核实服务暂不可用' });
    }
    return jsonResponse(200, { data: dimensions });
  }
  if (path.endsWith('/asset-dimensions') && method === 'POST') {
    addRequests += 1;
    const behavior = nextAddBehavior;
    nextAddBehavior = 'success';
    if (behavior === 'drop-before-commit') throw new TypeError('connection lost before commit');
    const body = JSON.parse(String(init?.body)) as { type: Dimension['type']; value: string };
    const duplicate = dimensions.some((item) => item.type === body.type && item.value === body.value);
    if (duplicate) return jsonResponse(409, { message: '该选题已登记此维度' });
    const saved = { id: nextId++, ...body };
    dimensions = [...dimensions, saved];
    if (behavior === 'commit-then-drop') throw new TypeError('connection lost after commit');
    return jsonResponse(201, { message: '维度已登记', id: saved.id, data: saved });
  }
  const removeMatch = path.match(/\/asset-dimensions\/(\d+)$/);
  if (removeMatch && method === 'DELETE') {
    removeRequests += 1;
    const id = Number(removeMatch[1]);
    dimensions = dimensions.filter((item) => item.id !== id);
    if (dropNextRemoveResponse) {
      dropNextRemoveResponse = false;
      throw new TypeError('connection lost after delete');
    }
    return jsonResponse(200, { message: '维度已移除' });
  }
  return jsonResponse(404, { message: `No fixture for ${method} ${path}` });
};

async function waitFor(predicate: () => boolean, message: string) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  assert(setter, 'input value setter exists');
  flushSync(() => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

async function clickAndWait(element: HTMLElement, predicate: () => boolean, message: string) {
  flushSync(() => element.click());
  await waitFor(predicate, message);
}

test('维度写入结果不明时只读对账，保留写锁，且只允许用户显式重试', async () => {
  assert.equal(isTopicDimensionWriteOutcomeUnknown(new TypeError('network lost')), true);
  assert.equal(isTopicDimensionWriteOutcomeUnknown(new TopicDimensionRequestError(408, 'timeout')), true);
  assert.equal(isTopicDimensionWriteOutcomeUnknown(new TopicDimensionRequestError(429, 'rate limited')), true);
  assert.equal(isTopicDimensionWriteOutcomeUnknown(new TopicDimensionRequestError(503, 'unavailable')), true);
  assert.equal(isTopicDimensionWriteOutcomeUnknown(new TopicDimensionRequestError(409, 'duplicate')), false);

  dimensions = [{ id: 1, type: 'city', value: '杭州' }];
  nextId = 2;
  addRequests = 0;
  removeRequests = 0;
  readRequests = 0;
  nextAddBehavior = 'success';
  failNextRead = false;
  dropNextRemoveResponse = false;

  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  flushSync(() => root.render(React.createElement(TopicAssetDimensionsPanel, { topicId: 77, canManage: true })));
  try {
    await waitFor(() => document.querySelector('[aria-label="已登记内容维度"]') !== null, 'initial dimensions did not load');
    nextAddBehavior = 'commit-then-drop';
    failNextRead = true;
    const input = document.querySelector<HTMLInputElement>('#topic-dimension-value-77')!;
    setInputValue(input, '绍兴');
    await clickAndWait(document.querySelector<HTMLButtonElement>('button[type="submit"]')!, () => (document.body.textContent ?? '').includes('只读核实失败'), 'read failure was not exposed');
    assert.equal(addRequests, 1, 'uncertain mutation was submitted once');
    assert.equal(readRequests, 2, 'the failed initial read plus the failed reconciliation are the only reads');
    assert.equal(input.disabled, true, 'write remains locked while the outcome cannot be read');
    const verifyButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('只读核实当前状态'));
    assert(verifyButton, 'read-only verification remains available while writes are locked');
    assert.equal(verifyButton.disabled, false, 'read-only verification remains available while writes are locked');
    await clickAndWait(verifyButton, () => (document.body.textContent ?? '').includes('无法确认是否由刚才的操作完成'), 'present target was not reconciled');
    assert.equal(addRequests, 1, 'manual verification does not replay the write');

    nextAddBehavior = 'drop-before-commit';
    setInputValue(input, '湖州');
    await clickAndWait(document.querySelector<HTMLButtonElement>('button[type="submit"]')!, () => (document.body.textContent ?? '').includes('未自动重试，如仍需登记请再次点击'), 'absent target was not reported');
    assert.equal(addRequests, 2, 'absence confirmation does not automatically replay the add');
    await clickAndWait(document.querySelector<HTMLButtonElement>('button[type="submit"]')!, () => (document.body.textContent ?? '').includes('城市“湖州”已登记。'), 'explicit retry did not succeed');
    assert.equal(addRequests, 3, 'only the explicit user submission created the second write');

    dropNextRemoveResponse = true;
    const removeButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.getAttribute('aria-label') === '移除城市：杭州');
    assert(removeButton, 'existing dimension has a remove button');
    await clickAndWait(removeButton, () => (document.body.textContent ?? '').includes('无法确认是否由刚才的操作移除'), 'remove result was not reconciled');
    assert.equal(removeRequests, 1, 'uncertain remove was not replayed');
    assert(!(document.body.textContent ?? '').includes('杭州'), 'dimension list was synchronized to the GET result');
  } finally {
    flushSync(() => root.unmount());
  }
});
