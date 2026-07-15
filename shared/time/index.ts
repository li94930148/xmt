/**
 * XMT's canonical time contract.
 *
 * Database values are Beijing civil time (`YYYY-MM-DD HH:mm:ss`) and API
 * values are ISO-8601 values with an explicit `+08:00` offset.  A database
 * value without an offset is therefore always parsed as Asia/Shanghai, never
 * as the machine's local timezone.
 */
export const BJT_TIME_ZONE = 'Asia/Shanghai';

export type BjtRange = {
  /** Inclusive database boundary. */
  start: string;
  /** Exclusive database boundary. */
  endExclusive: string;
};

const DATABASE_PATTERN = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function bjtParts(value: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BJT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);

  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value: part }) => [type, part]));
}

function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

/** Returns the current instant. Format it with one of the functions below before persistence or output. */
export function nowBjt(): Date {
  return new Date();
}

/** Parses database legacy values as Beijing time and offset-bearing values by their explicit offset. */
export function parseStoredBjt(value: Date | number | string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (isDate(value)) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value === 'number') return Number.isNaN(value) ? null : new Date(value);

  const normalized = value.trim();
  const source = DATABASE_PATTERN.test(normalized)
    ? `${normalized.length === 10 ? `${normalized} 00:00:00` : normalized}`.replace(' ', 'T') + '+08:00'
    : normalized;
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function requireBjtDate(value: Date | number | string = nowBjt()): Date {
  const parsed = parseStoredBjt(value);
  if (!parsed) throw new Error(`Invalid date value: ${String(value)}`);
  return parsed;
}

/** Database contract: `YYYY-MM-DD HH:mm:ss` in Beijing civil time. */
export function formatBjtDatabase(value: Date | number | string = nowBjt()): string {
  const parts = bjtParts(requireBjtDate(value));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** API contract: `YYYY-MM-DDTHH:mm:ss+08:00`. */
export function formatBjtApi(value: Date | number | string = nowBjt()): string {
  return `${formatBjtDatabase(value).replace(' ', 'T')}+08:00`;
}

/** A Beijing calendar-day key, suitable for grouping and date inputs. */
export function dateKeyBjt(value: Date | number | string = nowBjt()): string {
  return formatBjtDatabase(value).slice(0, 10);
}

/**
 * Builds a half-open Beijing calendar range for SQL (`column >= ? AND column < ?`).
 * `endDateKey` is inclusive when supplied.
 */
export function rangeBjt(startDateKey: string, endDateKey = startDateKey): BjtRange {
  if (!DATE_KEY_PATTERN.test(startDateKey) || !DATE_KEY_PATTERN.test(endDateKey)) {
    throw new Error('rangeBjt expects YYYY-MM-DD date keys');
  }

  const end = new Date(`${endDateKey}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    start: `${startDateKey} 00:00:00`,
    endExclusive: formatBjtDatabase(end),
  };
}

/** Explicit browser-safe display helper; it never uses the browser's timezone. */
export function formatBjtDisplay(
  value: Date | number | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const parsed = parseStoredBjt(value);
  if (!parsed) return '-';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: BJT_TIME_ZONE, hour12: false, ...options }).format(parsed);
}
