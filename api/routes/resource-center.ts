import express from 'express';
import { createHash } from 'node:crypto';
import { authenticate } from '../middleware/auth';
import { requireAllPermissions, requirePermission } from '../middleware/permissions';
import { sendSafeServerError } from '../utils/response';
import { canEditTopic, canViewAllContent } from '../utils/access';
import { execute, executeInsert, queryAll, queryOne, runInTransaction, type TransactionContext } from '../database/utils';
import { getPublishingMetricFacts } from '../services/publishingMetrics';
import { sanitizeRichText } from '../utils/sanitize-rich-text';
import {
  RESOURCE_LIBRARY_TYPES,
  RESOURCE_TARGET_TABLES,
  RESOURCE_VISIBILITIES,
  canModifyResource,
  createResourceRecord,
  createResourceRecordWithRequest,
  getResourceTags,
  getResourceCreateRequestStatus,
  getResourceUpdateRequestStatus,
  getScopedResource,
  nonNegativeInteger,
  normalizeTagName,
  positiveInteger,
  recordResourceAuditInTransaction,
  resourceScopeArgs,
  resourceScopePredicate,
  ResourceCreateRequestConflictError,
  ResourceUpdateCategoryValidationError,
  ResourceUpdateRequestConflictError,
  updateResourceRecordWithRequest,
  userHasPermission,
  validateCategory,
  validateTarget,
} from '../services/resourceCenter';
import { resourceCategoryMutationCanonicalRequest, type ResourceCategoryMutationOperation } from '../../shared/resource-category-mutation';

const router = express.Router();
const RESOURCE_CREATE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESOURCE_UPDATE_REQUEST_ID_PATTERN = RESOURCE_CREATE_REQUEST_ID_PATTERN;
const RESOURCE_CATEGORY_MUTATION_REQUEST_ID_PATTERN = RESOURCE_CREATE_REQUEST_ID_PATTERN;
router.use('/resources/create-requests/:requestId', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.use('/resources/:id/update-requests/:requestId', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.use('/categories/mutation-requests/:requestId', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.use(authenticate);

type ResourceCategoryMutationReceipt = {
  client_request_id: string;
  actor_id: number;
  operation: ResourceCategoryMutationOperation;
  library_type: string | null;
  target_category_id: number | null;
  result_category_id: number;
  request_fingerprint: string;
};

class ResourceCategoryMutationRequestConflictError extends Error {
  constructor() {
    super('RESOURCE_CATEGORY_MUTATION_REQUEST_CONFLICT');
    this.name = 'ResourceCategoryMutationRequestConflictError';
  }
}

function resourceCategoryMutationFingerprint(
  operation: ResourceCategoryMutationOperation,
  libraryType: string,
  categoryId: number | null,
  payload: Record<string, unknown>,
) {
  return createHash('sha256')
    .update(resourceCategoryMutationCanonicalRequest(operation, libraryType, categoryId, payload))
    .digest('hex');
}

async function getCategoryMutationReplay(
  tx: TransactionContext,
  input: { actorId: number; requestId: string; operation: ResourceCategoryMutationOperation; libraryType: string; categoryId: number | null; fingerprint: string },
) {
  const receipt = await tx.queryOne<ResourceCategoryMutationReceipt>(
    'SELECT * FROM resource_category_mutation_request_keys WHERE client_request_id=?',
    [input.requestId],
  );
  if (!receipt) return null;
  if (Number(receipt.actor_id) !== input.actorId
    || receipt.operation !== input.operation
    || receipt.library_type !== input.libraryType
    || (receipt.target_category_id == null ? null : Number(receipt.target_category_id)) !== input.categoryId
    || receipt.request_fingerprint !== input.fingerprint) {
    throw new ResourceCategoryMutationRequestConflictError();
  }
  return Number(receipt.result_category_id);
}

async function recordCategoryMutation(
  tx: TransactionContext,
  input: { actorId: number; requestId: string; operation: ResourceCategoryMutationOperation; libraryType: string; categoryId: number | null; resultCategoryId: number; fingerprint: string },
) {
  await tx.execute(
    `INSERT INTO resource_category_mutation_request_keys
      (client_request_id,actor_id,operation,library_type,target_category_id,result_category_id,request_fingerprint,created_at)
     VALUES(?,?,?,?,?,?,?,datetime('now','+8 hours'))`,
    [input.requestId, input.actorId, input.operation, input.libraryType, input.categoryId, input.resultCategoryId, input.fingerprint],
  );
}

function isOneOf(value: unknown, allowed: readonly string[]) {
  return typeof value === 'string' && allowed.includes(value);
}

function cleanOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  return String(value).trim() || null;
}

function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, positiveInteger(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, positiveInteger(query.page_size) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function extractManuscriptResourceIds(content: unknown) {
  if (typeof content !== 'string' || !content.trim()) return [];

  // Only recognize the same explicit source links created by the production editor.
  // Sanitizing first prevents markup in scripts/comments from being mistaken for a citation.
  const safeHtml = sanitizeRichText(content);
  const ids = new Set<number>();
  for (const match of safeHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = /\bhref="([^"]*)"/i.exec(match[1] || '')?.[1] || '';
    const resourceMatch = /^\/asset-center\/resources\/([1-9]\d*)\/?$/.exec(href);
    if (!resourceMatch) continue;

    const linkText = (match[2] || '').replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xA0;/gi, ' ').trim();
    if (!linkText.startsWith('来源：')) continue;

    const id = Number(resourceMatch[1]);
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

async function requireScopedResource(req: express.Request, res: express.Response) {
  const id = positiveInteger(req.params.id);
  if (!id) {
    res.status(400).json({ message: '资料 ID 无效' });
    return null;
  }
  const resource = await getScopedResource(id, req.user);
  if (!resource) {
    res.status(404).json({ message: '资料不存在或无权访问' });
    return null;
  }
  return resource;
}

router.get('/resources', requirePermission('resource:view'), async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const canManage = await userHasPermission(req.user, 'resource:manage');
    const where = [resourceScopePredicate('r')];
    const args: unknown[] = resourceScopeArgs(req.user!.id, canManage);

    const filters: Array<[unknown, string, (value: unknown) => unknown]> = [
      [req.query.library_type, 'r.library_type = ?', String],
      [req.query.category_id, 'r.category_id = ?', Number],
      [req.query.parent_id, 'r.parent_id = ?', Number],
      [req.query.status, 'r.status = ?', String],
      [req.query.visibility, 'r.visibility = ?', String],
      [req.query.owner_id, 'r.owner_id = ?', Number],
    ];
    for (const [value, clause, convert] of filters) {
      if (value !== undefined && value !== '') {
        where.push(clause);
        args.push(convert(value));
      }
    }
    if (req.query.tag) {
      where.push(`EXISTS (
        SELECT 1 FROM resource_tag_relations frt
        JOIN resource_tags ft ON ft.id = frt.tag_id
        WHERE frt.resource_id = r.id AND (ft.normalized_name = ? OR CAST(ft.id AS TEXT) = ?)
      )`);
      args.push(normalizeTagName(req.query.tag), String(req.query.tag));
    }
    if (req.query.keyword) {
      where.push(`r.id IN (SELECT rowid FROM resource_fts WHERE resource_fts MATCH ?)`);
      args.push(`"${String(req.query.keyword).replace(/"/g, '""')}"`);
    }

    const whereSql = where.join(' AND ');
    const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM resources r WHERE ${whereSql}`, args);
    const rows = await queryAll<Record<string, unknown>>(`
      SELECT r.id, r.title, r.summary, r.library_type, r.visibility, r.status, r.created_at, r.updated_at,
             CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id', c.id, 'name', c.name, 'path', c.path) END AS category_json,
             COALESCE((SELECT json_group_array(json_object('id', t.id, 'name', t.name))
                       FROM resource_tag_relations rt JOIN resource_tags t ON t.id = rt.tag_id
                       WHERE rt.resource_id = r.id), '[]') AS tags_json,
             (SELECT COUNT(*) FROM resource_files rf WHERE rf.resource_id = r.id) AS file_count,
             CASE WHEN owner.id IS NULL THEN NULL ELSE json_object('id', owner.id, 'name', owner.name, 'username', owner.username) END AS owner_json
      FROM resources r
      LEFT JOIN resource_categories c ON c.id = r.category_id
      LEFT JOIN users owner ON owner.id = COALESCE(r.owner_id, r.uploader_id)
      WHERE ${whereSql}
      ORDER BY r.updated_at DESC, r.id DESC
      LIMIT ? OFFSET ?
    `, [...args, pageSize, offset]);

    res.json({
      data: rows.map((row) => ({
        ...row,
        category: row.category_json ? JSON.parse(String(row.category_json)) : null,
        tags: JSON.parse(String(row.tags_json || '[]')),
        owner: row.owner_json ? JSON.parse(String(row.owner_json)) : null,
        category_json: undefined,
        tags_json: undefined,
        owner_json: undefined,
      })),
      pagination: { page, page_size: pageSize, total: Number(totalRow?.total || 0), total_pages: Math.ceil(Number(totalRow?.total || 0) / pageSize) },
    });
  } catch (error) {
    sendSafeServerError(res, '查询资料失败', 'resource-center:list', error);
  }
});

router.get('/search', requirePermission('resource:view'), async (req, res) => {
  try {
    const keyword = cleanOptionalText(req.query.keyword);
    if (!keyword) return res.status(400).json({ message: 'keyword 不能为空' });
    const libraryType = cleanOptionalText(req.query.library_type);
    if (libraryType && !isOneOf(libraryType, RESOURCE_LIBRARY_TYPES)) return res.status(400).json({ message: 'library_type 无效' });
    const categoryId = req.query.category_id === undefined || req.query.category_id === '' ? null : positiveInteger(req.query.category_id);
    if (req.query.category_id !== undefined && req.query.category_id !== '' && !categoryId) return res.status(400).json({ message: 'category_id 无效' });
    const tag = cleanOptionalText(req.query.tag);
    const sort = cleanOptionalText(req.query.sort) || 'relevance';
    const sortOrders = {
      relevance: 'bm25(resource_fts), r.updated_at DESC, r.id DESC',
      updated_desc: 'r.updated_at DESC, r.id DESC',
      title_asc: 'r.title COLLATE NOCASE ASC, r.id ASC',
    } as const;
    if (!Object.prototype.hasOwnProperty.call(sortOrders, sort)) return res.status(400).json({ message: 'sort 无效' });
    const canManage = await userHasPermission(req.user, 'resource:manage');
    const where = [resourceScopePredicate('r'), `resource_fts MATCH ?`];
    const args: unknown[] = [...resourceScopeArgs(req.user!.id, canManage), `"${keyword.replace(/"/g, '""')}"`];
    if (libraryType) { where.push('r.library_type = ?'); args.push(libraryType); }
    if (categoryId) { where.push('r.category_id = ?'); args.push(categoryId); }
    if (tag) {
      where.push(`EXISTS (
        SELECT 1 FROM resource_tag_relations rt
        JOIN resource_tags t ON t.id = rt.tag_id
        WHERE rt.resource_id = r.id AND t.normalized_name = ?
      )`);
      args.push(normalizeTagName(tag));
    }
    const rows = await queryAll(`
      SELECT r.id AS resource_id, r.title, r.summary, r.library_type,
             CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id', c.id, 'name', c.name, 'path', c.path) END AS category_json,
             snippet(resource_fts, 2, '<mark>', '</mark>', '…', 24) AS snippet
      FROM resource_fts JOIN resources r ON r.id = resource_fts.rowid
      LEFT JOIN resource_categories c ON c.id = r.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sortOrders[sort as keyof typeof sortOrders]}
      LIMIT 100
    `, args);
    res.json({
      data: rows.map((row) => ({
        ...row,
        category: row.category_json ? JSON.parse(String(row.category_json)) : null,
        category_json: undefined,
      })),
      total: rows.length,
    });
  } catch (error) {
    sendSafeServerError(res, '全文搜索失败', 'resource-center:search', error);
  }
});

