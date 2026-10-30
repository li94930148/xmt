import { beijingNow, execute, executeInsert, queryAll, queryOne } from '../database/utils';
import { getPublishingMetricFacts } from './publishingMetrics';

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

type ResolvedArchiveScriptSource = {
  source_topic_id: number;
  content: string;
  content_markdown: string | null;
  status: string;
};

type ArchiveScriptSourceRow = {
  source_topic_id: number | null;
  content: string | null;
  content_markdown: string | null;
  status: string;
};

async function getApprovedArchiveScriptSource(productionId: number, version: string): Promise<ResolvedArchiveScriptSource | null> {
  const candidates = await queryAll<{ source_kind: string; source_topic_id: number | null }>(
    `SELECT 'current' AS source_kind,p.topic_id AS source_topic_id
     FROM production p WHERE p.id=? AND p.version=?
     UNION ALL
     SELECT 'history' AS source_kind,ph.source_topic_id
     FROM production_history ph
     WHERE ph.production_id=? AND ph.version=?`,
    [productionId, version, productionId, version],
  );
  if (candidates.length !== 1) return null;
  const sourceTopicId = Number(candidates[0].source_topic_id);
  if (!Number.isSafeInteger(sourceTopicId) || sourceTopicId <= 0) return null;

  const sourceRows = candidates[0].source_kind === 'current'
    ? await queryAll<ArchiveScriptSourceRow>(
      `SELECT p.topic_id AS source_topic_id,p.content,p.content_markdown,p.status
       FROM production p
       WHERE p.id=? AND p.topic_id=? AND p.version=?`,
      [productionId, sourceTopicId, version],
    )
    : await queryAll<ArchiveScriptSourceRow>(
      `SELECT ph.source_topic_id,ph.content,ph.content_markdown,ph.status
       FROM production_history ph
       WHERE ph.production_id=? AND ph.source_topic_id=? AND ph.version=?`,
      [productionId, sourceTopicId, version],
    );
  if (sourceRows.length !== 1 || sourceRows[0].status !== 'approved') return null;
  const row = sourceRows[0];
  return {
    ...row,
    source_topic_id: sourceTopicId,
    content: String(row.content_markdown ?? row.content ?? ''),
    content_markdown: row.content_markdown ?? null,
  };
}

