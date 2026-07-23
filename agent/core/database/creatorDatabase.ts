import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CreatorSnapshot } from '../types.js';

export type ModuleSaveStatus = { account: 'success'|'failed'; works: 'success'|'failed'; dashboard: 'success'|'failed'; fans: 'success'|'failed'; raw: 'success'|'failed'; errors: Record<string,string> };

export class CreatorDatabase {
  private readonly db: DatabaseSync;
  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.initialize();
  }
  private initialize() {
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS creator_accounts(id INTEGER PRIMARY KEY,platform TEXT,account_uid TEXT,nickname TEXT,avatar TEXT,fans_count INTEGER,raw_json TEXT,collected_at TEXT);
      CREATE TABLE IF NOT EXISTS creator_works(id INTEGER PRIMARY KEY,item_id TEXT UNIQUE,title TEXT,published_at TEXT,cover TEXT,status TEXT,raw_json TEXT,updated_at TEXT);
      CREATE TABLE IF NOT EXISTS creator_work_statistics(id INTEGER PRIMARY KEY,item_id TEXT,snapshot_time TEXT,statistics_json TEXT,raw_json TEXT);
      CREATE TABLE IF NOT EXISTS creator_dashboard_statistics(id INTEGER PRIMARY KEY,snapshot_time TEXT,range_key TEXT,statistics_json TEXT);
      CREATE TABLE IF NOT EXISTS creator_fans_statistics(id INTEGER PRIMARY KEY,snapshot_time TEXT,statistics_json TEXT);
      CREATE TABLE IF NOT EXISTS creator_fans_snapshots(id INTEGER PRIMARY KEY,account_id TEXT,snapshot_time TEXT,fans_count INTEGER DEFAULT 0,raw_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS creator_raw_snapshots(id INTEGER PRIMARY KEY,snapshot_time TEXT,source TEXT,raw_json TEXT);
      CREATE INDEX IF NOT EXISTS idx_work_stats_item_time ON creator_work_statistics(item_id,snapshot_time);`);
    const columns = new Set((this.db.prepare('PRAGMA table_info(creator_fans_snapshots)').all() as Array<{name:string}>).map(row=>row.name));
    const migrations: Array<[string,string]> = [['account_id','TEXT'],['snapshot_time','TEXT'],['fans_count','INTEGER DEFAULT 0'],['raw_json','TEXT'],['created_at','TEXT']];
    for (const [name,type] of migrations) if (!columns.has(name)) this.db.exec(`ALTER TABLE creator_fans_snapshots ADD COLUMN ${name} ${type}`);
  }
  private attempt(status:ModuleSaveStatus, module:Exclude<keyof ModuleSaveStatus,'errors'>, run:()=>void) {
    try { this.db.exec('BEGIN IMMEDIATE'); run(); this.db.exec('COMMIT'); status[module]='success'; }
    catch(error) { try { this.db.exec('ROLLBACK'); } catch {} status[module]='failed'; status.errors[module]=error instanceof Error?error.message:String(error); }
  }
  save(s:CreatorSnapshot):ModuleSaveStatus {
    const status:ModuleSaveStatus={account:'failed',works:'failed',dashboard:'failed',fans:'failed',raw:'failed',errors:{}};
    this.attempt(status,'account',()=>this.db.prepare('INSERT INTO creator_accounts(platform,account_uid,nickname,avatar,fans_count,raw_json,collected_at) VALUES(?,?,?,?,?,?,?)').run(s.platform,s.account.uid,s.account.nickname,s.account.avatar,s.account.fans_count,JSON.stringify(s.account),s.collected_at));
    this.attempt(status,'works',()=>{const work=this.db.prepare('INSERT INTO creator_works(item_id,title,published_at,cover,status,raw_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET title=excluded.title,published_at=excluded.published_at,cover=excluded.cover,status=excluded.status,raw_json=excluded.raw_json,updated_at=excluded.updated_at');const stat=this.db.prepare('INSERT INTO creator_work_statistics(item_id,snapshot_time,statistics_json,raw_json) VALUES(?,?,?,?)');for(const w of s.works){work.run(w.item_id,w.title,w.published_at||'',w.cover||'',w.status||'',JSON.stringify(w.raw||w),s.collected_at);stat.run(w.item_id,s.collected_at,JSON.stringify(w),JSON.stringify(s.work_details.find(d=>d.item_id===w.item_id)||null));}});
    this.attempt(status,'dashboard',()=>this.db.prepare('INSERT INTO creator_dashboard_statistics(snapshot_time,range_key,statistics_json) VALUES(?,?,?)').run(s.collected_at,'all',JSON.stringify({dashboard:s.dashboard,content_analysis:s.content_analysis})));
    this.attempt(status,'fans',()=>{this.db.prepare('INSERT INTO creator_fans_snapshots(account_id,snapshot_time,fans_count,raw_json,created_at) VALUES(?,?,?,?,?)').run(s.account.uid,s.collected_at,s.account.fans_count,JSON.stringify(s.fans),s.collected_at);this.db.prepare('INSERT INTO creator_fans_statistics(snapshot_time,statistics_json) VALUES(?,?)').run(s.collected_at,JSON.stringify(s.fans));});
    this.attempt(status,'raw',()=>this.db.prepare('INSERT INTO creator_raw_snapshots(snapshot_time,source,raw_json) VALUES(?,?,?)').run(s.collected_at,s.source,JSON.stringify(s.raw)));
    return status;
  }
  close(){this.db.close();}
}
