import type { DatabaseMigration } from './types';

export const dailyWorkspaceV2Migration: DatabaseMigration = {
  version: '006',
  name: 'daily_workspace_v2',
  checksum: '006-daily-workspace-v2-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS monthly_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        content_md TEXT NOT NULL DEFAULT '',
        ai_summary_json TEXT,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE(user_id, year, month),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS yearly_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        content_md TEXT NOT NULL DEFAULT '',
        ai_summary_json TEXT,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE(user_id, year),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    for (const statement of [
      `ALTER TABLE daily_report_templates ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE daily_report_templates ADD COLUMN user_id INTEGER`,
    ]) {
      try { await executor.execute(statement); } catch { /* existing installations */ }
    }
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_daily_reports_date_status ON daily_reports(report_date, status)`);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, report_date)`);
  },
};
