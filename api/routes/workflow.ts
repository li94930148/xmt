﻿﻿﻿﻿﻿﻿﻿﻿import express from 'express';
import { beijingNow, beijingToday, queryOne, queryAll, execute, executeInsert, runInTransaction } from '../database/utils';
import { createHash } from 'node:crypto';
import { authenticate } from '../middleware/auth';
import { noStoreResponse } from '../middleware/no-store';
import { requireAllPermissions, requirePermission, userHasPermission } from '../middleware/permissions';
import { canEditAllContent, canEditProduction, canViewAllContent, canAccessTopic, getTopicScopeById, getTopicScopeByProductionId, getTopicScopeByPublishingId, getTopicScopeByShootingId, resolveCommentTopicScope } from '../utils/access';
import { hasPublishedArchiveScriptDrift, syncPublishedArchive } from '../services/publishedArchive';
import { resolveProductionVersionAction } from '../services/productionVersionAction';
import { advancePublishingTopicIfResolved } from '../modules/topics/publishing-completion';
import { canTransitionTopicStatus, isTopicAtOrBeyondStage } from '@shared/workflow/topic-state-machine';
import { insertTopicOutlineOriginSnapshot } from '../modules/topics/production-origin-snapshot';
import { publishingMetricJoins, publishingMetricSelect } from '../services/publishingMetrics';
import {
  createProductionReviewReply,
  createProductionReviewReplyWithRequest,
  createProductionReviewThread,
  createProductionReviewThreadWithRequest,
  getProductionReviewReplyRequestStatus,
  getProductionReviewStatusRequestStatus,
  getProductionReviewThreadRequestStatus,
  getProductionReviewThread,
  listProductionReviewThreads,
  updateProductionReviewStatus,
  updateProductionReviewStatusWithRequest,
  type ProductionReviewKind,
  type ProductionReviewStatus,
} from '../services/productionReview';
import { buildWorkflowRuntimeContext } from '@shared/workflow/workflow_runtime';
import { broadcastToRoom, getSocketIO } from '../utils/socket';
import { getCollaborationRoomId, getProductionVersionRoomId, COLLABORATION_EVENTS, type VersionSupersededPayload } from '../../src/collaboration/core/events.js';
import {
  getPublishingDouyinCandidates,
  reconcilePublishingDouyinLinks,
  setPublishingDouyinLink,
} from '../services/publishingDouyinLink.js';
import { apiLogger } from '../observability/logger.js';
import {
  getApprovedWorkflowScriptSource,
  isApprovedWorkflowScriptSource,
  parseWorkflowScriptSourceReference,
} from '../services/workflowScriptSource.js';
import {
  deleteWorkflowDocumentVersionsForDocument,
  listWorkflowDocumentVersions,
  recordWorkflowDocumentVersion,
} from '../services/workflowDocumentVersions.js';

const router = express.Router();

type VersionAction = 'minor' | 'major' | 'none';
type ArchiveSyncFeedback = 'synced' | 'pending' | 'skipped' | 'not_required';

type VersionParts = {
  major: number;
  minor: number;
};

type VersionRow = {
  id?: number | string | null;
  version?: string | null;
  created_at?: string | null;
};

const LIST_PAGE_SIZE_DEFAULT = 50;
const LIST_PAGE_SIZE_MAX = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/i;
const SHOOTING_STATUS_TEXT: Record<string, string> = {
  planned: '计划中',
  in_progress: '制作中',
  completed: '已完成',
  cancelled: '已取消',
};
const SHOOTING_STATUSES = new Set(Object.keys(SHOOTING_STATUS_TEXT));
const PRODUCTION_STATUS_TEXT: Record<string, string> = {
  draft: '草稿',
  review: '审核中',
  approved: '已通过',
  rejected: '已驳回',
};
const PRODUCTION_STATUSES = new Set(Object.keys(PRODUCTION_STATUS_TEXT));
const PUBLISHING_STATUS_TEXT: Record<string, string> = {
  pending: '待发布',
  published: '已发布',
  failed: '发布异常',
  scheduled: '已定时',
};
const PUBLISHING_STATUSES = new Set(Object.keys(PUBLISHING_STATUS_TEXT));
const PUBLISHING_METRIC_FIELDS = ['views', 'likes', 'shares', 'comments'] as const;
const PUBLISHING_EDIT_BASELINE_FIELDS = ['platform', 'url', 'status', 'publish_time', ...PUBLISHING_METRIC_FIELDS] as const;
const DOUYIN_AUTHORITATIVE_FIELDS = ['platform', 'status', 'publish_time'] as const;
const TOPIC_STAGE_TEXT: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  production: '创作中',
  shooting: '成片制作',
  publishing: '发布中',
  completed: '已完成',
};

async function attemptPublishedArchiveSync(
  topicId: number,
  operatorId: number | undefined,
  module: 'shooting' | 'publishing',
  operation: string,
): Promise<ArchiveSyncFeedback> {
  try {
    const result = await syncPublishedArchive(topicId, operatorId);
    return result.action === 'skipped' ? 'skipped' : 'synced';
  } catch (error) {
    apiLogger.error({
      module,
      operation,
      error: { code: 'ARCHIVE_SYNC_FAILED', name: error instanceof Error ? error.name : 'UnknownError' },
    }, `api.${module}.archive_sync_failed`);
    return 'pending';
  }
}

type WorkflowTransaction = {
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<number>;
  executeInsert(sql: string, params?: unknown[]): Promise<number>;
};

function workflowStageConflictMessage(actualStatus: unknown, expectedStatus: string, action: string) {
  const actual = TOPIC_STAGE_TEXT[String(actualStatus)] || '未知阶段';
  const expected = TOPIC_STAGE_TEXT[expectedStatus] || expectedStatus;
  return `选题当前处于“${actual}”，需进入“${expected}”后才能${action}`;
}

async function recordTopicStageTransition(
  tx: WorkflowTransaction,
  topicId: number | string,
  topicTitle: string,
  fromStatus: string,
  toStatus: string,
  operatorId: number | undefined,
  reason: string,
  recordedAt = beijingNow(),
) {
  const fromLabel = TOPIC_STAGE_TEXT[fromStatus] || fromStatus;
  const toLabel = TOPIC_STAGE_TEXT[toStatus] || toStatus;
  await tx.execute(
    `INSERT INTO topic_history(topic_id,action,comment,operator_id,created_at) VALUES(?,?,?,?,?)`,
    [topicId, `status_${toStatus}`, `${reason}：选题由「${fromLabel}」流转为「${toLabel}」`, operatorId ?? null, recordedAt],
  );
  await tx.execute(
    `INSERT INTO activity_log(user_id,action,target,detail,created_at) VALUES(?,?,?,?,?)`,
    [operatorId ?? null, 'status_change', 'topic', `选题「${topicTitle}」状态由「${fromLabel}」变更为「${toLabel}」（${reason}）`, recordedAt],
  );
}

async function recordPublishingStatusCorrection(
  tx: WorkflowTransaction,
  topicId: number | string,
  topicTitle: string,
  publishingId: number | string,
  fromStatus: string,
  toStatus: string,
  operatorId: number | undefined,
) {
  const fromLabel = PUBLISHING_STATUS_TEXT[fromStatus] || fromStatus;
  const toLabel = PUBLISHING_STATUS_TEXT[toStatus] || toStatus;
  const change = `发布记录 #${publishingId} 状态由「${fromLabel}」更正为「${toLabel}」`;
  const recordedAt = beijingNow();
  await tx.execute(
    `INSERT INTO topic_history(topic_id,action,comment,operator_id,created_at) VALUES(?,?,?,?,?)`,
    [topicId, 'publishing_status_changed', change, operatorId ?? null, recordedAt],
  );
  await tx.execute(
    `INSERT INTO activity_log(user_id,action,target,detail,created_at) VALUES(?,?,?,?,?)`,
    [operatorId ?? null, 'status_change', 'publishing', `选题「${topicTitle}」的${change}`, recordedAt],
  );
}

async function recordShootingStatusCorrection(
  tx: WorkflowTransaction,
  topicId: number | string,
  topicTitle: string,
  shootingId: number | string,
  fromStatus: string,
  toStatus: string,
  operatorId: number | undefined,
) {
  const fromLabel = SHOOTING_STATUS_TEXT[fromStatus] || fromStatus;
  const toLabel = SHOOTING_STATUS_TEXT[toStatus] || toStatus;
  const change = `成片记录 #${shootingId} 状态由「${fromLabel}」更正为「${toLabel}」`;
  const recordedAt = beijingNow();
  await tx.execute(
    `INSERT INTO topic_history(topic_id,action,comment,operator_id,created_at) VALUES(?,?,?,?,?)`,
    [topicId, 'shooting_status_changed', change, operatorId ?? null, recordedAt],
  );
  await tx.execute(
    `INSERT INTO activity_log(user_id,action,target,detail,created_at) VALUES(?,?,?,?,?)`,
    [operatorId ?? null, 'status_change', 'shooting', `选题「${topicTitle}」的${change}`, recordedAt],
  );
}

async function recordProductionStatusCorrection(
  tx: WorkflowTransaction,
  topicId: number | string,
  topicTitle: string,
  productionId: number | string,
  fromStatus: string,
  toStatus: string,
  operatorId: number | undefined,
) {
  const fromLabel = PRODUCTION_STATUS_TEXT[fromStatus] || fromStatus;
  const toLabel = PRODUCTION_STATUS_TEXT[toStatus] || toStatus;
  const change = `创作记录 #${productionId} 状态由「${fromLabel}」变更为「${toLabel}」`;
  const recordedAt = beijingNow();
  await tx.execute(
    `INSERT INTO topic_history(topic_id,action,comment,operator_id,created_at) VALUES(?,?,?,?,?)`,
    [topicId, 'production_status_changed', change, operatorId ?? null, recordedAt],
  );
  await tx.execute(
    `INSERT INTO activity_log(user_id,action,target,detail,created_at) VALUES(?,?,?,?,?)`,
    [operatorId ?? null, 'status_change', 'production', `选题「${topicTitle}」的${change}`, recordedAt],
  );
}

async function ensureShootingForTopic(tx: WorkflowTransaction, topicId: number | string, operatorId: number | undefined) {
  const existing = await tx.queryOne<{ id: number }>('SELECT id FROM shooting WHERE topic_id=? LIMIT 1', [topicId]);
  if (!existing) {
    await tx.executeInsert(
      `INSERT INTO shooting(topic_id,status,operator_id) VALUES(?,?,?)`,
      [topicId, 'planned', operatorId],
    );
  }
}

async function ensurePublishingForTopic(
  tx: WorkflowTransaction,
  topicId: number | string,
  operatorId: number | undefined,
  scriptContent: string | null,
) {
  const existing = await tx.queryOne<{ id: number; script_content?: string | null }>(
    'SELECT id,script_content FROM publishing WHERE topic_id=? ORDER BY id LIMIT 1',
    [topicId],
  );
  if (!existing) {
    await tx.executeInsert(
      `INSERT INTO publishing(topic_id,status,operator_id,script_content) VALUES(?,?,?,?)`,
      [topicId, 'pending', operatorId, scriptContent],
    );
    return;
  }
  if (scriptContent && !existing.script_content) {
    await tx.execute(
      `UPDATE publishing SET script_content=?,updated_at=datetime('now','+8 hours') WHERE id=? AND (script_content IS NULL OR script_content='')`,
      [scriptContent, existing.id],
    );
  }
}

async function completeShootingHandoff(
  tx: WorkflowTransaction,
  topicId: number | string,
  operatorId: number | undefined,
  scriptContent: string | null,
) {
  const topic = await tx.queryOne<{ status: string; title: string }>(
    'SELECT status,title FROM topics WHERE id=?',
    [topicId],
  );
  if (!topic || !isTopicAtOrBeyondStage(topic.status, 'shooting')) {
    return { ok: false as const, status: topic?.status };
  }

  if (topic.status === 'shooting') {
    if (!canTransitionTopicStatus(topic.status, 'publishing')) {
      return { ok: false as const, status: topic.status };
    }
    const recordedAt = beijingNow();
    const changed = await tx.execute(
      `UPDATE topics SET status='publishing', stage_entered_at=?, updated_at=? WHERE id=? AND status='shooting'`,
      [recordedAt, recordedAt, topicId],
    );
    if (changed > 0) {
      await recordTopicStageTransition(tx, topicId, topic.title, 'shooting', 'publishing', operatorId, '成片制作完成', recordedAt);
      await tx.execute(
        `INSERT INTO messages(user_id,title,content,type,created_at) VALUES(?,?,?,?,?)`,
        [operatorId, '成片制作完成', `选题「${topic.title}」成片制作已完成，进入发布管理环节`, 'success', beijingNow()],
      );
    }
  }

  await ensurePublishingForTopic(tx, topicId, operatorId, scriptContent);
  await advancePublishingTopicIfResolved(tx, topicId, operatorId);
  return { ok: true as const };
}

function parsePositiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function hasProductionReviewVersion(productionId: number, version: string, currentVersion: string) {
  if (version === currentVersion) return true;
  const historical = await queryOne<{ found: number }>(
    'SELECT 1 AS found FROM production_history WHERE production_id=? AND version=? LIMIT 1',
    [productionId, version],
  );
  return Boolean(historical);
}

function parsePublishingMetric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function publishingDateKey(value: unknown): string | null {
  if (value == null || value === '') return beijingToday();
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T].*)?$/);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[1] ? null : match[1];
}

export function parseListPagination(query: Record<string, unknown>) {
  const pageCandidate = Number.parseInt(String(query.page ?? 1), 10);
  const limitCandidate = Number.parseInt(String(query.limit ?? LIST_PAGE_SIZE_DEFAULT), 10);
  const page = Number.isFinite(pageCandidate) && pageCandidate > 0 ? pageCandidate : 1;
  const limit = Number.isFinite(limitCandidate) && limitCandidate > 0
    ? Math.min(limitCandidate, LIST_PAGE_SIZE_MAX)
    : LIST_PAGE_SIZE_DEFAULT;
  return { page, limit, offset: (page - 1) * limit };
}

