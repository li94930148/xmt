import { useAuthStore } from '@/store';

export type AuthRolloutMode = 'disabled' | 'legacy' | 'internal' | 'allowlist' | 'percentage';
export type AuthMigrationCounters = {
  legacy_login_count: number;
  v1_login_count: number;
  refresh_success: number;
  refresh_failed: number;
  csrf_failed: number;
  token_reuse_detected: number;
  logout_success: number;
  expired_count: number;
};

export type AuthRolloutStatusData = {
  rollout: {
    mode: AuthRolloutMode;
    enabled: boolean;
    percentage: number;
    allowlistCount: number;
    internalCount: number;
  };
  diagnostic: {
    userId: number;
    mode: AuthRolloutMode;
    enabled: boolean;
    matchedRule: AuthRolloutMode | 'none';
    reason: string;
  };
  metrics: Record<'last5Minutes' | 'lastHour' | 'last24Hours', {
    windowMinutes: number;
    from: string;
    to: string;
    categories: { login: number; refresh: number; logout: number; failure: number; securityEvents: number };
    counters: AuthMigrationCounters;
    refreshFailureRate: number;
  }>;
  exporters: {
    source: Array<'memory' | 'prometheus' | 'opentelemetry'>;
    status: Array<{
      name: string;
      kind: 'memory' | 'prometheus' | 'opentelemetry';
      enabled: boolean;
      healthy: boolean;
      lastExportAt: string | null;
      reason: string | null;
    }>;
    lastEventAt: string | null;
    lastExportAt: string | null;
  };
  risk: {
    status: 'healthy' | 'risk';
    events: Array<{
      code: string;
      severity: 'warning' | 'critical';
      value: number;
      threshold: number;
      reason: string;
      createdAt: string;
    }>;
  };
  thresholds: {
    windowMinutes: number;
    refreshFailureRate: number;
    csrfFailureCount: number;
    tokenReuseCount: number;
    expiredCount: number;
  };
  audits: Array<{
    actor: string;
    action: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    reason: string;
    created_at: string;
  }>;
  generatedAt: string;
};

export async function getAuthRolloutStatus(userId?: number): Promise<AuthRolloutStatusData> {
  const token = useAuthStore.getState().token;
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const response = await fetch(`/api/v1/auth-rollout/status${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    data?: AuthRolloutStatusData;
    error?: { message?: string };
  } | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || '认证迁移状态加载失败');
  }
  return payload.data;
}
