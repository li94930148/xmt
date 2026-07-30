import type { DatabaseMigration } from './types';

const PUBLIC_RESOURCE_ROLES = ['member', 'editor', 'copywriter', 'post_production', 'camera'] as const;
const MANAGEMENT_PERMISSIONS = ['resource:create', 'resource:update', 'resource:delete', 'resource:manage', 'resource:category_manage', 'resource:import', 'resource:audit'] as const;

export const resourceUsagePermissionsMigration: DatabaseMigration = {
  version: '003',
  name: 'resource_usage_permissions',
  checksum: '003-resource-usage-permissions-v1',
  async up(executor) {
    for (const roleCode of PUBLIC_RESOURCE_ROLES) {
      await executor.execute({
        sql: `
          INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
          SELECT r.id, p.id FROM roles r, permissions p
          WHERE r.code = ? AND p.code IN ('resource:view', 'resource:download')
        `,
        args: [roleCode],
      });
      await executor.execute({
        sql: `
          DELETE FROM role_permissions
          WHERE role_id = (SELECT id FROM roles WHERE code = ?)
            AND permission_id IN (
              SELECT id FROM permissions WHERE code IN (${MANAGEMENT_PERMISSIONS.map(() => '?').join(', ')})
            )
        `,
        args: [roleCode, ...MANAGEMENT_PERMISSIONS],
      });
    }
  },
};
