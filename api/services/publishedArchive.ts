import { beijingNow, execute, executeInsert, queryAll, queryOne } from '../database/utils';

type ArchiveSyncResult = {
  action: 'created' | 'updated' | 'skipped';
  resourceId?: number;
  topicId: number;
};

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

  const publishing = await queryOne<Record<string, unknown>>(
    `SELECT p.*, u.name as operator_name
     FROM publishing p
     LEFT JOIN users u ON p.operator_id = u.id
     WHERE p.topic_id = ? AND p.status = 'published'
     ORDER BY p.updated_at DESC
     LIMIT 1`,
    [topicId],
  );

  if (!publishing) {
    return null;
  }

  const analytics = await queryOne<Record<string, unknown>>(`SELECT * FROM analytics WHERE topic_id = ?`, [topicId]);
  const topicHistory = await queryAll<Record<string, unknown>>(
    `SELECT th.*, u.name as operator_name
     FROM topic_history th
     LEFT JOIN users u ON th.operator_id = u.id
     WHERE th.topic_id = ?
     ORDER BY th.created_at DESC`,
    [topicId],
  );

  return {
    topic,
    payload: JSON.stringify({
      topic,
      script: production || null,
      shooting: shooting || null,
      publishing,
      analytics: analytics || null,
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

export async function backfillPublishedArchives() {
  const publishedTopics = await queryAll<{ topic_id: number }>(
    `SELECT DISTINCT topic_id FROM publishing WHERE status = 'published' AND topic_id IS NOT NULL ORDER BY topic_id ASC`,
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