function parseVersionParts(version: string | undefined): VersionParts | null {
  const normalized = String(version || 'v1.0');
  const match = normalized.match(/^v?(\d+)\.(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
  };
}

function formatVersion(parts: VersionParts): string {
  return `v${parts.major}.${parts.minor}`;
}

function isNewerVersionRow<T extends VersionRow>(
  candidate: T,
  candidateParts: VersionParts,
  existing: T,
  existingParts: VersionParts,
): boolean {
  if (candidateParts.minor !== existingParts.minor) {
    return candidateParts.minor > existingParts.minor;
  }

  const candidateTime = candidate.created_at ? new Date(candidate.created_at).getTime() : 0;
  const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : 0;

  if (candidateTime !== existingTime) {
    return candidateTime > existingTime;
  }

  return Number(candidate.id || 0) > Number(existing.id || 0);
}

function getLatestHistoryRowsByMajor<T extends VersionRow>(
  historyRows: T[],
  currentVersion?: string,
): T[] {
  const latestByMajor = new Map<number, { row: T; parts: VersionParts }>();
  const currentParts = parseVersionParts(currentVersion);

  for (const row of historyRows) {
    const parts = parseVersionParts(row.version || undefined);

    if (!parts) {
      continue;
    }

    if (currentParts?.major === parts.major && currentParts.minor >= parts.minor) {
      continue;
    }

    const existing = latestByMajor.get(parts.major);

    if (!existing || isNewerVersionRow(row, parts, existing.row, existing.parts)) {
      latestByMajor.set(parts.major, { row, parts });
    }
  }

  return Array.from(latestByMajor.values())
    .sort((a, b) => {
      if (a.parts.major !== b.parts.major) {
        return b.parts.major - a.parts.major;
      }

      return b.parts.minor - a.parts.minor;
    })
    .map(({ row }) => row);
}

function getNextVersion(
  currentVersion: string | undefined,
  versionAction: VersionAction,
  versions: Array<{ version?: string | null }>,
): string {
  const parsedVersions = versions
    .map((row) => parseVersionParts(row.version || undefined))
    .filter((parts): parts is VersionParts => Boolean(parts));
  const currentParts = parseVersionParts(currentVersion) || { major: 1, minor: 0 };

  if (versionAction === 'none') {
    return formatVersion(currentParts);
  }

  if (versionAction === 'major') {
    const maxMajor = parsedVersions.reduce(
      (max, parts) => Math.max(max, parts.major),
      currentParts.major,
    );
    return formatVersion({ major: maxMajor + 1, minor: 0 });
  }

  if (versionAction === 'minor') {
    const maxMinorInCurrentMajor = parsedVersions.reduce(
      (max, parts) => (parts.major === currentParts.major ? Math.max(max, parts.minor) : max),
      currentParts.minor,
    );
    return formatVersion({ major: currentParts.major, minor: maxMinorInCurrentMajor + 1 });
  }

  return formatVersion(currentParts);
}

async function cleanupProductionHistoryToLatestMinor(productionId: string | number, currentVersion: string) {
  const historyRows = await queryAll<VersionRow>(
    `SELECT id, version, created_at FROM production_history WHERE production_id = ?`,
    [productionId],
  );
  const referencedSources = await queryAll<{ script_source_version: string }>(
    `SELECT script_source_version FROM shooting
     WHERE script_source_production_id=? AND script_source_version IS NOT NULL
     UNION
     SELECT script_source_version FROM publishing
     WHERE script_source_production_id=? AND script_source_version IS NOT NULL
     UNION
     SELECT source_production_version AS script_source_version FROM workflow_document_versions
     WHERE source_production_id=? AND source_production_version IS NOT NULL
       AND document_type IN ('shooting_script','publishing_script')`,
    [productionId, productionId, productionId],
  );
  const referencedVersions = new Set(referencedSources.map((row) => row.script_source_version));
  const latestByMajor = new Map<number, { source: 'current' | 'history'; row?: VersionRow; parts: VersionParts }>();
  const currentParts = parseVersionParts(currentVersion);

  if (currentParts) {
    latestByMajor.set(currentParts.major, { source: 'current', parts: currentParts });
  }

  for (const row of historyRows) {
    const parts = parseVersionParts(row.version || undefined);

    if (!parts) {
      continue;
    }

    const existing = latestByMajor.get(parts.major);

    if (!existing) {
      latestByMajor.set(parts.major, { source: 'history', row, parts });
      continue;
    }

    const currentRow = existing.row || {};
    const shouldReplace =
      parts.minor > existing.parts.minor ||
      (parts.minor === existing.parts.minor &&
        existing.source !== 'current' &&
        isNewerVersionRow(row, parts, currentRow, existing.parts));

    if (shouldReplace) {
      latestByMajor.set(parts.major, { source: 'history', row, parts });
    }
  }

  const deleteIds = historyRows
    .filter((row) => {
      if (row.version && referencedVersions.has(row.version)) return false;
      const parts = parseVersionParts(row.version || undefined);
      const latest = parts ? latestByMajor.get(parts.major) : null;

      if (!parts || !latest) {
        return false;
      }

      if (latest.source === 'current') {
        return parts.minor <= latest.parts.minor;
      }

      return parts.minor < latest.parts.minor || row.id !== latest.row?.id;
    })
    .map((row) => row.id)
    .filter((id): id is number | string => id !== null && id !== undefined);

  for (const historyId of deleteIds) {
    await execute(
      `DELETE FROM production_history
       WHERE id=? AND production_id=?
         AND NOT EXISTS (
           SELECT 1 FROM shooting
           WHERE script_source_production_id=? AND script_source_version=production_history.version
         )
         AND NOT EXISTS (
           SELECT 1 FROM publishing
           WHERE script_source_production_id=? AND script_source_version=production_history.version
         )
         AND NOT EXISTS (
           SELECT 1 FROM workflow_document_versions
           WHERE document_type IN ('shooting_script','publishing_script')
             AND source_production_id=?
             AND source_production_version=production_history.version
         )`,
      [historyId, productionId, productionId, productionId, productionId],
    );
  }
}

router.get('/shadow-logs', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const { topic_id, user_id, node_id } = req.query;
    let sql = `SELECT * FROM workflow_shadow_logs WHERE 1=1`;
    const params: unknown[] = [];

    if (topic_id) {
      sql += ` AND topic_id = ?`;
      params.push(topic_id);
    }

    if (user_id) {
      sql += ` AND user_id = ?`;
      params.push(user_id);
    }

    if (node_id) {
      sql += ` AND node_id = ?`;
      params.push(node_id);
    }

    sql += ` ORDER BY created_at DESC LIMIT 100`;

    res.json(await queryAll(sql, params));
  } catch {
    res.status(500).json({ message: '获取 Workflow Shadow 日志失败' });
  }
});

router.get('/shadow-analytics', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const transitions = await queryAll<{
      from_state: string | null;
      to_state: string | null;
      count: number;
    }>(
      `SELECT from_state, to_state, COUNT(*) as count
       FROM workflow_shadow_logs
       GROUP BY from_state, to_state
       ORDER BY count DESC`,
    );

    const nodeActivity = await queryAll<{
      node_id: number | null;
      count: number;
    }>(
      `SELECT node_id, COUNT(*) as count
       FROM workflow_shadow_logs
       WHERE node_id IS NOT NULL
       GROUP BY node_id
       ORDER BY count DESC`,
    );

    const approverDistribution = await queryAll<{
      user_id: number | null;
      count: number;
    }>(
      `SELECT user_id, COUNT(*) as count
       FROM workflow_shadow_logs
       WHERE user_id IS NOT NULL
       GROUP BY user_id
       ORDER BY count DESC`,
    );

    const nodeRiskRows = await queryAll<{
      node_id: number | null;
      transition_count: number;
      rejection_count: number;
      abnormal_pattern_count: number;
    }>(
      `SELECT
         node_id,
         COUNT(*) as transition_count,
         SUM(CASE WHEN action LIKE '%rejected%' THEN 1 ELSE 0 END) as rejection_count,
         SUM(CASE WHEN reason IS NOT NULL AND reason != '' AND reason NOT LIKE '%shadow mode - no enforcement%' THEN 1 ELSE 0 END) as abnormal_pattern_count
       FROM workflow_shadow_logs
       WHERE node_id IS NOT NULL
       GROUP BY node_id
       ORDER BY abnormal_pattern_count DESC, rejection_count DESC, transition_count DESC`,
    );

    const invalidPatterns = await queryAll<{
      reason: string | null;
      count: number;
    }>(
      `SELECT reason, COUNT(*) as count
       FROM workflow_shadow_logs
       WHERE reason IS NOT NULL
         AND reason != ''
         AND reason NOT LIKE '%shadow mode - no enforcement%'
       GROUP BY reason
       ORDER BY count DESC`,
    );

    res.json({
      transitionFrequency: transitions,
      heatmap: transitions.map((row) => ({
        from: row.from_state || 'unknown',
        to: row.to_state || 'unknown',
        count: Number(row.count || 0),
      })),
      nodeActivityRanking: nodeActivity,
      approverDistribution,
      mostFrequentTransitions: transitions.slice(0, 10),
      mostInvalidPatterns: invalidPatterns,
      nodeRiskScore: nodeRiskRows.map((row) => ({
        node_id: row.node_id,
        transition_count: Number(row.transition_count || 0),
        rejection_count: Number(row.rejection_count || 0),
        abnormal_pattern_count: Number(row.abnormal_pattern_count || 0),
      })),
    });
  } catch {
    res.status(500).json({ message: '获取 Workflow Shadow 分析失败' });
  }
});

router.get('/shadow-decisions', authenticate, requirePermission('system:template'), async (req, res) => {
  try {
    const logs = await queryAll<{
      node_id: number | null;
      from_state: string | null;
      to_state: string | null;
      action: string | null;
      reason: string | null;
    }>(
      `SELECT node_id, from_state, to_state, action, reason
       FROM workflow_shadow_logs
       ORDER BY created_at DESC
       LIMIT 500`,
    );

    res.json({
      decisions: logs.map((log) => {
        const runtimeContext = buildWorkflowRuntimeContext({
          from: log.from_state,
          to: log.to_state,
          node: { id: log.node_id || undefined, status_from: log.from_state, status_to: log.to_state },
          logs,
          source: 'runtime',
        });

        return {
          node_id: log.node_id,
          from_state: log.from_state || 'unknown',
          to_state: log.to_state || 'unknown',
          allowed: runtimeContext.allowed,
          shouldBlock: runtimeContext.strictBlocked,
          shouldWarn: runtimeContext.risk !== 'low',
          suggestedTransition: runtimeContext.suggestedTransition,
          confidence: runtimeContext.confidence,
          reason: runtimeContext.reason,
        };
      }),
    });
  } catch {
    res.status(500).json({ message: '获取 Workflow Shadow 决策建议失败' });
  }
});

router.get('/production', authenticate, async (req, res) => {
  try {
    const { topic_id } = req.query;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    if (search && Array.from(search).length < 2) return res.status(400).json({ message: '搜索词至少需要 2 个字符' });
    if (search) {
      const canViewAll = canViewAllContent(req.user);
      const query = `SELECT p.id, p.topic_id, p.version, p.status, p.updated_at, t.title AS topic_title FROM production p
                     LEFT JOIN topics t ON t.id = p.topic_id WHERE 1=1${topic_id ? ' AND p.topic_id = ?' : ''}
                     AND INSTR(LOWER(COALESCE(NULLIF(p.content_markdown, ''), p.content, '')), LOWER(?)) > 0${canViewAll ? '' : ' AND (t.creator_id = ? OR t.assignee_id = ? OR p.operator_id = ?)'}
                     ORDER BY p.updated_at DESC, p.id DESC LIMIT ?`;
      const searchParams: unknown[] = topic_id ? [topic_id, search] : [search];
      if (!canViewAll) searchParams.push(req.user!.id, req.user!.id, req.user!.id);
      searchParams.push(8);
      const results = await queryAll(query, searchParams);
      return res.json({ data: results, total: results.length, page: 1, limit: 8 });
    }
    const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '20'), 10) || 20));
    let query = `SELECT p.*, COALESCE(p.content_markdown, p.content) as contentMarkdown, COALESCE(p.content_json, p.content) as contentJson, u.name as operator_name, t.title as topic_title, t.status as topic_status FROM production p
                 LEFT JOIN users u ON p.operator_id = u.id 
                 LEFT JOIN topics t ON p.topic_id = t.id WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) as total FROM production p
                      LEFT JOIN topics t ON p.topic_id = t.id WHERE 1=1`;
    const params: any[] = [];
    const countParams: any[] = [];
    if (topic_id) {
      query += ` AND p.topic_id = ?`;
      countQuery += ` AND p.topic_id = ?`;
      params.push(topic_id);
      countParams.push(topic_id);
    }
    if (!canViewAllContent(req.user)) {
      const userId = req.user!.id;
      query += ` AND (t.creator_id = ? OR t.assignee_id = ? OR p.operator_id = ?)`;
      countQuery += ` AND (t.creator_id = ? OR t.assignee_id = ? OR p.operator_id = ?)`;
      params.push(userId, userId, userId);
      countParams.push(userId, userId, userId);
    }
    query += ` ORDER BY p.created_at DESC`;
    if (hasPagination) query += ` LIMIT ? OFFSET ?`;
    if (hasPagination) params.push(limit, (page - 1) * limit);
    const productions = await queryAll(query, params);
    if (!hasPagination) return res.json(productions);
    const totalRow = await queryOne<{ total: number }>(countQuery, countParams);
    res.json({ data: productions, total: Number(totalRow?.total || 0), page, limit });
  } catch {
    res.status(500).json({ message: '获取创作列表失败' });
  }
});

