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
  LayoutDashboard,
  Lightbulb,
  PackageOpen,
  Send,
  Search,
  Settings,
  Shield,
  Users,
  Video,
  Database,
  ListFilter,
  Inbox,
  ShieldCheck,
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
 * - 工作台：个人任务与提醒
 * - 内容生产：内容生命周期
 * - 资料中心：知识和资产沉淀
 * - 运营数据：数据分析和增长
 * - 系统管理：管理员治理
 *
 * 技术型内容分析集中在管理员「系统管理 → 内容实验室」，不占用日常导航空间。
 */
export const navigationSections: NavigationSection[] = [
  {
    id: 'home',
    label: '工作台',
    icon: LayoutDashboard,
    items: [
      { id: 'home', label: '工作台', icon: LayoutDashboard, path: '/' },
      { id: 'messages', label: '消息中心', icon: Bell, path: '/messages' },
      { id: 'daily-reports', label: '日报与总结', icon: FileClock, path: '/daily-report' },
    ],
  },
  {
    id: 'content-production',
    label: '内容生产',
    icon: FileText,
    items: [
      { id: 'inspirations', label: '灵感库', icon: Lightbulb, path: '/inspirations' },
      { id: 'topics', label: '选题管理', icon: FileText, path: '/topics' },
      { id: 'production', label: '创作管理', icon: Video, path: '/production' },
      { id: 'shooting', label: '成片制作', icon: Camera, path: '/shooting', permissions: ['workflow:shooting'] },
      { id: 'calendar', label: '排期日历', icon: Calendar, path: '/calendar' },
      { id: 'publishing', label: '发布管理', icon: Send, path: '/publishing', permissions: ['workflow:publishing'] },
      { id: 'content-timeline', label: '内容动态', icon: History, path: '/content-timeline', permissions: ['analytics:view'] },
    ],
  },
  {
    id: 'asset-center',
    label: '资料与资产',
    icon: Archive,
    items: [
      { id: 'asset-center', label: '资料中心概览', icon: Archive, path: '/asset-center' },
      { id: 'project-library', label: '项目资料库', icon: PackageOpen, path: '/asset-center/projects' },
      { id: 'content-archives', label: '内容档案库', icon: FileText, path: '/asset-center/resources?library_type=content_archive' },
      { id: 'published-archives', label: '发布归档', icon: Send, path: '/asset-center/published-archives' },
      { id: 'resource-search', label: '资料搜索', icon: Search, path: '/asset-center/search' },
      { id: 'knowledge-base', label: '知识库', icon: BookOpen, path: '/asset-center/knowledge' },
      { id: 'media-archive', label: '素材归档', icon: Images, path: '/asset-center/media' },
    ],
  },
  {
    id: 'douyin-operations',
    label: '运营数据',
    icon: BarChart3,
    items: [
      { id: 'creator-dashboard', label: '运营概览', icon: Database, path: '/analytics/creator-center', permissions: ['creator:data:view'] },
      { id: 'creator-works', label: '作品管理', icon: ListFilter, path: '/analytics/creator-center/works', permissions: ['creator:data:view'] },
      { id: 'creator-trends', label: '数据趋势', icon: BarChart3, path: '/analytics/creator-center/trends', permissions: ['creator:data:view'] },
      { id: 'creator-reports', label: '复盘报告', icon: FileBarChart, path: '/analytics/creator-center/reports', permissions: ['creator:report:view'] },
      { id: 'report-center', label: '报告中心', icon: FileBarChart, path: '/export', permissions: ['export:data'] },
      { id: 'retrospectives', label: '内容复盘', icon: History, path: '/retrospectives', permissions: ['analytics:retro:view'] },
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
      { id: 'topic-templates', label: '选题模板', icon: BookOpen, path: '/templates', permissions: ['system:template'] },
      { id: 'content-lab', label: '内容实验室', icon: BookOpenCheck, path: '/content-lab', permissions: ['analytics:view'] },
      { id: 'notification-settings', label: '系统配置', icon: Settings, path: '/notification-settings' },
      { id: 'backup', label: '备份管理', icon: Archive, path: '/backup', permissions: ['system:backup'] },
      { id: 'activity', label: '活动日志', icon: Activity, path: '/activity', permissions: ['user:logs'] },
      { id: 'anonymous-feedback', label: '匿名意见管理', icon: Inbox, path: '/admin/anonymous-feedback', roles: ['admin'] },
      { id: 'auth-rollout', label: '登录安全升级', icon: ShieldCheck, path: '/admin/auth-rollout', roles: ['admin'] },
      // TODO: 独立运维中心就绪后在此接入服务状态、定时任务、队列与系统健康能力。
    ],
  },
];

