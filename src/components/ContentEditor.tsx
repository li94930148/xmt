import { useCallback, useEffect, useMemo, useRef } from 'react';
import Editor from './editor/Editor';
import RichTextEditor from './RichTextEditor';
import { useAuthStore } from '../store';
import { useSocket } from '../hooks/useSocket';
import { useCollaborativeDocument } from '../collaboration/yjs/useCollaborativeDocument';
import { explainAutoSave, explainChange } from '../editor/explain/editorExplain';
import { getEditingRegions, setActiveUsers } from '../editor/collaboration/editorPresence';
import { editorStateLabel, getEditorState, normalizeEditorState, useEditorEventState, type EditorState } from '../editor/state/editorStateManager';
import { emitEditorState } from '../editor/state/editorStateEventBus';
import { recordEditorTelemetry } from '../editor/telemetry/editorTelemetry';
import ContentEditorRuntime from '../editor/runtime/ContentEditorRuntime';
import {
  resolveContentEditorSaveStrategy,
  type ContentEditorAdapter,
  type ContentEditorRuntimeHandle,
  type ContentEditorSaveStatus,
} from '../editor/contracts/contentEditorAdapter';
import { RuntimeHandleBridge } from '../editor/runtime/RuntimeHandleBridge';

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
  pageScroll?: boolean;
  persistenceStatus?: EditorState;
  adapter?: ContentEditorAdapter;
  onRuntimeHandleChange?: (handle: ContentEditorRuntimeHandle | null) => void;
}

