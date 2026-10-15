import { beijingNow, execute, queryAll, queryOne, runInTransaction } from '../../database/utils';
import { activityLogTimestamp } from '../../services/activity-log';
import { advancePublishingTopicIfResolved } from './publishing-completion';
import { insertTopicOutlineOriginSnapshot } from './production-origin-snapshot';
import { deleteWorkflowDocumentVersionsForTopic, recordWorkflowDocumentVersion } from '../../services/workflowDocumentVersions';
import type {
  CreateTopicRecord,
  CreatorTopicSuggestionLinkRecord,
  InitialProductionRecord,
  InitialPublishingRecord,
  InitialShootingRecord,
  TopicActivityWrite,
  TopicHistoryWrite,
  TopicListFilter,
  TopicRepository,
  TopicTransaction,
} from './topics.repository';
import type { TopicPage, TopicPersistencePatch, TopicRecord } from './topics.types';

type DatabaseTransaction = Parameters<Parameters<typeof runInTransaction>[0]>[0];

const TOPIC_DETAIL_SQL = `SELECT t.*, u1.name as creator_name, u2.name as assignee_name,
  EXISTS(SELECT 1 FROM production p WHERE p.topic_id=t.id) AS has_production_record,
  EXISTS(SELECT 1 FROM shooting s WHERE s.topic_id=t.id) AS has_shooting_record,
  EXISTS(SELECT 1 FROM publishing p WHERE p.topic_id=t.id) AS has_publishing_record
  FROM topics t
  LEFT JOIN users u1 ON t.creator_id = u1.id
  LEFT JOIN users u2 ON t.assignee_id = u2.id WHERE t.id = ?`;

function buildListFilter(filter: TopicListFilter) {
  let where = ' WHERE 1=1';
  const params: unknown[] = [];

  if (filter.status) {
    where += ' AND t.status = ?';
    params.push(filter.status);
  }

  if (filter.search) {
    where += ' AND (t.title LIKE ? OR t.description LIKE ?)';
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }

  if (!filter.viewAll) {
    where += ' AND (t.creator_id = ? OR t.assignee_id = ?)';
    params.push(filter.actorId, filter.actorId);
  }

  return { where, params };
}

function buildUpdate(patch: TopicPersistencePatch) {
  const updates: string[] = [];
  const params: unknown[] = [];

  if (patch.title !== undefined) { updates.push('title = ?'); params.push(patch.title); }
  if (patch.description !== undefined) { updates.push('description = ?'); params.push(patch.description); }
  if (patch.outline !== undefined) {
    updates.push('outline = ?'); params.push(patch.outline);
    updates.push('outline_markdown = ?'); params.push(patch.outlineMarkdown);
    updates.push('outline_json = ?'); params.push(patch.outlineJson);
  }
  if (patch.platform !== undefined) { updates.push('platform = ?'); params.push(patch.platform); }
  if (patch.deadline !== undefined) { updates.push('deadline = ?'); params.push(patch.deadline); }
  if (patch.assignee_id !== undefined) { updates.push('assignee_id = ?'); params.push(patch.assignee_id); }
  if (patch.status !== undefined) {
    updates.push('status = ?'); params.push(patch.status);
    updates.push('stage_entered_at = ?'); params.push(beijingNow());
  }

  updates.push("updated_at = datetime('now', '+8 hours')");
  return { updates, params };
}

