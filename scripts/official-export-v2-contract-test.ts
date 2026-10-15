import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = mkdtempSync(path.join(tmpdir(), 'xmt-official-export-'));
const databasePath = path.join(root, 'test.db');
process.env.XMT_DB_PATH = databasePath; process.env.NODE_ENV = 'test';
const { db, initDatabase } = await import('../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../api/database/utils.js');
const { acceptCreatorDataSync } = await import('../api/services/creatorSyncV291.js');
await initDatabase();
const token = 'official-export-v2-contract-token';
await execute('INSERT INTO creator_agents(id,user_id,platform,account_id,device_id,token_hash,encryption_key_hash) VALUES(?,?,?,?,?,?,?)', [801,1,'douyin','export-account','export-device',await bcrypt.hash(token,4),crypto.createHash('sha256').update(token).digest('hex')]);
const creatorAccountId = await executeInsert("INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,status) VALUES(1,'douyin','export-account','active')");
const contentId = await executeInsert("INSERT INTO creator_content_items(account_id,platform,platform_item_id,title,publish_time,raw_json) VALUES(?,'douyin','work-id','脱敏作品','2026-08-27T00:00:00.000Z','{}')", [creatorAccountId]);
const douyinAccountId = await executeInsert("INSERT INTO douyin_accounts(name,profile_url,douyin_uid,creator_account_id,fans_count,fans_count_available) VALUES('脱敏账号','','export-account',?,2163,1)", [creatorAccountId]);
await execute("INSERT INTO douyin_works(content_id,account_id,aweme_id,title,publish_time,play_count,like_count) VALUES(?,?, 'work-id','脱敏作品','2026-08-27T00:00:00.000Z',80,1)", [contentId,douyinAccountId]);
function envelope(payload: Record<string, unknown>, collectedAt='2026-08-28T00:00:00.000Z') {
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',crypto.createHash('sha256').update(token).digest(),iv), ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload)),cipher.final()]);
  const body: Record<string, unknown>={protocol_version:1,agent_id:801,platform:'douyin',account_id:'export-account',timestamp:new Date().toISOString(),nonce:crypto.randomUUID(),collected_at:collectedAt,data:{iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}};
  body.signature=crypto.createHmac('sha256',token).update([body.protocol_version,body.agent_id,body.platform,body.account_id,body.timestamp,body.nonce,body.collected_at,JSON.stringify(body.data)].join('\n')).digest('hex'); return body;
}
const batch=crypto.randomUUID(), sha='a'.repeat(64);
const isoDate = (offset: number) => new Date(Date.UTC(2026,7,27 + offset)).toISOString().slice(0,10);
const periodRows = (period: 'yesterday'|'7d'|'30d', count: number) => Array.from({length:count}, (_, index) => ({metric_date:isoDate(index-count+1),period,metrics:{posts:index===count-1?1:0,views:100+index,comments:index===count-1?-9:index,five_second_completion_rate:.5}}));
const payload={schema_version:2,batch_id:batch,agent_version:'2.14.0-agent',parser_version:'douyin-export-v3',platform:'douyin',platform_account_id:'export-account',generated_at:'2026-08-28T00:00:00.000Z',source_files:[
  {file_type:'official_export',dataset_type:'content_list',period:null,file_name:'作品列表.xlsx',sha256:sha,size_bytes:42,downloaded_at:'2026-08-28T00:00:00.000Z'},
  {file_type:'official_export',dataset_type:'account_daily',period:'yesterday',file_name:'昨天.xlsx',sha256:'b'.repeat(64),size_bytes:42,downloaded_at:'2026-08-28T00:00:00.000Z'},
  {file_type:'official_export',dataset_type:'account_daily',period:'7d',file_name:'近7天.xlsx',sha256:'c'.repeat(64),size_bytes:42,downloaded_at:'2026-08-28T00:00:00.000Z'},
  {file_type:'official_export',dataset_type:'account_daily',period:'30d',file_name:'近30天.xlsx',sha256:'d'.repeat(64),size_bytes:42,downloaded_at:'2026-08-28T00:00:00.000Z'},
],datasets:{content_metrics:[{source_item_key:'work-key',title:'脱敏作品',published_at:'2026-08-27T00:00:00.000Z',metrics:{views:100,likes:2}}],account_daily_metrics:[...periodRows('yesterday',1),...periodRows('7d',7),...periodRows('30d',30)],income_metrics:[{metric_date:'2026-08-27',metric_code:'sound_wave_amount',value:'12',unit:'sound_wave'}]},quality:{source_rows:40,accepted_rows:40,duplicate_rows:0,rejected_rows:0,warnings:[]}};

