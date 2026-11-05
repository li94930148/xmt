import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const coreCiScripts = [
  "test:topics-list-notify",
  "test:api-contract",
  "test:production-materials",
  "test:resource-categories",
  "test:resource-create-atomic",
  "test:resource-create-idempotency",
  "test:resource-create-idempotency-http",
  "test:resource-create-idempotency-migration",
  "test:resource-center-mutations",
  "test:content-topic-assets",
  "test:production-access",
  "test:production-review",
  "test:shooting-create-idempotency",
  "test:shooting-create-idempotency-migration",
  "test:production-create-idempotency",
  "test:production-create-idempotency-migration",
  "test:workflow-script-source",
  "test:workflow-script-source-migration",
  "test:production-material-history-migration",
  "test:workflow-document-versions",
  "test:inspiration-comment-idempotency-migration",
  "test:inspiration-create-idempotency-migration",
  "test:inspiration-vote-idempotency-migration",
  "test:publishing-create-idempotency-migration",
  "test:user-update-idempotency-migration",
  "test:user-create-idempotency-migration",
  "test:user-delete-idempotency-migration",
  "test:workflow-template-create-idempotency-migration",
  "test:calendar-create-idempotency-migration",
  "test:message-clear-idempotency-migration",
  "test:message-read-all-idempotency-migration",
  "test:retrospective-update-idempotency-migration",
  "test:anonymous-feedback-delete-recovery-migration",
  "test:anonymous-feedback-submit-recovery-migration",
  "test:anonymous-feedback-update-recovery-migration",
  "test:creator-daily-observations-migration",
  "test:creator-agent:binding-recovery-migration",
  "test:topic-stage-timestamp",
  "test:creator-topic-suggestions",
  "test:rate-limit",
  "test:workflow-stage-crud",
  "test:home-dashboard",
  "test:inspiration-topic-link",
  "test:inspiration-create-response",
  "test:publishing-create-idempotency",
  "test:inspiration-mutations-atomic",
  "test:publishing-douyin-link",
  "test:analytics-write-scope",
  "test:publishing-metric-sources",
  "test:message-pagination",
  "test:user-mutation-audit-atomic",
  "test:daily-report-audit-atomic",
  "test:published-archive-soft-delete-http",
  "test:global-search",
  "test:retrospective-audit-atomic",
  "test:retrospective-update-idempotency",
  "test:yjs-runtime-persistence",
  "test:yjs-provider-ack",
  "test:collaboration-coordination",
  "test:creator-sync-single-flight",
  "test:anonymous-feedback-delete-recovery",
  "test:anonymous-feedback-submit-recovery",
  "test:anonymous-feedback-update-recovery",
  "test:anonymous-feedback-update-fingerprint",
  "test:anonymous-feedback",
  "test:creator-report-publish-window",
  "test:creator-dashboard-freshness",
  "test:socket-realtime-sync",
  "test:auth-session-migration",
  "test:auth-rollout",
  "test:auth-observability",
  "test:production-outline-origin",
  "test:production-outline-origin-migration",
  "test:distributed-job-lease",
  "test:recovery-status-cache-client",
  "test:creator-reports-cache-http",
  "test:retrospective-create-idempotency",
  "test:retro-action-create-idempotency",
  "test:retro-action-update-idempotency",
  "test:workflow-template-create-idempotency",
  "test:workflow-template-update-idempotency",
  "test:official-export-v2",
  "test:creator-access-platform",
  "test:code-review-remediation",
  "test:official-export-queue",
  "test:official-export-dashboard-mode",
  "test:v2102-storage",
  "test:creator-agent:binding-recovery",
  "test:creator-agent:bind-result-recovery-migration",
  "test:auth",
  "test:bootstrap-seed-security",
  "test:achievements-check",
  "test:achievement-seed-atomic",
  "test:douyin-token-encryption",
  "test:smoke-password-required",
  "test:process-errors",
  "test:rbac-invariant",
  "test:auth-session-service",
  "test:auth-v1",
  "test:login-gateway",
  "test:origin-cors",
  "test:mobile-safe-draft",
  "test:mobile-device-registry",
  "test:android-endpoint-contract",
  "test:mobile-health-response-contract",
  "test:daily-report-permissions",
  "test:legacy-reports-read-only",
  "test:report-summaries",
  "test:android-runtime",
  "test:mobile-auth-runtime",
  "test:native-auth-refresh-scheduler",
  "test:native-auth-runtime-integration",
  "test:collaboration-access",
  "test:collaboration-socket-authorization",
  "test:collaboration-redis-integration",
  "test:backup-lock",
  "test:backup-create-recovery",
  "test:backup-restore-drill",
  "test:idempotency-receipt-inventory",
  "test:calendar-permissions",
  "test:recovery-status-cache",
  "test:migration-readiness",
  "test:version-governance",
  "test:creator-sync-v2102",
  "test:creator-unified-reports",
  "test:canonical-works",
  "test:creator-agent-replay-security",
  "test:auth-web-cookie",
  "test:creator-agent:binding",
  "test:user-role-assignment-security",
  "test:user-list-pagination",
  "test:douyin-webhook-security",
  "test:user-session-revocation",
  "test:auth-401-recovery",
  "test:role-management-security",
  "test:error-response-sanitization",
  "test:error-response-sanitization-http",
  "test:integrity:history",
  "test:integrity:resources-pomodoro",
  "test:integrity:templates",
  "test:integrity:workflow",
  "test:integrity:retrospectives",
  "test:integrity:collaboration-dashboard",
];
const sensitiveEnvironmentKey = /TOKEN|SECRET|PASSWORD|DATABASE|DB_PATH|REDIS|DOUYIN|AWS|GOOGLE|API_BASE|JWT|COOKIE|PRIVATE_KEY|XMT_RUNTIME/i;
const inheritedSecrets = Object.entries(process.env)
  .filter(([key, value]) => sensitiveEnvironmentKey.test(key) && Boolean(value) && value.length >= 4)
  .map(([, value]) => value);
const childEnvironment = { ...process.env };
for (const key of Object.keys(childEnvironment)) {
  if (sensitiveEnvironmentKey.test(key)) delete childEnvironment[key];
}
childEnvironment.NODE_ENV = 'test';
childEnvironment.CI = 'true';

test('native Vitest aliases are not executed again through the legacy bridge', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const nestedVitestAliases = coreCiScripts.filter((script) =>
    packageJson.scripts[script]?.startsWith('vitest run --config vitest.config.ts'));
  expect(nestedVitestAliases).toEqual([]);
});

function redact(text: string) {
  return inheritedSecrets.reduce((current, secret) => current.split(secret).join("[redacted]"), text);
}

describe('Core CI legacy test commands', () => {
  for (const script of coreCiScripts) {
    test(script, () => {
      const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script], {
        cwd: process.cwd(),
        env: childEnvironment,
        encoding: "utf8",
        timeout: 600_000,
        maxBuffer: 32 * 1024 * 1024,
      });
      if (result.error || result.status !== 0) {
        const exit = result.status === null ? "no exit status" : "exit " + result.status;
        const output = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n");
        throw new Error(script + " failed with " + exit + "\n" + redact(output).slice(-16_000));
      }
    }, 600_000);
  }
});

export { coreCiScripts };
