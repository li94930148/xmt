const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const TOKEN = process.env.TOKEN || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

if (!TOKEN) {
  console.log('Missing TOKEN. Example: TOKEN=... API_BASE_URL=http://localhost:3001/api npm run test:daily-reports');
  console.log('Optional: set ADMIN_TOKEN to cover team and review checks.');
  process.exit(0);
}

const date = new Date();
date.setUTCDate(date.getUTCDate() + 400);
const smokeDate = date.toISOString().slice(0, 10);
const conflictDate = `${date.getUTCFullYear()}-12-${String(10 + Math.floor(Math.random() * 18)).padStart(2, '0')}`;

async function request(method, path, token, body, expected) {
  const response = await fetch(`${API_BASE_URL}/daily-reports${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  const ok = expected.includes(response.status);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${method} ${path} -> ${response.status}`);
  if (!ok) {
    console.log(JSON.stringify(payload, null, 2));
    throw new Error(`Unexpected status ${response.status} for ${method} ${path}`);
  }
  return payload?.data;
}

async function main() {
  await request('GET', `/me?date=${smokeDate}`, TOKEN, null, [200]);
  await request('GET', '/me?date=bad-date', TOKEN, null, [400]);

  const empty = await request('POST', '/draft', TOKEN, {
    reportDate: smokeDate,
    manualSummaryMd: '',
    riskLevel: 'normal',
    items: [],
  }, [200]);
  await request('POST', `/${empty.id}/submit`, TOKEN, null, [400]);

  const conflict = await request('POST', '/draft', TOKEN, {
    reportDate: conflictDate,
    manualSummaryMd: 'Smoke report',
    riskLevel: 'normal',
    items: [{ sectionKey: 'done', title: 'Done', contentMd: 'Smoke item', sortOrder: 0 }],
  }, [200]);
  await request('POST', '/draft', TOKEN, {
    reportDate: conflictDate,
    version: Math.max(0, Number(conflict.version) - 1),
    manualSummaryMd: 'Conflict smoke',
    riskLevel: 'normal',
    items: [{ sectionKey: 'done', title: 'Done', contentMd: 'Conflict item', sortOrder: 0 }],
  }, [409]);

  const saved = await request('POST', '/draft', TOKEN, {
    reportDate: smokeDate,
    version: empty.version,
    manualSummaryMd: 'Smoke report ready',
    riskLevel: 'normal',
    items: [{ sectionKey: 'done', title: 'Done', contentMd: 'Smoke item', sortOrder: 0 }],
  }, [200]);
  const submitted = await request('POST', `/${saved.id}/submit`, TOKEN, null, [200]);

  await request('GET', `/archive?start=${smokeDate}&end=${smokeDate}`, TOKEN, null, [200]);
  await request('GET', '/archive?start=2099-01-01&end=2099-02-15', TOKEN, null, [400]);
  await request('GET', `/team?date=${smokeDate}`, TOKEN, null, [200, 403]);

  if (ADMIN_TOKEN) {
    await request('GET', `/team?date=${smokeDate}`, ADMIN_TOKEN, null, [200]);
    await request('POST', `/${submitted.id}/review`, ADMIN_TOKEN, { action: 'approve', comment: 'Smoke approved' }, [200, 409]);
  } else {
    console.log('SKIP admin team/review checks because ADMIN_TOKEN is not set.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
