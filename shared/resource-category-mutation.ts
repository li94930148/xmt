export type ResourceCategoryMutationOperation = 'create' | 'update' | 'delete';

const mutationFields: Record<ResourceCategoryMutationOperation, readonly string[]> = {
  create: ['name', 'parent_id', 'code', 'sort_order'],
  update: ['name', 'parent_id', 'code', 'sort_order', 'enabled'],
  delete: [],
};

/** A deterministic request body shared by the browser and API fingerprint code. */
export function resourceCategoryMutationCanonicalRequest(
  operation: ResourceCategoryMutationOperation,
  libraryType: string,
  categoryId: number | null,
  payload: Record<string, unknown>,
) {
  const fields = mutationFields[operation]
    .filter((field) => Object.prototype.hasOwnProperty.call(payload, field))
    .map((field) => [field, payload[field]] as const);
  return JSON.stringify([operation, libraryType, categoryId, fields]);
}
