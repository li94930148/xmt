import assert from 'node:assert/strict';
import test from 'node:test';
import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { createEditorExtensions } from '../../src/components/editor/extensions/editorExtensions';
import { captureFormatSnapshot, createFormatPainterTransaction, type FormatSnapshot } from '../../src/components/editor/formatPainter';

const schema = getSchema(createEditorExtensions());

function stateFor(content: Record<string, unknown>, from: number, to: number) {
  const doc = schema.nodeFromJSON(content);
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
}

function paint(state: EditorState, snapshot: FormatSnapshot) {
  const transaction = createFormatPainterTransaction(state, snapshot);
  assert.ok(transaction, '应为有效目标选区生成 ProseMirror transaction');
  return state.apply(transaction);
}

test('复制粗体、斜体、下划线、删除线，且保留目标正文', () => {
  const source = stateFor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '源', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }, { type: 'strike' }] }] }] }, 1, 2);
  const snapshot = captureFormatSnapshot(source);
  assert.ok(snapshot);
  const target = stateFor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '目标' }] }] }, 1, 3);
  const result = paint(target, snapshot);
  const text = result.doc.firstChild?.firstChild;
  assert.equal(text?.text, '目标');
  assert.deepEqual(text?.marks.map((mark) => mark.type.name).sort(), ['bold', 'italic', 'strike', 'underline']);
});

test('复制文字颜色与高亮颜色', () => {
  const source = stateFor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '源', marks: [{ type: 'textStyle', attrs: { color: '#ef4444' } }, { type: 'highlight', attrs: { color: 'yellow' } }] }] }] }, 1, 2);
  const snapshot = captureFormatSnapshot(source);
  assert.ok(snapshot);
  const target = stateFor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '目标', marks: [{ type: 'textStyle', attrs: { color: '#3b82f6' } }] }] }] }, 1, 3);
  const result = paint(target, snapshot);
  const marks = result.doc.firstChild?.firstChild?.marks ?? [];
  assert.equal(marks.find((mark) => mark.type.name === 'textStyle')?.attrs.color, '#ef4444');
  assert.equal(marks.find((mark) => mark.type.name === 'highlight')?.attrs.color, 'yellow');
});

test('H2、居中与首行缩进按块格式复制', () => {
  const source = stateFor({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: '源' }] }] }, 1, 2);
  const headingSnapshot = captureFormatSnapshot(source);
  assert.ok(headingSnapshot);
  const target = stateFor({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null, textIndent: '2em' }, content: [{ type: 'text', text: '目标' }] }] }, 1, 3);
  const headingResult = paint(target, headingSnapshot);
  assert.equal(headingResult.doc.firstChild?.type.name, 'heading');
  assert.equal(headingResult.doc.firstChild?.attrs.level, 2);
  assert.equal(headingResult.doc.firstChild?.attrs.textAlign, 'center');

  const paragraphSource = stateFor({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center', textIndent: '2em' }, content: [{ type: 'text', text: '源' }] }] }, 1, 2);
  const paragraphSnapshot = captureFormatSnapshot(paragraphSource);
  assert.ok(paragraphSnapshot);
  const headingTarget = stateFor({ type: 'doc', content: [{ type: 'heading', attrs: { level: 3, textAlign: 'left' }, content: [{ type: 'text', text: '目标' }] }] }, 1, 3);
  const paragraphResult = paint(headingTarget, paragraphSnapshot);
  assert.equal(paragraphResult.doc.firstChild?.type.name, 'paragraph');
  assert.equal(paragraphResult.doc.firstChild?.attrs.textIndent, '2em');
});

test('链接和批注标记不会复制', () => {
  const source = stateFor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '源', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://baidu.com', target: '_blank', rel: 'noopener noreferrer nofollow', class: null } }, { type: 'comment', attrs: { commentId: 'comment-1', commentText: '业务批注', createdAt: '2026-08-14' } }] }] }] }, 1, 2);
  const snapshot = captureFormatSnapshot(source);
  assert.ok(snapshot);
  assert.deepEqual(snapshot.marks.map((mark) => mark.type.name), ['bold']);
  const target = stateFor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '目标' }] }] }, 1, 3);
  const result = paint(target, snapshot);
  assert.deepEqual(result.doc.firstChild?.firstChild?.marks.map((mark) => mark.type.name), ['bold']);
});

test('空目标选区不会生成 transaction', () => {
  const source = stateFor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '源', marks: [{ type: 'bold' }] }] }] }, 1, 2);
  const snapshot = captureFormatSnapshot(source);
  assert.ok(snapshot);
  const target = stateFor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '目标' }] }] }, 1, 1);
  assert.equal(createFormatPainterTransaction(target, snapshot), null);
});
