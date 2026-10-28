import { useState, useEffect, useRef, useCallback } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { useAppStore, useAuthStore } from '../store';
import { emitClientLog, safeClientErrorClass } from '../observability/client-logger';
import {
  Shield, Users, Settings, Plus, Trash2, Edit2, X, ChevronDown, ChevronRight
} from 'lucide-react';
import ConfirmModal from '../components/common/ConfirmModal';
import LoadingState from '../components/common/LoadingState';
import ActionButton from '../components/studio/ActionButton';

interface Role {
  id: number;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  user_count: number;
  permission_count: number;
  permissions: Permission[];
}

interface Permission {
  id: number;
  code: string;
  name: string;
  module: string;
}

interface PendingRoleVerification {
  roleId: number;
  name: string;
  description: string;
  permissionIds: number[];
  readError: string | null;
  observedRole: Role | null;
}

interface PendingRoleCreateVerification {
  code: string;
  name: string;
  description: string;
  permissionIds: number[];
  readError: string | null;
  observedRole: Role | null;
  notFound: boolean;
}

interface PendingRoleDeleteVerification {
  roleId: number;
  name: string;
  readError: string | null;
  observedRole: Role | null;
}

function loadPendingRoleVerification(userId: number | undefined): PendingRoleVerification | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`xmt:role-update-pending:v1:user:${userId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingRoleVerification>;
    if (!Number.isInteger(value.roleId) || Number(value.roleId) <= 0
      || typeof value.name !== 'string' || typeof value.description !== 'string'
      || !Array.isArray(value.permissionIds)
      || !value.permissionIds.every((id) => Number.isInteger(id) && Number(id) > 0)) return null;
    return {
      roleId: Number(value.roleId),
      name: value.name,
      description: value.description,
      permissionIds: value.permissionIds as number[],
      readError: null,
      observedRole: null,
    };
  } catch {
    return null;
  }
}

function loadPendingRoleCreateVerification(userId: number | undefined): PendingRoleCreateVerification | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`xmt:role-create-pending:v1:user:${userId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingRoleCreateVerification>;
    if (typeof value.code !== 'string' || !value.code.trim()
      || typeof value.name !== 'string' || !value.name.trim()
      || typeof value.description !== 'string'
      || !Array.isArray(value.permissionIds)
      || !value.permissionIds.every((id) => Number.isInteger(id) && Number(id) > 0)) return null;
    return {
      code: value.code,
      name: value.name,
      description: value.description,
      permissionIds: value.permissionIds as number[],
      readError: null,
      observedRole: null,
      notFound: false,
    };
  } catch {
    return null;
  }
}

