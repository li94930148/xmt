import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client, InArgs, InStatement } from '@libsql/client';
import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureLegacySchemaColumns,
  LEGACY_SCHEMA_COLUMN_DEFINITIONS,
  type LegacySchemaTable,
} from '../../api/database/legacy-schema-columns.js';

const tables = Object.keys(LEGACY_SCHEMA_COLUMN_DEFINITIONS) as LegacySchemaTable[];

describe('legacy database schema compatibility columns', () => {
  let directory: string;
  let client: Client;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-legacy-schema-columns-'));
    client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });
  });

  afterEach(async () => {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it('adds every declared missing field, preserves records and remains repeatable', async () => {
    for (const table of tables) {
      await client.execute(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, legacy_value TEXT)`);
      await client.execute(`INSERT INTO ${table} (id, legacy_value) VALUES (1, 'preserved')`);
      await ensureLegacySchemaColumns(client, table);
      const columns = (await client.execute(`PRAGMA table_info(${table})`)).rows.map((row) => String(row.name));
      expect(columns).toEqual([
        'id',
        'legacy_value',
        ...LEGACY_SCHEMA_COLUMN_DEFINITIONS[table].map((column) => column.name),
      ]);
      const row = await client.execute(`SELECT * FROM ${table} WHERE id = 1`);
      expect(row.rows[0]).toMatchObject({ id: 1, legacy_value: 'preserved' });
      await ensureLegacySchemaColumns(client, table);
      const repeated = (await client.execute(`PRAGMA table_info(${table})`)).rows.map((item) => String(item.name));
      expect(repeated).toEqual(columns);
    }

    await client.execute('INSERT INTO douyin_sync_logs (id) VALUES (2)');
    const defaultSummary = await client.execute('SELECT summary_json FROM douyin_sync_logs WHERE id = 2');
    expect(defaultSummary.rows[0]?.summary_json).toBe('{}');
  });

  it('matches existing column names without regard to case', async () => {
    await client.execute('CREATE TABLE resources (id INTEGER PRIMARY KEY, CONTENT TEXT)');
    await ensureLegacySchemaColumns(client, 'resources');

    const columns = (await client.execute('PRAGMA table_info(resources)')).rows.map((row) => String(row.name));
    expect(columns.filter((name) => name.toLowerCase() === 'content')).toEqual(['CONTENT']);
  });

  it('rethrows schema read failures unchanged', async () => {
    const expectedError = new Error('simulated legacy schema read failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql === 'PRAGMA table_info(resources)',
      expectedError,
    );

    await expect(ensureLegacySchemaColumns(failingClient, 'resources')).rejects.toBe(expectedError);
  });

  it('rethrows ALTER failures unchanged', async () => {
    await client.execute('CREATE TABLE resources (id INTEGER PRIMARY KEY)');
    const expectedError = new Error('simulated legacy schema ALTER failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql.startsWith('ALTER TABLE resources ADD COLUMN'),
      expectedError,
    );

    await expect(ensureLegacySchemaColumns(failingClient, 'resources')).rejects.toBe(expectedError);
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
