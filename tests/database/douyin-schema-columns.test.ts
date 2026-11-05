import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client, InArgs, InStatement } from '@libsql/client';
import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureDouyinSchemaColumns } from '../../api/database/douyin-schema-columns.js';

describe('Douyin schema compatibility columns', () => {
  let directory: string;
  let client: Client;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-douyin-schema-columns-'));
    client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });
  });

  afterEach(async () => {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it('adds only missing columns, preserves rows and is idempotent', async () => {
    await client.execute(`CREATE TABLE douyin_account_statistics (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      fans_count INTEGER DEFAULT 0,
      snapshot_date TEXT NOT NULL
    )`);
    await client.execute(`CREATE TABLE douyin_videos (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      item_id TEXT NOT NULL
    )`);
    await client.execute(`CREATE TABLE douyin_video_statistics (
      id INTEGER PRIMARY KEY,
      video_id INTEGER NOT NULL,
      snapshot_date TEXT NOT NULL
    )`);
    await client.execute("INSERT INTO douyin_account_statistics (id, account_id, fans_count, snapshot_date) VALUES (5, 12, 80, '2026-11-04')");
    await client.execute("INSERT INTO douyin_videos (id, account_id, item_id) VALUES (7, 12, 'item-7')");

    await ensureDouyinSchemaColumns(client);

    const account = await client.execute(
      'SELECT id, account_id, fans_count, play_count, new_fans, douyin_data_source FROM douyin_account_statistics WHERE id = 5',
    );
    expect(account.rows[0]).toMatchObject({
      id: 5,
      account_id: 12,
      fans_count: 80,
      play_count: 0,
      new_fans: 0,
      douyin_data_source: 'oauth',
    });
    const video = await client.execute('SELECT id, item_id, status, douyin_data_source FROM douyin_videos WHERE id = 7');
    expect(video.rows[0]).toMatchObject({
      id: 7,
      item_id: 'item-7',
      status: 'deprecated_pending_business_auth',
      douyin_data_source: 'oauth',
    });
    const videoStatistics = await client.execute('PRAGMA table_info(douyin_video_statistics)');
    expect(videoStatistics.rows.map((column) => String(column.name))).toContain('douyin_data_source');

    const firstSchemas = await Promise.all([
      client.execute('PRAGMA table_info(douyin_account_statistics)'),
      client.execute('PRAGMA table_info(douyin_videos)'),
      client.execute('PRAGMA table_info(douyin_video_statistics)'),
    ]);
    await ensureDouyinSchemaColumns(client);
    const secondSchemas = await Promise.all([
      client.execute('PRAGMA table_info(douyin_account_statistics)'),
      client.execute('PRAGMA table_info(douyin_videos)'),
      client.execute('PRAGMA table_info(douyin_video_statistics)'),
    ]);
    expect(secondSchemas.map((schema) => schema.rows.map((column) => String(column.name))))
      .toEqual(firstSchemas.map((schema) => schema.rows.map((column) => String(column.name))));
  });

  it('matches existing column names without regard to case', async () => {
    await client.execute(`CREATE TABLE douyin_account_statistics (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      PLAY_COUNT INTEGER DEFAULT 0
    )`);
    await client.execute('CREATE TABLE douyin_videos (id INTEGER PRIMARY KEY, STATUS TEXT)');
    await client.execute('CREATE TABLE douyin_video_statistics (id INTEGER PRIMARY KEY)');

    await ensureDouyinSchemaColumns(client);

    const accountColumns = (await client.execute('PRAGMA table_info(douyin_account_statistics)'))
      .rows.map((column) => String(column.name));
    expect(accountColumns.filter((name) => name.toLowerCase() === 'play_count')).toEqual(['PLAY_COUNT']);
    const videoColumns = (await client.execute('PRAGMA table_info(douyin_videos)'))
      .rows.map((column) => String(column.name));
    expect(videoColumns.filter((name) => name.toLowerCase() === 'status')).toEqual(['STATUS']);
  });

  it('rethrows schema read failures unchanged', async () => {
    const expectedError = new Error('simulated Douyin schema read failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql === 'PRAGMA table_info(douyin_account_statistics)',
      expectedError,
    );

    await expect(ensureDouyinSchemaColumns(failingClient)).rejects.toBe(expectedError);
  });

  it('rethrows ALTER failures unchanged', async () => {
    await client.execute(`CREATE TABLE douyin_account_statistics (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      snapshot_date TEXT NOT NULL
    )`);
    await client.execute('CREATE TABLE douyin_videos (id INTEGER PRIMARY KEY, status TEXT, douyin_data_source TEXT)');
    await client.execute('CREATE TABLE douyin_video_statistics (id INTEGER PRIMARY KEY, douyin_data_source TEXT)');
    const expectedError = new Error('simulated Douyin schema ALTER failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql.startsWith('ALTER TABLE douyin_account_statistics ADD COLUMN'),
      expectedError,
    );

    await expect(ensureDouyinSchemaColumns(failingClient)).rejects.toBe(expectedError);
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
