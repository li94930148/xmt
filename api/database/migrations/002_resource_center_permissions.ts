import type { DatabaseMigration } from './types';

const RESOURCE_PERMISSIONS: ReadonlyArray<readonly [string, string]> = [
  ['resource:view', '查看资料中心'],
  ['resource:create', '创建资料'],
  ['resource:update', '更新资料'],
  ['resource:delete', '删除与恢复资料'],
  ['resource:download', '下载资料文件'],
  ['resource:manage', '管理全部资料'],
  ['resource:category_manage', '管理资料分类与标签'],
  ['resource:import', '导入资料'],
  ['resource:audit', '查看资料审计'],
];

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  admin: RESOURCE_PERMISSIONS.map(([code]) => code),
  director: RESOURCE_PERMISSIONS.map(([code]) => code),
  editor: ['resource:view', 'resource:create', 'resource:update', 'resource:download'],
  copywriter: ['resource:view', 'resource:create', 'resource:update', 'resource:download'],
  post_production: ['resource:view', 'resource:create', 'resource:update', 'resource:download'],
  camera: ['resource:view', 'resource:create', 'resource:update', 'resource:download'],
  member: ['resource:view', 'resource:download'],
};

export const resourceCenterPermissionsMigration: DatabaseMigration = {
  version: '002',
  name: 'resource_center_permissions',
  checksum: '002-resource-center-permissions-v1',
  async up(executor) {
    for (const [code, name] of RESOURCE_PERMISSIONS) {
      await executor.execute({
        sql: `INSERT OR IGNORE INTO permissions (code, name, module) VALUES (?, ?, 'resource')`,
        args: [code, name],
      });
    }

    for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
      for (const permissionCode of permissionCodes) {
        await executor.execute({
          sql: `
            INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM roles r, permissions p
            WHERE r.code = ? AND p.code = ?
          `,
          args: [roleCode, permissionCode],
        });
      }
    }
  },
};
