import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';

interface FindReplacePanelProps {
  editor: Editor;
  readOnly: boolean;
  onClose: () => void;
}

export default function FindReplacePanel({ editor, readOnly, onClose }: FindReplacePanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const search = current.storage.findAndReplace;
      return {
        searchTerm: search.searchTerm,
        replaceTerm: search.replaceTerm,
        caseSensitive: search.caseSensitive,
        wholeWord: search.wholeWord,
        count: search.results.length,
        currentIndex: search.currentIndex,
      };
    },
  });

  useEffect(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
    return () => { if (!editor.isDestroyed) editor.commands.clearSearch(); };
  }, [editor]);

  const canNavigate = state.count > 0;
  const canReplace = !readOnly && editor.isEditable && canNavigate;
  const resultLabel = !state.searchTerm
    ? '输入关键词开始查找'
    : state.count === 0
      ? '无匹配结果'
      : `${(state.currentIndex ?? 0) + 1} / ${state.count}`;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--editor-border)] bg-[var(--editor-panel)] px-3 py-2 text-xs text-studio-text-secondary" role="search" aria-label="编辑器查找替换">
      <input
        ref={searchInputRef}
        className="xmt-field min-w-0 flex-[1_1_11rem]"
        aria-label="查找内容"
        placeholder="查找内容"
        value={state.searchTerm}
        onChange={(event) => editor.commands.setSearchTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (event.shiftKey) editor.commands.goToPreviousResult();
            else editor.commands.goToNextResult();
          }
          if (event.key === 'Escape') onClose();
        }}
      />
      <span className="min-w-20 text-center" aria-live="polite">{resultLabel}</span>
      <button type="button" className="xmt-btn xmt-btn-ghost" disabled={!canNavigate} onClick={() => editor.commands.goToPreviousResult()} aria-label="上一个匹配">上一个</button>
      <button type="button" className="xmt-btn xmt-btn-ghost" disabled={!canNavigate} onClick={() => editor.commands.goToNextResult()} aria-label="下一个匹配">下一个</button>
      <button type="button" className={`xmt-btn ${state.caseSensitive ? 'xmt-btn-primary' : 'xmt-btn-ghost'}`} aria-pressed={state.caseSensitive} onClick={() => editor.commands.setCaseSensitive(!state.caseSensitive)}>区分大小写</button>
      <button type="button" className={`xmt-btn ${state.wholeWord ? 'xmt-btn-primary' : 'xmt-btn-ghost'}`} aria-pressed={state.wholeWord} onClick={() => editor.commands.setWholeWord(!state.wholeWord)}>全词</button>
      {!readOnly && (
        <>
          <input
            className="xmt-field min-w-0 flex-[1_1_11rem]"
            aria-label="替换为"
            placeholder="替换为（可留空）"
            value={state.replaceTerm}
            onChange={(event) => editor.commands.setReplaceTerm(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
          />
          <button type="button" className="xmt-btn xmt-btn-ghost" disabled={!canReplace} onClick={() => editor.commands.replace()}>替换</button>
          <button type="button" className="xmt-btn xmt-btn-ghost" disabled={!canReplace} onClick={() => editor.commands.replaceAll()}>全部替换</button>
        </>
      )}
      <button type="button" className="xmt-btn xmt-btn-ghost" onClick={onClose} aria-label="关闭查找替换">关闭</button>
    </div>
  );
}
