import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CreatorSnapshot } from '../types.js';

export type ModuleSaveStatus = { account: 'success'|'failed'; works: 'success'|'failed'; dashboard: 'success'|'failed'; fans: 'success'|'failed'; raw: 'success'|'failed'; errors: Record<string,string> };
export type SyncTaskStatus = 'running'|'success'|'partial_success'|'failed';

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
  }
  knownContentIds(){return new Set((this.db.prepare('SELECT item_id FROM creator_works').all() as Array<{item_id:string}>).map((row) => String(row.item_id)));}
  startSyncTask(taskId:string,platform:string,account:string,startTime:string){this.db.prepare('INSERT INTO sync_tasks(task_id,start_time,platform,account,status) VALUES(?,?,?,?,?)').run(taskId,startTime,platform,account,'running');}
  finishSyncTask(taskId:string,status:SyncTaskStatus,successCount:number,failedCount:number,errorMessage?:string){this.db.prepare('UPDATE sync_tasks SET end_time=?,status=?,success_count=?,failed_count=?,error_message=? WHERE task_id=?').run(new Date().toISOString(),status,successCount,failedCount,errorMessage||null,taskId);}
  private attempt(status:ModuleSaveStatus, module:Exclude<keyof ModuleSaveStatus,'errors'>, run:()=>void) {
    try { this.db.exec('BEGIN IMMEDIATE'); run(); this.db.exec('COMMIT'); status[module]='success'; }
    catch(error) { try { this.db.exec('ROLLBACK'); } catch {} status[module]='failed'; status.errors[module]=error instanceof Error?error.message:String(error); }
  }
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
        work.run(itemId,item.title,item.published_at||'',item.cover||'',item.status||'',JSON.stringify(item.raw||item),snapshot.collected_at);
        stat.run(itemId,snapshot.collected_at,JSON.stringify(item.metrics),JSON.stringify(snapshot.work_details.find((detail)=>String(detail.item_id)===itemId)||null),snapshot.snapshot_id);
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
  close(){this.db.close();}
}
