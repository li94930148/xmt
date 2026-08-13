export type CiDecision = 'PASS' | 'FAIL' | 'IN_PROGRESS' | 'NO_RUN' | 'UNAVAILABLE';
export type CiJob = { name: string; status: string; conclusion?: string | null };

export function unavailableCiStatus(apiStatus: 'NETWORK_ERROR' | 'RATE_LIMITED' = 'NETWORK_ERROR', reason?: string) {
  return { decision: 'UNAVAILABLE' as const, checks: { api: apiStatus }, ...(reason ? { reason } : {}) };
}

export function assessCiStatus(sha: string, runs: Array<{ head_sha: string; name: string; status: string; conclusion?: string | null; jobs?: CiJob[] }> | null): { decision: CiDecision; checks: Record<string, string>; reason?: string } {
  if (!runs) return unavailableCiStatus();
  const run = runs.find((item) => item.head_sha === sha && item.name === 'CI');
  if (!run) return { decision: 'NO_RUN', checks: { run: 'MISSING' }, reason: 'No CI run for exact SHA' };
  const jobs = run.jobs || [];
  const checks: Record<string, string> = { run: run.conclusion || run.status };
  for (const name of ['fast-gate', 'core-security-contract']) {
    const job = jobs.find((item) => item.name === name);
    checks[name] = job ? (job.conclusion || job.status) : 'UNKNOWN';
  }
  if (jobs.length === 0) return { decision: run.conclusion === 'success' ? 'UNAVAILABLE' : run.status === 'completed' ? 'FAIL' : 'IN_PROGRESS', checks, reason: 'Job details unavailable' };
  if (Object.values(checks).some((status) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(status))) return { decision: 'FAIL', checks };
  if (checks['fast-gate'] === 'success' && checks['core-security-contract'] === 'success') return { decision: 'PASS', checks };
  return { decision: 'IN_PROGRESS', checks };
}
