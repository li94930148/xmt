import { beijingNow, execute, executeInsert, queryAll, queryOne } from '../database/utils';
import { getPublishingMetricFacts } from './publishingMetrics';
import { getApprovedWorkflowScriptSource } from './workflowScriptSource';

type ArchiveSyncResult = {
  action: 'created' | 'updated' | 'skipped';
  resourceId?: number;
  topicId: number;
};

type ArchiveScriptSourceSnapshot = {
  topic_id: number;
  production_id: number;
  version: string;
  content: string;
  content_markdown: string | null;
};

async function archiveScriptSource(
  topicId: number,
  stage: Record<string, unknown> | null,
  fallback: Record<string, unknown> | null,
  sourceSnapshots: Map<string, ArchiveScriptSourceSnapshot>,
) {
  if (!stage) return { topic_id: topicId, production_id: null, version: null, state: 'none' };
  const sourceProductionId = Number(stage.script_source_production_id) || null;
  const sourceVersion = typeof stage.script_source_version === 'string' ? stage.script_source_version : null;
  if (sourceProductionId && sourceVersion) {
    const source = await getApprovedWorkflowScriptSource(topicId, { productionId: sourceProductionId, version: sourceVersion });
    if (!source) return { topic_id: topicId, production_id: sourceProductionId, version: sourceVersion, state: 'unavailable' };
    sourceSnapshots.set(`${sourceProductionId}@${sourceVersion}`, {
      topic_id: topicId,
      production_id: sourceProductionId,
      version: sourceVersion,
      content: source.content,
      content_markdown: source.content_markdown ?? null,
    });
    return { topic_id: topicId, production_id: sourceProductionId, version: sourceVersion, state: 'derived' };
  }
  if (stage.script_content !== null && stage.script_content !== undefined) {
    return { topic_id: topicId, production_id: null, version: null, state: 'unrecorded' };
  }
  const inheritedProductionId = Number(fallback?.id) || null;
  const inheritedVersion = typeof fallback?.version === 'string' ? fallback.version : null;
  if (!inheritedProductionId || !inheritedVersion) return { topic_id: topicId, production_id: null, version: null, state: 'none' };
  sourceSnapshots.set(`${inheritedProductionId}@${inheritedVersion}`, {
    topic_id: topicId,
    production_id: inheritedProductionId,
    version: inheritedVersion,
    content: String(fallback?.content || ''),
    content_markdown: typeof fallback?.content_markdown === 'string' ? fallback.content_markdown : null,
  });
  return { topic_id: topicId, production_id: inheritedProductionId, version: inheritedVersion, state: 'inherited' };
}

