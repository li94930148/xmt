import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createClient, type Client, type Transaction } from '@libsql/client';

const MAX_ENTRY_SIZE = 32 * 1024 * 1024;
const MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const IMPORT_SOURCE = 'shandong-local-history';

type ZipEntry = {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  flags: number;
  externalAttributes: number;
  localHeaderOffset: number;
  directory: boolean;
};

export type ManifestItem = {
  source_path: string;
  file_name: string;
  size: number;
  compressed_size: number;
  compression_ratio: number;
  sha256: string;
  source_sha256: string;
  encoding: string;
  relative_path: string;
  title: string;
  duplicate_of?: string;
  warning?: string;
  cleaning: {
    changed: boolean;
    original_size: number;
    cleaned_size: number;
    removed_characters: number;
  };
};

export type ImportManifest = {
  generated_at: string;
  source_path: string;
  source_name: string;
  source_size: number;
  source_sha256: string;
  stats: {
    zip_entries: number;
    files: number;
    directories: number;
    total_uncompressed_bytes: number;
    total_compressed_bytes: number;
    duplicate_files: number;
    abnormal_files: number;
    warning_files: number;
    cleaned_files: number;
    removed_characters: number;
  };
  files: ManifestItem[];
  abnormalities: Array<{ path: string; reason: string }>;
};

export type ImportOptions = {
  source: string;
  databasePath: string;
  storageRoot: string;
  manifestRoot: string;
  dryRun?: boolean;
  limit?: number;
  resumeBatchId?: number | true;
  createdBy?: number | null;
};

function sha256Buffer(value: Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath: string) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(descriptor);
  }
}

export function cleanImportedText(value: string) {
  const original = value;
  const normalized = value
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u200B|\u200C|\u200D|\u2060/g, '')
    .replace(/\u00A0/g, ' ')
    .normalize('NFC');
  const lines = normalized.split('\n').map((line) => line.replace(/[\t ]+$/g, ''));
  while (lines[0] === '') lines.shift();
  while (lines.at(-1) === '') lines.pop();
  const compacted: string[] = [];
  let blankLines = 0;
  for (const line of lines) {
    if (line === '') {
      blankLines += 1;
      if (blankLines > 2) continue;
    } else {
      blankLines = 0;
    }
    compacted.push(line);
  }
  const text = `${compacted.join('\n')}\n`;
  return {
    text,
    changed: text !== original,
    removedCharacters: Math.max(0, original.length - text.length),
  };
}

function decodeZipName(buffer: Buffer, flags: number) {
  if ((flags & 0x800) === 0) {
    // This archive stores UTF-8 names without consistently setting the language flag.
    // Reject replacement characters so a legacy encoding cannot silently change paths.
    const decoded = buffer.toString('utf8');
    if (decoded.includes('\uFFFD')) throw new Error('ZIP filename is not valid UTF-8');
    return decoded;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
}

function validateEntryPath(entryName: string) {
  if (!entryName || entryName.includes('\0')) throw new Error('empty or NUL-containing ZIP path');
  const normalized = entryName.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) throw new Error('absolute ZIP path');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..')) throw new Error('ZIP path traversal');
  if (segments.some((segment) => segment === '.')) throw new Error('ambiguous ZIP path segment');
  return normalized;
}

