export type ProductionOriginSnapshotTransaction = {
  queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

export async function insertTopicOutlineOriginSnapshot(
  tx: ProductionOriginSnapshotTransaction,
  productionId: number,
  topicId: number | string,
  contentSnapshot: string,
) {
  const matchingVersions = await tx.queryAll<{ version: string }>(
    `SELECT version FROM workflow_document_versions
     WHERE document_type='topic_outline' AND document_id=? AND is_baseline=0 AND content=?
     ORDER BY id DESC LIMIT 2`,
    [String(topicId), contentSnapshot],
  );
  const sourceOutlineVersion = matchingVersions.length === 1 ? matchingVersions[0].version : null;
  await tx.execute(
    `INSERT INTO production_origin_snapshots (
       production_id, source_type, source_content_snapshot, source_outline_version
     ) VALUES (?, 'topic_outline', ?, ?)`,
    [productionId, contentSnapshot, sourceOutlineVersion],
  );
}
