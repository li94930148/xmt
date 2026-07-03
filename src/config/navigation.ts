import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  BookOpenCheck,
  Calendar,
  Camera,
  FileBarChart,
  FileClock,
  FileText,
  GitBranch,
  History,
  Kanban,
  LayoutDashboard,
  Lightbulb,
  Send,
  Settings,
  Shield,
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
    label: '工作台',
    items: [
      { id: 'home', label: '首页仪表盘', icon: LayoutDashboard, path: '/' },
      { id: 'messages', label: '消息中心', icon: Bell, path: '/messages' },
      { id: 'calendar', label: '排期日历', icon: Calendar, path: '/calendar' },
    ],
  },
  {
    label: '内容生产',
    items: [
      { id: 'topics', label: '选题管理', icon: FileText, path: '/topics' },
      { id: 'production', label: '创作管理', icon: Video, path: '/production' },
      { id: 'shooting', label: '成片制作', icon: Camera, path: '/shooting', permissions: ['workflow:shooting'] },
      { id: 'publishing', label: '发布管理', icon: Send, path: '/publishing', permissions: ['workflow:publishing'] },
      { id: 'workflow-designer', label: '审批流设计', icon: GitBranch, path: '/workflow-designer', permissions: ['system:template'] },
    ],
  },
  {
    label: '创意工具',
    items: [
      { id: 'kanban', label: '看板视图', icon: Kanban, path: '/kanban' },
      { id: 'inspirations', label: '灵感池', icon: Lightbulb, path: '/inspirations' },
    ],
  },
  {
    label: '数据与复盘',
    items: [
      { id: 'analytics', label: '实时数据看板', icon: BarChart3, path: '/analytics', permissions: ['analytics:view'] },
      { id: 'retrospectives', label: '复盘中心', icon: BookOpenCheck, path: '/retrospectives', permissions: ['analytics:retro:view'] },
      { id: 'content-timeline', label: '内容时间轴', icon: History, path: '/content-timeline', permissions: ['analytics:view'] },
      { id: 'export', label: '报告中心', icon: FileBarChart, path: '/export', permissions: ['export:data'] },
      { id: 'daily-report', label: '日报中心', icon: FileClock, path: '/daily-report' },
    ],
  },
  {
    label: '系统治理',
    items: [
      { id: 'users', label: '人员管理', icon: Users, path: '/users', permissions: ['user:view'] },
      {
        id: 'permissions',
        label: '角色权限',
        icon: Shield,
        path: '/permissions',
        permissions: ['system:role', 'system:permission'],
        requireAllPermissions: true,
      },
      { id: 'notification-settings', label: '系统设置', icon: Settings, path: '/notification-settings' },
      { id: 'backup', label: '备份与日志', icon: Archive, path: '/backup', permissions: ['system:backup'] },
      { id: 'activity', label: '活动日志', icon: Activity, path: '/activity', permissions: ['user:logs'] },
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