export function inspectZip(sourcePath: string) {
  const zip = fs.readFileSync(sourcePath);
  let eocd = -1;
  for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65557); offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory record not found');
  const entryCount = zip.readUInt16LE(eocd + 10);
  const centralSize = zip.readUInt32LE(eocd + 12);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('ZIP64 is not supported');
  if (centralOffset + centralSize > eocd) throw new Error('ZIP central directory bounds are invalid');

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error(`Invalid ZIP central entry at index ${index}`);
    const flags = zip.readUInt16LE(offset + 8);
    const compressionMethod = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const externalAttributes = zip.readUInt32LE(offset + 38);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    const name = validateEntryPath(decodeZipName(zip.subarray(offset + 46, offset + 46 + nameLength), flags));
    const directory = name.endsWith('/');
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0xf000) === 0xa000) throw new Error(`Symbolic link entry is forbidden: ${name}`);
    if ((flags & 1) !== 0) throw new Error(`Encrypted ZIP entry is forbidden: ${name}`);
    if (!directory && compressionMethod !== 0 && compressionMethod !== 8) throw new Error(`Unsupported compression method for ${name}`);
    if (!directory && uncompressedSize > MAX_ENTRY_SIZE) throw new Error(`ZIP entry exceeds size limit: ${name}`);
    const ratio = compressedSize === 0 ? (uncompressedSize === 0 ? 1 : Infinity) : uncompressedSize / compressedSize;
    if (!directory && ratio > MAX_COMPRESSION_RATIO) throw new Error(`Abnormal ZIP compression ratio: ${name}`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_SIZE) throw new Error('ZIP total uncompressed size exceeds safety limit');
    entries.push({ name, compressedSize, uncompressedSize, compressionMethod, flags, externalAttributes, localHeaderOffset, directory });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { zip, entries };
}

