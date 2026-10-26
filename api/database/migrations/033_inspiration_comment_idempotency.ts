import type { DatabaseMigration } from './types';

/** Add an optional client request key so comment retries cannot create duplicates. */
export const inspirationCommentIdempotencyMigration: DatabaseMigration = {
  version: '033',
  name: 'inspiration_comment_idempotency',
  checksum: '033-inspiration-comment-idempotency-v1',
  async up(executor) {
    const columns = await executor.execute('PRAGMA table_info(inspiration_comments)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!columnNames.has('client_request_id')) {
      await executor.execute('ALTER TABLE inspiration_comments ADD COLUMN client_request_id TEXT');
    }

    await executor.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_inspiration_comments_client_request_id
      ON inspiration_comments(client_request_id)
    `);

    const verifiedColumns = await executor.execute('PRAGMA table_info(inspiration_comments)');
    if (!verifiedColumns.rows.some((column) => String(column.name) === 'client_request_id')) {
      throw new Error('INSPIRATION_COMMENT_REQUEST_ID_COLUMN_MISSING');
    }

    const indexes = await executor.execute("PRAGMA index_list('inspiration_comments')");
    const index = indexes.rows.find((row) => String(row.name) === 'idx_inspiration_comments_client_request_id');
    if (!index || Number(index.unique) !== 1) {
      throw new Error('INSPIRATION_COMMENT_REQUEST_ID_INDEX_INVALID');
    }

    const indexedColumns = await executor.execute("PRAGMA index_info('idx_inspiration_comments_client_request_id')");
    if (indexedColumns.rows.map((row) => String(row.name)).join(',') !== 'client_request_id') {
      throw new Error('INSPIRATION_COMMENT_REQUEST_ID_INDEX_COLUMNS_INVALID');
    }
  },
};
