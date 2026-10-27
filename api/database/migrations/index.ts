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
import { pomodoroCancellationLedgerMigration } from './032_pomodoro_cancellation_state';
import { inspirationCommentIdempotencyMigration } from './033_inspiration_comment_idempotency';
import { inspirationCreateIdempotencyMigration } from './034_inspiration_create_idempotency';
import { publishingCreateIdempotencyMigration } from './035_publishing_create_idempotency';
import { shootingCreateIdempotencyMigration } from './036_shooting_create_idempotency';
import { productionCreateIdempotencyMigration } from './037_production_create_idempotency';
import { calendarEventCreateIdempotencyMigration } from './038_calendar_event_create_idempotency';
import { userUpdateIdempotencyMigration } from './039_user_update_idempotency';
import { userCreateIdempotencyMigration } from './040_user_create_idempotency';
import { userDeleteIdempotencyMigration } from './041_user_delete_idempotency';
import { messageClearIdempotencyMigration } from './042_message_clear_idempotency';
import { retrospectiveCreateIdempotencyMigration } from './043_retrospective_create_idempotency';
import { messageReadAllIdempotencyMigration } from './044_message_read_all_idempotency';
import { workflowTemplateCreateIdempotencyMigration } from './045_workflow_template_create_idempotency';
import { anonymousFeedbackDeleteIdempotencyMigration } from './046_anonymous_feedback_delete_idempotency';
import { retroActionCreateIdempotencyMigration } from './047_retro_action_create_idempotency';
import { announcementCreateIdempotencyMigration } from './048_announcement_create_idempotency';
import { productionReviewReplyIdempotencyMigration } from './049_production_review_reply_idempotency';
import { productionReviewThreadIdempotencyMigration } from './050_production_review_thread_idempotency';
import { productionReviewStatusIdempotencyMigration } from './051_production_review_status_idempotency';
import { creatorAgentBindingCodeRecoveryMigration } from './052_creator_agent_binding_code_recovery';
import { creatorAgentBindResultRecoveryMigration } from './053_creator_agent_bind_result_recovery';
import { inspirationVoteIdempotencyMigration } from './054_inspiration_vote_idempotency';
import { retroActionUpdateIdempotencyMigration } from './055_retro_action_update_idempotency';
import { retroActionUpdateOutcomeMigration } from './056_retro_action_update_outcome';
import { retrospectiveUpdateIdempotencyMigration } from './057_retrospective_update_idempotency';
import { topicCreateIdempotencyMigration } from './058_topic_create_idempotency';
import { resourceCreateIdempotencyMigration } from './059_resource_create_idempotency';
import { resourceUpdateIdempotencyMigration } from './060_resource_update_idempotency';
import { workflowTemplateUpdateIdempotencyMigration } from './061_workflow_template_update_idempotency';
import { resourceCategoryMutationIdempotencyMigration } from './062_resource_category_mutation_idempotency';
import { anonymousFeedbackUpdateIdempotencyMigration } from './063_anonymous_feedback_update_idempotency';
import { topicTemplateMutationIdempotencyMigration } from './064_topic_template_mutation_idempotency';
import { reportSummaryUpdateIdempotencyMigration } from './065_report_summary_update_idempotency';
import { anonymousFeedbackSubmitIdempotencyMigration } from './066_anonymous_feedback_submit_idempotency';

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
  pomodoroCancellationLedgerMigration,
  inspirationCommentIdempotencyMigration,
  inspirationCreateIdempotencyMigration,
  publishingCreateIdempotencyMigration,
  shootingCreateIdempotencyMigration,
  productionCreateIdempotencyMigration,
  calendarEventCreateIdempotencyMigration,
  userUpdateIdempotencyMigration,
  userCreateIdempotencyMigration,
  userDeleteIdempotencyMigration,
  messageClearIdempotencyMigration,
  retrospectiveCreateIdempotencyMigration,
  messageReadAllIdempotencyMigration,
  workflowTemplateCreateIdempotencyMigration,
  anonymousFeedbackDeleteIdempotencyMigration,
  retroActionCreateIdempotencyMigration,
  announcementCreateIdempotencyMigration,
  productionReviewReplyIdempotencyMigration,
  productionReviewThreadIdempotencyMigration,
  productionReviewStatusIdempotencyMigration,
  creatorAgentBindingCodeRecoveryMigration,
  creatorAgentBindResultRecoveryMigration,
  inspirationVoteIdempotencyMigration,
  retroActionUpdateIdempotencyMigration,
  retroActionUpdateOutcomeMigration,
  retrospectiveUpdateIdempotencyMigration,
  topicCreateIdempotencyMigration,
  resourceCreateIdempotencyMigration,
  resourceUpdateIdempotencyMigration,
  workflowTemplateUpdateIdempotencyMigration,
  resourceCategoryMutationIdempotencyMigration,
  anonymousFeedbackUpdateIdempotencyMigration,
  topicTemplateMutationIdempotencyMigration,
  reportSummaryUpdateIdempotencyMigration,
  anonymousFeedbackSubmitIdempotencyMigration,
];
