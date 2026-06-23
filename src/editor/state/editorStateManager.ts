import { useSyncExternalStore } from 'react';
import {
  emitEditorState,
  getEditorEventState,
  subscribeEditorState,
  type EditorStateEventType,
} from './editorStateEventBus';

export type EditorState = 'idle' | 'editing' | 'syncing' | 'saving' | 'conflicted' | 'synced';
export type UserActionType = 'local edit' | 'remote edit' | 'system sync';
export type ChangeOrigin = 'user' | 'remote' | 'snapshot' | 'system';

export interface EditorStateInput {
  docId?: string;
  isEditing?: boolean;
  isSyncing?: boolean;
  isSaving?: boolean;
  hasConflict?: boolean;
  isSynced?: boolean;
}

export function getEditorState(input: EditorStateInput = {}): EditorState {
  const eventType = editorStateInputToEvent(input);
  if (input.docId && eventType) {
    return emitEditorState(eventType, input.docId, { source: 'editorStateManager' });
  }

  if (input.docId) return getEditorEventState(input.docId);
  return eventType ? eventTypeToState(eventType) : 'idle';
}

export type EditorPersistenceState = Extract<EditorState, 'saving' | 'synced' | 'conflicted' | 'syncing'>;

export function normalizeEditorState(state?: string): EditorState {
  if (state === 'error') return 'conflicted';
  if (state === 'saved') return 'synced';
  if (state === 'saving' || state === 'syncing' || state === 'editing' || state === 'conflicted' || state === 'synced' || state === 'idle') {
    return state;
  }
  return 'idle';
}

function eventTypeToState(type: EditorStateEventType): EditorState {
  if (type === 'conflict:event') return 'conflicted';
  if (type === 'writeConsistency:save') return 'saving';
  if (type === 'writeConsistency:saved' || type === 'editor:synced') return 'synced';
  if (type === 'yjs:update' || type === 'collaboration:remote-change') return 'syncing';
  if (type === 'editor:local-change') return 'editing';
  return 'idle';
}

function editorStateInputToEvent(input: EditorStateInput): EditorStateEventType | null {
  if (input.hasConflict) return 'conflict:event';
  if (input.isSaving) return 'writeConsistency:save';
  if (input.isSyncing) return 'yjs:update';
  if (input.isEditing) return 'editor:local-change';
  if (input.isSynced) return 'editor:synced';
  return null;
}

export function getEditorStateForDoc(docId: string): EditorState {
  return getEditorEventState(docId);
}

export function useEditorEventState(docId?: string): EditorState {
  return useSyncExternalStore(
    (listener) => (docId ? subscribeEditorState(docId, listener) : () => undefined),
    () => (docId ? getEditorEventState(docId) : 'idle'),
    () => 'idle',
  );
}

export function detectUserActionType(event: { local?: boolean; remote?: boolean; system?: boolean } = {}): UserActionType {
  if (event.remote) return 'remote edit';
  if (event.system) return 'system sync';
  return 'local edit';
}

export function getChangeOrigin(event: { origin?: unknown; snapshot?: boolean; remote?: boolean } = {}): ChangeOrigin {
  if (event.snapshot) return 'snapshot';
  if (event.remote) return 'remote';
  if (event.origin === 'system') return 'system';
  return 'user';
}

export function editorStateLabel(state: EditorState) {
  const labels: Record<EditorState, string> = {
    idle: '已同步',
    editing: '正在编辑',
    syncing: '正在同步',
    saving: '正在保存',
    conflicted: '存在冲突',
    synced: '已同步',
  };
  return labels[state];
}