async function createTopic(tx: DatabaseTransaction, input: CreateTopicRecord) {
  return tx.executeInsert(
    `INSERT INTO topics (title, description, outline, outline_markdown, outline_json, platform, deadline, creator_id, assignee_id, status, submitted_at, stage_entered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
    [input.title, input.description, input.outline, input.outlineMarkdown, input.outlineJson, input.platform,
      input.deadline, input.creatorId, input.assigneeId, 'pending'],
  );
}

async function updateTopic(tx: Pick<DatabaseTransaction, 'execute'>, id: number | string, patch: TopicPersistencePatch) {
  const { updates, params } = buildUpdate(patch);
  params.push(id);
  await tx.execute(`UPDATE topics SET ${updates.join(', ')} WHERE id = ?`, params);
}

async function updateTopicIfStatus(
  tx: Pick<DatabaseTransaction, 'execute'>,
  id: number | string,
  expectedStatus: string,
  patch: TopicPersistencePatch,
) {
  const { updates, params } = buildUpdate(patch);
  params.push(id, expectedStatus);
  const changed = await tx.execute(`UPDATE topics SET ${updates.join(', ')} WHERE id = ? AND status = ?`, params);
  return changed > 0;
}

function transactionAdapter(tx: DatabaseTransaction): TopicTransaction {
  return {
    createTopic: (input) => createTopic(tx, input),
    findDetailById: (id) => tx.queryOne<TopicRecord>(TOPIC_DETAIL_SQL, [id]),
    findHistory: (topicId) => tx.queryAll<Record<string, unknown>>(
      `SELECT th.*, u.name as operator_name FROM topic_history th
       LEFT JOIN users u ON th.operator_id = u.id
       WHERE th.topic_id = ? ORDER BY th.created_at DESC`,
      [topicId],
    ),
    linkCreatorTopicSuggestion: async (topicId: number, input: CreatorTopicSuggestionLinkRecord) => {
      await tx.execute(
        `INSERT INTO creator_topic_suggestion_feedback (
           creator_account_id, user_id, suggestion_id, evidence_id, outcome,
           sample_count, baseline_count, median_plays, baseline_median_plays, play_ratio
         ) VALUES (?, ?, ?, ?, 'adopted', ?, ?, ?, ?, ?)
         ON CONFLICT(creator_account_id, user_id, suggestion_id, evidence_id) DO UPDATE SET
           outcome = 'adopted', sample_count = excluded.sample_count,
           baseline_count = excluded.baseline_count, median_plays = excluded.median_plays,
           baseline_median_plays = excluded.baseline_median_plays, play_ratio = excluded.play_ratio,
           updated_at = datetime('now', '+8 hours')`,
        [input.creatorAccountId, input.userId, input.suggestionId, input.evidenceId,
          input.sampleCount, input.baselineCount, input.medianPlays, input.baselineMedianPlays, input.playRatio],
      );
      await tx.execute(
        `INSERT INTO creator_topic_suggestion_topic_links (
           topic_id, creator_account_id, user_id, suggestion_id, evidence_id
         ) VALUES (?, ?, ?, ?, ?)`,
        [topicId, input.creatorAccountId, input.userId, input.suggestionId, input.evidenceId],
      );
    },
    updateTopic: (id, patch) => updateTopic(tx, id, patch),
    recordTopicOutlineVersion: async (input) => {
      const current = await tx.queryOne<{ outline: string | null }>('SELECT outline FROM topics WHERE id=?', [input.id]);
      if (!current) return { ok: false, reason: 'stale' };
      return recordWorkflowDocumentVersion(tx, {
        documentType: 'topic_outline',
        documentId: input.id,
        currentContent: current.outline,
        nextContent: input.nextContent ?? '',
        expectedContent: input.expectedContent,
        action: input.action,
        operatorId: input.operatorId,
      });
    },
    updateTopicIfStatus: (id, expectedStatus, patch) => updateTopicIfStatus(tx, id, expectedStatus, patch),
    addHistory: (input: TopicHistoryWrite) => tx.execute(
      'INSERT INTO topic_history (topic_id, action, comment, operator_id) VALUES (?, ?, ?, ?)',
      [input.topicId, input.action, input.comment, input.operatorId],
    ).then(() => undefined),
    addActivity: (input: TopicActivityWrite) => tx.execute(
      'INSERT INTO activity_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)',
      [input.userId, input.action, input.target, input.detail, activityLogTimestamp()],
    ).then(() => undefined),
    productionExists: (topicId) => tx.queryOne('SELECT id FROM production WHERE topic_id = ?', [topicId]).then(Boolean),
    createInitialProduction: async (input: InitialProductionRecord) => {
      if (input.content !== input.originOutlineSnapshot) {
        throw new Error('PRODUCTION_OUTLINE_SNAPSHOT_MISMATCH');
      }
      const productionId = await tx.executeInsert(
        `INSERT INTO production (topic_id, version, content, content_markdown, content_json, status, operator_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [input.topicId, 'v1.0', input.content, input.contentMarkdown, input.contentJson, 'draft', input.operatorId],
      );
      await insertTopicOutlineOriginSnapshot(tx, productionId, input.topicId, input.originOutlineSnapshot);
    },
    shootingExists: (topicId) => tx.queryOne('SELECT id FROM shooting WHERE topic_id = ?', [topicId]).then(Boolean),
    createInitialShooting: (input: InitialShootingRecord) => tx.execute(
      'INSERT INTO shooting (topic_id, plan_date, location, equipment, status, operator_id) VALUES (?, ?, ?, ?, ?, ?)',
      [input.topicId, null, null, null, 'planned', input.operatorId],
    ).then(() => undefined),
    publishingExists: (topicId) => tx.queryOne('SELECT id FROM publishing WHERE topic_id = ?', [topicId]).then(Boolean),
    publishingStatuses: async (topicId) => {
      const rows = await tx.queryAll<{ status: string | null }>(
        `SELECT CASE WHEN dw.id IS NOT NULL THEN 'published' ELSE p.status END AS status
         FROM publishing p
         LEFT JOIN publishing_douyin_links link ON link.publishing_id=p.id
         LEFT JOIN douyin_works dw ON dw.id=link.douyin_work_id
         WHERE p.topic_id = ?`,
        [topicId],
      );
      return rows.map((row) => String(row.status || ''));
    },
    advancePublishingTopic: (topicId, operatorId) => advancePublishingTopicIfResolved(tx, topicId, operatorId),
    createInitialPublishing: (input: InitialPublishingRecord) => tx.execute(
      'INSERT INTO publishing (topic_id, platform, url, status, publish_time, operator_id) VALUES (?, ?, ?, ?, ?, ?)',
      [input.topicId, '', '', 'pending', null, input.operatorId],
    ).then(() => undefined),
    getTopicForStageRecordRepair: (id) => tx.queryOne<TopicRecord>(
      `SELECT id,title,status,creator_id,assignee_id,outline,outline_markdown,outline_json
       FROM topics WHERE id=?`,
      [id],
    ),
  };
}

