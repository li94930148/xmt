import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatTimeFromSource(
  dateStr: string | undefined | null,
  sourceTimezone: 'utc' | 'beijing',
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateStr) return '-';

  try {
    let normalized = dateStr.trim();

    if (!normalized.endsWith('Z') && !normalized.includes('+')) {
      if (normalized.includes(' ')) {
        normalized = normalized.replace(' ', 'T');
      }
      normalized += sourceTimezone === 'utc' ? 'Z' : '+08:00';
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      ...options,
    });
  } catch {
    return '-';
  }
}

export function formatBeijingTime(
  dateStr: string | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatTimeFromSource(dateStr, 'beijing', options);
}

export function formatUtcToBeijingTime(
  dateStr: string | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatTimeFromSource(dateStr, 'utc', options);
}

export function formatBeijingDate(dateStr: string | undefined | null): string {
  return formatBeijingTime(dateStr, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function getCurrentBeijingDateString(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function getCurrentBeijingDateTimeString(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());

  return parts.replace(' ', 'T') + '+08:00';
}