export const allNavigationItems = navigationSections.flatMap((section) => section.items);

export function canAccessNavigationSection(section: NavigationSection, role?: UserRole) {
  return !section.roles || (role ? section.roles.includes(role) : false);
}

export function findNavigationSectionByPath(pathname: string, search = '') {
  return navigationSections.find((section) => section.items.some((item) => isNavigationItemActive(pathname, item.path, search))) || null;
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

function isExactNavigationItemRoute(pathname: string, itemPath: string, search = '') {
  const [normalizedItemPath, itemSearch = ''] = itemPath.split('?');
  if (pathname === normalizedItemPath) {
    const expectedParams = new URLSearchParams(itemSearch);
    const currentParams = new URLSearchParams(search);
    return [...expectedParams].every(([key, value]) => currentParams.get(key) === value);
  }

  if (pathname !== '/asset-center/resources') return false;
  const libraryType = new URLSearchParams(search).get('library_type') || 'project';
  return resourceLibraryTypeForNavigationItem(itemPath) === libraryType;
}

function resourceLibraryTypeForNavigationItem(itemPath: string) {
  const [pathname, itemSearch = ''] = itemPath.split('?');
  const queryLibraryType = new URLSearchParams(itemSearch).get('library_type');
  if (queryLibraryType) return queryLibraryType;
  if (pathname === '/asset-center/projects') return 'project';
  if (pathname === '/asset-center/knowledge') return 'knowledge';
  if (pathname === '/asset-center/media') return 'media';
  return null;
}

function navigationPathMatches(pathname: string, itemPath: string, search = '') {
  const normalizedItemPath = itemPath.split('?')[0];
  if (isExactNavigationItemRoute(pathname, itemPath, search)) return true;
  if (pathname === normalizedItemPath) return false;
  if (pathname.startsWith('/asset-center/resources/') && new URLSearchParams(search).has('library_type')) {
    const resourceLibraryType = new URLSearchParams(search).get('library_type');
    const itemLibraryType = resourceLibraryTypeForNavigationItem(itemPath);
    if (itemLibraryType) return itemLibraryType === resourceLibraryType;
  }
  if (itemPath === '/') return pathname === '/' || pathname === '/home' || pathname === '/dashboard';
  if (itemPath === '/analytics/creator-center') return pathname === itemPath;
  if (itemPath === '/analytics/creator-center/works' && /^\/analytics\/creator-center\/(work|content)\//.test(pathname)) return true;
  return pathname === normalizedItemPath || pathname.startsWith(`${normalizedItemPath}/`);
}

export function isNavigationItemActive(pathname: string, itemPath: string, search = '') {
  if (!navigationPathMatches(pathname, itemPath, search)) return false;
  const itemDepth = itemPath.split('?')[0].length;
  return !allNavigationItems.some((candidate) => (
    candidate.path.split('?')[0].length > itemDepth && navigationPathMatches(pathname, candidate.path, search)
  ));
}

export function findNavigationItem(pathname: string, search = '') {
  return allNavigationItems.find((item) => isNavigationItemActive(pathname, item.path, search)) || null;
}

export function buildBreadcrumbs(pathname: string, search = '') {
  const activeSection = navigationSections.find((section) => section.items.some((item) => isNavigationItemActive(pathname, item.path, search)));
  const activeItem = activeSection?.items.find((item) => isNavigationItemActive(pathname, item.path, search));
  const crumbs: Array<{ label: string; path?: string }> = [{ label: '首页', path: '/' }];

  if (pathname === '/') return crumbs;
  if (activeSection) crumbs.push({ label: activeSection.label });
  if (activeItem) crumbs.push({ label: activeItem.label, path: activeItem.path });
  if (pathname.split('/').filter(Boolean).length >= 2 && (!activeItem || !isExactNavigationItemRoute(pathname, activeItem.path, search))) {
    crumbs.push({ label: '详情' });
  }
  return crumbs;
}
