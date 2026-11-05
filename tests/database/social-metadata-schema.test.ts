import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client, InArgs, InStatement } from '@libsql/client';
import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureSocialMetadataSchemaColumns } from '../../api/database/social-metadata-schema.js';

describe('social metadata schema compatibility helper', () => {
  let directory: string;
  let client: Client;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-social-metadata-schema-'));
    client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });
  });

  afterEach(async () => {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it('adds missing metadata columns, preserves rows and is idempotent', async () => {
    await client.execute('CREATE TABLE social_accounts (id INTEGER PRIMARY KEY, platform TEXT, account_name TEXT)');
    await client.execute('CREATE TABLE social_ingestion_jobs (id INTEGER PRIMARY KEY, platform TEXT, status TEXT)');
    await client.execute('CREATE TABLE social_credentials (id INTEGER PRIMARY KEY, credential_ref TEXT NOT NULL, status TEXT)');
    await client.execute("INSERT INTO social_accounts (id, platform, account_name) VALUES (4, 'douyin', 'brand')");
    await client.execute("INSERT INTO social_ingestion_jobs (id, platform, status) VALUES (8, 'douyin', 'failed')");
    await client.execute("INSERT INTO social_credentials (id, credential_ref, status) VALUES (12, 'cred-12', 'expired')");

    await ensureSocialMetadataSchemaColumns(client);

    const account = await client.execute('SELECT id, account_name, credential_ref FROM social_accounts WHERE id = 4');
    expect(account.rows[0]).toMatchObject({ id: 4, account_name: 'brand', credential_ref: null });
    const job = await client.execute('SELECT id, status, trigger_source, failure_type FROM social_ingestion_jobs WHERE id = 8');
    expect(job.rows[0]).toMatchObject({ id: 8, status: 'failed', trigger_source: 'manual', failure_type: null });
    const credential = await client.execute('SELECT id, credential_ref, status, expired_reason FROM social_credentials WHERE id = 12');
    expect(credential.rows[0]).toMatchObject({ id: 12, credential_ref: 'cred-12', status: 'expired', expired_reason: null });

    const firstSchemas = await Promise.all([
      client.execute('PRAGMA table_info(social_accounts)'),
      client.execute('PRAGMA table_info(social_ingestion_jobs)'),
      client.execute('PRAGMA table_info(social_credentials)'),
    ]);
    await ensureSocialMetadataSchemaColumns(client);
    const secondSchemas = await Promise.all([
      client.execute('PRAGMA table_info(social_accounts)'),
      client.execute('PRAGMA table_info(social_ingestion_jobs)'),
      client.execute('PRAGMA table_info(social_credentials)'),
    ]);
    expect(secondSchemas.map((schema) => schema.rows.map((column) => String(column.name))))
      .toEqual(firstSchemas.map((schema) => schema.rows.map((column) => String(column.name))));
  });

  it('matches existing column names without regard to case', async () => {
    await client.execute('CREATE TABLE social_accounts (id INTEGER PRIMARY KEY, CREDENTIAL_REF TEXT)');
    await client.execute('CREATE TABLE social_ingestion_jobs (id INTEGER PRIMARY KEY, TRIGGER_SOURCE TEXT)');
    await client.execute('CREATE TABLE social_credentials (id INTEGER PRIMARY KEY, EXPIRED_REASON TEXT)');

    await ensureSocialMetadataSchemaColumns(client);

    const accountColumns = (await client.execute('PRAGMA table_info(social_accounts)'))
      .rows.map((column) => String(column.name));
    expect(accountColumns.filter((name) => name.toLowerCase() === 'credential_ref')).toEqual(['CREDENTIAL_REF']);
    const jobColumns = (await client.execute('PRAGMA table_info(social_ingestion_jobs)'))
      .rows.map((column) => String(column.name));
    expect(jobColumns.filter((name) => name.toLowerCase() === 'trigger_source')).toEqual(['TRIGGER_SOURCE']);
    const credentialColumns = (await client.execute('PRAGMA table_info(social_credentials)'))
      .rows.map((column) => String(column.name));
    expect(credentialColumns.filter((name) => name.toLowerCase() === 'expired_reason')).toEqual(['EXPIRED_REASON']);
  });

  it('rethrows schema read failures unchanged', async () => {
    const expectedError = new Error('simulated social metadata schema read failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql === 'PRAGMA table_info(social_accounts)',
      expectedError,
    );

    await expect(ensureSocialMetadataSchemaColumns(failingClient)).rejects.toBe(expectedError);
  });

  it('rethrows ALTER failures unchanged', async () => {
    await client.execute('CREATE TABLE social_accounts (id INTEGER PRIMARY KEY)');
    await client.execute('CREATE TABLE social_ingestion_jobs (id INTEGER PRIMARY KEY, trigger_source TEXT, failure_type TEXT)');
    await client.execute('CREATE TABLE social_credentials (id INTEGER PRIMARY KEY, expired_reason TEXT, last_check_time DATETIME, last_success_time DATETIME, last_failure_time DATETIME, failure_reason TEXT, expire_detected_at DATETIME)');
    const expectedError = new Error('simulated social metadata ALTER failure');
    const failingClient = clientWithExecuteFailure(
      client,
      (sql) => sql.startsWith('ALTER TABLE social_accounts ADD COLUMN'),
      expectedError,
    );

    await expect(ensureSocialMetadataSchemaColumns(failingClient)).rejects.toBe(expectedError);
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