router.get('/production/create-request/:requestId', noStoreResponse, authenticate, async (req, res) => {
  try {
    const requestId = String(req.params.requestId || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return res.status(400).json({ message: '创作请求编号无效' });
    }
    const request = await queryOne<{ production_id: number; topic_id: number | null }>(
      `SELECT k.production_id,p.topic_id
       FROM production_create_request_keys k
       LEFT JOIN production p ON p.id=k.production_id
       WHERE k.client_request_id=? AND k.creator_id=?`,
      [requestId, Number(req.user?.id)],
    );
    if (!request) return res.status(404).json({ message: '尚未找到对应创作记录' });
    if (request.topic_id === null) return res.status(410).json({ deleted: true, message: '对应创作记录已删除' });
    const topic = await getTopicScopeByProductionId(request.production_id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该创作请求状态' });
    return res.json({ productionId: Number(request.production_id) });
  } catch {
    return res.status(500).json({ message: '核实创作记录创建状态失败' });
  }
});

router.post('/production', authenticate, requirePermission('production:update'), async (req, res) => {
  try {
    const { topic_id, version, content, status = 'draft' } = req.body;
    if (typeof status !== 'string' || !PRODUCTION_STATUSES.has(status)) {
      return res.status(400).json({ message: '创作状态无效' });
    }
    const originType = req.body.origin_type;
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    if (originType !== undefined && originType !== 'topic_outline') {
      return res.status(400).json({ message: '创作来源类型无效' });
    }
    if (rawClientRequestId !== undefined && rawClientRequestId !== null
      && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
      return res.status(400).json({ message: '创作请求编号无效' });
    }
    if (!topic_id) return res.status(400).json({ message: '选题ID不能为空' });
    const topic = await getTopicScopeById(topic_id);
    if (!topic) return res.status(404).json({ message: '选题不存在' });
    if (!canEditProduction(req.user, topic)) return res.status(403).json({ message: '无权限操作该选题的创作记录' });
    if (status === 'approved' && !isTopicAtOrBeyondStage(topic.status, 'approved')) {
      return res.status(409).json({
        message: workflowStageConflictMessage(topic.status, 'approved', '创建已通过的创作记录'),
        code: 'WORKFLOW_STAGE_CONFLICT',
      });
    }
    const contentMarkdown = req.body.contentMarkdown || content;
    const contentJson = req.body.contentJson || content;
    const requestFingerprint = clientRequestId
      ? createHash('sha256').update(JSON.stringify([
        Number(topic_id), version ?? null, content ?? null, contentMarkdown ?? null, contentJson ?? null,
        String(status), originType ?? null,
      ])).digest('hex')
      : '';
    const creation = await runInTransaction(async (tx) => {
      if (clientRequestId) {
        const existing = await tx.queryOne<{
          production_id: number;
          creator_id: number;
          request_fingerprint: string;
        }>(
          `SELECT production_id,creator_id,request_fingerprint FROM production_create_request_keys WHERE client_request_id=?`,
          [clientRequestId],
        );
        if (existing) {
          if (Number(existing.creator_id) !== Number(req.user?.id) || existing.request_fingerprint !== requestFingerprint) {
            return { conflict: true as const };
          }
          const existingProduction = await tx.queryOne<{ id: number }>(
            'SELECT id FROM production WHERE id=?',
            [existing.production_id],
          );
          return existingProduction
            ? { ok: true as const, id: Number(existing.production_id), created: false }
            : { deleted: true as const };
        }
      }
      const currentTopic = await tx.queryOne<{ status: string; title: string; outline: string | null }>(
        'SELECT status,title,outline FROM topics WHERE id=?',
        [topic_id],
      );
      if (!currentTopic) return { ok: false as const, reason: 'topic-missing' as const };
      const originOutlineSnapshot = originType === 'topic_outline' ? String(currentTopic.outline || '') : null;
      if (originOutlineSnapshot !== null && (typeof content !== 'string' || content !== originOutlineSnapshot)) {
        return { ok: false as const, reason: 'outline-changed' as const };
      }
      if (status === 'approved' && currentTopic.status !== topic.status) {
        return { ok: false as const, reason: 'stale-stage' as const, status: currentTopic.status };
      }
      if (status === 'approved' && !isTopicAtOrBeyondStage(currentTopic.status, 'approved')) {
        return { ok: false as const, reason: 'invalid-stage' as const, status: currentTopic.status };
      }
      if (status === 'approved' && currentTopic.status === 'approved') {
        if (!canTransitionTopicStatus(currentTopic.status, 'production')) {
          return { ok: false as const, reason: 'invalid-stage' as const, status: currentTopic.status };
        }
        const recordedAt = beijingNow();
        const advanced = await tx.execute(
          `UPDATE topics SET status='production', stage_entered_at=?, updated_at=? WHERE id=? AND status='approved'`,
          [recordedAt, recordedAt, topic_id],
        );
        if (advanced === 0) return { ok: false as const, reason: 'stale-stage' as const, status: currentTopic.status };
        await recordTopicStageTransition(tx, topic_id, currentTopic.title, 'approved', 'production', req.user?.id, '创作记录已通过审核', recordedAt);
      }

      const id = await tx.executeInsert(
        `INSERT INTO production (topic_id, version, content, content_markdown, content_json, status, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [topic_id, version, content, contentMarkdown, contentJson, status, req.user?.id],
      );
      if (originOutlineSnapshot !== null) await insertTopicOutlineOriginSnapshot(tx, id, Number(topic_id), originOutlineSnapshot);
      if (clientRequestId) {
        await tx.execute(
          `INSERT INTO production_create_request_keys(client_request_id,creator_id,production_id,request_fingerprint,created_at)
           VALUES(?,?,?,?,?)`,
          [clientRequestId, Number(req.user?.id), id, requestFingerprint, beijingNow()],
        );
      }
      return { ok: true as const, id, created: true };
    });
    if ('conflict' in creation) {
      return res.status(409).json({ message: '创作请求编号已用于其他内容，请先核实原请求状态。', code: 'PRODUCTION_CREATE_REQUEST_CONFLICT' });
    }
    if ('deleted' in creation) {
      return res.status(410).json({ message: '该请求对应的创作记录已删除，不会因为重试而重新创建。', deleted: true });
    }
    if (!creation.ok) {
      if (creation.reason === 'topic-missing') return res.status(404).json({ message: '选题不存在' });
      if (creation.reason === 'outline-changed') {
        return res.status(409).json({ message: '选题大纲已更新；请刷新选题后再开始创作。', code: 'TOPIC_OUTLINE_CHANGED' });
      }
      return res.status(409).json({
        message: creation.reason === 'stale-stage'
          ? '选题阶段已发生变化，请刷新后重新创建创作记录'
          : workflowStageConflictMessage(creation.status, 'approved', '创建已通过的创作记录'),
        code: 'WORKFLOW_STAGE_CONFLICT',
      });
    }
    if (creation.created) broadcastToRoom('production', 'production:created', { id: creation.id, topic_id: req.body.topic_id });
    res.json({
      message: '创作记录添加成功',
      productionId: creation.id,
      ...(clientRequestId ? { idempotent_replay: !creation.created } : {}),
    });
  } catch {
    res.status(500).json({ message: '添加创作记录失败' });
  }
});

router.get('/production/:id', noStoreResponse, authenticate, async (req, res) => {
  try {
    const production = await queryOne(`SELECT p.*, COALESCE(p.content_markdown, p.content) as contentMarkdown, COALESCE(p.content_json, p.content) as contentJson, origin.source_type as origin_source_type, origin.source_content_snapshot as origin_source_content_snapshot, origin.source_outline_version as origin_source_outline_version, origin.source_topic_id as origin_source_topic_id, origin.captured_at as origin_captured_at, u.name as operator_name, t.title as topic_title, t.status as topic_status FROM production p LEFT JOIN users u ON p.operator_id = u.id LEFT JOIN topics t ON p.topic_id = t.id LEFT JOIN production_origin_snapshots origin ON origin.production_id = p.id WHERE p.id = ?`, [req.params.id]);
    if (!production) return res.status(404).json({ message: '创作记录不存在' });
    const topic = await getTopicScopeByProductionId(req.params.id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该创作记录' });
    res.json({ ...production, can_edit: canEditProduction(req.user, topic) });
  } catch {
    res.status(500).json({ message: '获取创作详情失败' });
  }
});

router.put('/production/:id', authenticate, requirePermission('production:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      topic_id,
      version,
      content,
      status,
      change_type = 'minor',
      version_action,
      expected_content,
    } = req.body;
    if (status !== undefined && (typeof status !== 'string' || !PRODUCTION_STATUSES.has(status))) {
      return res.status(400).json({ message: '创作状态无效' });
    }
    if (!topic_id) return res.status(400).json({ message: '选题ID不能为空' });
    const existingProduction = await queryOne(`SELECT * FROM production WHERE id = ?`, [id]);
    if (!existingProduction) return res.status(404).json({ message: '创作记录不存在' });
    const originalTopic = await getTopicScopeByProductionId(id);
    if (!canEditProduction(req.user, originalTopic)) return res.status(403).json({ message: '无权限修改该创作记录' });
    const nextTopic = await getTopicScopeById(topic_id);
    if (!nextTopic) return res.status(404).json({ message: '选题不存在' });
    if (!canEditProduction(req.user, nextTopic)) return res.status(403).json({ message: '无权限关联到目标选题' });
    const approvalTransition = status === 'approved' && existingProduction.status !== 'approved';
    if (approvalTransition && !isTopicAtOrBeyondStage(nextTopic.status, 'production')) {
      return res.status(409).json({
        message: workflowStageConflictMessage(nextTopic.status, 'production', '审核通过创作记录'),
        code: 'WORKFLOW_STAGE_CONFLICT',
      });
    }

    const currentVersion = String(existingProduction.version || version || 'v1.0');
    if (version && String(version) !== currentVersion) {
      return res.status(409).json({ message: `当前版本 ${version} 已被 ${currentVersion} 替代，请切换到最新版本后继续编辑`, code: 'PRODUCTION_VERSION_SUPERSEDED', currentVersion });
    }
    if (typeof expected_content === 'string' && expected_content !== String(existingProduction.content || '')) {
      if (version_action === 'none' && content === existingProduction.content && status === existingProduction.status) {
        return res.json({ message: '创作记录已同步', version: currentVersion });
      }
      return res.status(409).json({ message: '其他协作者已保存更新，你的内容尚未覆盖对方。请先复制当前编辑内容，再刷新页面核对。', code: 'PRODUCTION_CONTENT_CONFLICT' });
    }
    // Ordinary edits (including older clients omitting version_action) never create a version.
    // Only an explicit version command may do so.
    const resolvedVersionAction: VersionAction = resolveProductionVersionAction(version_action);

    const shouldCreateHistory =
      resolvedVersionAction !== 'none' && (
        version_action === 'major' ||
        version_action === 'minor' ||
        content !== existingProduction.content ||
        status !== existingProduction.status ||
        Number(topic_id) !== Number(existingProduction.topic_id)
      );

    const existingVersions = await queryAll<{ version: string | null }>(
      `SELECT version FROM production_history WHERE production_id = ?`,
      [id],
    );
    const newVersion =
      resolvedVersionAction === 'none'
        ? currentVersion
        : getNextVersion(currentVersion, resolvedVersionAction, [
            { version: currentVersion },
            ...existingVersions,
          ]);

    const contentMarkdown = req.body.contentMarkdown || content;
    const contentJson = req.body.contentJson || content;
    const guarded = typeof expected_content === 'string';
    const updateProductionSql =
      `UPDATE production SET topic_id = ?, version = ?, content = ?, content_markdown = ?, content_json = ?, status = ?, operator_id = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?${guarded ? " AND COALESCE(content, '') = ? AND COALESCE(version, 'v1.0') = ?" : ''}`;
    const updateProductionParams = guarded
      ? [topic_id, newVersion, content, contentMarkdown, contentJson, status, req.user?.id, id, expected_content, currentVersion]
      : [topic_id, newVersion, content, contentMarkdown, contentJson, status, req.user?.id, id];
    const historySql = `INSERT INTO production_history (production_id, version, content, content_markdown, content_json, status, change_type, operator_id, version_state, superseded_by_version, superseded_at, material_draft_snapshot_html, source_topic_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const historyParams = [
      id,
      currentVersion,
      existingProduction.content,
      existingProduction.content_markdown || existingProduction.content,
      existingProduction.content_json || existingProduction.content,
      existingProduction.status,
      resolvedVersionAction === 'major' ? 'major' : 'minor',
      req.user?.id,
      resolvedVersionAction === 'major' ? 'superseded' : 'historical',
      null,
      resolvedVersionAction === 'major' ? beijingNow() : null,
    ];
    const persistHistorySnapshot = async (tx: WorkflowTransaction) => {
      if (!shouldCreateHistory) return;
      const materialDraft = await tx.queryOne<{ content_html: string | null }>(
        'SELECT content_html FROM production_material_drafts WHERE production_id=?',
        [id],
      );
      await tx.execute(historySql, [
        ...historyParams,
        materialDraft?.content_html ?? '',
        Number(existingProduction.topic_id),
      ]);
    };

    if (approvalTransition) {
      const handoff = await runInTransaction(async (tx) => {
        const latestProduction = await tx.queryOne<{ topic_id: number; status: string }>(
          'SELECT topic_id,status FROM production WHERE id=?',
          [id],
        );
        if (!latestProduction) return { ok: false as const, code: 'PRODUCTION_MISSING' };
        if (Number(latestProduction.topic_id) !== Number(existingProduction.topic_id)
          || latestProduction.status !== existingProduction.status) {
          return { ok: false as const, code: 'PRODUCTION_STATUS_CONFLICT' };
        }
        const topic = await tx.queryOne<{ status: string; title: string }>(
          'SELECT status,title FROM topics WHERE id=?',
          [topic_id],
        );
        if (!topic || !isTopicAtOrBeyondStage(topic.status, 'production')) {
          return { ok: false as const, code: 'WORKFLOW_STAGE_CONFLICT', status: topic?.status };
        }
        if (topic.status === 'production' && !canTransitionTopicStatus(topic.status, 'shooting')) {
          return { ok: false as const, code: 'WORKFLOW_STAGE_CONFLICT', status: topic.status };
        }
        const changed = await tx.execute(updateProductionSql, updateProductionParams);
        if (guarded && changed === 0) {
          const latest = await tx.queryOne<{ version: string; content: string; status: string }>(
            'SELECT version,content,status FROM production WHERE id=?',
            [id],
          );
          if (!(version_action === 'none' && latest?.version === newVersion && latest.content === content && latest.status === status)) {
            return { ok: false as const, code: 'PRODUCTION_CONTENT_CONFLICT' };
          }
        }
        await persistHistorySnapshot(tx);
        if (resolvedVersionAction === 'major') {
          await tx.execute(
            `UPDATE production_history SET superseded_by_version=? WHERE production_id=? AND version=? AND version_state='superseded'`,
            [newVersion, id, currentVersion],
          );
        }
        if (status !== existingProduction.status) {
          await recordProductionStatusCorrection(
            tx,
            topic_id,
            topic.title,
            id,
            String(existingProduction.status || 'draft'),
            String(status),
            req.user?.id,
          );
        }
        let advanced = false;
        const recordedAt = beijingNow();
        if (topic.status === 'production') {
          advanced = (await tx.execute(
            `UPDATE topics SET status='shooting', stage_entered_at=?, updated_at=? WHERE id=? AND status='production'`,
            [recordedAt, recordedAt, topic_id],
          )) > 0;
        }
        if (advanced) {
          await recordTopicStageTransition(tx, topic_id, topic.title, 'production', 'shooting', req.user?.id, '创作记录已通过审核', recordedAt);
        }
        await ensureShootingForTopic(tx, topic_id, req.user?.id);
        if (advanced) {
          await tx.execute(
            `INSERT INTO messages (user_id,title,content,type,created_at) VALUES (?,?,?,?,?)`,
            [req.user?.id, '创作审核通过', `选题「${topic.title}」创作已通过审核，进入成片制作环节`, 'success', beijingNow()],
          );
        }
        return { ok: true as const };
      });
      if (!handoff.ok) {
        if (handoff.code === 'PRODUCTION_MISSING') return res.status(404).json({ message: '创作记录不存在' });
        const conflict = handoff.code === 'WORKFLOW_STAGE_CONFLICT';
        return res.status(409).json({
          message: conflict
            ? workflowStageConflictMessage(handoff.status, 'production', '审核通过创作记录')
            : handoff.code === 'PRODUCTION_STATUS_CONFLICT'
              ? '创作记录状态已被其他协作者修改，请刷新页面核对后重试'
              : '其他协作者已保存更新，你的内容尚未覆盖对方。请先刷新页面核对后重试。',
          code: handoff.code,
        });
      }
    } else if (status !== undefined && status !== existingProduction.status) {
      const correction = await runInTransaction(async (tx) => {
        const latest = await tx.queryOne<{ topic_id: number; status: string }>(
          'SELECT topic_id,status FROM production WHERE id=?',
          [id],
        );
        if (!latest) return { ok: false as const, reason: 'missing' as const };
        if (Number(latest.topic_id) !== Number(existingProduction.topic_id) || latest.status !== existingProduction.status) {
          return { ok: false as const, reason: 'stale-record' as const };
        }
        const topic = await tx.queryOne<{ title: string }>('SELECT title FROM topics WHERE id=?', [topic_id]);
        if (!topic) return { ok: false as const, reason: 'missing-topic' as const };

        const changed = await tx.execute(updateProductionSql, updateProductionParams);
        if (guarded && changed === 0) {
          const current = await tx.queryOne<{ version: string; content: string; status: string }>(
            'SELECT version,content,status FROM production WHERE id=?',
            [id],
          );
          if (!(version_action === 'none' && current?.version === newVersion && current.content === content && current.status === status)) {
            return { ok: false as const, reason: 'content-conflict' as const };
          }
        } else if (changed === 0) {
          return { ok: false as const, reason: 'stale-record' as const };
        }

        await persistHistorySnapshot(tx);
        if (resolvedVersionAction === 'major') {
          await tx.execute(
            `UPDATE production_history SET superseded_by_version=? WHERE production_id=? AND version=? AND version_state='superseded'`,
            [newVersion, id, currentVersion],
          );
        }
        await recordProductionStatusCorrection(
          tx,
          topic_id,
          topic.title,
          id,
          String(existingProduction.status || 'draft'),
          String(status),
          req.user?.id,
        );
        return { ok: true as const };
      });

      if (!correction.ok) {
        if (correction.reason === 'missing') return res.status(404).json({ message: '创作记录不存在' });
        if (correction.reason === 'missing-topic') return res.status(404).json({ message: '选题不存在' });
        return res.status(409).json({
          message: correction.reason === 'content-conflict'
            ? '其他协作者已保存更新，你的内容尚未覆盖对方。请先刷新页面核对后重试。'
            : '创作记录状态已被其他协作者修改，请刷新页面核对后重试',
          code: correction.reason === 'content-conflict' ? 'PRODUCTION_CONTENT_CONFLICT' : 'PRODUCTION_STATUS_CONFLICT',
        });
      }
    } else {
      const save = await runInTransaction(async (tx) => {
        const changed = await tx.execute(updateProductionSql, updateProductionParams);
        if (changed === 0) {
          if (guarded) {
            const latest = await tx.queryOne<{ version: string; content: string; status: string }>(
              'SELECT version,content,status FROM production WHERE id = ?',
              [id],
            );
            if (version_action === 'none' && latest?.version === newVersion && latest.content === content && latest.status === status) {
              return { ok: true as const, synced: true as const, version: latest.version };
            }
            return { ok: false as const, reason: latest ? 'content-conflict' as const : 'missing' as const };
          }
          return { ok: false as const, reason: 'missing' as const };
        }
        await persistHistorySnapshot(tx);
        if (resolvedVersionAction === 'major') {
          await tx.execute(
            `UPDATE production_history SET superseded_by_version = ? WHERE production_id = ? AND version = ? AND version_state = 'superseded'`,
            [newVersion, id, currentVersion],
          );
        }
        return { ok: true as const, synced: false as const, version: newVersion };
      });
      if (!save.ok && save.reason === 'missing') return res.status(404).json({ message: '创作记录不存在' });
      if (!save.ok) {
        return res.status(409).json({
          message: '其他协作者已保存更新，你的内容尚未覆盖对方。请先复制当前编辑内容，再刷新页面核对。',
          code: 'PRODUCTION_CONTENT_CONFLICT',
        });
      }
      if (save.synced) return res.json({ message: '创作记录已同步', version: save.version });
    }

    if (resolvedVersionAction !== 'none') {
      try {
        await cleanupProductionHistoryToLatestMinor(id, newVersion);
      } catch (cleanupError) {
        apiLogger.warn({
          module: 'workflow',
          operation: 'production.history_cleanup_failed',
          error: { code: 'HISTORY_CLEANUP_FAILED', name: cleanupError instanceof Error ? cleanupError.name : 'UnknownError' },
        }, 'api.workflow.production_history_cleanup_failed');
      }
    }
    broadcastToRoom('production', 'production:updated', { id: Number(req.params.id) });
    if (resolvedVersionAction === 'major') {
      const payload: VersionSupersededPayload = {
        productionId: Number(id), topicId: Number(topic_id), fromVersion: currentVersion, toVersion: newVersion, toVersionId: Number(id),
        createdBy: { id: Number(req.user?.id), name: String(req.user?.name || '协作者') }, createdAt: beijingNow(),
      };
      getSocketIO()?.to(getCollaborationRoomId('production', id)).emit(COLLABORATION_EVENTS.VERSION_SUPERSEDED, payload);
      getSocketIO()?.to(getProductionVersionRoomId(id, currentVersion)).emit(COLLABORATION_EVENTS.VERSION_SUPERSEDED, payload);
    }
    res.json({ message: '创作记录更新成功', version: newVersion });
  } catch {
    res.status(500).json({ message: '更新创作记录失败' });
  }
});

router.delete('/production/:id', authenticate, requirePermission('production:delete'), async (req, res) => {
  try {
    const deletion = await runInTransaction(async (tx) => {
      const production = await tx.queryOne<{
        id: number;
        topic_id: number | null;
        version: string | null;
        creator_id: number | null;
        assignee_id: number | null;
        participant_id: number | null;
        topic_title: string | null;
      }>(
        `SELECT p.id,p.topic_id,p.version,t.creator_id,t.assignee_id,p.operator_id AS participant_id,t.title AS topic_title
         FROM production p LEFT JOIN topics t ON t.id=p.topic_id WHERE p.id=?`,
        [req.params.id],
      );
      if (!production) return { ok: false as const, reason: 'missing' as const };
      if (!canEditProduction(req.user, production)) return { ok: false as const, reason: 'forbidden' as const };
      const referencedSource = await tx.queryOne<{ found: number }>(
        `SELECT 1 AS found FROM shooting WHERE script_source_production_id=?
         UNION ALL
         SELECT 1 AS found FROM publishing WHERE script_source_production_id=?
         UNION ALL
         SELECT 1 AS found FROM workflow_document_versions
         WHERE source_production_id=?
           AND source_production_version IS NOT NULL
           AND document_type IN ('shooting_script','publishing_script')
         LIMIT 1`,
        [req.params.id, req.params.id, req.params.id],
      );
      if (referencedSource) return { ok: false as const, reason: 'source-in-use' as const };
      const historyCount = Number((await tx.queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM production_history WHERE production_id=?`,
        [production.id],
      ))?.count || 0);
      const deleted = await tx.execute(`DELETE FROM production WHERE id = ?`, [production.id]);
      if (deleted === 0) return { ok: false as const, reason: 'missing' as const };
      await tx.execute(`DELETE FROM production_history WHERE production_id = ?`, [production.id]);
      const recordedAt = beijingNow();
      const topicTitle = production.topic_title || '未关联选题';
      const auditDetail = `删除创作记录 #${production.id}（${production.version || '未标注版本'}），选题「${topicTitle}」；同时清除 ${historyCount} 条创作历史版本。`;
      await tx.execute(
        `INSERT INTO topic_history(topic_id,action,comment,operator_id,created_at) VALUES(?,?,?,?,?)`,
        [production.topic_id ?? null, 'production_deleted', auditDetail, req.user?.id ?? null, recordedAt],
      );
      await tx.execute(
        `INSERT INTO activity_log(user_id,action,target,detail,created_at) VALUES(?,?,?,?,?)`,
        [req.user?.id ?? null, 'delete', 'production', auditDetail, recordedAt],
      );
      return { ok: true as const };
    });
    if (!deletion.ok && deletion.reason === 'source-in-use') {
      return res.status(409).json({
        message: '该创作记录仍被成片或发布剧本引用，暂不能删除；请先处理这些来源关联。',
        code: 'PRODUCTION_SCRIPT_SOURCE_IN_USE',
      });
    }
    if (!deletion.ok && deletion.reason === 'forbidden') {
      return res.status(403).json({ message: '无权限删除该创作记录' });
    }
    if (!deletion.ok) return res.status(404).json({ message: '创作记录不存在' });
    broadcastToRoom('production', 'production:deleted', { id: Number(req.params.id) });
    res.json({ message: '创作记录删除成功' });
  } catch {
    res.status(500).json({ message: '删除创作记录失败' });
  }
});

router.get('/production/:id/history', authenticate, async (req, res) => {
  try {
    const topic = await getTopicScopeByProductionId(req.params.id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该创作记录历史' });
    const production = await queryOne<{ version: string | null }>(
      `SELECT version FROM production WHERE id = ?`,
      [req.params.id],
    );
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ message: '分页参数无效' });
    const requestedVersion = typeof req.query.version === 'string' ? req.query.version.trim() : '';
    if (requestedVersion) {
      if (requestedVersion.length > 64) return res.status(400).json({ message: '版本编号无效' });
      const exactVersion = await queryOne<Record<string, unknown>>(
        `SELECT ph.id,ph.production_id,ph.version,ph.content,ph.content_markdown,ph.status,
                ph.change_type,ph.comment,ph.operator_id,ph.created_at,ph.version_state,
                ph.superseded_by_version,ph.superseded_at,ph.material_draft_snapshot_html,u.name AS operator_name
         FROM production_history ph
         LEFT JOIN users u ON u.id=ph.operator_id
         WHERE ph.production_id=? AND ph.version=?
         ORDER BY ph.created_at DESC,ph.id DESC
         LIMIT 1`,
        [req.params.id, requestedVersion],
      );
      if (!exactVersion) return res.status(404).json({ message: '指定的创作版本历史不存在' });
      return res.json({ data: [exactVersion], total: 1, page: 1, limit: 1 });
    }
    // Walk small metadata batches to identify the latest minor in each major.
    // Large historical content is fetched only for the requested page.
    const metadata: Array<VersionRow & { id: number }> = [];
    let offset = 0;
    while (true) {
      const batch = await queryAll<VersionRow & { id: number }>('SELECT id, version, created_at FROM production_history WHERE production_id = ? ORDER BY created_at DESC, id DESC LIMIT 200 OFFSET ?', [req.params.id, offset]);
      metadata.push(...batch);
      if (batch.length < 200) break;
      offset += batch.length;
    }
    const selected = getLatestHistoryRowsByMajor(metadata, production?.version || undefined);
    const ids = selected.slice((page - 1) * limit, page * limit).map((row) => row.id);
    if (!ids.length) return res.json({ data: [], total: selected.length, page, limit });
    const includeContent = req.query.include_content !== '0';
    const fields = includeContent ? 'ph.id,ph.production_id,ph.version,ph.content,ph.content_markdown,ph.status,ph.change_type,ph.comment,ph.operator_id,ph.created_at,ph.version_state,ph.superseded_by_version,ph.superseded_at,ph.material_draft_snapshot_html' : 'ph.id,ph.production_id,ph.version,ph.status,ph.change_type,ph.operator_id,ph.created_at,ph.version_state';
    const rows = await queryAll<Record<string, unknown>>(`SELECT ${fields},u.name AS operator_name FROM production_history ph LEFT JOIN users u ON ph.operator_id=u.id WHERE ph.production_id=? AND ph.id IN (${ids.map(() => '?').join(',')})`, [req.params.id, ...ids]);
    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    res.json({ data: ids.map((id) => byId.get(id)).filter(Boolean), total: selected.length, page, limit });
  } catch {
    res.status(500).json({ message: '获取版本历史失败' });
  }
});

router.get('/production/:id/source-snapshot', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, authenticate, requirePermission('production:view'), async (req, res) => {
  try {
    const productionId = parsePositiveId(req.params.id);
    const version = typeof req.query.version === 'string' ? req.query.version.trim() : '';
    const requestedSourceTopicId = req.query.source_topic_id === undefined
      ? undefined
      : typeof req.query.source_topic_id === 'string' ? parsePositiveId(req.query.source_topic_id) : null;
    if (!productionId || !version || version.length > 64
      || (req.query.source_topic_id !== undefined && requestedSourceTopicId === null)) {
      return res.status(400).json({ message: '创作来源版本信息不完整' });
    }

    // Resolve provenance from stored history. The stage/archive topic may differ after
    // reassignment, so client-supplied topic ids can only constrain the result, never select it.
    const sourceCandidates = await queryAll<{
      source_kind: string;
      source_topic_id: number | null;
      participant_id: number | null;
    }>(
      `SELECT 'current' AS source_kind,p.topic_id AS source_topic_id,p.operator_id AS participant_id
       FROM production p
       WHERE p.id=? AND p.version=?
       UNION ALL
       SELECT 'history' AS source_kind,ph.source_topic_id,NULL AS participant_id
       FROM production_history ph
       WHERE ph.production_id=? AND ph.source_topic_id IS NOT NULL AND ph.version=?`,
      [productionId, version, productionId, version],
    );
    const sourceTopicId = sourceCandidates.length === 1 ? parsePositiveId(sourceCandidates[0].source_topic_id) : null;
    if (!sourceTopicId || (requestedSourceTopicId !== undefined && requestedSourceTopicId !== sourceTopicId)) {
      return res.status(404).json({ message: '创作来源版本不可用' });
    }
    const sourceTopic = await queryOne<{
      id: number;
      title: string;
      creator_id: number | null;
      assignee_id: number | null;
      participant_id: number | null;
    }>(
      'SELECT id,title,creator_id,assignee_id FROM topics WHERE id=?',
      [sourceTopicId],
    );
    if (!sourceTopic) return res.status(404).json({ message: '创作来源版本不可用' });
    if (!canAccessTopic(req.user, {
      ...sourceTopic,
      participant_id: sourceCandidates[0].source_kind === 'current'
        ? parsePositiveId(sourceCandidates[0].participant_id)
        : null,
    })) {
      return res.status(403).json({ message: '无权限查看该创作来源选题' });
    }

    // Return only the exact row selected above; never fall through to the current row.
    const snapshots = sourceCandidates[0].source_kind === 'current'
      ? await queryAll<Record<string, unknown>>(
        `SELECT p.id AS production_id,p.topic_id AS source_topic_id,p.version,
                COALESCE(p.content_markdown,p.content,'') AS content,
                p.content_markdown,p.status,p.created_at,
                COALESCE(p.updated_at,p.created_at) AS version_timestamp,u.name AS operator_name
         FROM production p LEFT JOIN users u ON u.id=p.operator_id
         WHERE p.id=? AND p.topic_id=? AND p.version=?`,
        [productionId, sourceTopicId, version],
      )
      : await queryAll<Record<string, unknown>>(
        `SELECT ph.production_id,ph.source_topic_id,ph.version,
                COALESCE(ph.content_markdown,ph.content,'') AS content,
                ph.content_markdown,ph.status,ph.created_at,
                ph.created_at AS version_timestamp,u.name AS operator_name
         FROM production_history ph LEFT JOIN users u ON u.id=ph.operator_id
         WHERE ph.production_id=? AND ph.source_topic_id=? AND ph.version=?`,
        [productionId, sourceTopicId, version],
      );
    if (snapshots.length !== 1) return res.status(404).json({ message: '创作来源版本不可用' });

    return res.json({
      ...snapshots[0],
      source_topic_id: sourceTopic.id,
      source_topic_title: sourceTopic.title,
    });
  } catch {
    return res.status(500).json({ message: '读取创作来源快照失败' });
  }
});

router.get('/production/:id/review-threads', noStoreResponse, authenticate, async (req, res) => {
  try {
    const productionId = parsePositiveId(req.params.id);
    if (!productionId) return res.status(400).json({ message: '创作记录编号无效' });
    const production = await queryOne<{ id: number; version: string | null }>(
      'SELECT id, version FROM production WHERE id=?',
      [productionId],
    );
    if (!production) return res.status(404).json({ message: '创作记录不存在' });
    const topic = await getTopicScopeByProductionId(productionId);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该稿件的批注与建议' });
    const version = typeof req.query.version === 'string' ? req.query.version.trim() : String(production.version || 'v1.0');
    if (!version || version.length > 32) return res.status(400).json({ message: '版本编号无效' });
    if (!await hasProductionReviewVersion(productionId, version, String(production.version || 'v1.0'))) {
      return res.status(404).json({ message: '稿件版本不存在' });
    }
    const data = await listProductionReviewThreads(productionId, version);
    return res.json({ data });
  } catch {
    return res.status(500).json({ message: '获取批注与建议失败' });
  }
});

router.get('/production/:id/review-threads/requests/:requestId', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, authenticate, async (req, res) => {
  try {
    const productionId = parsePositiveId(req.params.id);
    const requestId = String(req.params.requestId || '').trim().toLowerCase();
    const rawFingerprint = req.query.fingerprint;
    if (!productionId) return res.status(400).json({ message: '创作记录编号无效' });
    if (!UUID_PATTERN.test(requestId)) return res.status(400).json({ message: '批注请求编号无效' });
    if (typeof rawFingerprint !== 'string' || !SHA256_FINGERPRINT_PATTERN.test(rawFingerprint)) {
      return res.status(400).json({ message: '批注载荷指纹无效' });
    }
    const status = await getProductionReviewThreadRequestStatus({
      clientRequestId: requestId,
      actorId: req.user!.id,
      productionId,
      fingerprint: rawFingerprint.toLowerCase(),
    });
    if (status.status === 'conflict') {
      return res.status(409).json({ message: '批注请求编号与原始内容不一致，请核实原请求状态。' });
    }
    return res.json(status);
  } catch {
    return res.status(500).json({ message: '核实批注或建议创建状态失败' });
  }
});

router.post('/production/:id/review-threads', authenticate, requirePermission('workflow:comment'), async (req, res) => {
  try {
    const productionId = parsePositiveId(req.params.id);
    if (!productionId) return res.status(400).json({ message: '创作记录编号无效' });
    const production = await queryOne<{ id: number; version: string | null }>(
      'SELECT id, version FROM production WHERE id=?',
      [productionId],
    );
    if (!production) return res.status(404).json({ message: '创作记录不存在' });
    const topic = await getTopicScopeByProductionId(productionId);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限为该稿件添加批注或建议' });

    const currentVersion = String(production.version || 'v1.0');
    const { version, kind, anchor, summary, proposed_text: proposedText } = req.body ?? {};
    if (typeof version !== 'string' || !version.trim() || version.length > 32) return res.status(400).json({ message: '版本编号无效' });
    if (kind !== 'comment' && kind !== 'suggestion') return res.status(400).json({ message: '批注类型无效' });
    const quote = typeof anchor?.quote === 'string' ? anchor.quote.trim() : '';
    const context = typeof anchor?.context === 'string' ? anchor.context.trim() : '';
    const from = Number(anchor?.from);
    const to = Number(anchor?.to);
    const cleanSummary = typeof summary === 'string' ? summary.trim() : '';
    if (!quote || Array.from(quote).length > 2000 || !cleanSummary || Array.from(cleanSummary).length > 4000) {
      return res.status(400).json({ message: '原文和说明不能为空且不能超过长度限制' });
    }
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from) {
      return res.status(400).json({ message: '原文锚点无效，请重新选择正文' });
    }
    if (Array.from(context).length > 500) return res.status(400).json({ message: '原文上下文不能超过 500 个字符' });
    if (kind === 'suggestion' && (typeof proposedText !== 'string' || Array.from(proposedText).length > 2000)) {
      return res.status(400).json({ message: '修改建议内容无效或过长' });
    }

    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    if (rawClientRequestId !== undefined && (typeof rawClientRequestId !== 'string' || !UUID_PATTERN.test(clientRequestId))) {
      return res.status(400).json({ message: '批注请求编号无效' });
    }

    const threadInput = {
      productionId,
      version,
      kind: kind as ProductionReviewKind,
      anchor: { quote, context, from, to },
      summary: cleanSummary,
      proposedText: kind === 'suggestion' ? proposedText as string : null,
      authorId: req.user!.id,
    };
    if (clientRequestId) {
      const result = await createProductionReviewThreadWithRequest({ ...threadInput, clientRequestId });
      if (result.kind === 'created' || result.kind === 'replayed') {
        return res.status(result.kind === 'replayed' ? 200 : 201).json({
          message: kind === 'comment' ? '批注已添加' : '修改建议已提交',
          id: result.threadId,
          replayed: result.kind === 'replayed',
        });
      }
      if (result.kind === 'request-conflict') return res.status(409).json({ message: '批注请求编号已被其他内容或稿件使用，请核实原请求状态。' });
      if (result.kind === 'production-missing') return res.status(404).json({ message: '创作记录不存在' });
      if (result.kind === 'historical') return res.status(409).json({ message: '历史版本为只读，请切换到当前版本后添加批注或建议' });
      return res.status(409).json({ message: '批注请求无法完成，请核实原请求状态。' });
    }

    if (version !== currentVersion) return res.status(409).json({ message: '历史版本为只读，请切换到当前版本后添加批注或建议' });

    const id = await createProductionReviewThread(threadInput);
    return res.status(201).json({ message: kind === 'comment' ? '批注已添加' : '修改建议已提交', id });
  } catch {
    return res.status(500).json({ message: '添加批注或建议失败' });
  }
});

router.get('/production/:id/review-threads/:threadId/replies/requests/:requestId', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, authenticate, async (req, res) => {
  try {
    const productionId = parsePositiveId(req.params.id);
    const threadId = parsePositiveId(req.params.threadId);
    const requestId = String(req.params.requestId || '').trim().toLowerCase();
    const rawFingerprint = req.query.fingerprint;
    if (!productionId || !threadId) return res.status(400).json({ message: '稿件或批注编号无效' });
    if (!UUID_PATTERN.test(requestId)) return res.status(400).json({ message: '回复请求编号无效' });
    if (typeof rawFingerprint !== 'string' || !SHA256_FINGERPRINT_PATTERN.test(rawFingerprint)) {
      return res.status(400).json({ message: '回复载荷指纹无效' });
    }
    const status = await getProductionReviewReplyRequestStatus({
      clientRequestId: requestId,
      actorId: req.user!.id,
      productionId,
      threadId,
      fingerprint: rawFingerprint.toLowerCase(),
    });
    if (status.status === 'conflict') {
      return res.status(409).json({ message: '回复请求编号与原始内容不一致，请核实原请求状态。' });
    }
    return res.json(status);
  } catch {
    return res.status(500).json({ message: '核实批注回复状态失败' });
  }
});

router.post('/production/:id/review-threads/:threadId/replies', authenticate, requirePermission('workflow:comment'), async (req, res) => {
  try {
    const productionId = parsePositiveId(req.params.id);
    const threadId = parsePositiveId(req.params.threadId);
    if (!productionId || !threadId) return res.status(400).json({ message: '批注编号无效' });
    const production = await queryOne<{ version: string | null }>('SELECT version FROM production WHERE id=?', [productionId]);
    if (!production) return res.status(404).json({ message: '创作记录不存在' });
    const topic = await getTopicScopeByProductionId(productionId);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限回复该稿件批注' });
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    if (rawClientRequestId !== undefined && (typeof rawClientRequestId !== 'string' || !UUID_PATTERN.test(clientRequestId))) {
      return res.status(400).json({ message: '回复请求编号无效' });
    }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content || Array.from(content).length > 4000) return res.status(400).json({ message: '回复不能为空且不能超过 4000 个字符' });

    if (clientRequestId) {
      const result = await createProductionReviewReplyWithRequest({
        clientRequestId,
        productionId,
        threadId,
        authorId: req.user!.id,
        content,
      });
      if (result.kind === 'created' || result.kind === 'replayed') {
        return res.status(result.kind === 'replayed' ? 200 : 201).json({
          message: '回复已添加',
          id: result.replyId,
          replayed: result.kind === 'replayed',
        });
      }
      if (result.kind === 'request-conflict') return res.status(409).json({ message: '回复请求编号已被其他内容或对象使用，请核实原请求状态。' });
      if (result.kind === 'production-missing') return res.status(404).json({ message: '创作记录不存在' });
      if (result.kind === 'thread-missing') return res.status(404).json({ message: '批注线程不存在' });
      if (result.kind === 'historical') return res.status(409).json({ message: '历史版本批注为只读' });
      if (result.kind === 'closed') return res.status(409).json({ message: '该讨论已结束，不能继续回复' });
      return res.status(409).json({ message: '回复请求无法完成，请核实原请求状态。' });
    }

    const thread = await getProductionReviewThread(threadId, productionId);
    if (!thread) return res.status(404).json({ message: '批注线程不存在' });
    if (thread.version !== String(production.version || 'v1.0')) return res.status(409).json({ message: '历史版本批注为只读' });
    if (thread.status !== 'open') return res.status(409).json({ message: '该讨论已结束，不能继续回复' });
    const id = await createProductionReviewReply(threadId, req.user!.id, content);
    return res.status(201).json({ message: '回复已添加', id });
  } catch {
    return res.status(500).json({ message: '添加回复失败' });
  }
});

router.get('/production/:id/review-threads/:threadId/status-requests/:requestId', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, authenticate, async (req, res) => {
  try {
    const productionId = parsePositiveId(req.params.id);
    const threadId = parsePositiveId(req.params.threadId);
    const requestId = String(req.params.requestId || '').trim().toLowerCase();
    const status = req.query.status;
    if (!productionId || !threadId) return res.status(400).json({ message: '稿件或批注编号无效' });
    if (!UUID_PATTERN.test(requestId)) return res.status(400).json({ message: '批注状态请求编号无效' });
    if (status !== 'resolved' && status !== 'accepted' && status !== 'rejected') {
      return res.status(400).json({ message: '批注状态请求目标无效' });
    }
    const result = await getProductionReviewStatusRequestStatus({
      clientRequestId: requestId,
      actorId: req.user!.id,
      productionId,
      threadId,
      status,
    });
    if (result.status === 'conflict') {
      return res.status(409).json({ message: '状态请求编号与原操作不一致，请核实稿件当前状态。' });
    }
    return res.json(result);
  } catch {
    return res.status(500).json({ message: '核实批注或建议状态失败' });
  }
});

router.patch('/production/:id/review-threads/:threadId/status', authenticate, async (req, res) => {
  try {
    const productionId = parsePositiveId(req.params.id);
    const threadId = parsePositiveId(req.params.threadId);
    if (!productionId || !threadId) return res.status(400).json({ message: '批注编号无效' });
    const production = await queryOne<{ version: string | null }>('SELECT version FROM production WHERE id=?', [productionId]);
    if (!production) return res.status(404).json({ message: '创作记录不存在' });
    const topic = await getTopicScopeByProductionId(productionId);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限更新该稿件批注' });
    const thread = await getProductionReviewThread(threadId, productionId);
    if (!thread) return res.status(404).json({ message: '批注线程不存在' });

    const status = req.body?.status as ProductionReviewStatus;
    const userId = req.user!.id;
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    if (rawClientRequestId !== undefined && (typeof rawClientRequestId !== 'string' || !UUID_PATTERN.test(clientRequestId))) {
      return res.status(400).json({ message: '批注状态请求编号无效' });
    }
    const canComment = await userHasPermission(userId, 'workflow:comment');
    const canModerate = await userHasPermission(userId, 'comment:delete');
    if (thread.kind === 'comment') {
      if (status !== 'resolved') return res.status(400).json({ message: '讨论状态无效' });
      if ((!canComment && !canModerate) || (thread.author_id !== userId && !canModerate)) {
        return res.status(403).json({ message: '只有批注发起人或管理员可以结束讨论' });
      }
    } else {
      if (status !== 'accepted' && status !== 'rejected') return res.status(400).json({ message: '修改建议状态无效' });
      if (!canComment && !canModerate) return res.status(403).json({ message: '无权限处理修改建议' });
      if (status === 'accepted' && (!await userHasPermission(userId, 'production:update') || !canEditProduction(req.user, topic))) {
        return res.status(403).json({ message: '只有有权编辑该稿件的成员可以接受修改建议' });
      }
    }
    if (clientRequestId) {
      const result = await updateProductionReviewStatusWithRequest({
        clientRequestId,
        productionId,
        threadId,
        status,
        reviewerId: userId,
      });
      if (result.kind === 'updated' || result.kind === 'replayed') {
        return res.json({
          message: status === 'resolved' ? '讨论已结束' : status === 'accepted' ? '建议已接受' : '建议已拒绝',
          replayed: result.kind === 'replayed',
        });
      }
      if (result.kind === 'request-conflict') return res.status(409).json({ message: '状态请求编号已被其他操作者或操作使用，请核实原请求状态。' });
      if (result.kind === 'production-missing') return res.status(404).json({ message: '创作记录不存在' });
      if (result.kind === 'thread-missing') return res.status(404).json({ message: '批注线程不存在' });
      if (result.kind === 'historical') return res.status(409).json({ message: '历史版本批注为只读' });
      return res.status(409).json({ message: '该批注或建议已被其他协作者处理' });
    }

    if (thread.version !== String(production.version || 'v1.0')) return res.status(409).json({ message: '历史版本批注为只读' });
    if (thread.status !== 'open') return res.status(409).json({ message: '该批注或建议已处理' });
    const changed = await updateProductionReviewStatus(threadId, status, userId);
    if (!changed) return res.status(409).json({ message: '该批注或建议已被其他协作者处理' });
    return res.json({ message: status === 'resolved' ? '讨论已结束' : status === 'accepted' ? '建议已接受' : '建议已拒绝' });
  } catch {
    return res.status(500).json({ message: '更新批注或建议状态失败' });
  }
});

router.get('/shooting', authenticate, async (req, res) => {
  try {
    const { topic_id } = req.query;
    let query = `SELECT s.*, u.name as operator_name, t.title as topic_title, t.status as topic_status FROM shooting s LEFT JOIN users u ON s.operator_id = u.id LEFT JOIN topics t ON s.topic_id = t.id WHERE 1=1`;
    const params: any[] = [];
    if (topic_id) { query += ` AND s.topic_id = ?`; params.push(topic_id); }
    if (!canViewAllContent(req.user)) {
      const userId = req.user!.id;
      query += ` AND (t.creator_id = ? OR t.assignee_id = ? OR s.operator_id = ?)`;
      params.push(userId, userId, userId);
    }
    const { page, limit, offset } = parseListPagination(req.query);
    const total = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM (${query}) AS shooting_list`, params);
    query += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
    const data = await queryAll(query, [...params, limit, offset]);
    res.json({ data, total: total?.total || 0, page, limit });
  } catch {
    res.status(500).json({ message: '获取拍摄列表失败' });
  }
});

router.get('/shooting/create-request/:requestId', noStoreResponse, authenticate, async (req, res) => {
  try {
    const requestId = String(req.params.requestId || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return res.status(400).json({ message: '成片制作请求编号无效' });
    }
    const request = await queryOne<{ shooting_id: number; topic_id: number | null }>(
      `SELECT k.shooting_id,s.topic_id
       FROM shooting_create_request_keys k
       LEFT JOIN shooting s ON s.id=k.shooting_id
       WHERE k.client_request_id=? AND k.creator_id=?`,
      [requestId, Number(req.user?.id)],
    );
    if (!request) return res.status(404).json({ message: '尚未找到对应制作计划' });
    if (request.topic_id === null) return res.status(410).json({ deleted: true, message: '对应制作计划已删除' });
    const topic = await getTopicScopeByShootingId(request.shooting_id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该制作计划请求状态' });
    return res.json({ shootingId: Number(request.shooting_id) });
  } catch {
    return res.status(500).json({ message: '核实制作计划创建状态失败' });
  }
});

router.get('/shooting/:id', noStoreResponse, authenticate, async (req, res) => {
  try {
    const shooting = await queryOne(`SELECT s.*, u.name as operator_name, t.title as topic_title, t.status as topic_status FROM shooting s LEFT JOIN users u ON s.operator_id = u.id LEFT JOIN topics t ON s.topic_id = t.id WHERE s.id = ?`, [req.params.id]);
    if (!shooting) return res.status(404).json({ message: '成片制作记录不存在' });
    const topic = await getTopicScopeByShootingId(req.params.id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该成片制作记录' });

    // 获取关联的已通过审核的创作记录
    const production = await queryOne(`SELECT p.id, p.version, p.content, p.content_markdown, p.status, p.created_at, p.updated_at, COALESCE(p.updated_at,p.created_at) AS version_timestamp, u.name as operator_name FROM production p LEFT JOIN users u ON p.operator_id = u.id WHERE p.topic_id = ? AND p.status = 'approved' ORDER BY p.updated_at DESC LIMIT 1`, [(shooting as any).topic_id]);
    const shootingSourceFields = shooting as {
      topic_id?: number | string;
      script_source_production_id?: number | null;
      script_source_version?: string | null;
    };
    const scriptSourceProduction = shootingSourceFields.script_source_production_id && shootingSourceFields.script_source_version
        ? await getApprovedWorkflowScriptSource(Number(shootingSourceFields.topic_id), {
        productionId: Number(shootingSourceFields.script_source_production_id),
        version: String(shootingSourceFields.script_source_version),
      })
      : null;
    let publishedArchiveScriptSyncPending: boolean | null = null;
    let canSyncPublishedArchive = false;
    try {
      const [archiveDrift, hasWorkflowPermission] = await Promise.all([
        hasPublishedArchiveScriptDrift(Number(shootingSourceFields.topic_id)),
        req.user ? userHasPermission(req.user.id, 'workflow:shooting') : Promise.resolve(false),
      ]);
      publishedArchiveScriptSyncPending = archiveDrift;
      canSyncPublishedArchive = hasWorkflowPermission && canEditProduction(req.user, topic);
    } catch (error) {
      apiLogger.error({
        module: 'shooting',
        operation: 'archive.script_sync_status_read_failed',
        error: { code: 'ARCHIVE_STATUS_UNAVAILABLE', name: error instanceof Error ? error.name : 'UnknownError' },
      }, 'api.shooting.archive_status_unavailable');
    }

    res.json({
      ...shooting,
      production: production || null,
      script_source_production: scriptSourceProduction || null,
      published_archive_script_sync_pending: publishedArchiveScriptSyncPending,
      can_sync_published_archive: canSyncPublishedArchive,
    });
  } catch {
    res.status(500).json({ message: '获取成片制作记录失败' });
  }
});

router.post('/shooting/:id/archive-sync', authenticate, requirePermission('workflow:shooting'), async (req, res) => {
  try {
    const shooting = await queryOne<{ topic_id: number }>('SELECT topic_id FROM shooting WHERE id=?', [req.params.id]);
    if (!shooting) return res.status(404).json({ message: '成片制作记录不存在' });
    const topic = await getTopicScopeByShootingId(req.params.id);
    if (!canEditProduction(req.user, topic)) return res.status(403).json({ message: '无权限同步该选题的发布归档' });

    const archiveSync = await attemptPublishedArchiveSync(
      Number(shooting.topic_id),
      req.user?.id,
      'shooting',
      'archive.manual_retry_failed',
    );
    if (archiveSync === 'pending') {
      return res.status(503).json({ message: '归档暂未同步，请稍后重试', archiveSync });
    }
    return res.json({
      message: archiveSync === 'skipped' ? '当前没有可更新的已发布内容，历史归档保持不变' : '发布归档已同步',
      archiveSync,
    });
  } catch {
    return res.status(500).json({ message: '同步发布归档失败' });
  }
});

router.get('/shooting/:id/versions', authenticate, async (req, res) => {
  try {
    const shooting = await queryOne<{ id: number }>('SELECT id FROM shooting WHERE id=?', [req.params.id]);
    if (!shooting) return res.status(404).json({ message: '成片制作记录不存在' });
    const topic = await getTopicScopeByShootingId(req.params.id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该成片制作记录' });
    return res.json({ data: await listWorkflowDocumentVersions('shooting_script', req.params.id) });
  } catch {
    return res.status(500).json({ message: '获取剧本版本历史失败' });
  }
});

router.put('/shooting/:id', authenticate, requirePermission('workflow:shooting'), async (req, res) => {
  try {
    const { id } = req.params;
    const { topic_id, plan_date, location, equipment, status, script_content } = req.body;
    const versionAction = req.body.version_action;
    const expectedContent = req.body.expected_content;
    if (versionAction !== undefined && versionAction !== 'none' && versionAction !== 'minor' && versionAction !== 'major') {
      return res.status(400).json({ message: '剧本版本操作无效' });
    }
    if ((versionAction === 'minor' || versionAction === 'major')
      && (script_content === undefined || typeof expectedContent !== 'string'
        || topic_id !== undefined || plan_date !== undefined || location !== undefined || equipment !== undefined || status !== undefined)) {
      return res.status(400).json({ message: '创建剧本版本时仅能提交剧本内容及其来源，并须提供预期原稿' });
    }
    const scriptSourceParse = parseWorkflowScriptSourceReference(req.body || {});
    if (scriptSourceParse.kind === 'invalid' || (scriptSourceParse.kind === 'valid' && script_content === undefined)) {
      return res.status(400).json({ message: '剧本来源版本信息无效' });
    }
    if (status !== undefined && (typeof status !== 'string' || !SHOOTING_STATUSES.has(status))) {
      return res.status(400).json({ message: '成片制作状态无效' });
    }
    const updateFields: string[] = [];
    const params: any[] = [];
    if (topic_id !== undefined) { updateFields.push('topic_id = ?'); params.push(topic_id); }
    if (plan_date !== undefined) { updateFields.push('plan_date = ?'); params.push(plan_date); }
    if (location !== undefined) { updateFields.push('location = ?'); params.push(location); }
    if (equipment !== undefined) { updateFields.push('equipment = ?'); params.push(equipment); }
    if (status !== undefined) { updateFields.push('status = ?'); params.push(status); }
    if (script_content !== undefined) { updateFields.push('script_content = ?'); params.push(script_content); }
    if (updateFields.length === 0) return res.status(400).json({ message: '没有需要更新的字段' });

    const shooting = await queryOne<{
      topic_id: number;
      status: string;
      script_content?: string | null;
      script_source_production_id?: number | null;
      script_source_version?: string | null;
    }>(`SELECT topic_id,status,script_content,script_source_production_id,script_source_version FROM shooting WHERE id = ?`, [id]);
    if (!shooting) return res.status(404).json({ message: '成片制作记录不存在' });
    const currentTopic = await getTopicScopeByShootingId(id);
    if (!canEditProduction(req.user, currentTopic)) return res.status(403).json({ message: '无权限修改该成片制作记录' });
    if (scriptSourceParse.kind === 'valid') {
      const { reference } = scriptSourceParse;
      const existingSourceId = Number(shooting.script_source_production_id) || null;
      const existingSourceVersion = shooting.script_source_version || null;
      const sameSource = existingSourceId === reference.productionId && existingSourceVersion === reference.version;
      if (existingSourceId && !sameSource) {
        return res.status(409).json({ message: '剧本来源版本已记录，不能静默更换' });
      }
      if (!existingSourceId && shooting.script_content !== null && shooting.script_content !== undefined) {
        return res.status(409).json({ message: '既有本地剧本来源未记录，不能推测补写来源' });
      }
      const targetTopicId = Number(topic_id ?? shooting.topic_id);
      if (!sameSource && !await isApprovedWorkflowScriptSource(targetTopicId, reference)) {
        return res.status(400).json({ message: '剧本来源必须是该选题已通过审核的创作版本' });
      }
      updateFields.push('script_source_production_id = ?', 'script_source_version = ?');
      params.push(reference.productionId, reference.version);
    }
    const changingCompletedHandoff = (status !== undefined && status !== 'completed')
      || (topic_id !== undefined && Number(topic_id) !== Number(shooting.topic_id));
    if (shooting.status === 'completed' && changingCompletedHandoff) {
      return res.status(409).json({
        message: '已完成并流转到发布环节的成片记录不能退回或更换关联选题',
        code: 'WORKFLOW_STAGE_CONFLICT',
      });
    }
    const targetTopicId = topic_id !== undefined ? topic_id : shooting.topic_id;
    if (topic_id !== undefined) {
      const nextTopic = await getTopicScopeById(topic_id);
      if (!nextTopic) return res.status(404).json({ message: '选题不存在' });
      if (!canEditProduction(req.user, nextTopic)) return res.status(403).json({ message: '无权限关联到目标选题' });
    }
    let versionBaselineContent = shooting.script_content ?? '';
    if ((versionAction === 'minor' || versionAction === 'major')
      && shooting.script_content == null && scriptSourceParse.kind === 'valid') {
      const approvedSource = await getApprovedWorkflowScriptSource(Number(topic_id ?? shooting.topic_id), scriptSourceParse.reference);
      if (!approvedSource) return res.status(409).json({ message: '剧本来源版本已不可用，请刷新后重新选择来源', code: 'WORKFLOW_SCRIPT_SOURCE_CONFLICT' });
      versionBaselineContent = approvedSource.content ?? '';
    }
    if (versionAction === 'minor' || versionAction === 'major') {
      const result = await runInTransaction(async (tx) => {
        const latest = await tx.queryOne<{
          topic_id: number;
          script_content: string | null;
          script_source_production_id: number | null;
          script_source_version: string | null;
        }>('SELECT topic_id,script_content,script_source_production_id,script_source_version FROM shooting WHERE id=?', [id]);
        if (!latest || Number(latest.topic_id) !== Number(shooting.topic_id)) {
          return { ok: false as const, reason: 'stale' as const };
        }
        const version = await recordWorkflowDocumentVersion(tx, {
          documentType: 'shooting_script',
          documentId: id,
          currentContent: latest.script_content ?? versionBaselineContent,
          nextContent: String(script_content),
          expectedContent: expectedContent as string,
          action: versionAction,
          operatorId: req.user?.id,
          sourceProductionId: scriptSourceParse.kind === 'valid' ? scriptSourceParse.reference.productionId : latest.script_source_production_id,
          sourceProductionVersion: scriptSourceParse.kind === 'valid' ? scriptSourceParse.reference.version : latest.script_source_version,
        });
        if (!version.ok) return version;
        const changed = await tx.execute(
          `UPDATE shooting SET ${updateFields.join(', ')},updated_at=datetime('now','+8 hours') WHERE id=?`,
          [...params, id],
        );
        return changed > 0 ? { ok: true as const } : { ok: false as const, reason: 'stale' as const };
      });
      if (!result.ok) {
        return res.status(409).json({
          message: '剧本已被其他协作者修改，请刷新后核对再创建版本',
          code: 'VERSION_CONFLICT',
        });
      }
    }
    if (versionAction === 'minor' || versionAction === 'major') {
      // The version snapshot and current content were written together above.
    } else if (status === 'completed') {
      const handoff = await runInTransaction(async (tx) => {
        const latestShooting = await tx.queryOne<{ topic_id: number; status: string; script_content?: string | null }>(
          'SELECT topic_id,status,script_content FROM shooting WHERE id=?',
          [id],
        );
        if (!latestShooting) return { ok: false as const, reason: 'missing' as const };
        if (Number(latestShooting.topic_id) !== Number(shooting.topic_id)) {
          return { ok: false as const, reason: 'stale-record' as const };
        }
        if (latestShooting.status === 'completed' && changingCompletedHandoff) {
          return { ok: false as const, reason: 'completed-handoff' as const };
        }
        const transition = await completeShootingHandoff(
          tx,
          targetTopicId,
          req.user?.id,
          (script_content !== undefined ? script_content : latestShooting.script_content) || null,
        );
        if (!transition.ok) return transition;
        params.push(id);
        const shootingChanged = await tx.execute(
          `UPDATE shooting SET ${updateFields.join(', ')}, updated_at=datetime('now','+8 hours') WHERE id=?`,
          params,
        );
        if (shootingChanged > 0 && latestShooting.status !== 'completed') {
          const topic = await tx.queryOne<{ title: string }>('SELECT title FROM topics WHERE id=?', [targetTopicId]);
          await recordShootingStatusCorrection(
            tx,
            targetTopicId,
            topic?.title || `选题 #${targetTopicId}`,
            id,
            latestShooting.status,
            'completed',
            req.user?.id,
          );
        }
        return transition;
      });
      if (!handoff.ok) {
        if ('reason' in handoff && handoff.reason === 'missing') {
          return res.status(404).json({ message: '成片制作记录不存在' });
        }
        if ('reason' in handoff && handoff.reason === 'stale-record') {
          return res.status(409).json({ message: '成片制作记录已被其他协作者修改，请刷新页面核对后重试', code: 'SHOOTING_RECORD_CONFLICT' });
        }
        if ('reason' in handoff && handoff.reason === 'completed-handoff') {
          return res.status(409).json({
            message: '已完成并流转到发布环节的成片记录不能退回或更换关联选题',
            code: 'WORKFLOW_STAGE_CONFLICT',
          });
        }
        return res.status(409).json({
          message: workflowStageConflictMessage(handoff.status, 'shooting', '完成成片制作'),
          code: 'WORKFLOW_STAGE_CONFLICT',
        });
      }
    } else if (status !== undefined && status !== shooting.status) {
      const correction = await runInTransaction(async (tx) => {
        const latest = await tx.queryOne<{ topic_id: number; status: string }>(
          'SELECT topic_id,status FROM shooting WHERE id=?',
          [id],
        );
        if (!latest) return { ok: false as const, reason: 'missing' as const };
        if (Number(latest.topic_id) !== Number(shooting.topic_id) || latest.status !== shooting.status) {
          return { ok: false as const, reason: 'stale-record' as const };
        }
        const changed = await tx.execute(
          `UPDATE shooting SET ${updateFields.join(', ')}, updated_at=datetime('now','+8 hours') WHERE id=? AND status=?`,
          [...params, id, shooting.status],
        );
        if (changed === 0) return { ok: false as const, reason: 'stale-record' as const };
        const topic = await tx.queryOne<{ title: string }>('SELECT title FROM topics WHERE id=?', [targetTopicId]);
        await recordShootingStatusCorrection(
          tx,
          targetTopicId,
          topic?.title || `选题 #${targetTopicId}`,
          id,
          shooting.status,
          String(status),
          req.user?.id,
        );
        return { ok: true as const };
      });
      if (!correction.ok) {
        if (correction.reason === 'missing') return res.status(404).json({ message: '成片制作记录不存在' });
        return res.status(409).json({ message: '成片制作记录已被其他协作者修改，请刷新页面核对后重试', code: 'SHOOTING_RECORD_CONFLICT' });
      }
    } else {
      params.push(id);
      const completedGuard = changingCompletedHandoff ? ` AND status <> 'completed'` : '';
      const changed = await execute(`UPDATE shooting SET ${updateFields.join(', ')}, updated_at = datetime('now', '+8 hours') WHERE id = ?${completedGuard}`, params);
      if (changingCompletedHandoff && changed === 0) {
        const latest = await queryOne<{ status: string }>('SELECT status FROM shooting WHERE id=?', [id]);
        if (!latest) return res.status(404).json({ message: '成片制作记录不存在' });
        if (latest.status === 'completed') {
          return res.status(409).json({
            message: '已完成并流转到发布环节的成片记录不能退回或更换关联选题',
            code: 'WORKFLOW_STAGE_CONFLICT',
          });
        }
      }
    }
    let archiveSync: ArchiveSyncFeedback = 'not_required';
    if (script_content !== undefined || scriptSourceParse.kind === 'valid') {
      const targetTopicId = Number(topic_id ?? shooting.topic_id);
      const hasPublishedRecord = await queryOne<{ found: number }>(
        `SELECT 1 AS found FROM publishing p
         WHERE p.topic_id=? AND (
           p.status='published'
           OR EXISTS (SELECT 1 FROM publishing_douyin_links l WHERE l.publishing_id=p.id)
         ) LIMIT 1`,
        [targetTopicId],
      );
      if (hasPublishedRecord) {
        archiveSync = await attemptPublishedArchiveSync(
          targetTopicId,
          req.user?.id,
          'shooting',
          'archive.sync_after_script_update_failed',
        );
      }
    }
    broadcastToRoom('shooting', 'shooting:updated', { id: Number(req.params.id) });
    res.json({ message: '成片制作记录更新成功', archiveSync });
  } catch {
    res.status(500).json({ message: '更新成片制作记录失败' });
  }
});