router.get('/content-topics', requireAllPermissions('resource:view', 'topic:view'), async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const keyword = cleanOptionalText(req.query.keyword);
    if (keyword && keyword.length > 100) return res.status(400).json({ message: '搜索内容不能超过 100 个字符' });
    const dimensionType = cleanOptionalText(req.query.dimension_type);
    const dimensionValue = cleanOptionalText(req.query.dimension_value);
    if (dimensionType && !isOneOf(dimensionType, ['city', 'person', 'project'])) return res.status(400).json({ message: '维度类型无效' });
    if (dimensionValue && (!dimensionType || Array.from(dimensionValue).length > 80)) return res.status(400).json({ message: '维度名称或筛选类型无效' });

    const topicWhere = [canViewAllContent(req.user) ? '1 = 1' : '(t.creator_id = ? OR t.assignee_id = ?)'];
    const topicArgs: unknown[] = canViewAllContent(req.user) ? [] : [req.user!.id, req.user!.id];
    if (keyword) {
      topicWhere.push('instr(lower(t.title), lower(?)) > 0');
      topicArgs.push(keyword);
    }
    if (req.query.status) {
      topicWhere.push('t.status = ?');
      topicArgs.push(String(req.query.status));
    }
    if (dimensionType) {
      topicWhere.push(`EXISTS (SELECT 1 FROM topic_asset_dimensions d WHERE d.topic_id = t.id AND d.dimension_type = ?${dimensionValue ? ' AND d.normalized_value = ?' : ''})`);
      topicArgs.push(dimensionType);
      if (dimensionValue) topicArgs.push(normalizeTagName(dimensionValue));
    }
    const whereSql = topicWhere.join(' AND ');
    const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM topics t WHERE ${whereSql}`, topicArgs);
    const canViewAllTopics = canViewAllContent(req.user);
    const visibleTopicSql = canViewAllTopics ? '1 = 1' : '(t.creator_id = ? OR t.assignee_id = ?)';
    const visibleTopicArgs: unknown[] = canViewAllTopics ? [] : [req.user!.id, req.user!.id];
    const dimensionCoverageRow = await queryOne<Record<string, unknown>>(`
      SELECT COUNT(DISTINCT t.id) AS visible_topics_total,
             COUNT(DISTINCT CASE WHEN d.dimension_type = 'city' THEN t.id END) AS city_topic_count,
             COUNT(DISTINCT CASE WHEN d.dimension_type = 'person' THEN t.id END) AS person_topic_count,
             COUNT(DISTINCT CASE WHEN d.dimension_type = 'project' THEN t.id END) AS project_topic_count
      FROM topics t
      LEFT JOIN topic_asset_dimensions d ON d.topic_id = t.id
      WHERE ${visibleTopicSql}
    `, visibleTopicArgs);
    const [canViewAnalytics, canManageResources, canUpdateTopics] = await Promise.all([
      userHasPermission(req.user, 'analytics:view'),
      userHasPermission(req.user, 'resource:manage'),
      userHasPermission(req.user, 'topic:update'),
    ]);
    const dimensionSummaries = await queryAll<Record<string, unknown>>(`
      WITH visible_topics AS (
        SELECT t.id FROM topics t WHERE ${visibleTopicSql}
      ),
      accessible_resources AS (
        SELECT r.id FROM resources r
        WHERE r.status <> 'deleted' AND r.deleted_at IS NULL
          AND ${resourceScopePredicate('r')}
      ),
      topic_resource_links AS (
        SELECT rr.resource_id, rr.target_id AS topic_id
        FROM resource_relations rr
        WHERE rr.target_type = 'topic' AND rr.relation_type = 'reference'
        UNION
        SELECT rr.resource_id, p.topic_id
        FROM resource_relations rr JOIN production p ON rr.target_type = 'production' AND rr.target_id = p.id
        WHERE rr.relation_type = 'reference'
        UNION
        SELECT rr.resource_id, s.topic_id
        FROM resource_relations rr JOIN shooting s ON rr.target_type = 'shooting' AND rr.target_id = s.id
        WHERE rr.relation_type = 'reference'
        UNION
        SELECT rr.resource_id, p.topic_id
        FROM resource_relations rr JOIN publishing p ON rr.target_type = 'publishing' AND rr.target_id = p.id
        WHERE rr.relation_type = 'reference'
      ),
      visible_topic_resources AS (
        SELECT DISTINCT links.topic_id, links.resource_id
        FROM topic_resource_links links JOIN accessible_resources ar ON ar.id = links.resource_id
      ),
      topic_asset_counts AS (
        SELECT t.id,
          (SELECT COUNT(*) FROM production p WHERE p.topic_id = t.id) AS production_count,
          (SELECT COUNT(*) FROM shooting s WHERE s.topic_id = t.id) AS shooting_count,
          (SELECT COUNT(*) FROM publishing p WHERE p.topic_id = t.id) AS publishing_count
        FROM visible_topics t
      ),
      dimension_asset_counts AS (
        SELECT d.dimension_type, d.normalized_value, MIN(d.value) AS value, COUNT(DISTINCT tac.id) AS topic_count,
               SUM(tac.production_count) AS production_count, SUM(tac.shooting_count) AS shooting_count,
               SUM(tac.publishing_count) AS publishing_count
        FROM topic_asset_dimensions d JOIN topic_asset_counts tac ON tac.id = d.topic_id
        GROUP BY d.dimension_type, d.normalized_value
      ),
      dimension_resource_counts AS (
        SELECT d.dimension_type, d.normalized_value, COUNT(DISTINCT vtr.resource_id) AS resource_count
        FROM topic_asset_dimensions d
        JOIN visible_topics vt ON vt.id = d.topic_id
        LEFT JOIN visible_topic_resources vtr ON vtr.topic_id = d.topic_id
        GROUP BY d.dimension_type, d.normalized_value
      )
      SELECT dac.dimension_type, dac.value, dac.topic_count, dac.production_count,
             COALESCE(drc.resource_count, 0) AS resource_count, dac.shooting_count, dac.publishing_count
      FROM dimension_asset_counts dac
      LEFT JOIN dimension_resource_counts drc ON drc.dimension_type = dac.dimension_type AND drc.normalized_value = dac.normalized_value
      ORDER BY dac.dimension_type, dac.topic_count DESC, dac.normalized_value
    `, [...visibleTopicArgs, ...resourceScopeArgs(req.user!.id, canManageResources)]);
    const rows = await queryAll<Record<string, unknown>>(`
      WITH accessible_resources AS (
        SELECT r.id, COALESCE(NULLIF(r.title, ''), r.name) AS title, r.library_type, r.updated_at
        FROM resources r
        WHERE r.status <> 'deleted' AND r.deleted_at IS NULL
          AND ${resourceScopePredicate('r')}
      ),
      topic_resource_links AS (
        SELECT rr.resource_id, rr.target_id AS topic_id
        FROM resource_relations rr
        WHERE rr.target_type = 'topic' AND rr.relation_type = 'reference'
        UNION
        SELECT rr.resource_id, p.topic_id
        FROM resource_relations rr JOIN production p ON rr.target_type = 'production' AND rr.target_id = p.id
        WHERE rr.relation_type = 'reference'
        UNION
        SELECT rr.resource_id, s.topic_id
        FROM resource_relations rr JOIN shooting s ON rr.target_type = 'shooting' AND rr.target_id = s.id
        WHERE rr.relation_type = 'reference'
        UNION
        SELECT rr.resource_id, p.topic_id
        FROM resource_relations rr JOIN publishing p ON rr.target_type = 'publishing' AND rr.target_id = p.id
        WHERE rr.relation_type = 'reference'
      ),
      visible_topic_resources AS (
        SELECT DISTINCT links.topic_id, links.resource_id
        FROM topic_resource_links links
        JOIN accessible_resources ar ON ar.id = links.resource_id
      ),
      resource_counts AS (
        SELECT vtr.topic_id, COUNT(*) AS resource_count,
               json_group_array(json_object(
                 'id', ar.id,
                 'title', ar.title,
                 'library_type', ar.library_type,
                 'updated_at', ar.updated_at
               )) AS linked_resources_json
        FROM visible_topic_resources vtr
        JOIN accessible_resources ar ON ar.id = vtr.resource_id
        GROUP BY vtr.topic_id
      )
      SELECT t.id, t.title, t.status, t.platform, t.created_at, t.updated_at,
             t.creator_id, t.assignee_id,
             (SELECT COUNT(*) FROM production p WHERE p.topic_id = t.id) AS production_count,
             (SELECT p.id FROM production p WHERE p.topic_id = t.id ORDER BY p.updated_at DESC, p.id DESC LIMIT 1) AS latest_production_id,
             (SELECT p.version FROM production p WHERE p.topic_id = t.id ORDER BY p.updated_at DESC, p.id DESC LIMIT 1) AS latest_production_version,
             (SELECT p.updated_at FROM production p WHERE p.topic_id = t.id ORDER BY p.updated_at DESC, p.id DESC LIMIT 1) AS latest_production_updated_at,
             (SELECT COUNT(*) FROM shooting s WHERE s.topic_id = t.id) AS shooting_count,
             (SELECT COUNT(*) FROM publishing p WHERE p.topic_id = t.id) AS publishing_count,
             COALESCE(rc.resource_count, 0) AS resource_count,
             COALESCE(rc.linked_resources_json, '[]') AS linked_resources_json,
             COALESCE((SELECT json_group_array(json_object('id', d.id, 'type', d.dimension_type, 'value', d.value))
                       FROM topic_asset_dimensions d WHERE d.topic_id = t.id), '[]') AS dimensions_json
      FROM topics t
      LEFT JOIN resource_counts rc ON rc.topic_id = t.id
      WHERE ${whereSql}
      ORDER BY t.updated_at DESC, t.id DESC
      LIMIT ? OFFSET ?
    `, [...resourceScopeArgs(req.user!.id, canManageResources), ...topicArgs, pageSize, offset]);

    const currentProductionIds = [...new Set(rows
      .map((row) => Number(row.latest_production_id))
      .filter((id) => Number.isSafeInteger(id) && id > 0))];
    const productionContentById = new Map<number, unknown>();
    if (currentProductionIds.length) {
      const productionContentRows = await queryAll<{ id: number; content: unknown }>(`
        SELECT id, content FROM production WHERE id IN (${currentProductionIds.map(() => '?').join(',')})
      `, currentProductionIds);
      for (const production of productionContentRows) productionContentById.set(Number(production.id), production.content);
    }

    const referencedIdsByProduction = new Map<number, number[]>();
    const referencedResourceIds = new Set<number>();
    for (const productionId of currentProductionIds) {
      const ids = extractManuscriptResourceIds(productionContentById.get(productionId));
      referencedIdsByProduction.set(productionId, ids);
      ids.forEach((id) => referencedResourceIds.add(id));
    }

    const accessibleReferencedResources = new Map<number, {
      id: number;
      title: string;
      library_type: string;
      updated_at: string;
    }>();
    const uniqueReferencedIds = [...referencedResourceIds];
    for (let index = 0; index < uniqueReferencedIds.length; index += 500) {
      const resourceIdChunk = uniqueReferencedIds.slice(index, index + 500);
      const resources = await queryAll<{
        id: number;
        title: string;
        library_type: string;
        updated_at: string;
      }>(`
        SELECT r.id, COALESCE(NULLIF(r.title, ''), r.name) AS title, r.library_type, r.updated_at
        FROM resources r
        WHERE r.id IN (${resourceIdChunk.map(() => '?').join(',')})
          AND r.status <> 'deleted' AND r.deleted_at IS NULL
          AND ${resourceScopePredicate('r')}
      `, [...resourceIdChunk, ...resourceScopeArgs(req.user!.id, canManageResources)]);
      for (const resource of resources) accessibleReferencedResources.set(Number(resource.id), resource);
    }

    const metricFacts = canViewAnalytics
      ? await getPublishingMetricFacts({ topicIds: rows.map((row) => Number(row.id)), publishedOnly: true })
      : [];
    const latestMetricsByTopic = new Map<number, (typeof metricFacts)[number]>();
    for (const fact of metricFacts) {
      if (!latestMetricsByTopic.has(fact.topic_id)) latestMetricsByTopic.set(fact.topic_id, fact);
    }

    return res.json({
      data: rows.map((row) => {
        const linkedResources = JSON.parse(String(row.linked_resources_json || '[]')) as Array<{ id: number }>;
        const linkedResourceIds = new Set<number>(linkedResources.map((resource) => Number(resource.id)));
        return {
          id: row.id,
          title: row.title,
          status: row.status,
          platform: row.platform,
          created_at: row.created_at,
          updated_at: row.updated_at,
          production_count: row.production_count,
          latest_production_id: row.latest_production_id,
          latest_production_version: row.latest_production_version,
          latest_production_updated_at: row.latest_production_updated_at,
          shooting_count: row.shooting_count,
          publishing_count: row.publishing_count,
          resource_count: row.resource_count,
          linked_resources: linkedResources,
          referenced_resources: (referencedIdsByProduction.get(Number(row.latest_production_id)) || [])
            .filter((id) => !linkedResourceIds.has(id))
            .map((id) => accessibleReferencedResources.get(id))
            .filter((resource): resource is NonNullable<typeof resource> => Boolean(resource)),
          dimensions: JSON.parse(String(row.dimensions_json || '[]')),
          can_manage_dimensions: canUpdateTopics && canEditTopic(req.user, { creator_id: row.creator_id as number | null, assignee_id: row.assignee_id as number | null }),
          latest_analytics: (() => {
            const fact = latestMetricsByTopic.get(Number(row.id));
            return fact ? {
              publishing_id: fact.id,
              platform: fact.metric_platform,
              data_date: fact.metric_publish_time,
              views: fact.views,
              likes: fact.likes,
              shares: fact.shares,
              comments: fact.comments,
              sources: {
                views: fact.views_source,
                likes: fact.likes_source,
                shares: fact.shares_source,
                comments: fact.comments_source,
              },
            } : null;
          })(),
        };
      }),
      pagination: { page, page_size: pageSize, total: Number(totalRow?.total || 0), total_pages: Math.ceil(Number(totalRow?.total || 0) / pageSize) },
      analytics_visible: canViewAnalytics,
      available_dimensions: dimensionSummaries.map(({ dimension_type, value }) => ({ dimension_type, value })),
      dimension_summaries: dimensionSummaries,
      dimension_coverage: {
        visible_topics_total: Number(dimensionCoverageRow?.visible_topics_total || 0),
        registered_topic_counts: {
          city: Number(dimensionCoverageRow?.city_topic_count || 0),
          person: Number(dimensionCoverageRow?.person_topic_count || 0),
          project: Number(dimensionCoverageRow?.project_topic_count || 0),
        },
      },
    });
  } catch (error) {
    sendSafeServerError(res, '获取主题内容资产失败', 'resource-center:content-topics', error);
  }
});

router.post('/resources', requirePermission('resource:create'), async (req, res) => {
  try {
    const title = cleanOptionalText(req.body.title);
    const libraryType = req.body.library_type;
    const visibility = req.body.visibility || 'team';
    const rawRequestId = req.body?.client_request_id;
    const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim().toLowerCase() : '';
    const categoryId = req.body.category_id == null ? null : positiveInteger(req.body.category_id);
    if (rawRequestId !== undefined && rawRequestId !== null && !RESOURCE_CREATE_REQUEST_ID_PATTERN.test(requestId)) {
      return res.status(400).json({ message: '资料创建请求编号无效' });
    }
    if (!title || !isOneOf(libraryType, RESOURCE_LIBRARY_TYPES) || !isOneOf(visibility, RESOURCE_VISIBILITIES)) {
      return res.status(400).json({ message: 'title、library_type 或 visibility 无效' });
    }
    if (req.body.category_id != null && !categoryId) return res.status(400).json({ message: 'category_id 无效' });
    if (!await validateCategory(categoryId, libraryType)) return res.status(400).json({ message: '分类不存在或不属于当前资料库' });

    const fields = {
      title,
      summary: cleanOptionalText(req.body.summary),
      library_type: libraryType,
      category_id: categoryId,
      visibility,
      content_text: cleanOptionalText(req.body.content_text),
      source_type: cleanOptionalText(req.body.source_type) || 'manual',
      source_uri: cleanOptionalText(req.body.source_uri),
    };
    if (requestId) {
      const creation = await createResourceRecordWithRequest(fields, req.user!.id, requestId);
      return res.status(creation.replayed ? 200 : 201).json({ message: '资料创建成功', id: creation.resourceId });
    }
    const resourceId = await createResourceRecord(fields, req.user!.id);
    return res.status(201).json({ message: '资料创建成功', id: resourceId });
  } catch (error) {
    if (error instanceof ResourceCreateRequestConflictError) {
      return res.status(409).json({
        message: '资料创建请求编号已用于其他账号或内容，请先核实原请求状态。',
        code: 'RESOURCE_CREATE_REQUEST_CONFLICT',
      });
    }
    sendSafeServerError(res, '创建资料失败', 'resource-center:create', error);
  }
});

router.get('/resources/create-requests/:requestId', async (req, res) => {
  try {
    const requestId = typeof req.params.requestId === 'string' ? req.params.requestId.trim().toLowerCase() : '';
    if (!RESOURCE_CREATE_REQUEST_ID_PATTERN.test(requestId)) {
      return res.status(400).json({ message: '资料创建请求编号无效' });
    }
    return res.json(await getResourceCreateRequestStatus(Number(req.user!.id), requestId));
  } catch {
    return res.status(500).json({ message: '核实资料创建状态失败' });
  }
});

router.get('/resources/:id/update-requests/:requestId', async (req, res) => {
  try {
    const resourceId = positiveInteger(req.params.id);
    const requestId = typeof req.params.requestId === 'string' ? req.params.requestId.trim().toLowerCase() : '';
    if (!resourceId) return res.status(400).json({ message: '资料 ID 无效' });
    if (!RESOURCE_UPDATE_REQUEST_ID_PATTERN.test(requestId)) {
      return res.status(400).json({ message: '资料更新请求编号无效' });
    }
    return res.json(await getResourceUpdateRequestStatus(Number(req.user!.id), resourceId, requestId));
  } catch {
    return res.status(500).json({ message: '核实资料更新状态失败' });
  }
});

router.get('/resources/:id', requirePermission('resource:view'), async (req, res) => {
  try {
    const resource = await requireScopedResource(req, res);
    if (!resource) return;
    const id = Number(resource.id);
    const [category, tags, files, relations, audit] = await Promise.all([
      resource.category_id ? queryOne(`SELECT id, library_type, parent_id, name, code, path FROM resource_categories WHERE id = ?`, [resource.category_id]) : null,
      getResourceTags(id),
      queryAll(`SELECT id, original_name, storage_key, mime_type, extension, size_bytes, sha256, is_primary, status, created_by, created_at FROM resource_files WHERE resource_id = ? ORDER BY is_primary DESC, id`, [id]),
      queryAll(`SELECT id, target_type, target_id, relation_type, created_by, created_at FROM resource_relations WHERE resource_id = ? ORDER BY id`, [id]),
      queryOne(`SELECT COUNT(*) AS total, MAX(created_at) AS last_at,
                       (SELECT action FROM resource_audit_logs WHERE resource_id = ? ORDER BY created_at DESC, id DESC LIMIT 1) AS last_action
                FROM resource_audit_logs WHERE resource_id = ?`, [id, id]),
    ]);
    res.json({ ...resource, category, tags, files, relations, versions: [], audit_summary: audit });
  } catch (error) {
    sendSafeServerError(res, '获取资料详情失败', 'resource-center:detail', error);
  }
});

router.get('/resources/:id/audit', requirePermission('resource:audit'), async (req, res) => {
  const resource = await requireScopedResource(req, res);
  if (!resource) return;
  const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
  const total = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM resource_audit_logs WHERE resource_id=?', [resource.id]);
  const rows = await queryAll(`
    SELECT a.id,a.action,a.detail_json,a.created_at,
           CASE WHEN u.id IS NULL THEN NULL ELSE json_object('id',u.id,'name',u.name,'username',u.username) END AS user
    FROM resource_audit_logs a LEFT JOIN users u ON u.id=a.user_id
    WHERE a.resource_id=? ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?
  `,[resource.id,pageSize,offset]);
  res.json({ data: rows, pagination: { page, page_size: pageSize, total: Number(total?.total || 0) } });
});

router.put('/resources/:id', requirePermission('resource:update'), async (req, res) => {
  try {
    const resource = await requireScopedResource(req, res);
    if (!resource) return;
    if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });

    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const rawClientRequestId = body.client_request_id;
    const requestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';
    if (rawClientRequestId !== undefined && rawClientRequestId !== null && !RESOURCE_UPDATE_REQUEST_ID_PATTERN.test(requestId)) {
      return res.status(400).json({ message: '资料更新请求编号无效' });
    }

    const updates: Record<string, unknown> = {};
    const allowed = ['title', 'summary', 'category_id', 'visibility', 'content_text'] as const;
    for (const field of allowed) if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field];
    if (updates.title !== undefined && !cleanOptionalText(updates.title)) return res.status(400).json({ message: 'title 不能为空' });
    if (updates.visibility !== undefined && !isOneOf(updates.visibility, RESOURCE_VISIBILITIES)) return res.status(400).json({ message: 'visibility 无效' });
    const categoryId = updates.category_id === undefined ? undefined : updates.category_id == null ? null : positiveInteger(updates.category_id);
    if (updates.category_id != null && !categoryId) return res.status(400).json({ message: 'category_id 无效' });
    if (requestId) {
      const normalizedUpdates: Record<string, unknown> = {};
      for (const field of allowed) {
        if (updates[field] === undefined) continue;
        normalizedUpdates[field] = field === 'title' || field === 'summary' || field === 'content_text'
          ? cleanOptionalText(updates[field])
          : field === 'category_id' ? categoryId : updates[field];
      }
      if (Object.keys(normalizedUpdates).length === 0 && !Array.isArray(body.tag_ids)) {
        return res.status(400).json({ message: '没有需要更新的字段' });
      }
      const rawTagIds = Array.isArray(body.tag_ids) ? body.tag_ids : undefined;
      await updateResourceRecordWithRequest(Number(resource.id), Number(req.user!.id), normalizedUpdates, rawTagIds, requestId, String(resource.library_type));
      return res.json({ message: '资料更新成功' });
    }

    if (categoryId !== undefined && !await validateCategory(categoryId, String(resource.library_type))) return res.status(400).json({ message: '分类不存在或不属于当前资料库' });

    const assignments: string[] = [];
    const args: unknown[] = [];
    for (const field of allowed) {
      if (updates[field] === undefined) continue;
      assignments.push(`${field} = ?`);
      args.push(field === 'title' || field === 'summary' || field === 'content_text' ? cleanOptionalText(updates[field]) : field === 'category_id' ? categoryId : updates[field]);
      if (field === 'title') { assignments.push('name = ?'); args.push(cleanOptionalText(updates[field])); }
    }
    if (assignments.length === 0 && !Array.isArray(body.tag_ids)) return res.status(400).json({ message: '没有需要更新的字段' });
    const before = Object.fromEntries(allowed.map((field) => [field, resource[field]]));
    await runInTransaction(async (tx) => {
      if (assignments.length) {
        await tx.execute(`UPDATE resources SET ${assignments.join(', ')}, updated_by = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [...args, req.user!.id, resource.id]);
      }
      if (Array.isArray(body.tag_ids)) {
        const tagIds = [...new Set(body.tag_ids.map(positiveInteger).filter(Boolean))] as number[];
        if (tagIds.length !== body.tag_ids.length) throw new Error('tag_ids 无效');
        if (tagIds.length) {
          const found = await tx.queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM resource_tags WHERE id IN (${tagIds.map(() => '?').join(',')})`, tagIds);
          if (Number(found?.count || 0) !== tagIds.length) throw new Error('标签不存在');
        }
        await tx.execute('DELETE FROM resource_tag_relations WHERE resource_id = ?', [resource.id]);
        for (const tagId of tagIds) await tx.execute(`INSERT INTO resource_tag_relations(resource_id, tag_id, created_by, created_at) VALUES (?, ?, ?, datetime('now', '+8 hours'))`, [resource.id, tagId, req.user!.id]);
      }
      await tx.execute(`INSERT INTO resource_audit_logs(resource_id,user_id,action,detail_json,created_at) VALUES(?,?, 'update', ?, datetime('now', '+8 hours'))`, [resource.id, req.user!.id, JSON.stringify({ before, changes: updates, tag_ids: body.tag_ids })]);
    });
    res.json({ message: '资料更新成功' });
  } catch (error) {
    if (error instanceof ResourceUpdateCategoryValidationError) {
      return res.status(400).json({ message: '分类不存在或不属于当前资料库' });
    }
    if (error instanceof ResourceUpdateRequestConflictError) {
      return res.status(409).json({
        message: '资料更新请求编号已用于其他账号、资料或内容，请先核实原请求状态。',
        code: 'RESOURCE_UPDATE_REQUEST_CONFLICT',
      });
    }
    sendSafeServerError(res, '更新资料失败', 'resource-center:update', error);
  }
});

router.delete('/resources/:id', requirePermission('resource:delete'), async (req, res) => {
  try {
    const resource = await requireScopedResource(req, res);
    if (!resource) return;
    if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权删除该资料' });
    const outcome = await runInTransaction(async (tx) => {
      const changed = await tx.execute(
        `UPDATE resources
         SET status='deleted', deleted_at=datetime('now','+8 hours'), updated_by=?, updated_at=datetime('now','+8 hours')
         WHERE id=? AND COALESCE(status,'published') <> 'deleted' AND deleted_at IS NULL`,
        [req.user!.id, resource.id],
      );
      if (changed !== 1) {
        const current = await tx.queryOne<{ status: string | null; deleted_at: string | null }>(
          'SELECT status,deleted_at FROM resources WHERE id=?',
          [resource.id],
        );
        return current && (current.status === 'deleted' || current.deleted_at) ? 'already-deleted' : 'missing';
      }
      await recordResourceAuditInTransaction(tx, Number(resource.id), req.user!.id, 'delete', { previous_status: resource.status });
      return 'deleted';
    });
    if (outcome === 'missing') return res.status(404).json({ message: '资料不存在或无权访问' });
    res.json({ message: '资料已移入回收状态' });
  } catch (error) { sendSafeServerError(res, '删除资料失败', 'resource-center:delete', error); }
});

router.post('/resources/:id/restore', requirePermission('resource:delete'), async (req, res) => {
  try {
    const resource = await requireScopedResource(req, res);
    if (!resource) return;
    if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权恢复该资料' });
    const outcome = await runInTransaction(async (tx) => {
      const changed = await tx.execute(
        `UPDATE resources
         SET status='published', deleted_at=NULL, updated_by=?, updated_at=datetime('now','+8 hours')
         WHERE id=? AND (COALESCE(status,'published')='deleted' OR deleted_at IS NOT NULL)`,
        [req.user!.id, resource.id],
      );
      if (changed !== 1) {
        const current = await tx.queryOne<{ status: string | null; deleted_at: string | null }>(
          'SELECT status,deleted_at FROM resources WHERE id=?',
          [resource.id],
        );
        if (!current) return 'missing';
        if (current.status === 'deleted' || current.deleted_at) return 'missing';
        return current.status == null || current.status === 'published' ? 'already-restored' : 'invalid-state';
      }
      await recordResourceAuditInTransaction(tx, Number(resource.id), req.user!.id, 'restore', { previous_status: resource.status });
      return 'restored';
    });
    if (outcome === 'missing') return res.status(404).json({ message: '待恢复资料不存在或无权访问' });
    if (outcome === 'invalid-state') return res.status(409).json({ message: '当前资料状态无法恢复' });
    res.json({ message: '资料已恢复' });
  } catch (error) { sendSafeServerError(res, '恢复资料失败', 'resource-center:restore', error); }
});

router.get('/categories/mutation-requests/:requestId', requirePermission('resource:category_manage'), async (req, res) => {
  const requestId = typeof req.params.requestId === 'string' ? req.params.requestId.trim().toLowerCase() : '';
  const fingerprint = typeof req.query.fingerprint === 'string' ? req.query.fingerprint.trim().toLowerCase() : '';
  if (!RESOURCE_CATEGORY_MUTATION_REQUEST_ID_PATTERN.test(requestId) || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    return res.status(400).json({ message: '分类操作核实参数无效' });
  }
  try {
    const receipt = await queryOne<ResourceCategoryMutationReceipt>(
      'SELECT * FROM resource_category_mutation_request_keys WHERE client_request_id=?',
      [requestId],
    );
    if (!receipt || Number(receipt.actor_id) !== Number(req.user!.id)) {
      return res.json({ state: 'not_found' });
    }
    if (receipt.request_fingerprint !== fingerprint) {
      return res.status(409).json({ message: '分类操作恢复内容与原请求不一致。', code: 'RESOURCE_CATEGORY_MUTATION_FINGERPRINT_CONFLICT' });
    }
    return res.json({
      state: receipt.operation === 'create' ? 'created' : receipt.operation === 'update' ? 'updated' : 'deleted',
      categoryId: Number(receipt.result_category_id),
    });
  } catch {
    return res.status(500).json({ message: '核实分类操作状态失败' });
  }
});

router.get('/categories', requirePermission('resource:view'), async (req, res) => {
  const args: unknown[] = [];
  let where = '';
  if (req.query.library_type) { where = 'WHERE c.library_type = ?'; args.push(String(req.query.library_type)); }
  const rows = await queryAll(`SELECT c.*, (SELECT COUNT(*) FROM resources r WHERE r.category_id=c.id) AS resource_count FROM resource_categories c ${where} ORDER BY c.library_type,c.path,c.sort_order,c.id`, args);
  res.json({ data: rows });
});

router.post('/categories', requirePermission('resource:category_manage'), async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const name = cleanOptionalText(body.name);
    const libraryType = body.library_type;
    const rawRequestId = body.client_request_id;
    const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim().toLowerCase() : '';
    if (rawRequestId !== undefined && rawRequestId !== null && !RESOURCE_CATEGORY_MUTATION_REQUEST_ID_PATTERN.test(requestId)) {
      return res.status(400).json({ message: '分类操作请求编号无效' });
    }
    if (!name || name.length > 100 || !isOneOf(libraryType, RESOURCE_LIBRARY_TYPES)) return res.status(400).json({ message: 'name 或 library_type 无效' });
    let parentId: number | null = null;
    if (body.parent_id !== undefined && body.parent_id !== null && body.parent_id !== '') {
      parentId = positiveInteger(body.parent_id);
      if (!parentId) return res.status(400).json({ message: '父分类 ID 无效' });
    }
    const mutationPayload = Object.fromEntries(['name', 'parent_id', 'code', 'sort_order']
      .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
      .map((field) => [field, body[field]]));
    const fingerprint = requestId
      ? resourceCategoryMutationFingerprint('create', String(libraryType), null, mutationPayload)
      : null;
    const outcome = await runInTransaction(async (tx) => {
      if (requestId && fingerprint) {
        const replayedId = await getCategoryMutationReplay(tx, {
          actorId: Number(req.user!.id), requestId, operation: 'create', libraryType: String(libraryType), categoryId: null, fingerprint,
        });
        if (replayedId !== null) return { status: 201 as const, message: '分类创建成功', id: replayedId };
      }
      type CategoryParent = { id: number; parent_id: number | null; name: string };
      const categories = await tx.queryAll<CategoryParent>('SELECT id,parent_id,name FROM resource_categories WHERE library_type=?', [libraryType]);
      const categoriesById = new Map(categories.map((category) => [Number(category.id), category]));
      if (parentId !== null && !categoriesById.has(parentId)) return { status: 400 as const, message: '父分类不存在或资料库不一致' };

      const pathSegments = [name];
      const visited = new Set<number>();
      let ancestorId = parentId;
      while (ancestorId !== null) {
        if (visited.has(ancestorId)) return { status: 409 as const, message: '父分类关系存在循环，未创建分类' };
        visited.add(ancestorId);
        const ancestor = categoriesById.get(ancestorId);
        if (!ancestor) return { status: 400 as const, message: '父分类关系不完整，未创建分类' };
        pathSegments.push(String(ancestor.name));
        ancestorId = ancestor.parent_id == null ? null : Number(ancestor.parent_id);
      }
      const path = `/${pathSegments.reverse().join('/')}`;
      const id = await tx.executeInsert(
        `INSERT INTO resource_categories(library_type,parent_id,name,code,path,sort_order,enabled,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,datetime('now','+8 hours'),datetime('now','+8 hours'))`,
        [libraryType, parentId, name, cleanOptionalText(req.body.code), path, nonNegativeInteger(req.body.sort_order) || 0, req.user!.id],
      );
      if (requestId && fingerprint) {
        await recordCategoryMutation(tx, {
          actorId: Number(req.user!.id), requestId, operation: 'create', libraryType: String(libraryType), categoryId: null, resultCategoryId: id, fingerprint,
        });
      }
      return { status: 201 as const, message: '分类创建成功', id };
    });
    if (outcome.status !== 201) return res.status(outcome.status).json({ message: outcome.message });
    res.status(201).json({ message: outcome.message, id: outcome.id });
  } catch (error) {
    if (error instanceof ResourceCategoryMutationRequestConflictError) {
      return res.status(409).json({ message: '分类操作请求编号已用于其他操作或内容，请先核实原请求状态。', code: 'RESOURCE_CATEGORY_MUTATION_REQUEST_CONFLICT' });
    }
    sendSafeServerError(res, '创建分类失败', 'resource-center:category-create', error);
  }
});

router.put('/categories/:id', requirePermission('resource:category_manage'), async (req, res) => {
  try {
    const id = positiveInteger(req.params.id);
    if (!id) return res.status(400).json({ message: '分类 ID 无效' });
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const rawRequestId = body.client_request_id;
    const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim().toLowerCase() : '';
    if (rawRequestId !== undefined && rawRequestId !== null && !RESOURCE_CATEGORY_MUTATION_REQUEST_ID_PATTERN.test(requestId)) {
      return res.status(400).json({ message: '分类操作请求编号无效' });
    }
    if (requestId && !isOneOf(body.library_type, RESOURCE_LIBRARY_TYPES)) {
      return res.status(400).json({ message: '分类资料库类型无效' });
    }
    const libraryType = requestId ? String(body.library_type) : null;
    const mutationPayload = Object.fromEntries(['name', 'parent_id', 'code', 'sort_order', 'enabled']
      .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
      .map((field) => [field, body[field]]));
    const fingerprint = requestId && libraryType
      ? resourceCategoryMutationFingerprint('update', libraryType, id, mutationPayload)
      : null;
    const outcome = await runInTransaction(async (tx) => {
      if (requestId && libraryType && fingerprint) {
        const replayedId = await getCategoryMutationReplay(tx, {
          actorId: Number(req.user!.id), requestId, operation: 'update', libraryType, categoryId: id, fingerprint,
        });
        if (replayedId !== null) return { status: 200 as const, message: '分类更新成功' };
      }
      if (body.enabled !== undefined
        && !(typeof body.enabled === 'boolean' || body.enabled === 0 || body.enabled === 1)) {
        return { status: 400 as const, message: 'enabled 必须为布尔值或 0/1' };
      }
      type CategoryRow = { id: number; parent_id: number | null; name: string; library_type: string; path: string; code: string | null; sort_order: number; enabled: number };
      const current = await tx.queryOne<CategoryRow>('SELECT * FROM resource_categories WHERE id=?', [id]);
      if (!current) return { status: 404 as const, message: '分类不存在' };
      if (libraryType && current.library_type !== libraryType) return { status: 409 as const, message: '分类所属资料库已变化，请重新读取分类。' };
      const categories = await tx.queryAll<CategoryRow>('SELECT * FROM resource_categories WHERE library_type=?', [current.library_type]);
      const categoriesById = new Map(categories.map((category) => [Number(category.id), category]));
      const name = body.name === undefined ? String(current.name) : cleanOptionalText(body.name);
      if (!name || name.length > 100) return { status: 400 as const, message: '分类名称不能为空且不能超过 100 个字符' };

      let parentId: number | null;
      if (body.parent_id === undefined) {
        parentId = current.parent_id == null ? null : Number(current.parent_id);
      } else if (body.parent_id === null) {
        parentId = null;
      } else {
        parentId = positiveInteger(body.parent_id);
        if (!parentId) return { status: 400 as const, message: '父分类 ID 无效' };
      }

      if (parentId !== null && !categoriesById.has(parentId)) return { status: 400 as const, message: '父分类不存在或资料库不一致' };

      // Validate the relationship chain instead of trusting the denormalized path column.
      const ancestors = new Set<number>([id]);
      let validationAncestorId = parentId;
      while (validationAncestorId !== null) {
        if (ancestors.has(validationAncestorId)) return { status: 409 as const, message: '父分类关系会形成循环，未保存更改' };
        ancestors.add(validationAncestorId);
        const ancestor = categoriesById.get(validationAncestorId);
        if (!ancestor) return { status: 400 as const, message: '父分类关系不完整，未保存更改' };
        validationAncestorId = ancestor.parent_id == null ? null : Number(ancestor.parent_id);
      }

      const pathSegments = [name];
      let pathAncestorId = parentId;
      while (pathAncestorId !== null) {
        const ancestor = categoriesById.get(pathAncestorId);
        if (!ancestor) return { status: 400 as const, message: '父分类关系不完整，未保存更改' };
        pathSegments.push(String(ancestor.name));
        pathAncestorId = ancestor.parent_id == null ? null : Number(ancestor.parent_id);
      }
      const path = `/${pathSegments.reverse().join('/')}`;

      const childrenByParent = new Map<number, CategoryRow[]>();
      for (const category of categories) {
        if (category.parent_id == null) continue;
        const siblings = childrenByParent.get(Number(category.parent_id)) ?? [];
        siblings.push(category);
        childrenByParent.set(Number(category.parent_id), siblings);
      }
      const pathUpdates: Array<{ categoryId: number; path: string }> = [{ categoryId: id, path }];
      const visited = new Set<number>([id]);
      const pending = [{ categoryId: id, path }];
      for (let pendingIndex = 0; pendingIndex < pending.length; pendingIndex += 1) {
        const parent = pending[pendingIndex];
        for (const child of childrenByParent.get(parent.categoryId) ?? []) {
          const childId = Number(child.id);
          if (visited.has(childId)) return { status: 409 as const, message: '分类子树存在循环，未保存更改' };
          visited.add(childId);
          const childPath = `${parent.path}/${child.name}`;
          pathUpdates.push({ categoryId: childId, path: childPath });
          pending.push({ categoryId: childId, path: childPath });
        }
      }

      await tx.execute(
        `UPDATE resource_categories SET parent_id=?,name=?,code=?,path=?,sort_order=?,enabled=?,updated_at=datetime('now','+8 hours') WHERE id=?`,
        [parentId, name, body.code === undefined ? current.code : cleanOptionalText(body.code), path, body.sort_order === undefined ? current.sort_order : nonNegativeInteger(body.sort_order), body.enabled === undefined ? current.enabled : (body.enabled === true || body.enabled === 1 ? 1 : 0), id],
      );
      for (const update of pathUpdates.slice(1)) {
        const descendant = categoriesById.get(update.categoryId);
        if (descendant?.path === update.path) continue;
        await tx.execute(`UPDATE resource_categories SET path=?,updated_at=datetime('now','+8 hours') WHERE id=?`, [update.path, update.categoryId]);
      }
      if (requestId && libraryType && fingerprint) {
        await recordCategoryMutation(tx, {
          actorId: Number(req.user!.id), requestId, operation: 'update', libraryType, categoryId: id, resultCategoryId: id, fingerprint,
        });
      }
      return { status: 200 as const, message: '分类更新成功' };
    });
    if (outcome.status !== 200) return res.status(outcome.status).json({ message: outcome.message });
    res.json({ message: outcome.message });
  } catch (error) {
    if (error instanceof ResourceCategoryMutationRequestConflictError) {
      return res.status(409).json({ message: '分类操作请求编号已用于其他操作或内容，请先核实原请求状态。', code: 'RESOURCE_CATEGORY_MUTATION_REQUEST_CONFLICT' });
    }
    sendSafeServerError(res, '更新分类失败', 'resource-center:category-update', error);
  }
});

router.delete('/categories/:id', requirePermission('resource:category_manage'), async (req, res) => {
  const id = positiveInteger(req.params.id);
  if (!id) return res.status(400).json({ message: '分类 ID 无效' });
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const rawRequestId = body.client_request_id;
  const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim().toLowerCase() : '';
  if (rawRequestId !== undefined && rawRequestId !== null && !RESOURCE_CATEGORY_MUTATION_REQUEST_ID_PATTERN.test(requestId)) {
    return res.status(400).json({ message: '分类操作请求编号无效' });
  }
  if (requestId && !isOneOf(body.library_type, RESOURCE_LIBRARY_TYPES)) {
    return res.status(400).json({ message: '分类资料库类型无效' });
  }
  if (requestId) {
    const libraryType = String(body.library_type);
    const fingerprint = resourceCategoryMutationFingerprint('delete', libraryType, id, {});
    try {
      const outcome = await runInTransaction(async (tx) => {
        const replayedId = await getCategoryMutationReplay(tx, {
          actorId: Number(req.user!.id), requestId, operation: 'delete', libraryType, categoryId: id, fingerprint,
        });
        if (replayedId !== null) return { status: 200 as const, message: '分类已删除' };
        const category = await tx.queryOne<{ id: number; library_type: string }>('SELECT id,library_type FROM resource_categories WHERE id=?', [id]);
        if (!category) return { status: 404 as const, message: '分类不存在' };
        if (category.library_type !== libraryType) return { status: 409 as const, message: '分类所属资料库已变化，请重新读取分类。' };
        const usage = await tx.queryOne<{ resources: number; children: number }>(
          'SELECT (SELECT COUNT(*) FROM resources WHERE category_id=?) resources,(SELECT COUNT(*) FROM resource_categories WHERE parent_id=?) children',
          [id, id],
        );
        if (Number(usage?.resources || 0) > 0) return { status: 409 as const, message: '分类下存在资料，禁止删除' };
        if (Number(usage?.children || 0) > 0) return { status: 409 as const, message: '分类下存在子分类，禁止删除' };
        const changed = await tx.execute('DELETE FROM resource_categories WHERE id=?', [id]);
        if (!changed) return { status: 404 as const, message: '分类不存在' };
        await recordCategoryMutation(tx, {
          actorId: Number(req.user!.id), requestId, operation: 'delete', libraryType, categoryId: id, resultCategoryId: id, fingerprint,
        });
        return { status: 200 as const, message: '分类已删除' };
      });
      return res.status(outcome.status).json({ message: outcome.message });
    } catch (error) {
      if (error instanceof ResourceCategoryMutationRequestConflictError) {
        return res.status(409).json({ message: '分类操作请求编号已用于其他操作或内容，请先核实原请求状态。', code: 'RESOURCE_CATEGORY_MUTATION_REQUEST_CONFLICT' });
      }
      return sendSafeServerError(res, '删除分类失败', 'resource-center:category-delete', error);
    }
  }
  const usage = await queryOne<{ resources: number; children: number }>(`SELECT (SELECT COUNT(*) FROM resources WHERE category_id=?) resources,(SELECT COUNT(*) FROM resource_categories WHERE parent_id=?) children`, [id,id]);
  if (Number(usage?.resources || 0) > 0) return res.status(409).json({ message: '分类下存在资料，禁止删除' });
  if (Number(usage?.children || 0) > 0) return res.status(409).json({ message: '分类下存在子分类，禁止删除' });
  const changed = await execute('DELETE FROM resource_categories WHERE id=?', [id]);
  res.status(changed ? 200 : 404).json({ message: changed ? '分类已删除' : '分类不存在' });
});

router.get('/tags', requirePermission('resource:view'), async (_req, res) => {
  res.json({ data: await queryAll(`SELECT t.*, (SELECT COUNT(*) FROM resource_tag_relations rt WHERE rt.tag_id=t.id) resource_count FROM resource_tags t ORDER BY t.name`) });
});

router.post('/tags', requirePermission('resource:category_manage'), async (req, res) => {
  const name = cleanOptionalText(req.body.name);
  const normalized = normalizeTagName(name);
  if (!name || !normalized) return res.status(400).json({ message: '标签名称不能为空' });
  try {
    const id = await executeInsert(`INSERT INTO resource_tags(name,normalized_name,created_by,created_at) VALUES(?,?,?,datetime('now','+8 hours'))`, [name,normalized,req.user!.id]);
    res.status(201).json({ message: '标签创建成功', id });
  } catch { res.status(409).json({ message: '标签已存在' }); }
});

router.delete('/tags/:id', requirePermission('resource:category_manage'), async (req, res) => {
  const id = positiveInteger(req.params.id);
  if (!id) return res.status(400).json({ message: '标签 ID 无效' });
  const changed = await execute('DELETE FROM resource_tags WHERE id=?', [id]);
  res.status(changed ? 200 : 404).json({ message: changed ? '标签已删除' : '标签不存在' });
});

router.post('/resources/:id/tags', requirePermission('resource:update'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });
  const tagId = positiveInteger(req.body.tag_id);
  if (!tagId || !await queryOne('SELECT id FROM resource_tags WHERE id=?', [tagId])) return res.status(404).json({ message: '标签不存在' });
  try {
    const added = await runInTransaction(async (tx) => {
      const changed = await tx.execute(`
        INSERT OR IGNORE INTO resource_tag_relations(resource_id,tag_id,created_by,created_at)
        VALUES(?,?,?,datetime('now','+8 hours'))
      `, [resource.id, tagId, req.user!.id]);
      if (changed) await recordResourceAuditInTransaction(tx, Number(resource.id), req.user!.id, 'update', { tag_add: tagId });
      return changed;
    });
    return res.status(added ? 201 : 200).json({ message: added ? '标签绑定成功' : '标签已绑定' });
  } catch (error) {
    return sendSafeServerError(res, '绑定标签失败', 'resource-center:tag-add', error);
  }
});

router.delete('/resources/:id/tags/:tagId', requirePermission('resource:update'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });
  const tagId = positiveInteger(req.params.tagId); if (!tagId) return res.status(400).json({ message: '标签 ID 无效' });
  try {
    await runInTransaction(async (tx) => {
      const removed = await tx.execute('DELETE FROM resource_tag_relations WHERE resource_id=? AND tag_id=?', [resource.id, tagId]);
      if (removed) await recordResourceAuditInTransaction(tx, Number(resource.id), req.user!.id, 'update', { tag_remove: tagId });
    });
    return res.json({ message: '标签解绑成功' });
  } catch (error) {
    return sendSafeServerError(res, '解绑标签失败', 'resource-center:tag-remove', error);
  }
});

router.get('/resources/:id/relations', requirePermission('resource:view'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  res.json({ data: await queryAll('SELECT * FROM resource_relations WHERE resource_id=? ORDER BY id', [resource.id]) });
});

router.post('/resources/:id/relations', requirePermission('resource:update'), async (req, res) => {
  try {
    const resource = await requireScopedResource(req, res); if (!resource) return;
    if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });
    const targetType = String(req.body.target_type || ''); const targetId = positiveInteger(req.body.target_id); const relationType = cleanOptionalText(req.body.relation_type);
    if (!(targetType in RESOURCE_TARGET_TABLES) || !targetId || !relationType) return res.status(400).json({ message: '关联参数无效' });
    if (!await validateTarget(targetType,targetId)) return res.status(404).json({ message: '关联目标不存在' });
    const id = await runInTransaction(async (tx) => {
      const relationId = await tx.executeInsert(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by,created_at) VALUES(?,?,?,?,?,datetime('now','+8 hours'))`, [resource.id,targetType,targetId,relationType,req.user!.id]);
      await recordResourceAuditInTransaction(tx, Number(resource.id), req.user!.id, 'relation_add', {
        relation_id: relationId,
        target_type: targetType,
        target_id: targetId,
        relation_type: relationType,
      });
      return relationId;
    });
    return res.status(201).json({ message: '关联创建成功', id });
  } catch (error) {
    if (String(error).toLowerCase().includes('unique constraint')) return res.status(409).json({ message: '关联已存在' });
    return sendSafeServerError(res, '创建资料关联失败', 'resource-center:relation-add', error);
  }
});

