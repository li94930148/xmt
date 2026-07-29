import { execute, queryAll, queryOne, runInTransaction } from '../../database/utils';
import type {
  CreateTopicRecord,
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

const TOPIC_DETAIL_SQL = `SELECT t.*, u1.name as creator_name, u2.name as assignee_name FROM topics t
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
  if (patch.status !== undefined) { updates.push('status = ?'); params.push(patch.status); }

  updates.push("updated_at = datetime('now', '+8 hours')");
  return { updates, params };
}

async function createTopic(tx: DatabaseTransaction, input: CreateTopicRecord) {
  return tx.executeInsert(
    `INSERT INTO topics (title, description, outline, outline_markdown, outline_json, platform, deadline, creator_id, assignee_id, status, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))`,
    [input.title, input.description, input.outline, input.outlineMarkdown, input.outlineJson, input.platform,
      input.deadline, input.creatorId, input.assigneeId, 'pending'],
  );
}

async function updateTopic(tx: Pick<DatabaseTransaction, 'execute'>, id: number | string, patch: TopicPersistencePatch) {
  const { updates, params } = buildUpdate(patch);
  params.push(id);
  await tx.execute(`UPDATE topics SET ${updates.join(', ')} WHERE id = ?`, params);
}

function transactionAdapter(tx: DatabaseTransaction): TopicTransaction {
  return {
    createTopic: (input) => createTopic(tx, input),
    updateTopic: (id, patch) => updateTopic(tx, id, patch),
    addHistory: (input: TopicHistoryWrite) => tx.execute(
      'INSERT INTO topic_history (topic_id, action, comment, operator_id) VALUES (?, ?, ?, ?)',
      [input.topicId, input.action, input.comment, input.operatorId],
    ).then(() => undefined),
    addActivity: (input: TopicActivityWrite) => tx.execute(
      'INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)',
      [input.userId, input.action, input.target, input.detail],
    ).then(() => undefined),
    productionExists: (topicId) => tx.queryOne('SELECT id FROM production WHERE topic_id = ?', [topicId]).then(Boolean),
    createInitialProduction: (input: InitialProductionRecord) => tx.execute(
      `INSERT INTO production (topic_id, version, content, content_markdown, content_json, status, operator_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.topicId, 'v1.0', input.content, input.contentMarkdown, input.contentJson, 'draft', input.operatorId],
    ).then(() => undefined),
    shootingExists: (topicId) => tx.queryOne('SELECT id FROM shooting WHERE topic_id = ?', [topicId]).then(Boolean),
    createInitialShooting: (input: InitialShootingRecord) => tx.execute(
      'INSERT INTO shooting (topic_id, plan_date, location, equipment, status, operator_id) VALUES (?, ?, ?, ?, ?, ?)',
      [input.topicId, null, null, null, 'planned', input.operatorId],
    ).then(() => undefined),
    publishingExists: (topicId) => tx.queryOne('SELECT id FROM publishing WHERE topic_id = ?', [topicId]).then(Boolean),
    createInitialPublishing: (input: InitialPublishingRecord) => tx.execute(
      'INSERT INTO publishing (topic_id, platform, url, status, publish_time, operator_id) VALUES (?, ?, ?, ?, ?, ?)',
      [input.topicId, '', '', 'pending', null, input.operatorId],
    ).then(() => undefined),
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

  async deleteLegacyRelations(topicId: number | string) {
    try { await execute("DELETE FROM comments WHERE target_type = 'topic' AND target_id = ?", [topicId]); } catch { /* legacy best effort */ }
    try { await execute('DELETE FROM shooting WHERE topic_id = ?', [topicId]); } catch { /* legacy best effort */ }
    try { await execute('DELETE FROM production_history WHERE production_id IN (SELECT id FROM production WHERE topic_id = ?)', [topicId]); } catch { /* legacy best effort */ }
    try { await execute('DELETE FROM production WHERE topic_id = ?', [topicId]); } catch { /* legacy best effort */ }
    try { await execute('DELETE FROM topic_history WHERE topic_id = ?', [topicId]); } catch { /* legacy best effort */ }
  }

  async deleteTopic(topicId: number | string) {
    await execute('DELETE FROM topics WHERE id = ?', [topicId]);
  }
}