router.delete('/shooting/:id', authenticate, requirePermission('workflow:shooting'), async (req, res) => {
  try {
    const shooting = await queryOne(`SELECT * FROM shooting WHERE id = ?`, [req.params.id]);
    if (!shooting) return res.status(404).json({ message: '成片制作记录不存在' });
    const topic = await getTopicScopeByShootingId(req.params.id);
    if (!canEditProduction(req.user, topic)) return res.status(403).json({ message: '无权限删除该成片制作记录' });
    await runInTransaction(async (tx) => {
      await deleteWorkflowDocumentVersionsForDocument(tx, 'shooting_script', req.params.id);
      await tx.execute(`DELETE FROM shooting WHERE id = ?`, [req.params.id]);
    });
    res.json({ message: '成片制作记录删除成功' });
  } catch {
    res.status(500).json({ message: '删除成片制作记录失败' });
  }
});

router.post('/shooting', authenticate, requirePermission('workflow:shooting'), async (req, res) => {
  try {
    const { topic_id, plan_date, location, equipment, status = 'planned' } = req.body;
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    if (!topic_id) return res.status(400).json({ message: '选题ID不能为空' });
    if (rawClientRequestId !== undefined && rawClientRequestId !== null
      && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
      return res.status(400).json({ message: '成片制作请求编号无效' });
    }
    if (typeof status !== 'string' || !SHOOTING_STATUSES.has(status)) return res.status(400).json({ message: '成片制作状态无效' });
    const requestFingerprint = clientRequestId
      ? createHash('sha256').update(JSON.stringify([
        Number(topic_id), plan_date ?? null, location ?? null, equipment ?? null, String(status),
      ])).digest('hex')
      : '';
    const topic = await getTopicScopeById(topic_id);
    if (!topic) return res.status(404).json({ message: '选题不存在' });
    if (!canEditProduction(req.user, topic)) return res.status(403).json({ message: '无权限操作该选题的成片制作记录' });
    const result = await runInTransaction(async (tx) => {
      if (clientRequestId) {
        const existing = await tx.queryOne<{
          shooting_id: number;
          creator_id: number;
          request_fingerprint: string;
        }>(
          `SELECT shooting_id,creator_id,request_fingerprint FROM shooting_create_request_keys WHERE client_request_id=?`,
          [clientRequestId],
        );
        if (existing) {
          if (Number(existing.creator_id) !== Number(req.user?.id) || existing.request_fingerprint !== requestFingerprint) {
            return { conflict: true as const };
          }
          const existingShooting = await tx.queryOne<{ id: number }>(
            'SELECT id FROM shooting WHERE id=?',
            [existing.shooting_id],
          );
          return existingShooting
            ? { ok: true as const, shootingId: Number(existing.shooting_id), created: false }
            : { deleted: true as const };
        }
      }

      if (status === 'completed') {
        const transition = await completeShootingHandoff(tx, topic_id, req.user?.id, null);
        if (!transition.ok) return transition;
      }
      const shootingId = await tx.executeInsert(
        `INSERT INTO shooting (topic_id, plan_date, location, equipment, status, operator_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [topic_id, plan_date, location, equipment, status, req.user?.id],
      );
      if (clientRequestId) {
        await tx.execute(
          `INSERT INTO shooting_create_request_keys(client_request_id,creator_id,shooting_id,request_fingerprint,created_at)
           VALUES(?,?,?,?,?)`,
          [clientRequestId, Number(req.user?.id), shootingId, requestFingerprint, beijingNow()],
        );
      }
      return { ok: true as const, shootingId, created: true };
    });
    if ('conflict' in result) {
      return res.status(409).json({ message: '成片制作请求编号已用于其他内容，请先核实原请求状态。', code: 'SHOOTING_CREATE_REQUEST_CONFLICT' });
    }
    if ('deleted' in result) {
      return res.status(410).json({ message: '该请求对应的制作计划已删除，不会因为重试而重新创建。', deleted: true });
    }
    if (!result.ok) {
      return res.status(409).json({
        message: workflowStageConflictMessage(result.status, 'shooting', '创建已完成的成片记录'),
        code: 'WORKFLOW_STAGE_CONFLICT',
      });
    }
    if (result.created) broadcastToRoom('shooting', 'shooting:created', { id: result.shootingId, topic_id });
    return res.json({
      message: '成片制作计划添加成功',
      shootingId: result.shootingId,
      ...(clientRequestId ? { idempotent_replay: !result.created } : {}),
    });
  } catch {
    res.status(500).json({ message: '添加成片制作计划失败' });
  }
});

const publishingWithDouyinSelect = `
  ${publishingMetricSelect},
  p.url,p.script_content,p.created_at,p.updated_at,
  p.platform AS publishing_platform,
  CASE WHEN dw.id IS NOT NULL THEN '抖音' ELSE p.platform END AS platform,
  CASE WHEN dw.id IS NOT NULL THEN 'published' ELSE p.status END AS status,
  COALESCE(dw.publish_time,p.publish_time) AS publish_time,
  u.name AS operator_name,t.title AS topic_title,
  dw.id AS douyin_work_id,dw.title AS douyin_title,
  link.match_method AS douyin_match_method,link.match_score AS douyin_match_score,
  CASE WHEN dw.id IS NOT NULL THEN 'douyin' ELSE 'publishing' END AS data_source
`;

const publishingWithDouyinJoins = `
  LEFT JOIN users u ON p.operator_id=u.id
  LEFT JOIN topics t ON p.topic_id=t.id
  ${publishingMetricJoins}
`;

router.post(
  '/publishing/douyin/reconcile',
  authenticate,
    requireAllPermissions('workflow:publishing', 'creator:data:view'),
    async (req, res) => {
    try {
      const result = await reconcilePublishingDouyinLinks({
        createdBy: req.user?.id,
        ...(canEditAllContent(req.user)
          ? { scope: 'all' as const }
          : { scope: 'editable' as const, editableBy: req.user!.id }),
      });
      const { topicIds, ...summary } = result;
      let archiveSyncPending = 0;
      for (const topicId of topicIds) {
        try {
          await syncPublishedArchive(topicId, req.user?.id);
        } catch (error) {
          archiveSyncPending += 1;
          apiLogger.error({
            module: 'publishing',
            operation: 'archive.sync_after_reconcile_failed',
            error: { code: 'ARCHIVE_SYNC_FAILED', name: error instanceof Error ? error.name : 'UnknownError' },
          }, 'api.publishing.archive_sync_failed');
        }
      }
      res.json({ message: '抖音作品关联已刷新', ...summary, archiveSyncPending });
    } catch {
      res.status(500).json({ message: '刷新抖音作品关联失败' });
    }
  },
);

router.get(
  '/publishing/:id/douyin-candidates',
  authenticate,
  requirePermission('creator:data:view'),
  async (req, res) => {
    try {
      const publishingId = Number(req.params.id);
      if (!Number.isSafeInteger(publishingId) || publishingId <= 0) {
        return res.status(400).json({ message: '发布记录 ID 无效' });
      }
      const topic = await getTopicScopeByPublishingId(publishingId);
      if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该发布记录' });
      const query = String(req.query.query || '').trim();
      if (query.length > 200) return res.status(400).json({ message: '搜索关键词不能超过 200 个字符' });
      const result = await getPublishingDouyinCandidates(publishingId, query);
      if (!result) return res.status(404).json({ message: '发布记录不存在' });
      res.json(result);
    } catch {
      res.status(500).json({ message: '获取抖音作品候选失败' });
    }
  },
);

router.put(
  '/publishing/:id/douyin-link',
  authenticate,
  requireAllPermissions('workflow:publishing', 'creator:data:view'),
  async (req, res) => {
    try {
      const publishingId = Number(req.params.id);
      const workId = req.body?.douyin_work_id == null ? null : Number(req.body.douyin_work_id);
      if (!Number.isSafeInteger(publishingId) || publishingId <= 0 || (workId !== null && (!Number.isSafeInteger(workId) || workId <= 0))) {
        return res.status(400).json({ message: '关联参数无效' });
      }
      const topic = await getTopicScopeByPublishingId(publishingId);
      if (!canEditProduction(req.user, topic)) return res.status(403).json({ message: '无权限修改该发布记录' });
      const result = await setPublishingDouyinLink(publishingId, workId, req.user?.id);
      if (!result) return res.status(404).json({ message: '发布记录或抖音作品不存在' });
      if ('conflictPublishingId' in result) return res.status(409).json({ message: '该抖音作品已关联其他发布稿件' });
      if (result.linked && result.topicId) {
        try {
          await syncPublishedArchive(result.topicId, req.user?.id);
        } catch (error) {
          apiLogger.error({
            module: 'publishing',
            operation: 'archive.sync_after_link_failed',
            error: { code: 'ARCHIVE_SYNC_FAILED', name: error instanceof Error ? error.name : 'UnknownError' },
          }, 'api.publishing.archive_sync_failed');
        }
      }
      broadcastToRoom('publishing', 'publishing:updated', { id: publishingId });
      res.json({ message: workId === null ? '已解除抖音作品关联' : '已关联抖音作品', ...result });
    } catch {
      res.status(500).json({ message: '更新抖音作品关联失败' });
    }
  },
);

router.get('/publishing/:id', noStoreResponse, authenticate, async (req, res) => {
  try {
    const publishing = await queryOne(`SELECT ${publishingWithDouyinSelect},p.script_source_production_id,p.script_source_version,t.description AS topic_description,t.platform AS topic_platform,t.deadline AS topic_deadline,t.status AS topic_status FROM publishing p ${publishingWithDouyinJoins} WHERE p.id=?`, [req.params.id]);
    if (!publishing) return res.status(404).json({ message: '发布记录不存在' });
    const topic = await getTopicScopeByPublishingId(req.params.id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该发布记录' });

    // 获取关联的创作记录（已通过审核的）
    const production = await queryOne(`SELECT p.id, p.version, p.content, p.content_markdown, p.status, p.created_at, p.updated_at, COALESCE(p.updated_at,p.created_at) AS version_timestamp, u.name as operator_name FROM production p LEFT JOIN users u ON p.operator_id = u.id WHERE p.topic_id = ? AND p.status = 'approved' ORDER BY p.updated_at DESC LIMIT 1`, [(publishing as any).topic_id]);
    const publishingSourceFields = publishing as {
      topic_id?: number | string;
      script_source_production_id?: number | null;
      script_source_version?: string | null;
    };
    const scriptSourceProduction = publishingSourceFields.script_source_production_id && publishingSourceFields.script_source_version
        ? await getApprovedWorkflowScriptSource(Number(publishingSourceFields.topic_id), {
        productionId: Number(publishingSourceFields.script_source_production_id),
        version: String(publishingSourceFields.script_source_version),
      })
      : null;

    // 获取关联的成片制作记录
    const shooting = await queryOne(`SELECT s.*, u.name as operator_name FROM shooting s LEFT JOIN users u ON s.operator_id = u.id WHERE s.topic_id = ?`, [(publishing as any).topic_id]);

    // 获取选题流转历史
    const topicHistory = await queryAll(`SELECT th.*, u.name as operator_name FROM topic_history th LEFT JOIN users u ON th.operator_id = u.id WHERE th.topic_id = ? ORDER BY th.created_at DESC`, [(publishing as any).topic_id]);
    let publishedArchiveScriptSyncPending: boolean | null = null;
    let canSyncPublishedArchive = false;
    try {
      const [archiveDrift, hasWorkflowPermission] = await Promise.all([
        hasPublishedArchiveScriptDrift(Number((publishing as any).topic_id)),
        req.user ? userHasPermission(req.user.id, 'workflow:publishing') : Promise.resolve(false),
      ]);
      publishedArchiveScriptSyncPending = archiveDrift;
      canSyncPublishedArchive = hasWorkflowPermission && canEditProduction(req.user, topic);
    } catch (error) {
      apiLogger.error({
        module: 'publishing',
        operation: 'archive.script_sync_status_read_failed',
        error: { code: 'ARCHIVE_STATUS_UNAVAILABLE', name: error instanceof Error ? error.name : 'UnknownError' },
      }, 'api.publishing.archive_status_unavailable');
    }

    res.json({
      ...publishing,
      production: production || null,
      script_source_production: scriptSourceProduction || null,
      shooting: shooting || null,
      topicHistory: topicHistory || [],
      published_archive_script_sync_pending: publishedArchiveScriptSyncPending,
      can_sync_published_archive: canSyncPublishedArchive,
    });
  } catch {
    res.status(500).json({ message: '获取发布详情失败' });
  }
});

router.post('/publishing/:id/archive-sync', authenticate, requirePermission('workflow:publishing'), async (req, res) => {
  try {
    const publishing = await queryOne<{ topic_id: number }>('SELECT topic_id FROM publishing WHERE id=?', [req.params.id]);
    if (!publishing) return res.status(404).json({ message: '发布记录不存在' });
    const topic = await getTopicScopeByPublishingId(req.params.id);
    if (!canEditProduction(req.user, topic)) return res.status(403).json({ message: '无权限同步该选题的发布归档' });

    const archiveSync = await attemptPublishedArchiveSync(
      Number(publishing.topic_id),
      req.user?.id,
      'publishing',
      'archive.manual_retry_failed',
    );
    if (archiveSync === 'pending') {
      return res.status(503).json({ message: '归档暂未同步，请稍后重试', archiveSync });
    }
    return res.json({
      message: archiveSync === 'skipped' ? '当前没有可更新的已发布内容，历史归档保持不变' : '发布归档已同步',
      archiveSync,
    });
  } catch {
    return res.status(500).json({ message: '同步发布归档失败' });
  }
});

router.get('/publishing', authenticate, async (req, res) => {
  try {
    const { topic_id } = req.query;
    let query = `SELECT ${publishingWithDouyinSelect} FROM publishing p ${publishingWithDouyinJoins} WHERE 1=1`;
    const params: any[] = [];
    if (topic_id) { query += ` AND p.topic_id = ?`; params.push(topic_id); }
    if (!canViewAllContent(req.user)) {
      const userId = req.user!.id;
      query += ` AND (t.creator_id = ? OR t.assignee_id = ? OR p.operator_id = ?)`;
      params.push(userId, userId, userId);
    }
    const { page, limit, offset } = parseListPagination(req.query);
    const [total, summary] = await Promise.all([
      queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM (${query}) AS publishing_list`, params),
      queryOne<{ today: number; pending: number; published: number; failed: number }>(`
        SELECT
          SUM(CASE WHEN substr(publish_time,1,10)=? AND status<>'published' THEN 1 ELSE 0 END) AS today,
          SUM(CASE WHEN status IN ('pending','scheduled') THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
        FROM (${query}) AS publishing_summary
      `, [beijingToday(), ...params]),
    ]);
    query += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
    const data = await queryAll(query, [...params, limit, offset]);
    res.json({
      data,
      total: Number(total?.total || 0),
      page,
      limit,
      summary: {
        today: Number(summary?.today || 0),
        pending: Number(summary?.pending || 0),
        published: Number(summary?.published || 0),
        failed: Number(summary?.failed || 0),
      },
    });
  } catch {
    res.status(500).json({ message: '获取发布列表失败' });
  }
});

