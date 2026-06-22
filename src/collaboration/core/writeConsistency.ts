import type { Schema } from '@tiptap/pm/model';
import * as Y from 'yjs';
import type { SocketYjsProvider } from '../yjs/SocketYjsProvider';

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
  onStatusChange?: (status: 'saving' | 'synced' | 'error') => void;
  onSynced?: (content: string) => void;
  onError?: (error: unknown) => void;
}

export interface SyncToYjsOptions {
  provider?: SocketYjsProvider | null;
  contentJson?: Record<string, unknown>;
  schema?: Schema;
  snapshotUpdate?: number[] | Uint8Array;
  targetDoc?: Y.Doc;
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
    onStatusChange?.('synced');
    return;
  }

  cancelDatabaseSync(docId);
  onStatusChange?.('saving');

  const timer = setTimeout(() => {
    databaseTimers.delete(docId);
    persist(content)
      .then(() => {
        onSynced?.(content);
        onStatusChange?.('synced');
      })
      .catch((error) => {
        onError?.(error);
        onStatusChange?.('error');
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
}: SyncToYjsOptions) {
  if (snapshotUpdate && targetDoc) {
    Y.applyUpdate(targetDoc, snapshotUpdate instanceof Uint8Array ? snapshotUpdate : Uint8Array.from(snapshotUpdate));
    return true;
  }

  if (!provider || !contentJson || !schema) {
    return false;
  }

  return provider.applyInitialContentOnce(contentJson, schema);
}
