import type { DatabaseMigration } from './types';

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  admin: ['production:view', 'production:update'],
  director: ['production:view', 'production:update'],
  editor: ['production:view', 'production:update'],
  copywriter: ['production:view', 'production:update'],
  post_production: ['production:view', 'production:update'],
  camera: ['production:view', 'production:update'],
  member: ['production:view'],
};

export const productionResourcePermissionsMigration: DatabaseMigration = {
  version: '004',
  name: 'production_resource_permissions',
  checksum: '004-production-resource-permissions-v1',
  async up(executor) {
    await executor.execute(`INSERT OR IGNORE INTO permissions(code,name,module) VALUES('production:view','查看创作记录','production')`);
    await executor.execute(`INSERT OR IGNORE INTO permissions(code,name,module) VALUES('production:update','更新创作记录','production')`);
    for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
      for (const permissionCode of permissionCodes) {
        await executor.execute({
          sql: `INSERT OR IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=? AND p.code=?`,
          args: [roleCode, permissionCode],
        });
      }
    }
  },
};
