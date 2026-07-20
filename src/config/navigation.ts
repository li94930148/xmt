import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/types';
import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  BookOpen,
  BookOpenCheck,
  Calendar,
  Camera,
  FileBarChart,
  FileClock,
  FileText,
  GitBranch,
  History,
  Images,
  Kanban,
  LayoutDashboard,
  Lightbulb,
  PackageOpen,
  Send,
  Settings,
  Shield,
  Sparkles,
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
  roles?: UserRole[];
}

export interface NavigationSection {
  id: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
  /** 仅在管理员以 ?debug=1 进入时显示，常规导航保持收敛。 */
  debugOnly?: boolean;
  items: NavigationItem[];
}

/**
 * 一级导航定位：
 * - 首页：工作驾驶舱
 * - 内容生产：内容生命周期
 * - 资料中心：知识和资产沉淀
 * - 运营复盘：数据分析和增长
 * - 组织协作：团队协同
 * - 系统管理：管理员治理
 *
 * 技术型页面仅保留为管理员调试入口，不能占用日常导航空间。
 */
export const navigationSections: NavigationSection[] = [
  {
    id: 'home',
    label: '首页',
    icon: LayoutDashboard,
    items: [{ id: 'home', label: '首页仪表盘', icon: LayoutDashboard, path: '/' }],
  },
  {
    id: 'content-production',
    label: '内容生产',
    icon: FileText,
    items: [
      { id: 'topics', label: '选题管理', icon: FileText, path: '/topics' },
      { id: 'production', label: '创作管理', icon: Video, path: '/production' },
      { id: 'shooting', label: '成片制作', icon: Camera, path: '/shooting', permissions: ['workflow:shooting'] },
      { id: 'publishing', label: '发布管理', icon: Send, path: '/publishing', permissions: ['workflow:publishing'] },
      { id: 'content-timeline', label: '内容时间轴', icon: History, path: '/content-timeline', permissions: ['analytics:view'] },
    ],
  },
  {
    id: 'asset-center',
    label: '资料中心',
    icon: Archive,
    items: [
      { id: 'asset-center', label: '资料中心概览', icon: Archive, path: '/asset-center' },
      { id: 'project-library', label: '项目资料库', icon: PackageOpen, path: '/asset-center/projects' },
      { id: 'content-archives', label: '内容档案库', icon: FileText, path: '/resources' },
      { id: 'knowledge-base', label: '知识库', icon: BookOpen, path: '/asset-center/knowledge' },
      { id: 'media-archive', label: '素材归档', icon: Images, path: '/asset-center/media' },
    ],
  },
  {
    id: 'operations-review',
    label: '运营复盘',
    icon: BarChart3,
    items: [
      { id: 'analytics', label: '实时数据看板', icon: BarChart3, path: '/analytics', permissions: ['analytics:view'] },
      { id: 'social-review', label: '短视频复盘', icon: Video, path: '/social-review', permissions: ['analytics:view'] },
      { id: 'retrospectives', label: '复盘中心', icon: BookOpenCheck, path: '/retrospectives', permissions: ['analytics:retro:view'] },
      { id: 'export', label: '报告中心', icon: FileBarChart, path: '/export', permissions: ['export:data'] },
      { id: 'daily-report', label: '日报归档', icon: FileClock, path: '/daily-report' },
    ],
  },
  {
    id: 'organization-collaboration',
    label: '组织协作',
    icon: Users,
    items: [
      { id: 'messages', label: '消息中心', icon: Bell, path: '/messages' },
      { id: 'calendar', label: '排期日历', icon: Calendar, path: '/calendar' },
      { id: 'kanban', label: '创意看板', icon: Kanban, path: '/kanban' },
      { id: 'inspirations', label: '灵感库', icon: Lightbulb, path: '/inspirations' },
      { id: 'achievements', label: '团队成就', icon: Trophy, path: '/achievements' },
    ],
  },
  {
    id: 'system-management',
    label: '系统管理',
    icon: Settings,
    roles: ['admin'],
    items: [
      { id: 'users', label: '组织权限', icon: Users, path: '/users', permissions: ['user:view'] },
      { id: 'permissions', label: '角色权限', icon: Shield, path: '/permissions', permissions: ['system:role', 'system:permission'], requireAllPermissions: true },
      { id: 'workflow-designer', label: '审批流设计', icon: GitBranch, path: '/workflow-designer', permissions: ['system:template'] },
      { id: 'notification-settings', label: '系统配置', icon: Settings, path: '/notification-settings' },
      { id: 'backup', label: '备份管理', icon: Archive, path: '/backup', permissions: ['system:backup'] },
      { id: 'activity', label: '活动日志', icon: Activity, path: '/activity', permissions: ['user:logs'] },
      // TODO: 独立运维中心就绪后在此接入服务状态、定时任务、队列与系统健康能力。
    ],
  },
  {
    id: 'debug-tools',
    label: '调试入口',
    icon: Settings,
    roles: ['admin'],
    debugOnly: true,
    items: [
      { id: 'collaboration-dashboard', label: '协作仪表盘', icon: BarChart3, path: '/collaboration-dashboard', permissions: ['analytics:view'] },
      { id: 'collaboration-ux', label: '协作体验面板', icon: Users, path: '/collaboration-ux', permissions: ['analytics:view'] },
      { id: 'content-intelligence', label: '内容智能面板', icon: BookOpenCheck, path: '/content-intelligence', permissions: ['analytics:view'] },
      { id: 'content-generation', label: '内容生成面板', icon: Sparkles, path: '/content-generation', permissions: ['analytics:view'] },
      { id: 'content-os', label: '内容操作系统', icon: LayoutDashboard, path: '/content-os', permissions: ['analytics:view'] },
      { id: 'douyin', label: '抖音技术入口', icon: Video, path: '/douyin', permissions: ['system:douyin'] },
      { id: 'pomodoro', label: '专注计时器', icon: FileClock, path: '/pomodoro' },
    ],
  },
];

