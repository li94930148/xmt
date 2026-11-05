import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client, InArgs, InStatement } from '@libsql/client';
import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureSocialVideoSchemaColumns } from '../../api/database/social-videos-schema.js';

describe('social videos schema compatibility helper', () => {
  let directory: string;
  let client: Client;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-social-videos-schema-'));
    client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });
  });

  afterEach(async () => {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it('adds missing columns, preserves records and is idempotent', async () => {
    await client.execute(`CREATE TABLE social_videos (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      snapshot_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      external_video_id TEXT,
      title TEXT
    )`);
    await client.execute("INSERT INTO social_videos (id, account_id, snapshot_id, platform, external_video_id, title) VALUES (9, 2, 3, 'douyin', 'video-9', 'legacy')");

    await ensureSocialVideoSchemaColumns(client);

    const row = await client.execute(
      'SELECT id, external_video_id, title, internal_video_key, duration, avg_play_duration FROM social_videos WHERE id = 9',
    );
    expect(row.rows[0]).toMatchObject({
      id: 9,
      external_video_id: 'video-9',
      title: 'legacy',
      internal_video_key: null,
      duration: null,
      avg_play_duration: null,
    });

    const firstColumns = (await client.execute('PRAGMA table_info(social_videos)'))
      .rows.map((column) => String(column.name));
    await ensureSocialVideoSchemaColumns(client);
    const secondColumns = (await client.execute('PRAGMA table_info(social_videos)'))
      .rows.map((column) => String(column.name));
    expect(secondColumns).toEqual(firstColumns);
  });

  it('matches existing column names without regard to case', async () => {
    await client.execute(`CREATE TABLE social_videos (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      snapshot_id INTEGER NOT NULL,
      INTERNAL_VIDEO_KEY TEXT,
      STATUS TEXT
    )`);

    await ensureSocialVideoSchemaColumns(client);

    const columns = (await client.execute('PRAGMA table_info(social_videos)'))
      .rows.map((column) => String(column.name));
    expect(columns.filter((name) => name.toLowerCase() === 'internal_video_key')).toEqual(['INTERNAL_VIDEO_KEY']);
    expect(columns.filter((name) => name.toLowerCase() === 'status')).toEqual(['STATUS']);
  });

  it('rethrows schema read failures unchanged', async () => {
    const expectedError = new Error('simulated social videos schema read failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql === 'PRAGMA table_info(social_videos)',
      expectedError,
    );

    await expect(ensureSocialVideoSchemaColumns(failingClient)).rejects.toBe(expectedError);
  });

  it('rethrows ALTER failures unchanged', async () => {
    await client.execute(`CREATE TABLE social_videos (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      snapshot_id INTEGER NOT NULL
    )`);
    const expectedError = new Error('simulated social videos ALTER failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql.startsWith('ALTER TABLE social_videos ADD COLUMN'),
      expectedError,
    );

    await expect(ensureSocialVideoSchemaColumns(failingClient)).rejects.toBe(expectedError);
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
