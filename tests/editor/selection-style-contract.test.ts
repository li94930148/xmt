import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testTokensDefineSelectionVars() {
  const tokens = read('src/styles/tokens.css');
  assert.ok(tokens.includes('--editor-selection-bg'), 'tokens 需定义 --editor-selection-bg');
  assert.ok(tokens.includes('--editor-selection-fg'), 'tokens 需定义 --editor-selection-fg');
  assert.ok(/html\.light[\s\S]*--editor-selection-bg:\s*#2F5BFF/.test(tokens), '亮色 selection 应为中深蓝实色');
  assert.ok(/html\.light[\s\S]*--editor-selection-fg:\s*#FFFFFF/.test(tokens), '亮色 selection 文字应为白色');
  assert.ok(/--editor-selection-bg:\s*#5B8CFF/.test(tokens), '暗色 selection 应为较亮蓝');
  assert.ok(/--editor-selection-fg:\s*#FFFFFF/.test(tokens), '暗色 selection 文字应为近白');
}

function testIndexCssUsesEditorScopedSelection() {
  const css = read('src/index.css');
  assert.ok(css.includes('.tiptap *::selection'), 'Tiptap 子节点需要 selection 规则');
  assert.ok(css.includes('.rich-text-editor *::selection'), 'RichTextEditor 子节点需要 selection 规则');
  assert.ok(css.includes('::-moz-selection'), '需要 Firefox selection 规则');
  assert.ok(css.includes('var(--editor-selection-bg)'), 'selection 必须接入主题变量');
  assert.ok(css.includes('var(--editor-selection-fg)'), 'selection 文字必须接入主题变量');
  // 不允许旧的半透明弱选区继续作为编辑器选区
  assert.ok(!/\.tiptap[\s\S]{0,80}color-mix\(in srgb, var\(--xmt-primary\) 35%/.test(css), '编辑器 selection 不应再用 35% 透明 primary');
}

function testTiptapInjectedStylesCoverSelection() {
  const editor = read('src/components/editor/Editor.tsx');
  assert.ok(editor.includes('.tiptap *::selection'), 'Editor 注入样式需覆盖子节点 selection');
  assert.ok(editor.includes('var(--editor-selection-bg)'), 'Editor 注入样式需使用 selection 变量');
}

function testBubbleMenuKeepsSelectionFocus() {
  const bubble = read('src/components/editor/BubbleMenu.tsx');
  assert.ok(bubble.includes('keepEditorSelection'), 'BubbleMenu 需阻止按钮抢焦点');
  assert.ok(bubble.includes('onMouseDown={keepEditorSelection}'), '格式按钮需 keepEditorSelection');
  assert.ok(bubble.includes('event.preventDefault()'), 'keepEditorSelection 需 preventDefault');
}

function testDoesNotMutateDocumentData() {
  // selection 修复应是纯样式，不得在样式文件里改写文档颜色
  const css = read('src/index.css');
  assert.ok(!css.includes('span[style*="color: red"]'), '禁止按具体文档颜色硬编码处理');
}

testTokensDefineSelectionVars();
testIndexCssUsesEditorScopedSelection();
testTiptapInjectedStylesCoverSelection();
testBubbleMenuKeepsSelectionFocus();
testDoesNotMutateDocumentData();

console.log('selection-style-contract tests passed');
