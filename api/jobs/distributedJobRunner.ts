import { randomUUID } from 'node:crypto';
import { db } from '../database/db';

// SQLite is the shared coordination authority for the current deployment model.
// Using its clock avoids lease decisions depending on each API process clock.
const DATABASE_NOW_MS = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
const DEFAULT_LEASE_DURATION_MS = 30_000;
const MAX_LEASE_DURATION_MS = 24 * 60 * 60 * 1000;
const SQLITE_BUSY_RETRY_ATTEMPTS = 5;

function isSqliteBusy(error: unknown) {
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error && /SQLITE_(?:BUSY|LOCKED)|database (?:is )?(?:locked|busy)/i.test(current.message)) return true;
    current = typeof current === 'object' && 'cause' in current ? current.cause : null;
  }
  return false;
}

async function withSqliteBusyRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSqliteBusy(error) || attempt >= SQLITE_BUSY_RETRY_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}

export type DistributedJobLease = {
  jobName: string;
  fencingToken: number;
  leaseDurationMs: number;
  renew(): Promise<boolean>;
  assertCurrent(): Promise<void>;
  release(): Promise<boolean>;
};

export type DistributedJobContext = {
  /** Aborted when renewal fails or another process takes over the expired lease. */
  signal: AbortSignal;
  /** Monotonically increasing for each successful acquisition of this job name. */
  fencingToken: number;
  /** Re-check ownership before an irreversible write or external side effect. */
  assertCurrent(): Promise<void>;
};

export type DistributedJobRunResult<T> =
  | { status: 'busy' }
  | { status: 'completed'; fencingToken: number; value: T }
  | { status: 'lease_lost'; fencingToken: number; reason: 'expired' | 'coordination_error' };

export type DistributedJobRunnerOptions = {
  leaseDurationMs?: number;
  renewIntervalMs?: number;
};

function validateJobName(jobName: string) {
  if (typeof jobName !== 'string' || jobName.trim() !== jobName || jobName.length < 1 || jobName.length > 200) {
    throw new TypeError('jobName must be a trimmed string between 1 and 200 characters');
  }
}

function resolveLeaseOptions(options: DistributedJobRunnerOptions = {}) {
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1000 || leaseDurationMs > MAX_LEASE_DURATION_MS) {
    throw new RangeError(`leaseDurationMs must be an integer between 1000 and ${MAX_LEASE_DURATION_MS}`);
  }

  const renewIntervalMs = options.renewIntervalMs ?? Math.floor(leaseDurationMs / 3);
  if (!Number.isSafeInteger(renewIntervalMs) || renewIntervalMs < 100 || renewIntervalMs * 2 >= leaseDurationMs) {
    throw new RangeError('renewIntervalMs must be an integer of at least 100ms and less than half the lease duration');
  }

  return { leaseDurationMs, renewIntervalMs };
}

/**
 * Atomically acquire a durable shared lease. A null result means another live
 * owner already holds the job. Expired leases can be taken over without
 * operator cleanup; the incremented fencing token lets downstream writes reject
 * work from an old owner.
 */
export async function acquireDistributedJobLease(
  jobName: string,
  options: Pick<DistributedJobRunnerOptions, 'leaseDurationMs'> = {},
): Promise<DistributedJobLease | null> {
  validateJobName(jobName);
  const { leaseDurationMs } = resolveLeaseOptions({
    ...options,
    renewIntervalMs: Math.max(100, Math.floor((options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS) / 3)),
  });
  const ownerToken = randomUUID();
  const acquired = await withSqliteBusyRetry(() => db.execute({
    sql: `INSERT INTO distributed_job_leases
      (job_name, owner_token, fencing_token, lease_expires_at_ms, updated_at_ms)
      VALUES (?, ?, 1, ${DATABASE_NOW_MS} + ?, ${DATABASE_NOW_MS})
      ON CONFLICT(job_name) DO UPDATE SET
        owner_token = excluded.owner_token,
        fencing_token = distributed_job_leases.fencing_token + 1,
        lease_expires_at_ms = ${DATABASE_NOW_MS} + ?,
        updated_at_ms = ${DATABASE_NOW_MS}
      WHERE distributed_job_leases.lease_expires_at_ms <= ${DATABASE_NOW_MS}
      RETURNING fencing_token`,
    args: [jobName, ownerToken, leaseDurationMs, leaseDurationMs],
  }));
  const row = acquired.rows[0];
  if (!row) return null;

  let released = false;
  return {
    jobName,
    fencingToken: Number(row.fencing_token),
    leaseDurationMs,
    async renew() {
      if (released) return false;
      const renewed = await withSqliteBusyRetry(() => db.execute({
        sql: `UPDATE distributed_job_leases
          SET lease_expires_at_ms = ${DATABASE_NOW_MS} + ?, updated_at_ms = ${DATABASE_NOW_MS}
          WHERE job_name = ? AND owner_token = ? AND lease_expires_at_ms > ${DATABASE_NOW_MS}
          RETURNING fencing_token`,
        args: [leaseDurationMs, jobName, ownerToken],
      }));
      return renewed.rows.length === 1;
    },
    async assertCurrent() {
      if (released) throw new Error(`Distributed job lease is no longer held: ${jobName}`);
      const current = await withSqliteBusyRetry(() => db.execute({
        sql: `SELECT 1 AS held FROM distributed_job_leases
          WHERE job_name = ? AND owner_token = ? AND lease_expires_at_ms > ${DATABASE_NOW_MS}`,
        args: [jobName, ownerToken],
      }));
      if (current.rows.length !== 1) throw new Error(`Distributed job lease is no longer held: ${jobName}`);
    },
    async release() {
      if (released) return false;
      released = true;
      const result = await withSqliteBusyRetry(() => db.execute({
        sql: `UPDATE distributed_job_leases
          SET owner_token = NULL, lease_expires_at_ms = 0, updated_at_ms = ${DATABASE_NOW_MS}
          WHERE job_name = ? AND owner_token = ?`,
        args: [jobName, ownerToken],
      }));
      return result.rowsAffected === 1;
    },
  };
}

