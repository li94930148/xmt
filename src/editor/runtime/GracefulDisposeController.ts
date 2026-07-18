import type {
  AggregateDisposeResult,
  DisposeParticipant,
  DisposeParticipantContext,
  DisposeParticipantResult,
  GracefulDisposeOptions,
} from '../contracts/contentEditorAdapter';
import type { AutosaveCoordinator } from '../contracts/autosaveCoordinator';

function remainingTimeout(deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now());
}

function isDegraded(result: DisposeParticipantResult): boolean {
  return result.status === 'failed' || result.status === 'timed_out' || result.status === 'cancelled';
}

/**
 * Coordinates bounded pre-navigation work. Autosave is the only durability
 * participant; injected participants are best-effort and never gate it.
 */
export class GracefulDisposeController {
  private lifecycle: 'active' | 'disposing' | 'disposed' = 'active';
  private destroyed = false;
  private inFlight: Promise<AggregateDisposeResult> | null = null;
  private completedResult: AggregateDisposeResult | null = null;

  constructor(private readonly autosave: AutosaveCoordinator) {}

  markDestroyed(): void {
    this.destroyed = true;
    this.lifecycle = 'disposed';
  }

  gracefulDispose(options: GracefulDisposeOptions): Promise<AggregateDisposeResult> {
    if (this.destroyed) return Promise.resolve(this.interruptedResult(options.reason, 'already_disposed'));
    if (this.inFlight) return this.inFlight;
    if (this.lifecycle === 'disposed' && this.completedResult) return Promise.resolve(this.completedResult);
    if (!this.autosave.beginGracefulDispose()) return Promise.resolve(this.interruptedResult(options.reason, 'cancelled'));

    this.lifecycle = 'disposing';
    this.inFlight = this.run(options)
      .then((result) => {
        if (result.outcome === 'durable') {
          this.autosave.completeGracefulDispose();
          this.lifecycle = 'disposed';
          this.completedResult = result;
        } else if (!this.destroyed) {
          this.lifecycle = 'active';
          this.autosave.resumeAfterGracefulDisposeFailure();
        }
        return result;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async run(options: GracefulDisposeOptions): Promise<AggregateDisposeResult> {
    const deadlineAt = Date.now() + Math.max(0, options.timeoutMs);

    // Start durability first. Best-effort work starts only after this call has
    // been issued, but both then run concurrently under the same deadline.
    const durabilityPromise = this.runAutosave(options.reason, deadlineAt);
    const bestEffortPromises = (options.participants ?? []).map((participant) =>
      this.runBestEffortParticipant(participant, options.reason, deadlineAt),
    );
    const [durability, bestEffort] = await Promise.all([
      durabilityPromise,
      Promise.all(bestEffortPromises),
    ]);

    if (this.destroyed) return this.interruptedResult(options.reason, 'cancelled', bestEffort);

    const revisions = this.autosave.getRevisions();
    const outcome = durability.status === 'synced'
      ? 'durable'
      : durability.status === 'failed' || durability.status === 'timed_out'
        ? 'not_durable'
        : 'interrupted';

    return {
      outcome,
      reason: options.reason,
      durability,
      bestEffort,
      latestRevision: revisions.latestRevision,
      persistedRevision: revisions.persistedRevision,
      degraded: bestEffort.some(isDegraded),
    };
  }

  private async runAutosave(
    reason: GracefulDisposeOptions['reason'],
    deadlineAt: number,
  ): Promise<DisposeParticipantResult> {
    const timeoutMs = remainingTimeout(deadlineAt);
    try {
      const result = await this.autosave.flush({ timeoutMs });
      return {
        id: 'autosave',
        role: 'durability',
        status: result.status,
        ...(result.status === 'synced' ? { detail: 'database_persisted' as const } : {}),
        ...(result.error === undefined ? {} : { error: result.error }),
      };
    } catch (error: unknown) {
      return { id: 'autosave', role: 'durability', status: 'failed', error };
    }
  }

  private async runBestEffortParticipant(
    participant: DisposeParticipant,
    reason: GracefulDisposeOptions['reason'],
    deadlineAt: number,
  ): Promise<DisposeParticipantResult> {
    if (participant.role !== 'best_effort') {
      return {
        id: participant.id,
        role: 'best_effort',
        status: 'failed',
        error: new Error('Runtime owns the sole durability dispose participant'),
      };
    }

    const timeoutMs = remainingTimeout(deadlineAt);
    if (timeoutMs <= 0) return { id: participant.id, role: 'best_effort', status: 'timed_out' };

    const context: DisposeParticipantContext = { reason, deadlineAt, timeoutMs };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ id: participant.id, role: 'best_effort', status: 'timed_out' });
      }, timeoutMs);

      void participant.dispose(context).then(
        (result) => {
          clearTimeout(timer);
          resolve({ ...result, id: participant.id, role: 'best_effort' });
        },
        (error: unknown) => {
          clearTimeout(timer);
          resolve({ id: participant.id, role: 'best_effort', status: 'failed', error });
        },
      );
    });
  }

  private interruptedResult(
    reason: GracefulDisposeOptions['reason'],
    status: 'cancelled' | 'already_disposed',
    bestEffort: readonly DisposeParticipantResult[] = [],
  ): AggregateDisposeResult {
    const revisions = this.autosave.getRevisions();
    return {
      outcome: 'interrupted',
      reason,
      durability: { id: 'autosave', role: 'durability', status },
      bestEffort,
      latestRevision: revisions.latestRevision,
      persistedRevision: revisions.persistedRevision,
      degraded: bestEffort.some(isDegraded),
    };
  }
}
