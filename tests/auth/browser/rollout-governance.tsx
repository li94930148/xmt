import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import AuthRolloutStatus from '../../../src/pages/AuthRolloutStatus';

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes('/api/v1/auth-rollout/status')) return originalFetch(input, init);
  const requestedUserId = new URL(url, window.location.origin).searchParams.get('userId');
  const userId = requestedUserId ? Number(requestedUserId) : 7;
  const now = new Date().toISOString();
  return new Response(JSON.stringify({
    success: true,
    data: {
      rollout: { mode: 'legacy', enabled: false, percentage: 0, allowlistCount: 2, internalCount: 1 },
      diagnostic: { userId, mode: 'legacy', enabled: false, matchedRule: 'none', reason: '当前配置要求继续使用 legacy' },
      metrics: {
        last5Minutes: { windowMinutes: 5, from: now, to: now, categories: { login: 2, refresh: 1, logout: 1, failure: 0, securityEvents: 0 }, counters: { legacy_login_count: 2, v1_login_count: 0, refresh_success: 1, refresh_failed: 0, csrf_failed: 0, token_reuse_detected: 0, logout_success: 1, expired_count: 0 }, refreshFailureRate: 0 },
        lastHour: { windowMinutes: 60, from: now, to: now, categories: { login: 18, refresh: 0, logout: 3, failure: 0, securityEvents: 0 }, counters: { legacy_login_count: 18, v1_login_count: 0, refresh_success: 0, refresh_failed: 0, csrf_failed: 0, token_reuse_detected: 0, logout_success: 3, expired_count: 0 }, refreshFailureRate: 0 },
        last24Hours: { windowMinutes: 1440, from: now, to: now, categories: { login: 126, refresh: 0, logout: 21, failure: 0, securityEvents: 0 }, counters: { legacy_login_count: 126, v1_login_count: 0, refresh_success: 0, refresh_failed: 0, csrf_failed: 0, token_reuse_detected: 0, logout_success: 21, expired_count: 0 }, refreshFailureRate: 0 },
      },
      risk: { status: 'healthy', events: [] },
      thresholds: { windowMinutes: 60, refreshFailureRate: 0.2, csrfFailureCount: 5, tokenReuseCount: 1, expiredCount: 10 },
      audits: [{ actor: 'system', action: 'config_loaded', before: null, after: { mode: 'legacy' }, reason: '服务启动时载入 Auth Rollout 只读配置', created_at: now }],
      generatedAt: now,
    },
    meta: { requestId: 'rollout-browser-fixture' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <main className="mx-auto max-w-[1440px] p-5 md:p-8">
      <AuthRolloutStatus />
    </main>
  </React.StrictMode>,
);