/**
 * Run one handler under a shared lease, renewing until it completes. Handlers
 * must observe AbortSignal and call assertCurrent immediately before side
 * effects; jobs with non-idempotent external effects also need downstream
 * fencing/idempotency. No job is registered or scheduled by this module.
 */
export async function runWithDistributedJobLease<T>(
  jobName: string,
  handler: (context: DistributedJobContext) => Promise<T>,
  options: DistributedJobRunnerOptions = {},
): Promise<DistributedJobRunResult<T>> {
  const { leaseDurationMs, renewIntervalMs } = resolveLeaseOptions(options);
  const lease = await acquireDistributedJobLease(jobName, { leaseDurationMs });
  if (!lease) return { status: 'busy' };

  return runWithAcquiredDistributedJobLease(jobName, lease, handler, { renewIntervalMs });
}

/** Run a handler under a lease already acquired by the caller. */
export async function runWithAcquiredDistributedJobLease<T>(
  jobName: string,
  lease: DistributedJobLease,
  handler: (context: DistributedJobContext) => Promise<T>,
  options: Pick<DistributedJobRunnerOptions, 'renewIntervalMs'> = {},
): Promise<Exclude<DistributedJobRunResult<T>, { status: 'busy' }>> {
  validateJobName(jobName);
  if (lease.jobName !== jobName) throw new Error(`Distributed job lease name mismatch: ${jobName}`);
  const { renewIntervalMs } = resolveLeaseOptions({
    leaseDurationMs: lease.leaseDurationMs,
    renewIntervalMs: options.renewIntervalMs,
  });

  const controller = new AbortController();
  let lostReason: 'expired' | 'coordination_error' | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let renewalInFlight: Promise<void> | null = null;

  const markLost = (reason: 'expired' | 'coordination_error') => {
    if (lostReason) return;
    lostReason = reason;
    controller.abort(new Error(`Distributed job lease lost: ${jobName}`));
    if (timer) clearTimeout(timer);
  };

  const assertCurrent = async () => {
    if (lostReason) throw new Error(`Distributed job lease is no longer held: ${jobName}`);
    try {
      await lease.assertCurrent();
    } catch (error) {
      markLost(error instanceof Error && error.message.includes('no longer held') ? 'expired' : 'coordination_error');
      throw error;
    }
  };

  const scheduleRenewal = () => {
    if (stopped || lostReason) return;
    timer = setTimeout(() => {
      renewalInFlight = (async () => {
        try {
          if (!await lease.renew()) markLost('expired');
        } catch {
          markLost('coordination_error');
        }
      })();
      void renewalInFlight.finally(() => {
        renewalInFlight = null;
        scheduleRenewal();
      });
    }, renewIntervalMs);
  };

  const stopRenewals = async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    const activeRenewal = renewalInFlight;
    if (activeRenewal) await activeRenewal;
  };

  scheduleRenewal();
  try {
    let handlerResult: { status: 'fulfilled'; value: T } | { status: 'rejected'; error: unknown };
    try {
      handlerResult = {
        status: 'fulfilled',
        value: await handler({ signal: controller.signal, fencingToken: lease.fencingToken, assertCurrent }),
      };
    } catch (error) {
      handlerResult = { status: 'rejected', error };
    }
    await stopRenewals();
    if (lostReason) return { status: 'lease_lost', fencingToken: lease.fencingToken, reason: lostReason };
    if (handlerResult.status === 'rejected') throw handlerResult.error;
    return { status: 'completed', fencingToken: lease.fencingToken, value: handlerResult.value };
  } finally {
    await stopRenewals();
    await lease.release();
  }
}
