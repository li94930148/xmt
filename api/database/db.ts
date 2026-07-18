﻿﻿﻿import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { getDatabasePath, getDatabaseUrl } from './path';

export const dbPath = getDatabasePath();
const dbDir = path.dirname(dbPath);

// libsql 客户端 - 直接读写 SQLite 文件，不需要手动持久化
export const db = createClient({
  url: getDatabaseUrl(),
});

function getDbErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function initDatabase() {
  console.log(`[DB] SQLite path: ${dbPath}`);

  // 确保 data 目录存在
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // 启用 WAL 模式，提升并发性能
  await db.execute('PRAGMA journal_mode = WAL');

  // 启用外键约束
  await db.execute('PRAGMA foreign_keys = ON');

  await initTables();
  await runTimeMigrations();
  await createIndexes();
}

// 北京时间默认值表达式（SQLite 用 +8 hours 偏移）
// 注意：CREATE TABLE 的 DEFAULT 只能用 CURRENT_TIMESTAMP（表已存在不会重建）
// 运行时 INSERT/UPDATE 统一用 datetime('now', '+8 hours')

async function initTables() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'member',
      name TEXT,
      enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      outline TEXT,
      status TEXT DEFAULT 'pending',
      platform TEXT,
      deadline DATETIME,
      creator_id INTEGER,
      assignee_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS topic_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      action TEXT NOT NULL,
      comment TEXT,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS production (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      version TEXT,
      content TEXT,
      status TEXT DEFAULT 'draft',
      file_path TEXT,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS production_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      production_id INTEGER,
      version TEXT,
      content TEXT,
      status TEXT,
      change_type TEXT,
      comment TEXT,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT,
      target_id INTEGER,
      content TEXT,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS shooting (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      plan_date DATETIME,
      location TEXT,
      equipment TEXT,
      status TEXT DEFAULT 'pending',
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS publishing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      platform TEXT,
      url TEXT,
      status TEXT DEFAULT 'pending',
      publish_time DATETIME,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      data_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      content TEXT,
      type TEXT DEFAULT 'info',
      read BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      target TEXT,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      type TEXT,
      file_path TEXT,
      category TEXT,
      uploader_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await db.execute(`ALTER TABLE resources ADD COLUMN content TEXT`);
  } catch (e) {
    // 列已存在，忽略
  }

  try {
    await db.execute(`ALTER TABLE users ADD COLUMN force_change_password BOOLEAN DEFAULT 0`);
  } catch (e) {
    // 列已存在，忽略
  }

  try {
    await db.execute(`ALTER TABLE messages ADD COLUMN link TEXT`);
  } catch (e) {
    // 列已存在，忽略
  }

  // === 新增表 ===

  // 灵感池
  await db.execute(`CREATE TABLE IF NOT EXISTS inspirations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    creator_id INTEGER,
    votes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 灵感投票记录
  await db.execute(`CREATE TABLE IF NOT EXISTS inspiration_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspiration_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(inspiration_id, user_id)
  )`);

  // 灵感评论
  await db.execute(`CREATE TABLE IF NOT EXISTS inspiration_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspiration_id INTEGER NOT NULL,
    creator_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 选题模板
  await db.execute(`CREATE TABLE IF NOT EXISTS topic_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    platform TEXT,
    description TEXT,
    template_data TEXT,
    creator_id INTEGER,
    is_default BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 成就/徽章
  await db.execute(`CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    condition_type TEXT,
    condition_value INTEGER DEFAULT 0,
    points INTEGER DEFAULT 10,
    category TEXT DEFAULT 'milestone',
    rarity TEXT DEFAULT 'common',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS user_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    achievement_id INTEGER NOT NULL,
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, achievement_id)
  )`);

  // 尝试给旧表加新字段（兼容已有数据库）
  try { await db.execute(`ALTER TABLE achievements ADD COLUMN points INTEGER DEFAULT 10`); } catch (e) {}
  try { await db.execute(`ALTER TABLE achievements ADD COLUMN category TEXT DEFAULT 'milestone'`); } catch (e) {}
  try { await db.execute(`ALTER TABLE achievements ADD COLUMN rarity TEXT DEFAULT 'common'`); } catch (e) {}
  try { await db.execute(`ALTER TABLE achievements ADD COLUMN sort_order INTEGER DEFAULT 0`); } catch (e) {}

  // 公告/便签
  await db.execute(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'note',
    pinned BOOLEAN DEFAULT 0,
    creator_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 番茄钟记录
  await db.execute(`CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    duration INTEGER DEFAULT 25,
    topic_id INTEGER,
    completed BOOLEAN DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME
  )`);

  // 排期日历事件
  await db.execute(`CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_date DATETIME NOT NULL,
    event_type TEXT DEFAULT 'other',
    topic_id INTEGER,
    creator_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 抖音账号与快照
  await db.execute(`CREATE TABLE IF NOT EXISTS douyin_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    profile_url TEXT NOT NULL,
    douyin_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS douyin_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    username TEXT,
    followers INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    ip_location TEXT,
    bio TEXT,
    video_count INTEGER DEFAULT 0,
    raw_data TEXT,
    scraped_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES douyin_accounts(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS douyin_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    title TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (snapshot_id) REFERENCES douyin_snapshots(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS social_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    external_account_id TEXT,
    account_name TEXT NOT NULL,
    display_name TEXT,
    profile_url TEXT,
    avatar_url TEXT,
    owner_id INTEGER,
    active BOOLEAN DEFAULT 1,
    fetch_strategy TEXT DEFAULT 'manual',
    cookie_ref TEXT,
    credential_ref TEXT,
    remark TEXT,
    last_fetched_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, external_account_id)
  )`);

  try { await db.execute(`ALTER TABLE social_accounts ADD COLUMN credential_ref TEXT`); } catch (e) {}

  await db.execute(`CREATE TABLE IF NOT EXISTS social_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    followers INTEGER,
    following_count INTEGER,
    likes_total INTEGER,
    video_count INTEGER,
    works_count INTEGER,
    engagement_est REAL,
    source_method TEXT,
    source_project TEXT,
    raw_json TEXT,
    fetched_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, snapshot_date),
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS social_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    snapshot_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    internal_video_key TEXT,
    external_video_id TEXT,
    title TEXT,
    video_url TEXT,
    cover_url TEXT,
    publish_time DATETIME,
    likes INTEGER,
    comments INTEGER,
    shares INTEGER,
    collects INTEGER,
    views INTEGER,
    duration INTEGER,
    status TEXT,
    visibility TEXT,
    raw_json TEXT,
    source_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, external_video_id, snapshot_id),
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (snapshot_id) REFERENCES social_snapshots(id) ON DELETE CASCADE
  )`);

  try { await db.execute(`ALTER TABLE social_videos ADD COLUMN internal_video_key TEXT`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_videos ADD COLUMN source_type TEXT`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_videos ADD COLUMN duration INTEGER`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_videos ADD COLUMN status TEXT`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_videos ADD COLUMN visibility TEXT`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_videos ADD COLUMN avg_play_duration REAL`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_videos ADD COLUMN completion_rate_5s REAL`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_videos ADD COLUMN bounce_rate_2s REAL`); } catch (e) {}

  await db.execute(`CREATE TABLE IF NOT EXISTS social_ingestion_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER,
    platform TEXT NOT NULL,
    strategy TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    started_at DATETIME,
    finished_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE SET NULL
  )`);
  try { await db.execute(`ALTER TABLE social_ingestion_jobs ADD COLUMN trigger_source TEXT NOT NULL DEFAULT 'manual'`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_ingestion_jobs ADD COLUMN failure_type TEXT`); } catch (e) {}
  await db.execute(`CREATE TABLE IF NOT EXISTS social_scheduled_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    schedule_type TEXT NOT NULL DEFAULT 'daily',
    enabled BOOLEAN NOT NULL DEFAULT 1,
    last_run_at DATETIME,
    next_run_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, schedule_type),
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS social_ingestion_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL UNIQUE,
    last_success_at DATETIME,
    last_failed_at DATETIME,
    success_rate REAL NOT NULL DEFAULT 0,
    total_jobs INTEGER NOT NULL DEFAULT 0,
    success_jobs INTEGER NOT NULL DEFAULT 0,
    failed_jobs INTEGER NOT NULL DEFAULT 0,
    last_failure_type TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS social_metric_rollups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_date TEXT NOT NULL,
    platform TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL DEFAULT 0,
    dimension_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS social_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    credential_type TEXT NOT NULL,
    credential_ref TEXT NOT NULL UNIQUE,
    encrypted_payload TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    expires_at DATETIME,
    last_verified_at DATETIME,
    last_failed_at DATETIME,
    last_error TEXT,
    last_check_time DATETIME,
    last_success_time DATETIME,
    last_failure_time DATETIME,
    failure_reason TEXT,
    expire_detected_at DATETIME,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
  )`);
  try { await db.execute(`ALTER TABLE social_credentials ADD COLUMN expired_reason TEXT`); } catch (e) {}
  // Credential health is metadata only. Authentication material is deliberately not
  // written here; browser sessions remain in the operator-controlled browser profile.
  try { await db.execute(`ALTER TABLE social_credentials ADD COLUMN last_check_time DATETIME`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_credentials ADD COLUMN last_success_time DATETIME`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_credentials ADD COLUMN last_failure_time DATETIME`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_credentials ADD COLUMN failure_reason TEXT`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_credentials ADD COLUMN expire_detected_at DATETIME`); } catch (e) {}

  await db.execute(`CREATE TABLE IF NOT EXISTS social_login_sessions (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting_scan',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expired_at DATETIME NOT NULL,
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS social_account_metric_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, metric_name TEXT NOT NULL,
    metric_value REAL, snapshot_date TEXT NOT NULL, source TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, metric_name, snapshot_date), FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS video_performance_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    play_score REAL NOT NULL DEFAULT 0,
    interaction_score REAL NOT NULL DEFAULT 0,
    hot_score REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(video_id),
    FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE
  )`);
  try { await db.execute(`ALTER TABLE video_performance_scores ADD COLUMN growth_score REAL NOT NULL DEFAULT 0`); } catch (e) {}
  await db.execute(`CREATE TABLE IF NOT EXISTS video_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(video_id, tag),
    FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS video_metric_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    collects INTEGER NOT NULL DEFAULT 0,
    interaction_rate REAL NOT NULL DEFAULT 0,
    snapshot_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(video_id, snapshot_date),
    FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS video_identity_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_video_id TEXT NOT NULL,
    social_video_id INTEGER NOT NULL,
    confidence TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, account_id, source_type, source_video_id),
    FOREIGN KEY (social_video_id) REFERENCES social_videos(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS video_identity_mapping_diagnostics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_id_type TEXT NOT NULL,
    matched_field TEXT NOT NULL,
    matched_count INTEGER NOT NULL DEFAULT 0,
    unmatched_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { await db.execute(`ALTER TABLE video_metric_snapshots ADD COLUMN interaction_rate REAL NOT NULL DEFAULT 0`); } catch (e) {}
  await db.execute(`CREATE TABLE IF NOT EXISTS video_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(video_id, type, source),
    FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS video_content_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    feature_type TEXT NOT NULL,
    feature_value TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(video_id, feature_type, feature_value),
    FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS social_review_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    report_type TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    summary_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, report_type, period_start, period_end),
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
  )`);
  try { await db.execute(`ALTER TABLE social_review_reports ADD COLUMN period_type TEXT NOT NULL DEFAULT '30d'`); } catch (e) {}
  try { await db.execute(`ALTER TABLE social_review_reports ADD COLUMN report_json TEXT`); } catch (e) {}
  await db.execute(`UPDATE social_review_reports SET report_json = summary_json WHERE report_json IS NULL`);
  await db.execute(`CREATE TABLE IF NOT EXISTS social_operation_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, type, title, content),
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS content_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS video_category_relations (
    video_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (video_id, category_id),
    FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES content_categories(id) ON DELETE CASCADE
  )`);

  // 历史遗留的剪辑/编辑表，需保留以兼容现有数据
  await db.execute(`CREATE TABLE IF NOT EXISTS editing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER,
    version TEXT,
    status TEXT DEFAULT 'pending',
    file_path TEXT,
    feedback TEXT,
    operator_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // === 日报系统 MVP 表 ===
  await db.execute(`CREATE TABLE IF NOT EXISTS daily_report_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    sections_json TEXT NOT NULL,
    is_default BOOLEAN DEFAULT 0,
    active BOOLEAN DEFAULT 1,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    report_date TEXT NOT NULL,
    team_id INTEGER,
    template_id INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    manual_summary_md TEXT,
    auto_summary_json TEXT,
    risk_level TEXT DEFAULT 'normal',
    version INTEGER NOT NULL DEFAULT 1,
    submitted_at DATETIME,
    reviewed_at DATETIME,
    reviewed_by INTEGER,
    review_comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, report_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES daily_report_templates(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS daily_report_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    section_key TEXT NOT NULL,
    title TEXT,
    content_md TEXT,
    source_type TEXT,
    source_id INTEGER,
    sort_order INTEGER DEFAULT 0,
    meta_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS daily_report_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscriber_id INTEGER NOT NULL,
    target_user_id INTEGER,
    team_id INTEGER,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscriber_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(subscriber_id, target_user_id, team_id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS daily_report_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER,
    user_id INTEGER,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    comment TEXT,
    payload_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // === 数据复盘系统 MVP 表 ===
  await db.execute(`CREATE TABLE IF NOT EXISTS retro_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'custom',
    description TEXT,
    schema_json TEXT,
    metric_bindings_json TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS retrospectives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER,
    title TEXT NOT NULL,
    scope_type TEXT NOT NULL DEFAULT 'custom',
    scope_id INTEGER,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    summary_md TEXT,
    owner_id INTEGER,
    published_at DATETIME,
    archived_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (template_id) REFERENCES retro_templates(id),
    FOREIGN KEY (owner_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS retro_metric_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retro_id INTEGER NOT NULL,
    metric_key TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value_num REAL,
    value_text TEXT,
    compare_value_num REAL,
    dimension_json TEXT,
    source_ref_json TEXT,
    captured_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (retro_id) REFERENCES retrospectives(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS retro_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retro_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description_md TEXT,
    owner_id INTEGER,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    result_md TEXT,
    closed_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (retro_id) REFERENCES retrospectives(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS retro_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retro_id INTEGER,
    actor_id INTEGER,
    action TEXT NOT NULL,
    before_status TEXT,
    after_status TEXT,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (retro_id) REFERENCES retrospectives(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id)
  )`);

  // === 权限系统表 ===

  // 角色表
  await db.execute(`CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 权限表
  await db.execute(`CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    module TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 角色-权限映射表
  await db.execute(`CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
  )`);

  // 用户-角色映射表（支持多角色）
  await db.execute(`CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
  )`);

  // 初始化默认角色和权限
  const roleCount = await db.execute(`SELECT COUNT(*) as count FROM roles`);
  const rolesExist = roleCount.rows.length > 0 && Number(roleCount.rows[0].count) > 0;

  if (!rolesExist) {
    // 插入默认角色
    await db.execute({ sql: `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)`, args: ['admin', '管理员', '拥有所有权限', 1] });
    await db.execute({ sql: `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)`, args: ['director', '管理层', '管理级权限', 1] });
    await db.execute({ sql: `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)`, args: ['member', '普通人员', '基础权限', 1] });
    await db.execute({ sql: `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)`, args: ['editor', '通用编辑', '通用内容生产角色', 1] });
    await db.execute({ sql: `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)`, args: ['copywriter', '文案', '内容生产-文案角色', 1] });
    await db.execute({ sql: `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)`, args: ['post_production', '后期', '内容生产-后期角色', 1] });
    await db.execute({ sql: `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)`, args: ['camera', '摄像', '内容生产-摄像角色', 1] });

    // 插入权限定义
    const permissions = [
      // 选题模块
      ['topic:create', '创建选题', 'topic'],
      ['topic:view', '查看选题', 'topic'],
      ['topic:update', '编辑选题', 'topic'],
      ['topic:delete', '删除选题', 'topic'],
      ['topic:audit', '审核选题', 'topic'],
      ['topic:status', '变更选题状态', 'topic'],
      // 工作流模块
      ['workflow:production', '管理创作阶段', 'workflow'],
      ['workflow:shooting', '管理拍摄阶段', 'workflow'],
      ['workflow:publishing', '管理发布阶段', 'workflow'],
      ['workflow:comment', '评论', 'workflow'],
      // 用户模块
      ['user:view', '查看用户', 'user'],
      ['user:create', '创建用户', 'user'],
      ['user:update', '编辑用户', 'user'],
      ['user:delete', '删除用户', 'user'],
      ['user:logs', '查看操作日志', 'user'],
      // 数据模块
      ['analytics:view', '查看数据分析', 'analytics'],
      ['analytics:create', '创建分析数据', 'analytics'],
      ['export:data', '导出数据', 'export'],
      ['production:delete', '删除创作记录', 'production'],
      ['comment:delete', '删除流程评论', 'workflow'],
      ['inspiration:delete', '删除灵感', 'inspiration'],
      ['inspiration:promote', '灵感转选题', 'inspiration'],
      // 系统模块
      ['system:backup', '系统备份', 'system'],
      ['system:announcement', '管理公告', 'system'],
      ['system:template', '管理模板', 'system'],
      ['system:achievement', '管理成就', 'system'],
      ['system:douyin', '管理抖音数据', 'system'],
      ['system:role', '管理角色', 'system'],
      ['system:permission', '管理权限', 'system'],
      ['system:settings', '管理系统设置', 'system'],
    ];

    for (const [code, name, module] of permissions) {
      await db.execute({ sql: `INSERT INTO permissions (code, name, module) VALUES (?, ?, ?)`, args: [code, name, module] });
    }

    // 为默认角色分配权限
    // admin 拥有所有权限
    const allPerms = await db.execute(`SELECT id FROM permissions`);
    const adminRole = await db.execute(`SELECT id FROM roles WHERE code = 'admin'`);
    const adminRoleId = adminRole.rows[0].id;
    for (const perm of allPerms.rows) {
      await db.execute({ sql: `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, args: [adminRoleId, perm.id] });
    }

    // director 拥有除系统管理外的所有权限
    const directorRole = await db.execute(`SELECT id FROM roles WHERE code = 'director'`);
    const directorRoleId = directorRole.rows[0].id;
    const directorPerms = await db.execute(`SELECT id FROM permissions WHERE module != 'system' OR code IN ('system:announcement', 'system:template', 'system:douyin')`);
    for (const perm of directorPerms.rows) {
      await db.execute({ sql: `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, args: [directorRoleId, perm.id] });
    }

    // member 拥有基础权限
    const memberRole = await db.execute(`SELECT id FROM roles WHERE code = 'member'`);
    const memberRoleId = memberRole.rows[0].id;
    const memberPerms = await db.execute(`SELECT id FROM permissions WHERE code IN ('topic:create', 'topic:view', 'topic:update', 'workflow:comment')`);
    for (const perm of memberPerms.rows) {
      await db.execute({ sql: `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, args: [memberRoleId, perm.id] });
    }

    // 内容生产角色拥有内容查看和编辑权限，但不授予系统管理、用户管理、角色权限管理或删除权限。
    const contentRoles = await db.execute(`SELECT id, code FROM roles WHERE code IN ('editor', 'copywriter', 'post_production', 'camera')`);
    const contentPerms = await db.execute(`SELECT id FROM permissions WHERE code IN ('topic:create', 'topic:view', 'topic:update', 'workflow:production', 'workflow:shooting', 'workflow:publishing', 'workflow:comment')`);
    for (const role of contentRoles.rows) {
      for (const perm of contentPerms.rows) {
        await db.execute({ sql: `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, args: [role.id, perm.id] });
      }
    }

    // 为现有用户分配角色映射
    const users = await db.execute(`SELECT id, role FROM users`);
    for (const user of users.rows) {
      const role = await db.execute({ sql: `SELECT id FROM roles WHERE code = ?`, args: [user.role] });
      if (role.rows.length > 0) {
        await db.execute({ sql: `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`, args: [user.id, role.rows[0].id] });
      }
    }
  }

  // 兼容已有数据库：补齐内容生产角色及名称，避免人员管理角色下拉缺项。
  const requiredRoles: Array<[string, string, string]> = [
    ['admin', '管理员', '拥有所有权限'],
    ['director', '管理层', '管理级权限'],
    ['editor', '通用编辑', '通用内容生产角色'],
    ['copywriter', '文案', '内容生产-文案角色'],
    ['post_production', '后期', '内容生产-后期角色'],
    ['camera', '摄像', '内容生产-摄像角色'],
    ['member', '普通人员', '基础权限'],
  ];

  for (const [code, name, description] of requiredRoles) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO roles (code, name, description, is_system) VALUES (?, ?, ?, 1)`,
      args: [code, name, description],
    });
    await db.execute({
      sql: `UPDATE roles SET name = ?, description = ?, is_system = 1 WHERE code = ?`,
      args: [name, description, code],
    });
  }

  const contentRoleRows = await db.execute(
    `SELECT id, code FROM roles WHERE code IN ('editor', 'copywriter', 'post_production', 'camera')`
  );
  const contentPermissionRows = await db.execute(
    `SELECT id, code FROM permissions WHERE code IN ('topic:create', 'topic:view', 'topic:update', 'workflow:production', 'workflow:shooting', 'workflow:publishing', 'workflow:comment')`
  );

  for (const role of contentRoleRows.rows) {
    for (const permission of contentPermissionRows.rows) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
        args: [role.id, permission.id],
      });
    }
  }

  // === 审批流自定义表 ===

  // 审批流模板表
  await db.execute(`CREATE TABLE IF NOT EXISTS workflow_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT 0,
    creator_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 审批节点表
  await db.execute(`CREATE TABLE IF NOT EXISTS workflow_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    node_order INTEGER NOT NULL,
    status_from TEXT NOT NULL,
    status_to TEXT NOT NULL,
    approver_type TEXT DEFAULT 'role',
    approver_value TEXT,
    is_required BOOLEAN DEFAULT 1,
    FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
  )`);

  // 审批记录表
  await db.execute(`CREATE TABLE IF NOT EXISTS approval_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    approver_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS workflow_shadow_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER,
    node_id INTEGER,
    from_state TEXT,
    to_state TEXT,
    user_id INTEGER,
    action TEXT,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 选题关联审批流（添加列）
  try {
    await db.execute(`ALTER TABLE topics ADD COLUMN workflow_template_id INTEGER`);
  } catch (e) {
    // 列已存在，忽略
  }

  try {
    await db.execute(`ALTER TABLE topics ADD COLUMN submitted_at DATETIME`);
  } catch (e) {
    // 列已存在，忽略
  }

  // 回填已有选题的 submitted_at（使用 created_at 作为默认值）
  try {
    await db.execute(`UPDATE topics SET submitted_at = created_at WHERE submitted_at IS NULL`);
  } catch (e) {
    // 忽略
  }

  // 选题大纲（独立于创作管理）
  try {
    await db.execute(`ALTER TABLE topics ADD COLUMN outline TEXT`);
  } catch (e) {
    // 列已存在，忽略
  }

  // === Tiptap 编辑器迁移字段 ===

  // production 表新增字段
  try { await db.execute(`ALTER TABLE production ADD COLUMN content_json TEXT`); } catch (e) {}
  try { await db.execute(`ALTER TABLE production ADD COLUMN content_markdown TEXT`); } catch (e) {}

  // production_history 表新增字段
  try { await db.execute(`ALTER TABLE production_history ADD COLUMN content_json TEXT`); } catch (e) {}
  try { await db.execute(`ALTER TABLE production_history ADD COLUMN content_markdown TEXT`); } catch (e) {}

  // topics 表新增字段
  try { await db.execute(`ALTER TABLE topics ADD COLUMN outline_json TEXT`); } catch (e) {}
  try { await db.execute(`ALTER TABLE topics ADD COLUMN outline_markdown TEXT`); } catch (e) {}

  // === 编辑器增强字段 ===
  try { await db.execute(`ALTER TABLE production ADD COLUMN toc_json TEXT`); } catch (e) {}
  try { await db.execute(`ALTER TABLE production ADD COLUMN comments_json TEXT`); } catch (e) {}
  try { await db.execute(`ALTER TABLE production ADD COLUMN editor_version TEXT DEFAULT 'tiptap-1'`); } catch (e) {}
  try { await db.execute(`ALTER TABLE production ADD COLUMN last_saved_at DATETIME`); } catch (e) {}

  // publishing 表新增字段：本地编辑的剧本内容（不回写创作管理）
  try { await db.execute(`ALTER TABLE publishing ADD COLUMN script_content TEXT`); } catch (e) {}

  // shooting 表新增字段：本地编辑的剧本内容（不回写创作管理）
  try { await db.execute(`ALTER TABLE shooting ADD COLUMN script_content TEXT`); } catch (e) {}

  // 数据回填：将现有 HTML content 转为 markdown
  await migrateHtmlToMarkdown();

  // 初始化默认审批流模板
  const templateCount = await db.execute(`SELECT COUNT(*) as count FROM workflow_templates`);
  const templatesExist = templateCount.rows.length > 0 && Number(templateCount.rows[0].count) > 0;

  if (!templatesExist) {
    // 创建默认审批流模板
    const templateResult = await db.execute({
      sql: `INSERT INTO workflow_templates (name, description, is_default) VALUES (?, ?, ?)`,
      args: ['标准选题流程', '选题从提交到完成的标准审批流程', 1]
    });
    const templateId = Number(templateResult.lastInsertRowid);

    // 创建默认审批节点
    const defaultNodes = [
      { name: '内容审核', order: 1, from: 'pending', to: 'approved', type: 'role', value: 'director' },
      { name: '创作阶段', order: 2, from: 'approved', to: 'production', type: 'role', value: 'member' },
      { name: '拍摄阶段', order: 3, from: 'production', to: 'shooting', type: 'role', value: 'director' },
      { name: '发布阶段', order: 4, from: 'shooting', to: 'publishing', type: 'role', value: 'director' },
      { name: '完成确认', order: 5, from: 'publishing', to: 'completed', type: 'role', value: 'director' },
    ];

    for (const node of defaultNodes) {
      await db.execute({
        sql: `INSERT INTO workflow_nodes (template_id, name, node_order, status_from, status_to, approver_type, approver_value) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [templateId, node.name, node.order, node.from, node.to, node.type, node.value]
      });
    }
  }

  // === 通知增强表 ===

  // 通知偏好表
  await db.execute(`CREATE TABLE IF NOT EXISTS notification_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    event_type TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    config TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, channel, event_type)
  )`);

  // 初始化默认用户
  const adminResult = await db.execute(`SELECT COUNT(*) as count FROM users WHERE username = 'admin'`);
  const adminExists = adminResult.rows.length > 0 && Number(adminResult.rows[0].count) > 0;

  if (!adminExists) {
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.execute({
      sql: `INSERT INTO users (username, password, email, role, name, enabled, force_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ['admin', hashedPassword, 'admin@local.dev', 'admin', '管理员', 1, 1]
    });

    const directorPassword = await bcrypt.hash('director123', 10);
    await db.execute({
      sql: `INSERT INTO users (username, password, email, role, name, enabled, force_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ['director', directorPassword, 'director@local.dev', 'director', '编导', 1, 1]
    });

    const member1Password = await bcrypt.hash('member123', 10);
    await db.execute({
      sql: `INSERT INTO users (username, password, email, role, name, enabled, force_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ['member1', member1Password, 'member1@local.dev', 'member', '员工张三', 1, 1]
    });

    const member2Password = await bcrypt.hash('member123', 10);
    await db.execute({
      sql: `INSERT INTO users (username, password, email, role, name, enabled, force_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ['member2', member2Password, 'member2@local.dev', 'member', '员工李四', 1, 1]
    });
  }
}

async function runTimeMigrations() {
  const metricAvailabilityMigration = await db.execute({ sql: `SELECT value FROM app_meta WHERE key = ?`, args: ['social_review_unknown_interaction_20260714'] });
  if (metricAvailabilityMigration.rows.length === 0) {
    await db.execute(`UPDATE social_videos SET likes = NULL, comments = NULL, shares = NULL, collects = NULL WHERE source_type = 'creator_item_api' AND likes = 0 AND comments = 0 AND shares = 0 AND collects = 0`);
    await db.execute({ sql: `INSERT INTO app_meta (key, value, created_at) VALUES (?, ?, datetime('now', '+8 hours'))`, args: ['social_review_unknown_interaction_20260714', 'done'] });
  }
  try {
    await db.execute(`DROP INDEX IF EXISTS idx_calendar_events_user`);
    await db.execute(`DROP INDEX IF EXISTS idx_calendar_events_date`);
  } catch (error) {
    console.warn('[DB] 清理旧 calendar_events 索引失败:', getDbErrorMessage(error));
  }

  const tzMigrated = await db.execute({
    sql: `SELECT value FROM app_meta WHERE key = ?`,
    args: ['tz_migration_20260611'],
  });

  if (tzMigrated.rows.length === 0) {
    // 历史上部分表依赖 CURRENT_TIMESTAMP，SQLite 默认会写入 UTC。
    // 这里把用户最敏感的几类数据统一平移到北京时间，避免前后显示规则混杂。
    const migrationStatements = [
      `UPDATE messages SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL`,
      `UPDATE inspirations SET created_at = datetime(created_at, '+8 hours'), updated_at = datetime(updated_at, '+8 hours') WHERE created_at IS NOT NULL`,
      `UPDATE inspiration_comments SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL`,
      `UPDATE announcements SET created_at = datetime(created_at, '+8 hours'), updated_at = datetime(updated_at, '+8 hours') WHERE created_at IS NOT NULL`,
    ];

    for (const sql of migrationStatements) {
      await db.execute(sql);
    }

    await db.execute({
      sql: `INSERT INTO app_meta (key, value, created_at) VALUES (?, ?, datetime('now', '+8 hours'))`,
      args: ['tz_migration_20260611', 'done'],
    });
  }

  const rolePermissionSyncKey = 'role_perm_sync_20260616_member_editor_scope';
  const rolePermissionSync = await db.execute({
    sql: `SELECT value FROM app_meta WHERE key = ?`,
    args: [rolePermissionSyncKey],
  });

  if (rolePermissionSync.rows.length === 0) {
    const roles = await db.execute(
      `SELECT id, code FROM roles WHERE code IN ('member', 'editor')`
    );
    const permissions = await db.execute(
      `SELECT id, code FROM permissions WHERE code IN ('analytics:view', 'export:data')`
    );

    const roleIdByCode = new Map<string, number>();
    for (const row of roles.rows) {
      const roleId = Number((row as Record<string, unknown>).id);
      const roleCode = String((row as Record<string, unknown>).code ?? '');
      if (!roleId || !roleCode) {
        continue;
      }
      roleIdByCode.set(roleCode, roleId);
    }

    const permissionIdByCode = new Map<string, number>();
    for (const row of permissions.rows) {
      const permissionId = Number((row as Record<string, unknown>).id);
      const permissionCode = String((row as Record<string, unknown>).code ?? '');
      if (!permissionId || !permissionCode) {
        continue;
      }
      permissionIdByCode.set(permissionCode, permissionId);
    }

    const staleBindings: Array<[string, string]> = [
      ['member', 'analytics:view'],
      ['member', 'export:data'],
      ['editor', 'analytics:view'],
    ];

    for (const [roleCode, permissionCode] of staleBindings) {
      const roleId = roleIdByCode.get(roleCode);
      const permissionId = permissionIdByCode.get(permissionCode);
      if (!roleId || !permissionId) {
        continue;
      }

      await db.execute({
        sql: `DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?`,
        args: [roleId, permissionId],
      });
    }

    await db.execute({
      sql: `INSERT INTO app_meta (key, value, created_at) VALUES (?, ?, datetime('now', '+8 hours'))`,
      args: [rolePermissionSyncKey, 'done'],
    });
  }

  const permissionSeedSyncKey = 'permission_seed_sync_20260616_followup';
  const permissionSeedSync = await db.execute({
    sql: `SELECT value FROM app_meta WHERE key = ?`,
    args: [permissionSeedSyncKey],
  });

  if (permissionSeedSync.rows.length === 0) {
    const supplementalPermissions: Array<[string, string, string]> = [
      ['production:delete', '删除创作记录', 'production'],
      ['comment:delete', '删除流程评论', 'workflow'],
      ['inspiration:delete', '删除灵感', 'inspiration'],
      ['inspiration:promote', '灵感转选题', 'inspiration'],
    ];

    for (const [code, name, module] of supplementalPermissions) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO permissions (code, name, module) VALUES (?, ?, ?)`,
        args: [code, name, module],
      });
    }

    const roles = await db.execute(
      `SELECT id, code FROM roles WHERE code IN ('admin', 'director')`
    );
    const permissions = await db.execute(
      `SELECT id, code FROM permissions WHERE code IN ('production:delete', 'comment:delete', 'inspiration:delete', 'inspiration:promote')`
    );

    const roleIdByCode = new Map<string, number>();
    for (const row of roles.rows) {
      const roleId = Number((row as Record<string, unknown>).id);
      const roleCode = String((row as Record<string, unknown>).code ?? '');
      if (!roleId || !roleCode) {
        continue;
      }
      roleIdByCode.set(roleCode, roleId);
    }

    const permissionIdByCode = new Map<string, number>();
    for (const row of permissions.rows) {
      const permissionId = Number((row as Record<string, unknown>).id);
      const permissionCode = String((row as Record<string, unknown>).code ?? '');
      if (!permissionId || !permissionCode) {
        continue;
      }
      permissionIdByCode.set(permissionCode, permissionId);
    }

    for (const roleCode of ['admin', 'director']) {
      const roleId = roleIdByCode.get(roleCode);
      if (!roleId) {
        continue;
      }

      for (const permissionCode of ['production:delete', 'comment:delete', 'inspiration:delete', 'inspiration:promote']) {
        const permissionId = permissionIdByCode.get(permissionCode);
        if (!permissionId) {
          continue;
        }

        await db.execute({
          sql: `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
          args: [roleId, permissionId],
        });
      }
    }

    await db.execute({
      sql: `INSERT INTO app_meta (key, value, created_at) VALUES (?, ?, datetime('now', '+8 hours'))`,
      args: [permissionSeedSyncKey, 'done'],
    });
  }

  const systemSettingsSeedSyncKey = 'permission_seed_sync_20260616_system_settings';
  const systemSettingsSeedSync = await db.execute({
    sql: `SELECT value FROM app_meta WHERE key = ?`,
    args: [systemSettingsSeedSyncKey],
  });

  if (systemSettingsSeedSync.rows.length === 0) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO permissions (code, name, module) VALUES (?, ?, ?)`,
      args: ['system:settings', '管理系统设置', 'system'],
    });

    const adminRole = await db.execute(`SELECT id FROM roles WHERE code = 'admin'`);
    const systemSettingsPermission = await db.execute(
      `SELECT id FROM permissions WHERE code = 'system:settings'`,
    );

    const adminRoleId = Number(adminRole.rows[0]?.id || 0);
    const permissionId = Number(systemSettingsPermission.rows[0]?.id || 0);

    if (adminRoleId && permissionId) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
        args: [adminRoleId, permissionId],
      });
    }

    await db.execute({
      sql: `INSERT INTO app_meta (key, value, created_at) VALUES (?, ?, datetime('now', '+8 hours'))`,
      args: [systemSettingsSeedSyncKey, 'done'],
    });
  }

  const dailyReportSeedSyncKey = 'daily_report_seed_sync_20260701';
  const dailyReportSeedSync = await db.execute({
    sql: `SELECT value FROM app_meta WHERE key = ?`,
    args: [dailyReportSeedSyncKey],
  });

  if (dailyReportSeedSync.rows.length === 0) {
    const dailyReportPermissions: Array<[string, string, string]> = [
      ['report:daily:submit', '提交日报', 'report'],
      ['report:daily:view_team', '查看团队日报', 'report'],
      ['report:daily:review', '审核日报', 'report'],
      ['report:daily:subscribe', '订阅日报', 'report'],
      ['report:daily:archive', '查看日报归档', 'report'],
    ];

    for (const [code, name, module] of dailyReportPermissions) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO permissions (code, name, module) VALUES (?, ?, ?)`,
        args: [code, name, module],
      });
    }

    const roles = await db.execute(
      `SELECT id, code FROM roles WHERE code IN ('admin', 'director', 'member', 'editor')`
    );
    const permissions = await db.execute(
      `SELECT id, code FROM permissions WHERE module = 'report'`
    );

    const roleIdByCode = new Map<string, number>();
    for (const row of roles.rows) {
      const roleId = Number((row as Record<string, unknown>).id);
      const roleCode = String((row as Record<string, unknown>).code ?? '');
      if (roleId && roleCode) {
        roleIdByCode.set(roleCode, roleId);
      }
    }

    const permissionIdByCode = new Map<string, number>();
    for (const row of permissions.rows) {
      const permissionId = Number((row as Record<string, unknown>).id);
      const permissionCode = String((row as Record<string, unknown>).code ?? '');
      if (permissionId && permissionCode) {
        permissionIdByCode.set(permissionCode, permissionId);
      }
    }

    const rolePermissions: Record<string, string[]> = {
      admin: dailyReportPermissions.map(([code]) => code),
      director: ['report:daily:view_team', 'report:daily:review', 'report:daily:subscribe', 'report:daily:archive'],
      member: ['report:daily:submit', 'report:daily:archive'],
      editor: ['report:daily:submit', 'report:daily:archive'],
    };

    for (const [roleCode, permissionCodes] of Object.entries(rolePermissions)) {
      const roleId = roleIdByCode.get(roleCode);
      if (!roleId) {
        continue;
      }

      for (const permissionCode of permissionCodes) {
        const permissionId = permissionIdByCode.get(permissionCode);
        if (!permissionId) {
          continue;
        }

        await db.execute({
          sql: `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
          args: [roleId, permissionId],
        });
      }
    }

    const defaultTemplate = await db.execute(
      `SELECT id FROM daily_report_templates WHERE is_default = 1 AND active = 1 LIMIT 1`
    );

    if (defaultTemplate.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO daily_report_templates (name, description, sections_json, is_default, active, created_at, updated_at)
              VALUES (?, ?, ?, 1, 1, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
        args: [
          '默认日报模板',
          '日报 MVP 默认模板',
          JSON.stringify([
            { key: 'done', title: '今日完成' },
            { key: 'progress', title: '进行中' },
            { key: 'risk', title: '风险与阻塞' },
            { key: 'tomorrow', title: '明日计划' },
          ]),
        ],
      });
    }

    await db.execute({
      sql: `INSERT INTO app_meta (key, value, created_at) VALUES (?, ?, datetime('now', '+8 hours'))`,
      args: [dailyReportSeedSyncKey, 'done'],
    });
  }

  const retroSeedSyncKey = 'retro_seed_sync_20260702';
  const retroSeedSync = await db.execute({
    sql: `SELECT value FROM app_meta WHERE key = ?`,
    args: [retroSeedSyncKey],
  });

  if (retroSeedSync.rows.length === 0) {
    const retroPermissions: Array<[string, string, string]> = [
      ['analytics:retro:view', '查看数据复盘', 'analytics'],
      ['analytics:retro:create', '创建数据复盘', 'analytics'],
      ['analytics:retro:publish', '发布数据复盘', 'analytics'],
      ['analytics:retro:archive', '归档数据复盘', 'analytics'],
      ['analytics:retro:action_manage', '管理复盘行动项', 'analytics'],
      ['analytics:retro:template_manage', '管理复盘模板', 'analytics'],
    ];

    for (const [code, name, module] of retroPermissions) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO permissions (code, name, module) VALUES (?, ?, ?)`,
        args: [code, name, module],
      });
    }

    const roles = await db.execute(
      `SELECT id, code FROM roles WHERE code IN ('admin', 'director', 'member', 'editor')`
    );
    const permissions = await db.execute({
      sql: `SELECT id, code FROM permissions WHERE code IN (${retroPermissions.map(() => '?').join(',')})`,
      args: retroPermissions.map(([code]) => code),
    });

    const roleIdByCode = new Map<string, number>();
    for (const row of roles.rows) {
      const roleId = Number((row as Record<string, unknown>).id);
      const roleCode = String((row as Record<string, unknown>).code ?? '');
      if (roleId && roleCode) {
        roleIdByCode.set(roleCode, roleId);
      }
    }

    const permissionIdByCode = new Map<string, number>();
    for (const row of permissions.rows) {
      const permissionId = Number((row as Record<string, unknown>).id);
      const permissionCode = String((row as Record<string, unknown>).code ?? '');
      if (permissionId && permissionCode) {
        permissionIdByCode.set(permissionCode, permissionId);
      }
    }

    const rolePermissions: Record<string, string[]> = {
      admin: retroPermissions.map(([code]) => code),
      director: ['analytics:retro:view', 'analytics:retro:create', 'analytics:retro:publish', 'analytics:retro:action_manage'],
      member: ['analytics:retro:view'],
      editor: ['analytics:retro:view'],
    };

    for (const [roleCode, permissionCodes] of Object.entries(rolePermissions)) {
      const roleId = roleIdByCode.get(roleCode);
      if (!roleId) {
        continue;
      }

      for (const permissionCode of permissionCodes) {
        const permissionId = permissionIdByCode.get(permissionCode);
        if (!permissionId) {
          continue;
        }

        await db.execute({
          sql: `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
          args: [roleId, permissionId],
        });
      }
    }

    const defaultRetroTemplate = await db.execute(
      `SELECT id FROM retro_templates WHERE category = 'weekly' AND status = 'active' LIMIT 1`
    );

    if (defaultRetroTemplate.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO retro_templates
          (name, category, description, schema_json, metric_bindings_json, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'active', datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
        args: [
          'Weekly content retrospective',
          'weekly',
          'Default weekly retrospective template for content workflow and daily report signals.',
          JSON.stringify({
            sections: [
              { key: 'summary', title: 'Summary' },
              { key: 'wins', title: 'Wins' },
              { key: 'risks', title: 'Risks' },
              { key: 'actions', title: 'Actions' },
            ],
          }),
          JSON.stringify({
            metrics: [
              'topics_count',
              'production_count',
              'publishing_count',
              'daily_reports_submitted_count',
              'daily_reports_risk_count',
            ],
          }),
        ],
      });
    }

    await db.execute({
      sql: `INSERT INTO app_meta (key, value, created_at) VALUES (?, ?, datetime('now', '+8 hours'))`,
      args: [retroSeedSyncKey, 'done'],
    });
  }
}