function startConcurrentWorker(request: Record<string, unknown>) {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDirectory, '..');
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(scriptDirectory, 'official-export-v2-worker.ts')], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH || '',
      NODE_ENV: 'test',
      XMT_DB_PATH: databasePath,
      XMT_TEST_OFFICIAL_EXPORT_TOKEN: token,
      XMT_TEST_OFFICIAL_EXPORT_REQUEST: JSON.stringify(request),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  type WorkerResult =
    | { type: 'imported'; duplicate_batch: boolean; batch_id: string }
    | { type: 'retryable'; statusCode: number; message: string };
  let resolveResult!: (value: WorkerResult) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<WorkerResult>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const exit = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else {
        const error = new Error(`Official export worker exited with ${code}: ${stderr}`);
        rejectReady(error);
        rejectResult(error);
        reject(error);
      }
    });
  });
  lines.on('line', (line) => {
    if (line === 'READY') resolveReady();
    if (line.startsWith('RESULT:')) resolveResult({ type: 'imported', ...JSON.parse(line.slice('RESULT:'.length)) as { duplicate_batch: boolean; batch_id: string } });
    if (line.startsWith('ERROR:')) resolveResult({ type: 'retryable', ...JSON.parse(line.slice('ERROR:'.length)) as { statusCode: number; message: string } });
  });
  return { child, lines, ready, result, exit };
}

async function verifyConcurrentBatchIdempotency() {
  const concurrentPayload = { ...payload, batch_id: crypto.randomUUID() };
  // Each process receives a separately authenticated envelope, while the stable
  // batch ID and payload are identical. This models two API instances receiving
  // a legitimate retry at nearly the same time.
  const requests = [envelope(concurrentPayload), envelope(concurrentPayload)];
  const workers = requests.map(startConcurrentWorker);
  let timeout: NodeJS.Timeout | undefined;
  const withTimeout = <T>(promise: Promise<T>, stage: string) => Promise.race([
    promise,
    new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error(`Official export workers ${stage} timed out`)), 20_000); }),
  ]);
  try {
    await withTimeout(Promise.all(workers.map((worker) => worker.ready)), 'readiness');
    if (timeout) clearTimeout(timeout);
    for (const worker of workers) worker.child.stdin.end('go\n');
    const results = await withTimeout(Promise.all(workers.map((worker) => worker.result)), 'import');
    if (timeout) clearTimeout(timeout);
    await withTimeout(Promise.all(workers.map((worker) => worker.exit)), 'shutdown');
    if (timeout) clearTimeout(timeout);
    const duplicateFlags: boolean[] = [];
    for (const result of results) {
      if (result.type === 'imported') {
        assert.equal(result.batch_id, concurrentPayload.batch_id);
        duplicateFlags.push(result.duplicate_batch);
        continue;
      }
      assert.equal(result.statusCode, 503, `only an explicitly retryable contention response is acceptable, got: ${result.message}`);
      const retry = await acceptCreatorDataSync(envelope(concurrentPayload), `Bearer ${token}`) as { duplicate_batch: boolean; batch_id: string };
      assert.equal(retry.batch_id, concurrentPayload.batch_id);
      duplicateFlags.push(retry.duplicate_batch);
    }
    assert.deepEqual(duplicateFlags.sort(), [false, true], 'concurrent replay across independent processes imports a batch once; any contention response can be retried with a fresh nonce and stable batch ID');
    assert.equal((await queryOne<{count:number}>('SELECT COUNT(*) count FROM creator_ingest_batches WHERE batch_id=?', [concurrentPayload.batch_id]))?.count, 1, 'one batch row is committed across both API processes');
  } catch (error) {
    for (const worker of workers) worker.child.kill('SIGTERM');
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    for (const worker of workers) worker.lines.close();
  }
}

