import { useEffect, useMemo, useRef } from 'react';
import Editor from './editor/Editor';
import RichTextEditor from './RichTextEditor';
import { useAuthStore } from '../store';
import { useSocket } from '../hooks/useSocket';
import { useCollaborativeDocument } from '../collaboration/yjs/useCollaborativeDocument';
import { explainAutoSave, explainChange } from '../editor/explain/editorExplain';
import { getEditingRegions, setActiveUsers } from '../editor/collaboration/editorPresence';
import { editorStateLabel, getEditorState } from '../editor/state/editorStateManager';
import { recordEditorTelemetry } from '../editor/telemetry/editorTelemetry';

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
  immersive?: boolean;
  persistenceStatus?: 'synced' | 'saving' | 'syncing' | 'error';
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
  immersive = false,
  persistenceStatus = 'synced',
}: ContentEditorProps) {
  const resolvedReadOnly = readOnly || mode === 'readonly';
  const wrapperStyle = minHeight === undefined ? undefined : { minHeight };
  const socket = useSocket();
  const user = useAuthStore((state) => state.user);
  const editStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousValueRef = useRef(value);
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
  const shouldWaitForCollaboration =
    mode === 'rich' && collaborationEnabled && !resolvedReadOnly && collaboration.initializing;
  const editorState = getEditorState({
    isSyncing: shouldWaitForCollaboration || persistenceStatus === 'syncing',
    isSaving: persistenceStatus === 'saving',
    hasConflict: persistenceStatus === 'error',
    isEditing: !resolvedReadOnly,
  });
  const editingRegions = useMemo(() => getEditingRegions(collaboration.users), [collaboration.users]);
  const primaryHint = editingRegions[0]?.message || explainChange({ origin: 'system' }).message;
  const saveHint = persistenceStatus === 'saving'
    ? explainAutoSave('debounce')
    : editorStateLabel(editorState);

  useEffect(() => {
    if (!collaborationKey) return;
    setActiveUsers(collaborationKey, collaboration.users);
  }, [collaborationKey, collaboration.users]);

  useEffect(() => {
    if (!collaborationKey) return;
    if (persistenceStatus === 'saving') {
      recordEditorTelemetry('save trigger', { docId: collaborationKey, reason: 'debounce' });
    }
    if (persistenceStatus === 'error') {
      recordEditorTelemetry('conflict event', { docId: collaborationKey, reason: 'save failed' });
    }
  }, [collaborationKey, persistenceStatus]);

  useEffect(() => {
    if (!collaborationKey || editingRegions.length === 0) return;
    recordEditorTelemetry('remote edit', {
      docId: collaborationKey,
      users: editingRegions.map((region) => region.userName),
    });
  }, [collaborationKey, editingRegions]);

  useEffect(() => {
    if (!collaborationKey || value === previousValueRef.current) return;
    previousValueRef.current = value;
    recordEditorTelemetry('edit start', { docId: collaborationKey });
    if (editStopTimerRef.current) clearTimeout(editStopTimerRef.current);
    editStopTimerRef.current = setTimeout(() => {
      recordEditorTelemetry('edit stop', { docId: collaborationKey });
    }, 1200);
  }, [collaborationKey, value]);

  useEffect(() => {
    return () => {
      if (editStopTimerRef.current) clearTimeout(editStopTimerRef.current);
    };
  }, []);

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
      {mode === 'rich' && collaborationEnabled && (
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200/60 px-4 py-2 text-xs dark:border-gray-800/80">
          <span className={`rounded-full px-2 py-0.5 ${
            editorState === 'conflicted'
              ? 'bg-red-500/10 text-red-500'
              : editorState === 'saving' || editorState === 'syncing'
                ? 'bg-blue-500/10 text-blue-500'
                : 'bg-emerald-500/10 text-emerald-500'
          }`}>
            {saveHint}
          </span>
          {editingRegions.length > 0 ? (
            editingRegions.slice(0, 2).map((region) => (
              <span key={`${region.userId}-${region.region}`} className="text-gray-500 dark:text-gray-400">
                {region.message}
              </span>
            ))
          ) : (
            <span className="text-gray-500 dark:text-gray-400">{primaryHint}</span>
          )}
        </div>
      )}
      {shouldWaitForCollaboration ? (
        <div
          className={`h-full overflow-y-auto ${immersive ? 'bg-white dark:bg-gray-900' : ''}`}
          aria-busy="true"
        >
          <div
            className="prose max-w-none px-4 py-8 sm:px-8 lg:px-16"
            dangerouslySetInnerHTML={{ __html: value || `<p>${placeholder || '正在加载协作文档...'}</p>` }}
          />
        </div>
      ) : (
        <Editor
          value={value}
          onChange={onChange}
          onSave={onSave ? () => onSave(value) : undefined}
          readOnly={resolvedReadOnly}
          placeholder={placeholder}
          collaboration={editorCollaboration}
          immersive={immersive}
        />
      )}
    </div>
  );
}
