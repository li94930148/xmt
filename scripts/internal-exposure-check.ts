const publicBaseUrl = process.env.XMT_PUBLIC_BASE_URL?.replace(/\/$/, '');
if (!publicBaseUrl) throw new Error('Set XMT_PUBLIC_BASE_URL for the public internal exposure gate');

const paths = [
  '/internal/auth-rollout/runtime',
  '/internal/socket-lifecycle/summary',
  '/internal/ops/runtime',
  '/internal/metrics/auth',
];
for (const path of paths) {
  const response = await fetch(`${publicBaseUrl}${path}`, { redirect: 'manual' });
  if (response.status !== 404) throw new Error(`Public internal route is not hidden: ${path} returned ${response.status}`);
}
console.log(JSON.stringify({ status: 'PASS', checked: paths.length }));
