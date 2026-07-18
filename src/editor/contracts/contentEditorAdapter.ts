import type { AutosaveFlushOptions, AutosaveFlushResult } from './autosaveCoordinator';

/** The trigger that caused a persistence request. */
export type ContentEditorPersistReason = 'autosave' | 'manual';

/** The runtime-visible state of content persistence. */
export type ContentEditorSaveStatus =
  | 'idle'
  | 'saving'
  | 'synced'
  | 'conflicted';

/** Controls whether persistence is owned by Runtime, an explicit Runtime command, or the page. */
export type ContentEditorSaveStrategy = 'autosave' | 'manual' | 'external';

export type GracefulDisposeReason =
  | 'route_transition'
  | 'document_switch'
  | 'explicit_leave';

export type DisposeParticipantRole = 'durability' | 'best_effort';

export type DisposeParticipantStatus =
  | 'synced'
  | 'failed'
  | 'timed_out'
  | 'skipped'
  | 'cancelled'
  | 'already_disposed';

export interface DisposeParticipantContext {
  reason: GracefulDisposeReason;
  deadlineAt: number;
  timeoutMs: number;
}

export interface DisposeParticipantResult {
  id: string;
  role: DisposeParticipantRole;
  status: DisposeParticipantStatus;
  detail?: 'database_persisted' | 'local_outbound_flushed' | 'not_applicable';
  error?: unknown;
}

/** Generic lifecycle participant. Runtime does not know its implementation. */
export interface DisposeParticipant {
  id: string;
  role: DisposeParticipantRole;
  dispose(context: DisposeParticipantContext): Promise<DisposeParticipantResult>;
}

export interface GracefulDisposeOptions {
  reason: GracefulDisposeReason;
  timeoutMs: number;
  /** Runtime owns the sole durability participant; callers may add best-effort work only. */
  participants?: readonly DisposeParticipant[];
}

export type AggregateDisposeOutcome = 'durable' | 'not_durable' | 'interrupted' | 'not_applicable';

export interface AggregateDisposeResult {
  outcome: AggregateDisposeOutcome;
  reason: GracefulDisposeReason;
  durability: DisposeParticipantResult;
  bestEffort: readonly DisposeParticipantResult[];
  latestRevision: number;
  persistedRevision: number;
  degraded: boolean;
}

/** Context supplied to an adapter when the runtime requests persistence. */
export interface ContentEditorSaveContext {
  reason: ContentEditorPersistReason;
  documentId: string;
  /** Monotonically increasing local revision for stale-save protection. */
  contentRevision: number;
}

/** Explicit persistence outcome for the future manual-save Runtime command. */
export interface ManualSaveResult {
  status: 'saved' | 'failed' | 'cancelled' | 'already_destroyed';
  revision: number;
  error?: unknown;
}

/** Generic editor capabilities selected by the business adapter. */
export interface ContentEditorCapabilities {
  collaboration: boolean;
  manualSave: boolean;
  immersive: boolean;
  pageScroll: boolean;
}

/**
 * Business-to-runtime boundary for a single editable content resource.
 * The runtime must treat all identifiers and callbacks as opaque.
 */
export interface ContentEditorAdapter {
  documentId: string;
  collaborationRoom: string;
  initialContent: string;
  readonly: boolean;
  validate?(): Promise<boolean>;
  capabilities: ContentEditorCapabilities;
  /** Omitted existing adapters resolve to autosave for backwards compatibility. */
  saveStrategy?: ContentEditorSaveStrategy;
  persist(content: string, context: ContentEditorSaveContext): Promise<void>;
  onManualSave?(content: string, context: ContentEditorSaveContext): Promise<void>;
}

/**
 * Resolves persistence ownership without allowing Runtime to infer business type.
 * No adapter is an external page-owned save path; legacy adapters remain autosave.
 */
export function resolveContentEditorSaveStrategy(
  adapter?: Pick<ContentEditorAdapter, 'saveStrategy'> | null,
): ContentEditorSaveStrategy {
  if (!adapter) return 'external';
  return adapter.saveStrategy ?? 'autosave';
}

/** Lifecycle and persistence commands exposed by a future editor runtime. */
export interface ContentEditorRuntimeHandle {
  scheduleSave(content: string, revision: number): void;
  /** Optional until the manual controller is implemented in the next Runtime phase. */
  manualSave?(content: string, revision: number): Promise<ManualSaveResult>;
  flush(options?: AutosaveFlushOptions): Promise<AutosaveFlushResult>;
  gracefulDispose(options: GracefulDisposeOptions): Promise<AggregateDisposeResult>;
  cancel(): void;
  getStatus(): ContentEditorSaveStatus;
  destroy(): Promise<void>;
}
