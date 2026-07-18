import type { Schema } from '@tiptap/pm/model';
import * as Y from 'yjs';
import type { SocketYjsProvider } from '../yjs/SocketYjsProvider';
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

export interface SyncToYjsOptions {
  provider?: SocketYjsProvider | null;
  contentJson?: Record<string, unknown>;
  schema?: Schema;
  snapshotUpdate?: number[] | Uint8Array;
  targetDoc?: Y.Doc;
  docId?: string;
}

export function defineWriteSource(state: Omit<WriteSourceState, 'source'>): WriteSourceState {
  if (state.hasSnapshotState || state.hasYjsState) {
    return { ...state, source: state.hasSnapshotState ? 'snapshot-recovery' : 'yjs-runtime' };
  }

  if (state.hasDatabaseContent) {
    return { ...state, source: 'database-persistence' };
  }

  return { ...state, source: 'empty' };
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
