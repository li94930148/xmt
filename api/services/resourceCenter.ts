import { execute, queryAll, queryOne, runInTransaction } from '../database/utils';
import { createHash } from 'node:crypto';
import type { User } from '../types';

export const RESOURCE_LIBRARY_TYPES = ['project', 'content_archive', 'knowledge', 'media'] as const;
export const RESOURCE_VISIBILITIES = ['private', 'project', 'team', 'company'] as const;
export const RESOURCE_TARGET_TABLES = {
  topic: 'topics',
  production: 'production',
  shooting: 'shooting',
  publishing: 'publishing',
  user: 'users',
} as const;

export function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function normalizeTagName(value: unknown) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

export async function userHasPermission(user: User | undefined, permission: string) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const row = await queryOne<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    JOIN user_roles ur ON ur.role_id = rp.role_id
    WHERE ur.user_id = ? AND p.code = ?
  `, [user.id, permission]);
  return Number(row?.count || 0) > 0;
}

export function resourceScopePredicate(alias = 'r') {
  return `(
    ? = 1
    OR ${alias}.owner_id = ?
    OR ${alias}.created_by = ?
    OR ${alias}.uploader_id = ?
    OR ${alias}.visibility IN ('team', 'company')
    OR (
      ${alias}.visibility = 'project'
      AND EXISTS (
        SELECT 1
        FROM resource_relations scope_rel
        WHERE scope_rel.resource_id = ${alias}.id
          AND (
            (scope_rel.target_type = 'user' AND scope_rel.target_id = ?)
            OR (scope_rel.target_type = 'topic' AND EXISTS (
              SELECT 1 FROM topics scope_topic
              WHERE scope_topic.id = scope_rel.target_id
                AND (scope_topic.creator_id = ? OR scope_topic.assignee_id = ?)
            ))
            OR (scope_rel.target_type = 'production' AND EXISTS (
              SELECT 1 FROM production scope_production
              JOIN topics scope_topic ON scope_topic.id = scope_production.topic_id
              WHERE scope_production.id = scope_rel.target_id
                AND (scope_production.operator_id = ? OR scope_topic.creator_id = ? OR scope_topic.assignee_id = ?)
            ))
            OR (scope_rel.target_type = 'shooting' AND EXISTS (
              SELECT 1 FROM shooting scope_shooting
              JOIN topics scope_topic ON scope_topic.id = scope_shooting.topic_id
              WHERE scope_shooting.id = scope_rel.target_id
                AND (scope_shooting.operator_id = ? OR scope_topic.creator_id = ? OR scope_topic.assignee_id = ?)
            ))
            OR (scope_rel.target_type = 'publishing' AND EXISTS (
              SELECT 1 FROM publishing scope_publishing
              JOIN topics scope_topic ON scope_topic.id = scope_publishing.topic_id
              WHERE scope_publishing.id = scope_rel.target_id
                AND (scope_publishing.operator_id = ? OR scope_topic.creator_id = ? OR scope_topic.assignee_id = ?)
            ))
          )
      )
    )
  )`;
}

export function resourceScopeArgs(userId: number, canManage: boolean) {
  return [canManage ? 1 : 0, ...Array(15).fill(userId)];
}

export async function getScopedResource(resourceId: number, user: User | undefined) {
  if (!user) return null;
  const canManage = await userHasPermission(user, 'resource:manage');
  return queryOne<Record<string, unknown>>(`
    SELECT r.*
    FROM resources r
    WHERE r.id = ? AND ${resourceScopePredicate('r')}
  `, [resourceId, ...resourceScopeArgs(user.id, canManage)]);
}

export async function canModifyResource(resource: Record<string, unknown>, user: User | undefined) {
  if (!user) return false;
  if (await userHasPermission(user, 'resource:manage')) return true;
  return [resource.owner_id, resource.created_by, resource.uploader_id].some((value) => Number(value) === user.id);
}

type ResourceAuditTransaction = {
  execute(sql: string, params?: unknown[]): Promise<number>;
};

export async function recordResourceAuditInTransaction(
  tx: ResourceAuditTransaction,
  resourceId: number | null,
  userId: number,
  action: string,
  detail: unknown,
) {
  await tx.execute(
    `INSERT INTO resource_audit_logs (resource_id, user_id, action, detail_json, created_at)
     VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))`,
    [resourceId, userId, action, JSON.stringify(detail ?? {})],
  );
}

export async function validateCategory(categoryId: number | null, libraryType?: string) {
  if (categoryId === null) return true;
  const category = await queryOne<Record<string, unknown>>(
    `SELECT id, library_type FROM resource_categories WHERE id = ? AND enabled = 1`,
    [categoryId],
  );
  return Boolean(category && (!libraryType || category.library_type === libraryType));
}

export async function validateTarget(targetType: string, targetId: number) {
  const table = RESOURCE_TARGET_TABLES[targetType as keyof typeof RESOURCE_TARGET_TABLES];
  if (!table) return false;
  const target = await queryOne<{ id: number }>(`SELECT id FROM ${table} WHERE id = ?`, [targetId]);
  return Boolean(target);
}

export async function getResourceTags(resourceId: number) {
  return queryAll(`
    SELECT t.id, t.name, t.normalized_name
    FROM resource_tags t
    JOIN resource_tag_relations rt ON rt.tag_id = t.id
    WHERE rt.resource_id = ?
    ORDER BY t.name
  `, [resourceId]);
}

export async function attachTag(resourceId: number, tagId: number, userId: number) {
  return execute(
    `INSERT OR IGNORE INTO resource_tag_relations (resource_id, tag_id, created_by, created_at)
     VALUES (?, ?, ?, datetime('now', '+8 hours'))`,
    [resourceId, tagId, userId],
  );
}

type ResourceCenterTransaction = Parameters<Parameters<typeof runInTransaction>[0]>[0];

export class ResourceCreateRequestConflictError extends Error {
  constructor() {
    super('RESOURCE_CREATE_REQUEST_CONFLICT');
    this.name = 'ResourceCreateRequestConflictError';
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function resourceCreateRequestFingerprint(fields: Record<string, unknown>) {
  return createHash('sha256').update(stableJson({
    title: fields.title,
    summary: fields.summary ?? null,
    library_type: fields.library_type,
    category_id: fields.category_id ?? null,
    visibility: fields.visibility,
    content_text: fields.content_text ?? null,
    source_type: fields.source_type ?? 'manual',
    source_uri: fields.source_uri ?? null,
  })).digest('hex');
}

async function createResourceRecordInTransaction(tx: ResourceCenterTransaction, fields: Record<string, unknown>, userId: number) {
  const id = await tx.executeInsert(`
      INSERT INTO resources (
        name, title, summary, library_type, category_id, visibility, status,
        content_text, source_type, source_uri, owner_id, uploader_id, created_by, updated_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
    `, [
      fields.title, fields.title, fields.summary ?? null, fields.library_type, fields.category_id ?? null,
      fields.visibility, fields.content_text ?? null, fields.source_type ?? 'manual', fields.source_uri ?? null,
      userId, userId, userId, userId,
    ]);
    await recordResourceAuditInTransaction(tx, id, userId, 'create', {
      title: fields.title,
      library_type: fields.library_type,
      category_id: fields.category_id ?? null,
      visibility: fields.visibility,
    });
  return id;
}

export async function createResourceRecord(fields: Record<string, unknown>, userId: number) {
  return runInTransaction((tx) => createResourceRecordInTransaction(tx, fields, userId));
}

export async function createResourceRecordWithRequest(
  fields: Record<string, unknown>,
  userId: number,
  clientRequestId: string,
): Promise<{ resourceId: number; replayed: boolean }> {
  const normalizedRequestId = clientRequestId.trim().toLowerCase();
  const requestFingerprint = resourceCreateRequestFingerprint(fields);
  return runInTransaction(async (tx) => {
    const existing = await tx.queryOne<{
      actor_id: number;
      resource_id: number;
      request_fingerprint: string;
    }>(
      `SELECT actor_id,resource_id,request_fingerprint
       FROM resource_create_request_keys WHERE client_request_id=?`,
      [normalizedRequestId],
    );
    if (existing) {
      if (Number(existing.actor_id) !== userId || existing.request_fingerprint !== requestFingerprint) {
        throw new ResourceCreateRequestConflictError();
      }
      return { resourceId: Number(existing.resource_id), replayed: true };
    }

    const resourceId = await createResourceRecordInTransaction(tx, fields, userId);
    await tx.execute(
      `INSERT INTO resource_create_request_keys
        (client_request_id,actor_id,resource_id,request_fingerprint,created_at)
       VALUES(?,?,?,?,datetime('now', '+8 hours'))`,
      [normalizedRequestId, userId, resourceId, requestFingerprint],
    );
    return { resourceId, replayed: false };
  });
}

export async function getResourceCreateRequestStatus(actorId: number, clientRequestId: string) {
  const request = await queryOne<{ resource_id: number }>(
    `SELECT resource_id FROM resource_create_request_keys WHERE client_request_id=? AND actor_id=?`,
    [clientRequestId.trim().toLowerCase(), actorId],
  );
  return request
    ? { state: 'created' as const, resourceId: Number(request.resource_id) }
    : { state: 'not_found' as const };
}

export class ResourceUpdateRequestConflictError extends Error {
  constructor() {
    super('RESOURCE_UPDATE_REQUEST_CONFLICT');
    this.name = 'ResourceUpdateRequestConflictError';
  }
}

export class ResourceUpdateCategoryValidationError extends Error {
  constructor() {
    super('RESOURCE_UPDATE_CATEGORY_INVALID');
    this.name = 'ResourceUpdateCategoryValidationError';
  }
}

type ResourceUpdateFields = Record<string, unknown>;
const RESOURCE_UPDATE_FIELDS = ['title', 'summary', 'category_id', 'visibility', 'content_text'] as const;

function resourceUpdateRequestFingerprint(updates: ResourceUpdateFields, tagIds: unknown) {
  return createHash('sha256').update(stableJson({ updates, tag_ids: tagIds })).digest('hex');
}

function isSqliteBusy(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; rawCode?: unknown; cause?: unknown };
    if (candidate.code === 'SQLITE_BUSY' || Number(candidate.rawCode) === 5) return true;
    current = candidate.cause;
  }
  return false;
}

async function runResourceUpdateTransaction<T>(callback: (tx: ResourceCenterTransaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runInTransaction(callback);
    } catch (error) {
      if (!isSqliteBusy(error) || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt));
    }
  }
}

async function updateResourceRecordInTransaction(
  tx: ResourceCenterTransaction,
  resourceId: number,
  userId: number,
  updates: ResourceUpdateFields,
  rawTagIds: unknown,
) {
  const beforeRow = await tx.queryOne<Record<string, unknown>>(
    `SELECT title,summary,category_id,visibility,content_text FROM resources WHERE id=?`,
    [resourceId],
  );
  if (!beforeRow) throw new Error('RESOURCE_UPDATE_TARGET_MISSING');

  const assignments: string[] = [];
  const args: unknown[] = [];
  for (const field of RESOURCE_UPDATE_FIELDS) {
    if (updates[field] === undefined) continue;
    assignments.push(`${field} = ?`);
    args.push(updates[field]);
    if (field === 'title') {
      assignments.push('name = ?');
      args.push(updates.title);
    }
  }

  if (assignments.length) {
    await tx.execute(
      `UPDATE resources SET ${assignments.join(', ')}, updated_by = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
      [...args, userId, resourceId],
    );
  }

  let normalizedTagIds: number[] | undefined;
  if (rawTagIds !== undefined) {
    if (!Array.isArray(rawTagIds)) throw new Error('tag_ids 无效');
    normalizedTagIds = [...new Set(rawTagIds.map(positiveInteger).filter(Boolean))] as number[];
    if (normalizedTagIds.length !== rawTagIds.length) throw new Error('tag_ids 无效');
    if (normalizedTagIds.length) {
      const found = await tx.queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM resource_tags WHERE id IN (${normalizedTagIds.map(() => '?').join(',')})`,
        normalizedTagIds,
      );
      if (Number(found?.count || 0) !== normalizedTagIds.length) throw new Error('标签不存在');
    }
    await tx.execute('DELETE FROM resource_tag_relations WHERE resource_id = ?', [resourceId]);
    for (const tagId of normalizedTagIds) {
      await tx.execute(
        `INSERT INTO resource_tag_relations(resource_id, tag_id, created_by, created_at) VALUES (?, ?, ?, datetime('now', '+8 hours'))`,
        [resourceId, tagId, userId],
      );
    }
  }

  const before = Object.fromEntries(RESOURCE_UPDATE_FIELDS.map((field) => [field, beforeRow[field]]));
  await tx.execute(
    `INSERT INTO resource_audit_logs(resource_id,user_id,action,detail_json,created_at)
     VALUES(?,?, 'update', ?, datetime('now', '+8 hours'))`,
    [resourceId, userId, JSON.stringify({ before, changes: updates, tag_ids: normalizedTagIds })],
  );
}

export async function updateResourceRecordWithRequest(
  resourceId: number,
  userId: number,
  updates: ResourceUpdateFields,
  rawTagIds: unknown,
  clientRequestId: string,
  libraryType: string,
): Promise<{ resourceId: number; replayed: boolean }> {
  const normalizedRequestId = clientRequestId.trim().toLowerCase();
  const requestFingerprint = resourceUpdateRequestFingerprint(updates, rawTagIds);
  return runResourceUpdateTransaction(async (tx) => {
    const existing = await tx.queryOne<{
      actor_id: number;
      resource_id: number;
      request_fingerprint: string;
    }>(
      `SELECT actor_id,resource_id,request_fingerprint
       FROM resource_update_request_keys WHERE client_request_id=?`,
      [normalizedRequestId],
    );
    if (existing) {
      if (
        Number(existing.actor_id) !== userId
        || Number(existing.resource_id) !== resourceId
        || existing.request_fingerprint !== requestFingerprint
      ) {
        throw new ResourceUpdateRequestConflictError();
      }
      return { resourceId: Number(existing.resource_id), replayed: true };
    }

    if (updates.category_id !== undefined && updates.category_id !== null) {
      const category = await tx.queryOne<{ id: number; library_type: string }>(
        `SELECT id,library_type FROM resource_categories WHERE id=? AND enabled=1`,
        [updates.category_id],
      );
      if (!category || category.library_type !== libraryType) {
        throw new ResourceUpdateCategoryValidationError();
      }
    }

    await updateResourceRecordInTransaction(tx, resourceId, userId, updates, rawTagIds);
    await tx.execute(
      `INSERT INTO resource_update_request_keys
        (client_request_id,actor_id,resource_id,request_fingerprint,created_at)
       VALUES(?,?,?,?,datetime('now', '+8 hours'))`,
      [normalizedRequestId, userId, resourceId, requestFingerprint],
    );
    return { resourceId, replayed: false };
  });
}

export async function getResourceUpdateRequestStatus(actorId: number, resourceId: number, clientRequestId: string) {
  const request = await queryOne<{ resource_id: number }>(
    `SELECT resource_id FROM resource_update_request_keys
     WHERE client_request_id=? AND actor_id=? AND resource_id=?`,
    [clientRequestId.trim().toLowerCase(), actorId, resourceId],
  );
  return request
    ? { state: 'updated' as const, resourceId: Number(request.resource_id) }
    : { state: 'not_found' as const };
}