const first=await acceptCreatorDataSync(envelope(payload),`Bearer ${token}`) as { duplicate_batch:boolean; result:{inserted:number;daily_inserted:number} }; assert.equal(first.duplicate_batch,false); assert.equal(first.result.inserted,3); assert.equal(first.result.daily_inserted,152);
assert.equal((await queryOne<{play_count:number}>('SELECT play_count FROM douyin_works WHERE aweme_id=?',['work-id']))?.play_count,100,'官方导出应校准完全匹配作品的播放量');
assert.deepEqual(
  await queryOne<{source_type:string;source_file_sha256:string;has_play_count:number;has_like_count:number;has_comment_count:number;has_share_count:number}>(
    `SELECT source_type,source_file_sha256,has_play_count,has_like_count,has_comment_count,has_share_count
     FROM douyin_work_snapshots WHERE work_id=(SELECT id FROM douyin_works WHERE aweme_id='work-id') ORDER BY id DESC LIMIT 1`,
  ),
  { source_type:'douyin_official_export',source_file_sha256:sha,has_play_count:1,has_like_count:1,has_comment_count:0,has_share_count:0 },
  'official import records its file provenance and only marks columns present in the source as observed',
);
assert.equal((await queryOne<{play_count:number}>('SELECT play_count FROM creator_content_metrics WHERE content_id=? ORDER BY id DESC LIMIT 1',[contentId]))?.play_count,100,'统一内容指标应使用官方导出值');
assert.deepEqual(await queryOne<{fans_count:number;fans_count_available:number;play_count:number}>('SELECT fans_count,fans_count_available,play_count FROM douyin_daily_snapshots WHERE account_id=?',[douyinAccountId]), {fans_count:0,fans_count_available:0,play_count:100,}, '仅官方作品导出不能把旧粉丝总量伪装为当天实测值');
await execute('UPDATE douyin_daily_snapshots SET fans_count=2163,fans_count_available=1 WHERE account_id=?',[douyinAccountId]);
const second=await acceptCreatorDataSync(envelope(payload),`Bearer ${token}`) as { duplicate_batch:boolean; result:{inserted:number} }; assert.equal(second.duplicate_batch,true); assert.equal(second.result.inserted,3);
const unchangedPayload={...payload,batch_id:crypto.randomUUID()}; const unchanged=await acceptCreatorDataSync(envelope(unchangedPayload),`Bearer ${token}`) as { result:{unchanged:number;daily_unchanged:number} }; assert.equal(unchanged.result.unchanged,3); assert.equal(unchanged.result.daily_unchanged,152);
assert.equal((await queryOne<{fans_count:number;fans_count_available:number}>('SELECT fans_count,fans_count_available FROM douyin_daily_snapshots WHERE account_id=?',[douyinAccountId]))?.fans_count,2163,'同一天已有真实粉丝观测时，后续官方导出必须保留该值');
const refreshedSha='e'.repeat(64); const refreshedPayload={...payload,batch_id:crypto.randomUUID(),source_files:payload.source_files.map((file,index)=>index===0?{...file,sha256:refreshedSha}:file)}; const refreshed=await acceptCreatorDataSync(envelope(refreshedPayload),`Bearer ${token}`) as { result:{unchanged:number} }; assert.equal(refreshed.result.unchanged,3);
assert.equal((await queryOne<{count:number}>('SELECT COUNT(*) count FROM creator_official_metrics WHERE source_file_sha256=?',[refreshedSha]))?.count,3,'相同指标也必须更新到最新官方文件来源，避免已移除作品继续累计');
await assert.rejects(()=>acceptCreatorDataSync(envelope({...payload,batch_id:crypto.randomUUID(),datasets:{...payload.datasets,content_metrics:[{...payload.datasets.content_metrics[0],metrics:{untrusted_metric:1}}]}}),`Bearer ${token}`),{statusCode:422});
await assert.rejects(()=>acceptCreatorDataSync(envelope({...payload,batch_id:crypto.randomUUID(),source_files:[...payload.source_files,...payload.source_files]}),`Bearer ${token}`)); assert.equal((await queryOne<{count:number}>('SELECT COUNT(*) count FROM creator_ingest_batches'))?.count,3);
const count=await queryOne<{count:number}>('SELECT COUNT(*) count FROM creator_official_metrics'); assert.equal(count?.count,3);
assert.equal((await queryOne<{count:number}>('SELECT COUNT(*) count FROM creator_official_daily_metrics'))?.count,152);
assert.equal((await queryOne<{value_number:number}>("SELECT value_number FROM creator_official_daily_metrics WHERE source_period='yesterday' AND metric_code='comments'"))?.value_number,-9);
const newestPayload={...payload,batch_id:crypto.randomUUID(),datasets:{...payload.datasets,content_metrics:[{...payload.datasets.content_metrics[0],metrics:{views:200,likes:2}}]}};
await acceptCreatorDataSync(envelope(newestPayload,'2026-08-30T00:00:00.000Z'),`Bearer ${token}`);
const stalePayload={...payload,batch_id:crypto.randomUUID(),datasets:{...payload.datasets,content_metrics:[{...payload.datasets.content_metrics[0],metrics:{views:50,likes:2}}]}};
const stale=await acceptCreatorDataSync(envelope(stalePayload,'2026-08-29T00:00:00.000Z'),`Bearer ${token}`) as {result:{stale_ignored:number}};
assert(stale.result.stale_ignored > 0);
assert.equal((await queryOne<{play_count:number}>('SELECT play_count FROM douyin_works WHERE aweme_id=?',['work-id']))?.play_count,200,'较旧官方批次不得回写当前作品指标');
await verifyConcurrentBatchIdempotency();
console.log('官方导出 v3 契约通过：四文件完整性、精确周期、负值修正、AES-GCM/HMAC/nonce、幂等入库与双进程并发批次去重。'); db.close(); rmSync(root,{recursive:true,force:true});
