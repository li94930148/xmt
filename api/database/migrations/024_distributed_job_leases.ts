import type { DatabaseMigration } from './types';

/** Durable leases shared by API processes; rows remain after release so fencing tokens never reset. */
export const distributedJobLeasesMigration: DatabaseMigration = {
  version: '024',
  name: 'distributed_job_leases',
  checksum: '024-distributed-job-leases-v1',
  async up(executor) {
    await executor.execute(`CREATE TABLE IF NOT EXISTS distributed_job_leases (
      job_name TEXT PRIMARY KEY CHECK (length(job_name) BETWEEN 1 AND 200),
      owner_token TEXT,
      fencing_token INTEGER NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
      lease_expires_at_ms INTEGER NOT NULL DEFAULT 0,
      updated_at_ms INTEGER NOT NULL
    )`);
  },
};