router.post('/publishing', authenticate, requirePermission('workflow:publishing'), async (req, res) => {
  try {
    const { topic_id, platform, url, status = 'pending', publish_time, views, likes, shares, comments } = req.body;
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    if (!topic_id) return res.status(400).json({ message: '选题ID不能为空' });
    if (rawClientRequestId !== undefined && rawClientRequestId !== null
      && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
      return res.status(400).json({ message: '发布请求编号无效' });
    }
    if (typeof status !== 'string' || !PUBLISHING_STATUSES.has(status)) return res.status(400).json({ message: '发布状态无效' });
    if (!publishingDateKey(publish_time)) return res.status(400).json({ message: '发布时间格式无效' });
    const rawMetrics = { views, likes, shares, comments };
    const normalizedMetrics = Object.fromEntries(
      PUBLISHING_METRIC_FIELDS.map((field) => [field, parsePublishingMetric(rawMetrics[field])]),
    ) as Record<(typeof PUBLISHING_METRIC_FIELDS)[number], number | null>;
    if (PUBLISHING_METRIC_FIELDS.some((field) => rawMetrics[field] != null && rawMetrics[field] !== '' && normalizedMetrics[field] === null)) {
      return res.status(400).json({ message: '播放、点赞、分享和评论必须是非负整数' });
    }
    const requestFingerprint = clientRequestId
      ? createHash('sha256').update(JSON.stringify([
        Number(topic_id), platform ?? null, url ?? null, String(status), publish_time ?? null,
        normalizedMetrics.views, normalizedMetrics.likes, normalizedMetrics.shares, normalizedMetrics.comments,
      ])).digest('hex')
      : '';
    const topic = await getTopicScopeById(topic_id);
    if (!topic) return res.status(404).json({ message: '选题不存在' });
    if (!canEditProduction(req.user, topic)) return res.status(403).json({ message: '无权限操作该选题的发布记录' });
    const result = await runInTransaction(async (tx) => {
      if (clientRequestId) {
        const existing = await tx.queryOne<{
          publishing_id: number;
          creator_id: number;
          request_fingerprint: string;
        }>(
          `SELECT publishing_id,creator_id,request_fingerprint FROM publishing_create_request_keys WHERE client_request_id=?`,
          [clientRequestId],
        );
        if (existing) {
          if (Number(existing.creator_id) !== Number(req.user?.id) || existing.request_fingerprint !== requestFingerprint) {
            return { conflict: true as const };
          }
          const existingPublishing = await tx.queryOne<{ id: number }>(
            'SELECT id FROM publishing WHERE id=?',
            [existing.publishing_id],
          );
          return existingPublishing
            ? { ok: true as const, publishingId: Number(existing.publishing_id), created: false }
            : { deleted: true as const };
        }
      }

      const currentTopic = await tx.queryOne<{ status: string; title: string }>(
        'SELECT status,title FROM topics WHERE id=?',
        [topic_id],
      );
      if (status === 'published' && (!currentTopic || !isTopicAtOrBeyondStage(currentTopic.status, 'publishing'))) {
        return { ok: false as const, status: currentTopic?.status };
      }
      const hasManualMetrics = PUBLISHING_METRIC_FIELDS.some((field) => normalizedMetrics[field] !== null);
      const id = await tx.executeInsert(
        `INSERT INTO publishing(topic_id,platform,url,status,publish_time,operator_id,manual_views,manual_likes,manual_shares,manual_comments,manual_metrics_updated_at,manual_metrics_updated_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [topic_id, platform, url, status, publish_time, req.user?.id,
          normalizedMetrics.views, normalizedMetrics.likes, normalizedMetrics.shares, normalizedMetrics.comments,
          hasManualMetrics ? beijingNow() : null, hasManualMetrics ? req.user?.id : null],
      );
      if (clientRequestId) {
        await tx.execute(
          `INSERT INTO publishing_create_request_keys(client_request_id,creator_id,publishing_id,request_fingerprint,created_at)
           VALUES(?,?,?,?,?)`,
          [clientRequestId, Number(req.user?.id), id, requestFingerprint, beijingNow()],
        );
      }
      await advancePublishingTopicIfResolved(tx, topic_id, req.user?.id);
      return { ok: true as const, publishingId: id, created: true };
    });
    if ('conflict' in result) {
      return res.status(409).json({ message: '发布请求编号已用于其他内容，请先核实原请求状态。', code: 'PUBLISHING_CREATE_REQUEST_CONFLICT' });
    }
    if ('deleted' in result) {
      return res.status(410).json({ message: '该请求对应的发布记录已删除，不会因为重试而重新创建。', deleted: true });
    }
    if (!result.ok) {
      return res.status(409).json({
        message: workflowStageConflictMessage(result.status, 'publishing', '登记发布完成'),
        code: 'WORKFLOW_STAGE_CONFLICT',
      });
    }
    const publishingId = result.publishingId;
    if (result.created && status === 'published') {
      try {
        await syncPublishedArchive(Number(topic_id), req.user?.id);
      } catch (error) {
        apiLogger.error({
          module: 'publishing',
          operation: 'archive.sync_after_create_failed',
          error: { code: 'ARCHIVE_SYNC_FAILED', name: error instanceof Error ? error.name : 'UnknownError' },
        }, 'api.publishing.archive_sync_failed');
      }
    }
    if (result.created) broadcastToRoom('publishing', 'publishing:created', { id: publishingId, topic_id: req.body.topic_id });
    res.json({
      message: '发布记录添加成功',
      publishingId,
      ...(clientRequestId ? { idempotent_replay: !result.created } : {}),
    });
  } catch {
    res.status(500).json({ message: '添加发布记录失败' });
  }
});

// GET /publishing/create-request/:requestId - read back a create result without writing.
router.get('/publishing/create-request/:requestId', noStoreResponse, authenticate, async (req, res) => {
  try {
    const requestId = String(req.params.requestId || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return res.status(400).json({ message: '发布请求编号无效' });
    }
    const request = await queryOne<{ publishing_id: number; topic_id: number | null }>(
      `SELECT k.publishing_id,p.topic_id
       FROM publishing_create_request_keys k
       LEFT JOIN publishing p ON p.id=k.publishing_id
       WHERE k.client_request_id=? AND k.creator_id=?`,
      [requestId, Number(req.user?.id)],
    );
    if (!request) return res.status(404).json({ message: '尚未找到对应发布记录' });
    if (request.topic_id === null) return res.status(410).json({ deleted: true, message: '对应发布记录已删除' });
    const topic = await getTopicScopeByPublishingId(request.publishing_id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该发布请求状态' });
    return res.json({ publishingId: Number(request.publishing_id) });
  } catch {
    return res.status(500).json({ message: '核实发布记录创建状态失败' });
  }
});

router.get('/publishing/:id/versions', authenticate, async (req, res) => {
  try {
    const publishing = await queryOne<{ id: number }>('SELECT id FROM publishing WHERE id=?', [req.params.id]);
    if (!publishing) return res.status(404).json({ message: '发布记录不存在' });
    const topic = await getTopicScopeByPublishingId(req.params.id);
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该发布记录' });
    return res.json({ data: await listWorkflowDocumentVersions('publishing_script', req.params.id) });
  } catch {
    return res.status(500).json({ message: '获取剧本版本历史失败' });
  }
});

router.put('/publishing/:id', authenticate, requirePermission('workflow:publishing'), async (req, res) => {
  try {
    const { id } = req.params;
    const { platform, url, status, publish_time, script_content } = req.body;
    const expectedBaseline = req.body.expected_baseline as Record<string, unknown> | null | undefined;
    const hasPublishingEditFields = PUBLISHING_EDIT_BASELINE_FIELDS.some((field) => req.body[field] !== undefined);
    const baselineFields = PUBLISHING_EDIT_BASELINE_FIELDS.filter((field) => req.body[field] !== undefined);
    const hasValidBaseline = expectedBaseline !== null && typeof expectedBaseline === 'object' && !Array.isArray(expectedBaseline)
      && baselineFields.every((field) => {
        if (!Object.prototype.hasOwnProperty.call(expectedBaseline, field)) return false;
        const value = expectedBaseline[field];
        if (PUBLISHING_METRIC_FIELDS.includes(field as (typeof PUBLISHING_METRIC_FIELDS)[number])) {
          return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
        }
        return typeof value === 'string';
      });
    const versionAction = req.body.version_action;
    const expectedContent = req.body.expected_content;
    if (versionAction !== undefined && versionAction !== 'none' && versionAction !== 'minor' && versionAction !== 'major') {
      return res.status(400).json({ message: '剧本版本操作无效' });
    }
    if ((versionAction === 'minor' || versionAction === 'major')
      && (script_content === undefined || typeof expectedContent !== 'string'
        || platform !== undefined || url !== undefined || status !== undefined || publish_time !== undefined)) {
      return res.status(400).json({ message: '创建剧本版本时仅能提交剧本内容及其来源，并须提供预期原稿' });
    }
    const scriptSourceParse = parseWorkflowScriptSourceReference(req.body || {});
    if (scriptSourceParse.kind === 'invalid' || (scriptSourceParse.kind === 'valid' && script_content === undefined)) {
      return res.status(400).json({ message: '剧本来源版本信息无效' });
    }
    const existingPublishing = await queryOne<Record<string, unknown>>(`SELECT * FROM publishing WHERE id = ?`, [id]);
    if (!existingPublishing) {
      return res.status(404).json({ message: '发布记录不存在' });
    }
    const currentTopic = await getTopicScopeByPublishingId(id);
    if (!canEditProduction(req.user, currentTopic)) return res.status(403).json({ message: '无权限修改该发布记录' });
    if (status !== undefined && (typeof status !== 'string' || !PUBLISHING_STATUSES.has(status))) {
      return res.status(400).json({ message: '发布状态无效' });
    }
    if (hasPublishingEditFields && !hasValidBaseline) {
      return res.status(409).json({
        message: '发布记录缺少可核对的原始数据，本次更新未保存。请重新加载列表并重新打开记录后再编辑。',
        code: 'PUBLISHING_UPDATE_BASELINE_REQUIRED',
      });
    }
    const linkedWork = await queryOne<{ douyin_work_id: number }>(
      `SELECT douyin_work_id FROM publishing_douyin_links WHERE publishing_id=?`,
      [id],
    );
    if (linkedWork && DOUYIN_AUTHORITATIVE_FIELDS.some((field) => req.body[field] !== undefined)) {
      return res.status(409).json({ message: '已关联抖音作品，平台、状态和发布时间由抖音作品决定' });
    }
    const suppliedMetrics = Object.fromEntries(
      PUBLISHING_METRIC_FIELDS.filter((field) => req.body[field] !== undefined)
        .map((field) => [field, parsePublishingMetric(req.body[field])]),
    ) as Partial<Record<(typeof PUBLISHING_METRIC_FIELDS)[number], number | null>>;
    if (PUBLISHING_METRIC_FIELDS.some((field) => req.body[field] !== undefined
      && req.body[field] != null && req.body[field] !== '' && suppliedMetrics[field] === null)) {
      return res.status(400).json({ message: '播放、点赞、分享和评论必须是非负整数' });
    }
    if (publish_time !== undefined && !publishingDateKey(publish_time)) {
      return res.status(400).json({ message: '发布时间格式无效' });
    }

    const updateFields: string[] = [];
    const params: unknown[] = [];

    if (platform !== undefined) { updateFields.push('platform = ?'); params.push(platform); }
    if (url !== undefined) { updateFields.push('url = ?'); params.push(url); }
    if (status !== undefined) { updateFields.push('status = ?'); params.push(status); }
    if (publish_time !== undefined) { updateFields.push('publish_time = ?'); params.push(publish_time); }
    if (script_content !== undefined) { updateFields.push('script_content = ?'); params.push(script_content); }
    if (scriptSourceParse.kind === 'valid') {
      const { reference } = scriptSourceParse;
      const existingSourceId = Number(existingPublishing.script_source_production_id) || null;
      const existingSourceVersion = typeof existingPublishing.script_source_version === 'string'
        ? existingPublishing.script_source_version
        : null;
      const sameSource = existingSourceId === reference.productionId && existingSourceVersion === reference.version;
      if (existingSourceId && !sameSource) {
        return res.status(409).json({ message: '剧本来源版本已记录，不能静默更换' });
      }
      if (!existingSourceId && existingPublishing.script_content !== null && existingPublishing.script_content !== undefined) {
        return res.status(409).json({ message: '既有本地剧本来源未记录，不能推测补写来源' });
      }
      if (!sameSource && !await isApprovedWorkflowScriptSource(Number(existingPublishing.topic_id), reference)) {
        return res.status(400).json({ message: '剧本来源必须是该选题已通过审核的创作版本' });
      }
      updateFields.push('script_source_production_id = ?', 'script_source_version = ?');
      params.push(reference.productionId, reference.version);
    }
    const metricFields = Object.keys(suppliedMetrics) as Array<(typeof PUBLISHING_METRIC_FIELDS)[number]>;
    for (const field of metricFields) {
      updateFields.push(`manual_${field} = ?`);
      params.push(suppliedMetrics[field]);
    }
    if (metricFields.length > 0) {
      updateFields.push('manual_metrics_updated_at = ?');
      params.push(beijingNow());
      updateFields.push('manual_metrics_updated_by = ?');
      params.push(req.user?.id ?? null);
    }

    if (updateFields.length === 0) return res.status(400).json({ message: '没有需要更新的字段' });

    let versionBaselineContent = existingPublishing.script_content == null ? '' : String(existingPublishing.script_content);
    if ((versionAction === 'minor' || versionAction === 'major')
      && existingPublishing.script_content == null && scriptSourceParse.kind === 'valid') {
      const approvedSource = await getApprovedWorkflowScriptSource(Number(existingPublishing.topic_id), scriptSourceParse.reference);
      if (!approvedSource) return res.status(409).json({ message: '剧本来源版本已不可用，请刷新后重新选择来源', code: 'WORKFLOW_SCRIPT_SOURCE_CONFLICT' });
      versionBaselineContent = approvedSource.content ?? '';
    }

    const result = await runInTransaction(async (tx) => {
      const currentPublishing = await tx.queryOne<{
        topic_id: number;
        platform: string | null;
        url: string | null;
        status: string;
        publish_time: string | null;
        manual_views: number | null;
        manual_likes: number | null;
        manual_shares: number | null;
        manual_comments: number | null;
        script_content: string | null;
        script_source_production_id?: number | null;
        script_source_version?: string | null;
      }>(
        'SELECT topic_id,platform,url,status,publish_time,manual_views,manual_likes,manual_shares,manual_comments,script_content,script_source_production_id,script_source_version FROM publishing WHERE id=?',
        [id],
      );
      if (!currentPublishing) return { ok: false as const, reason: 'missing' as const };
      if (hasPublishingEditFields) {
        const currentBaseline: Record<(typeof PUBLISHING_EDIT_BASELINE_FIELDS)[number], string | number | null> = {
          platform: currentPublishing.platform,
          url: currentPublishing.url,
          status: currentPublishing.status,
          publish_time: currentPublishing.publish_time,
          views: currentPublishing.manual_views,
          likes: currentPublishing.manual_likes,
          shares: currentPublishing.manual_shares,
          comments: currentPublishing.manual_comments,
        };
        const baselineChanged = baselineFields.some((field) => {
          const currentValue = currentBaseline[field];
          const expectedValue = expectedBaseline?.[field];
          if (PUBLISHING_METRIC_FIELDS.includes(field as (typeof PUBLISHING_METRIC_FIELDS)[number])) {
            return (currentValue == null ? null : Number(currentValue)) !== (expectedValue == null ? null : Number(expectedValue));
          }
          return String(currentValue ?? '') !== String(expectedValue ?? '');
        });
        if (baselineChanged) return { ok: false as const, reason: 'baseline_conflict' as const };
      }
      if (versionAction === 'minor' || versionAction === 'major') {
        const version = await recordWorkflowDocumentVersion(tx, {
          documentType: 'publishing_script',
          documentId: id,
          currentContent: currentPublishing.script_content ?? versionBaselineContent,
          nextContent: String(script_content),
          expectedContent: expectedContent as string,
          action: versionAction,
          operatorId: req.user?.id,
          sourceProductionId: scriptSourceParse.kind === 'valid' ? scriptSourceParse.reference.productionId : currentPublishing.script_source_production_id,
          sourceProductionVersion: scriptSourceParse.kind === 'valid' ? scriptSourceParse.reference.version : currentPublishing.script_source_version,
        });
        if (!version.ok) return { ok: false as const, reason: version.reason };
      }
      const topic = await tx.queryOne<{ status: string; title: string }>(
        'SELECT status,title FROM topics WHERE id=?',
        [currentPublishing.topic_id],
      );
      if (status === 'published' && (!topic || !isTopicAtOrBeyondStage(topic.status, 'publishing'))) {
        return { ok: false as const, status: topic?.status };
      }
      if (updateFields.length > 0) {
        await tx.execute(
          `UPDATE publishing SET ${updateFields.join(', ')},updated_at=datetime('now','+8 hours') WHERE id=?`,
          [...params, id],
        );
      }
      if (status !== undefined && status !== currentPublishing.status) {
        await recordPublishingStatusCorrection(
          tx,
          currentPublishing.topic_id,
          topic?.title || `选题 #${currentPublishing.topic_id}`,
          id,
          currentPublishing.status,
          String(status),
          req.user?.id,
        );
      }
      await advancePublishingTopicIfResolved(tx, currentPublishing.topic_id, req.user?.id);
      return { ok: true as const, topicId: Number(currentPublishing.topic_id) };
    });
    if (!result.ok) {
      if ('reason' in result && result.reason === 'missing') return res.status(404).json({ message: '发布记录不存在' });
      if ('reason' in result && result.reason === 'baseline_conflict') {
        return res.status(409).json({
          message: '发布记录已被其他协作者修改，本次更新未保存。你的编辑草稿仍保留，请核对最新记录后再手动提交。',
          code: 'PUBLISHING_UPDATE_BASELINE_CONFLICT',
        });
      }
      if ('reason' in result && result.reason === 'stale') {
        return res.status(409).json({
          message: '剧本已被其他协作者修改，请刷新后核对再创建版本',
          code: 'VERSION_CONFLICT',
        });
      }
      return res.status(409).json({
        message: workflowStageConflictMessage(result.status, 'publishing', '登记发布完成'),
        code: 'WORKFLOW_STAGE_CONFLICT',
      });
    }
    const updatedTopicId = result.topicId;
    const shouldSyncArchive = status === 'published' || existingPublishing.status === 'published' || Boolean(linkedWork);
    let archiveSync: ArchiveSyncFeedback = 'not_required';
    if (shouldSyncArchive) {
      archiveSync = await attemptPublishedArchiveSync(
        updatedTopicId,
        req.user?.id,
        'publishing',
        'archive.sync_after_update_failed',
      );
    }

    broadcastToRoom('publishing', 'publishing:updated', { id: Number(req.params.id) });
    res.json({ message: '发布记录更新成功', archiveSync });
  } catch {
    res.status(500).json({ message: '更新发布记录失败' });
  }
});

