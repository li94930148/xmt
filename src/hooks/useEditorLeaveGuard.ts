import { useCallback, useRef, useState } from 'react';
import type {
  AggregateDisposeResult,
  ContentEditorRuntimeHandle,
  GracefulDisposeReason,
} from '../editor/contracts/contentEditorAdapter';

export type EditorLeaveGuardState =
  | 'idle'
  | 'leaving'
  | 'disposing'
  | 'waiting_confirmation'
  | 'completed';

export interface EditorRuntimeHandleRef {
  current: ContentEditorRuntimeHandle | null;
}

export interface EditorLeaveRequest {
  reason: GracefulDisposeReason;
  continuation: () => void | Promise<void>;
  timeoutMs?: number;
}

export interface EditorLeaveGuardResult {
  decision: 'proceeded' | 'waiting_confirmation';
  disposeResult?: AggregateDisposeResult;
  warning?: 'collaboration_unconfirmed';
}

/** Explicit outcome for a dialog action; `null` is never a business result. */
export type LeaveActionResult =
  | { decision: 'proceeded'; result: EditorLeaveGuardResult }
  | { decision: 'waiting_confirmation'; result: EditorLeaveGuardResult }
  | { decision: 'cancelled' }
  | { decision: 'failed'; error: unknown };

export interface EditorLeaveGuardSnapshot {
  state: EditorLeaveGuardState;
  result: EditorLeaveGuardResult | null;
}

export interface UseEditorLeaveGuardOptions {
  runtimeHandleRef: EditorRuntimeHandleRef;
  timeoutMs?: number;
}

type SnapshotListener = (snapshot: EditorLeaveGuardSnapshot) => void;

/**
 * Framework-independent leave orchestration. It is exported for mock testing;
 * pages should use the hook below rather than instantiate it directly.
 */
export class EditorLeaveGuardController {
  private state: EditorLeaveGuardState = 'idle';
  private result: EditorLeaveGuardResult | null = null;
  private inFlight: Promise<EditorLeaveGuardResult> | null = null;
  private pendingRequest: EditorLeaveRequest | null = null;
  private hasProceeded = false;

  constructor(
    private readonly getHandle: () => ContentEditorRuntimeHandle | null,
    private readonly defaultTimeoutMs: number,
    private readonly onChange: SnapshotListener,
  ) {}

  requestLeave(request: EditorLeaveRequest): Promise<EditorLeaveGuardResult> {
    if (this.inFlight) return this.inFlight;
    if (this.state === 'completed' && this.result) return Promise.resolve(this.result);

    this.pendingRequest = request;
    this.publish('leaving', null);
    const handle = this.getHandle();
    if (!handle) {
      return this.track(this.proceed(request, { decision: 'proceeded' }));
    }

    this.publish('disposing', null);
    const promise = handle.gracefulDispose({
      reason: request.reason,
      timeoutMs: request.timeoutMs ?? this.defaultTimeoutMs,
    }).then((disposeResult) => {
      if (disposeResult.outcome === 'durable') {
        return this.proceed(request, {
          decision: 'proceeded',
          disposeResult,
          ...(disposeResult.degraded ? { warning: 'collaboration_unconfirmed' as const } : {}),
        });
      }

      const result: EditorLeaveGuardResult = {
        decision: 'waiting_confirmation',
        disposeResult,
      };
      this.publish('waiting_confirmation', result);
      return result;
    });

    return this.track(promise);
  }

  async retry(): Promise<LeaveActionResult> {
    if (!this.pendingRequest || this.state !== 'waiting_confirmation') return { decision: 'cancelled' };
    try {
      return this.toLeaveActionResult(await this.requestLeave(this.pendingRequest));
    } catch (error: unknown) {
      return { decision: 'failed', error };
    }
  }

  async discardAndLeave(): Promise<LeaveActionResult> {
    if (!this.pendingRequest || this.inFlight || this.state !== 'waiting_confirmation') return { decision: 'cancelled' };

    const request = this.pendingRequest;
    this.publish('leaving', this.result);
    const promise = Promise.resolve(this.getHandle()?.destroy())
      .then(() => this.proceed(request, { decision: 'proceeded', disposeResult: this.result?.disposeResult }));
    try {
      return this.toLeaveActionResult(await this.track(promise));
    } catch (error: unknown) {
      return { decision: 'failed', error };
    }
  }

  private toLeaveActionResult(result: EditorLeaveGuardResult): LeaveActionResult {
    return result.decision === 'proceeded'
      ? { decision: 'proceeded', result }
      : { decision: 'waiting_confirmation', result };
  }

  private track(promise: Promise<EditorLeaveGuardResult>): Promise<EditorLeaveGuardResult> {
    const tracked = promise.finally(() => {
      if (this.inFlight === tracked) this.inFlight = null;
    });
    this.inFlight = tracked;
    return tracked;
  }

  private async proceed(
    request: EditorLeaveRequest,
    result: EditorLeaveGuardResult,
  ): Promise<EditorLeaveGuardResult> {
    if (!this.hasProceeded) {
      this.hasProceeded = true;
      await request.continuation();
    }
    this.pendingRequest = null;
    this.publish('completed', result);
    return result;
  }

  private publish(state: EditorLeaveGuardState, result: EditorLeaveGuardResult | null): void {
    this.state = state;
    this.result = result;
    this.onChange({ state, result });
  }
}

/**
 * Page-layer guard for controlled navigation. It never imports editor,
 * collaboration, business, or routing implementations.
 */
export function useEditorLeaveGuard({
  runtimeHandleRef,
  timeoutMs = 1500,
}: UseEditorLeaveGuardOptions) {
  const [snapshot, setSnapshot] = useState<EditorLeaveGuardSnapshot>({ state: 'idle', result: null });
  const handleRef = useRef(runtimeHandleRef);
  handleRef.current = runtimeHandleRef;
  const controllerRef = useRef<EditorLeaveGuardController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new EditorLeaveGuardController(
      () => handleRef.current.current,
      timeoutMs,
      setSnapshot,
    );
  }

  const requestLeave = useCallback((request: EditorLeaveRequest) => (
    controllerRef.current!.requestLeave(request)
  ), []);
  const retry = useCallback(() => controllerRef.current!.retry(), []);
  const discardAndLeave = useCallback(() => controllerRef.current!.discardAndLeave(), []);

  return {
    requestLeave,
    retry,
    discardAndLeave,
    state: snapshot.state,
    result: snapshot.result,
  };
}
