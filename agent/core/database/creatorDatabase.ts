import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CreatorSnapshot } from '../types.js';

export type ModuleSaveStatus = { account: 'success'|'failed'; works: 'success'|'failed'; dashboard: 'success'|'failed'; fans: 'success'|'failed'; raw: 'success'|'failed'; errors: Record<string,string> };
export type SyncTaskStatus = 'running'|'success'|'partial_success'|'failed';
export type UploadQueueStatus = 'pending'|'uploading'|'succeeded'|'retryable_failed'|'permanent_failed';
export type UploadQueueJob = { job_id:string; batch_id:string; platform:string; platform_account_id:string; source_file_sha256:string; parser_version:string; payload_json:string; payload_sha256:string; status:UploadQueueStatus; attempt_count:number; next_retry_at:string|null; last_error_code:string|null; last_error_message_sanitized:string|null; receipt_json:string|null; created_at:string; updated_at:string; succeeded_at:string|null };

export class CreatorDatabase {
  private readonly db: DatabaseSync;
  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.initialize();
  }
  private columns(table: string) {
    return new Set((this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{name:string}>).map((row) => row.name));
  }
  private ensureColumns(table: string, columns: Array<[string,string]>) {
    const existing = this.columns(table);
    for (const [name, type] of columns) if (!existing.has(name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
  private initialize() {
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS creator_accounts(id INTEGER PRIMARY KEY,platform TEXT,account_uid TEXT,nickname TEXT,avatar TEXT,fans_count INTEGER,raw_json TEXT,collected_at TEXT,snapshot_id TEXT);
      CREATE TABLE IF NOT EXISTS creator_works(id INTEGER PRIMARY KEY,item_id TEXT UNIQUE,title TEXT,published_at TEXT,cover TEXT,status TEXT,raw_json TEXT,updated_at TEXT);
      CREATE TABLE IF NOT EXISTS creator_work_statistics(id INTEGER PRIMARY KEY,item_id TEXT,snapshot_time TEXT,statistics_json TEXT,raw_json TEXT,snapshot_id TEXT);
      CREATE TABLE IF NOT EXISTS creator_dashboard_statistics(id INTEGER PRIMARY KEY,snapshot_time TEXT,range_key TEXT,statistics_json TEXT,snapshot_id TEXT);
      CREATE TABLE IF NOT EXISTS creator_fans_statistics(id INTEGER PRIMARY KEY,snapshot_time TEXT,statistics_json TEXT,snapshot_id TEXT);
      CREATE TABLE IF NOT EXISTS creator_fans_snapshots(id INTEGER PRIMARY KEY,account_id TEXT,snapshot_time TEXT,fans_count INTEGER DEFAULT 0,raw_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,snapshot_id TEXT);
      CREATE TABLE IF NOT EXISTS creator_raw_snapshots(id INTEGER PRIMARY KEY,snapshot_time TEXT,source TEXT,raw_json TEXT,snapshot_id TEXT);
      CREATE TABLE IF NOT EXISTS upload_queue(job_id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,platform TEXT NOT NULL,platform_account_id TEXT NOT NULL,source_file_sha256 TEXT NOT NULL,parser_version TEXT NOT NULL,payload_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','uploading','succeeded','retryable_failed','permanent_failed')),attempt_count INTEGER NOT NULL DEFAULT 0,next_retry_at TEXT,last_error_code TEXT,last_error_message_sanitized TEXT,receipt_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,succeeded_at TEXT,UNIQUE(platform,platform_account_id,source_file_sha256,parser_version));
      CREATE TABLE IF NOT EXISTS sync_tasks(task_id TEXT PRIMARY KEY,start_time TEXT NOT NULL,end_time TEXT,platform TEXT NOT NULL,account TEXT NOT NULL,status TEXT NOT NULL,success_count INTEGER DEFAULT 0,failed_count INTEGER DEFAULT 0,error_message TEXT);`);
    this.ensureColumns('creator_accounts', [['snapshot_id','TEXT']]);
    this.ensureColumns('creator_work_statistics', [['snapshot_id','TEXT']]);
    this.ensureColumns('creator_dashboard_statistics', [['snapshot_id','TEXT']]);
    this.ensureColumns('creator_fans_statistics', [['snapshot_id','TEXT']]);
    this.ensureColumns('creator_fans_snapshots', [['account_id','TEXT'],['snapshot_time','TEXT'],['fans_count','INTEGER DEFAULT 0'],['raw_json','TEXT'],['created_at','TEXT'],['snapshot_id','TEXT']]);
    this.ensureColumns('creator_raw_snapshots', [['snapshot_id','TEXT']]);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_work_stats_item_time ON creator_work_statistics(item_id,snapshot_time);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_accounts_snapshot ON creator_accounts(snapshot_id) WHERE snapshot_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_work_stats_snapshot_item ON creator_work_statistics(snapshot_id,item_id) WHERE snapshot_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_snapshot_range ON creator_dashboard_statistics(snapshot_id,range_key) WHERE snapshot_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fans_statistics_snapshot ON creator_fans_statistics(snapshot_id) WHERE snapshot_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fans_snapshot_account ON creator_fans_snapshots(snapshot_id,account_id) WHERE snapshot_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_snapshot_source ON creator_raw_snapshots(snapshot_id,source) WHERE snapshot_id IS NOT NULL;`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_upload_queue_due ON upload_queue(status,next_retry_at,created_at);`);
  }
  knownContentIds(){return new Set((this.db.prepare('SELECT item_id FROM creator_works').all() as Array<{item_id:string}>).map((row) => String(row.item_id)));}
  startSyncTask(taskId:string,platform:string,account:string,startTime:string){this.db.prepare('INSERT INTO sync_tasks(task_id,start_time,platform,account,status) VALUES(?,?,?,?,?)').run(taskId,startTime,platform,account,'running');}
  finishSyncTask(taskId:string,status:SyncTaskStatus,successCount:number,failedCount:number,errorMessage?:string){this.db.prepare('UPDATE sync_tasks SET end_time=?,status=?,success_count=?,failed_count=?,error_message=? WHERE task_id=?').run(new Date().toISOString(),status,successCount,failedCount,errorMessage||null,taskId);}
  private attempt(status:ModuleSaveStatus, module:Exclude<keyof ModuleSaveStatus,'errors'>, run:()=>void) {
    try { this.db.exec('BEGIN IMMEDIATE'); run(); this.db.exec('COMMIT'); status[module]='success'; }
    catch(error) { try { this.db.exec('ROLLBACK'); } catch {} status[module]='failed'; status.errors[module]=error instanceof Error?error.message:String(error); }
  }
  private text(value: unknown) { if (value === null || value === undefined) return ''; return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value); }
  private json(value: unknown) { return JSON.stringify(value ?? null); }
  save(snapshot:CreatorSnapshot):ModuleSaveStatus {
    const status:ModuleSaveStatus={account:'failed',works:'failed',dashboard:'failed',fans:'failed',raw:'failed',errors:{}};
    const knownContentIds=this.knownContentIds();
    snapshot.collection_stats.new_count=snapshot.works.filter((item)=>!knownContentIds.has(String(item.item_id))).length;
    this.attempt(status,'account',()=>this.db.prepare('INSERT OR IGNORE INTO creator_accounts(platform,account_uid,nickname,avatar,fans_count,raw_json,collected_at,snapshot_id) VALUES(?,?,?,?,?,?,?,?)').run(snapshot.platform,String(snapshot.account.uid),snapshot.account.nickname,snapshot.account.avatar,snapshot.account.fans_count,JSON.stringify(snapshot.account),snapshot.collected_at,snapshot.snapshot_id));
    this.attempt(status,'works',()=>{
      const work=this.db.prepare('INSERT INTO creator_works(item_id,title,published_at,cover,status,raw_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET title=excluded.title,published_at=excluded.published_at,cover=excluded.cover,status=excluded.status,raw_json=excluded.raw_json,updated_at=excluded.updated_at');
      const stat=this.db.prepare('INSERT OR IGNORE INTO creator_work_statistics(item_id,snapshot_time,statistics_json,raw_json,snapshot_id) VALUES(?,?,?,?,?)');
      for(const item of snapshot.works){
        const itemId=String(item.item_id);
        work.run(itemId,this.text(item.title),this.text(item.published_at),this.text(item.cover),this.text(item.status),this.json(item.raw ?? item),this.text(snapshot.collected_at));
        stat.run(itemId,this.text(snapshot.collected_at),this.json(item.metrics),this.json(snapshot.work_details.find((detail)=>String(detail.item_id)===itemId)),this.text(snapshot.snapshot_id));
      }
    });
    this.attempt(status,'dashboard',()=>this.db.prepare('INSERT OR IGNORE INTO creator_dashboard_statistics(snapshot_time,range_key,statistics_json,snapshot_id) VALUES(?,?,?,?)').run(snapshot.collected_at,'all',JSON.stringify({dashboard:snapshot.dashboard,content_analysis:snapshot.content_analysis}),snapshot.snapshot_id));
    this.attempt(status,'fans',()=>{
      this.db.prepare('INSERT OR IGNORE INTO creator_fans_snapshots(account_id,snapshot_time,fans_count,raw_json,created_at,snapshot_id) VALUES(?,?,?,?,?,?)').run(String(snapshot.account.uid),snapshot.collected_at,snapshot.account.fans_count,JSON.stringify(snapshot.fans),snapshot.collected_at,snapshot.snapshot_id);
      this.db.prepare('INSERT OR IGNORE INTO creator_fans_statistics(snapshot_time,statistics_json,snapshot_id) VALUES(?,?,?)').run(snapshot.collected_at,JSON.stringify(snapshot.fans),snapshot.snapshot_id);
    });
    this.attempt(status,'raw',()=>this.db.prepare('INSERT OR IGNORE INTO creator_raw_snapshots(snapshot_time,source,raw_json,snapshot_id) VALUES(?,?,?,?)').run(snapshot.collected_at,snapshot.source,JSON.stringify(snapshot.raw),snapshot.snapshot_id));
    return status;
  }
  snapshotCounts(){
    const tables=['creator_accounts','creator_works','creator_work_statistics','creator_dashboard_statistics','creator_fans_statistics','creator_fans_snapshots','creator_raw_snapshots'];
    return Object.fromEntries(tables.map((table)=>[table,Number((this.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get() as {count:number}).count)]));
  }
  enqueueUpload(input: Omit<UploadQueueJob,'job_id'|'status'|'attempt_count'|'next_retry_at'|'last_error_code'|'last_error_message_sanitized'|'receipt_json'|'created_at'|'updated_at'|'succeeded_at'>) {
    const now=new Date().toISOString(), jobId=crypto.randomUUID();
    const existing=this.db.prepare('SELECT job_id FROM upload_queue WHERE platform=? AND platform_account_id=? AND source_file_sha256=? AND parser_version=?').get(input.platform,input.platform_account_id,input.source_file_sha256,input.parser_version) as {job_id:string}|undefined;
    if(existing)return {job_id:existing.job_id,created:false};
    this.db.prepare('INSERT INTO upload_queue(job_id,batch_id,platform,platform_account_id,source_file_sha256,parser_version,payload_json,payload_sha256,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(jobId,input.batch_id,input.platform,input.platform_account_id,input.source_file_sha256,input.parser_version,input.payload_json,input.payload_sha256,'pending',now,now); return {job_id:jobId,created:true};
  }
  recoverUploading(leaseMs=5*60_000, now=Date.now()){return this.db.prepare("UPDATE upload_queue SET status='retryable_failed',next_retry_at=?,updated_at=?,last_error_code='INTERRUPTED',last_error_message_sanitized='Agent upload lease expired' WHERE status='uploading' AND updated_at<=?").run(new Date(now).toISOString(),new Date(now).toISOString(),new Date(now-leaseMs).toISOString()).changes;}
  claimNextUpload(now=new Date().toISOString(), maxAttempts=8):UploadQueueJob|undefined { this.db.exec('BEGIN IMMEDIATE'); try { const row=this.db.prepare("SELECT * FROM upload_queue WHERE status IN ('pending','retryable_failed') AND attempt_count<? AND (next_retry_at IS NULL OR next_retry_at<=?) ORDER BY created_at LIMIT 1").get(maxAttempts,now) as UploadQueueJob|undefined; if(row){const changed=this.db.prepare("UPDATE upload_queue SET status='uploading',attempt_count=attempt_count+1,updated_at=? WHERE job_id=? AND status IN ('pending','retryable_failed')").run(now,row.job_id).changes;if(!changed){this.db.exec('COMMIT');return undefined;}} this.db.exec('COMMIT'); return row; } catch(error){this.db.exec('ROLLBACK');throw error;} }
  finishUpload(jobId:string,receipt:unknown){const now=new Date().toISOString();this.db.prepare("UPDATE upload_queue SET status='succeeded',receipt_json=?,succeeded_at=?,updated_at=?,last_error_code=NULL,last_error_message_sanitized=NULL WHERE job_id=?").run(this.json(receipt),now,now,jobId);}
  failUpload(jobId:string,status:Extract<UploadQueueStatus,'retryable_failed'|'permanent_failed'>,code:string,message:string,nextRetryAt?:string){this.db.prepare('UPDATE upload_queue SET status=?,next_retry_at=?,last_error_code=?,last_error_message_sanitized=?,updated_at=? WHERE job_id=?').run(status,nextRetryAt||null,code,message.replace(/[\r\n]/g,' ').slice(0,240),new Date().toISOString(),jobId);}
  uploadJob(jobId:string){return this.db.prepare('SELECT * FROM upload_queue WHERE job_id=?').get(jobId) as UploadQueueJob|undefined;}
  close(){this.db.close();}
}
