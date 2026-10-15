import { closeDatabase } from '../../api/database/db.js';
import { claimCreatorSyncTask } from '../../api/services/creatorSyncV291.js';

const agentId = Number(process.env.XMT_TEST_CREATOR_AGENT_ID);
const taskId = process.env.XMT_TEST_CREATOR_TASK_ID;
const account = process.env.XMT_TEST_CREATOR_ACCOUNT;
if (!Number.isSafeInteger(agentId) || agentId < 1 || !taskId || !account) throw new Error('Missing isolated Creator Agent sync test input');

process.stdout.write('READY\n');
process.stdin.setEncoding('utf8');
process.stdin.once('data', async () => {
  try {
    await claimCreatorSyncTask(agentId, taskId, 'douyin', account, new Date().toISOString());
    process.stdout.write('CLAIMED\n');
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 503) process.stdout.write('CONFLICT\n');
    else {
      process.stderr.write(`${error instanceof Error ? error.message : 'Unknown creator sync worker error'}\n`);
      process.exitCode = 1;
    }
  } finally {
    closeDatabase();
  }
});
