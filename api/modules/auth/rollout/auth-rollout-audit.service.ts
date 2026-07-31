export type AuthRolloutAuditRecord = {
  actor: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
  created_at: string;
};

export class AuthRolloutAuditService {
  private records: AuthRolloutAuditRecord[] = [];

  record(input: Omit<AuthRolloutAuditRecord, 'created_at'>, at = new Date()): AuthRolloutAuditRecord {
    const record = { ...input, created_at: at.toISOString() };
    this.records.push(record);
    if (this.records.length > 500) this.records = this.records.slice(-500);
    return record;
  }

  list(limit = 20): AuthRolloutAuditRecord[] {
    const safeLimit = Math.min(100, Math.max(1, Math.round(limit)));
    return this.records.slice(-safeLimit).reverse();
  }
}
