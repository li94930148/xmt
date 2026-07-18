import { useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import BaseModal from '../common/BaseModal';
import { useThemeStyles } from '../../hooks/useThemeStyles';
import type {
  EditorLeaveGuardResult,
  EditorLeaveGuardState,
  LeaveActionResult,
} from '../../hooks/useEditorLeaveGuard';

export interface EditorLeaveFailureDialogProps {
  open: boolean;
  state: EditorLeaveGuardState;
  result: EditorLeaveGuardResult | null;
  onContinueEditing: () => void;
  onRetry: () => LeaveActionResult | Promise<LeaveActionResult>;
  onDiscardAndLeave: () => LeaveActionResult | Promise<LeaveActionResult>;
}

export interface EditorLeaveFailureDialogView {
  title: string;
  description: string;
  retryAvailable: boolean;
}

export type EditorLeaveFailureAction = 'retry' | 'discard';

export type EditorLeaveFailureActionState =
  | 'idle'
  | 'action_pending'
  | 'action_running'
  | 'action_completed';

export interface EditorLeaveFailureActionSnapshot {
  state: EditorLeaveFailureActionState;
  winner: EditorLeaveFailureAction | null;
}

export interface EditorLeaveFailureActionResult {
  winner: EditorLeaveFailureAction | null;
  accepted: boolean;
  result: LeaveActionResult;
}

/** Maps only generic leave-guard outcomes to page copy; no business state leaks here. */
export function getEditorLeaveFailureDialogView(
  result: EditorLeaveGuardResult | null,
): EditorLeaveFailureDialogView | null {
  const disposeResult = result?.disposeResult;
  if (result?.decision !== 'waiting_confirmation' || !disposeResult) return null;

  if (disposeResult.outcome === 'not_durable') {
    const timedOut = disposeResult.durability.status === 'timed_out';
    return {
      title: timedOut ? '保存确认超时' : '未能确认保存',
      description: timedOut
        ? '保存尚未在限定时间内完成确认。请留在当前页面后重试，或明确放弃本次未确认的修改。'
        : '保存未完成确认。请留在当前页面后重试，或明确放弃本次未确认的修改。',
      retryAvailable: true,
    };
  }

  if (disposeResult.outcome === 'interrupted') {
    return {
      title: '保存过程已中断',
      description: '无法确认最后修改是否已保存。请继续编辑；如确认放弃未确认修改，可选择放弃离开。',
      retryAvailable: false,
    };
  }

  return null;
}

/**
 * First-action-wins gate. It locks the winner synchronously, before React can
 * render disabled button state, so stale event handlers cannot start a second
 * or conflicting action. Exported for deterministic component-level tests.
 */
export class EditorLeaveFailureActionGate {
  private snapshot: EditorLeaveFailureActionSnapshot = { state: 'idle', winner: null };

  constructor(private readonly onChange: (snapshot: EditorLeaveFailureActionSnapshot) => void = () => undefined) {}

  getSnapshot(): EditorLeaveFailureActionSnapshot {
    return this.snapshot;
  }

  run(
    action: EditorLeaveFailureAction,
    callback: () => LeaveActionResult | Promise<LeaveActionResult>,
  ): Promise<EditorLeaveFailureActionResult> {
    if (this.snapshot.state !== 'idle') {
      return Promise.resolve({ winner: this.snapshot.winner, accepted: false, result: { decision: 'cancelled' } });
    }

    this.publish('action_pending', action);
    // The winner is locked above, in the current event. Start its callback in
    // the following task so the failed leave request's `finally` can clear its
    // in-flight marker first. A microtask is too early: it can still observe
    // the just-failed request and make `retry()` a no-op.
    return new Promise<void>((resolve) => setTimeout(resolve, 0))
      .then(() => {
        this.publish('action_running', action);
        return callback();
      })
      .then((result) => {
        if (result.decision === 'proceeded') {
          this.publish('action_completed', action);
        } else {
          this.publish('idle', null);
        }
        return { winner: action, accepted: true, result };
      }, (error) => {
        // A failed winner is never replaced automatically, but a later user
        // action may retry after the failure has returned the dialog to idle.
        this.publish('idle', null);
        return { winner: action, accepted: true, result: { decision: 'failed', error } };
      });
  }

  private publish(state: EditorLeaveFailureActionState, winner: EditorLeaveFailureAction | null): void {
    this.snapshot = { state, winner };
    this.onChange(this.snapshot);
  }
}

export default function EditorLeaveFailureDialog({
  open,
  state,
  result,
  onContinueEditing,
  onRetry,
  onDiscardAndLeave,
}: EditorLeaveFailureDialogProps) {
  const styles = useThemeStyles();
  const view = getEditorLeaveFailureDialogView(result);
  const actionGateRef = useRef<EditorLeaveFailureActionGate | null>(null);
  const [actionSnapshot, setActionSnapshot] = useState<EditorLeaveFailureActionSnapshot>({
    state: 'idle',
    winner: null,
  });
  const [actionError, setActionError] = useState<string | null>(null);

  if (!actionGateRef.current) actionGateRef.current = new EditorLeaveFailureActionGate(setActionSnapshot);

  if (!open || !view) return null;

  const isBusy = actionSnapshot.state !== 'idle' || state === 'leaving' || state === 'disposing';
  const runAction = (action: EditorLeaveFailureAction, callback: () => LeaveActionResult | Promise<LeaveActionResult>) => {
    if (state === 'leaving' || state === 'disposing') return;
    setActionError(null);
    void actionGateRef.current!.run(action, callback).then(({ result }) => {
      if (result.decision === 'failed') setActionError('保存操作失败，请重试或继续编辑。');
    });
  };
  const close = () => {
    if (!isBusy) onContinueEditing();
  };

  return (
    <BaseModal
      open
      onClose={close}
      title={view.title}
      description={view.description}
      size="sm"
      closeOnOverlayClick={!isBusy}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={isBusy}
            className={`rounded-xl px-4 py-2.5 text-sm disabled:opacity-60 ${styles.buttonSecondary}`}
          >
            继续编辑
          </button>
          {view.retryAvailable ? (
            <button
              type="button"
              onClick={() => runAction('retry', onRetry)}
              disabled={isBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm text-white transition-colors hover:bg-brand-400 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {actionSnapshot.winner === 'retry' && isBusy ? '正在重试保存…' : '重试保存'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => runAction('discard', onDiscardAndLeave)}
            disabled={isBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {view.retryAvailable ? <AlertTriangle className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            {actionSnapshot.winner === 'discard' && isBusy ? '正在离开…' : '放弃离开'}
          </button>
        </div>
      }
    >
      {actionError ? <p className="mb-3 text-sm text-red-500">{actionError}</p> : null}
      <p className={`text-sm leading-6 ${styles.textSecondary}`}>
        放弃离开会停止当前编辑器的保存协调，未确认的最后修改可能无法恢复。
      </p>
    </BaseModal>
  );
}