// 数据迁移：将现有 HTML content 转为 markdown 存入 content_markdown
async function migrateHtmlToMarkdown() {
  try {
    // 检查是否需要迁移（content_markdown 为空但 content 不为空的记录）
    const needMigrate = await db.execute(`SELECT COUNT(*) as cnt FROM production WHERE content IS NOT NULL AND content != '' AND (content_markdown IS NULL OR content_markdown = '')`);
    const count = Number(needMigrate.rows[0]?.cnt || 0);
    if (count === 0) return;
    console.log(`[DB] 迁移 ${count} 条 production 记录的 HTML 到 Markdown...`);

    // 简单 HTML 转 Markdown（服务端用正则，不依赖 DOMParser）
    const htmlToMd = (html: string): string => {
      if (!html) return '';
      let md = html;
      md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
      md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
      md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
      md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
      md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
      md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');
      md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
      md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
      md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
      md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
      md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, '<u>$1</u>');
      md = md.replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~');
      md = md.replace(/<strike[^>]*>(.*?)<\/strike>/gi, '~~$1~~');
      md = md.replace(/<del[^>]*>(.*?)<\/del>/gi, '~~$1~~');
      md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n');
      md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
      md = md.replace(/<pre[^>]*>(.*?)<\/pre>/gis, '```\n$1\n```\n');
      md = md.replace(/<br\s*\/?>/gi, '\n');
      md = md.replace(/<hr\s*\/?>/gi, '\n---\n');
      md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
      md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
      md = md.replace(/<ul[^>]*>/gi, '\n');
      md = md.replace(/<\/ul>/gi, '\n');
      md = md.replace(/<ol[^>]*>/gi, '\n');
      md = md.replace(/<\/ol>/gi, '\n');
      md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
      md = md.replace(/<div[^>]*>(.*?)<\/div>/gi, '$1\n');
      md = md.replace(/<[^>]+>/g, '');
      md = md.replace(/&amp;/g, '&');
      md = md.replace(/&lt;/g, '<');
      md = md.replace(/&gt;/g, '>');
      md = md.replace(/&nbsp;/g, ' ');
      md = md.replace(/\n{3,}/g, '\n\n');
      return md.trim();
    };

    // 回填 production
    const rows = await db.execute(`SELECT id, content FROM production WHERE content IS NOT NULL AND content != '' AND (content_markdown IS NULL OR content_markdown = '')`);
    for (const row of rows.rows) {
      const md = htmlToMd(String(row.content || ''));
      if (md) {
        await db.execute({ sql: `UPDATE production SET content_markdown = ? WHERE id = ?`, args: [md, row.id] });
      }
    }

    // 回填 production_history
    const histRows = await db.execute(`SELECT id, content FROM production_history WHERE content IS NOT NULL AND content != '' AND (content_markdown IS NULL OR content_markdown = '')`);
    for (const row of histRows.rows) {
      const md = htmlToMd(String(row.content || ''));
      if (md) {
        await db.execute({ sql: `UPDATE production_history SET content_markdown = ? WHERE id = ?`, args: [md, row.id] });
      }
    }

    // 回填 topics outline
    const topicRows = await db.execute(`SELECT id, outline FROM topics WHERE outline IS NOT NULL AND outline != '' AND (outline_markdown IS NULL OR outline_markdown = '')`);
    for (const row of topicRows.rows) {
      const md = htmlToMd(String(row.outline || ''));
      if (md) {
        await db.execute({ sql: `UPDATE topics SET outline_markdown = ? WHERE id = ?`, args: [md, row.id] });
      }
    }

    console.log('[DB] HTML → Markdown 迁移完成');
  } catch (e) {
    console.error('[DB] 迁移回填出错（非致命）:', e);
  }
}

