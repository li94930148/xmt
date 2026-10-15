import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { inspirationTopicLinkMigration } from '../../api/database/migrations/016_inspiration_topic_link.js';
import { InspirationPromotionError, promoteInspirationInTransaction } from '../../api/modules/inspirations/inspiration-promotion.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-inspiration-topic-link-'));
const client = createClient({ url: `file:${path.join(directory, 'inspiration-link.test.db')}` });

async function applyMigration() {
  const transaction = await client.transaction('write');
  try {
    await inspirationTopicLinkMigration.up(transaction);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}

async function promote(inspirationId: number, userId: number) {
  const transaction = await client.transaction('write');
  const tx = {
    async queryOne<T>(sql: string, params: unknown[] = []) {
      const result = await transaction.execute({ sql, args: params as (string | number | null)[] });
      return (result.rows[0] as T | undefined) ?? null;
    },
    async execute(sql: string, params: unknown[] = []) {
      const result = await transaction.execute({ sql, args: params as (string | number | null)[] });
      return result.rowsAffected ?? 0;
    },
    async executeInsert(sql: string, params: unknown[] = []) {
      const result = await transaction.execute({ sql, args: params as (string | number | null)[] });
      return Number(result.lastInsertRowid ?? 0);
    },
  };
  try {
    const result = await promoteInspirationInTransaction(tx, inspirationId, userId);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}

try {
  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute(`CREATE TABLE topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    creator_id INTEGER NOT NULL,
    stage_entered_at DATETIME
  )`);
  await client.execute(`CREATE TABLE inspirations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    creator_id INTEGER,
    status TEXT DEFAULT 'active',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await client.execute(`CREATE TABLE topic_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    comment TEXT,
    operator_id INTEGER
  )`);
  await client.execute({
    sql: 'INSERT INTO inspirations (title, description, creator_id, status) VALUES (?, ?, ?, ?)',
    args: ['历史已转化灵感', '历史描述', 7, 'promoted'],
  });

  await applyMigration();
  await applyMigration();

  const columns = await client.execute('PRAGMA table_info(inspirations)');
  assert.ok(columns.rows.some((row) => String(row.name) === 'topic_id'), 'the nullable association column is added');
  const indexes = await client.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_inspirations_topic'");
  assert.equal(indexes.rows.length, 1, 'the association index is created idempotently');
  const oldRecord = await client.execute('SELECT status, topic_id FROM inspirations WHERE id = 1');
  assert.equal(oldRecord.rows[0]?.status, 'promoted');
  assert.equal(oldRecord.rows[0]?.topic_id, null, 'ambiguous historical rows remain unlinked');

  const activeInsert = await client.execute({
    sql: 'INSERT INTO inspirations (title, description, creator_id, status) VALUES (?, ?, ?, ?)',
    args: ['本次新灵感', '本次描述', 7, 'active'],
  });
  const inspirationId = Number(activeInsert.lastInsertRowid);
  const first = await promote(inspirationId, 9);
  assert.equal(first.created, true);
  assert.ok(first.topicId > 0);

  const linked = await client.execute('SELECT status, topic_id FROM inspirations WHERE id = ?', [inspirationId]);
  assert.equal(linked.rows[0]?.status, 'promoted');
  assert.equal(Number(linked.rows[0]?.topic_id), first.topicId, 'promotion persists its topic link');
  const promotedTopic = await client.execute('SELECT stage_entered_at FROM topics WHERE id = ?', [first.topicId]);
  assert.ok(typeof promotedTopic.rows[0]?.stage_entered_at === 'string', 'promoting inspiration records the pending-stage entry time');
  const topicsAfterFirst = await client.execute('SELECT COUNT(*) AS count FROM topics');
  const historyAfterFirst = await client.execute('SELECT COUNT(*) AS count FROM topic_history WHERE topic_id = ?', [first.topicId]);
  assert.equal(Number(topicsAfterFirst.rows[0]?.count), 1);
  assert.equal(Number(historyAfterFirst.rows[0]?.count), 1);

  const retry = await promote(inspirationId, 9);
  assert.equal(retry.created, false);
  assert.equal(retry.topicId, first.topicId, 'retries return the existing topic instead of creating duplicates');
  const topicsAfterRetry = await client.execute('SELECT COUNT(*) AS count FROM topics');
  assert.equal(Number(topicsAfterRetry.rows[0]?.count), 1);

  await assert.rejects(
    () => promote(1, 9),
    (error: unknown) => error instanceof InspirationPromotionError && error.statusCode === 409,
    'ambiguous historical promoted rows are not guessed or duplicated',
  );
  await assert.rejects(
    () => promote(9999, 9),
    (error: unknown) => error instanceof InspirationPromotionError && error.statusCode === 404,
  );

  const rollbackInsert = await client.execute({
    sql: 'INSERT INTO inspirations (title, description, creator_id, status) VALUES (?, ?, ?, ?)',
    args: ['事务回滚灵感', '回滚描述', 7, 'active'],
  });
  const rollbackId = Number(rollbackInsert.lastInsertRowid);
  await client.execute(`CREATE TRIGGER fail_promotion_history BEFORE INSERT ON topic_history
    BEGIN SELECT RAISE(ABORT, 'history unavailable'); END`);
  await assert.rejects(() => promote(rollbackId, 9), /history unavailable/);
  await client.execute('DROP TRIGGER fail_promotion_history');
  const rollbackState = await client.execute('SELECT status, topic_id FROM inspirations WHERE id = ?', [rollbackId]);
  assert.equal(rollbackState.rows[0]?.status, 'active', 'failed history write rolls back the inspiration update');
  assert.equal(rollbackState.rows[0]?.topic_id, null);
  const topicsAfterRollback = await client.execute('SELECT COUNT(*) AS count FROM topics');
  assert.equal(Number(topicsAfterRollback.rows[0]?.count), 1, 'failed promotion rolls back the newly inserted topic');

  const foreignKey = await client.execute('PRAGMA foreign_key_list(inspirations)');
  assert.ok(foreignKey.rows.some((row) => String(row.table) === 'topics' && String(row.from) === 'topic_id'));
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('Inspiration-to-topic persistence and transaction tests passed');