router.delete('/resources/:id/relations/:relationId', requirePermission('resource:update'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });
  const relationId = positiveInteger(req.params.relationId); if (!relationId) return res.status(400).json({ message: '关联 ID 无效' });
  try {
    const relation = await runInTransaction(async (tx) => {
      const current = await tx.queryOne<Record<string, unknown>>('SELECT * FROM resource_relations WHERE id=? AND resource_id=?', [relationId, resource.id]);
      if (!current) return null;
      const removed = await tx.execute('DELETE FROM resource_relations WHERE id=? AND resource_id=?', [relationId, resource.id]);
      if (!removed) return null;
      await recordResourceAuditInTransaction(tx, Number(resource.id), req.user!.id, 'relation_remove', current);
      return current;
    });
    if (!relation) return res.status(404).json({ message: '关联不存在' });
    return res.json({ message: '关联已删除' });
  } catch (error) {
    return sendSafeServerError(res, '删除资料关联失败', 'resource-center:relation-remove', error);
  }
});

router.get('/resources/:id/files', requirePermission('resource:view'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  res.json({ data: await queryAll('SELECT * FROM resource_files WHERE resource_id=? ORDER BY is_primary DESC,id',[resource.id]) });
});

router.post('/resources/:id/files', requirePermission('resource:update'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });
  const originalName = cleanOptionalText(req.body.original_name); const storageKey = cleanOptionalText(req.body.storage_key); const size = req.body.size_bytes == null ? null : nonNegativeInteger(req.body.size_bytes);
  if (!originalName || !storageKey || (req.body.size_bytes != null && size == null)) return res.status(400).json({ message: '文件元数据无效' });
  try {
    const id = await runInTransaction(async (tx) => {
      const fileId = await tx.executeInsert(`INSERT INTO resource_files(resource_id,original_name,storage_key,mime_type,extension,size_bytes,sha256,is_primary,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now','+8 hours'))`, [resource.id,originalName,storageKey,cleanOptionalText(req.body.mime_type),cleanOptionalText(req.body.extension),size,cleanOptionalText(req.body.sha256),req.body.is_primary?1:0,cleanOptionalText(req.body.status)||'pending',req.user!.id]);
      await recordResourceAuditInTransaction(tx, Number(resource.id), req.user!.id, 'update', { file_metadata_add: fileId });
      return fileId;
    });
    return res.status(201).json({ message: '文件元数据创建成功；当前阶段未上传文件内容', id });
  } catch (error) {
    return sendSafeServerError(res, '添加文件信息失败', 'resource-center:file-add', error);
  }
});

