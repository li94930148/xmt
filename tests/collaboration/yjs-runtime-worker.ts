import * as Y from 'yjs';

const roomId = process.env.XMT_TEST_ROOM_ID;
const text = process.env.XMT_TEST_UPDATE;
const userId = Number(process.env.XMT_TEST_USER_ID);
if (!roomId || !text || !Number.isSafeInteger(userId) || userId <= 0) {
  throw new Error('Missing isolated collaboration worker test input');
}

const [{ applyRuntimeDocumentUpdate, ensureRuntimeDocumentLoaded }, { closeDatabase }, { execute }] = await Promise.all([
  import('../../api/collaboration/yjs/documentStore.js'),
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
]);

try {
  await execute('PRAGMA busy_timeout = 500');
  await ensureRuntimeDocumentLoaded(roomId);
  process.stdin.setEncoding('utf8');
  process.stdout.write('READY\n');
  await new Promise<void>((resolve, reject) => {
    process.stdin.once('data', () => resolve());
    process.stdin.once('error', reject);
  });

  const doc = new Y.Doc();
  doc.getText('content').insert(0, text);
  const version = await applyRuntimeDocumentUpdate(roomId, Array.from(Y.encodeStateAsUpdate(doc)), { userId });
  doc.destroy();
  process.stdout.write(`DONE:${version}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Unknown worker error'}\n`);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
