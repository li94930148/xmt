import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Archive,
  BarChart3,
  Calendar,
  Camera,
  FileText,
  GitBranch,
  Kanban,
  LayoutDashboard,
  Lightbulb,
  Settings,
  Send,
  Shield,
  TrendingUp,
  Trophy,
  Users,
  Video,
} from 'lucide-react';

export interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  permissions?: string[];
  requireAllPermissions?: boolean;
}

export interface NavigationSection {
  label: string;
  items: NavigationItem[];
}

export const navigationSections: NavigationSection[] = [
  {
    label: '总览',
    items: [{ id: 'home', label: '首页仪表盘', icon: LayoutDashboard, path: '/' }],
  },
  {
    label: '内容流程',
    items: [
      { id: 'topics', label: '选题管理', icon: FileText, path: '/topics' },
      { id: 'production', label: '创作管理', icon: Video, path: '/production' },
      { id: 'shooting', label: '成片制作', icon: Camera, path: '/shooting', permissions: ['workflow:shooting'] },
      { id: 'publishing', label: '发布管理', icon: Send, path: '/publishing', permissions: ['workflow:publishing'] },
      { id: 'workflow-designer', label: '审批流设计', icon: GitBranch, path: '/workflow-designer', permissions: ['system:template'] },
    ],
  },
  {
    label: '效率工具',
    items: [
      { id: 'kanban', label: '看板视图', icon: Kanban, path: '/kanban' },
      { id: 'calendar', label: '排期日历', icon: Calendar, path: '/calendar' },
      { id: 'inspirations', label: '灵感池', icon: Lightbulb, path: '/inspirations' },
    ],
  },
  {
    label: '数据与管理',
    items: [
      { id: 'analytics', label: '数据复盘', icon: BarChart3, path: '/analytics', permissions: ['analytics:view'] },
      { id: 'achievements', label: '成就系统', icon: Trophy, path: '/achievements' },
      { id: 'users', label: '人员管理', icon: Users, path: '/users', permissions: ['user:view'] },
      { id: 'resources', label: '资源库', icon: Archive, path: '/resources' },
      { id: 'activity', label: '活动日志', icon: Activity, path: '/activity', permissions: ['user:logs'] },
      { id: 'douyin', label: '抖音数据', icon: TrendingUp, path: '/douyin', permissions: ['system:douyin'] },
      {
        id: 'permissions',
        label: '角色权限',
        icon: Shield,
        path: '/permissions',
        permissions: ['system:role', 'system:permission'],
        requireAllPermissions: true,
      },
      { id: 'notification-settings', label: '设置中心', icon: Settings, path: '/notification-settings' },
    ],
  },
];

export const allNavigationItems = navigationSections.flatMap((section) => section.items);

export function canAccessNavigationItem(
  item: NavigationItem,
  helpers: {
    hasAnyPermission: (codes: string[]) => boolean;
    hasAllPermissions: (codes: string[]) => boolean;
  },
) {
  if (!item.permissions || item.permissions.length === 0) {
    return true;
  }

  return item.requireAllPermissions
    ? helpers.hasAllPermissions(item.permissions)
    : helpers.hasAnyPermission(item.permissions);
}

export function isNavigationItemActive(pathname: string, itemPath: string) {
  if (itemPath === '/') {
    return pathname === '/';
  }

  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function findNavigationItem(pathname: string) {
  return allNavigationItems.find((item) => isNavigationItemActive(pathname, item.path)) || null;
}

export function buildBreadcrumbs(pathname: string) {
  const crumbs: Array<{ label: string; path?: string }> = [{ label: '工作台', path: '/' }];

  if (pathname === '/') {
    return crumbs;
  }

  const segments = pathname.split('/').filter(Boolean);
  const firstPath = `/${segments[0]}`;
  const primaryItem = allNavigationItems.find((item) => item.path === firstPath);

  if (primaryItem) {
    crumbs.push({ label: primaryItem.label, path: primaryItem.path });
  }

  if (segments.length >= 2) {
    const secondSegment = segments[1];
    crumbs.push({ label: secondSegment === 'add' ? '新建' : '详情' });
  }

  return crumbs;
}
