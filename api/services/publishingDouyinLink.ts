import { queryAll, queryOne, runInTransaction } from '../database/utils.js';

export type PublishingTitle = {
  id: number;
  title: string;
};

export type DouyinWorkCandidate = {
  id: number;
  account_id: number;
  title: string;
  publish_time?: string | null;
  play_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  linked_publishing_id?: number | null;
};

export type PublishingDouyinMatchMethod = 'exact' | 'containment' | 'fuzzy' | 'manual';

export type RankedDouyinWork = DouyinWorkCandidate & {
  match_method: Exclude<PublishingDouyinMatchMethod, 'manual'>;
  match_score: number;
};

const AUTO_MATCH_THRESHOLD = 0.86;
const AUTO_MATCH_MARGIN = 0.08;
const MIN_CONTAINMENT_LENGTH = 3;

export function normalizePublishingTitle(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function titleVariants(value: unknown) {
  const raw = String(value ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN');
  const pieces = raw.split(/[\n#｜|：:，,。；;！!？?（）()【】[\]《》<>—–-]+/u);
  return [...new Set([raw, ...pieces].map(normalizePublishingTitle).filter(Boolean))];
}

function levenshteinSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + Number(left[leftIndex - 1] !== right[rightIndex - 1]),
      );
      diagonal = above;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

export function scorePublishingDouyinTitle(publishingTitle: unknown, douyinTitle: unknown) {
  const publishing = normalizePublishingTitle(publishingTitle);
  const fullDouyinTitle = normalizePublishingTitle(douyinTitle);
  const variants = titleVariants(douyinTitle);
  if (!publishing || variants.length === 0) return { score: 0, method: 'fuzzy' as const };
  if (variants.includes(publishing)) return { score: 1, method: 'exact' as const };
  if (
    publishing.length >= MIN_CONTAINMENT_LENGTH
    && (fullDouyinTitle.includes(publishing) || publishing.includes(fullDouyinTitle))
  ) {
    return { score: 0.96, method: 'containment' as const };
  }
  const score = Math.max(...variants.map((variant) => levenshteinSimilarity(publishing, variant)));
  return { score: Math.round(score * 10_000) / 10_000, method: 'fuzzy' as const };
}

export function rankPublishingDouyinCandidates(publishingTitle: unknown, works: DouyinWorkCandidate[]) {
  return works
    .map((work): RankedDouyinWork => {
      const match = scorePublishingDouyinTitle(publishingTitle, work.title);
      return { ...work, match_method: match.method, match_score: match.score };
    })
    .sort((left, right) => right.match_score - left.match_score
      || Date.parse(String(right.publish_time || '')) - Date.parse(String(left.publish_time || ''))
      || right.id - left.id);
}

export function chooseAutomaticPublishingDouyinMatch(publishingTitle: unknown, works: DouyinWorkCandidate[]) {
  const ranked = rankPublishingDouyinCandidates(publishingTitle, works);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.match_score < AUTO_MATCH_THRESHOLD) return null;
  if (second && best.match_score - second.match_score < AUTO_MATCH_MARGIN) return null;
  return best;
}

export async function reconcilePublishingDouyinLinks(options: { accountId?: number; createdBy?: number } = {}) {
  const publishingRows = await queryAll<PublishingTitle>(`
    SELECT p.id,t.title
    FROM publishing p
    JOIN topics t ON t.id=p.topic_id
    LEFT JOIN publishing_douyin_links link ON link.publishing_id=p.id
    WHERE link.publishing_id IS NULL
    ORDER BY p.id
  `);
  const params: unknown[] = [];
  let workSql = `
    SELECT w.id,w.account_id,w.title,w.publish_time,w.play_count,w.like_count,w.comment_count,w.share_count
    FROM douyin_works w
    LEFT JOIN publishing_douyin_links link ON link.douyin_work_id=w.id
    WHERE link.douyin_work_id IS NULL
  `;
  if (options.accountId) {
    workSql += ' AND w.account_id=?';
    params.push(options.accountId);
  }
  const works = await queryAll<DouyinWorkCandidate>(`${workSql} ORDER BY w.publish_time DESC,w.id DESC`, params);
  const proposals = publishingRows.flatMap((publishing) => {
    const match = chooseAutomaticPublishingDouyinMatch(publishing.title, works);
    return match ? [{ publishing, match }] : [];
  });
  const proposalsByWork = new Map<number, typeof proposals>();
  for (const proposal of proposals) {
    proposalsByWork.set(proposal.match.id, [...(proposalsByWork.get(proposal.match.id) || []), proposal]);
  }
  const accepted = [...proposalsByWork.values()].flatMap((conflicts) => {
    const ordered = [...conflicts].sort((left, right) => right.match.match_score - left.match.match_score);
    if (ordered.length === 1) return ordered;
    return ordered[0].match.match_score - ordered[1].match.match_score >= AUTO_MATCH_MARGIN ? [ordered[0]] : [];
  });

  if (accepted.length > 0) {
    await runInTransaction(async (tx) => {
      for (const { publishing, match } of accepted) {
        await tx.execute(`
          INSERT OR IGNORE INTO publishing_douyin_links(
            publishing_id,douyin_work_id,match_method,match_score,created_by,created_at,updated_at
          ) VALUES(?,?,?,?,?,datetime('now','+8 hours'),datetime('now','+8 hours'))
        `, [publishing.id, match.id, match.match_method, match.match_score, options.createdBy ?? null]);
      }
    });
  }

  return {
    linked: accepted.length,
    reviewed: publishingRows.length,
    ambiguous: proposals.length - accepted.length,
    unmatched: publishingRows.length - proposals.length,
  };
}

export async function getPublishingDouyinCandidates(publishingId: number, query?: string) {
  const publishing = await queryOne<PublishingTitle>(`
    SELECT p.id,t.title FROM publishing p JOIN topics t ON t.id=p.topic_id WHERE p.id=?
  `, [publishingId]);
  if (!publishing) return null;
  const works = await queryAll<DouyinWorkCandidate>(`
    SELECT w.id,w.account_id,w.title,w.publish_time,w.play_count,w.like_count,w.comment_count,w.share_count,
           link.publishing_id linked_publishing_id
    FROM douyin_works w
    LEFT JOIN publishing_douyin_links link ON link.douyin_work_id=w.id
    ORDER BY w.publish_time DESC,w.id DESC
  `);
  const ranked = rankPublishingDouyinCandidates(query?.trim() || publishing.title, works);
  return {
    publishing,
    candidates: ranked.slice(0, 20),
  };
}

export async function setPublishingDouyinLink(
  publishingId: number,
  douyinWorkId: number | null,
  createdBy?: number,
) {
  if (douyinWorkId === null) {
    await runInTransaction(async (tx) => {
      await tx.execute('DELETE FROM publishing_douyin_links WHERE publishing_id=?', [publishingId]);
    });
    return { linked: false };
  }
  const publishing = await queryOne<{ id: number }>('SELECT id FROM publishing WHERE id=?', [publishingId]);
  const work = await queryOne<{ id: number }>('SELECT id FROM douyin_works WHERE id=?', [douyinWorkId]);
  if (!publishing || !work) return null;
  const conflict = await queryOne<{ publishing_id: number }>(
    'SELECT publishing_id FROM publishing_douyin_links WHERE douyin_work_id=? AND publishing_id<>?',
    [douyinWorkId, publishingId],
  );
  if (conflict) return { conflictPublishingId: Number(conflict.publishing_id) };
  await runInTransaction(async (tx) => {
    await tx.execute(`
      INSERT INTO publishing_douyin_links(
        publishing_id,douyin_work_id,match_method,match_score,created_by,created_at,updated_at
      ) VALUES(?,?, 'manual',1,?,datetime('now','+8 hours'),datetime('now','+8 hours'))
      ON CONFLICT(publishing_id) DO UPDATE SET
        douyin_work_id=excluded.douyin_work_id,
        match_method='manual',
        match_score=1,
        created_by=excluded.created_by,
        updated_at=excluded.updated_at
    `, [publishingId, douyinWorkId, createdBy ?? null]);
  });
  return { linked: true, douyinWorkId };
}
