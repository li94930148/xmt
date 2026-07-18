import type {
  ContentEditorSaveContext,
  ContentEditorSaveStatus,
  ManualSaveResult,
} from '../contracts/contentEditorAdapter';

export interface ManualSaveControllerOptions {
  documentId: string;
  persist(content: string, context: ContentEditorSaveContext): Promise<void>;
  onStatusChange?(status: ContentEditorSaveStatus): void;
}

type InFlightSave = {
  revision: number;
  promise: Promise<ManualSaveResult>;
};

/**
 * Explicit-save coordinator for saveStrategy=manual.
 * It deliberately does not use debounce timers or AutosaveCoordinator.
 */
export class ManualSaveController {
  private readonly documentId: string;
  private readonly persist: ManualSaveControllerOptions['persist'];
  private readonly onStatusChange?: ManualSaveControllerOptions['onStatusChange'];
  private readonly inFlight = new Map<number, InFlightSave>();
  private latestRevision = -1;
  private persistedRevision = -1;
  private status: ContentEditorSaveStatus = 'idle';
  private destroyed = false;

  constructor({ documentId, persist, onStatusChange }: ManualSaveControllerOptions) {
    this.documentId = documentId;
    this.persist = persist;
    this.onStatusChange = onStatusChange;
  }

  manualSave(content: string, revision: number): Promise<ManualSaveResult> {
    if (this.destroyed) return Promise.resolve({ status: 'already_destroyed', revision });
    if (revision < this.latestRevision) return Promise.resolve({ status: 'cancelled', revision });

    const active = this.inFlight.get(revision);
    if (active) return active.promise;
    if (revision <= this.persistedRevision) return Promise.resolve({ status: 'saved', revision });

    this.latestRevision = revision;
    this.setStatus('saving');

    const promise = this.persist(content, {
      reason: 'manual',
      documentId: this.documentId,
      contentRevision: revision,
    })
      .then(() => {
        if (!this.destroyed) {
          this.persistedRevision = Math.max(this.persistedRevision, revision);
          if (revision === this.latestRevision) this.setStatus('synced');
        }
        return { status: 'saved' as const, revision };
      })
      .catch((error: unknown) => {
        if (!this.destroyed && revision === this.latestRevision) this.setStatus('conflicted');
        return { status: 'failed' as const, revision, error };
      })
      .finally(() => {
        this.inFlight.delete(revision);
      });

    this.inFlight.set(revision, { revision, promise });
    return promise;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.inFlight.clear();
    this.setStatus('idle');
  }

  getStatus(): ContentEditorSaveStatus {
    return this.status;
  }

  getRevisions() {
    return { latestRevision: this.latestRevision, persistedRevision: this.persistedRevision };
  }

  private setStatus(status: ContentEditorSaveStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange?.(status);
  }
}
