import crypto from 'node:crypto';
import zlib from 'node:zlib';
import bcrypt from 'bcrypt';
import { execute, queryOne, runInTransaction } from '../database/utils.js';
import { creatorInsightService } from './creatorInsights.js';
import { persistDouyinContractV2102, persistNormalizedDouyinSync } from './douyinDataCenter.js';
import { requireCreatorAgentV1 } from './creatorAgentProtocol.js';

type JsonRecord = Record<string, unknown>;
type AgentRow = { id: number; user_id: number; platform: string; account_id: string; token_hash: string };
const text = (value: unknown, fallback = '') => value == null ? fallback : String(value);
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const json = (value: unknown) => JSON.stringify(value ?? {});
const array = (value: unknown, max: number): JsonRecord[] => Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object').slice(0, max) : [];
const key = (token: string) => crypto.createHash('sha256').update(token).digest();
const canonical = (body: JsonRecord) => [body.protocol_version, body.agent_id, body.platform, body.account_id, body.timestamp, body.nonce, body.collected_at, JSON.stringify(body.data)].join('\n');
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const metricCodes = new Set(['views','likes','comments','shares','favorites','profile_visits','followers_gained','completion_rate','five_second_completion_rate','cover_click_rate','two_second_bounce_rate','watch_time_seconds','sound_wave_amount']);
const dateKey = (value: unknown) => { const textValue = text(value); const parsed = Date.parse(textValue); return /^\d{4}-\d{2}-\d{2}(?:T|\s|$)/.test(textValue) && Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null; };
const fallbackKey = (value: unknown) => /^[a-f0-9]{64}$/i.test(text(value));

async function openEnvelope(body: JsonRecord, authorization?: string) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const agent = await queryOne<AgentRow>('SELECT id,user_id,platform,account_id,token_hash FROM creator_agents WHERE id=?', [Number(body.agent_id)]);
  if (!token || !agent || !(await bcrypt.compare(token, agent.token_hash))) throw Object.assign(new Error('Agent 身份认证失败'), { statusCode: 401 });
  if (body.platform !== agent.platform || text(body.account_id) !== agent.account_id) throw Object.assign(new Error('Agent 设备或平台账号绑定不匹配'), { statusCode: 403 });
  requireCreatorAgentV1(body, 'data-sync');
  const timestamp = Date.parse(text(body.timestamp));
  const nonce = text(body.nonce);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60_000) throw Object.assign(new Error('Agent 请求已过期或本机时间不正确'), { statusCode: 408 });
  if (!isUuid(nonce)) throw Object.assign(new Error('Agent 请求 nonce 无效'), { statusCode: 400 });
  const expected = crypto.createHmac('sha256', token).update(canonical(body)).digest('hex'); const supplied = text(body.signature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) throw Object.assign(new Error('上传签名验证失败'), { statusCode: 401 });
  try { await execute('INSERT INTO creator_agent_nonces(agent_id,nonce,request_time) VALUES(?,?,?)', [agent.id, nonce, new Date(timestamp).toISOString()]); }
  catch { throw Object.assign(new Error('检测到重复的 Agent 请求'), { statusCode: 409 }); }
  await execute("DELETE FROM creator_agent_nonces WHERE created_at < datetime('now','-1 day')");
  try { const envelope = body.data as {iv:string;tag:string;ciphertext:string}; const decipher = crypto.createDecipheriv('aes-256-gcm', key(token), Buffer.from(envelope.iv,'base64')); decipher.setAuthTag(Buffer.from(envelope.tag,'base64')); return { agent, payload: JSON.parse(decipher.update(envelope.ciphertext,'base64','utf8') + decipher.final('utf8')) as JsonRecord }; }
  catch { throw Object.assign(new Error('上传数据解密失败'), { statusCode: 400 }); }
}

