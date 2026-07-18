import type {
  ContentEditorPersistReason,
  ContentEditorSaveContext,
  ContentEditorSaveStatus,
} from '../contracts/contentEditorAdapter';
import type { AutosaveCoordinator } from '../contracts/autosaveCoordinator';
import type {
  AutosaveLifecycleState,
  AutosaveFlushOptions,
  AutosaveFlushResult,
} from '../contracts/autosaveCoordinator';

type SaveRequest = {
  content: string;
  revision: number;
};

type SaveOutcome = {
  status: 'synced' | 'failed';
  revision: number;
  error?: unknown;
};

export interface RuntimeAutosaveCoordinatorOptions {
  documentId: string;
  persist(content: string, context: ContentEditorSaveContext): Promise<void>;
  delay?: number;
  onStatusChange?(status: ContentEditorSaveStatus): void;
}

/**
 * Runtime-only autosave coordination.
 *
 * Requests are persisted sequentially. A newer revision cannot be overtaken
 * by an older delayed request, and stale completions cannot update the latest
 * save status.
 */
export class RuntimeAutosaveCoordinator implements AutosaveCoordinator {
  private readonly documentId: string;
  private readonly persist: RuntimeAutosaveCoordinatorOptions['persist'];
  private readonly delay: number;
  private readonly onStatusChange?: RuntimeAutosaveCoordinatorOptions['onStatusChange'];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: SaveRequest | null = null;
  private inFlight: Promise<SaveOutcome> | null = null;
  private inFlightRevision: number | null = null;
  private flushInFlight: Promise<AutosaveFlushResult> | null = null;
  private latestRevision = -1;
  private lastPersistedRevision = -1;
  private failedRequest: SaveRequest | null = null;
  private lastError: unknown;
  private status: ContentEditorSaveStatus = 'idle';
  private lifecycle: AutosaveLifecycleState = 'active';

  constructor({ documentId, persist, delay = 2500, onStatusChange }: RuntimeAutosaveCoordinatorOptions) {
    this.documentId = documentId;
    this.persist = persist;
    this.delay = delay;
    this.onStatusChange = onStatusChange;
  }

  scheduleSave(content: string, revision: number): boolean {
    if (this.lifecycle !== 'active' || revision < this.latestRevision || revision <= this.lastPersistedRevision) return false;

    const alreadyQueued = this.pending?.revision === revision;
    const alreadyPersisting = this.inFlightRevision === revision;
    if (alreadyQueued || alreadyPersisting) return false;

    this.latestRevision = revision;
    if (this.failedRequest && this.failedRequest.revision < revision) this.failedRequest = null;
    this.pending = { content, revision };
    this.clearTimer();
    this.setStatus('saving');
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.startNextSave();
    }, this.delay);
    return true;
  }

  flush(options: AutosaveFlushOptions = {}): Promise<AutosaveFlushResult> {
    if (this.lifecycle === 'disposed') return Promise.resolve(this.flushResult('cancelled'));
    if (!this.flushInFlight) {
      this.flushInFlight = this.drain().finally(() => {
        this.flushInFlight = null;
      });
    }

    return this.withTimeout(this.flushInFlight, options.timeoutMs);
  }

  cancel(): void {
    this.clearTimer();
    this.pending = null;
    if (!this.inFlight) this.setStatus('idle');
  }

  getStatus(): ContentEditorSaveStatus {
    return this.status;
  }

  beginGracefulDispose(): boolean {
    if (this.lifecycle !== 'active') return false;
    this.lifecycle = 'disposing';
    return true;
  }

  completeGracefulDispose(): void {
    if (this.lifecycle === 'disposing') {
      this.lifecycle = 'disposed';
    }
  }

  resumeAfterGracefulDisposeFailure(): void {
    if (this.lifecycle === 'disposing') this.lifecycle = 'active';
  }

  getLifecycleState(): AutosaveLifecycleState {
    return this.lifecycle;
  }

  getRevisions() {
    return {
      latestRevision: this.latestRevision,
      persistedRevision: this.lastPersistedRevision,
    };
  }

  /** Clears pending work. It never aborts an already-issued persist request. */
  destroy(): void {
    if (this.lifecycle === 'disposed') return;
    this.lifecycle = 'disposed';
    this.clearTimer();
    this.pending = null;
    this.setStatus('idle');
  }

  private startNextSave(): Promise<SaveOutcome> | null {
    if (this.lifecycle === 'disposed' || this.inFlight || !this.pending) return this.inFlight;

    const request = this.pending;
    this.pending = null;
    this.inFlightRevision = request.revision;

    let task: Promise<SaveOutcome>;
    task = this.persist(request.content, {
      reason: 'autosave' satisfies ContentEditorPersistReason,
      documentId: this.documentId,
      contentRevision: request.revision,
    })
      .then(() => {
        if (this.lifecycle !== 'disposed') {
          this.lastPersistedRevision = Math.max(this.lastPersistedRevision, request.revision);
        }
        if (
          this.lifecycle !== 'disposed' &&
          this.failedRequest &&
          request.revision >= this.failedRequest.revision
        ) {
          this.failedRequest = null;
          this.lastError = undefined;
        }
        if (this.lifecycle !== 'disposed' && request.revision === this.latestRevision && !this.pending) {
          this.setStatus('synced');
        }
        return { status: 'synced' as const, revision: request.revision };
      })
      .catch((error: unknown) => {
        this.lastError = error;
        if (this.lifecycle !== 'disposed') this.failedRequest = request;
        if (this.lifecycle !== 'disposed' && request.revision === this.latestRevision && !this.pending) {
          this.setStatus('conflicted');
        }
        return { status: 'failed' as const, revision: request.revision, error };
      })
      .finally(() => {
        if (this.inFlight === task) {
          this.inFlight = null;
          this.inFlightRevision = null;
        }
        if (this.lifecycle !== 'disposed' && this.pending) {
          void this.startNextSave();
        }
      });

    this.inFlight = task;
    return task;
  }

  private clearTimer() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(status: ContentEditorSaveStatus) {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange?.(status);
  }

  private async drain(): Promise<AutosaveFlushResult> {
    this.clearTimer();

    while (this.lifecycle !== 'disposed') {
      if (!this.inFlight && !this.pending && this.failedRequest?.revision === this.latestRevision) {
        this.pending = this.failedRequest;
      }
      if (!this.inFlight && this.pending) this.startNextSave();

      const activeSave = this.inFlight;
      if (!activeSave) return this.flushResult('synced');

      const outcome = await activeSave;
      if (outcome.status === 'failed' && !this.pending && !this.inFlight) {
        return this.flushResult('failed', outcome.error);
      }
    }

    return this.flushResult('cancelled');
  }

  private withTimeout(promise: Promise<AutosaveFlushResult>, timeoutMs?: number): Promise<AutosaveFlushResult> {
    if (timeoutMs === undefined) return promise;
    if (timeoutMs <= 0) return Promise.resolve(this.flushResult('timed_out'));

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(this.flushResult('timed_out')), timeoutMs);
      void promise.then((result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  private flushResult(status: AutosaveFlushResult['status'], error?: unknown): AutosaveFlushResult {
    return {
      status,
      latestRevision: this.latestRevision,
      persistedRevision: this.lastPersistedRevision,
      ...(error === undefined ? status === 'failed' && this.lastError !== undefined ? { error: this.lastError } : {} : { error }),
    };
  }
}