router.delete('/publishing/:id', authenticate, requirePermission('workflow:publishing'), async (req, res) => {
  try {
    const publishing = await queryOne(`SELECT topic_id FROM publishing WHERE id = ?`, [req.params.id]);
    if (!publishing) return res.status(404).json({ message: '发布记录不存在' });
    const topic = await getTopicScopeByPublishingId(req.params.id);
    if (!canEditProduction(req.user, topic)) return res.status(403).json({ message: '无权限删除该发布记录' });
    if (publishing) {
      await runInTransaction(async (tx) => {
        await deleteWorkflowDocumentVersionsForDocument(tx, 'publishing_script', req.params.id);
        await tx.execute(`DELETE FROM publishing WHERE id = ?`, [req.params.id]);
      });
    }
    res.json({ message: '发布记录删除成功' });
  } catch {
    res.status(500).json({ message: '删除发布记录失败' });
  }
});

router.get('/comments', authenticate, async (req, res) => {
  try {
    const { target_type, target_id } = req.query;
    if (!target_type || !target_id) return res.status(400).json({ message: '缺少必要参数' });
    const topic = await resolveCommentTopicScope(target_type, target_id);
    if (!topic) return res.status(404).json({ message: '评论目标不存在或暂不支持' });
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该评论' });
    const comments = await queryAll(`SELECT c.*, u.name as operator_name FROM comments c LEFT JOIN users u ON c.operator_id = u.id WHERE c.target_type = ? AND c.target_id = ? ORDER BY c.created_at DESC`, [target_type, target_id]);
    res.json(comments);
  } catch {
    res.status(500).json({ message: '获取评论失败' });
  }
});

router.post('/comments', authenticate, requirePermission('workflow:comment'), async (req, res) => {
  try {
    const { target_type, target_id, content } = req.body;
    if (!target_type || !target_id || !content) return res.status(400).json({ message: '缺少必要参数' });
    const topic = await resolveCommentTopicScope(target_type, target_id);
    if (!topic) return res.status(404).json({ message: '评论目标不存在或暂不支持' });
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限评论该对象' });
    const commentId = await executeInsert(`INSERT INTO comments (target_type, target_id, content, operator_id) VALUES (?, ?, ?, ?)`, [target_type, target_id, content, req.user?.id]);
    res.json({ message: '评论添加成功', commentId });
  } catch {
    res.status(500).json({ message: '添加评论失败' });
  }
});

router.delete('/comments/:id', authenticate, requirePermission('comment:delete'), async (req, res) => {
  try {
    await execute(`DELETE FROM comments WHERE id = ?`, [req.params.id]);
    res.json({ message: '评论删除成功' });
  } catch {
    res.status(500).json({ message: '删除评论失败' });
  }
});

export default router;
