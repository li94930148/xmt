import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { workflowDocumentVersionsMigration } from '../../api/database/migrations/029_workflow_document_versions.js';
import {
  deleteWorkflowDocumentVersionsForDocument,
  deleteWorkflowDocumentVersionsForTopic,
  recordWorkflowDocumentVersion,
} from '../../api/services/workflowDocumentVersions.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-document-versions-'));
const client = createClient({ url: `file:${path.join(directory, 'versions.db')}` });

function transactionAdapter(transaction: Awaited<ReturnType<typeof client.transaction>>) {
  return {
    async queryOne<T>(sql: string, params: unknown[] = []) {
      const result = await transaction.execute({ sql, args: params as never[] });
      return result.rows[0] as unknown as T ?? null;
    },
    async queryAll<T>(sql: string, params: unknown[] = []) {
      const result = await transaction.execute({ sql, args: params as never[] });
      return result.rows as unknown as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      const result = await transaction.execute({ sql, args: params as never[] });
      return result.rowsAffected ?? 0;
    },
    async executeInsert(sql: string, params: unknown[] = []) {
      const result = await transaction.execute({ sql, args: params as never[] });
      return Number(result.lastInsertRowid ?? 0);
    },
  };
}

try {
  await workflowDocumentVersionsMigration.up(client);
  await workflowDocumentVersionsMigration.up(client);
  await client.execute('CREATE TABLE topics (id INTEGER PRIMARY KEY)');
  await client.execute('CREATE TABLE shooting (id INTEGER PRIMARY KEY, topic_id INTEGER)');
  await client.execute('CREATE TABLE publishing (id INTEGER PRIMARY KEY, topic_id INTEGER)');

  const create = async (action: 'minor' | 'major', current: string, next: string, expected = current) => {
    const transaction = await client.transaction('write');
    try {
      const result = await recordWorkflowDocumentVersion(transactionAdapter(transaction), {
        documentType: 'shooting_script',
        documentId: 42,
        currentContent: current,
        nextContent: next,
        expectedContent: expected,
        action,
        operatorId: 7,
        sourceProductionId: 9,
        sourceProductionVersion: 'v3.2',
      });
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  };

  const first = await create('minor', '旧稿原文\n保留格式', '第一版\n保留格式');
  assert.deepEqual(first, { ok: true, version: 'v1.0' });
  const baseline = await client.execute(`SELECT version,content,change_type,is_baseline,operator_id,created_at
    FROM workflow_document_versions WHERE document_type='shooting_script' AND document_id='42' AND is_baseline=1`);
  assert.deepEqual(baseline.rows[0], {
    version: 'baseline', content: '旧稿原文\n保留格式', change_type: 'baseline', is_baseline: 1,
    operator_id: null, created_at: null,
  }, 'legacy content is retained as a baseline without inventing its author or timestamp');

  const second = await create('minor', '第一版\n保留格式', '第一版的小修');
  assert.deepEqual(second, { ok: true, version: 'v1.1' });
  const third = await create('major', '第一版的小修', '另开新版');
  assert.deepEqual(third, { ok: true, version: 'v2.0' });

  const stale = await create('minor', '另开新版', '过期内容', '旧客户端内容');
  assert.deepEqual(stale, { ok: false, reason: 'stale' }, 'stale clients cannot append a version');
  const versions = await client.execute(`SELECT version,content,change_type,operator_id,source_production_id,source_production_version
    FROM workflow_document_versions WHERE document_type='shooting_script' AND document_id='42' AND is_baseline=0 ORDER BY id`);
  assert.equal(versions.rows.length, 3);
  assert.deepEqual(versions.rows.map((row) => row.version), ['v1.0', 'v1.1', 'v2.0']);
  assert.equal(versions.rows[0].source_production_id, 9);
  assert.equal(versions.rows[0].source_production_version, 'v3.2');

  await client.execute('INSERT INTO topics (id) VALUES (100)');
  await client.execute('INSERT INTO shooting (id,topic_id) VALUES (101,100)');
  await client.execute('INSERT INTO publishing (id,topic_id) VALUES (102,100)');
  await client.execute(`INSERT INTO workflow_document_versions (document_type,document_id,version,content,change_type)
    VALUES ('topic_outline','100','v1.0','outline','minor'),
           ('shooting_script','101','v1.0','shooting','minor'),
           ('publishing_script','102','v1.0','publishing','minor')`);
  const topicDeleteTransaction = await client.transaction('write');
  try {
    await deleteWorkflowDocumentVersionsForTopic(transactionAdapter(topicDeleteTransaction), 100);
    await topicDeleteTransaction.commit();
  } catch (error) {
    await topicDeleteTransaction.rollback();
    throw error;
  } finally {
    topicDeleteTransaction.close();
  }
  const deletedTopicHistory = await client.execute(`SELECT COUNT(*) AS count FROM workflow_document_versions
    WHERE document_id IN ('100','101','102')`);
  assert.equal(Number(deletedTopicHistory.rows[0].count), 0, 'deleting a topic removes the three associated workflow histories');

  await client.execute('INSERT INTO shooting (id,topic_id) VALUES (201,200)');
  await client.execute(`INSERT INTO workflow_document_versions (document_type,document_id,version,content,change_type)
    VALUES ('shooting_script','201','v1.0','shooting','minor')`);
  const documentDeleteTransaction = await client.transaction('write');
  try {
    await deleteWorkflowDocumentVersionsForDocument(transactionAdapter(documentDeleteTransaction), 'shooting_script', 201);
    await documentDeleteTransaction.commit();
  } catch (error) {
    await documentDeleteTransaction.rollback();
    throw error;
  } finally {
    documentDeleteTransaction.close();
  }
  const deletedDocumentHistory = await client.execute(`SELECT COUNT(*) AS count FROM workflow_document_versions
    WHERE document_type='shooting_script' AND document_id='201'`);
  assert.equal(Number(deletedDocumentHistory.rows[0].count), 0, 'deleting one workflow document removes its history');
  console.log('Workflow document versions test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
