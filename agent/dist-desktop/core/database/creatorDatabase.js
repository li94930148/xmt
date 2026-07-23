"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatorDatabase = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_sqlite_1 = require("node:sqlite");
class CreatorDatabase {
    db;
    constructor(file) { node_fs_1.default.mkdirSync(node_path_1.default.dirname(file), { recursive: true }); this.db = new node_sqlite_1.DatabaseSync(file); this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS creator_accounts(id INTEGER PRIMARY KEY,platform TEXT,account_uid TEXT,nickname TEXT,avatar TEXT,fans_count INTEGER,raw_json TEXT,collected_at TEXT); CREATE TABLE IF NOT EXISTS creator_works(id INTEGER PRIMARY KEY,item_id TEXT UNIQUE,title TEXT,published_at TEXT,cover TEXT,status TEXT,raw_json TEXT,updated_at TEXT); CREATE TABLE IF NOT EXISTS creator_work_statistics(id INTEGER PRIMARY KEY,item_id TEXT,snapshot_time TEXT,statistics_json TEXT,raw_json TEXT); CREATE TABLE IF NOT EXISTS creator_dashboard_statistics(id INTEGER PRIMARY KEY,snapshot_time TEXT,range_key TEXT,statistics_json TEXT); CREATE TABLE IF NOT EXISTS creator_fans_statistics(id INTEGER PRIMARY KEY,snapshot_time TEXT,statistics_json TEXT); CREATE TABLE IF NOT EXISTS creator_raw_snapshots(id INTEGER PRIMARY KEY,snapshot_time TEXT,source TEXT,raw_json TEXT); CREATE INDEX IF NOT EXISTS idx_work_stats_item_time ON creator_work_statistics(item_id,snapshot_time);`); }
    save(s) { this.db.exec('BEGIN IMMEDIATE'); try {
        this.db.prepare('INSERT INTO creator_accounts(platform,account_uid,nickname,avatar,fans_count,raw_json,collected_at) VALUES(?,?,?,?,?,?,?)').run(s.platform, s.account.uid, s.account.nickname, s.account.avatar, s.account.fans_count, JSON.stringify(s.account), s.collected_at);
        const work = this.db.prepare('INSERT INTO creator_works(item_id,title,published_at,cover,status,raw_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET title=excluded.title,published_at=excluded.published_at,cover=excluded.cover,status=excluded.status,raw_json=excluded.raw_json,updated_at=excluded.updated_at');
        const stat = this.db.prepare('INSERT INTO creator_work_statistics(item_id,snapshot_time,statistics_json,raw_json) VALUES(?,?,?,?)');
        for (const w of s.works) {
            work.run(w.item_id, w.title, w.published_at || '', w.cover || '', w.status || '', JSON.stringify(w.raw || w), s.collected_at);
            stat.run(w.item_id, s.collected_at, JSON.stringify(w), JSON.stringify(s.work_details.find(d => d.item_id === w.item_id) || null));
        }
        this.db.prepare('INSERT INTO creator_dashboard_statistics(snapshot_time,range_key,statistics_json) VALUES(?,?,?)').run(s.collected_at, 'all', JSON.stringify({ dashboard: s.dashboard, content_analysis: s.content_analysis }));
        this.db.prepare('INSERT INTO creator_fans_statistics(snapshot_time,statistics_json) VALUES(?,?)').run(s.collected_at, JSON.stringify(s.fans));
        this.db.prepare('INSERT INTO creator_raw_snapshots(snapshot_time,source,raw_json) VALUES(?,?,?)').run(s.collected_at, s.source, JSON.stringify(s.raw));
        this.db.exec('COMMIT');
    }
    catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
    } }
    close() { this.db.close(); }
}
exports.CreatorDatabase = CreatorDatabase;
