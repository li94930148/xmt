import type { Schema } from '@tiptap/pm/model';
import * as Y from 'yjs';
import type { SocketYjsProvider } from '../yjs/SocketYjsProvider';
import type { EditorPersistenceState } from '../../editor/state/editorStateManager';
import { emitEditorState } from '../../editor/state/editorStateEventBus';

export type CollaborationWriteSource = 'yjs-runtime' | 'database-persistence' | 'snapshot-recovery' | 'empty';
export type CollaborationDocKind = 'production' | 'shooting';

export interface WriteSourceState {
  source: CollaborationWriteSource;
  docId: string;
  hasYjsState: boolean;
  hasDatabaseContent: boolean;
  hasSnapshotState: boolean;
}

export interface SyncToDatabaseOptions {
  docId: string;
  content: string;
  previousContent: string;
  persist: (content: string) => Promise<void>;
  delay?: number;
  onStatusChange?: (status: Extract<EditorPersistenceState, 'saving' | 'synced' | 'conflicted'>) => void;
  onSynced?: (content: string) => void;
  onError?: (error: unknown) => void;
}

export interface SyncToYjsOptions {
  provider?: SocketYjsProvider | null;
  contentJson?: Record<string, unknown>;
  schema?: Schema;
  snapshotUpdate?: number[] | Uint8Array;
  targetDoc?: Y.Doc;
  docId?: string;
}

const databaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function defineWriteSource(state: Omit<WriteSourceState, 'source'>): WriteSourceState {
  if (state.hasSnapshotState || state.hasYjsState) {
    return { ...state, source: state.hasSnapshotState ? 'snapshot-recovery' : 'yjs-runtime' };
  }

  if (state.hasDatabaseContent) {
    return { ...state, source: 'database-persistence' };
  }

  return { ...state, source: 'empty' };
}

export function cancelDatabaseSync(docId: string) {
  const timer = databaseTimers.get(docId);
  if (!timer) return;
  clearTimeout(timer);
  databaseTimers.delete(docId);
}

export function syncToDatabase({
  docId,
  content,
  previousContent,
  persist,
  delay = 2500,
  onStatusChange,
  onSynced,
  onError,
}: SyncToDatabaseOptions) {
  if (content === previousContent) {
    emitEditorState('writeConsistency:saved', docId, { reason: 'unchanged' });
    onStatusChange?.('synced');
    return;
  }

  cancelDatabaseSync(docId);
  emitEditorState('writeConsistency:save', docId, { reason: 'debounce' });
  onStatusChange?.('saving');

  const timer = setTimeout(() => {
    databaseTimers.delete(docId);
    persist(content)
      .then(() => {
        onSynced?.(content);
        emitEditorState('writeConsistency:saved', docId);
        onStatusChange?.('synced');
      })
      .catch((error) => {
        onError?.(error);
        emitEditorState('conflict:event', docId, { reason: 'save failed' });
        onStatusChange?.('conflicted');
      });
  }, delay);

  databaseTimers.set(docId, timer);
}

export function syncToYjs({
  provider,
  contentJson,
  schema,
  snapshotUpdate,
  targetDoc,
  docId,
}: SyncToYjsOptions) {
  if (snapshotUpdate && targetDoc) {
    Y.applyUpdate(targetDoc, snapshotUpdate instanceof Uint8Array ? snapshotUpdate : Uint8Array.from(snapshotUpdate));
    return true;
  }

  if (!provider || !contentJson || !schema) {
    return false;
  }

  const applied = provider.applyInitialContentOnce(contentJson, schema);
  if (applied && docId) emitEditorState('yjs:update', docId, { reason: 'initial content' });
  return applied;
}
