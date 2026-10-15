export type MigrationPolicy = 'SAFE_EXPAND' | 'REVIEW_REQUIRED' | 'BLOCKED_FOR_ROLLBACK';

// Historical migrations are declared here rather than altering their applied checksums.
export const migrationPolicies: Readonly<Record<string, MigrationPolicy>> = {
  '001': 'SAFE_EXPAND', '002': 'SAFE_EXPAND', '003': 'SAFE_EXPAND', '004': 'SAFE_EXPAND',
  '005': 'SAFE_EXPAND', '006': 'REVIEW_REQUIRED', '007': 'REVIEW_REQUIRED', '008': 'SAFE_EXPAND', '009': 'SAFE_EXPAND',
  '010': 'SAFE_EXPAND', '011': 'SAFE_EXPAND', '012': 'SAFE_EXPAND', '013': 'SAFE_EXPAND', '014': 'SAFE_EXPAND',
  '015': 'SAFE_EXPAND',
  '016': 'SAFE_EXPAND',
  '017': 'SAFE_EXPAND',
  '018': 'SAFE_EXPAND',
  '019': 'SAFE_EXPAND',
  '020': 'SAFE_EXPAND',
  '021': 'SAFE_EXPAND',
  '022': 'SAFE_EXPAND',
  '023': 'SAFE_EXPAND',
  '024': 'SAFE_EXPAND',
  '025': 'SAFE_EXPAND',
  '026': 'SAFE_EXPAND',
  '027': 'SAFE_EXPAND',
  '028': 'SAFE_EXPAND',
  '029': 'SAFE_EXPAND',
  '030': 'SAFE_EXPAND',
  '031': 'SAFE_EXPAND',
};