router.delete('/files/:id', requirePermission('resource:update'), async (req, res) => {
  const fileId = positiveInteger(req.params.id); if (!fileId) return res.status(400).json({ message: '文件 ID 无效' });
  const file = await queryOne<Record<string,unknown>>('SELECT * FROM resource_files WHERE id=?',[fileId]); if (!file) return res.status(404).json({ message: '文件不存在' });
  const resource = await getScopedResource(Number(file.resource_id),req.user); if (!resource || !await canModifyResource(resource,req.user)) return res.status(403).json({ message: '无权删除该文件元数据' });
  try {
    const removed = await runInTransaction(async (tx) => {
      const current = await tx.queryOne<{ id: number }>('SELECT id FROM resource_files WHERE id=? AND resource_id=?', [fileId, resource.id]);
      if (!current) return false;
      const changed = await tx.execute('DELETE FROM resource_files WHERE id=? AND resource_id=?', [fileId, resource.id]);
      if (!changed) return false;
      await recordResourceAuditInTransaction(tx, Number(resource.id), req.user!.id, 'update', { file_metadata_remove: fileId });
      return true;
    });
    if (!removed) return res.status(404).json({ message: '文件不存在' });
    return res.json({ message: '文件元数据已删除；未执行物理文件操作' });
  } catch (error) {
    return sendSafeServerError(res, '删除文件信息失败', 'resource-center:file-remove', error);
  }
});

export default router;
