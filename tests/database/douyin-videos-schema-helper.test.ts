import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renameLegacyDouyinVideosTable } from '../../api/database/douyin-videos-schema.js';

describe('legacy douyin_videos schema compatibility helper', () => {
  let directory: string;
  let client: Client;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-douyin-videos-schema-'));
    client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });
  });

  afterEach(async () => {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it('treats an absent table and a table without snapshot_id as no-op cases', async () => {
    await expect(renameLegacyDouyinVideosTable(client)).resolves.toBeUndefined();

    const table = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'douyin_videos'",
    );
    expect(table.rows).toEqual([]);

    await client.execute('CREATE TABLE douyin_videos (id INTEGER PRIMARY KEY, item_id TEXT NOT NULL)');
    await expect(renameLegacyDouyinVideosTable(client)).resolves.toBeUndefined();

    const currentColumns = await client.execute('PRAGMA table_info(douyin_videos)');
    const legacyTable = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'douyin_videos_legacy_deprecated'",
    );
    expect(currentColumns.rows.map((row) => String(row.name))).toEqual(['id', 'item_id']);
    expect(legacyTable.rows).toEqual([]);
  });

  it('renames the legacy table only when snapshot_id exists and retains its data', async () => {
    await client.execute(`CREATE TABLE douyin_videos (
      id INTEGER PRIMARY KEY,
      snapshot_id INTEGER NOT NULL,
      title TEXT NOT NULL
    )`);
    await client.execute("INSERT INTO douyin_videos (id, snapshot_id, title) VALUES (7, 23, 'legacy')");

    await renameLegacyDouyinVideosTable(client);

    const renamed = await client.execute(
      "SELECT id, snapshot_id, title FROM douyin_videos_legacy_deprecated WHERE id = 7",
    );
    expect(renamed.rows[0]).toEqual({ id: 7, snapshot_id: 23, title: 'legacy' });
    expect((await client.execute('PRAGMA table_info(douyin_videos)')).rows).toEqual([]);
  });

  it('rethrows a rename-target conflict from SQLite', async () => {
    await client.execute('CREATE TABLE douyin_videos (id INTEGER PRIMARY KEY, snapshot_id INTEGER)');
    await client.execute('CREATE TABLE douyin_videos_legacy_deprecated (id INTEGER PRIMARY KEY)');

    await expect(renameLegacyDouyinVideosTable(client)).rejects.toMatchObject({
      code: 'SQLITE_ERROR',
      message: expect.stringContaining('douyin_videos_legacy_deprecated'),
    });

    const source = await client.execute('PRAGMA table_info(douyin_videos)');
    const destination = await client.execute('PRAGMA table_info(douyin_videos_legacy_deprecated)');
    expect(source.rows.map((row) => String(row.name))).toEqual(['id', 'snapshot_id']);
    expect(destination.rows.map((row) => String(row.name))).toEqual(['id']);
  });
});
