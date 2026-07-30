import { resourceCenterFoundationMigration } from './001_resource_center_foundation';
import { resourceCenterPermissionsMigration } from './002_resource_center_permissions';
import { resourceUsagePermissionsMigration } from './003_resource_usage_permissions';
import { productionResourcePermissionsMigration } from './004_production_resource_permissions';
import { authSessionFoundationMigration } from './005_auth_session_foundation';
import type { DatabaseMigration } from './types';

export const databaseMigrations: readonly DatabaseMigration[] = [
  resourceCenterFoundationMigration,
  resourceCenterPermissionsMigration,
  resourceUsagePermissionsMigration,
  productionResourcePermissionsMigration,
  authSessionFoundationMigration,
];
