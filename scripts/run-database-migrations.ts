import { createClient } from '@libsql/client';
import { getDatabasePath, getDatabaseUrl } from '../api/database/path';
import { runDatabaseMigrations } from '../api/database/migrations/runner';

async function main() {
  const client = createClient({ url: getDatabaseUrl() });
  await client.execute('PRAGMA foreign_keys = ON');
  await runDatabaseMigrations(client);

  const migrations = await client.execute(`
    SELECT version, name, checksum, status, started_at, applied_at, error_message
    FROM database_migrations
    ORDER BY version
  `);

  console.log(JSON.stringify({
    databasePath: getDatabasePath(),
    migrations: migrations.rows,
  }, null, 2));
  await client.execute('PRAGMA wal_checkpoint(TRUNCATE)');
  client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
