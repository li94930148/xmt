import { execute, executeInsert, queryAll, queryOne } from '../database/utils';
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

export async function recordResourceAudit(
  resourceId: number | null,
  userId: number,
  action: string,
  detail: unknown,
) {
  await execute(
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

export async function createResourceRecord(fields: Record<string, unknown>, userId: number) {
  return executeInsert(`
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
}
