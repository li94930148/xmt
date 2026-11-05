import { formatBjtDisplay } from '@shared/time';

export function formatBeijingDate(dateStr: Date | number | string | undefined | null): string {
  if (!dateStr) return '-';
  return formatBjtDisplay(dateStr, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
