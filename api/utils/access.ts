import { queryOne } from '../database/utils';
import { User } from '../types';

type TopicScopeRecord = {
  id: number;
  creator_id: number | null;
  assignee_id: number | null;
  workflow_template_id?: number | null;
  status?: string | null;
};

type WorkflowNodeRecord = {
  id: number;
  template_id?: number | null;
  approver_type: string | null;
  approver_value: string | null;
  status_from: string | null;
  status_to: string | null;
};

export function isPrivilegedUser(user?: User | null) {
  return user?.role === 'admin' || user?.role === 'director';
}

export function canAccessTopic(user: User | undefined, topic: Pick<TopicScopeRecord, 'creator_id' | 'assignee_id'> | null | undefined) {
  if (!user || !topic) {
    return false;
  }

  if (isPrivilegedUser(user)) {
    return true;
  }

  return Number(topic.creator_id) === user.id || Number(topic.assignee_id) === user.id;
}

export function canManageOwnedResource(user: User | undefined, resource: { uploader_id?: unknown } | null | undefined) {
  if (!user || !resource) {
    return false;
  }

  return isPrivilegedUser(user) || Number(resource.uploader_id) === user.id;
}

export function canManageCalendarEvent(user: User | undefined, event: { creator_id?: unknown } | null | undefined) {
  if (!user || !event) {
    return false;
  }

  return isPrivilegedUser(user) || Number(event.creator_id) === user.id;
}

export async function canOwnerOrPermission(
  user: User | undefined,
  ownerId: unknown,
  permissionCode: string,
) {
  if (!user) {
    return false;
  }

  if (Number(ownerId) === user.id || user.role === 'admin') {
    return true;
  }

  const permission = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id
     JOIN user_roles ur ON rp.role_id = ur.role_id
     WHERE ur.user_id = ? AND p.code = ?`,
    [user.id, permissionCode],
  );

  return Number(permission?.count || 0) > 0;
}

export async function getTopicScopeById(topicId: number | string) {
  const topic = await queryOne<TopicScopeRecord>(
    `SELECT id, creator_id, assignee_id, workflow_template_id, status FROM topics WHERE id = ?`,
    [topicId],
  );

  return topic || null;
}

export async function getTopicScopeByProductionId(productionId: number | string) {
  return await queryOne<TopicScopeRecord>(
    `SELECT t.id, t.creator_id, t.assignee_id, t.workflow_template_id, t.status
     FROM production p
     JOIN topics t ON p.topic_id = t.id
     WHERE p.id = ?`,
    [productionId],
  );
}

export async function getTopicScopeByShootingId(shootingId: number | string) {
  return await queryOne<TopicScopeRecord>(
    `SELECT t.id, t.creator_id, t.assignee_id, t.workflow_template_id, t.status
     FROM shooting s
     JOIN topics t ON s.topic_id = t.id
     WHERE s.id = ?`,
    [shootingId],
  );
}

export async function getTopicScopeByPublishingId(publishingId: number | string) {
  return await queryOne<TopicScopeRecord>(
    `SELECT t.id, t.creator_id, t.assignee_id, t.workflow_template_id, t.status
     FROM publishing p
     JOIN topics t ON p.topic_id = t.id
     WHERE p.id = ?`,
    [publishingId],
  );
}

export async function resolveCommentTopicScope(targetType: unknown, targetId: unknown) {
  if (!targetType || !targetId) {
    return null;
  }

  const normalizedType = String(targetType);
  if (normalizedType === 'topic') {
    return getTopicScopeById(String(targetId));
  }

  if (normalizedType === 'production') {
    return getTopicScopeByProductionId(String(targetId));
  }

  if (normalizedType === 'shooting') {
    return getTopicScopeByShootingId(String(targetId));
  }

  if (normalizedType === 'publishing') {
    return getTopicScopeByPublishingId(String(targetId));
  }

  return null;
}

export async function getWorkflowNodeById(nodeId: number | string) {
  const node = await queryOne<WorkflowNodeRecord>(
    `SELECT id, template_id, approver_type, approver_value, status_from, status_to FROM workflow_nodes WHERE id = ?`,
    [nodeId],
  );

  return node || null;
}

export async function canApproveWorkflowNode(user: User | undefined, topicId: number | string, nodeId: number | string) {
  if (!user) {
    return false;
  }

  if (isPrivilegedUser(user)) {
    return true;
  }

  const [topic, node] = await Promise.all([getTopicScopeById(topicId), getWorkflowNodeById(nodeId)]);
  if (!topic || !node) {
    return false;
  }

  const approverType = String(node.approver_type || 'role');
  const approverValue = String(node.approver_value || '').trim();

  if (approverType === 'creator') {
    return Number(topic.creator_id) === user.id;
  }

  if (approverType === 'user') {
    return approverValue !== '' && Number(approverValue) === user.id;
  }

  if (approverType === 'role') {
    return approverValue !== '' && approverValue === user.role;
  }

  return false;
}
