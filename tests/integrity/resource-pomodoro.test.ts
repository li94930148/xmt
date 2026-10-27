import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-integrity-'));
process.env.XMT_DB_PATH = path.join(directory, 'integrity.db');
process.env.JWT_SECRET = 'integrity-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: resourcesRouter } = await import('../../api/routes/resources.js');
const { default: pomodoroRouter } = await import('../../api/routes/pomodoro.js');

await initDatabase();
assert.equal((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM user_roles ur JOIN users u ON u.id=ur.user_id JOIN roles r ON r.id=ur.role_id WHERE u.username='admin' AND r.code='admin'"))?.count, 1);
const memberId = await executeInsert("INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES ('integrity-member','unused','member@example.invalid','member','Member',1,0)");
const peerId = await executeInsert("INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES ('integrity-peer','unused','peer@example.invalid','member','Peer',1,0)");
const adminId = await executeInsert("INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES ('integrity-admin','unused','admin@example.invalid','admin','Admin',1,0)");
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code = ?', [memberId, 'member']);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code = ?', [peerId, 'member']);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code = ?', [adminId, 'admin']);

const app = express();
app.use(express.json());
let dropNextPomodoroResponse: 'start' | 'cancel' | 'complete' | null = null;
const droppedResponseBodies: unknown[] = [];
app.use((request, response, next) => {
  const sendJson = response.json.bind(response);
  response.json = ((body: unknown) => {
    const path = new URL(request.originalUrl, 'http://localhost').pathname;
    const operation = path.endsWith('/start') ? 'start'
      : path.endsWith('/cancel') ? 'cancel'
        : path.endsWith('/complete') ? 'complete'
          : null;
    if (operation && operation === dropNextPomodoroResponse) {
      dropNextPomodoroResponse = null;
      droppedResponseBodies.push(body);
      response.socket?.destroy();
      return response;
    }
    return sendJson(body);
  }) as typeof response.json;
  next();
});
app.use('/api/resources', resourcesRouter);
app.use('/api/pomodoro', pomodoroRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api`;
const headers = (userId: number) => ({ authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' });
const postStart = (userId: number, body: Record<string, unknown> = {}) => fetch(`${base}/pomodoro/start`, {
  method: 'POST', headers: headers(userId), body: JSON.stringify(body),
});
const postCancel = (userId: number, sessionId: number) => fetch(`${base}/pomodoro/${sessionId}/cancel`, { method: 'POST', headers: headers(userId) });
const postComplete = (userId: number, sessionId: number) => fetch(`${base}/pomodoro/${sessionId}/complete`, { method: 'POST', headers: headers(userId) });
const getActive = (userId: number) => fetch(`${base}/pomodoro/active`, { headers: headers(userId) });

try {
  const denied = await fetch(`${base}/resources`, { method: 'POST', headers: headers(memberId), body: JSON.stringify({ name: '无权限资料' }) });
  assert.equal(denied.status, 403);
  const created = await fetch(`${base}/resources`, { method: 'POST', headers: headers(adminId), body: JSON.stringify({ name: '安全资料', file_path: '/uploads/file.pdf' }) });
  assert.equal(created.status, 410);
  assert.equal(created.headers.get('deprecation'), 'true');

  const unauthenticatedActive = await fetch(`${base}/pomodoro/active`);
  assert.equal(unauthenticatedActive.status, 401, 'active-session read requires authentication');
  const emptyActive = await getActive(adminId);
  assert.equal(emptyActive.status, 200);
  assert.equal(emptyActive.headers.get('cache-control'), 'no-store', 'active-session response is not cached');
  assert.deepEqual(await emptyActive.json(), { session: null }, 'a user without an active session receives an explicit null');

  const concurrentStarts = await Promise.all([postStart(memberId), postStart(memberId)]);
  assert.deepEqual(concurrentStarts.map((response) => response.status), [200, 200], 'concurrent start requests both resolve successfully');
  const concurrentStartBodies = await Promise.all(concurrentStarts.map((response) => response.json() as Promise<{ sessionId: number; resumed: boolean; remainingSeconds: number; startedAt: string }>));
  assert.equal(concurrentStartBodies[0].sessionId, concurrentStartBodies[1].sessionId, 'concurrent start requests recover the same active session');
  assert.equal(new Set(concurrentStartBodies.map((body) => body.startedAt)).size, 1, 'concurrent start responses identify the same persisted start time');
  assert(concurrentStartBodies.every((body) => Number.isSafeInteger(body.remainingSeconds) && body.remainingSeconds >= 0 && body.remainingSeconds <= 25 * 60));
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_sessions WHERE user_id = ? AND completed = 0', [memberId]))?.count, 1, 'concurrent starts insert only one active session');
  const sessionId = concurrentStartBodies[0].sessionId;
  const activeMemberResponse = await getActive(memberId);
  const activeMemberPayload = await activeMemberResponse.json() as { session: {
    id: number; sessionId: number; duration: number; topicId: number | null; startedAt: string; remainingSeconds: number;
  } | null };
  assert(activeMemberPayload.session, 'active-session reads return a session for the current user');
  assert.equal(activeMemberPayload.session.id, sessionId);
  assert.equal(activeMemberPayload.session.sessionId, sessionId);
  assert.equal(activeMemberPayload.session.duration, 25);
  assert.equal(activeMemberPayload.session.topicId, null);
  assert.equal(activeMemberPayload.session.startedAt, concurrentStartBodies[0].startedAt);
  assert(Number.isSafeInteger(activeMemberPayload.session.remainingSeconds)
    && activeMemberPayload.session.remainingSeconds >= 0
    && activeMemberPayload.session.remainingSeconds <= 25 * 60);
  assert.deepEqual(await (await getActive(peerId)).json(), { session: null }, 'a different user cannot see another user’s active session');

  dropNextPomodoroResponse = 'start';
  await assert.rejects(postStart(peerId), 'the first start response is intentionally dropped after the route writes');
  const lostStartBody = droppedResponseBodies.pop() as { sessionId: number; startedAt: string };
  const recoveredStartResponse = await postStart(peerId);
  assert.equal(recoveredStartResponse.status, 200, 'retry after a committed start with a lost response is recoverable');
  const recoveredStart = await recoveredStartResponse.json() as { sessionId: number; resumed: boolean; startedAt: string };
  assert.equal(recoveredStart.sessionId, lostStartBody.sessionId, 'retry returns the same session id rather than creating a second row');
  assert.equal(recoveredStart.startedAt, lostStartBody.startedAt, 'retry retains the original server start time');
  assert.equal(recoveredStart.resumed, true, 'retry is explicitly identified as an active-session recovery');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_sessions WHERE user_id = ? AND completed = 0', [peerId]))?.count, 1, 'lost start response leaves exactly one recoverable active row');
  const peerActive = await getActive(peerId).then((response) => response.json()) as { session: { sessionId: number } | null };
  assert.equal(peerActive.session?.sessionId, lostStartBody.sessionId, 'an active read recovers a start whose first response was lost');
  const memberActiveAfterPeerStart = await getActive(memberId).then((response) => response.json()) as { session: { sessionId: number } | null };
  assert.equal(memberActiveAfterPeerStart.session?.sessionId, sessionId, 'one user’s active read stays on their own session');

  const completedResponse = await postComplete(memberId, sessionId);
  assert.equal(completedResponse.status, 200);
  assert.deepEqual(await (await getActive(memberId)).json(), { session: null }, 'completed sessions are no longer active');
  assert.equal((await postComplete(memberId, sessionId)).status, 400, 'a repeated completion is reported as already completed');
  const completedCancelResponse = await postCancel(memberId, sessionId);
  assert.equal(completedCancelResponse.status, 409, 'a completed session cannot be cancelled');
  assert.deepEqual(await completedCancelResponse.json(), { message: '已完成的番茄钟不能重置' });
  const preservedCompleted = await queryOne<{ completed: number }>('SELECT completed FROM pomodoro_sessions WHERE id = ? AND user_id = ?', [sessionId, memberId]);
  assert.deepEqual(preservedCompleted, { completed: 1 }, 'cancel conflict preserves the completed record');

  const cancellationStart = await postStart(memberId);
  const cancellationSessionId = (await cancellationStart.json() as { sessionId: number }).sessionId;
  assert.equal((await postCancel(peerId, cancellationSessionId)).status, 404, 'another user cannot observe or cancel a session');
  assert.equal((await postCancel(memberId, 999999999)).status, 404, 'an invalid id is not treated as an already-cancelled session');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_cancellation_ledger WHERE user_id = ? AND session_id = ?', [memberId, cancellationSessionId]))?.count, 0, 'unauthorized and invalid cancellation attempts do not write the ledger');

  const completedBeforeCancel = (await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_sessions WHERE user_id = ? AND completed = 1', [memberId]))?.count;
  dropNextPomodoroResponse = 'cancel';
  await assert.rejects(postCancel(memberId, cancellationSessionId), 'the cancel response is intentionally dropped after the cancellation is committed');
  assert.equal(await queryOne('SELECT id FROM pomodoro_sessions WHERE id = ? AND user_id = ?', [cancellationSessionId, memberId]), null, 'cancel removes the row legacy start and complete routes inspect');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_cancellation_ledger WHERE user_id = ? AND session_id = ?', [memberId, cancellationSessionId]))?.count, 1, 'cancellation ledger retains the owner-scoped idempotency record after a lost response');
  assert.deepEqual(await (await getActive(memberId)).json(), { session: null }, 'cancelled sessions are not returned as active');
  // The old release only inspects pomodoro_sessions: an absent cancelled row cannot block start,
  // be marked complete by its id-only update, or affect completed=1 statistics.
  assert.equal(await queryOne('SELECT id FROM pomodoro_sessions WHERE user_id = ? AND completed = 0', [memberId]), null, 'legacy start predicate does not mistake a cancelled row for an active session');
  assert.equal(await queryOne('SELECT id FROM pomodoro_sessions WHERE id = ? AND user_id = ?', [cancellationSessionId, memberId]), null, 'legacy complete lookup returns not found instead of marking a cancelled session complete');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_sessions WHERE user_id = ? AND completed = 1', [memberId]))?.count, completedBeforeCancel, 'legacy completed-only statistics do not count cancellation');

  const nextSessionResponse = await postStart(memberId);
  assert.equal(nextSessionResponse.status, 200, 'a cancelled session does not block a later session');
  const nextSessionId = (await nextSessionResponse.json() as { sessionId: number }).sessionId;
  assert.notEqual(nextSessionId, cancellationSessionId);
  const recoveredCancel = await postCancel(memberId, cancellationSessionId);
  assert.equal(recoveredCancel.status, 200, 'retry of a committed cancellation converges successfully');
  assert.deepEqual(await recoveredCancel.json(), { message: '番茄钟已放弃', alreadyCancelled: true });
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_sessions WHERE id = ? AND user_id = ? AND completed = 0', [nextSessionId, memberId]))?.count, 1, 'retrying an older cancellation does not delete the user\'s newer active session');
  assert.equal((await postCancel(peerId, cancellationSessionId)).status, 404, 'another user cannot treat an owned cancellation ledger entry as theirs');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_cancellation_ledger WHERE user_id = ? AND session_id = ?', [peerId, cancellationSessionId]))?.count, 0, 'another user cannot observe the owner-scoped cancellation ledger');

  const expiredSessionId = await executeInsert(
    `INSERT INTO pomodoro_sessions (user_id, duration, topic_id, completed, started_at)
     VALUES (?, 1, NULL, 0, datetime('now', '-1 hour'))`,
    [adminId]
  );
  const expiredActiveResponse = await getActive(adminId);
  const expiredActive = await expiredActiveResponse.json() as { session: {
    id: number; sessionId: number; duration: number; topicId: number | null; startedAt: string; remainingSeconds: number;
  } | null };
  assert.equal(expiredActive.session?.id, expiredSessionId);
  assert.equal(expiredActive.session?.sessionId, expiredSessionId);
  assert.equal(expiredActive.session?.remainingSeconds, 0, 'an unfinished session past its duration remains visible with zero seconds');
  assert.equal((await postCancel(adminId, expiredSessionId)).status, 200, 'the expired unfinished fixture can be removed through its owner-only cancellation path');
  assert.deepEqual(await (await getActive(adminId)).json(), { session: null }, 'a cancelled expired session disappears from active reads');

  const raceStartResponse = await postStart(memberId);
  const raceSessionId = (await raceStartResponse.json() as { sessionId: number }).sessionId;
  const raceResults = await Promise.all([postCancel(memberId, raceSessionId), postComplete(memberId, raceSessionId)]);
  assert.deepEqual(raceResults.map((response) => response.status).sort(), [200, 409], 'concurrent cancel and complete have one winner and one explicit conflict');
  const raceState = await queryOne<{ completed: number }>('SELECT completed FROM pomodoro_sessions WHERE id = ? AND user_id = ?', [raceSessionId, memberId]);
  const raceCancellation = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_cancellation_ledger WHERE user_id = ? AND session_id = ?', [memberId, raceSessionId]);
  assert.equal(Number(Boolean(raceState?.completed)) + Number(raceCancellation?.count === 1), 1, 'concurrent cancel and complete have one terminal state without a lost or double-transitioned row');

  const lostCompleteStart = await postStart(memberId);
  const lostCompleteSessionId = (await lostCompleteStart.json() as { sessionId: number }).sessionId;
  dropNextPomodoroResponse = 'complete';
  await assert.rejects(postComplete(memberId, lostCompleteSessionId), 'the completion response is intentionally dropped after the completion is committed');
  assert.equal((await queryOne<{ completed: number }>('SELECT completed FROM pomodoro_sessions WHERE id = ? AND user_id = ?', [lostCompleteSessionId, memberId]))?.completed, 1, 'the first completion remains stored after its response is lost');
  const recoveredComplete = await postComplete(memberId, lostCompleteSessionId);
  assert.equal(recoveredComplete.status, 400, 'completion retry receives the existing idempotent already-completed response');
  assert.deepEqual(await recoveredComplete.json(), { message: '该番茄钟已完成' });
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_sessions WHERE id = ? AND user_id = ? AND completed = 1', [lostCompleteSessionId, memberId]))?.count, 1, 'completion retry preserves exactly one completed session');

  const restarted = await postStart(memberId);
  assert.equal(restarted.status, 200);
  const secondId = (await restarted.json() as { sessionId: number }).sessionId;
  assert.equal((await postComplete(memberId, secondId)).status, 200);
  const stats = await fetch(`${base}/pomodoro/stats`, { headers: headers(memberId) });
  const memberCompletedToday = await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM pomodoro_sessions WHERE user_id = ? AND completed = 1 AND DATE(ended_at) = DATE('now', '+8 hours')", [memberId]);
  assert.equal((await stats.json() as { today: number }).today, memberCompletedToday?.count);
  await execute("INSERT INTO pomodoro_sessions (user_id,duration,completed,ended_at) VALUES (?,50,1,datetime('now','+8 hours'))", [peerId]);
  const rankingResponse = await fetch(`${base}/pomodoro/ranking`, { headers: headers(memberId) });
  assert.equal(rankingResponse.status, 200);
  const ranking = (await rankingResponse.json() as { data: Array<{ user_id: number; user_name: string }> }).data;
  assert.equal(ranking.find((row) => row.user_id === memberId)?.user_name, 'Member');
  const anonymizedPeer = ranking.find((row) => row.user_id < 0);
  assert(anonymizedPeer);
  assert.match(anonymizedPeer.user_name, /^第 \d+ 名同事$/);
  assert.notEqual(anonymizedPeer.user_name, 'Peer');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
}
