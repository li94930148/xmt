import fs from 'node:fs';
import path from 'node:path';

export type BackupSourceId = 'application' | 'emergency' | 'scheduled' | `extra-${number}`;

export type BackupSource = {
  id: BackupSourceId;
  label: string;
  directory: string;
  deletable: boolean;
};

export type BackupInventoryFile = {
  id: string;
  name: string;
  size: number;
  created: string;
  source: BackupSourceId;
  sourceLabel: string;
  compressed: boolean;
  downloadable: boolean;
  deletable: boolean;
};

export type BackupInventorySource = {
  id: BackupSourceId;
  label: string;
  available: boolean;
  fileCount: number;
};

const BACKUP_FILE_NAME = /^xmt-[A-Za-z0-9][A-Za-z0-9._-]*\.db(?:\.gz)?$/;

function splitExtraDirectories(value: string | undefined) {
  return (value || '').split(path.delimiter).map((item) => item.trim()).filter(Boolean);
}

export function getBackupSources(dbPath: string, env: NodeJS.ProcessEnv = process.env): BackupSource[] {
  const candidates: BackupSource[] = [
    { id: 'application', label: '应用内备份', directory: path.join(path.dirname(dbPath), 'backups'), deletable: true },
    { id: 'emergency', label: '部署应急备份', directory: env.XMT_EMERGENCY_BACKUP_DIR?.trim() || path.join(process.cwd(), 'emergency-backup'), deletable: false },
    { id: 'scheduled', label: '系统定时备份', directory: env.XMT_SCHEDULED_BACKUP_DIR?.trim() || env.BACKUP_DIR?.trim() || '/www/backup/xmt', deletable: false },
  ];

  splitExtraDirectories(env.XMT_BACKUP_EXTRA_DIRS).forEach((directory, index) => {
    candidates.push({ id: `extra-${index + 1}`, label: `其他备份 ${index + 1}`, directory, deletable: false });
  });

  const seen = new Set<string>();
  return candidates.filter((source) => {
    const resolved = path.resolve(source.directory);
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    source.directory = resolved;
    return true;
  });
}

function safeFiles(source: BackupSource): BackupInventoryFile[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(source.directory, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    if (!entry.isFile() || entry.isSymbolicLink() || !BACKUP_FILE_NAME.test(entry.name)) return [];
    try {
      const stat = fs.statSync(path.join(source.directory, entry.name));
      return [{
        id: `${source.id}:${entry.name}`,
        name: entry.name,
        size: stat.size,
        created: stat.mtime.toISOString(),
        source: source.id,
        sourceLabel: source.label,
        compressed: entry.name.endsWith('.gz'),
        downloadable: true,
        deletable: source.deletable,
      } satisfies BackupInventoryFile];
    } catch {
      return [];
    }
  });
}

function isSourceAvailable(source: BackupSource) {
  try {
    fs.accessSync(source.directory, fs.constants.R_OK);
    return fs.statSync(source.directory).isDirectory();
  } catch {
    return false;
  }
}

export function listBackupInventory(sources: BackupSource[]) {
  const filesBySource = new Map<BackupSourceId, BackupInventoryFile[]>();
  for (const source of sources) filesBySource.set(source.id, safeFiles(source));

  const files = Array.from(filesBySource.values()).flat().sort((a, b) => b.created.localeCompare(a.created));
  const sourceStatus: BackupInventorySource[] = sources.map((source) => ({
    id: source.id,
    label: source.label,
    available: isSourceAvailable(source),
    fileCount: filesBySource.get(source.id)?.length || 0,
  }));
  return { files, sources: sourceStatus };
}

export function resolveInventoryBackup(sources: BackupSource[], sourceId: unknown, name: unknown): string | null {
  if (typeof sourceId !== 'string' || typeof name !== 'string' || path.basename(name) !== name || !BACKUP_FILE_NAME.test(name)) return null;
  const source = sources.find((item) => item.id === sourceId);
  if (!source) return null;
  const directory = path.resolve(source.directory);
  const candidate = path.resolve(directory, name);
  if (path.dirname(candidate) !== directory) return null;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() ? candidate : null;
  } catch {
    return null;
  }
}
