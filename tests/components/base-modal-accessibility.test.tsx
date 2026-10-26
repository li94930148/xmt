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
const BaseModal = (await import('../../src/components/common/BaseModal')).default;
const DailyReportDetailDrawer = (await import('../../src/components/daily-report/DailyReportDetailDrawer')).default;
let parentCloseRequests = 0;

function ModalHarness() {
  const [open, setOpen] = React.useState(false);
  const [nestedOpen, setNestedOpen] = React.useState(false);
  const [parentBusy, setParentBusy] = React.useState(true);

  return React.createElement(React.Fragment, null,
    React.createElement('button', { id: 'modal-opener', onClick: () => setOpen(true) }, '打开主弹窗'),
    React.createElement('button', { id: 'release-parent-busy', onClick: () => setParentBusy(false) }, '结束忙碌状态'),
    React.createElement(BaseModal, {
      open,
      onClose: () => {
        if (parentBusy) {
          parentCloseRequests += 1;
          return;
        }
        setOpen(false);
      },
      closeOnEscape: true,
      title: '主弹窗',
    },
    React.createElement('button', { id: 'parent-autofocus', 'data-modal-autofocus': '' }, '主弹窗首项'),
    React.createElement('button', { id: 'open-nested', onClick: () => setNestedOpen(true) }, '打开子弹窗'),
    React.createElement('button', { id: 'parent-last' }, '主弹窗末项')),
    React.createElement(BaseModal, {
      open: nestedOpen,
      onClose: () => setNestedOpen(false),
      closeOnEscape: false,
      title: '子弹窗',
    },
    React.createElement('button', { id: 'child-autofocus', 'data-modal-autofocus': '' }, '子弹窗首项'),
    React.createElement('button', { id: 'child-last' }, '子弹窗末项')),
  );
}

const drawerReport = {
  id: 1101,
  userId: 1102,
  userName: '日报测试成员',
  reportDate: '2026-10-23',
  status: 'submitted' as const,
  manualSummaryMd: '',
  riskLevel: 'normal' as const,
  version: 1,
  items: [{ sectionKey: 'today', title: '今日工作', contentMd: '完成模态交互验收' }],
};

function DailyReportDrawerHarness() {
  const [open, setOpen] = React.useState(false);
  return React.createElement(React.Fragment, null,
    React.createElement('button', { id: 'drawer-opener', onClick: () => setOpen(true) }, '打开日报详情'),
    React.createElement(DailyReportDetailDrawer, { report: open ? drawerReport : null, onClose: () => setOpen(false) }));
}

async function renderHarness() {
  document.body.innerHTML = '<div id="app-root" aria-hidden="false"></div><aside id="persistent" aria-hidden="false" inert=""></aside>';
  const mount = document.getElementById('app-root')!;
  const root = createRoot(mount);
  flushSync(() => root.render(React.createElement(ModalHarness)));
  return {
    root,
    cleanup() {
      flushSync(() => root.unmount());
    },
  };
}

function click(element: HTMLElement) {
  flushSync(() => element.click());
}

function pressKey(key: string, options: KeyboardEventInit = {}) {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  document.activeElement?.dispatchEvent(event);
  return event;
}

