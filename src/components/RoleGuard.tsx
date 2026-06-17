import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import type { UserRole } from '../types';
import AccessDeniedState from './AccessDeniedState';

interface RoleGuardProps {
  roles?: UserRole[];
  permissions?: string[];
  requireAll?: boolean;
}

export default function RoleGuard({ roles, permissions, requireAll = false }: RoleGuardProps) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const { loading, hasAnyPermission, hasAllPermissions } = usePermission();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (permissions && permissions.length > 0) {
    if (loading) {
      return null;
    }

    const hasRequiredPermission = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);

    if (!hasRequiredPermission) {
      return (
        <AccessDeniedState
          title="你暂时没有访问这个页面的权限"
          description={`当前页面需要额外的访问权限。已为你保留登录状态，你可以返回上一页、回到首页，或进入设置中心处理个人资料与通知偏好。`}
        />
      );
    }
  } else if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return (
      <AccessDeniedState
        title="当前角色无法访问这个页面"
        description="你的账号已登录成功，但当前角色还不能访问这里。若这不是预期结果，请联系管理员检查角色分配。"
      />
    );
  }

  return <Outlet />;
}
