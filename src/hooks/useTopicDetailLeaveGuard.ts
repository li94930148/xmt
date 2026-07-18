import { useCallback, useRef, useState } from 'react';

export type TopicLeaveGuardState = 'clean' | 'dirty' | 'saving' | 'failed' | 'cancelled';

export type TopicLeaveActionResult =
  | { decision: 'proceeded' }
  | { decision: 'waiting_confirmation' }
  | { decision: 'cancelled' }
  | { decision: 'failed'; error: unknown };

export interface TopicLeaveGuardOptions {
  isDirty: () => boolean;
  save: () => Promise<void>;
  discard: () => void;
}

type Continuation = () => void | Promise<void>;
type Listener = (state: TopicLeaveGuardState) => void;

/**
 * Page-form leave protection for TopicDetail. It intentionally knows nothing
 * about Runtime dispose, collaboration, or persistence transport; the page's
 * aggregate draft is the sole source of truth for whether navigation is safe.
 */
export class TopicLeaveGuardController {
  private state: TopicLeaveGuardState = 'clean';
  private pendingContinuation: Continuation | null = null;
  private inFlight: Promise<TopicLeaveActionResult> | null = null;
  private hasProceeded = false;

  constructor(
    private readonly options: TopicLeaveGuardOptions,
    private readonly onChange: Listener,
  ) {}

  requestLeave(continuation: Continuation): Promise<TopicLeaveActionResult> {
    if (this.inFlight) return this.inFlight;
    if (this.pendingContinuation) return Promise.resolve({ decision: 'waiting_confirmation' });
    this.hasProceeded = false;
    if (!this.options.isDirty()) return this.track(this.proceed(continuation));

    this.pendingContinuation = continuation;
    this.publish('dirty');
    return Promise.resolve({ decision: 'waiting_confirmation' });
  }

  saveAndLeave(): Promise<TopicLeaveActionResult> {
    if (!this.pendingContinuation) return Promise.resolve({ decision: 'cancelled' });
    if (this.inFlight) return this.inFlight;

    this.publish('saving');
    const task = this.options.save()
      .then(() => {
        // An edit that arrives while saving keeps the form dirty and blocks
        // the pending navigation until the user explicitly saves again.
        if (this.options.isDirty()) {
          this.publish('dirty');
          return { decision: 'waiting_confirmation' as const };
        }
        return this.proceed(this.pendingContinuation!);
      })
      .catch((error: unknown) => {
        this.publish('failed');
        return { decision: 'failed' as const, error };
      });

    return this.track(task);
  }

  discardAndLeave(): Promise<TopicLeaveActionResult> {
    if (!this.pendingContinuation || this.inFlight) return Promise.resolve({ decision: 'cancelled' });

    try {
      this.options.discard();
      return this.track(this.proceed(this.pendingContinuation));
    } catch (error: unknown) {
      this.publish('failed');
      return Promise.resolve({ decision: 'failed', error });
    }
  }

  continueEditing(): TopicLeaveActionResult {
    if (this.inFlight) return { decision: 'cancelled' };
    this.pendingContinuation = null;
    this.publish('cancelled');
    return { decision: 'cancelled' };
  }

  private async proceed(continuation: Continuation): Promise<TopicLeaveActionResult> {
    if (!this.hasProceeded) {
      this.hasProceeded = true;
      await continuation();
    }
    this.pendingContinuation = null;
    this.publish('clean');
    return { decision: 'proceeded' };
  }

  private track(promise: Promise<TopicLeaveActionResult>): Promise<TopicLeaveActionResult> {
    const tracked = promise.finally(() => {
      if (this.inFlight === tracked) this.inFlight = null;
    });
    this.inFlight = tracked;
    return tracked;
  }

  private publish(state: TopicLeaveGuardState): void {
    this.state = state;
    this.onChange(state);
  }
}

/** React bridge for TopicDetail's page-owned aggregate draft model. */
export function useTopicDetailLeaveGuard(options: TopicLeaveGuardOptions) {
  const [state, setState] = useState<TopicLeaveGuardState>('clean');
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const controllerRef = useRef<TopicLeaveGuardController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new TopicLeaveGuardController(
      {
        isDirty: () => optionsRef.current.isDirty(),
        save: () => optionsRef.current.save(),
        discard: () => optionsRef.current.discard(),
      },
      setState,
    );
  }

  const requestLeave = useCallback((continuation: Continuation) => controllerRef.current!.requestLeave(continuation), []);
  const saveAndLeave = useCallback(() => controllerRef.current!.saveAndLeave(), []);
  const discardAndLeave = useCallback(() => controllerRef.current!.discardAndLeave(), []);
  const continueEditing = useCallback(() => controllerRef.current!.continueEditing(), []);

  return { state, requestLeave, saveAndLeave, discardAndLeave, continueEditing };
}
