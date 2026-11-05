import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client, InArgs, InStatement } from '@libsql/client';
import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backfillMissingTopicSubmissionTimes,
  ensureWorkflowContentSchemaColumns,
} from '../../api/database/workflow-content-schema.js';

describe('workflow and content schema compatibility helper', () => {
  let directory: string;
  let client: Client;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-content-schema-'));
    client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });
  });

  afterEach(async () => {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it('adds missing columns, preserves legacy data and is idempotent', async () => {
    await client.execute('CREATE TABLE topics (id INTEGER PRIMARY KEY, title TEXT, created_at TEXT)');
    await client.execute('CREATE TABLE production (id INTEGER PRIMARY KEY, topic_id INTEGER, content TEXT)');
    await client.execute('CREATE TABLE production_history (id INTEGER PRIMARY KEY, production_id INTEGER, content TEXT)');
    await client.execute('CREATE TABLE publishing (id INTEGER PRIMARY KEY, topic_id INTEGER, status TEXT)');
    await client.execute('CREATE TABLE shooting (id INTEGER PRIMARY KEY, topic_id INTEGER, status TEXT)');
    await client.execute("INSERT INTO topics (id, title, created_at) VALUES (2, 'legacy topic', '2026-11-04 12:00:00')");
    await client.execute("INSERT INTO production (id, topic_id, content) VALUES (3, 2, 'draft')");
    await client.execute("INSERT INTO production_history (id, production_id, content) VALUES (4, 3, 'old draft')");
    await client.execute("INSERT INTO publishing (id, topic_id, status) VALUES (5, 2, 'pending')");
    await client.execute("INSERT INTO shooting (id, topic_id, status) VALUES (6, 2, 'planned')");

    await ensureWorkflowContentSchemaColumns(client);
    await backfillMissingTopicSubmissionTimes(client);

    const topic = await client.execute('SELECT id, title, created_at, submitted_at, outline_json FROM topics WHERE id = 2');
    expect(topic.rows[0]).toMatchObject({
      id: 2,
      title: 'legacy topic',
      created_at: '2026-11-04 12:00:00',
      submitted_at: '2026-11-04 12:00:00',
      outline_json: null,
    });
    const production = await client.execute('SELECT id, content, editor_version FROM production WHERE id = 3');
    expect(production.rows[0]).toMatchObject({ id: 3, content: 'draft', editor_version: 'tiptap-1' });
    const history = await client.execute('SELECT id, content, version_state FROM production_history WHERE id = 4');
    expect(history.rows[0]).toMatchObject({ id: 4, content: 'old draft', version_state: 'historical' });
    const publishing = await client.execute('SELECT id, status, script_content FROM publishing WHERE id = 5');
    expect(publishing.rows[0]).toMatchObject({ id: 5, status: 'pending', script_content: null });
    const shooting = await client.execute('SELECT id, status, script_content FROM shooting WHERE id = 6');
    expect(shooting.rows[0]).toMatchObject({ id: 6, status: 'planned', script_content: null });

    const firstSchemas = await Promise.all([
      client.execute('PRAGMA table_info(topics)'),
      client.execute('PRAGMA table_info(production)'),
      client.execute('PRAGMA table_info(production_history)'),
      client.execute('PRAGMA table_info(publishing)'),
      client.execute('PRAGMA table_info(shooting)'),
    ]);
    await ensureWorkflowContentSchemaColumns(client);
    const secondSchemas = await Promise.all([
      client.execute('PRAGMA table_info(topics)'),
      client.execute('PRAGMA table_info(production)'),
      client.execute('PRAGMA table_info(production_history)'),
      client.execute('PRAGMA table_info(publishing)'),
      client.execute('PRAGMA table_info(shooting)'),
    ]);
    expect(secondSchemas.map((schema) => schema.rows.map((column) => String(column.name))))
      .toEqual(firstSchemas.map((schema) => schema.rows.map((column) => String(column.name))));
  });

  it('matches existing column names without regard to case', async () => {
    await client.execute('CREATE TABLE topics (id INTEGER PRIMARY KEY, WORKFLOW_TEMPLATE_ID INTEGER)');
    await client.execute('CREATE TABLE production (id INTEGER PRIMARY KEY, CONTENT_JSON TEXT)');
    await client.execute('CREATE TABLE production_history (id INTEGER PRIMARY KEY, VERSION_STATE TEXT)');
    await client.execute('CREATE TABLE publishing (id INTEGER PRIMARY KEY, SCRIPT_CONTENT TEXT)');
    await client.execute('CREATE TABLE shooting (id INTEGER PRIMARY KEY, SCRIPT_CONTENT TEXT)');

    await ensureWorkflowContentSchemaColumns(client);

    const topicColumns = (await client.execute('PRAGMA table_info(topics)')).rows.map((column) => String(column.name));
    expect(topicColumns.filter((name) => name.toLowerCase() === 'workflow_template_id')).toEqual(['WORKFLOW_TEMPLATE_ID']);
    const productionColumns = (await client.execute('PRAGMA table_info(production)')).rows.map((column) => String(column.name));
    expect(productionColumns.filter((name) => name.toLowerCase() === 'content_json')).toEqual(['CONTENT_JSON']);
  });

  it('rethrows schema read failures unchanged', async () => {
    const expectedError = new Error('simulated workflow content schema read failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql === 'PRAGMA table_info(topics)',
      expectedError,
    );

    await expect(ensureWorkflowContentSchemaColumns(failingClient)).rejects.toBe(expectedError);
  });

  it('rethrows ALTER failures unchanged', async () => {
    await client.execute('CREATE TABLE topics (id INTEGER PRIMARY KEY)');
    await client.execute('CREATE TABLE production (id INTEGER PRIMARY KEY, content_json TEXT, content_markdown TEXT, toc_json TEXT, comments_json TEXT, editor_version TEXT, last_saved_at DATETIME)');
    await client.execute('CREATE TABLE production_history (id INTEGER PRIMARY KEY, content_json TEXT, content_markdown TEXT, version_state TEXT, superseded_by_version TEXT, superseded_at DATETIME)');
    await client.execute('CREATE TABLE publishing (id INTEGER PRIMARY KEY, script_content TEXT)');
    await client.execute('CREATE TABLE shooting (id INTEGER PRIMARY KEY, script_content TEXT)');
    const expectedError = new Error('simulated workflow content schema ALTER failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql.startsWith('ALTER TABLE topics ADD COLUMN'),
      expectedError,
    );

    await expect(ensureWorkflowContentSchemaColumns(failingClient)).rejects.toBe(expectedError);
  });

  it('rethrows topic submission backfill failures unchanged', async () => {
    await client.execute('CREATE TABLE topics (id INTEGER PRIMARY KEY, created_at TEXT, submitted_at TEXT)');
    const expectedError = new Error('simulated submitted_at backfill failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql.startsWith('UPDATE topics SET submitted_at = created_at'),
      expectedError,
    );

    await expect(backfillMissingTopicSubmissionTimes(failingClient)).rejects.toBe(expectedError);
  });
});

function clientWithExecuteFailure(
  client: Client,
  shouldFail: (sql: string) => boolean,
  failure: Error,
): Pick<Client, 'execute'> {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== 'execute') return Reflect.get(target, property, receiver);

      return (statement: InStatement | string, args?: InArgs) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        if (shouldFail(sql)) return Promise.reject(failure);
        return typeof statement === 'string'
          ? target.execute(statement, args)
          : target.execute(statement);
      };
    },
  });
}
