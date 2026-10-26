import type { DatabaseMigration } from './types';

/** Keep cancellation retry state outside the legacy active/completed session table. */
export const pomodoroCancellationLedgerMigration: DatabaseMigration = {
  version: '032',
  name: 'pomodoro_cancellation_ledger',
  checksum: '032-pomodoro-cancellation-ledger-v2',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS pomodoro_cancellation_ledger (
        user_id INTEGER NOT NULL,
        session_id INTEGER NOT NULL,
        cancelled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, session_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(pomodoro_cancellation_ledger)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!columnNames.has('user_id') || !columnNames.has('session_id') || !columnNames.has('cancelled_at')) {
      throw new Error('POMODORO_CANCELLATION_LEDGER_SCHEMA_INVALID');
    }

    const primaryKeyColumns = columns.rows
      .filter((column) => Number(column.pk) > 0)
      .sort((left, right) => Number(left.pk) - Number(right.pk))
      .map((column) => String(column.name));
    if (primaryKeyColumns.join(',') !== 'user_id,session_id') {
      throw new Error('POMODORO_CANCELLATION_LEDGER_KEY_INVALID');
    }
  },
};
