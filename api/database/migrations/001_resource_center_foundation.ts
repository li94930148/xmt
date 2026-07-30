import type { DatabaseMigration, MigrationExecutor } from './types';

const RESOURCE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['library_type', `TEXT CHECK (library_type IS NULL OR library_type IN ('project', 'content_archive', 'knowledge', 'media'))`],
  ['title', 'TEXT'],
  ['summary', 'TEXT'],
  ['content_text', 'TEXT'],
  ['category_id', 'INTEGER'],
  ['parent_id', 'INTEGER'],
  ['visibility', `TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('private', 'project', 'team', 'company'))`],
  ['status', `TEXT NOT NULL DEFAULT 'published'`],
  ['source_type', 'TEXT'],
  ['source_uri', 'TEXT'],
  ['owner_id', 'INTEGER'],
  ['deleted_at', 'DATETIME'],
  ['created_by', 'INTEGER'],
  ['updated_by', 'INTEGER'],
];

async function getColumnNames(executor: MigrationExecutor, table: string) {
  const result = await executor.execute(`PRAGMA table_info("${table}")`);
  return new Set(Array.from(result.rows, (row) => String(row.name)));
}

async function addMissingResourceColumns(executor: MigrationExecutor) {
  const existingColumns = await getColumnNames(executor, 'resources');

  for (const [name, definition] of RESOURCE_COLUMNS) {
    if (!existingColumns.has(name)) {
      await executor.execute(`ALTER TABLE resources ADD COLUMN "${name}" ${definition}`);
    }
  }
}

async function createResourceTables(executor: MigrationExecutor) {
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS resource_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      mime_type TEXT,
      extension TEXT,
      size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
      sha256 TEXT,
      is_primary BOOLEAN NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_by INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS resource_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      library_type TEXT NOT NULL CHECK (library_type IN ('project', 'content_archive', 'knowledge', 'media')),
      parent_id INTEGER,
      name TEXT NOT NULL,
      code TEXT,
      path TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES resource_categories(id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS resource_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      created_by INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS resource_tag_relations (
      resource_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_by INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (resource_id, tag_id),
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES resource_tags(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS resource_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('topic', 'production', 'shooting', 'publishing', 'user')),
      target_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL,
      created_by INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (resource_id, target_type, target_id, relation_type),
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS resource_import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_name TEXT NOT NULL,
      source_sha256 TEXT,
      status TEXT NOT NULL,
      stats_json TEXT,
      created_by INTEGER,
      started_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS resource_import_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      source_path TEXT NOT NULL,
      source_sha256 TEXT,
      resource_id INTEGER,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES resource_import_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
    )
  `);

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS resource_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER,
      user_id INTEGER,
      action TEXT NOT NULL,
      detail_json TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
}

async function createResourceIndexes(executor: MigrationExecutor) {
  const statements = [
    `CREATE INDEX IF NOT EXISTS idx_resources_library_status ON resources(library_type, status)`,
    `CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resources_parent ON resources(parent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resources_owner ON resources(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_files_resource ON resource_files(resource_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_files_sha256 ON resource_files(sha256)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_categories_parent ON resource_categories(parent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_categories_library_path ON resource_categories(library_type, path)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_categories_library_code
      ON resource_categories(library_type, code) WHERE code IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_resource_tag_relations_tag ON resource_tag_relations(tag_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_relations_target ON resource_relations(target_type, target_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_import_batches_status ON resource_import_batches(status)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_import_batches_sha256 ON resource_import_batches(source_sha256)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_import_items_batch ON resource_import_items(batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_import_items_resource ON resource_import_items(resource_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_import_items_sha256 ON resource_import_items(source_sha256)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_audit_logs_resource_created ON resource_audit_logs(resource_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_audit_logs_user_created ON resource_audit_logs(user_id, created_at)`,
  ];

  for (const statement of statements) {
    await executor.execute(statement);
  }
}

async function createResourceFts(executor: MigrationExecutor) {
  await executor.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS resource_fts USING fts5(
      title,
      summary,
      content_text,
      content='resources',
      content_rowid='id',
      tokenize='unicode61'
    )
  `);

  await executor.execute(`
    INSERT INTO resource_fts(resource_fts) VALUES ('rebuild')
  `);

  await executor.execute(`
    CREATE TRIGGER IF NOT EXISTS resource_fts_after_insert
    AFTER INSERT ON resources BEGIN
      INSERT INTO resource_fts(rowid, title, summary, content_text)
      VALUES (new.id, new.title, new.summary, new.content_text);
    END
  `);

  await executor.execute(`
    CREATE TRIGGER IF NOT EXISTS resource_fts_after_delete
    AFTER DELETE ON resources BEGIN
      INSERT INTO resource_fts(resource_fts, rowid, title, summary, content_text)
      VALUES ('delete', old.id, old.title, old.summary, old.content_text);
    END
  `);

  await executor.execute(`
    CREATE TRIGGER IF NOT EXISTS resource_fts_after_update
    AFTER UPDATE OF title, summary, content_text ON resources BEGIN
      INSERT INTO resource_fts(resource_fts, rowid, title, summary, content_text)
      VALUES ('delete', old.id, old.title, old.summary, old.content_text);
      INSERT INTO resource_fts(rowid, title, summary, content_text)
      VALUES (new.id, new.title, new.summary, new.content_text);
    END
  `);
}

async function backfillExistingResources(executor: MigrationExecutor) {
  await executor.execute(`
    UPDATE resources
    SET library_type = CASE
          WHEN type = 'archive' OR category = '已完成' THEN 'content_archive'
          ELSE COALESCE(library_type, 'knowledge')
        END,
        title = COALESCE(NULLIF(TRIM(title), ''), name),
        visibility = COALESCE(NULLIF(TRIM(visibility), ''), 'team'),
        status = COALESCE(NULLIF(TRIM(status), ''), 'published'),
        source_type = COALESCE(
          NULLIF(TRIM(source_type), ''),
          CASE WHEN type = 'archive' OR category = '已完成' THEN 'system_archive' ELSE 'legacy' END
        ),
        owner_id = COALESCE(owner_id, uploader_id),
        created_by = COALESCE(created_by, uploader_id),
        updated_by = COALESCE(updated_by, uploader_id)
  `);

}

export const resourceCenterFoundationMigration: DatabaseMigration = {
  version: '001',
  name: 'resource_center_foundation',
  checksum: '001-resource-center-foundation-v2',
  async up(executor) {
    await addMissingResourceColumns(executor);
    await createResourceTables(executor);
    await createResourceIndexes(executor);
    await backfillExistingResources(executor);
    await createResourceFts(executor);
  },
};