test('BaseModal 初始聚焦、Tab 圈定、嵌套栈、Escape 与背景状态均可独立验证', async () => {
  parentCloseRequests = 0;
  const { cleanup } = await renderHarness();
  try {
    const appRoot = document.getElementById('app-root')!;
    const persistent = document.getElementById('persistent')!;
    const opener = document.getElementById('modal-opener')!;
    opener.focus();

    click(opener);
    let dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
    assert.equal(dialogs.length, 1, 'open=true 时应显示一个弹窗');
    assert.equal((document.activeElement as HTMLElement).id, 'parent-autofocus', '应优先聚焦 data-modal-autofocus');
    assert.equal(appRoot.getAttribute('aria-hidden'), 'true');
    assert.equal(appRoot.hasAttribute('inert'), true);
    assert.equal(persistent.getAttribute('aria-hidden'), 'true');
    assert.equal(persistent.hasAttribute('inert'), true);
    assert.equal(dialogs[0].hasAttribute('inert'), false, '栈顶弹窗应保持可交互');
    assert.equal(dialogs[0].hasAttribute('aria-hidden'), false);

    document.getElementById('parent-last')!.focus();
    const forwardTab = pressKey('Tab');
    assert.equal(forwardTab.defaultPrevented, true, '从末项 Tab 应被圈回首项');
    assert.equal((document.activeElement as HTMLElement).getAttribute('aria-label'), '关闭弹窗', '首个 Tab 顺序控件应接收焦点');

    const backwardTab = pressKey('Tab', { shiftKey: true });
    assert.equal(backwardTab.defaultPrevented, true, '从首项 Shift+Tab 应被圈到末项');
    assert.equal((document.activeElement as HTMLElement).id, 'parent-last');

    const backgroundAddedWhileOpen = document.createElement('div');
    backgroundAddedWhileOpen.id = 'late-background';
    document.body.appendChild(backgroundAddedWhileOpen);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(backgroundAddedWhileOpen.getAttribute('aria-hidden'), 'true', '弹窗打开期间新增的 body 子项也应隔离');
    assert.equal(backgroundAddedWhileOpen.hasAttribute('inert'), true);

    const nestedOpener = document.getElementById('open-nested')!;
    nestedOpener.focus();
    click(nestedOpener);
    dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
    assert.equal(dialogs.length, 2);
    assert.equal((document.activeElement as HTMLElement).id, 'child-autofocus');
    assert.equal(dialogs[0].hasAttribute('inert'), true, '下层弹窗应不可交互');
    assert.equal(dialogs[0].getAttribute('aria-hidden'), 'true', '下层弹窗应从辅助技术树隐藏');
    assert.equal(dialogs[1].hasAttribute('inert'), false, '只有栈顶弹窗可交互');
    assert.equal(appRoot.getAttribute('aria-hidden'), 'true', '嵌套弹窗期间背景仍应隔离');

    pressKey('Escape');
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 2, 'Escape 不允许关闭栈顶子弹窗时，不得穿透关闭父弹窗');

    click(dialogs[1].querySelector<HTMLElement>('button[aria-label="关闭弹窗"]')!);
    dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
    assert.equal(dialogs.length, 1, '关闭子弹窗后应只保留父弹窗');
    assert.equal(dialogs[0].hasAttribute('inert'), false, '子弹窗关闭后父弹窗应恢复可交互');
    assert.equal(dialogs[0].hasAttribute('aria-hidden'), false);
    assert.equal((document.activeElement as HTMLElement).id, 'open-nested', '关闭子弹窗后焦点应回到打开它的父层控件');
    assert.equal(appRoot.getAttribute('aria-hidden'), 'true', '父弹窗仍打开时不能恢复背景');

    flushSync(() => pressKey('Escape'));
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1, '忙碌态下应尊重调用方 onClose guard');
    assert.equal(parentCloseRequests, 1, 'Escape 只应提交给栈顶弹窗一次');
    click(document.getElementById('release-parent-busy')!);
    flushSync(() => pressKey('Escape'));
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 0, '父弹窗栈顶且允许 Escape 时应关闭');
    assert.equal(appRoot.hasAttribute('inert'), false, '最后一个弹窗关闭后应恢复背景原始 inert 状态');
    assert.equal(appRoot.getAttribute('aria-hidden'), 'false', '最后一个弹窗关闭后应恢复 aria-hidden 原值');
    assert.equal(persistent.hasAttribute('inert'), true, '原本 inert 的背景项应仍保留 inert');
    assert.equal(persistent.getAttribute('aria-hidden'), 'false', '背景 aria-hidden 原值应精确恢复');
    assert.equal(backgroundAddedWhileOpen.hasAttribute('inert'), false, '新背景项关闭后应恢复到其初始状态');
    assert.equal(backgroundAddedWhileOpen.hasAttribute('aria-hidden'), false);
    assert.equal((document.activeElement as HTMLElement).id, 'modal-opener', '最后一个弹窗关闭后应恢复到最初打开控件');
  } finally {
    cleanup();
  }
});

test('日报详情抽屉复用模态语义、焦点圈定、Escape 关闭与触发点恢复', async () => {
  document.body.innerHTML = '<div id="drawer-app-root"></div><main id="drawer-background"></main>';
  const mount = document.getElementById('drawer-app-root')!;
  const root = createRoot(mount);
  flushSync(() => root.render(React.createElement(DailyReportDrawerHarness)));

  try {
    const opener = document.getElementById('drawer-opener')!;
    opener.focus();
    click(opener);

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const closeButton = dialog.querySelector<HTMLButtonElement>('button[aria-label="关闭日报详情"]')!;
    const labelledBy = dialog.getAttribute('aria-labelledby')!.split(' ');
    assert.equal(dialog.getAttribute('aria-modal'), 'true', 'the drawer must be announced as a modal dialog');
    assert.deepEqual(labelledBy.map((id) => document.getElementById(id)?.textContent), ['日报详情', '日报测试成员']);
    assert.equal(document.activeElement, closeButton, 'opening the drawer moves focus to its close control');
    assert.match(closeButton.className, /\bh-10\b/);
    assert.match(closeButton.className, /\bw-10\b/);
    assert.equal(document.getElementById('drawer-app-root')?.hasAttribute('inert'), true, 'the app background is inert while the drawer is open');

    const tab = pressKey('Tab');
    assert.equal(tab.defaultPrevented, true, 'Tab remains within the drawer');
    assert.equal(document.activeElement, closeButton);
    const shiftTab = pressKey('Tab', { shiftKey: true });
    assert.equal(shiftTab.defaultPrevented, true, 'Shift+Tab remains within the drawer');
    assert.equal(document.activeElement, closeButton);

    flushSync(() => pressKey('Escape'));
    assert.equal(document.querySelector('[role="dialog"]'), null, 'Escape closes the drawer');
    assert.equal(document.getElementById('drawer-app-root')?.hasAttribute('inert'), false, 'closing restores the page background');
    assert.equal(document.activeElement, opener, 'closing returns focus to the control that opened the drawer');
  } finally {
    flushSync(() => root.unmount());
  }
});