async function acceptOfficialExportV2(agent: AgentRow, payload: JsonRecord, snapshotTime: string) {
  const batchId = text(payload.batch_id);
  const parserVersion = text(payload.parser_version);
  const platformAccountId = text(payload.platform_account_id);
  if (!isUuid(batchId) || !parserVersion || payload.platform !== agent.platform || platformAccountId !== agent.account_id) throw Object.assign(new Error('官方导出数据包字段或账号绑定无效'), { statusCode: 422 });
  if (!Array.isArray(payload.source_files) || payload.source_files.length < 1 || payload.source_files.length > 50) throw Object.assign(new Error('官方导出文件审计数量无效'), { statusCode: 422 });
  const sourceFiles = array(payload.source_files, 50);
  const datasets = payload.datasets && typeof payload.datasets === 'object' ? payload.datasets as JsonRecord : {};
  if ((!Array.isArray(datasets.content_metrics) && datasets.content_metrics !== undefined) || (!Array.isArray(datasets.income_metrics) && datasets.income_metrics !== undefined) || (Array.isArray(datasets.content_metrics) && datasets.content_metrics.length > 5000) || (Array.isArray(datasets.income_metrics) && datasets.income_metrics.length > 5000)) throw Object.assign(new Error('官方导出指标数量或类型无效'), { statusCode: 422 });
  const contentMetrics = array(datasets.content_metrics, 5000), incomeMetrics = array(datasets.income_metrics, 5000);
  if (sourceFiles.some(file => !/^[a-f0-9]{64}$/i.test(text(file.sha256)) || Number(file.size_bytes) < 0 || !text(file.file_type) || !text(file.file_name) || /[\\/]/.test(text(file.file_name)))) throw Object.assign(new Error('官方导出文件审计摘要无效'), { statusCode: 422 });
  const fallbackKeys = new Set<string>();
  for (const item of contentMetrics) {
    const sourceKey = text(item.platform_item_id || item.aweme_id || item.url_item_id || item.source_item_key || item.fallback_source_key);
    if (!sourceKey || !dateKey(item.published_at) || (item.fallback_source_key !== undefined && !fallbackKey(item.fallback_source_key)) || (item.fallback_source_key !== undefined && fallbackKeys.has(text(item.fallback_source_key)))) throw Object.assign(new Error('官方导出作品身份或日期无效'), { statusCode: 422 });
    if (item.fallback_source_key !== undefined) fallbackKeys.add(text(item.fallback_source_key));
    const metrics = item.metrics && typeof item.metrics === 'object' ? item.metrics as JsonRecord : null;
    if (!metrics || Object.keys(metrics).some(code => !metricCodes.has(code) || code === 'sound_wave_amount')) throw Object.assign(new Error('官方导出作品指标无效'), { statusCode: 422 });
  }
  for (const item of incomeMetrics) if (dateKey(item.metric_date) === null || text(item.metric_code) !== 'sound_wave_amount' || text(item.unit) !== 'sound_wave' || !Number.isFinite(Number(item.value))) throw Object.assign(new Error('官方导出收益指标无效'), { statusCode: 422 });
  return runInTransaction(async tx => {
    await tx.execute(`INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,status) VALUES(?,?,?,'active') ON CONFLICT(user_id,platform,platform_uid) DO NOTHING`, [agent.user_id, agent.platform, agent.account_id]);
    const account = await tx.queryOne<{id:number}>('SELECT id FROM creator_platform_accounts WHERE user_id=? AND platform=? AND platform_uid=?', [agent.user_id, agent.platform, agent.account_id]);
    if (!account) throw new Error('官方导出账号写入失败');
    const existing = await tx.queryOne<{result_json:string}>('SELECT result_json FROM creator_ingest_batches WHERE agent_id=? AND batch_id=?', [agent.id, batchId]);
    if (existing) return { success: true, batch_id: batchId, duplicate_batch: true, ...(JSON.parse(existing.result_json) as JsonRecord) };
    await tx.execute(`INSERT INTO creator_ingest_batches(agent_id,batch_id,account_id,parser_version) VALUES(?,?,?,?)`, [agent.id,batchId,account.id,parserVersion]);
    const batch = await tx.queryOne<{id:number}>('SELECT id FROM creator_ingest_batches WHERE agent_id=? AND batch_id=?', [agent.id,batchId]); if (!batch) throw new Error('批次创建失败');
    for (const file of sourceFiles) await tx.execute('INSERT INTO creator_ingest_files(batch_id,sha256,file_type,file_name,size_bytes) VALUES(?,?,?,?,?)', [batch.id,text(file.sha256),text(file.file_type),text(file.file_name),Number(file.size_bytes)]);
    let inserted=0, updated=0, unchanged=0, rejected=0;
    const store = async (sourceItemKey: string | null, metricDate: string, metricCode: string, value: unknown, unit: string, sha: string) => {
      if (!metricDate || !metricCode || value === null || value === undefined || !sha) { rejected++; return; }
      const valueText=text(value), previous=await tx.queryOne<{value_text:string}>('SELECT value_text FROM creator_official_metrics WHERE account_id=? AND source_item_key IS ? AND metric_date=? AND metric_code=?',[account.id,sourceItemKey,metricDate,metricCode]);
      if (previous?.value_text === valueText) { unchanged++; return; }
      const numeric=Number(value); await tx.execute(`INSERT INTO creator_official_metrics(account_id,source_item_key,metric_date,metric_code,value_text,value_number,unit,source_type,source_file_sha256,parser_version,collected_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,source_item_key,metric_date,metric_code) DO UPDATE SET value_text=excluded.value_text,value_number=excluded.value_number,unit=excluded.unit,source_type=excluded.source_type,source_file_sha256=excluded.source_file_sha256,parser_version=excluded.parser_version,collected_at=excluded.collected_at,updated_at=CURRENT_TIMESTAMP`,[account.id,sourceItemKey,metricDate,metricCode,valueText,Number.isFinite(numeric)?numeric:null,unit,'official_export',sha,parserVersion,snapshotTime]);
      if (previous) updated++; else inserted++;
    };
    const defaultSha=text(sourceFiles[0]?.sha256);
    for (const item of contentMetrics) { const date=dateKey(item.published_at)!; const key=text(item.platform_item_id||item.aweme_id||item.url_item_id||item.source_item_key||item.fallback_source_key); const metrics=item.metrics as JsonRecord; for(const [code,value] of Object.entries(metrics)) await store(key,date,code,value,code.includes('rate')?'ratio':'count',defaultSha); }
    for (const item of incomeMetrics) await store(null,dateKey(item.metric_date)!,text(item.metric_code),item.value,text(item.unit),defaultSha);
    const result={result:{inserted,updated,unchanged,rejected},warnings:[] as string[]}; await tx.execute('UPDATE creator_ingest_batches SET result_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[JSON.stringify(result),batch.id]);
    return {success:true,batch_id:batchId,duplicate_batch:false,...result};
  });
}

export async function acceptCreatorDataSync(body: JsonRecord, authorization?: string) {
  if (Buffer.byteLength(JSON.stringify(body)) > 12 * 1024 * 1024) throw Object.assign(new Error('同步数据包超过 12MB 限制'), { statusCode: 413 });
  const { agent, payload } = await openEnvelope(body, authorization);
  if (payload.schema_version === 2) return acceptOfficialExportV2(agent, payload, text(body.collected_at, new Date().toISOString()));
  if (payload.schema_version !== undefined && payload.schema_version !== 1) throw Object.assign(new Error('Creator Agent 数据协议版本不兼容'), { statusCode: 422 });
  if (payload.platform !== agent.platform) throw Object.assign(new Error('同步数据平台与 Agent 绑定不匹配'), { statusCode: 403 });
  const account = payload.account && typeof payload.account === 'object' ? payload.account as JsonRecord : {};
  const platformUid = text(account.platform_uid || account.uid || agent.account_id); if (platformUid !== agent.account_id) throw Object.assign(new Error('同步账号与 Agent 绑定不匹配'), { statusCode: 403 });
  const snapshotTime = text(body.collected_at, new Date().toISOString()); const syncTask = payload.sync_task && typeof payload.sync_task === 'object' ? payload.sync_task as JsonRecord : {};
  const taskId = text(syncTask.task_id, crypto.randomUUID());
  await execute(`INSERT INTO creator_sync_tasks(agent_id,task_id,start_time,platform,account,status) VALUES(?,?,?,?,?,'running') ON CONFLICT(agent_id,task_id) DO UPDATE SET status='running',start_time=excluded.start_time,end_time=NULL,error_message=NULL`, [agent.id, taskId, text(syncTask.start_time,snapshotTime), agent.platform, platformUid]);
  if (payload.contract_version === '2.10.2') {
    const modules: Record<string, 'success' | 'failed'> = { douyin_contract: 'failed' };
    const errors: Record<string, string> = {};
    let result: Awaited<ReturnType<typeof persistDouyinContractV2102>> | null = null;
    try {
      result = await persistDouyinContractV2102(agent, payload, snapshotTime, taskId);
      modules.douyin_contract = 'success';
      await execute('UPDATE creator_agents SET last_active_at=CURRENT_TIMESTAMP WHERE id=?', [agent.id]);
    } catch (error) {
      errors.douyin_contract = error instanceof Error ? error.message : String(error);
    }
    const finished = await finishTask(agent.id, taskId, modules, errors, snapshotTime, result?.creator_account_id || 0, {
      contract_version: '2.10.2',
      snapshot_id: result?.snapshot_id || text(payload.snapshot_id || syncTask.snapshot_id),
      collection_mode: text(payload.collection_mode || syncTask.collection_mode, 'full_snapshot'),
      works: result?.works || 0,
      duplicate: result?.duplicate || false,
      summary: result?.summary || {},
    });
    if (!result) throw Object.assign(new Error(errors.douyin_contract || 'v2.10.2 同步失败'), { statusCode: 400, result: finished });
    return finished;
  }
  const modules:Record<string,'success'|'failed'>={account:'failed',works:'failed',metrics:'failed',trends:'failed',account_metrics:'failed',fans:'failed',raw:'failed',page_schema:'failed',douyin_business:'failed',insights:'failed'}; const errors:Record<string,string>={};
  const attempt = async (name:string, run:()=>Promise<void>) => { try { await run(); modules[name]='success'; } catch(error) { modules[name]='failed'; errors[name]=error instanceof Error?error.message:String(error); } };
  let accountId = 0;
  await attempt('account', async()=>runInTransaction(async tx=>{await tx.execute(`INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname,avatar,account_name,status,updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,platform,platform_uid) DO UPDATE SET nickname=excluded.nickname,avatar=excluded.avatar,account_name=excluded.account_name,status=excluded.status,updated_at=CURRENT_TIMESTAMP`,[agent.user_id,agent.platform,platformUid,text(account.nickname),text(account.avatar),text(account.account_name||account.nickname),text(account.status,'active')]);const row=await tx.queryOne<{id:number}>('SELECT id FROM creator_platform_accounts WHERE user_id=? AND platform=? AND platform_uid=?',[agent.user_id,agent.platform,platformUid]);if(!row)throw new Error('账号写入失败');accountId=row.id;await tx.execute(`INSERT INTO creator_account_access(account_id,user_id,access_level) VALUES(?,?,'manage') ON CONFLICT(account_id,user_id) DO UPDATE SET access_level='manage'`,[accountId,agent.user_id]);}));
  if (!accountId) { for(const name of Object.keys(modules).filter(name=>name!=='account')) errors[name]='账号模块失败，已跳过'; return finishTask(agent.id,taskId,modules,errors,snapshotTime,accountId); }
  const contents=array(payload.contents,5000),metrics=array(payload.metrics,20000),trends=array(payload.trends,50000),rawRecords=array(payload.raw_records,10000),schemas=array(payload.page_schemas,10000);
  await attempt('works',async()=>runInTransaction(async tx=>{for(const item of contents){const itemId=text(item.platform_item_id||item.item_id);if(!itemId)continue;await tx.execute(`INSERT INTO creator_content_items(account_id,platform,platform_item_id,title,cover_url,publish_time,duration,status,raw_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,platform,platform_item_id) DO UPDATE SET title=excluded.title,cover_url=excluded.cover_url,publish_time=excluded.publish_time,duration=excluded.duration,status=excluded.status,raw_json=excluded.raw_json`,[accountId,agent.platform,itemId,text(item.title),text(item.cover_url||item.cover),text(item.publish_time||item.published_at)||null,number(item.duration),text(item.status),json(item.raw_json??item)]);}}));
  await attempt('metrics',async()=>runInTransaction(async tx=>{for(const item of metrics){const row=await tx.queryOne<{id:number}>('SELECT id FROM creator_content_items WHERE account_id=? AND platform_item_id=?',[accountId,text(item.platform_item_id||item.item_id)]);if(!row)continue;await tx.execute(`INSERT INTO creator_content_metrics(content_id,snapshot_time,play_count,like_count,comment_count,share_count,favorite_count,play_duration,completion_rate,cover_click_rate,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(content_id,snapshot_time) DO NOTHING`,[row.id,text(item.snapshot_time,snapshotTime),number(item.play_count),number(item.like_count),number(item.comment_count),number(item.share_count),number(item.favorite_count||item.collect_count),number(item.play_duration),number(item.completion_rate),number(item.cover_click_rate),json(item.raw_json??item)]);}}));
  await attempt('trends',async()=>runInTransaction(async tx=>{for(const item of trends){const row=await tx.queryOne<{id:number}>('SELECT id FROM creator_content_items WHERE account_id=? AND platform_item_id=?',[accountId,text(item.platform_item_id||item.item_id)]);if(row&&text(item.metric_name))await tx.execute('INSERT OR IGNORE INTO creator_content_trends(content_id,metric_name,metric_value,record_time) VALUES(?,?,?,?)',[row.id,text(item.metric_name),number(item.metric_value),text(item.record_time,snapshotTime)]);}}));
  const accountMetrics=payload.account_metrics&&typeof payload.account_metrics==='object'?payload.account_metrics as JsonRecord:{};
  await attempt('account_metrics',async()=>runInTransaction(async tx=>{await tx.execute(`INSERT INTO creator_account_metrics(account_id,snapshot_time,fans_count,play_count,interaction_count,profile_visit_count,growth_json,raw_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id,snapshot_time) DO NOTHING`,[accountId,text(accountMetrics.snapshot_time,snapshotTime),number(accountMetrics.fans_count),number(accountMetrics.play_count),number(accountMetrics.interaction_count),number(accountMetrics.profile_visit_count),json(accountMetrics.growth_json),json(accountMetrics.raw_json??accountMetrics)]);}));
  const fansValid=payload.fans===undefined||(Boolean(payload.fans)&&typeof payload.fans==='object'&&!Array.isArray(payload.fans));const fans=fansValid&&payload.fans?payload.fans as JsonRecord:{};
  await attempt('fans',async()=>{if(!fansValid)throw new Error('fans 模块格式无效');await runInTransaction(async tx=>{if(Object.keys(fans).length)await tx.execute(`INSERT INTO creator_fans_portraits(account_id,snapshot_time,gender_json,age_json,city_json,province_json,interest_json,active_time_json,raw_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,snapshot_time) DO NOTHING`,[accountId,text(fans.snapshot_time,snapshotTime),json(fans.gender_json||fans.gender),json(fans.age_json||fans.age),json(fans.city_json||fans.city),json(fans.province_json||fans.province),json(fans.interest_json||fans.interest),json(fans.active_time_json||fans.active_time),json(fans.raw_json??fans)]);});});
  await attempt('raw',async()=>runInTransaction(async tx=>{for(const item of rawRecords){const raw=json(item.response_json??item.response);const hash=crypto.createHash('sha256').update([agent.platform,text(item.page_type||item.page),text(item.api_url||item.url),text(item.method,'GET'),raw].join('\n')).digest('hex');const compressed=zlib.gzipSync(raw).toString('base64');await tx.execute(`INSERT OR IGNORE INTO creator_api_raw_records(user_id,agent_id,platform,page_type,api_url,method,response_json,created_at,hash,compression) VALUES(?,?,?,?,?,?,?,?,?,'gzip')`,[agent.user_id,agent.id,agent.platform,text(item.page_type||item.page,'unknown'),text(item.api_url||item.url),text(item.method,'GET').toUpperCase(),compressed,text(item.created_at||item.captured_at,snapshotTime),hash]);}}));
  await attempt('page_schema',async()=>runInTransaction(async tx=>{for(const item of schemas)await tx.execute(`INSERT INTO creator_page_schema(page,tab,api,fields,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(page,tab,api) DO UPDATE SET fields=excluded.fields,updated_at=CURRENT_TIMESTAMP`,[text(item.page),text(item.tab),text(item.api),json(item.fields)]);}));
  await attempt('douyin_business',async()=>{await persistNormalizedDouyinSync(agent,payload,snapshotTime,taskId);});
  await attempt('insights',async()=>{await creatorInsightService.generate(accountId);});
  await execute('UPDATE creator_agents SET last_active_at=CURRENT_TIMESTAMP WHERE id=?',[agent.id]);
  return finishTask(agent.id,taskId,modules,errors,snapshotTime,accountId,{contents:contents.length,metrics:metrics.length,trends:trends.length,raw_records:rawRecords.length});
}

export const acceptCreatorDataSyncV291 = acceptCreatorDataSync;

async function finishTask(agentId:number,taskId:string,modules:Record<string,'success'|'failed'>,errors:Record<string,string>,snapshotTime:string,accountId:number,counts:JsonRecord={}){const successCount=Object.values(modules).filter(v=>v==='success').length;const failedCount=Object.keys(modules).length-successCount;const status=failedCount===0?'success':successCount===0?'failed':'partial_success';await execute('UPDATE creator_sync_tasks SET end_time=CURRENT_TIMESTAMP,status=?,success_count=?,failed_count=?,error_message=?,module_status_json=? WHERE agent_id=? AND task_id=?',[status,successCount,failedCount,Object.values(errors).join('; ')||null,JSON.stringify(modules),agentId,taskId]);return{success:successCount>0,status,success_count:successCount,failed_count:failedCount,modules,errors,snapshot_time:snapshotTime,account_id:accountId,...counts};}
