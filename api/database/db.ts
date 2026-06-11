﻿﻿﻿import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'xmt.db');
const dbDir = path.dirname(dbPath);

// libsql 客户端 - 直接读写 SQLite 文件，不需要手动持久化
export const db = createClient({
  url: `file:${dbPath}`,
});

export async function initDatabase() {
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
    await db.execute({ sql: `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)`, args: ['director', '编导', '管理级权限', 1] });
    await db.execute({ sql: `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)`, args: ['member', '成员', '基础权限', 1] });
    await db.execute({ sql: `INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)`, args: ['editor', '编辑', '内容编辑权限', 1] });

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
      // 系统模块
      ['system:backup', '系统备份', 'system'],
      ['system:announcement', '管理公告', 'system'],
      ['system:template', '管理模板', 'system'],
      ['system:achievement', '管理成就', 'system'],
      ['system:douyin', '管理抖音数据', 'system'],
      ['system:role', '管理角色', 'system'],
      ['system:permission', '管理权限', 'system'],
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
    const memberPerms = await db.execute(`SELECT id FROM permissions WHERE code IN ('topic:create', 'topic:view', 'topic:update', 'workflow:comment', 'analytics:view', 'export:data')`);
    for (const perm of memberPerms.rows) {
      await db.execute({ sql: `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, args: [memberRoleId, perm.id] });
    }

    // editor 拥有内容编辑相关权限
    const editorRole = await db.execute(`SELECT id FROM roles WHERE code = 'editor'`);
    const editorRoleId = editorRole.rows[0].id;
    const editorPerms = await db.execute(`SELECT id FROM permissions WHERE code IN ('topic:view', 'topic:update', 'workflow:production', 'workflow:comment', 'analytics:view')`);
    for (const perm of editorPerms.rows) {
      await db.execute({ sql: `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, args: [editorRoleId, perm.id] });
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
  const migrated = await db.execute({
    sql: `SELECT value FROM app_meta WHERE key = ?`,
    args: ['tz_migration_20260611'],
  });

  if (migrated.rows.length > 0) {
    return;
  }

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
    'CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(start_time)',

    // pomodoro_sessions 表索引
    'CREATE INDEX IF NOT EXISTS idx_pomodoro_user ON pomodoro_sessions(user_id)',

    // notification_preferences 表索引
    'CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id)',
  ];

  for (const sql of indexes) {
    try {
      await db.execute(sql);
    } catch (e) {
      // 索引可能已存在，忽略错误
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
