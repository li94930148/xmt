import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  MutationObserver: dom.window.MutationObserver,
});

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { flushSync } = await import('react-dom');
const { default: RealtimeToast, showRealtimeToast } = await import('../../src/components/RealtimeToast');

test('实时提示在常驻礼貌播报区播报，关闭控件有名称和 40px 触控尺寸', () => {
  document.body.innerHTML = '<main id="root"></main>';
  const mount = document.getElementById('root')!;
  const root = createRoot(mount);

  flushSync(() => root.render(React.createElement(RealtimeToast)));
  try {
    const status = mount.querySelector<HTMLElement>('[role="status"]');
    assert.ok(status, '没有可视提示时也应保留播报区');
    assert.equal(status.getAttribute('aria-live'), 'polite');
    assert.equal(status.getAttribute('aria-atomic'), 'true');
    assert.equal(status.textContent, '', '初始空播报区不应产生多余读屏内容');

    flushSync(() => showRealtimeToast({ title: '消息已送达', message: '新选题已进入待审核列表' }));
    assert.equal(status.textContent, '消息已送达。新选题已进入待审核列表');
    const firstAnnouncement = status.firstElementChild;
    flushSync(() => showRealtimeToast({ title: '消息已送达', message: '新选题已进入待审核列表' }));
    assert.notEqual(status.firstElementChild, firstAnnouncement, '重复文案也应通过新节点触发下一次播报');

    const closeButtons = mount.querySelectorAll<HTMLButtonElement>('button[aria-label="关闭通知：消息已送达"]');
    const closeButton = closeButtons.item(0);
    assert.ok(closeButton, '关闭操作应具备包含通知标题的名称');
    assert.match(closeButton.className, /\bxmt-btn\b/, '关闭操作应使用项目按钮样式');
    assert.match(closeButton.className, /\bh-10\b/, '关闭操作高度应达到 40px');
    assert.match(closeButton.className, /\bw-10\b/, '关闭操作宽度应达到 40px');

    flushSync(() => closeButton.click());
    assert.equal(mount.querySelectorAll('.animate-slide-in').length, 1, '关闭单条视觉提示不应删除同组的另一条提示');
    flushSync(() => mount.querySelector<HTMLButtonElement>('button[aria-label="关闭通知：消息已送达"]')!.click());
    assert.equal(mount.querySelector('.animate-slide-in'), null, '关闭后应移除可视提示');
    assert.equal(status.textContent, '消息已送达。新选题已进入待审核列表', '关闭视觉提示不应清除已发出的播报');
  } finally {
    flushSync(() => root.unmount());
    dom.window.close();
  }
});
