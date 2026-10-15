import { execute, queryAll } from '../database/utils.js';
import type {
  CreatorTopicSuggestion,
  CreatorTopicSuggestionFeedback,
  CreatorTopicSuggestionOutcome,
} from '../../shared/types/creator-topic-suggestions.js';

type FeedbackRow = {
  suggestion_id: string;
  evidence_id: string;
  my_outcome: CreatorTopicSuggestionOutcome | null;
  adopted_count: number;
  not_adopted_count: number;
};

const emptyFeedback = (): CreatorTopicSuggestionFeedback => ({
  my_outcome: null,
  adopted_count: 0,
  not_adopted_count: 0,
});

export async function attachCreatorTopicSuggestionFeedback(
  creatorAccountId: number,
  userId: number,
  items: CreatorTopicSuggestion[],
) {
  if (items.length === 0) return items;
  const ids = [...new Set(items.map(item => item.id))];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await queryAll<FeedbackRow>(
    `SELECT suggestion_id, evidence_id,
       MAX(CASE WHEN user_id = ? THEN outcome END) AS my_outcome,
       SUM(CASE WHEN outcome = 'adopted' THEN 1 ELSE 0 END) AS adopted_count,
       SUM(CASE WHEN outcome = 'not_adopted' THEN 1 ELSE 0 END) AS not_adopted_count
     FROM creator_topic_suggestion_feedback
     WHERE creator_account_id = ? AND suggestion_id IN (${placeholders})
     GROUP BY suggestion_id, evidence_id`,
    [userId, creatorAccountId, ...ids],
  );
  const summaries = new Map(rows.map(row => [`${row.suggestion_id}:${row.evidence_id}`, {
    my_outcome: row.my_outcome,
    adopted_count: Number(row.adopted_count),
    not_adopted_count: Number(row.not_adopted_count),
  } satisfies CreatorTopicSuggestionFeedback]));
  return items.map(item => ({
    ...item,
    feedback: summaries.get(`${item.id}:${item.evidence_id}`) ?? emptyFeedback(),
  }));
}

export async function saveCreatorTopicSuggestionFeedback(input: {
  creatorAccountId: number;
  userId: number;
  item: CreatorTopicSuggestion;
  outcome: CreatorTopicSuggestionOutcome;
}) {
  const { creatorAccountId, userId, item, outcome } = input;
  await execute(
    `INSERT INTO creator_topic_suggestion_feedback (
       creator_account_id, user_id, suggestion_id, evidence_id, outcome,
       sample_count, baseline_count, median_plays, baseline_median_plays, play_ratio
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(creator_account_id, user_id, suggestion_id, evidence_id) DO UPDATE SET
       outcome = excluded.outcome,
       sample_count = excluded.sample_count,
       baseline_count = excluded.baseline_count,
       median_plays = excluded.median_plays,
       baseline_median_plays = excluded.baseline_median_plays,
       play_ratio = excluded.play_ratio,
       updated_at = datetime('now', '+8 hours')`,
    [creatorAccountId, userId, item.id, item.evidence_id, outcome, item.sample_count,
      item.baseline_count, item.median_plays, item.baseline_median_plays, item.play_ratio],
  );
  const rows = await attachCreatorTopicSuggestionFeedback(creatorAccountId, userId, [item]);
  return rows[0]?.feedback ?? emptyFeedback();
}
