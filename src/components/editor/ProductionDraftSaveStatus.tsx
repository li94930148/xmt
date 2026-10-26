import { useCallback, useSyncExternalStore } from 'react';
import { getLastEditorStateEvent, subscribeEditorState } from '@/editor/state/editorStateEventBus';
import { useEditorEventState } from '@/editor/state/editorStateManager';

type ProductionDraftSaveStatusProps = {
  docId: string;
  userId?: number;
  testId?: string;
  className?: string;
};

export function ProductionDraftSaveStatus({
  docId,
  userId,
  testId = 'production-draft-save-status',
  className = '',
}: ProductionDraftSaveStatusProps) {
  const state = useEditorEventState(docId);
  const subscribe = useCallback((listener: () => void) => subscribeEditorState(docId, listener), [docId]);
  const getSnapshot = useCallback(() => getLastEditorStateEvent(docId), [docId]);
  const event = useSyncExternalStore(subscribe, getSnapshot, () => null);
  let label = '保存状态未确认';
  let tone = 'text-studio-text-secondary';

  if (userId !== undefined && event?.metadata?.userId === userId) {
    if (state === 'conflicted') {
      label = '保存异常待确认';
      tone = 'text-studio-coral-contrast';
    } else if (state === 'saving' && event.type === 'writeConsistency:save') {
      label = '正在保存';
      tone = 'text-studio-primary-contrast';
    } else if (state === 'synced' && event.type === 'writeConsistency:saved') {
      label = '本次会话已确认保存';
      tone = 'text-studio-success-contrast';
    } else if (state === 'editing' && event.type === 'editor:local-change') {
      label = '有修改待保存';
      tone = 'text-studio-amber-contrast';
    } else if (state === 'syncing' && (event.type === 'yjs:update' || event.type === 'collaboration:remote-change')) {
      label = '同步中，保存结果未确认';
      tone = 'text-studio-cyan-contrast';
    }
  }

  return <small role="status" aria-live="polite" data-testid={testId} className={`text-xs ${tone} ${className}`.trim()}>{label}</small>;
}
