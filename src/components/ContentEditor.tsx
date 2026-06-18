import Editor from './editor/Editor';
import RichTextEditor from './RichTextEditor';

export type ContentEditorMode = 'rich' | 'legacy' | 'readonly';

export interface ContentEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  onSave?: (value: string) => void;
  mode?: ContentEditorMode;
  minHeight?: string | number;
  className?: string;
}

const noop = () => {};

export default function ContentEditor({
  value,
  onChange = noop,
  readOnly = false,
  placeholder,
  onSave,
  mode = 'rich',
  minHeight,
  className = '',
}: ContentEditorProps) {
  const resolvedReadOnly = readOnly || mode === 'readonly';
  const wrapperStyle = minHeight === undefined ? undefined : { minHeight };

  if (mode === 'legacy') {
    return (
      <div className={className} style={wrapperStyle}>
        <RichTextEditor
          value={value}
          onChange={onChange}
          readOnly={resolvedReadOnly}
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <div className={className} style={wrapperStyle}>
      <Editor
        value={value}
        onChange={onChange}
        onSave={onSave ? () => onSave(value) : undefined}
        readOnly={resolvedReadOnly}
        placeholder={placeholder}
      />
    </div>
  );
}
