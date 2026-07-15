import type { NormalizedAccountSnapshot, NormalizedVideoSnapshot, SocialAccount } from '@shared/types/social-review';

export type SocialCollectResult = {
  accountSnapshot: NormalizedAccountSnapshot;
  videos: NormalizedVideoSnapshot[];
  diagnostics?: SocialCollectDiagnostic[];
};

export type SocialCollectOptions = {
  contentPath?: string | null;
  exportPath?: string | null;
  collectMode?: 'standard' | 'official-export' | 'creator-item-api';
};

export interface SocialReviewAdapter {
  collect(account: SocialAccount, options?: SocialCollectOptions): Promise<SocialCollectResult>;
}

export type SocialCollectDiagnostic = {
  type:
    | 'credential_valid'
    | 'credential_expired'
    | 'page_loaded'
    | 'account_metrics_parsed'
    | 'video_list_found'
    | 'video_list_empty'
    | 'video_list_parse_failed'
    | 'video_items_parsed'
    | 'video_items_skipped'
    | 'creator_page_loaded'
    | 'content_entry_tried'
    | 'content_entry_candidate_seen'
    | 'content_entry_clicked'
    | 'content_entry_path_changed'
    | 'content_manual_path_used'
    | 'content_manual_path_normalized'
    | 'content_manual_path_matched'
    | 'content_entry_failed'
    | 'content_entry_matched'
    | 'content_entry_not_found'
    | 'content_entry_permission_denied'
    | 'content_entry_login_required'
    | 'content_manage_page_loaded'
    | 'content_manage_page_missing'
    | 'structure_probe_done'
    | 'table_candidates_found'
    | 'card_candidates_found'
    | 'video_link_candidates_found'
    | 'api_candidates_found'
    | 'api_candidate_seen'
    | 'api_candidate_classified'
    | 'api_candidate_comment_notice'
    | 'api_candidate_work_list'
    | 'api_candidate_account_metric'
    | 'api_field_sample_counted'
    | 'api_array_path_candidate_found'
    | 'api_work_items_extracted'
    | 'api_work_items_empty'
    | 'api_work_items_skipped_no_stable_id'
    | 'video_candidate_id_path_summary'
    | 'video_candidate_work_semantics_summary'
    | 'video_candidate_skipped_no_id_field'
    | 'video_candidate_skipped_empty_id'
    | 'video_candidate_skipped_comment_notice_id'
    | 'video_candidate_skipped_unstable_id'
    | 'video_candidate_skipped_no_work_semantics'
    | 'video_candidate_skipped_url_id_extract_failed'
    | 'video_candidate_skipped_duplicate'
    | 'work_api_triggered'
    | 'work_api_not_triggered'
    | 'work_api_field_mismatch'
    | 'work_api_items_extracted'
    | 'work_api_items_saved'
    | 'no_video_candidates'
    | 'table_parse_success'
    | 'table_parse_failed'
    | 'card_parse_success'
    | 'card_parse_failed'
    | 'link_parse_success'
    | 'link_parse_failed'
    | 'api_parse_success'
    | 'api_parse_failed'
    | 'video_items_skipped_no_stable_id'
    | 'video_items_saved'
    | 'video_items_empty_with_reason'
    | 'video_items_deduped'
    | 'export_button_found'
    | 'export_button_not_found'
    | 'export_download_started'
    | 'export_download_completed'
    | 'export_download_failed'
    | 'export_download_timeout'
    | 'export_downloader_entered'
    | 'export_page_state_checked'
    | 'export_page_navigation_attempted'
    | 'export_incomplete'
    | 'export_file_detected'
    | 'export_file_parse_success'
    | 'export_file_parse_failed'
    | 'export_rows_parsed'
    | 'export_rows_skipped_no_stable_id'
    | 'export_videos_saved'
    | 'export_no_video_rows'
    | 'export_fields_unmapped'
    | 'export_file_columns_analyzed'
    | 'export_id_candidates_identified'
    | 'official_export_asset_mode'
    | 'video_asset_generated_count'
    | 'video_external_id_count'
    | 'video_internal_key_count'
    | 'video_inserted_count'
    | 'video_duplicate_count'
    | 'collect_mode_received'
    | 'collect_mode_official_export_selected'
    | 'collect_mode_creator_item_api_selected'
    | 'creator_item_api_page_collected'
    | 'creator_item_api_pagination_stopped'
    | 'performance_api_called'
    | 'performance_item_count'
    | 'performance_metric_received'
    | 'performance_update_count'
    | 'performance_missing_item_count'
    | 'export_mode_selected'
    | 'adapter_runtime_probe'
    | 'export_content_path_received'
    | 'network_failed'
    | 'browser_failed'
    | 'page_structure_changed';
  message: string;
  count?: number;
  at: string;
  strategy?: string;
  safePathname?: string;
  candidateType?: string;
  fieldHitCounts?: Record<string, number>;
  arrayPathCandidateCount?: number;
  fieldPathStats?: Record<string, {
    hits: number;
    typeCounts: Record<string, number>;
    minLength: number | null;
    maxLength: number | null;
    avgLength: number | null;
    looksLike: Record<string, number>;
    blacklisted: boolean;
    sources: string[];
  }>;
  workSemanticHitCounts?: Record<string, number>;
  skipReasonCounts?: Record<string, number>;
  fileType?: string;
  parsedRowCount?: number;
  skippedRowCount?: number;
  savedVideoCount?: number;
  unmappedFieldCount?: number;
  adapterVersion?: string;
  collectMode?: string;
  hasContentPath?: boolean;
  columnNames?: string[];
  columnStats?: Array<{ name: string; typeCounts: Record<string, number>; emptyCount: number; nonEmptyCount: number }>;
};
