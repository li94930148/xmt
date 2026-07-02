/**
 * Markdown 预览组件
 * 接收 markdown string，渲染为 HTML 预览
 */
import { useMemo } from 'react';
import { markdownToHtml } from '../../utils/markdown';
import { useAppStore } from '../../store';
import { normalizeLegacyEditorHtmlTheme } from '../../utils/editorTheme';

interface MarkdownPreviewProps {
  markdown: string;
  className?: string;
}

export default function MarkdownPreview({ markdown, className }: MarkdownPreviewProps) {
  const appStore = useAppStore();
  const isDark = appStore.theme === 'dark';

  const html = useMemo(() => normalizeLegacyEditorHtmlTheme(markdownToHtml(markdown)), [markdown]);

  return (
    <div
      className={`editor-content-preview prose max-w-none p-6 ${
        isDark ? 'prose-invert' : ''
      } ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
