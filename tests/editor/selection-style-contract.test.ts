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
  const darkTheme = tokens.match(/:root,\s*html\.dark,\s*\.xmt-theme-scope\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)?.[1];
  const lightTheme = tokens.match(/html\.light,\s*\.xmt-theme-scope\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(darkTheme, '需要暗色主题令牌块');
  assert.ok(lightTheme, '需要亮色主题令牌块');
  assert.match(darkTheme, /--xmt-selection-bg:\s*#5B8CFF;/, '暗色 selection 背景应为实色蓝');
  assert.match(darkTheme, /--xmt-selection-fg:\s*var\(--xmt-text-on-color-dark\);/, '暗色 selection 应使用深色高对比文字');
  assert.match(lightTheme, /--xmt-selection-bg:\s*#2F5BFF;/, '亮色 selection 背景应为中深蓝实色');
  assert.match(lightTheme, /--xmt-selection-fg:\s*var\(--xmt-text-on-color-light\);/, '亮色 selection 应使用白色高对比文字');
  assert.match(darkTheme, /--editor-selection-bg:\s*var\(--xmt-selection-bg\);/, '暗色编辑器选区需复用全局选区令牌');
  assert.match(lightTheme, /--editor-selection-bg:\s*var\(--xmt-selection-bg\);/, '亮色编辑器选区需复用全局选区令牌');
  assert.match(darkTheme, /--editor-selection-fg:\s*var\(--xmt-selection-fg\);/, '暗色编辑器选区文字需复用全局令牌');
  assert.match(lightTheme, /--editor-selection-fg:\s*var\(--xmt-selection-fg\);/, '亮色编辑器选区文字需复用全局令牌');
  const darkContrast = contrastRatio(
    themeColorToken(darkTheme, 'xmt-selection-bg'),
    themeColorToken(darkTheme, 'xmt-text-on-color-dark'),
  );
  const lightContrast = contrastRatio(
    themeColorToken(lightTheme, 'xmt-selection-bg'),
    themeColorToken(darkTheme, 'xmt-text-on-color-light'),
  );
  assert.ok(darkContrast >= 4.5, `暗色全局 selection 对比度为 ${darkContrast.toFixed(2)}:1，需达到 4.5:1`);
  assert.ok(lightContrast >= 4.5, `亮色全局 selection 对比度为 ${lightContrast.toFixed(2)}:1，需达到 4.5:1`);
}

function testIndexCssUsesGlobalAndEditorSelection() {
  const css = read('src/index.css');
  assert.match(css, /::selection,\s*\*::selection\s*\{[^}]*background-color:\s*var\(--xmt-selection-bg\);[^}]*color:\s*var\(--xmt-selection-fg\);/, '全局 selection 需覆盖普通文字及嵌套元素');
  assert.match(css, /::-moz-selection,\s*\*::-moz-selection\s*\{[^}]*background-color:\s*var\(--xmt-selection-bg\);[^}]*color:\s*var\(--xmt-selection-fg\);/, 'Firefox 全局 selection 需覆盖普通文字及嵌套元素');
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

function testToolbarToggleButtonsExposePressedState() {
  const toolbar = read('src/components/editor/Toolbar.tsx');
  const basicStart = toolbar.indexOf("if (variant === 'basic')");
  const coreStart = toolbar.indexOf('// 核心工具按钮（始终显示）');
  const moreMenuStart = toolbar.indexOf('// 折叠到"更多"菜单的按钮');
  const renderStart = toolbar.indexOf('return (', moreMenuStart);
  assert.ok(basicStart >= 0 && coreStart > basicStart && moreMenuStart > coreStart && renderStart > moreMenuStart, '需要可识别的 basic/full 工具栏边界');

  const basicToolbar = toolbar.slice(basicStart, coreStart);
  const fullToolbar = toolbar.slice(coreStart, renderStart);
  const assertPressedState = (section: string, state: string, label: string) => {
    const escaped = state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      section,
      new RegExp(`className=\\{btnClass\\(${escaped}\\)\\}[^>]*aria-pressed=\\{${escaped}\\}`),
      `${label}需将 aria-pressed 绑定到当前 editor.isActive 状态`,
    );
  };

  for (const mark of ['bold', 'italic', 'underline']) {
    assertPressedState(basicToolbar, `editor.isActive('${mark}')`, `基础工具栏 ${mark}`);
    assertPressedState(fullToolbar, `editor.isActive('${mark}')`, `完整工具栏 ${mark}`);
  }
  for (const list of ['bulletList', 'orderedList']) {
    assertPressedState(basicToolbar, `editor.isActive('${list}')`, `基础工具栏 ${list}`);
  }
  for (const mark of ['strike', 'blockquote', 'codeBlock', 'taskList']) {
    assertPressedState(fullToolbar, `editor.isActive('${mark}')`, `完整工具栏 ${mark}`);
  }
  for (const alignment of ['left', 'center', 'right', 'justify']) {
    assertPressedState(fullToolbar, `editor.isActive({ textAlign: '${alignment}' })`, `完整工具栏 ${alignment} 对齐`);
  }

  const indentToolbarButton = toolbar.split('\n').find((line) => line.includes('onClick={toggleFirstLineIndent}'));
  assert.ok(indentToolbarButton?.includes('aria-pressed={isTextIndentActive()}'), '完整工具栏首行缩进需报告当前切换状态');
  const indentMenuButton = toolbar.split('\n').find((line) => line.includes('toggleFirstLineIndent(); setShowMoreMenu(false);'));
  assert.ok(indentMenuButton?.includes('aria-pressed={isTextIndentActive()}'), '更多菜单首行缩进需报告当前切换状态');

  const linkCommands = toolbar.split('\n').filter((line) => line.includes('setLink()'));
  assert.ok(linkCommands.length >= 2, 'basic/full 工具栏都应覆盖打开链接对话框的命令');
  assert.ok(linkCommands.every((line) => !line.includes('aria-pressed')), '打开链接对话框的命令不应声明 toggle 状态');
}

function contrastRatio(background: string, foreground: string) {
  const luminance = (color: string) => {
    const channels = color.match(/[\da-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255);
    assert.equal(channels?.length, 3, `无效颜色: ${color}`);
    const linear = channels!.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const backgroundLuminance = luminance(background);
  const foregroundLuminance = luminance(foreground);
  return (Math.max(backgroundLuminance, foregroundLuminance) + 0.05) / (Math.min(backgroundLuminance, foregroundLuminance) + 0.05);
}

function themeColorToken(theme: string, token: string) {
  const match = theme.match(new RegExp(`--${token}:\\s*(#[\\da-f]{6});`, 'i'));
  assert.ok(match, `主题需要提供 --${token} 实色令牌`);
  return match[1];
}

testTokensDefineSelectionVars();
testIndexCssUsesGlobalAndEditorSelection();
testTiptapInjectedStylesCoverSelection();
testBubbleMenuKeepsSelectionFocus();
testDoesNotMutateDocumentData();
testToolbarToggleButtonsExposePressedState();

console.log('selection-style-contract tests passed');
