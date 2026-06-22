export type EditorState = 'idle' | 'editing' | 'syncing' | 'saving' | 'conflicted';
export type UserActionType = 'local edit' | 'remote edit' | 'system sync';
export type ChangeOrigin = 'user' | 'remote' | 'snapshot' | 'system';

export interface EditorStateInput {
  isEditing?: boolean;
  isSyncing?: boolean;
  isSaving?: boolean;
  hasConflict?: boolean;
}

export function getEditorState(input: EditorStateInput = {}): EditorState {
  if (input.hasConflict) return 'conflicted';
  if (input.isSaving) return 'saving';
  if (input.isSyncing) return 'syncing';
  if (input.isEditing) return 'editing';
  return 'idle';
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
  };
  return labels[state];
}
