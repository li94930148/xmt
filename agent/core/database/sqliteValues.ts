import crypto from 'node:crypto';

export type SqlitePrimitive = string | number | bigint | Uint8Array | null;

export class SqliteValueError extends Error {
  readonly code = 'UPLOAD_QUEUE_INVALID_SQL_VALUE';
  constructor(readonly field: string, readonly value: unknown) {
    super(`${codeFor(field, value)}`);
  }
}

function constructorName(value: unknown) {
  return value !== null && value !== undefined && typeof value === 'object'
    ? value.constructor?.name || 'Object'
    : null;
}

function codeFor(field: string, value: unknown) {
  return `UPLOAD_QUEUE_INVALID_SQL_VALUE: field=${field} type=${typeof value} array=${Array.isArray(value)} null=${value === null} constructor=${constructorName(value)}`;
}

export function requiredText(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new SqliteValueError(field, value);
  return value;
}

export function optionalText(field: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  throw new SqliteValueError(field, value);
}

export function requiredInteger(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new SqliteValueError(field, value);
  return value;
}

function canonicalize(field: string, value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SqliteValueError(field, value);
    return value;
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new SqliteValueError(field, value);
    return value.toISOString();
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(`${field}[${index}]`, item));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(`${field}.${key}`, (value as Record<string, unknown>)[key])]));
  }
  throw new SqliteValueError(field, value);
}

export function canonicalJson(field: string, value: unknown): string {
  return JSON.stringify(canonicalize(field, value));
}

export function canonicalJsonHash(serialized: string) {
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

export function verifiedCanonicalObject(field: string, serialized: unknown, expectedHash: unknown): Record<string, unknown> {
  const text = requiredText(field, serialized);
  if (canonicalJsonHash(text) !== requiredText(`${field}_sha256`, expectedHash)) throw new Error('UPLOAD_QUEUE_PAYLOAD_HASH_MISMATCH');
  const parsed: unknown = JSON.parse(text);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('UPLOAD_QUEUE_PAYLOAD_SCHEMA_INVALID');
  if (canonicalJson(field, parsed) !== text) throw new Error('UPLOAD_QUEUE_PAYLOAD_NOT_CANONICAL');
  return parsed as Record<string, unknown>;
}