async function buildArchivePayload(topicId: number, operatorId?: number) {
  const topic = await queryOne<Record<string, unknown>>(`SELECT * FROM topics WHERE id = ?`, [topicId]);
  if (!topic) {
    return null;
  }

  const production = await queryOne<Record<string, unknown>>(
    `SELECT p.id, p.version, p.content, p.content_markdown, p.content_json, p.status, p.created_at, p.updated_at, u.name as operator_name
     FROM production p
     LEFT JOIN users u ON p.operator_id = u.id
     WHERE p.topic_id = ? AND p.status = 'approved'
     ORDER BY p.updated_at DESC
     LIMIT 1`,
    [topicId],
  );

  const shooting = await queryOne<Record<string, unknown>>(
    `SELECT s.*, u.name as operator_name
     FROM shooting s
     LEFT JOIN users u ON s.operator_id = u.id
     WHERE s.topic_id = ?
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [topicId],
  );

  const [publishingRows, metricFacts] = await Promise.all([
    queryAll<Record<string, unknown>>(
      `SELECT p.*, u.name as operator_name,
              CASE WHEN dw.id IS NOT NULL THEN 'published' ELSE p.status END AS effective_status,
              CASE WHEN dw.id IS NOT NULL THEN 'douyin' ELSE p.platform END AS effective_platform,
              COALESCE(dw.publish_time,p.publish_time) AS effective_publish_time
       FROM publishing p
       LEFT JOIN users u ON p.operator_id = u.id
       LEFT JOIN publishing_douyin_links link ON link.publishing_id=p.id
       LEFT JOIN douyin_works dw ON dw.id=link.douyin_work_id
       WHERE p.topic_id = ? AND (dw.id IS NOT NULL OR p.status = 'published')
       ORDER BY COALESCE(dw.publish_time,p.publish_time) DESC,p.updated_at DESC,p.id DESC`,
      [topicId],
    ),
    getPublishingMetricFacts({ topicId, publishedOnly: true }),
  ]);

  if (publishingRows.length === 0) {
    return null;
  }

  const metricByPublishingId = new Map(metricFacts.map((fact) => [fact.id, fact]));
  const publishedRecords = publishingRows.map((row) => {
    const { effective_status, effective_platform, effective_publish_time, ...record } = row;
    const fact = metricByPublishingId.get(Number(row.id));
    const analytics = fact ? {
      data_date: fact.metric_publish_time,
      views: fact.views,
      likes: fact.likes,
      shares: fact.shares,
      comments: fact.comments,
      sources: {
        views: fact.views_source,
        likes: fact.likes_source,
        shares: fact.shares_source,
        comments: fact.comments_source,
      },
    } : null;
    return {
      ...record,
      publishing_id: Number(row.id),
      platform: String(effective_platform || row.platform || ''),
      status: String(effective_status || row.status || ''),
      publish_time: effective_publish_time == null ? null : String(effective_publish_time),
      analytics,
    };
  });
  const publishing = publishedRecords[0];
  const analytics = publishing.analytics;
  const topicHistory = await queryAll<Record<string, unknown>>(
    `SELECT th.*, u.name as operator_name
     FROM topic_history th
     LEFT JOIN users u ON th.operator_id = u.id
     WHERE th.topic_id = ?
     ORDER BY th.created_at DESC`,
    [topicId],
  );
  const sourceSnapshots = new Map<string, ArchiveScriptSourceSnapshot>();
  const [shootingSource, publishingSource] = await Promise.all([
    archiveScriptSource(topicId, shooting, production, sourceSnapshots),
    archiveScriptSource(topicId, publishing, production, sourceSnapshots),
  ]);

  return {
    topic,
    payload: JSON.stringify({
      topic,
      script: production || null,
      shooting: shooting || null,
      publishing,
      script_sources: {
        shooting: shootingSource,
        publishing: publishingSource,
      },
      script_source_snapshots: Array.from(sourceSnapshots.values()),
      analytics: analytics || null,
      published_records: publishedRecords,
      topicHistory: topicHistory || [],
      archived_at: beijingNow(),
    }),
    uploaderId: Number(topic.creator_id || operatorId || 0) || operatorId || null,
  };
}

export async function syncPublishedArchive(topicId: number, operatorId?: number): Promise<ArchiveSyncResult> {
  const built = await buildArchivePayload(topicId, operatorId);
  if (!built) {
    return { action: 'skipped', topicId };
  }

  const archivePath = `archive/topic-${topicId}`;
  const resourceName = String(built.topic.title || `选题-${topicId}`);
  const existingArchive = await queryOne<Record<string, unknown>>(
    `SELECT id FROM resources WHERE category = '已完成' AND file_path = ?`,
    [archivePath],
  );

  if (existingArchive?.id) {
    await execute(
      `UPDATE resources
       SET name = ?, type = ?, file_path = ?, category = ?, content = ?, uploader_id = ?, updated_at = datetime('now', '+8 hours')
       WHERE id = ?`,
      [resourceName, 'archive', archivePath, '已完成', built.payload, built.uploaderId, existingArchive.id],
    );
    return { action: 'updated', resourceId: Number(existingArchive.id), topicId };
  }

  const resourceId = await executeInsert(
    `INSERT INTO resources (name, type, file_path, category, content, uploader_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [resourceName, 'archive', archivePath, '已完成', built.payload, built.uploaderId],
  );

  return { action: 'created', resourceId, topicId };
}

function sameArchiveScript(left: Record<string, unknown> | null | undefined, right: Record<string, unknown> | null | undefined) {
  const fields = ['script_content', 'script_source_production_id', 'script_source_version'] as const;
  return fields.every((field) => (left?.[field] ?? null) === (right?.[field] ?? null));
}

/**
 * Detect script-only archive drift without rebuilding the full archive payload on
 * every details read. Missing/legacy snapshots are considered stale when a
 * published record exists, so the page can offer a safe, persisted-data retry.
 */
export async function hasPublishedArchiveScriptDrift(topicId: number): Promise<boolean> {
  const publishedRows = await queryAll<Record<string, unknown>>(
    `SELECT p.id, p.script_content, p.script_source_production_id, p.script_source_version
     FROM publishing p
     WHERE p.topic_id = ? AND (
       p.status = 'published'
       OR EXISTS (SELECT 1 FROM publishing_douyin_links link WHERE link.publishing_id=p.id)
     )`,
    [topicId],
  );
  if (publishedRows.length === 0) return false;

  const archive = await queryOne<{ content: string }>(
    `SELECT content FROM resources WHERE category = '已完成' AND file_path = ?`,
    [`archive/topic-${topicId}`],
  );
  if (!archive?.content) return true;

  let snapshot: Record<string, unknown>;
  try {
    snapshot = JSON.parse(archive.content) as Record<string, unknown>;
  } catch {
    return true;
  }

  const archivedShooting = snapshot.shooting && typeof snapshot.shooting === 'object'
    ? snapshot.shooting as Record<string, unknown>
    : null;
  const currentShooting = await queryOne<Record<string, unknown>>(
    `SELECT script_content, script_source_production_id, script_source_version
     FROM shooting WHERE topic_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [topicId],
  );
  if (!sameArchiveScript(archivedShooting, currentShooting)) return true;

  const currentPublishedById = new Map(publishedRows.map((row) => [Number(row.id), row]));
  const archivedRows = Array.isArray(snapshot.published_records)
    ? snapshot.published_records.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    : snapshot.publishing && typeof snapshot.publishing === 'object'
      ? [snapshot.publishing as Record<string, unknown>]
      : [];
  if (archivedRows.length !== currentPublishedById.size) return true;

  const matchedIds = new Set<number>();
  for (const archivedRow of archivedRows) {
    const publishingId = Number(archivedRow.publishing_id ?? archivedRow.id);
    const currentRow = currentPublishedById.get(publishingId);
    if (!currentRow || !sameArchiveScript(archivedRow, currentRow)) return true;
    matchedIds.add(publishingId);
  }
  return matchedIds.size !== currentPublishedById.size;
}

export async function backfillPublishedArchives() {
  const publishedTopics = await queryAll<{ topic_id: number }>(
    `SELECT DISTINCT p.topic_id
     FROM publishing p
     WHERE p.topic_id IS NOT NULL AND (
       p.status = 'published'
       OR EXISTS (SELECT 1 FROM publishing_douyin_links link WHERE link.publishing_id=p.id)
     )
     ORDER BY p.topic_id ASC`,
  );

  const results: ArchiveSyncResult[] = [];
  for (const row of publishedTopics) {
    results.push(await syncPublishedArchive(Number(row.topic_id)));
  }

  return {
    total: results.length,
    created: results.filter((item) => item.action === 'created').length,
    updated: results.filter((item) => item.action === 'updated').length,
    skipped: results.filter((item) => item.action === 'skipped').length,
    results,
  };
}
