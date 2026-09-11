import type { DatabaseMigration } from './types';

// One empty paragraph is the HTML equivalent of a blank line between bodies.
const MATERIAL_GAP_HTML = '<p><br></p>';

function plainTextToHtml(value: unknown) {
  const escaped = String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return `<p>${escaped.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>')}</p>`;
}

/** Collapse the v2.20.22 card snapshots into one production-scoped draft. */
export const productionMaterialDraftMigration: DatabaseMigration = {
  version: '011',
  name: 'production_material_draft',
  checksum: '011-production-material-draft-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS production_material_drafts (
        production_id INTEGER PRIMARY KEY,
        content_html TEXT NOT NULL DEFAULT '',
        revision INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER,
        updated_by INTEGER,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (production_id) REFERENCES production(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    const result = await executor.execute(`
      SELECT production_id, content_html, content_format, created_by, updated_by,
             created_at, updated_at
      FROM production_materials
      ORDER BY production_id ASC, sort_order ASC, id ASC
    `);
    const drafts = new Map<number, {
      parts: string[];
      createdBy: number | null;
      updatedBy: number | null;
      createdAt: string | null;
      updatedAt: string | null;
    }>();

    for (const row of result.rows) {
      const raw = String(row.content_html ?? '');
      if (!raw.trim()) continue;
      const productionId = Number(row.production_id);
      const current = drafts.get(productionId) ?? {
        parts: [],
        createdBy: row.created_by == null ? null : Number(row.created_by),
        updatedBy: row.updated_by == null ? null : Number(row.updated_by),
        createdAt: row.created_at == null ? null : String(row.created_at),
        updatedAt: row.updated_at == null ? null : String(row.updated_at),
      };
      current.parts.push(row.content_format === 'plain_text' ? plainTextToHtml(raw) : raw.trim());
      current.updatedBy = row.updated_by == null ? null : Number(row.updated_by);
      current.updatedAt = row.updated_at == null ? null : String(row.updated_at);
      drafts.set(productionId, current);
    }

    for (const [productionId, draft] of drafts) {
      await executor.execute({
        sql: `
          INSERT OR IGNORE INTO production_material_drafts(
            production_id, content_html, revision, created_by, updated_by, created_at, updated_at
          ) VALUES(?,?,1,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP))
        `,
        args: [
          productionId,
          draft.parts.join(MATERIAL_GAP_HTML),
          draft.createdBy,
          draft.updatedBy,
          draft.createdAt,
          draft.updatedAt,
        ],
      });
    }
  },
};
