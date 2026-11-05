import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { dateKeyBjt, formatBjtApi, formatBjtDisplay } from '@shared/time';

export { formatBeijingDate } from './dateFormat';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatTimeFromSource(
  dateStr: Date | number | string | undefined | null,
  sourceTimezone: 'utc' | 'beijing',
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateStr) return '-';

  const normalized = sourceTimezone === 'utc' && typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+')
    ? `${dateStr.replace(' ', 'T')}Z`
    : dateStr;
  return formatBjtDisplay(normalized, options);
}

export function formatBeijingTime(
  dateStr: Date | number | string | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatTimeFromSource(dateStr, 'beijing', options);
}

export function formatUtcToBeijingTime(
  dateStr: Date | number | string | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatTimeFromSource(dateStr, 'utc', options);
}

export function getCurrentBeijingDateString(): string {
  return dateKeyBjt();
}

export function getCurrentBeijingDateTimeString(): string {
  return formatBjtApi();
}
