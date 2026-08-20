import { queryAll } from '../database/utils.js';

export type RoleAssignmentActor = { id: number; role?: string | null };
export type AssignableRole = { id: number; code: string; name: string };

async function rolePermissions(roleId: number): Promise<Set<string>> {
  const rows = await queryAll<{ code: string }>(
    `SELECT p.code
     FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ?`,
    [roleId],
  );
  return new Set(rows.map((row) => row.code));
}

async function actorPermissions(actorId: number): Promise<Set<string>> {
  const rows = await queryAll<{ code: string }>(
    `SELECT DISTINCT p.code
     FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     INNER JOIN user_roles ur ON ur.role_id = rp.role_id
     WHERE ur.user_id = ?`,
    [actorId],
  );
  return new Set(rows.map((row) => row.code));
}

function isSubset(target: Set<string>, ceiling: Set<string>) {
  return [...target].every((permission) => ceiling.has(permission));
}

/** Keeps role assignment policy in one backend boundary for create, update, and UI discovery. */
export async function canAssignRole(actor: RoleAssignmentActor, targetRole: AssignableRole): Promise<boolean> {
  if (actor.role === 'admin') return true;
  if (targetRole.code === 'admin') return false;
  return isSubset(await rolePermissions(targetRole.id), await actorPermissions(actor.id));
}

export async function getAssignableRoles(actor: RoleAssignmentActor): Promise<AssignableRole[]> {
  const roles = await queryAll<AssignableRole>('SELECT id, code, name FROM roles ORDER BY id');
  if (actor.role === 'admin') return roles;
  const ceiling = await actorPermissions(actor.id);
  const result: AssignableRole[] = [];
  for (const role of roles) {
    if (role.code !== 'admin' && isSubset(await rolePermissions(role.id), ceiling)) result.push(role);
  }
  return result;
}

export async function assertAssignableRole(actor: RoleAssignmentActor, targetRole: AssignableRole): Promise<void> {
  if (!await canAssignRole(actor, targetRole)) {
    const error = new Error('ROLE_ASSIGNMENT_FORBIDDEN');
    error.name = 'RoleAssignmentForbiddenError';
    throw error;
  }
}
