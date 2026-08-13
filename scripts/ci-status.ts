import { assessCiStatus } from '../api/modules/ops/ci-status-decision.js';
const sha = process.argv[2];
if (!sha || !/^[a-f0-9]{7,64}$/i.test(sha)) throw new Error('用法: npm run ops:ci-status -- <commit-sha>');
const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
try {
  const response = await fetch(`https://api.github.com/repos/li94930148/xmt/actions/runs?head_sha=${sha}&per_page=100`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
  const payload = await response.json() as { workflow_runs?: Array<{ id: number; head_sha: string; name: string; status: string; conclusion?: string | null }> };
  const runs = payload.workflow_runs || []; const ci = runs.find((run) => run.head_sha === sha && run.name === 'CI');
  if (!ci) { console.log(JSON.stringify({ sha, ...assessCiStatus(sha, []) }, null, 2)); process.exitCode = 1; }
  else {
    const jobsResponse = await fetch(`https://api.github.com/repos/li94930148/xmt/actions/runs/${ci.id}/jobs`, { headers, signal: AbortSignal.timeout(10_000) });
    const jobs = jobsResponse.ok ? ((await jobsResponse.json() as { jobs?: Array<{ name: string; status: string; conclusion?: string | null }> }).jobs || []) : undefined;
    const assessment = assessCiStatus(sha, [{ ...ci, jobs }]);
    console.log(JSON.stringify({ sha, runId: ci.id, ...assessment }, null, 2)); if (assessment.decision !== 'PASS') process.exitCode = 1;
  }
} catch (error) { console.log(JSON.stringify({ sha, ...assessCiStatus(sha, null), reason: error instanceof Error ? error.message : String(error) }, null, 2)); process.exitCode = 1; }
