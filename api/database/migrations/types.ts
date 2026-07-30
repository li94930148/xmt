import type { InStatement, ResultSet } from '@libsql/client';

export type MigrationExecutor = {
  execute(statement: InStatement): Promise<ResultSet>;
};

export type DatabaseMigration = {
  version: string;
  name: string;
  checksum: string;
  up(executor: MigrationExecutor): Promise<void>;
};
