import type { EditorState } from './editorStateManager';
import type { EditorStateEvent } from './editorStateEventBus';

export function reduceEditorState(state: EditorState, event: EditorStateEvent): EditorState {
  if (event.type === 'conflict:event') return 'conflicted';
  if (state === 'conflicted' && event.type !== 'writeConsistency:save') return state;

  if (event.type === 'writeConsistency:save') return 'saving';
  if (event.type === 'writeConsistency:saved') return 'synced';
  if (event.type === 'yjs:update') return 'syncing';
  if (event.type === 'collaboration:remote-change') return 'syncing';
  if (event.type === 'editor:local-change') return 'editing';
  if (event.type === 'editor:synced') return 'synced';

  return state;
}

export function reduceEditorStateBatch(state: EditorState, events: EditorStateEvent[]): EditorState {
  const ordered = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const latest = ordered[ordered.length - 1];

  if (!latest) return state;
  if (ordered.some((event) => event.type === 'conflict:event')) return 'conflicted';
  if (latest.type === 'writeConsistency:saved' || latest.type === 'editor:synced') return 'synced';
  if (ordered.some((event) => event.type === 'writeConsistency:save')) return 'saving';
  if (ordered.some((event) => event.type === 'yjs:update' || event.type === 'collaboration:remote-change')) return 'syncing';

  let next = state;

  for (const event of ordered) {
    next = reduceEditorState(next, event);
  }

  return next;
}
