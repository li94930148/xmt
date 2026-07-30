import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const source = '/Users/youfeifei/Projects/山东地情档案.zip';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-import-test-'));
const databasePath = path.join(tempDir, 'test.db');
const storageRoot = path.join(tempDir, 'resources');
const manifestRoot = path.join(tempDir, 'manifests');
process.env.XMT_DB_PATH = databasePath;

const [{ initDatabase, db }, database, importer] = await Promise.all([
  import('../api/database/db.js'),
  import('../api/database/utils.js'),
  import('./resource-import/shandong-import.js'),
]);

try {
  await initDatabase();
  const adminId = await database.executeInsert(
    `INSERT INTO users(username,password,role,name,enabled) VALUES('import-test-admin','unused','admin','导入测试管理员',1)`,
  );

  const dryRun = await importer.runShandongImport({ source, databasePath, storageRoot, manifestRoot, dryRun: true });
  assert.equal(dryRun.manifest.stats.files, 16027);
  assert.equal(dryRun.manifest.stats.directories, 3342);
  assert.equal(dryRun.manifest.stats.duplicate_files, 1);
  assert.equal(dryRun.manifest.stats.abnormal_files, 0);
  assert.ok(fs.existsSync(dryRun.manifestPath));
  assert.equal(dryRun.manifest.files[0].encoding, 'utf-8');
  assert.ok(dryRun.manifest.stats.cleaned_files > 0);
  assert.ok(dryRun.manifest.files.every((file) => file.source_sha256.length === 64 && file.sha256.length === 64));
  assert.ok(!dryRun.manifest.files.some((file) => file.cleaning.cleaned_size <= 0));
  assert.equal(importer.parseArchivePath(dryRun.manifest.files[0].relative_path).province, '山东省');

  const cleanedText = importer.cleanImportedText('\uFEFF标题： 示例\r\n正文\u200B  \r\n\r\n\r\n\r\n结尾  ');
  assert.equal(cleanedText.text, '标题： 示例\n正文\n\n\n结尾\n');

  const first = await importer.runShandongImport({ source, databasePath, storageRoot, manifestRoot, limit: 25, createdBy: adminId });
  assert.equal(first.result.success, 25);
  assert.equal(first.result.failed, 0);
  const counts = await database.queryOne<Record<string, unknown>>(`
    SELECT
      (SELECT COUNT(*) FROM resources WHERE source_type='import' AND parent_id IS NOT NULL) children,
      (SELECT COUNT(*) FROM resources WHERE source_type='import' AND parent_id IS NULL) parents,
      (SELECT COUNT(*) FROM resource_files) files,
      (SELECT COUNT(*) FROM resource_categories) categories
  `);
  assert.equal(Number(counts?.children), 25);
  assert.ok(Number(counts?.parents) >= 1);
  assert.equal(Number(counts?.files), 25);
  assert.ok(Number(counts?.categories) >= 4);
  const parentLinks = await database.queryOne<{ count: number }>(`SELECT COUNT(*) count FROM resources child JOIN resources parent ON parent.id=child.parent_id WHERE child.source_type='import'`);
  assert.equal(Number(parentLinks?.count), 25);
  const importedTitle = await database.queryOne<{ title: string }>(`SELECT title FROM resources WHERE source_type='import' AND parent_id IS NOT NULL ORDER BY id LIMIT 1`);
  assert.ok(importedTitle?.title);
  const fts = await database.queryOne<{ count: number }>(`SELECT COUNT(*) count FROM resource_fts WHERE resource_fts MATCH ?`, [`"${importedTitle.title.replace(/"/g, '""')}"`]);
  assert.ok(Number(fts?.count) >= 1);

  const resourcesBeforeRepeat = await database.queryOne<{ count: number }>(`SELECT COUNT(*) count FROM resources`);
  const second = await importer.runShandongImport({ source, databasePath, storageRoot, manifestRoot, limit: 25, createdBy: adminId });
  assert.equal(second.result.success, 0);
  assert.equal(second.result.duplicate_skipped, 25);
  const resourcesAfterRepeat = await database.queryOne<{ count: number }>(`SELECT COUNT(*) count FROM resources`);
  assert.equal(resourcesAfterRepeat?.count, resourcesBeforeRepeat?.count);

  const rollback = await importer.rollbackBatch(databasePath, storageRoot, Number(first.result.batchId));
  assert.ok(rollback.resourcesRemoved >= 26);
  const remaining = await database.queryOne<{ count: number }>(`SELECT COUNT(*) count FROM resources WHERE source_type='import'`);
  assert.equal(Number(remaining?.count), 0);

  const integrity = await db.execute('PRAGMA integrity_check');
  assert.equal(integrity.rows[0]?.integrity_check, 'ok');
  console.log(JSON.stringify({
    passed: true,
    manifestFiles: dryRun.manifest.stats.files,
    duplicateFiles: dryRun.manifest.stats.duplicate_files,
    firstImport: first.result,
    repeatImport: second.result,
    rollback,
  }, null, 2));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
