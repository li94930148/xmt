import type { ContentEditorSaveStatus } from './contentEditorAdapter';

export type AutosaveFlushStatus = 'synced' | 'failed' | 'timed_out' | 'cancelled';
export type AutosaveLifecycleState = 'active' | 'disposing' | 'disposed';

export interface AutosaveFlushOptions {
  timeoutMs?: number;
}

export interface AutosaveFlushResult {
  status: AutosaveFlushStatus;
  latestRevision: number;
  persistedRevision: number;
  error?: unknown;
}

/**
 * Contract only: a future runtime may implement this coordinator while
 * preserving the existing write-consistency behavior.
 */
export interface AutosaveCoordinator {
  /** Returns false when the coordinator no longer accepts new revisions. */
  scheduleSave(content: string, revision: number): boolean;
  flush(options?: AutosaveFlushOptions): Promise<AutosaveFlushResult>;
  beginGracefulDispose(): boolean;
  completeGracefulDispose(): void;
  resumeAfterGracefulDisposeFailure(): void;
  cancel(): void;
  getStatus(): ContentEditorSaveStatus;
  getLifecycleState(): AutosaveLifecycleState;
  getRevisions(): { latestRevision: number; persistedRevision: number };
}
