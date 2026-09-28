import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from '../../src/components/editor/extensions/editorExtensions';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  MutationObserver: dom.window.MutationObserver,
  getSelection: dom.window.getSelection.bind(dom.window),
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });

test('查找仅产生视图高亮，替换走正文事务并可撤销', () => {
  const editor = new Editor({
    extensions: createEditorExtensions(),
    content: '<p>苹果 香蕉 苹果</p>',
  });
  try {
    const original = editor.getHTML();
    editor.commands.setSearchTerm('苹果');
    assert.equal(editor.storage.findAndReplace.results.length, 2);
    assert.equal(editor.getHTML(), original, '查找不得改变持久化正文');

    editor.commands.setReplaceTerm('梨');
    editor.commands.replaceAll();
    assert.equal(editor.getText(), '梨 香蕉 梨');
    editor.commands.undo();
    assert.equal(editor.getHTML(), original, '替换应进入标准撤销历史');

    editor.commands.clearSearch();
    assert.equal(editor.storage.findAndReplace.results.length, 0);
  } finally {
    editor.destroy();
  }
});
