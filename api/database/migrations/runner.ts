import type { Client } from '@libsql/client';
import { databaseMigrations } from './index';

const CREATE_MIGRATION_TABLE = `
  CREATE TABLE IF NOT EXISTS database_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'applied', 'failed')),
    started_at DATETIME NOT NULL,
    applied_at DATETIME,
    error_message TEXT
  )
`;

function migrationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}

export async function runDatabaseMigrations(client: Client) {
  await client.execute(CREATE_MIGRATION_TABLE);

  for (const migration of databaseMigrations) {
    const existing = await client.execute({
      sql: `SELECT version, name, checksum, status FROM database_migrations WHERE version = ?`,
      args: [migration.version],
    });
    const record = existing.rows[0];

    if (record?.status === 'applied') {
      if (String(record.checksum) !== migration.checksum || String(record.name) !== migration.name) {
        throw new Error(
          `Migration ${migration.version} metadata changed after it was applied; create a new migration instead`,
        );
      }
      continue;
    }

    await client.execute({
      sql: `
        INSERT INTO database_migrations
          (version, name, checksum, status, started_at, applied_at, error_message)
        VALUES (?, ?, ?, 'running', datetime('now', '+8 hours'), NULL, NULL)
        ON CONFLICT(version) DO UPDATE SET
          name = excluded.name,
          checksum = excluded.checksum,
          status = 'running',
          started_at = excluded.started_at,
          applied_at = NULL,
          error_message = NULL
      `,
      args: [migration.version, migration.name, migration.checksum],
    });

    const transaction = await client.transaction('write');
    try {
      await migration.up(transaction);
      await transaction.execute({
        sql: `
          UPDATE database_migrations
          SET status = 'applied',
              applied_at = datetime('now', '+8 hours'),
              error_message = NULL
          WHERE version = ?
        `,
        args: [migration.version],
      });
      await transaction.commit();
      console.log(`[DB] migration ${migration.version} ${migration.name} applied`);
    } catch (error) {
      await transaction.rollback();
      await client.execute({
        sql: `
          UPDATE database_migrations
          SET status = 'failed',
              applied_at = NULL,
              error_message = ?
          WHERE version = ?
        `,
        args: [migrationErrorMessage(error), migration.version],
      });
      throw error;
    } finally {
      transaction.close();
    }
  }
}
