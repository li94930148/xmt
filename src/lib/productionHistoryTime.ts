/** production_history.created_at still uses SQLite's UTC CURRENT_TIMESTAMP default. */
export function productionHistoryTimestamp(value: string): number {
  const normalized = value.trim().replace(' ', 'T');
  const explicit = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);
  return new Date(explicit ? normalized : `${normalized}Z`).getTime();
}
