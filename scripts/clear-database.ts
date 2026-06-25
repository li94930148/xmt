import initSqlJs from 'sql.js';
import fs from 'fs';
import { getDatabasePath } from '../api/database/path';

const dbPath = getDatabasePath();

async function clearDatabase() {
  console.log('正在清空数据库...');
  
  const SQL = await initSqlJs({
    locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
  });
  
  let db;
  if (fs.existsSync(dbPath)) {
    const data = new Uint8Array(fs.readFileSync(dbPath));
    db = new SQL.Database(data);
  } else {
    console.log('数据库文件不存在');
    return;
  }
  
  const tables = [
    'topic_history',
    'production_history',
    'comments',
    'production',
    'shooting',
    'topics',
    'messages',
    'resources',
    'analytics'
  ];
  
  for (const table of tables) {
    try {
      db.run(`DELETE FROM ${table}`);
      console.log(`已清空表: ${table}`);
    } catch (error) {
      console.log(`清空表 ${table} 时出错:`, error);
    }
  }
  
  const users = db.exec(`SELECT * FROM users`);
  if (users.length > 0 && users[0].values.length > 0) {
    console.log('\n保留的用户账号:');
    for (const row of users[0].values) {
      console.log(`  - ${row[5]} (${row[1]}): ${row[6]}`);
    }
  }
  
  db.run(`
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
  
  db.run(`
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      platform TEXT,
      deadline DATETIME,
      creator_id INTEGER,
      assignee_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS topic_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      action TEXT NOT NULL,
      comment TEXT,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
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
  
  db.run(`
    CREATE TABLE IF NOT EXISTS production_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      production_id INTEGER,
      version TEXT,
      content TEXT,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
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
  
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      type TEXT DEFAULT 'info',
      is_read BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filetype TEXT,
      filesize INTEGER,
      uploader_id INTEGER,
      topic_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      date DATE NOT NULL,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  
  console.log('\n数据库已清空！');
  console.log('保留的用户账号:');
  
  const result = db.exec(`SELECT username, name, role FROM users`);
  if (result.length > 0) {
    for (const row of result[0].values) {
      console.log(`  - ${row[0]} (${row[1]}) - ${row[2]}`);
    }
  } else {
    console.log('  (无用户数据)');
  }
  
  db.close();
}

clearDatabase().catch(console.error);