// 创建数据库索引，提升查询性能
async function createIndexes() {
  console.log('[DB] 创建数据库索引...');

  const indexes = [
    // topics 表索引
    'CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status)',
    'CREATE INDEX IF NOT EXISTS idx_topics_creator ON topics(creator_id)',
    'CREATE INDEX IF NOT EXISTS idx_topics_assignee ON topics(assignee_id)',
    'CREATE INDEX IF NOT EXISTS idx_topics_created ON topics(created_at)',

    // topic_history 表索引
    'CREATE INDEX IF NOT EXISTS idx_topic_history_topic ON topic_history(topic_id)',

    // production 表索引
    'CREATE INDEX IF NOT EXISTS idx_production_topic ON production(topic_id)',

    // production_history 表索引
    'CREATE INDEX IF NOT EXISTS idx_production_history_production ON production_history(production_id)',

    // comments 表索引
    'CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id)',

    // messages 表索引
    'CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(user_id, read)',

    // activity_log 表索引
    'CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at)',

    // shooting 表索引
    'CREATE INDEX IF NOT EXISTS idx_shooting_topic ON shooting(topic_id)',

    // publishing 表索引
    'CREATE INDEX IF NOT EXISTS idx_publishing_topic ON publishing(topic_id)',

    // analytics 表索引
    'CREATE INDEX IF NOT EXISTS idx_analytics_topic ON analytics(topic_id)',

    // inspirations 表索引
    'CREATE INDEX IF NOT EXISTS idx_inspirations_creator ON inspirations(creator_id)',

    // inspiration_votes 表索引
    'CREATE INDEX IF NOT EXISTS idx_inpiration_votes_inspiration ON inspiration_votes(inspiration_id)',
    'CREATE INDEX IF NOT EXISTS idx_inpiration_votes_user ON inspiration_votes(user_id)',

    // inspiration_comments 表索引
    'CREATE INDEX IF NOT EXISTS idx_inspiration_comments_inspiration ON inspiration_comments(inspiration_id)',
    'CREATE INDEX IF NOT EXISTS idx_inspiration_comments_creator ON inspiration_comments(creator_id)',

    // achievements 表索引
    'CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id)',

    // calendar_events 表索引
    'CREATE INDEX IF NOT EXISTS idx_calendar_events_creator ON calendar_events(creator_id)',
    'CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date)',

    // douyin 表索引
    'CREATE INDEX IF NOT EXISTS idx_douyin_snapshots_account ON douyin_snapshots(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_douyin_snapshots_scraped_at ON douyin_snapshots(scraped_at)',
    'CREATE INDEX IF NOT EXISTS idx_douyin_videos_snapshot ON douyin_videos(snapshot_id)',

    // social-review 表索引
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_social_accounts_platform_external ON social_accounts(platform, external_account_id)',
    'CREATE INDEX IF NOT EXISTS idx_social_accounts_credential_ref ON social_accounts(credential_ref)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_social_snapshots_account_date ON social_snapshots(account_id, snapshot_date)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_social_videos_platform_external_snapshot ON social_videos(platform, external_video_id, snapshot_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_social_videos_account_external ON social_videos(platform, account_id, external_video_id) WHERE external_video_id IS NOT NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_social_videos_platform_internal ON social_videos(platform, internal_video_key)',
    'CREATE INDEX IF NOT EXISTS idx_social_ingestion_jobs_account ON social_ingestion_jobs(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_social_ingestion_jobs_status ON social_ingestion_jobs(status)',
    'CREATE INDEX IF NOT EXISTS idx_social_ingestion_jobs_created ON social_ingestion_jobs(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_social_ingestion_jobs_trigger_source ON social_ingestion_jobs(trigger_source)',
    'CREATE INDEX IF NOT EXISTS idx_social_ingestion_jobs_failure_type ON social_ingestion_jobs(failure_type)',
    'CREATE INDEX IF NOT EXISTS idx_social_scheduled_jobs_enabled_next ON social_scheduled_jobs(enabled, next_run_at)',
    'CREATE INDEX IF NOT EXISTS idx_social_scheduled_jobs_account ON social_scheduled_jobs(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_social_ingestion_health_updated ON social_ingestion_health(updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_social_metric_rollups_scope ON social_metric_rollups(scope_date)',
    'CREATE INDEX IF NOT EXISTS idx_social_metric_rollups_platform ON social_metric_rollups(platform)',
    'CREATE INDEX IF NOT EXISTS idx_social_metric_rollups_metric ON social_metric_rollups(metric_key)',
    'CREATE INDEX IF NOT EXISTS idx_social_credentials_account ON social_credentials(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_social_credentials_status ON social_credentials(status)',
    'CREATE INDEX IF NOT EXISTS idx_social_login_sessions_account_status ON social_login_sessions(account_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_video_performance_scores_video ON video_performance_scores(video_id)',
    'CREATE INDEX IF NOT EXISTS idx_video_tags_video ON video_tags(video_id)',
    'CREATE INDEX IF NOT EXISTS idx_video_metric_snapshots_date ON video_metric_snapshots(snapshot_date)',
    'CREATE INDEX IF NOT EXISTS idx_video_metric_snapshots_video ON video_metric_snapshots(video_id)',
    'CREATE INDEX IF NOT EXISTS idx_video_insights_video ON video_insights(video_id)',
    'CREATE INDEX IF NOT EXISTS idx_video_content_features_video ON video_content_features(video_id)',
    'CREATE INDEX IF NOT EXISTS idx_video_content_features_type_value ON video_content_features(feature_type, feature_value)',
    'CREATE INDEX IF NOT EXISTS idx_social_review_reports_account_created ON social_review_reports(account_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_social_operation_suggestions_account ON social_operation_suggestions(account_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_content_categories_name ON content_categories(name)',
    'CREATE INDEX IF NOT EXISTS idx_video_category_relations_category ON video_category_relations(category_id)',

    // editing 表索引
    'CREATE INDEX IF NOT EXISTS idx_editing_topic ON editing(topic_id)',

    // pomodoro_sessions 表索引
    'CREATE INDEX IF NOT EXISTS idx_pomodoro_user ON pomodoro_sessions(user_id)',

    // notification_preferences 表索引
    'CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id)',

    // daily report 表索引
    'CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, report_date)',
    'CREATE INDEX IF NOT EXISTS idx_daily_reports_date_status ON daily_reports(report_date, status)',
    'CREATE INDEX IF NOT EXISTS idx_daily_reports_team_date ON daily_reports(team_id, report_date)',
    'CREATE INDEX IF NOT EXISTS idx_daily_report_items_report ON daily_report_items(report_id)',
    'CREATE INDEX IF NOT EXISTS idx_daily_report_subscriptions_subscriber ON daily_report_subscriptions(subscriber_id)',

    // retrospectives 表索引
    'CREATE INDEX IF NOT EXISTS idx_retrospectives_status_period ON retrospectives(status, period_start, period_end)',
    'CREATE INDEX IF NOT EXISTS idx_retrospectives_scope ON retrospectives(scope_type, scope_id)',
    'CREATE INDEX IF NOT EXISTS idx_retrospectives_owner ON retrospectives(owner_id)',
    'CREATE INDEX IF NOT EXISTS idx_retro_metric_snapshots_retro ON retro_metric_snapshots(retro_id)',
    'CREATE INDEX IF NOT EXISTS idx_retro_metric_snapshots_key ON retro_metric_snapshots(metric_key)',
    'CREATE INDEX IF NOT EXISTS idx_retro_actions_retro ON retro_actions(retro_id)',
    'CREATE INDEX IF NOT EXISTS idx_retro_actions_owner_status ON retro_actions(owner_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_retro_actions_due_status ON retro_actions(due_date, status)',
  ];

  for (const sql of indexes) {
    try {
      await db.execute(sql);
    } catch (error) {
      console.warn(`[DB] 索引创建失败: ${sql}`);
      console.warn(`[DB] 原因: ${getDbErrorMessage(error)}`);
    }
  }

  console.log('[DB] 索引创建完成');
}

// libsql 直接写文件，不需要手动 save/close
export function saveDatabase() {
  // no-op: libsql 自动持久化
}

export function closeDatabase() {
  // libsql 客户端会自动关闭连接池
  console.log('[DB] 数据库连接关闭（libsql 自动管理）');
}
