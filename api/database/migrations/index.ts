import { resourceCenterFoundationMigration } from './001_resource_center_foundation';
import { resourceCenterPermissionsMigration } from './002_resource_center_permissions';
import { resourceUsagePermissionsMigration } from './003_resource_usage_permissions';
import { productionResourcePermissionsMigration } from './004_production_resource_permissions';
import { authSessionFoundationMigration } from './005_auth_session_foundation';
import type { DatabaseMigration } from './types';
import { dailyWorkspaceV2Migration } from './006_daily_workspace_v2';
import { dailyLightweightRefactorMigration } from './007_daily_lightweight_refactor';
import { mobileDeviceRegistryMigration } from './008_mobile_device_registry';
import { creatorOfficialExportV2203Migration } from './009_creator_official_export_v2203';

export const databaseMigrations: readonly DatabaseMigration[] = [
  resourceCenterFoundationMigration,
  resourceCenterPermissionsMigration,
  resourceUsagePermissionsMigration,
  productionResourcePermissionsMigration,
  authSessionFoundationMigration,
  dailyWorkspaceV2Migration,
  dailyLightweightRefactorMigration,
  mobileDeviceRegistryMigration,
  creatorOfficialExportV2203Migration,
];
