import path from 'path';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'xmt.db');

function pathFromDatabaseUrl(databaseUrl: string) {
  if (!databaseUrl.startsWith('file:')) {
    return '';
  }

  return databaseUrl.slice('file:'.length);
}

export function getDatabasePath() {
  const configuredPath =
    process.env.XMT_DB_PATH?.trim() ||
    process.env.DATABASE_PATH?.trim() ||
    pathFromDatabaseUrl(process.env.DATABASE_URL?.trim() || '');

  if (!configuredPath) {
    return DEFAULT_DB_PATH;
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

export function getDatabaseUrl() {
  return `file:${getDatabasePath()}`;
}