export class SqliteTopicRepository implements TopicRepository {
  async list(filter: TopicListFilter): Promise<TopicPage> {
    const { where, params } = buildListFilter(filter);
    const base = `SELECT t.*, u1.name as creator_name, u2.name as assignee_name FROM topics t
      LEFT JOIN users u1 ON t.creator_id = u1.id
      LEFT JOIN users u2 ON t.assignee_id = u2.id${where}`;
    const topics = await queryAll<TopicRecord>(`${base} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`, [
      ...params,
      filter.limit,
      (filter.page - 1) * filter.limit,
    ]);
    const countResult = await queryOne<{ total: number }>(`SELECT COUNT(*) as total FROM (${base}) as temp`, params);
    return { topics, total: Number(countResult?.total) || 0, page: filter.page, limit: filter.limit };
  }

  findById(id: number | string) {
    return queryOne<TopicRecord>('SELECT * FROM topics WHERE id = ?', [id]);
  }

  findDetailById(id: number | string) {
    return queryOne<TopicRecord>(TOPIC_DETAIL_SQL, [id]);
  }

  findHistory(topicId: number | string) {
    return queryAll<Record<string, unknown>>(
      `SELECT th.*, u.name as operator_name FROM topic_history th
       LEFT JOIN users u ON th.operator_id = u.id
       WHERE th.topic_id = ? ORDER BY th.created_at DESC`,
      [topicId],
    );
  }

  async findDirectorIds() {
    const rows = await queryAll<{ id: number }>("SELECT id FROM users WHERE role = 'director' OR role = 'admin'");
    return rows.map((row) => Number(row.id));
  }

  async findParticipantIds(creatorId: unknown, assigneeId: unknown) {
    const rows = await queryAll<{ id: number }>('SELECT id FROM users WHERE id = ? OR id = ?', [creatorId, assigneeId]);
    return rows.map((row) => Number(row.id));
  }

  withTransaction<T>(work: (tx: TopicTransaction) => Promise<T>) {
    return runInTransaction((tx) => work(transactionAdapter(tx)));
  }

  updateTopic(id: number | string, patch: TopicPersistencePatch) {
    return updateTopic({ execute }, id, patch);
  }

  async deleteTopic(topicId: number | string) {
    await runInTransaction(async (tx) => {
      await deleteWorkflowDocumentVersionsForTopic(tx, topicId);
      await tx.execute("DELETE FROM comments WHERE target_type = 'topic' AND target_id = ?", [topicId]);
      await tx.execute('DELETE FROM shooting WHERE topic_id = ?', [topicId]);
      await tx.execute('DELETE FROM production_history WHERE production_id IN (SELECT id FROM production WHERE topic_id = ?)', [topicId]);
      await tx.execute('DELETE FROM production WHERE topic_id = ?', [topicId]);
      await tx.execute('DELETE FROM topic_history WHERE topic_id = ?', [topicId]);
      await tx.execute('DELETE FROM topics WHERE id = ?', [topicId]);
    });
  }
}
