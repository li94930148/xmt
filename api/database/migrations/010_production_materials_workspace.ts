import type { DatabaseMigration } from './types';

/**
 * Additive production-material snapshots. Legacy resource relations remain in
 * place so an older application binary can still render the reference list.
 */
export const productionMaterialsWorkspaceMigration: DatabaseMigration = {
  version: '010',
  name: 'production_materials_workspace',
  checksum: '010-production-materials-workspace-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS production_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        production_id INTEGER NOT NULL,
        source_resource_id INTEGER,
        material_type TEXT NOT NULL CHECK (material_type IN ('library', 'manual')),
        title TEXT NOT NULL,
        content_html TEXT NOT NULL DEFAULT '',
        content_format TEXT NOT NULL DEFAULT 'html_v1',
        source_name TEXT NOT NULL,
        source_url TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER,
        updated_by INTEGER,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (production_id) REFERENCES production(id) ON DELETE CASCADE,
        FOREIGN KEY (source_resource_id) REFERENCES resources(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_production_materials_production_sort ON production_materials(production_id, sort_order, id)`);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_production_materials_source ON production_materials(source_resource_id)`);
    await executor.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_production_materials_unique_source ON production_materials(production_id, source_resource_id) WHERE source_resource_id IS NOT NULL`);

    // Preserve every historical production reference as an independent snapshot.
    // content_text is marked plain_text so angle brackets from imported documents
    // are escaped when read instead of being interpreted as trusted HTML.
    await executor.execute(`
      INSERT OR IGNORE INTO production_materials (
        production_id, source_resource_id, material_type, title, content_html,
        content_format, source_name, source_url, sort_order, revision,
        created_by, updated_by, created_at, updated_at
      )
      SELECT
        rr.target_id,
        r.id,
        'library',
        COALESCE(NULLIF(TRIM(r.title), ''), NULLIF(TRIM(r.name), ''), '未命名资料'),
        COALESCE(r.content_text, ''),
        'plain_text',
        CASE r.library_type
          WHEN 'project' THEN '项目资料库'
          WHEN 'content_archive' THEN '内容档案库'
          WHEN 'knowledge' THEN '知识库'
          WHEN 'media' THEN '素材归档库'
          ELSE '资料库'
        END,
        r.source_uri,
        rr.id,
        1,
        rr.created_by,
        rr.created_by,
        rr.created_at,
        rr.created_at
      FROM resource_relations rr
      JOIN resources r ON r.id = rr.resource_id
      JOIN production p ON p.id = rr.target_id
      WHERE rr.target_type = 'production' AND rr.relation_type = 'reference'
    `);
  },
};
