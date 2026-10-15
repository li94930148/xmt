export type CreatorTopicSuggestion = {
  id: string;
  /** Stable hash of the exact sample IDs and metric values behind this recommendation. */
  evidence_id: string;
  label: string;
  direction: string;
  age_band: string;
  sample_count: number;
  baseline_count: number;
  median_plays: number;
  baseline_median_plays: number;
  play_ratio: number;
  samples: Array<{ id: number; title: string; play_count: number }>;
  baseline_samples: Array<{ id: number; title: string; play_count: number }>;
  feedback?: CreatorTopicSuggestionFeedback;
};

export type CreatorTopicSuggestionOutcome = 'adopted' | 'not_adopted';

export type CreatorTopicSuggestionFeedback = {
  my_outcome: CreatorTopicSuggestionOutcome | null;
  adopted_count: number;
  not_adopted_count: number;
};

export type CreatorTopicSuggestions = {
  status: 'ready' | 'insufficient_data' | 'no_signal';
  account_uid: string;
  source: 'douyin_works';
  evaluated_at: string;
  eligible_count: number;
  excluded_count: number;
  methodology: string;
  items: CreatorTopicSuggestion[];
};
