export function productionSourceSnapshotHref(
  productionId: unknown,
  version: unknown,
) {
  const id = Number(productionId);
  const normalizedVersion = typeof version === 'string' ? version.trim() : '';
  if (!Number.isSafeInteger(id) || id <= 0
    || !normalizedVersion || normalizedVersion.length > 64) return null;
  const params = new URLSearchParams({ version: normalizedVersion });
  return `/production/${id}/source-snapshot?${params}`;
}
