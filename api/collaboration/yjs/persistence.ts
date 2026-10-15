import { queryAll, runInTransaction } from '../../database/utils.js';

export const RUNTIME_CHECKPOINT_INTERVAL = 100;

export interface PersistedRuntimeUpdate {
  version: number;
  update: number[];
  userId: number | null;
  timestamp: number;
}

export interface PersistedRuntimeDocument {
  state: number[];
  checkpointVersion: number;
  version: number;
  updates: PersistedRuntimeUpdate[];
}

export class PersistedRuntimeVersionConflictError extends Error {
  constructor(readonly actualVersion: number) {
    super('Collaboration runtime version changed unexpectedly');
    this.name = 'PersistedRuntimeVersionConflictError';
  }
}

export class PersistedRuntimeDocumentLockedError extends Error {
  constructor(readonly reason: string) {
    super('Collaboration document is locked');
    this.name = 'PersistedRuntimeDocumentLockedError';
  }
}

function encodeBytes(bytes: Uint8Array | number[]) {
  return Buffer.from(bytes).toString('base64');
}

function decodeBytes(value: unknown, label: string) {
  const encoded = String(value ?? '');
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error(`Stored collaboration ${label} is invalid`);
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error(`Stored collaboration ${label} is invalid`);
  return Array.from(bytes);
}

export async function loadPersistedRuntimeDocument(docId: string): Promise<PersistedRuntimeDocument> {
  // Read the checkpoint and its tail in one SQLite statement. Separate reads
  // can straddle a checkpoint transaction and accidentally pair an old
  // snapshot with an already-pruned update log.
  const rows = await queryAll<{
    checkpoint_version: number | null;
    state_base64: string | null;
    update_version: number | null;
    update_base64: string | null;
    user_id: number | null;
    created_at: number | null;
  }>(
    `SELECT snapshot.version AS checkpoint_version, snapshot.state_base64,
            update_row.version AS update_version, update_row.update_base64,
            update_row.user_id, update_row.created_at
     FROM (SELECT ? AS doc_id) requested
     LEFT JOIN collaboration_document_snapshots snapshot ON snapshot.doc_id = requested.doc_id
     LEFT JOIN collaboration_document_updates update_row
       ON update_row.doc_id = requested.doc_id
      AND update_row.version > COALESCE(snapshot.version, 0)
     ORDER BY update_row.version ASC`,
    [docId],
  );

  const first = rows[0];
  const checkpointVersion = Number(first?.checkpoint_version ?? 0);
  if (!Number.isSafeInteger(checkpointVersion) || checkpointVersion < 0) {
    throw new Error('Stored collaboration checkpoint version is invalid');
  }
  const state = first?.checkpoint_version !== null && first?.checkpoint_version !== undefined
    ? decodeBytes(first.state_base64, 'checkpoint')
    : [];
  let version = checkpointVersion;
  const updates: PersistedRuntimeUpdate[] = [];

  for (const row of rows) {
    if (row.update_version === null) continue;
    const rowVersion = Number(row.update_version);
    if (!Number.isSafeInteger(rowVersion) || rowVersion !== version + 1) {
      throw new Error('Stored collaboration update sequence is incomplete');
    }
    updates.push({
      version: rowVersion,
      update: decodeBytes(row.update_base64, 'update'),
      userId: row.user_id === null ? null : Number(row.user_id),
      timestamp: Number(row.created_at),
    });
    version = rowVersion;
  }

  return { state, checkpointVersion, version, updates };
}

export async function persistRuntimeUpdate(
  docId: string,
  version: number,
  update: number[],
  userId: string | number | undefined,
  timestamp: number,
) {
  await runInTransaction(async (tx) => {
    const lock = await tx.queryOne<{ reason: string }>(
      'SELECT reason FROM collaboration_document_locks WHERE doc_id = ?',
      [docId],
    );
    if (lock) throw new PersistedRuntimeDocumentLockedError(lock.reason);

    const latest = await tx.queryOne<{ version: number | null }>(
      `SELECT MAX(version) AS version FROM (
        SELECT version FROM collaboration_document_snapshots WHERE doc_id = ?
        UNION ALL
        SELECT version FROM collaboration_document_updates WHERE doc_id = ?
      )`,
      [docId, docId],
    );
    const currentVersion = Number(latest?.version ?? 0);
    if (currentVersion !== version - 1) throw new PersistedRuntimeVersionConflictError(currentVersion);

    await tx.execute(
      `INSERT INTO collaboration_document_updates (doc_id, version, update_base64, user_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [docId, version, encodeBytes(update), userId === undefined ? null : Number(userId), timestamp],
    );
  });
}

export async function checkpointRuntimeDocument(
  docId: string,
  version: number,
  state: number[],
  timestamp: number,
) {
  await runInTransaction(async (tx) => {
    const latest = await tx.queryOne<{ version: number | null }>(
      `SELECT MAX(version) AS version FROM (
        SELECT version FROM collaboration_document_snapshots WHERE doc_id = ?
        UNION ALL
        SELECT version FROM collaboration_document_updates WHERE doc_id = ?
      )`,
      [docId, docId],
    );
    if (Number(latest?.version ?? 0) !== version) throw new Error('Collaboration checkpoint version changed unexpectedly');

    await tx.execute(
      `INSERT INTO collaboration_document_snapshots (doc_id, version, state_base64, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(doc_id) DO UPDATE SET
         version = excluded.version,
         state_base64 = excluded.state_base64,
         updated_at = excluded.updated_at`,
      [docId, version, encodeBytes(state), timestamp],
    );
    await tx.execute('DELETE FROM collaboration_document_updates WHERE doc_id = ? AND version <= ?', [docId, version]);
  });
}
