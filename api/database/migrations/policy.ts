export type MigrationPolicy = 'SAFE_EXPAND' | 'REVIEW_REQUIRED' | 'BLOCKED_FOR_ROLLBACK';

// Historical migrations are declared here rather than altering their applied checksums.
export const migrationPolicies: Readonly<Record<string, MigrationPolicy>> = {
  '001': 'SAFE_EXPAND', '002': 'SAFE_EXPAND', '003': 'SAFE_EXPAND', '004': 'SAFE_EXPAND',
  '005': 'SAFE_EXPAND', '006': 'REVIEW_REQUIRED', '007': 'REVIEW_REQUIRED',
};
