const requestText = process.env.XMT_TEST_OFFICIAL_EXPORT_REQUEST;
const token = process.env.XMT_TEST_OFFICIAL_EXPORT_TOKEN;
if (!requestText || !token) throw new Error('Missing isolated official export test request');

const [{ closeDatabase }, { acceptCreatorDataSync }] = await Promise.all([
  import('../api/database/db.js'),
  import('../api/services/creatorSyncV291.js'),
]);

process.stdout.write('READY\n');
process.stdin.setEncoding('utf8');
process.stdin.once('data', async () => {
  try {
    const result = await acceptCreatorDataSync(JSON.parse(requestText), `Bearer ${token}`) as { duplicate_batch: boolean; batch_id: string };
    process.stdout.write(`RESULT:${JSON.stringify({ duplicate_batch: result.duplicate_batch, batch_id: result.batch_id })}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown official export worker error';
    process.stderr.write(`${message}\n`);
    const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
    const retryable = statusCode === 503 || /SQLITE_(BUSY|LOCKED)|database (?:is )?(?:locked|busy)/i.test(message);
    process.stdout.write(`ERROR:${JSON.stringify({ statusCode: retryable ? 503 : statusCode, message })}\n`);
    if (!retryable) process.exitCode = 1;
  } finally {
    closeDatabase();
  }
});
