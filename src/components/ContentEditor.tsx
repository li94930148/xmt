import Editor from './editor/Editor';
import RichTextEditor from './RichTextEditor';
import { useAuthStore } from '../store';
import { useSocket } from '../hooks/useSocket';
import { useCollaborativeDocument } from '../collaboration/yjs/useCollaborativeDocument';

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
  collaborationKey?: string;
  collaborationEnabled?: boolean;
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
  collaborationKey,
  collaborationEnabled = Boolean(collaborationKey),
}: ContentEditorProps) {
  const resolvedReadOnly = readOnly || mode === 'readonly';
  const wrapperStyle = minHeight === undefined ? undefined : { minHeight };
  const socket = useSocket();
  const user = useAuthStore((state) => state.user);
  const collaboration = useCollaborativeDocument({
    enabled: mode === 'rich' && collaborationEnabled && !resolvedReadOnly,
    roomId: collaborationKey,
    socket,
    user,
  });
  const editorCollaboration = collaboration.provider
    ? {
        provider: collaboration.provider,
        users: collaboration.users,
        connected: collaboration.connected,
      }
    : undefined;

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
        collaboration={editorCollaboration}
      />
    </div>
  );
}