function loadPendingRoleDeleteVerification(userId: number | undefined): PendingRoleDeleteVerification | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`xmt:role-delete-pending:v1:user:${userId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingRoleDeleteVerification>;
    if (!Number.isInteger(value.roleId) || Number(value.roleId) <= 0 || typeof value.name !== 'string') return null;
    return { roleId: Number(value.roleId), name: value.name, readError: null, observedRole: null };
  } catch {
    return null;
  }
}

async function getResponseMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return typeof data?.message === 'string' && data.message.trim() ? data.message : fallback;
  } catch {
    return fallback;
  }
}

export default function PermissionManagement() {
  const styles = useThemeStyles();
  const addNotification = useAppStore((state) => state.addNotification);
  const { hasPermission } = usePermission();
  const authUserId = useAuthStore((state) => state.user?.id);
  const token = useAuthStore((state) => state.token);

  const [roles, setRoles] = useState<Role[]>([]);
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, Permission[]>>({});
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmedWriteNotice, setConfirmedWriteNotice] = useState<string | null>(null);
  const [pendingRoleVerification, setPendingRoleVerification] = useState<PendingRoleVerification | null>(() => loadPendingRoleVerification(authUserId));
  const [pendingRoleCreateVerification, setPendingRoleCreateVerification] = useState<PendingRoleCreateVerification | null>(() => loadPendingRoleCreateVerification(authUserId));
  const [pendingRoleDeleteVerification, setPendingRoleDeleteVerification] = useState<PendingRoleDeleteVerification | null>(() => loadPendingRoleDeleteVerification(authUserId));
  const [roleVerificationBusy, setRoleVerificationBusy] = useState(false);
  const [roleCreateVerificationBusy, setRoleCreateVerificationBusy] = useState(false);
  const [roleDeleteVerificationBusy, setRoleDeleteVerificationBusy] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({ code: '', name: '', description: '', permission_ids: [] as number[] });
  const loadLockRef = useRef(false);
  const mutationLockRef = useRef(false);
  const roleVerificationLockRef = useRef(false);
  const roleCreateVerificationLockRef = useRef(false);
  const roleDeleteVerificationLockRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (loadLockRef.current) return false;
    loadLockRef.current = true;
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch('/api/roles', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/permissions', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!rolesRes.ok) throw new Error(await getResponseMessage(rolesRes, '角色列表加载失败，请重试。'));
      if (!permsRes.ok) throw new Error(await getResponseMessage(permsRes, '权限清单加载失败，请重试。'));

      const [rolesData, permsData] = await Promise.all([rolesRes.json(), permsRes.json()]);
      if (!Array.isArray(rolesData) || !Array.isArray(permsData?.permissions) || !permsData?.grouped || typeof permsData.grouped !== 'object') {
        throw new Error('角色或权限清单格式异常，请重新加载。');
      }
      setRoles(rolesData);
      setGroupedPermissions(permsData.grouped);
      // 默认展开所有模块
      setExpandedModules(new Set(Object.keys(permsData.grouped)));
      setHasLoadedOnce(true);
      setLoadError(null);
      setConfirmedWriteNotice(null);
      return true;
    } catch (error) {
      emitClientLog({ event: 'permissions.management_load_failed', level: 'error', fields: { errorClass: safeClientErrorClass(error) } });
      const message = error instanceof TypeError
        ? '暂时无法连接，角色与权限列表未加载；请检查网络后重试。'
        : error instanceof SyntaxError
          ? '角色与权限数据暂时无法读取，请重新加载。'
          : error instanceof Error
            ? error.message
            : '角色权限信息加载失败，请重试。';
      setLoadError(message);
      return false;
    } finally {
      loadLockRef.current = false;
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!authUserId) return;
    const key = `xmt:role-update-pending:v1:user:${authUserId}`;
    try {
      if (!pendingRoleVerification) {
        sessionStorage.removeItem(key);
        return;
      }
      sessionStorage.setItem(key, JSON.stringify({
        roleId: pendingRoleVerification.roleId,
        name: pendingRoleVerification.name,
        description: pendingRoleVerification.description,
        permissionIds: pendingRoleVerification.permissionIds,
      }));
    } catch {
      // In-memory locking remains active if this tab cannot persist session recovery state.
    }
  }, [authUserId, pendingRoleVerification]);

  useEffect(() => {
    if (!authUserId) return;
    const key = `xmt:role-create-pending:v1:user:${authUserId}`;
    try {
      if (!pendingRoleCreateVerification) {
        sessionStorage.removeItem(key);
        return;
      }
      sessionStorage.setItem(key, JSON.stringify({
        code: pendingRoleCreateVerification.code,
        name: pendingRoleCreateVerification.name,
        description: pendingRoleCreateVerification.description,
        permissionIds: pendingRoleCreateVerification.permissionIds,
      }));
    } catch {
      // In-memory locking remains active if this tab cannot persist session recovery state.
    }
  }, [authUserId, pendingRoleCreateVerification]);

  useEffect(() => {
    if (!authUserId) return;
    const key = `xmt:role-delete-pending:v1:user:${authUserId}`;
    try {
      if (!pendingRoleDeleteVerification) {
        sessionStorage.removeItem(key);
        return;
      }
      sessionStorage.setItem(key, JSON.stringify({
        roleId: pendingRoleDeleteVerification.roleId,
        name: pendingRoleDeleteVerification.name,
      }));
    } catch {
      // In-memory locking remains active if this tab cannot persist session recovery state.
    }
  }, [authUserId, pendingRoleDeleteVerification]);

  const handleCreateRole = async () => {
    if (mutationLockRef.current || pendingRoleVerification || pendingRoleCreateVerification || pendingRoleDeleteVerification || loadError || confirmedWriteNotice) return;
    mutationLockRef.current = true;
    setMutationBusy(true);
    try {
      const response = await fetch('/api/roles', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        if (response.status >= 500) {
          setPendingRoleCreateVerification({
            code: formData.code,
            name: formData.name,
            description: formData.description,
            permissionIds: [...formData.permission_ids],
            readError: null,
            observedRole: null,
            notFound: false,
          });
          return;
        }
        addNotification({ title: '创建失败', message: await getResponseMessage(response, '角色创建失败，请重试。'), type: 'error' });
        return;
      }

      addNotification({ title: '创建成功', message: '服务器已确认角色创建', type: 'success' });
      setShowCreateForm(false);
      setFormData({ code: '', name: '', description: '', permission_ids: [] });
      const refreshed = await fetchData();
      if (!refreshed) setConfirmedWriteNotice('服务器已确认角色创建，但列表刷新失败；请重新加载确认，不要重复创建。');
    } catch {
      setPendingRoleCreateVerification({
        code: formData.code,
        name: formData.name,
        description: formData.description,
        permissionIds: [...formData.permission_ids],
        readError: null,
        observedRole: null,
        notFound: false,
      });
    } finally {
      mutationLockRef.current = false;
      setMutationBusy(false);
    }
  };

  const verifyPendingRoleCreate = async () => {
    const pending = pendingRoleCreateVerification;
    if (!pending || roleCreateVerificationLockRef.current) return;
    roleCreateVerificationLockRef.current = true;
    setRoleCreateVerificationBusy(true);
    setPendingRoleCreateVerification({ ...pending, readError: null, notFound: false });

    try {
      const response = await fetch('/api/roles', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await getResponseMessage(response, '暂时无法读取角色列表，请稍后只读重试。'));
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('角色列表格式异常，请稍后只读重试。');

      const rolesData = data as Role[];
      const validRoles = rolesData.every((role) => (
        !!role && Number.isInteger(Number(role.id)) && Number(role.id) > 0
        && typeof role.code === 'string' && typeof role.name === 'string' && typeof role.description === 'string'
        && Array.isArray(role.permissions)
        && role.permissions.every((permission) => Number.isInteger(Number(permission?.id)) && Number(permission.id) > 0)
      ));
      if (!validRoles) throw new Error('角色列表数据格式异常，请稍后只读重试。');
      const existingRole = rolesData.find((role) => role?.code === pending.code);
      setRoles(rolesData);
      if (!existingRole) {
        setPendingRoleCreateVerification({ ...pending, readError: null, observedRole: null, notFound: true });
        return;
      }
      const observedPermissionIds = existingRole.permissions.map((permission) => Number(permission.id)).sort((a, b) => a - b);
      const expectedPermissionIds = [...pending.permissionIds].sort((a, b) => a - b);
      const matches = existingRole.name === pending.name
        && existingRole.description === pending.description
        && observedPermissionIds.length === expectedPermissionIds.length
        && observedPermissionIds.every((id, index) => id === expectedPermissionIds[index]);
      if (matches) {
        setPendingRoleCreateVerification(null);
        setShowCreateForm(false);
        setFormData({ code: '', name: '', description: '', permission_ids: [] });
        addNotification({ title: '创建已确认', message: '服务器当前角色与本次创建内容一致；只读核实完成，未重复提交。', type: 'success' });
      } else {
        setPendingRoleCreateVerification({ ...pending, readError: null, observedRole: existingRole, notFound: false });
      }
    } catch (error) {
      const message = error instanceof TypeError
        ? '暂时无法连接，角色创建结果仍待确认；请只读重试核实。'
        : error instanceof Error
          ? error.message
          : '角色创建结果仍待确认；请只读重试核实。';
      setPendingRoleCreateVerification({ ...pending, readError: message, notFound: false });
    } finally {
      roleCreateVerificationLockRef.current = false;
      setRoleCreateVerificationBusy(false);
    }
  };

  const restoreUncreatedRoleForm = () => {
    const pending = pendingRoleCreateVerification;
    if (!pending?.notFound) return;
    setFormData({
      code: pending.code,
      name: pending.name,
      description: pending.description,
      permission_ids: [...pending.permissionIds],
    });
    setShowCreateForm(true);
    setPendingRoleCreateVerification(null);
    addNotification({ title: '已恢复创建内容', message: '只读列表未找到该角色，原表单已恢复；系统不会自动重试。', type: 'info' });
  };

  const acceptObservedCreatedRole = () => {
    if (!pendingRoleCreateVerification?.observedRole) return;
    setShowCreateForm(false);
    setFormData({ code: '', name: '', description: '', permission_ids: [] });
    setPendingRoleCreateVerification(null);
    addNotification({ title: '已采用服务器状态', message: '该角色编码已存在，已按服务器只读结果结束核实，没有再次创建。', type: 'info' });
  };

  const verifyPendingRoleDelete = async () => {
    const pending = pendingRoleDeleteVerification;
    if (!pending || roleDeleteVerificationLockRef.current) return;
    roleDeleteVerificationLockRef.current = true;
    setRoleDeleteVerificationBusy(true);
    setPendingRoleDeleteVerification({ ...pending, readError: null });

    try {
      const response = await fetch(`/api/roles/${pending.roleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 404) {
        setRoles((current) => current.filter((role) => role.id !== pending.roleId));
        setPendingRoleDeleteVerification(null);
        setDeletingRole(null);
        addNotification({ title: '删除已确认', message: `服务器确认角色“${pending.name}”已不存在；只读核实完成，未重复提交。`, type: 'success' });
        return;
      }
      if (!response.ok) throw new Error(await getResponseMessage(response, '暂时无法读取角色当前状态，请稍后只读重试。'));

      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') throw new Error('角色当前状态格式异常，请稍后只读重试。');
      const observedRole = data as Role;
      if (Number(observedRole.id) !== pending.roleId || typeof observedRole.code !== 'string'
        || typeof observedRole.name !== 'string' || typeof observedRole.description !== 'string'
        || !Array.isArray(observedRole.permissions)
        || !observedRole.permissions.every((permission) => Number.isInteger(Number(permission?.id)) && Number(permission.id) > 0)) {
        throw new Error('角色当前状态格式异常，请稍后只读重试。');
      }
      setRoles((current) => current.some((role) => role.id === pending.roleId)
        ? current.map((role) => role.id === pending.roleId ? { ...role, ...observedRole } : role)
        : [...current, observedRole]);
      setPendingRoleDeleteVerification({ ...pending, readError: null, observedRole });
    } catch (error) {
      const message = error instanceof TypeError
        ? '暂时无法连接，角色删除结果仍待确认；请只读重试核实。'
        : error instanceof Error
          ? error.message
          : '角色删除结果仍待确认；请只读重试核实。';
      setPendingRoleDeleteVerification({ ...pending, readError: message, observedRole: null });
    } finally {
      roleDeleteVerificationLockRef.current = false;
      setRoleDeleteVerificationBusy(false);
    }
  };

  const acceptObservedRoleAfterDelete = () => {
    if (!pendingRoleDeleteVerification?.observedRole) return;
    setPendingRoleDeleteVerification(null);
    setDeletingRole(null);
    addNotification({ title: '已采用服务器状态', message: `服务器确认角色“${pendingRoleDeleteVerification.name}”仍存在；如仍需删除，请从列表重新发起。`, type: 'info' });
  };

  const handleUpdateRole = async () => {
    if (!editingRole || mutationLockRef.current || pendingRoleVerification || pendingRoleCreateVerification || pendingRoleDeleteVerification || loadError || confirmedWriteNotice) return;
    mutationLockRef.current = true;
    setMutationBusy(true);

    try {
      const response = await fetch(`/api/roles/${editingRole.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          permission_ids: formData.permission_ids
        })
      });

      if (!response.ok) {
        if (response.status >= 500) {
          setPendingRoleVerification({
            roleId: editingRole.id,
            name: formData.name,
            description: formData.description,
            permissionIds: [...formData.permission_ids],
            readError: null,
            observedRole: null,
          });
          return;
        }
        addNotification({ title: '更新失败', message: await getResponseMessage(response, '角色更新失败，请重试。'), type: 'error' });
        return;
      }

      addNotification({ title: '更新成功', message: '服务器已确认角色更新', type: 'success' });
      setEditingRole(null);
      setFormData({ code: '', name: '', description: '', permission_ids: [] });
      const refreshed = await fetchData();
      if (!refreshed) setConfirmedWriteNotice('服务器已确认角色更新，但列表刷新失败；请重新加载确认，不要重复保存。');
    } catch {
      setPendingRoleVerification({
        roleId: editingRole.id,
        name: formData.name,
        description: formData.description,
        permissionIds: [...formData.permission_ids],
        readError: null,
        observedRole: null,
      });
    } finally {
      mutationLockRef.current = false;
      setMutationBusy(false);
    }
  };

  const verifyPendingRoleUpdate = async () => {
    const pending = pendingRoleVerification;
    if (!pending || roleVerificationLockRef.current) return;
    roleVerificationLockRef.current = true;
    setRoleVerificationBusy(true);
    setPendingRoleVerification({ ...pending, readError: null });

    try {
      const response = await fetch(`/api/roles/${pending.roleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 404) {
        setRoles((current) => current.filter((role) => role.id !== pending.roleId));
        setPendingRoleVerification(null);
        setEditingRole(null);
        setFormData({ code: '', name: '', description: '', permission_ids: [] });
        addNotification({ title: '角色已不存在', message: '服务器确认该角色已不存在；本次未重发更新。', type: 'info' });
        return;
      }
      if (!response.ok) throw new Error(await getResponseMessage(response, '暂时无法读取角色当前状态，请稍后只读重试。'));

      const data = await response.json() as Partial<Role>;
      if (Number(data.id) !== pending.roleId || typeof data.name !== 'string' || typeof data.description !== 'string' || !Array.isArray(data.permissions)) {
        throw new Error('角色当前状态格式异常，请稍后只读重试。');
      }
      const permissions = data.permissions.filter((permission): permission is Permission => (
        !!permission && Number.isInteger(Number(permission.id)) && typeof permission.name === 'string'
      ));
      if (permissions.length !== data.permissions.length) throw new Error('角色权限清单格式异常，请稍后只读重试。');
      const observedRole: Role = {
        id: pending.roleId,
        code: typeof data.code === 'string' ? data.code : editingRole?.code || '',
        name: data.name,
        description: data.description,
        is_system: Boolean(data.is_system),
        user_count: Number.isFinite(Number(data.user_count)) ? Number(data.user_count) : roles.find((role) => role.id === pending.roleId)?.user_count || 0,
        permission_count: permissions.length,
        permissions,
      };
      const observedIds = permissions.map((permission) => permission.id).sort((a, b) => a - b);
      const expectedIds = [...pending.permissionIds].sort((a, b) => a - b);
      const matches = observedRole.name === pending.name
        && observedRole.description === pending.description
        && observedIds.length === expectedIds.length
        && observedIds.every((id, index) => id === expectedIds[index]);

      if (matches) {
        setRoles((current) => current.map((role) => role.id === pending.roleId ? { ...role, ...observedRole } : role));
        setPendingRoleVerification(null);
        setEditingRole(null);
        setFormData({ code: '', name: '', description: '', permission_ids: [] });
        setConfirmedWriteNotice(null);
        addNotification({ title: '更新已确认', message: '服务器当前角色资料与本次修改一致；只读核实完成，未重复提交。', type: 'success' });
      } else {
        setPendingRoleVerification({ ...pending, readError: null, observedRole });
        setRoles((current) => current.map((role) => role.id === pending.roleId ? { ...role, ...observedRole } : role));
      }
    } catch (error) {
      const message = error instanceof TypeError
        ? '暂时无法连接，角色更新结果仍待确认；请只读重试核实。'
        : error instanceof Error
          ? error.message
          : '角色更新结果仍待确认；请只读重试核实。';
      setPendingRoleVerification({ ...pending, readError: message, observedRole: null });
    } finally {
      roleVerificationLockRef.current = false;
      setRoleVerificationBusy(false);
    }
  };

  const acceptObservedRoleAndClose = () => {
    const observedRole = pendingRoleVerification?.observedRole;
    if (!observedRole) return;
    setRoles((current) => current.map((role) => role.id === observedRole.id ? { ...role, ...observedRole } : role));
    setPendingRoleVerification(null);
    setEditingRole(null);
    setFormData({ code: '', name: '', description: '', permission_ids: [] });
    addNotification({ title: '已采用服务器状态', message: '已按只读结果退出编辑，没有再次提交角色更新。', type: 'info' });
  };

  const restoreUnappliedRoleUpdateForm = () => {
    const pending = pendingRoleVerification;
    const observedRole = pending?.observedRole;
    if (!pending || !observedRole) return;
    setEditingRole(observedRole);
    setFormData({
      code: observedRole.code,
      name: pending.name,
      description: pending.description,
      permission_ids: [...pending.permissionIds],
    });
    setPendingRoleVerification(null);
    addNotification({ title: '已恢复更新内容', message: '只读核实确认服务器尚未应用本次更新；原表单已恢复，系统不会自动重试。', type: 'info' });
  };

  const handleDeleteRole = async () => {
    const role = deletingRole;
    if (!role || mutationLockRef.current || pendingRoleVerification || pendingRoleCreateVerification || pendingRoleDeleteVerification || loadError || confirmedWriteNotice) return;
    mutationLockRef.current = true;
    setMutationBusy(true);

    try {
      const response = await fetch(`/api/roles/${role.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        if (response.status >= 500 || [408, 425, 429].includes(response.status)) {
          setPendingRoleDeleteVerification({ roleId: role.id, name: role.name, readError: null, observedRole: null });
          setDeletingRole(null);
          return;
        }
        if (response.status === 404) {
          setRoles((current) => current.filter((item) => item.id !== role.id));
          setDeletingRole(null);
          addNotification({ title: '删除已确认', message: `服务器确认角色“${role.name}”已不存在。`, type: 'success' });
          return;
        }
        addNotification({ title: '删除失败', message: await getResponseMessage(response, '角色删除失败，请重试。'), type: 'error' });
        return;
      }

      setRoles((current) => current.filter((item) => item.id !== role.id));
      addNotification({ title: '删除成功', message: `角色“${role.name}”已删除`, type: 'success' });
      setDeletingRole(null);
    } catch {
      setPendingRoleDeleteVerification({ roleId: role.id, name: role.name, readError: null, observedRole: null });
      setDeletingRole(null);
    } finally {
      mutationLockRef.current = false;
      setMutationBusy(false);
    }
  };

  const startEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      code: role.code,
      name: role.name,
      description: role.description,
      permission_ids: role.permissions.map(p => p.id)
    });
  };

  const togglePermission = (permId: number) => {
    setFormData(prev => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(permId)
        ? prev.permission_ids.filter(id => id !== permId)
        : [...prev.permission_ids, permId]
    }));
  };

  const toggleModule = (module: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(module)) {
        next.delete(module);
      } else {
        next.add(module);
      }
      return next;
    });
  };

  const selectAllModule = (module: string) => {
    const modulePerms = groupedPermissions[module] || [];
    const moduleIds = modulePerms.map(p => p.id);
    const allSelected = moduleIds.every(id => formData.permission_ids.includes(id));

    setFormData(prev => ({
      ...prev,
      permission_ids: allSelected
        ? prev.permission_ids.filter(id => !moduleIds.includes(id))
        : [...new Set([...prev.permission_ids, ...moduleIds])]
    }));
  };

  const getModuleLabel = (module: string): string => {
    const labels: Record<string, string> = {
      topic: '选题管理',
      workflow: '工作流',
      user: '用户管理',
      analytics: '数据分析',
      export: '数据导出',
      system: '系统管理'
    };
    return labels[module] || module;
  };

  const mutationsLocked = loading || mutationBusy || roleVerificationBusy || roleCreateVerificationBusy || roleDeleteVerificationBusy || !!loadError || !!confirmedWriteNotice || !!pendingRoleVerification || !!pendingRoleCreateVerification || !!pendingRoleDeleteVerification;

  const roleCreateVerificationAlert = pendingRoleCreateVerification && (
    <div role="alert" className={`flex flex-col gap-3 rounded-xl border p-4 ${styles.border} ${styles.card}`}>
      <p className={styles.textSecondary}>
        {pendingRoleCreateVerification.readError
          ? pendingRoleCreateVerification.readError
          : pendingRoleCreateVerification.observedRole
            ? `服务器中已存在编码“${pendingRoleCreateVerification.code}”的角色“${pendingRoleCreateVerification.observedRole.name}”，但名称、描述或权限集合与本次创建不一致。页面已显示服务器当前值，不会自动覆盖或重发。`
            : pendingRoleCreateVerification.notFound
              ? `只读读取的服务器角色列表中未找到编码“${pendingRoleCreateVerification.code}”。系统不会自动重发；角色编码在服务器端唯一，你可以恢复原表单后手动重试。`
              : '角色创建结果尚未确认。请只读核实服务器角色列表；核实期间所有角色写入均已暂停。'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { void verifyPendingRoleCreate(); }}
          disabled={roleCreateVerificationBusy}
          className={`rounded-xl px-4 py-2 ${styles.buttonSecondary}`}
        >
          {roleCreateVerificationBusy ? '正在只读核实…' : '只读核实创建结果'}
        </button>
        {pendingRoleCreateVerification.notFound && (
          <ActionButton
            type="button"
            variant="secondary"
            onClick={restoreUncreatedRoleForm}
            disabled={roleCreateVerificationBusy}
          >
            恢复原表单后手动重试
          </ActionButton>
        )}
        {pendingRoleCreateVerification.observedRole && (
          <button
            type="button"
            onClick={acceptObservedCreatedRole}
            disabled={roleCreateVerificationBusy}
            className={`rounded-xl px-4 py-2 ${styles.buttonSecondary}`}
          >
            采用服务器当前状态并结束核实
          </button>
        )}
      </div>
    </div>
  );

  const roleVerificationAlert = pendingRoleVerification && (
    <div role="alert" className={`flex flex-col gap-3 rounded-xl border p-4 ${styles.border} ${styles.card}`}>
      <p className={styles.textSecondary}>
        {pendingRoleVerification.readError
          ? pendingRoleVerification.readError
          : pendingRoleVerification.observedRole
            ? `已读取服务器角色“${pendingRoleVerification.observedRole.name}”，但名称、描述或权限集合与本次修改不一致。页面已显示服务器当前值，不会自动覆盖或重发。`
            : '角色更新结果尚未确认。请只读核实服务器当前角色状态；核实完成前，所有角色写入均已暂停。'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { void verifyPendingRoleUpdate(); }}
          disabled={roleVerificationBusy}
          className={`rounded-xl px-4 py-2 ${styles.buttonSecondary}`}
        >
          {roleVerificationBusy ? '正在只读核实…' : '只读核实角色权限'}
        </button>
        {pendingRoleVerification.observedRole && (
          <>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={restoreUnappliedRoleUpdateForm}
              disabled={roleVerificationBusy}
            >
              恢复原表单后手动重试
            </ActionButton>
            <button
              type="button"
              onClick={acceptObservedRoleAndClose}
              disabled={roleVerificationBusy}
              className={`rounded-xl px-4 py-2 ${styles.buttonSecondary}`}
            >
              采用服务器当前状态并退出编辑
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (loading && !hasLoadedOnce) {
    return <LoadingState type="inline" text="正在加载角色权限…" className="flex h-64 w-full justify-center" />;
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={styles.pageTitle}>角色权限管理</h1>
          <p className={styles.subtitle}>管理系统角色和权限分配</p>
        </div>
        {hasPermission('system:role') && (
          <button
            onClick={() => { setShowCreateForm(true); setFormData({ code: '', name: '', description: '', permission_ids: [] }); }}
            disabled={mutationsLocked}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl ${styles.buttonPrimary}`}
          >
            <Plus className="w-4 h-4" />
            新建角色
          </button>
        )}
      </div>

      {(loadError || confirmedWriteNotice) && (
        <div role="alert" className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${styles.border} ${styles.card}`}>
          <p className={styles.textSecondary}>{confirmedWriteNotice || loadError}</p>
          <button
            type="button"
            onClick={() => { void fetchData(); }}
            disabled={loading}
            className={`shrink-0 rounded-xl px-4 py-2 ${styles.buttonSecondary}`}
          >
            {loading ? '正在重新加载…' : '重新加载角色列表'}
          </button>
        </div>
      )}

      {pendingRoleVerification && !editingRole && roleVerificationAlert}

      {pendingRoleCreateVerification && !showCreateForm && roleCreateVerificationAlert}

      {pendingRoleDeleteVerification && (
        <div role="alert" className={`flex flex-col gap-3 rounded-xl border p-4 ${styles.border} ${styles.card}`}>
          <p className={styles.textSecondary}>
            {pendingRoleDeleteVerification.readError
              ? pendingRoleDeleteVerification.readError
              : pendingRoleDeleteVerification.observedRole
                ? `服务器仍存在角色“${pendingRoleDeleteVerification.observedRole.name}”，本次删除尚未得到确认。页面已显示服务器当前资料，不会自动重发。`
                : '角色删除结果尚未确认。请只读核实服务器当前角色状态；核实期间所有角色写入均已暂停。'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void verifyPendingRoleDelete(); }}
              disabled={roleDeleteVerificationBusy}
              className={`rounded-xl px-4 py-2 ${styles.buttonSecondary}`}
            >
              {roleDeleteVerificationBusy ? '正在只读核实…' : '只读核实删除结果'}
            </button>
            {pendingRoleDeleteVerification.observedRole && (
              <button
                type="button"
                onClick={acceptObservedRoleAfterDelete}
                disabled={roleDeleteVerificationBusy}
                className={`rounded-xl px-4 py-2 ${styles.buttonSecondary}`}
              >
                采用服务器当前状态并结束核实
              </button>
            )}
          </div>
        </div>
      )}

      {hasLoadedOnce && !loading && roles.length === 0 && !loadError && (
        <div className={`rounded-2xl p-8 text-center ${styles.card} ${styles.textMuted}`}>
          暂无角色
        </div>
      )}

      {/* 角色列表 */}
      <div className="grid gap-4">
        {roles.map(role => (
          <div key={role.id} className={`p-4 rounded-2xl ${styles.card}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <div data-testid={`role-icon-${role.code}`} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  role.code === 'admin' ? 'bg-studio-primary-soft text-studio-primary-contrast' :
                  role.code === 'director' ? 'bg-studio-success/10 text-studio-success-contrast' :
                  'bg-theme-tertiary text-theme-text-secondary'
                }`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span data-testid="role-name" className={`font-medium ${styles.textPrimary}`}>{role.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${styles.bgTertiary} ${styles.textMuted}`}>
                      {role.code}
                    </span>
                    {role.is_system && (
                      <span data-testid="system-role-badge" className="text-xs px-2 py-0.5 rounded-full bg-studio-primary-soft text-studio-primary-contrast">
                        系统内置
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${styles.textMuted}`}>{role.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
                <div className="flex flex-wrap items-center gap-3 text-sm sm:gap-4">
                  <span className={styles.textMuted}>
                    <Users className="w-4 h-4 inline mr-1" />
                    {role.user_count} 用户
                  </span>
                  <span className={styles.textMuted}>
                    <Settings className="w-4 h-4 inline mr-1" />
                    {role.permission_count} 权限
                  </span>
                </div>
                {hasPermission('system:role') && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(role)}
                      disabled={mutationsLocked}
                      className={`p-2 rounded-lg ${styles.hoverBg} ${styles.textMuted}`}
                      title="编辑"
                      aria-label={`编辑角色 ${role.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {!role.is_system && (
                      <button
                        onClick={() => setDeletingRole(role)}
                        disabled={mutationsLocked}
                        className="p-2 rounded-lg text-studio-coral-contrast hover:bg-studio-coral-soft"
                        title="删除"
                        aria-label={`删除角色 ${role.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 权限标签 */}
            {role.permissions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {role.permissions.slice(0, 10).map(perm => (
                  <span key={perm.id} className={`text-xs px-2 py-1 rounded-lg ${styles.bgTertiary} ${styles.textMuted}`}>
                    {perm.name}
                  </span>
                ))}
                {role.permissions.length > 10 && (
                  <span className={`text-xs px-2 py-1 rounded-lg ${styles.bgTertiary} ${styles.textMuted}`}>
                    +{role.permissions.length - 10} 更多
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 创建/编辑弹窗 */}
      {(showCreateForm || editingRole) && (
        <div role="dialog" aria-modal="true" aria-labelledby="role-management-form-title" className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-modal">
          <div className={`w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl ${styles.modal} p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h2 id="role-management-form-title" className={`text-xl font-bold ${styles.textPrimary}`}>
                {editingRole ? '编辑角色' : '新建角色'}
              </h2>
              <button
                onClick={() => { if (!mutationsLocked) { setShowCreateForm(false); setEditingRole(null); } }}
                disabled={mutationsLocked}
                className={`p-2 rounded-lg ${styles.hoverBg} ${styles.textMuted}`}
                aria-label="关闭角色编辑"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editingRole && pendingRoleVerification && roleVerificationAlert}
            {showCreateForm && pendingRoleCreateVerification && roleCreateVerificationAlert}

            <div className="space-y-4">
              {/* 角色信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>角色编码</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    disabled={!!editingRole || mutationsLocked}
                    className={`w-full px-4 py-2 rounded-xl ${styles.input}`}
                    placeholder="如 editor"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>角色名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    disabled={mutationsLocked}
                    className={`w-full px-4 py-2 rounded-xl ${styles.input}`}
                    placeholder="如 编辑"
                  />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>描述</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  disabled={mutationsLocked}
                  className={`w-full px-4 py-2 rounded-xl ${styles.input}`}
                  placeholder="角色描述"
                />
              </div>

              {/* 权限选择 */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>权限分配</label>
                <div className={`border rounded-xl ${styles.border} overflow-hidden`}>
                  {Object.entries(groupedPermissions).map(([module, perms]) => (
                    <div key={module} className="border-b last:border-b-0 border-inherit">
                      <div
                        className={`flex items-center justify-between px-4 py-3 cursor-pointer ${styles.hoverBg}`}
                        onClick={() => toggleModule(module)}
                      >
                        <div className="flex items-center gap-2">
                          {expandedModules.has(module) ? (
                            <ChevronDown className="w-4 h-4 text-theme-text-muted" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-theme-text-muted" />
                          )}
                          <span className={`font-medium ${styles.textPrimary}`}>{getModuleLabel(module)}</span>
                          <span className={`text-xs ${styles.textMuted}`}>
                            ({perms.filter(p => formData.permission_ids.includes(p.id)).length}/{perms.length})
                          </span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); selectAllModule(module); }}
                          disabled={mutationsLocked}
                          className={`text-xs px-2 py-1 rounded ${styles.hoverBg} ${styles.textMuted}`}
                        >
                          {perms.every(p => formData.permission_ids.includes(p.id)) ? '取消全选' : '全选'}
                        </button>
                      </div>
                      {expandedModules.has(module) && (
                        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                          {perms.map(perm => (
                            <label
                              key={perm.id}
                              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${styles.hoverBg}`}
                            >
                              <input
                                type="checkbox"
                                checked={formData.permission_ids.includes(perm.id)}
                                onChange={() => togglePermission(perm.id)}
                                disabled={mutationsLocked}
                                className="rounded border-studio-border-soft"
                              />
                              <span className={`text-sm ${styles.textPrimary}`}>{perm.name}</span>
                              <span className={`text-xs ${styles.textMuted}`}>{perm.code}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => { if (!mutationsLocked) { setShowCreateForm(false); setEditingRole(null); } }}
                  disabled={mutationsLocked}
                  className={`px-4 py-2 rounded-xl ${styles.buttonSecondary}`}
                >
                  取消
                </button>
                <button
                  onClick={editingRole ? handleUpdateRole : handleCreateRole}
                  disabled={mutationsLocked}
                  className={`px-4 py-2 rounded-xl ${styles.buttonPrimary}`}
                >
                  {mutationBusy ? '处理中…' : roleVerificationBusy ? '正在只读核实…' : editingRole ? '保存' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deletingRole}
        title="确认删除角色"
        description={deletingRole ? `将删除角色“${deletingRole.name}”。此操作不可撤销。` : undefined}
        confirmText="删除角色"
        cancelText="取消"
        variant="danger"
        loading={mutationBusy}
        onCancel={() => { if (!mutationBusy) setDeletingRole(null); }}
        onConfirm={handleDeleteRole}
      />
    </div>
  );
}
