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
  // The legacy routes only see pomodoro_sessions; cancellations are atomically deleted there.
  '032': 'SAFE_EXPAND',
  // The nullable comment request key is ignored by older application code.
  '033': 'SAFE_EXPAND',
  // The nullable inspiration request key is ignored by older application code.
  '034': 'SAFE_EXPAND',
  // Publishing create replay keys are additive and ignored by older application code.
  '035': 'SAFE_EXPAND',
  // Shooting create replay keys are additive and ignored by older application code.
  '036': 'SAFE_EXPAND',
  // Production create replay keys are additive and ignored by older application code.
  '037': 'SAFE_EXPAND',
  // Calendar event create replay keys are additive and ignored by older application code.
  '038': 'SAFE_EXPAND',
  // User update replay keys are additive and ignored by older application code.
  '039': 'SAFE_EXPAND',
  // User create replay keys are additive and ignored by older application code.
  '040': 'SAFE_EXPAND',
  // User delete replay tombstones are additive and preserve legacy delete behavior.
  '041': 'SAFE_EXPAND',
  // Message clear replay records are additive; old clients may still use the unkeyed route.
  '042': 'SAFE_EXPAND',
  // Retrospective create replay records are additive; old clients may still use the unkeyed route.
  '043': 'SAFE_EXPAND',
  // Message read-all replay records are additive; old clients may still use the unkeyed route.
  '044': 'SAFE_EXPAND',
  // Workflow-template create replay records are additive; old clients may still use the unkeyed route.
  '045': 'SAFE_EXPAND',
  // Anonymous-feedback delete tombstones are additive and preserve the legacy unkeyed delete route.
  '046': 'SAFE_EXPAND',
  // Retrospective action-create replay records are additive; old clients may remain unkeyed.
  '047': 'SAFE_EXPAND',
  // Announcement create replay records are additive; the legacy route remains supported.
  '048': 'SAFE_EXPAND',
  // Production-review reply replay records are additive; old clients may remain unkeyed.
  '049': 'SAFE_EXPAND',
  // Production-review thread replay records are additive; old clients may remain unkeyed.
  '050': 'SAFE_EXPAND',
  // Production-review status receipts are additive; old clients may remain unkeyed.
  '051': 'SAFE_EXPAND',
  // The recovery receipt is additive and stores only authenticated ciphertext for a short-lived code.
  '052': 'SAFE_EXPAND',
  // The bind-result receipt is additive; legacy unkeyed agents keep the original one-time contract.
  '053': 'SAFE_EXPAND',
  // Keyed inspiration vote outcomes are additive; older clients keep using the legacy toggle path.
  '054': 'SAFE_EXPAND',
  // Keyed retrospective action update receipts are additive; legacy PATCH clients remain supported.
  '055': 'SAFE_EXPAND',
  // Action update receipts add a durable outcome so CAS conflicts are safe to recover after a lost response.
  '056': 'SAFE_EXPAND',
  // Retrospective summary update receipts are additive; legacy PUT clients remain supported.
  '057': 'SAFE_EXPAND',
  // Topic-create receipts are additive; legacy POST clients remain supported.
  '058': 'SAFE_EXPAND',
  // Resource-create receipts are additive; legacy POST clients remain supported.
  '059': 'SAFE_EXPAND',
  // Resource-update receipts are additive; legacy PUT clients remain supported.
  '060': 'SAFE_EXPAND',
  // Workflow-template update receipts are additive; legacy PUT clients remain supported.
  '061': 'SAFE_EXPAND',
  // Resource-category mutation receipts are additive; legacy CRUD clients remain supported.
  '062': 'SAFE_EXPAND',
  // Anonymous-feedback update receipts are additive; legacy PATCH clients remain supported.
  '063': 'SAFE_EXPAND',
  // Legacy topic-template mutation receipts are additive; unkeyed clients remain supported.
  '064': 'SAFE_EXPAND',
  // Report summary update receipts are additive; legacy unkeyed PUT clients remain supported.
  '065': 'SAFE_EXPAND',
  // Anonymous feedback submit receipts are additive and are deleted with their feedback row.
  '066': 'SAFE_EXPAND',
};