const noop = () => {};
const runtimeNoopPersist: ContentEditorAdapter['persist'] = async () => undefined;
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
  pageScroll = false,
  persistenceStatus = 'synced',
  adapter,
  onRuntimeHandleChange,
}: ContentEditorProps) {
  const resolvedReadOnly = readOnly || mode === 'readonly';
  const wrapperStyle = minHeight === undefined ? undefined : { minHeight };
  const socket = useSocket();
  const user = useAuthStore((state) => state.user);
  const editStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousValueRef = useRef(value);
  const runtimeHandleRef = useRef<ContentEditorRuntimeHandle | null>(null);
  const runtimeHandleBridgeRef = useRef<RuntimeHandleBridge | null>(null);
  if (!runtimeHandleBridgeRef.current) runtimeHandleBridgeRef.current = new RuntimeHandleBridge();
  const runtimeRevisionRef = useRef(0);
  const collaborationRequested = mode === 'rich' && collaborationEnabled && !resolvedReadOnly;
  const collaborationAvailable = collaborationRequested && Boolean(socket?.connected);
  const collaboration = useCollaborativeDocument({
    enabled: collaborationAvailable,
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
  const realtimeUnavailable = collaborationRequested && !socket?.connected;
  const collaborationSyncing = collaborationAvailable && collaboration.initializing;
  const normalizedPersistenceStatus = normalizeEditorState(persistenceStatus);
  const eventState = useEditorEventState(collaborationKey);
  const editorState = collaborationKey
    ? eventState === 'idle' && normalizedPersistenceStatus === 'synced'
      ? 'synced'
      : eventState
    : getEditorState({
        isSyncing: collaborationSyncing || persistenceStatus === 'syncing',
        isSaving: persistenceStatus === 'saving',
        hasConflict: normalizedPersistenceStatus === 'conflicted',
        isSynced: normalizedPersistenceStatus === 'synced',
      });
  const editingRegions = useMemo(() => getEditingRegions(collaboration.users), [collaboration.users]);
  const visibleEditingRegions = useMemo(() => editingRegions.slice(0, 2), [editingRegions]);
  const primaryHint = realtimeUnavailable
    ? '实时同步暂不可用，不影响普通编辑和保存。'
    : editingRegions[0]?.message || explainChange({ origin: 'system' }).message;
  const saveHint = persistenceStatus === 'saving'
    ? explainAutoSave('debounce')
    : editorStateLabel(editorState);
  const fallbackRuntimeAdapter = useMemo<ContentEditorAdapter>(() => ({
    documentId: collaborationKey || 'content-editor:unbound',
    collaborationRoom: collaborationKey || '',
    initialContent: value,
    readonly: resolvedReadOnly,
    capabilities: {
      collaboration: collaborationRequested,
      manualSave: Boolean(onSave),
      immersive,
      pageScroll,
    },
    saveStrategy: 'external',
    // Existing pages still own persistence through writeConsistency. The
    // Runtime handle is intentionally dormant until an adapter is introduced.
    persist: runtimeNoopPersist,
  }), [collaborationKey, collaborationRequested, immersive, onSave, pageScroll, resolvedReadOnly, value]);
  const runtimeAdapter = adapter || fallbackRuntimeAdapter;
  const saveStrategy = resolveContentEditorSaveStrategy(adapter);

  const handleRuntimeReady = useCallback((handle: ContentEditorRuntimeHandle) => {
    runtimeHandleRef.current = handle;
    runtimeHandleBridgeRef.current?.publish(handle);
  }, []);

  const handleRuntimeDisposed = useCallback((handle: ContentEditorRuntimeHandle) => {
    if (runtimeHandleRef.current === handle) runtimeHandleRef.current = null;
    runtimeHandleBridgeRef.current?.release(handle);
  }, []);

  useEffect(() => {
    runtimeHandleBridgeRef.current?.setListener(onRuntimeHandleChange);
  }, [onRuntimeHandleChange]);

  const handleRuntimeStatusChange = useCallback((status: ContentEditorSaveStatus) => {
    if (!adapter || !collaborationKey) return;
    if (status === 'saving') emitEditorState('writeConsistency:save', collaborationKey, { source: 'ContentEditorRuntime' });
    if (status === 'synced') emitEditorState('writeConsistency:saved', collaborationKey, { source: 'ContentEditorRuntime' });
    if (status === 'conflicted') emitEditorState('conflict:event', collaborationKey, { source: 'ContentEditorRuntime' });
  }, [adapter, collaborationKey]);

  const handleEditorChange = useCallback((content: string) => {
    onChange(content);
    if (saveStrategy !== 'autosave') return;
    runtimeRevisionRef.current += 1;
    runtimeHandleRef.current?.scheduleSave(content, runtimeRevisionRef.current);
  }, [onChange, saveStrategy]);

  useEffect(() => {
    runtimeRevisionRef.current = 0;
  }, [runtimeAdapter.documentId]);

  useEffect(() => {
    if (!collaborationKey) return;
    setActiveUsers(collaborationKey, collaboration.users);
  }, [collaborationKey, collaboration.users]);

  useEffect(() => {
    if (!collaborationKey) return;
    if (persistenceStatus === 'saving') {
      emitEditorState('writeConsistency:save', collaborationKey, { source: 'ContentEditor' });
      recordEditorTelemetry('save trigger', { docId: collaborationKey, reason: 'debounce' });
    }
    if (normalizedPersistenceStatus === 'synced') {
      emitEditorState('writeConsistency:saved', collaborationKey, { source: 'ContentEditor' });
    }
    if (persistenceStatus === 'syncing' || collaborationSyncing) {
      emitEditorState('yjs:update', collaborationKey, { source: 'ContentEditor' });
    }
    if (normalizedPersistenceStatus === 'conflicted') {
      emitEditorState('conflict:event', collaborationKey, { source: 'ContentEditor' });
      recordEditorTelemetry('conflict event', { docId: collaborationKey, reason: 'save failed' });
    }
  }, [collaborationKey, collaborationSyncing, normalizedPersistenceStatus, persistenceStatus]);

  useEffect(() => {
    if (!collaborationKey || editingRegions.length === 0) return;
    emitEditorState('collaboration:remote-change', collaborationKey, {
      users: editingRegions.map((region) => region.userName),
    });
    recordEditorTelemetry('remote edit', {
      docId: collaborationKey,
      users: editingRegions.map((region) => region.userName),
    });
  }, [collaborationKey, editingRegions]);

  useEffect(() => {
    if (!collaborationKey || value === previousValueRef.current) return;
    previousValueRef.current = value;
    emitEditorState('editor:local-change', collaborationKey);
    recordEditorTelemetry('edit start', { docId: collaborationKey });
    if (editStopTimerRef.current) clearTimeout(editStopTimerRef.current);
    editStopTimerRef.current = setTimeout(() => {
      recordEditorTelemetry('edit stop', { docId: collaborationKey });
    }, 1200);
  }, [collaborationKey, value]);

  useEffect(() => {
    return () => {
      if (editStopTimerRef.current) clearTimeout(editStopTimerRef.current);
      runtimeHandleRef.current = null;
      runtimeHandleBridgeRef.current?.dispose();
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
            realtimeUnavailable
              ? 'bg-amber-500/10 text-amber-500'
              : editorState === 'conflicted'
              ? 'bg-red-500/10 text-red-500'
              : editorState === 'saving' || editorState === 'syncing'
                ? 'bg-blue-500/10 text-blue-500'
                : 'bg-emerald-500/10 text-emerald-500'
          }`}>
            {realtimeUnavailable ? '实时同步离线' : saveHint}
          </span>
          {editingRegions.length > 0 ? (
            visibleEditingRegions.map((region) => (
              <span key={`${region.userId}-${region.region}`} className="text-gray-500 dark:text-gray-400">
                {region.message}
              </span>
            ))
          ) : (
            <span className="text-gray-500 dark:text-gray-400">{primaryHint}</span>
          )}
        </div>
      )}
      <ContentEditorRuntime
        adapter={runtimeAdapter}
        onReady={handleRuntimeReady}
        onDisposed={handleRuntimeDisposed}
        onStatusChange={handleRuntimeStatusChange}
      >
        {(runtime) => (
          <Editor
            value={value}
            onChange={handleEditorChange}
            onSave={onSave ? () => onSave(value) : undefined}
            readOnly={runtime.readonly}
            placeholder={placeholder}
            collaboration={editorCollaboration}
            immersive={runtime.capabilities.immersive}
            pageScroll={runtime.capabilities.pageScroll}
            stateDocId={collaborationKey}
          />
        )}
      </ContentEditorRuntime>
    </div>
  );
}