async function archiveScriptSource(
  topicId: number,
  stage: Record<string, unknown> | null,
  fallback: Record<string, unknown> | null,
  sourceSnapshots: Map<string, ArchiveScriptSourceSnapshot>,
) {
  if (!stage) return { topic_id: topicId, production_id: null, version: null, state: 'none' };
  const sourceProductionId = Number(stage.script_source_production_id) || null;
  const sourceVersion = typeof stage.script_source_version === 'string' ? stage.script_source_version : null;
  const hasRecordedSourceMetadata = stage.script_source_production_id !== null && stage.script_source_production_id !== undefined
    || stage.script_source_version !== null && stage.script_source_version !== undefined;
  if (hasRecordedSourceMetadata) {
    if (!sourceProductionId || !sourceVersion) {
      return { topic_id: topicId, production_id: sourceProductionId, version: sourceVersion, state: 'unavailable' };
    }
    const sourceKey = `${sourceProductionId}@${sourceVersion}`;
    if (sourceSnapshots.has(sourceKey)) {
      return { topic_id: topicId, production_id: sourceProductionId, version: sourceVersion, state: 'derived' };
    }
    const source = await getApprovedArchiveScriptSource(sourceProductionId, sourceVersion);
    if (!source) return { topic_id: topicId, production_id: sourceProductionId, version: sourceVersion, state: 'unavailable' };
    if (source.source_topic_id === topicId) {
      sourceSnapshots.set(sourceKey, {
        topic_id: topicId,
        production_id: sourceProductionId,
        version: sourceVersion,
        content: source.content,
        content_markdown: source.content_markdown ?? null,
      });
    }
    return {
      topic_id: topicId,
      production_id: sourceProductionId,
      version: sourceVersion,
      state: 'derived',
      ...(source.source_topic_id !== topicId ? { source_topic_id: source.source_topic_id } : {}),
    };
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
  const topicHistory = await queryAll<Record<string, unknown>>(
    `SELECT th.*, u.name as operator_name
     FROM topic_history th
     LEFT JOIN users u ON th.operator_id = u.id
     WHERE th.topic_id = ?
     ORDER BY th.created_at DESC`,
    [topicId],
  );
  const sourceSnapshots = new Map<string, ArchiveScriptSourceSnapshot>();
  const [shootingSource, publishedRecordSources] = await Promise.all([
    archiveScriptSource(topicId, shooting, production, sourceSnapshots),
    Promise.all(publishedRecords.map((record) => archiveScriptSource(topicId, record, production, sourceSnapshots))),
  ]);
  const archivedPublishedRecords = publishedRecords.map((record, index) => ({
    ...record,
    script_source: publishedRecordSources[index],
  }));
  const publishing = archivedPublishedRecords[0];
  const analytics = publishing.analytics;
  const publishingSource = publishedRecordSources[0];

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
      published_records: archivedPublishedRecords,
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

function hasRecognizedPublishedRecordSource(
  value: unknown,
  archivedRow: Record<string, unknown>,
  archiveScript: Record<string, unknown> | null,
  topicId: number,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  if (source.topic_id !== topicId) return false;
  if (!['none', 'unavailable', 'unrecorded', 'derived', 'inherited'].includes(String(source.state))) return false;

  const rowSourceProductionId = Number(archivedRow.script_source_production_id) || null;
  const rowSourceVersion = typeof archivedRow.script_source_version === 'string' ? archivedRow.script_source_version : null;
  const rowHasExplicitSource = archivedRow.script_source_production_id !== null && archivedRow.script_source_production_id !== undefined
    || archivedRow.script_source_version !== null && archivedRow.script_source_version !== undefined;
  const hasLocalScript = archivedRow.script_content !== null && archivedRow.script_content !== undefined;
  const hasValidProductionId = source.production_id === null || Number.isSafeInteger(source.production_id);
  const hasValidVersion = source.version === null || typeof source.version === 'string';
  if (!hasValidProductionId || !hasValidVersion) return false;

  if (source.state === 'derived' || source.state === 'inherited') {
    const hasCompleteProductionReference = Number.isSafeInteger(source.production_id)
      && Number(source.production_id) > 0
      && typeof source.version === 'string'
      && Boolean(source.version.trim());
    if (!hasCompleteProductionReference) return false;
    if (source.state === 'derived') {
      return rowHasExplicitSource
        && Number(source.production_id) === rowSourceProductionId
        && source.version === rowSourceVersion;
    }

    const inheritedProductionId = Number(archiveScript?.id) || null;
    const inheritedVersion = typeof archiveScript?.version === 'string' ? archiveScript.version : null;
    return !rowHasExplicitSource
      && !hasLocalScript
      && Boolean(inheritedProductionId && inheritedVersion?.trim())
      && Number(source.production_id) === inheritedProductionId
      && source.version === inheritedVersion;
  }

  if (source.state === 'unavailable') {
    return rowHasExplicitSource
      && source.production_id === rowSourceProductionId
      && source.version === rowSourceVersion;
  }
  if (source.state === 'none' || source.state === 'unrecorded') {
    if (source.production_id !== null || source.version !== null || rowHasExplicitSource) return false;
    return source.state === 'unrecorded'
      ? hasLocalScript
      : !hasLocalScript && !(Number(archiveScript?.id) > 0 && typeof archiveScript?.version === 'string' && Boolean(archiveScript.version.trim()));
  }
  return false;
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
  const archiveScript = snapshot.script && typeof snapshot.script === 'object' && !Array.isArray(snapshot.script)
    ? snapshot.script as Record<string, unknown>
    : null;

  const matchedIds = new Set<number>();
  for (const archivedRow of archivedRows) {
    const publishingId = Number(archivedRow.publishing_id ?? archivedRow.id);
    const currentRow = currentPublishedById.get(publishingId);
    if (!currentRow || !sameArchiveScript(archivedRow, currentRow)) return true;
    if (!hasRecognizedPublishedRecordSource(archivedRow.script_source, archivedRow, archiveScript, topicId)) return true;
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
