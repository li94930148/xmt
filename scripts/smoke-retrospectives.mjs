const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const TOKEN = process.env.TOKEN || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

if (!TOKEN) {
  console.log('Missing TOKEN. Example: TOKEN=... API_BASE_URL=http://localhost:3001/api npm run test:retrospectives');
  console.log('Optional: set ADMIN_TOKEN to cover template management, publish and archive checks.');
  process.exit(0);
}

async function request(method, path, token, body, expected) {
  const response = await fetch(`${API_BASE_URL}/retrospectives${path}`, {
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

function futureDate(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const createToken = ADMIN_TOKEN || TOKEN;
  const start = futureDate(10);
  const end = futureDate(16);

  await request('GET', '/templates', TOKEN, null, [200]);
  await request('GET', '?status=published', TOKEN, null, [200]);

  await request('POST', '/', createToken, {
    title: '',
    scopeType: 'team',
    periodStart: start,
    periodEnd: end,
  }, [400, 403]);

  const created = await request('POST', '/', createToken, {
    title: `Smoke retrospective ${Date.now()}`,
    scopeType: 'team',
    scopeId: null,
    periodStart: start,
    periodEnd: end,
  }, [200, 403]);

  if (!created?.retrospective?.id) {
    console.log('SKIP write-flow checks because current token cannot create retrospectives.');
    return;
  }

  const retroId = created.retrospective.id;
  await request('GET', `/${retroId}`, TOKEN, null, [200]);
  await request('PUT', `/${retroId}`, createToken, {
    title: created.retrospective.title,
    summaryMd: 'Smoke summary',
    version: Math.max(0, Number(created.retrospective.version) - 1),
  }, [409]);

  const updated = await request('PUT', `/${retroId}`, createToken, {
    title: created.retrospective.title,
    summaryMd: 'Smoke summary',
    version: created.retrospective.version,
  }, [200]);
  await request('POST', `/${retroId}/snapshot`, createToken, { mode: 'replace' }, [200]);
  await request('POST', `/${retroId}/actions`, createToken, {
    title: 'Smoke follow-up action',
    descriptionMd: 'Created by smoke test',
    dueDate: end,
  }, [200, 403]);

  const detail = await request('GET', `/${retroId}`, TOKEN, null, [200]);
  const actionId = detail.actions?.[0]?.id;
  if (actionId) {
    await request('PATCH', `/actions/${actionId}`, createToken, {
      status: 'doing',
      resultMd: 'In progress',
    }, [200]);
  }

  await request('POST', `/${retroId}/publish`, createToken, null, [200, 403]);
  await request('POST', `/${retroId}/archive`, createToken, null, [200, 403, 409]);
  await request('PUT', `/${retroId}`, createToken, {
    title: updated.retrospective.title,
    summaryMd: 'Should be readonly after publish/archive',
    version: Number(updated.retrospective.version) + 2,
  }, [403, 409]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
