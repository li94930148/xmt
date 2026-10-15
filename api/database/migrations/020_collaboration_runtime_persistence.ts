import type { DatabaseMigration } from './types';

/** Persist accepted Yjs updates separately from business manuscript content. */
export const collaborationRuntimePersistenceMigration: DatabaseMigration = {
  version: '020',
  name: 'collaboration_runtime_persistence',
  checksum: '020-collaboration-runtime-persistence-v1',
  async up(executor) {
    await executor.execute(`CREATE TABLE IF NOT EXISTS collaboration_document_snapshots (
      doc_id TEXT PRIMARY KEY,
      version INTEGER NOT NULL CHECK(version >= 0),
      state_base64 TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    await executor.execute(`CREATE TABLE IF NOT EXISTS collaboration_document_updates (
      doc_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK(version > 0),
      update_base64 TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(doc_id, version)
    )`);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_collaboration_document_updates_doc_version
      ON collaboration_document_updates(doc_id, version)`);

    // The runtime copy contains uncheckpointed manuscript text. Remove it with its
    // owning record so deleting a production/shooting item does not leave orphaned text.
    await executor.execute(`CREATE TRIGGER IF NOT EXISTS cleanup_collaboration_runtime_after_production_delete
      AFTER DELETE ON production
      BEGIN
        DELETE FROM collaboration_document_updates
          WHERE doc_id = 'production:' || OLD.id
             OR doc_id LIKE 'production:' || OLD.id || '@%';
        DELETE FROM collaboration_document_snapshots
          WHERE doc_id = 'production:' || OLD.id
             OR doc_id LIKE 'production:' || OLD.id || '@%';
      END`);
    await executor.execute(`CREATE TRIGGER IF NOT EXISTS cleanup_collaboration_runtime_after_shooting_delete
      AFTER DELETE ON shooting
      BEGIN
        DELETE FROM collaboration_document_updates WHERE doc_id = 'shooting:' || OLD.id;
        DELETE FROM collaboration_document_snapshots WHERE doc_id = 'shooting:' || OLD.id;
      END`);
  },
};