function extractEntry(zip: Buffer, entry: ZipEntry, destinationRoot: string) {
  const offset = entry.localHeaderOffset;
  if (zip.readUInt32LE(offset) !== 0x04034b50) throw new Error(`Invalid local ZIP header: ${entry.name}`);
  const localFlags = zip.readUInt16LE(offset + 6);
  const localMethod = zip.readUInt16LE(offset + 8);
  const nameLength = zip.readUInt16LE(offset + 26);
  const extraLength = zip.readUInt16LE(offset + 28);
  const localName = validateEntryPath(decodeZipName(zip.subarray(offset + 30, offset + 30 + nameLength), localFlags));
  if (localName !== entry.name || localMethod !== entry.compressionMethod) throw new Error(`ZIP local/central header mismatch: ${entry.name}`);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = zip.subarray(dataStart, dataStart + entry.compressedSize);
  const content = entry.compressionMethod === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_SIZE });
  if (content.length !== entry.uncompressedSize) throw new Error(`ZIP size mismatch: ${entry.name}`);
  const outputPath = path.resolve(destinationRoot, entry.name);
  const safeRoot = `${path.resolve(destinationRoot)}${path.sep}`;
  if (!outputPath.startsWith(safeRoot)) throw new Error(`ZIP extraction escaped temporary directory: ${entry.name}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, { flag: 'wx', mode: 0o600 });
  return outputPath;
}

function normalizeProvince(value: string) {
  const cleaned = value.replace(/地情档案.*$/, '').trim() || '山东';
  return /省$/.test(cleaned) ? cleaned : `${cleaned}省`;
}

function normalizeCity(value: string) {
  return /[市州]$/.test(value) ? value : `${value}市`;
}

export function parseArchivePath(relativePath: string) {
  const parts = relativePath.split('/').filter(Boolean);
  const libraryIndex = parts.findIndex((part, index) => index >= 2 && /(库|丛书)$/.test(part));
  if (parts.length < 5 || libraryIndex < 2 || !parts[libraryIndex + 1]) {
    throw new Error('无法识别省/市/资料库/书目结构');
  }
  const province = normalizeProvince(parts[0]);
  const city = normalizeCity(parts[1]);
  const library = parts[libraryIndex];
  const book = parts[libraryIndex + 1];
  const sectionParts = parts.slice(libraryIndex + 2, -1);
  return { province, city, library, book, sectionParts };
}

function extractTitle(content: string, fileName: string) {
  const match = content.match(/(?:^|\n)标题：\s*(?:\n\s*)?([^\n]+)/);
  return (match?.[1] || fileName.replace(/\.txt$/i, '').replace(/_[0-9a-f]{10}$/i, '')).trim();
}

export function buildManifest(sourcePath: string, manifestRoot: string) {
  const resolvedSource = path.resolve(sourcePath);
  if (!fs.existsSync(resolvedSource) || !fs.statSync(resolvedSource).isFile()) throw new Error(`ZIP source not found: ${resolvedSource}`);
  const sourceSha256 = sha256File(resolvedSource);
  const { zip, entries } = inspectZip(resolvedSource);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-shandong-import-'));
  const files: ManifestItem[] = [];
  const abnormalities: Array<{ path: string; reason: string }> = [];
  const firstPathByHash = new Map<string, string>();
  try {
    for (const entry of entries) {
      if (entry.directory) continue;
      try {
        if (path.extname(entry.name).toLowerCase() !== '.txt') throw new Error('unsupported file type');
        parseArchivePath(entry.name);
        const extractedPath = extractEntry(zip, entry, temporaryDirectory);
        const content = fs.readFileSync(extractedPath);
        const decodedText = new TextDecoder('utf-8', { fatal: true }).decode(content);
        const cleaned = cleanImportedText(decodedText);
        const cleanedContent = Buffer.from(cleaned.text, 'utf8');
        fs.writeFileSync(extractedPath, cleanedContent, { mode: 0o600 });
        const sourceFileSha256 = sha256Buffer(content);
        const fileSha256 = sha256Buffer(cleanedContent);
        const duplicateOf = firstPathByHash.get(fileSha256);
        if (!duplicateOf) firstPathByHash.set(fileSha256, entry.name);
        files.push({
          source_path: resolvedSource,
          file_name: path.basename(entry.name),
          size: cleanedContent.length,
          compressed_size: entry.compressedSize,
          compression_ratio: entry.compressedSize ? Number((content.length / entry.compressedSize).toFixed(3)) : 1,
          sha256: fileSha256,
          source_sha256: sourceFileSha256,
          encoding: 'utf-8',
          relative_path: entry.name,
          title: extractTitle(cleaned.text, path.basename(entry.name)),
          ...(duplicateOf ? { duplicate_of: duplicateOf } : {}),
          cleaning: {
            changed: cleaned.changed,
            original_size: content.length,
            cleaned_size: cleanedContent.length,
            removed_characters: cleaned.removedCharacters,
          },
        });
      } catch (error) {
        abnormalities.push({ path: entry.name, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    const firstByTitle = new Map<string, ManifestItem>();
    for (const file of files) {
      const normalizedTitle = file.title.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
      const first = firstByTitle.get(normalizedTitle);
      if (!first) firstByTitle.set(normalizedTitle, file);
      else if (first.sha256 !== file.sha256) file.warning = `same title with different content: ${first.relative_path}`;
    }
    const manifest: ImportManifest = {
      generated_at: new Date().toISOString(),
      source_path: resolvedSource,
      source_name: path.basename(resolvedSource),
      source_size: fs.statSync(resolvedSource).size,
      source_sha256: sourceSha256,
      stats: {
        zip_entries: entries.length,
        files: files.length,
        directories: entries.filter((entry) => entry.directory).length,
        total_uncompressed_bytes: files.reduce((sum, file) => sum + file.size, 0),
        total_compressed_bytes: files.reduce((sum, file) => sum + file.compressed_size, 0),
        duplicate_files: files.filter((file) => file.duplicate_of).length,
        abnormal_files: abnormalities.length,
        warning_files: files.filter((file) => file.warning).length,
        cleaned_files: files.filter((file) => file.cleaning.changed).length,
        removed_characters: files.reduce((sum, file) => sum + file.cleaning.removed_characters, 0),
      },
      files,
      abnormalities,
    };
    const manifestDirectory = path.join(manifestRoot, sourceSha256);
    fs.mkdirSync(manifestDirectory, { recursive: true });
    const manifestPath = path.join(manifestDirectory, 'manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    return { manifest, manifestPath, temporaryDirectory };
  } catch (error) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function resolveCreatedBy(client: Client, requested?: number | null) {
  if (requested) {
    const result = await client.execute({ sql: `SELECT id FROM users WHERE id=? AND enabled=1`, args: [requested] });
    if (!result.rows[0]) throw new Error(`Import user ${requested} does not exist or is disabled`);
    return requested;
  }
  const admin = await client.execute(`SELECT id FROM users WHERE role='admin' AND enabled=1 ORDER BY id LIMIT 1`);
  return admin.rows[0] ? Number(admin.rows[0].id) : null;
}

async function ensureCategory(transaction: Transaction, parentId: number | null, name: string, categoryPath: string, createdBy: number | null) {
  const existing = await transaction.execute({ sql: `SELECT id FROM resource_categories WHERE library_type='knowledge' AND path=?`, args: [categoryPath] });
  if (existing.rows[0]) return Number(existing.rows[0].id);
  const code = `shandong-${sha256Buffer(Buffer.from(categoryPath)).slice(0, 20)}`;
  const inserted = await transaction.execute({
    sql: `INSERT INTO resource_categories(library_type,parent_id,name,code,path,sort_order,enabled,created_by,created_at,updated_at)
          VALUES('knowledge',?,?,?,?,0,1,?,datetime('now','+8 hours'),datetime('now','+8 hours'))`,
    args: [parentId, name, code, categoryPath, createdBy],
  });
  return Number(inserted.lastInsertRowid);
}

async function ensureCategoryPath(transaction: Transaction, parsed: ReturnType<typeof parseArchivePath>, createdBy: number | null) {
  const names = [parsed.province, parsed.city, parsed.library, parsed.book];
  let parentId: number | null = null;
  let categoryPath = '';
  for (const name of names) {
    categoryPath += `/${name}`;
    parentId = await ensureCategory(transaction, parentId, name, categoryPath, createdBy);
  }
  return parentId;
}

async function ensureBookResource(transaction: Transaction, parsed: ReturnType<typeof parseArchivePath>, categoryId: number, createdBy: number | null, batchId: number) {
  const sourceUri = `${IMPORT_SOURCE}:book:/${parsed.province}/${parsed.city}/${parsed.library}/${parsed.book}`;
  const existing = await transaction.execute({ sql: `SELECT id FROM resources WHERE source_type='import' AND source_uri=? LIMIT 1`, args: [sourceUri] });
  if (existing.rows[0]) return Number(existing.rows[0].id);
  const inserted = await transaction.execute({
    sql: `INSERT INTO resources(name,title,summary,library_type,category_id,parent_id,visibility,status,source_type,source_uri,owner_id,uploader_id,created_by,updated_by,created_at,updated_at)
          VALUES(?,?,?,'knowledge',?,NULL,'team','published','import',?,?,?,?,?,datetime('now','+8 hours'),datetime('now','+8 hours'))`,
    args: [parsed.book, parsed.book, `${parsed.province}${parsed.city} · ${parsed.library}`, categoryId, sourceUri, createdBy, createdBy, createdBy, createdBy],
  });
  const resourceId = Number(inserted.lastInsertRowid);
  await transaction.execute({
    sql: `INSERT INTO resource_import_items(batch_id,source_path,resource_id,status,created_at) VALUES(?,?,?,'success',datetime('now','+8 hours'))`,
    args: [batchId, `${sourceUri}/`, resourceId],
  });
  return resourceId;
}

const FTS_TRIGGER_SQL = [
  `CREATE TRIGGER IF NOT EXISTS resource_fts_after_insert AFTER INSERT ON resources BEGIN INSERT INTO resource_fts(rowid,title,summary,content_text) VALUES(new.id,new.title,new.summary,new.content_text); END`,
  `CREATE TRIGGER IF NOT EXISTS resource_fts_after_delete AFTER DELETE ON resources BEGIN INSERT INTO resource_fts(resource_fts,rowid,title,summary,content_text) VALUES('delete',old.id,old.title,old.summary,old.content_text); END`,
  `CREATE TRIGGER IF NOT EXISTS resource_fts_after_update AFTER UPDATE OF title,summary,content_text ON resources BEGIN INSERT INTO resource_fts(resource_fts,rowid,title,summary,content_text) VALUES('delete',old.id,old.title,old.summary,old.content_text); INSERT INTO resource_fts(rowid,title,summary,content_text) VALUES(new.id,new.title,new.summary,new.content_text); END`,
];

async function dropFtsTriggers(client: Client) {
  for (const name of ['resource_fts_after_insert', 'resource_fts_after_delete', 'resource_fts_after_update']) await client.execute(`DROP TRIGGER IF EXISTS ${name}`);
}

async function restoreFtsTriggers(client: Client) {
  for (const statement of FTS_TRIGGER_SQL) await client.execute(statement);
}

function storageKeyFor(file: ManifestItem) {
  return `knowledge/${IMPORT_SOURCE}/${file.sha256.slice(0, 2)}/${file.sha256}.txt`;
}

async function getOrCreateBatch(client: Client, manifest: ImportManifest, resume: number | true | undefined, createdBy: number | null) {
  if (resume) {
    const result = typeof resume === 'number'
      ? await client.execute({ sql: `SELECT id,status,source_sha256 FROM resource_import_batches WHERE id=?`, args: [resume] })
      : await client.execute({ sql: `SELECT id,status,source_sha256 FROM resource_import_batches WHERE source_sha256=? AND status IN ('pending','running','failed') ORDER BY id DESC LIMIT 1`, args: [manifest.source_sha256] });
    const row = result.rows[0];
    if (!row || row.source_sha256 !== manifest.source_sha256) throw new Error('No resumable batch found for this ZIP');
    await client.execute({ sql: `UPDATE resource_import_batches SET status='running',completed_at=NULL WHERE id=?`, args: [row.id] });
    return Number(row.id);
  }
  const result = await client.execute({
    sql: `INSERT INTO resource_import_batches(source_name,source_sha256,status,stats_json,created_by,started_at)
          VALUES(?,?,'running',?,?,datetime('now','+8 hours'))`,
    args: [manifest.source_name, manifest.source_sha256, JSON.stringify(manifest.stats), createdBy],
  });
  return Number(result.lastInsertRowid);
}

export async function importManifest(options: ImportOptions, manifest: ImportManifest, temporaryDirectory: string) {
  if (options.dryRun) return { dryRun: true, batchId: null, selectedFiles: Math.min(options.limit || manifest.files.length, manifest.files.length), ...manifest.stats };
  const client = createClient({ url: `file:${path.resolve(options.databasePath)}` });
  await client.execute('PRAGMA foreign_keys=ON');
  const createdBy = await resolveCreatedBy(client, options.createdBy);
  const batchId = await getOrCreateBatch(client, manifest, options.resumeBatchId, createdBy);
  const selected = manifest.files.slice(0, options.limit || manifest.files.length);
  const completedRows = await client.execute({ sql: `SELECT source_path,status FROM resource_import_items WHERE batch_id=? AND status IN ('success','duplicate_skipped')`, args: [batchId] });
  const completed = new Set(completedRows.rows.map((row) => String(row.source_path)));
  const stats = { selected: selected.length, success: 0, duplicate_skipped: 0, failed: 0, parents_created: 0 };
  const copiedPaths: string[] = [];
  await dropFtsTriggers(client);
  try {
    for (let start = 0; start < selected.length; start += 250) {
      const chunk = selected.slice(start, start + 250);
      const transaction = await client.transaction('write');
      try {
        for (const file of chunk) {
          if (completed.has(file.relative_path)) continue;
          try {
            const duplicate = await transaction.execute({ sql: `SELECT resource_id FROM resource_files WHERE sha256=? LIMIT 1`, args: [file.sha256] });
            if (duplicate.rows[0] || file.duplicate_of) {
              await transaction.execute({
                sql: `INSERT INTO resource_import_items(batch_id,source_path,source_sha256,resource_id,status,error_message,created_at)
                      VALUES(?,?,?,?, 'duplicate_skipped', ?,datetime('now','+8 hours'))`,
                args: [batchId, file.relative_path, file.sha256, duplicate.rows[0]?.resource_id ?? null, file.duplicate_of ? `duplicate of ${file.duplicate_of}` : 'duplicate sha256 already stored'],
              });
              stats.duplicate_skipped += 1;
              continue;
            }
            const parsed = parseArchivePath(file.relative_path);
            const categoryId = await ensureCategoryPath(transaction, parsed, createdBy);
            const beforeParent = await transaction.execute({ sql: `SELECT id FROM resources WHERE source_type='import' AND source_uri=?`, args: [`${IMPORT_SOURCE}:book:/${parsed.province}/${parsed.city}/${parsed.library}/${parsed.book}`] });
            const parentId = await ensureBookResource(transaction, parsed, categoryId, createdBy, batchId);
            if (!beforeParent.rows[0]) stats.parents_created += 1;
            const extractedPath = path.resolve(temporaryDirectory, file.relative_path);
            const contentBuffer = fs.readFileSync(extractedPath);
            const contentText = new TextDecoder('utf-8', { fatal: true }).decode(contentBuffer);
            const title = file.title || extractTitle(contentText, file.file_name);
            const storageKey = storageKeyFor(file);
            const storagePath = path.join(options.storageRoot, storageKey);
            fs.mkdirSync(path.dirname(storagePath), { recursive: true });
            if (!fs.existsSync(storagePath)) { fs.copyFileSync(extractedPath, storagePath, fs.constants.COPYFILE_EXCL); copiedPaths.push(storagePath); }
            const resource = await transaction.execute({
              sql: `INSERT INTO resources(name,type,file_path,category,library_type,title,summary,content_text,category_id,parent_id,visibility,status,source_type,source_uri,owner_id,uploader_id,created_by,updated_by,created_at,updated_at)
                    VALUES(?,'text',?,'山东地情','knowledge',?,?,?, ?,?,'team','published','import',?,?,?,?,?,datetime('now','+8 hours'),datetime('now','+8 hours'))`,
              args: [title, storageKey, title, `${parsed.library} · ${parsed.book}`, contentText, categoryId, parentId, `${IMPORT_SOURCE}:file:${manifest.source_sha256}:${file.relative_path}`, createdBy, createdBy, createdBy, createdBy],
            });
            const resourceId = Number(resource.lastInsertRowid);
            await transaction.execute({
              sql: `INSERT INTO resource_files(resource_id,original_name,storage_key,mime_type,extension,size_bytes,sha256,is_primary,status,created_by,created_at)
                    VALUES(?,?,?,'text/plain','txt',?,?,1,'active',?,datetime('now','+8 hours'))`,
              args: [resourceId, file.file_name, storageKey, file.size, file.sha256, createdBy],
            });
            await transaction.execute({
              sql: `INSERT INTO resource_import_items(batch_id,source_path,source_sha256,resource_id,status,error_message,created_at)
                    VALUES(?,?,?,?, 'success',?,datetime('now','+8 hours'))`,
              args: [batchId, file.relative_path, file.sha256, resourceId, file.warning ?? null],
            });
            await transaction.execute({
              sql: `INSERT INTO resource_audit_logs(resource_id,user_id,action,detail_json,created_at) VALUES(?,?,'create',?,datetime('now','+8 hours'))`,
              args: [resourceId, createdBy, JSON.stringify({ source: IMPORT_SOURCE, batch_id: batchId, source_path: file.relative_path })],
            });
            stats.success += 1;
          } catch (error) {
            await transaction.execute({
              sql: `INSERT INTO resource_import_items(batch_id,source_path,source_sha256,status,error_message,created_at)
                    VALUES(?,?,?,'failed',?,datetime('now','+8 hours'))`,
              args: [batchId, file.relative_path, file.sha256, error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000)],
            });
            stats.failed += 1;
          }
        }
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      } finally {
        transaction.close();
      }
    }
    await client.execute(`INSERT INTO resource_fts(resource_fts) VALUES('rebuild')`);
    await client.execute({
      sql: `UPDATE resource_import_batches SET status=?,stats_json=?,completed_at=datetime('now','+8 hours') WHERE id=?`,
      args: [stats.failed ? 'failed' : 'completed', JSON.stringify({ ...manifest.stats, import: stats }), batchId],
    });
    return { dryRun: false, batchId, ...stats };
  } catch (error) {
    for (const copiedPath of copiedPaths) {
      const referenced = await client.execute({ sql: `SELECT COUNT(*) count FROM resource_files WHERE storage_key=?`, args: [path.relative(options.storageRoot, copiedPath)] });
      if (Number(referenced.rows[0]?.count || 0) === 0) fs.rmSync(copiedPath, { force: true });
    }
    await client.execute({ sql: `UPDATE resource_import_batches SET status='failed',completed_at=datetime('now','+8 hours') WHERE id=?`, args: [batchId] });
    throw error;
  } finally {
    await restoreFtsTriggers(client);
    client.close();
  }
}

export async function rollbackBatch(databasePath: string, storageRoot: string, batchId: number) {
  const client = createClient({ url: `file:${path.resolve(databasePath)}` });
  await client.execute('PRAGMA foreign_keys=ON');
  const batch = await client.execute({ sql: `SELECT id,status FROM resource_import_batches WHERE id=?`, args: [batchId] });
  if (!batch.rows[0]) throw new Error(`Import batch ${batchId} not found`);
  const resources = await client.execute({
    sql: `SELECT DISTINCT r.id,r.parent_id FROM resource_import_items i JOIN resources r ON r.id=i.resource_id WHERE i.batch_id=? AND i.status='success' ORDER BY r.id DESC`,
    args: [batchId],
  });
  const childIds = resources.rows.filter((row) => row.parent_id !== null).map((row) => Number(row.id));
  const parentIds = resources.rows.filter((row) => row.parent_id === null).map((row) => Number(row.id));
  const resourceIds = [...childIds, ...parentIds];
  const storageKeys: string[] = [];
  let resourcesRemoved = 0;
  if (childIds.length) {
    for (let start = 0; start < childIds.length; start += 500) {
      const ids = childIds.slice(start, start + 500);
      const files = await client.execute({ sql: `SELECT storage_key FROM resource_files WHERE resource_id IN (${ids.map(() => '?').join(',')})`, args: ids });
      storageKeys.push(...files.rows.map((row) => String(row.storage_key)));
      const removed = await client.execute({ sql: `DELETE FROM resources WHERE id IN (${ids.map(() => '?').join(',')})`, args: ids });
      resourcesRemoved += removed.rowsAffected;
    }
  }
  for (const parentId of parentIds) {
    const removed = await client.execute({ sql: `DELETE FROM resources WHERE id=? AND NOT EXISTS(SELECT 1 FROM resources child WHERE child.parent_id=?)`, args: [parentId, parentId] });
    resourcesRemoved += removed.rowsAffected;
  }
  await client.execute({ sql: `UPDATE resource_import_batches SET status='rollback',completed_at=datetime('now','+8 hours') WHERE id=?`, args: [batchId] });
  await client.execute(`INSERT INTO resource_fts(resource_fts) VALUES('rebuild')`);
  for (const storageKey of storageKeys) {
    const used = await client.execute({ sql: `SELECT COUNT(*) count FROM resource_files WHERE storage_key=?`, args: [storageKey] });
    if (Number(used.rows[0]?.count || 0) === 0) fs.rmSync(path.join(storageRoot, storageKey), { force: true });
  }
  client.close();
  return { batchId, status: 'rollback', resourcesRemoved, resourcesConsidered: resourceIds.length, filesRemoved: storageKeys.length };
}

export async function runShandongImport(options: ImportOptions) {
  const built = buildManifest(options.source, options.manifestRoot);
  try {
    const result = await importManifest(options, built.manifest, built.temporaryDirectory);
    return { manifestPath: built.manifestPath, manifest: built.manifest, result };
  } finally {
    fs.rmSync(built.temporaryDirectory, { recursive: true, force: true });
  }
}
