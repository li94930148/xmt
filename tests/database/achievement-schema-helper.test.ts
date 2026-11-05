import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client, InArgs, InStatement } from '@libsql/client';
import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureAchievementSchemaColumns } from '../../api/database/achievement-schema.js';

describe('achievement schema compatibility helper', () => {
  let directory: string;
  let client: Client;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-achievement-schema-'));
    client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });
  });

  afterEach(async () => {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it('adds only missing fields to an old achievements table and remains idempotent', async () => {
    await client.execute(`CREATE TABLE achievements (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )`);

    await ensureAchievementSchemaColumns(client);
    const firstSchema = await client.execute('PRAGMA table_info(achievements)');
    const firstColumnNames = firstSchema.rows.map((row) => String(row.name));

    expect(firstColumnNames).toEqual([
      'id',
      'name',
      'points',
      'category',
      'rarity',
      'sort_order',
    ]);

    await client.execute("INSERT INTO achievements (name) VALUES ('legacy')");
    const defaults = await client.execute(
      'SELECT points, category, rarity, sort_order FROM achievements WHERE name = ?',
      ['legacy'],
    );
    expect(defaults.rows[0]).toMatchObject({
      points: 10,
      category: 'milestone',
      rarity: 'common',
      sort_order: 0,
    });

    await ensureAchievementSchemaColumns(client);
    const secondSchema = await client.execute('PRAGMA table_info(achievements)');
    expect(secondSchema.rows.map((row) => String(row.name))).toEqual(firstColumnNames);
  });

  it('matches existing SQLite column names without regard to case', async () => {
    await client.execute(`CREATE TABLE achievements (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      POINTS INTEGER DEFAULT 10
    )`);

    await ensureAchievementSchemaColumns(client);

    const schema = await client.execute('PRAGMA table_info(achievements)');
    const columnNames = schema.rows.map((row) => String(row.name));
    expect(columnNames.filter((name) => name.toLowerCase() === 'points')).toEqual(['POINTS']);
    expect(columnNames.map((name) => name.toLowerCase())).toEqual([
      'id',
      'name',
      'points',
      'category',
      'rarity',
      'sort_order',
    ]);
  });

  it('rethrows an ALTER failure unchanged', async () => {
    await client.execute(`CREATE TABLE achievements (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )`);
    const expectedError = new Error('simulated achievement ALTER failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql.startsWith('ALTER TABLE achievements ADD COLUMN'),
      expectedError,
    );

    await expect(ensureAchievementSchemaColumns(failingClient)).rejects.toBe(expectedError);
  });

  it('rethrows a schema read failure unchanged', async () => {
    const expectedError = new Error('simulated achievement schema read failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql === 'PRAGMA table_info(achievements)',
      expectedError,
    );

    await expect(ensureAchievementSchemaColumns(failingClient)).rejects.toBe(expectedError);
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
