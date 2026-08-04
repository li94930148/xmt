import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

export default function DailyReportRichSection({ value, onChange, placeholder, disabled = false }: { value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean }) {
  const editor = useEditor({ extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, horizontalRule: false }), TaskList, TaskItem.configure({ nested: false }), Placeholder.configure({ placeholder })], content: value, editable: !disabled, onUpdate: ({ editor: current }) => onChange(current.getHTML()) });
  useEffect(() => { if (editor && value !== editor.getHTML() && value !== '') editor.commands.setContent(value, { emitUpdate: false }); }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  return <div className="rounded-card border border-studio-border-soft bg-white/[0.04] px-4 py-3 text-sm leading-7 text-studio-text-primary focus-within:border-studio-border-active"><EditorContent editor={editor} /></div>;
}