export const allNavigationItems = navigationSections.flatMap((section) => section.items);

export function canAccessNavigationSection(section: NavigationSection, role?: UserRole) {
  return !section.roles || (role ? section.roles.includes(role) : false);
}

export function findNavigationSectionByPath(pathname: string) {
  return navigationSections.find((section) => section.items.some((item) => isNavigationItemActive(pathname, item.path))) || null;
}

export function canAccessNavigationItem(
  item: NavigationItem,
  helpers: { hasAnyPermission: (codes: string[]) => boolean; hasAllPermissions: (codes: string[]) => boolean },
  role?: UserRole,
) {
  if (item.roles && (!role || !item.roles.includes(role))) return false;
  if (!item.permissions || item.permissions.length === 0) return true;
  return item.requireAllPermissions ? helpers.hasAllPermissions(item.permissions) : helpers.hasAnyPermission(item.permissions);
}

export function isNavigationItemActive(pathname: string, itemPath: string) {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function findNavigationItem(pathname: string) {
  return allNavigationItems.find((item) => isNavigationItemActive(pathname, item.path)) || null;
}

export function buildBreadcrumbs(pathname: string) {
  const activeSection = navigationSections.find((section) => section.items.some((item) => isNavigationItemActive(pathname, item.path)));
  const activeItem = activeSection?.items.find((item) => isNavigationItemActive(pathname, item.path));
  const crumbs: Array<{ label: string; path?: string }> = [{ label: '首页', path: '/' }];

  if (pathname === '/') return crumbs;
  if (activeSection) crumbs.push({ label: activeSection.label });
  if (activeItem) crumbs.push({ label: activeItem.label, path: activeItem.path });
  if (pathname.split('/').filter(Boolean).length >= 2 && activeItem?.path !== pathname) crumbs.push({ label: '详情' });
  return crumbs;
}
