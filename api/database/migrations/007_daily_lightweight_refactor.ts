import type { DatabaseMigration } from './types';

export const dailyLightweightRefactorMigration: DatabaseMigration = {
  version: '007',
  name: 'daily_lightweight_refactor',
  checksum: '007-daily-lightweight-refactor-v1',
  async up(executor) {
    for (const statement of [
      `ALTER TABLE monthly_summaries ADD COLUMN work_summary_md TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE monthly_summaries ADD COLUMN key_projects_md TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE monthly_summaries ADD COLUMN issues_plan_md TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE yearly_summaries ADD COLUMN annual_summary_md TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE yearly_summaries ADD COLUMN achievements_md TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE yearly_summaries ADD COLUMN shortcomings_md TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE yearly_summaries ADD COLUMN next_year_plan_md TEXT NOT NULL DEFAULT ''`,
    ]) {
      try {
        await executor.execute(statement);
      } catch {
        // Existing installations may already contain an individual column.
      }
    }

    const permissions = [
      ['report:daily:view_team', '查看团队日报'],
      ['report:daily:archive', '查看日报归档'],
    ] as const;
    for (const [code, name] of permissions) {
      await executor.execute({
        sql: `INSERT OR IGNORE INTO permissions (code, name, module) VALUES (?, ?, 'report')`,
        args: [code, name],
      });
    }

    await executor.execute(`
      INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r CROSS JOIN permissions p
      WHERE r.code IN ('member', 'editor') AND p.code = 'report:daily:view_team'
    `);
  },
};
