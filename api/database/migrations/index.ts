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
import { productionMaterialsWorkspaceMigration } from './010_production_materials_workspace';
import { productionMaterialDraftMigration } from './011_production_material_draft';
import { activityLogTimeRetentionMigration } from './012_activity_log_time_retention';
import { publishingDouyinLinkMigration } from './013_publishing_douyin_link';
import { creatorOfficialDailyMetricsMigration } from './014_creator_official_daily_metrics';
import { integrityRemediationMigration } from './015_integrity_remediation';
import { inspirationTopicLinkMigration } from './016_inspiration_topic_link';
import { topicAssetDimensionsMigration } from './017_topic_asset_dimensions';
import { productionReviewThreadsMigration } from './018_production_review_threads';
import { publishingMetricSourcesMigration } from './019_publishing_metric_sources';
import { collaborationRuntimePersistenceMigration } from './020_collaboration_runtime_persistence';
import { creatorTopicSuggestionFeedbackMigration } from './021_creator_topic_suggestion_feedback';
import { creatorTopicSuggestionTopicLinksMigration } from './022_creator_topic_suggestion_topic_links';
import { creatorSyncSingleFlightMigration } from './023_creator_sync_single_flight';
import { distributedJobLeasesMigration } from './024_distributed_job_leases';
import { topicStageEnteredAtMigration } from './025_topic_stage_entered_at';
import { workflowScriptSourceMigration } from './026_workflow_script_source';
import { productionOutlineOriginSnapshotMigration } from './027_production_outline_origin_snapshot';
import { productionMaterialHistorySnapshotMigration } from './028_production_material_history_snapshot';
import { workflowDocumentVersionsMigration } from './029_workflow_document_versions';
import { productionOutlineSourceVersionMigration } from './030_production_outline_source_version';
import { creatorSyncClaimLeaseMigration } from './031_creator_sync_claim_lease';

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
  productionMaterialsWorkspaceMigration,
  productionMaterialDraftMigration,
  activityLogTimeRetentionMigration,
  publishingDouyinLinkMigration,
  creatorOfficialDailyMetricsMigration,
  integrityRemediationMigration,
  inspirationTopicLinkMigration,
  topicAssetDimensionsMigration,
  productionReviewThreadsMigration,
  publishingMetricSourcesMigration,
  collaborationRuntimePersistenceMigration,
  creatorTopicSuggestionFeedbackMigration,
  creatorTopicSuggestionTopicLinksMigration,
  creatorSyncSingleFlightMigration,
  distributedJobLeasesMigration,
  topicStageEnteredAtMigration,
  workflowScriptSourceMigration,
  productionOutlineOriginSnapshotMigration,
  productionMaterialHistorySnapshotMigration,
  workflowDocumentVersionsMigration,
  productionOutlineSourceVersionMigration,
  creatorSyncClaimLeaseMigration,
];
