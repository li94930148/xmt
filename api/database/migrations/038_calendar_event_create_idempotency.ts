import type { DatabaseMigration } from './types';

/** Keep calendar-event create replay keys outside user-visible calendar rows. */
export const calendarEventCreateIdempotencyMigration: DatabaseMigration = {
  version: '038',
  name: 'calendar_event_create_idempotency',
  checksum: '038-calendar-event-create-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS calendar_event_create_request_keys (
        client_request_id TEXT PRIMARY KEY,
        creator_id INTEGER NOT NULL,
        event_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(calendar_event_create_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'creator_id', 'event_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('CALENDAR_EVENT_CREATE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('CALENDAR_EVENT_CREATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
