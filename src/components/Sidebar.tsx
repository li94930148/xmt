import { useAuthStore, useAppStore, useMessageStore } from '../store';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  MessageSquare, 
  BarChart3, 
  LogOut, 
  Video,
  Camera,
  Send,
  ChevronLeft,
  ChevronRight,
  Archive,
  Settings,
  Activity,
  Kanban,
  Calendar,
  Lightbulb,
  Trophy,
  Search,
  TrendingUp,
  Shield,
  GitBranch,
  Bell
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  theme: 'light' | 'dark';
  onOpenCommandPalette?: () => void;
}

// 分组菜单
const menuGroups = [
  {
    label: '总览',
    items: [
      { id: 'dashboard', label: '首页仪表盘', icon: LayoutDashboard, path: '/' },
    ]
  },
  {
    label: '内容流程',
    items: [
      { id: 'topics', label: '选题管理', icon: FileText, path: '/topics' },
      { id: 'production', label: '创作管理', icon: Video, path: '/production' },
      { id: 'shooting', label: '成片制作', icon: Camera, path: '/shooting' },
      { id: 'publishing', label: '发布管理', icon: Send, path: '/publishing' },
      { id: 'workflow-designer', label: '审批流设计', icon: GitBranch, path: '/workflow-designer', roles: ['admin'] },
    ]
  },
  {
    label: '效率工具',
    items: [
      { id: 'kanban', label: '看板视图', icon: Kanban, path: '/kanban' },
      { id: 'calendar', label: '排期日历', icon: Calendar, path: '/calendar' },
      { id: 'inspirations', label: '灵感池', icon: Lightbulb, path: '/inspirations' },
    ]
  },
  {
    label: '数据 & 管理',
    items: [
      { id: 'analytics', label: '数据复盘', icon: BarChart3, path: '/analytics' },
      { id: 'achievements', label: '成就系统', icon: Trophy, path: '/achievements' },
      { id: 'users', label: '人员管理', icon: Users, path: '/users', roles: ['admin'] },
      { id: 'resources', label: '资源库', icon: Archive, path: '/resources' },
      { id: 'activity', label: '活动日志', icon: Activity, path: '/activity', roles: ['admin', 'director'] },
      { id: 'douyin', label: '抖音数据', icon: TrendingUp, path: '/douyin' },
      { id: 'permissions', label: '角色权限', icon: Shield, path: '/permissions', roles: ['admin'] },
      { id: 'notification-settings', label: '系统设置', icon: Settings, path: '/notification-settings' },
    ]
  }
];

export default function Sidebar({ collapsed, onToggle, theme, onOpenCommandPalette }: SidebarProps) {
  const authStore = useAuthStore();
  const messageStore = useMessageStore();
  const navigate = useNavigate();
  const location = useLocation();

  // 读取系统设置中的 logo
  const getInitialSettings = () => {
    try {
      const saved = localStorage.getItem('xmt_system_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        return { logo: settings.systemLogo || '', name: settings.systemName || '新媒体协作' };
      }
    } catch {}
    return { logo: '', name: '新媒体协作' };
  };
  const initial = getInitialSettings();
  const [systemLogo, setSystemLogo] = useState(initial.logo);
  const [systemName, setSystemName] = useState(initial.name);

  // 监听 localStorage 变化，实时更新 logo
  useEffect(() => {
    const loadSettings = () => {
      try {
        const saved = localStorage.getItem('xmt_system_settings');
        if (saved) {
          const settings = JSON.parse(saved);
          setSystemLogo(settings.systemLogo || '');
          setSystemName(settings.systemName || '新媒体协作');
        }
      } catch {}
    };
    // 监听 storage 事件（跨标签页）
    window.addEventListener('storage', loadSettings);
    // 自定义事件（同标签页内保存后触发）
    window.addEventListener('xmt-settings-changed', loadSettings);
    return () => {
      window.removeEventListener('storage', loadSettings);
      window.removeEventListener('xmt-settings-changed', loadSettings);
    };
  }, []);

  const handleLogout = () => {
    authStore.logout();
    navigate('/login');
  };

  const canAccess = (roles?: string[]) => {
    if (!roles) return true;
    return roles.includes(authStore.user?.role || '');
  };

  const activeItem = location.pathname;

  return (
    <aside 
      className={`fixed left-0 top-0 h-screen border-r transition-all duration-300 z-50 ${
        collapsed ? 'w-[72px]' : 'w-64'
      } ${theme === 'dark' 
        ? 'bg-[#0f1117]/95 border-[#2a2d3e] backdrop-blur-xl' 
        : 'bg-white/95 border-[#e5e7eb] backdrop-blur-xl'
      }`}
    >
      <div className="flex flex-col h-full">
        {/* Logo 区域 */}
        <div className={`flex items-center h-16 px-4 border-b ${collapsed ? 'justify-center' : 'gap-3'} ${
          theme === 'dark' ? 'border-[#2a2d3e]' : 'border-[#e5e7eb]'
        }`}>
          <div className={`w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center transition-transform duration-200 hover:scale-105 ${
            theme === 'dark' ? 'bg-gradient-to-br from-[#5c7cfa]/20 to-[#748ffc]/20' : 'bg-gradient-to-br from-[#4263eb]/10 to-[#5c7cfa]/10'
          }`}>
            <img src={systemLogo || "/logo.png"} alt="Logo" className="w-8 h-8 object-contain" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className={`font-bold text-sm tracking-tight ${theme === 'dark' ? 'text-[#e8eaed]' : 'text-[#1a1d2e]'}`}>
                {systemName}
              </h1>
              <p className={`text-[10px] font-medium tracking-wider uppercase ${theme === 'dark' ? 'text-[#636983]' : 'text-[#9aa0b0]'}`}>
                Management
              </p>
            </div>
          )}
        </div>

        {/* 快捷搜索按钮 (折叠模式) */}
        {collapsed && (
          <div className="px-3 py-2">
            <button
              onClick={onOpenCommandPalette}
              className={`w-full flex items-center justify-center p-2.5 rounded-xl transition-all duration-200 ${
                theme === 'dark' ? 'text-[#636983] hover:bg-[#1e2030] hover:text-[#e8eaed]' : 'text-[#9aa0b0] hover:bg-[#f1f3f5] hover:text-[#1a1d2e]'
              }`}
              title="搜索 (Ctrl+K)"
            >
              <Search className="w-[18px] h-[18px]" />
            </button>
          </div>
        )}

        {/* 导航菜单 - 分组 */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {menuGroups.map((group, groupIndex) => {
            const visibleItems = group.items.filter(item => canAccess(item.roles));
            if (visibleItems.length === 0) return null;
            
            return (
              <div key={groupIndex} className={groupIndex > 0 ? 'mt-1' : ''}>
                {/* 分组标题 */}
                {!collapsed && (
                  <div className={`px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                    theme === 'dark' ? 'text-[#4a4f6a]' : 'text-[#b0b5c3]'
                  }`}>
                    {group.label}
                  </div>
                )}
                {collapsed && groupIndex > 0 && (
                  <div className={`mx-3 my-1 border-t ${theme === 'dark' ? 'border-[#2a2d3e]/50' : 'border-[#e5e7eb]/50'}`} />
                )}
                
                <ul className={`${collapsed ? 'space-y-0.5 px-2' : 'space-y-0.5 px-3'}`}>
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    // 内容流程子页面保持高亮
                    const contentPaths = ['/topics', '/production', '/shooting', '/publishing'];
                    const isActive = contentPaths.includes(item.path)
                      ? activeItem.startsWith(item.path)
                      : activeItem === item.path;
                    
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => navigate(item.path)}
                          className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group ${
                            isActive 
                              ? theme === 'dark'
                                ? 'bg-[#5c7cfa]/10 text-[#5c7cfa]'
                                : 'bg-[#4263eb]/10 text-[#4263eb]'
                              : theme === 'dark' 
                                ? 'text-[#9aa0b0] hover:bg-[#1e2030] hover:text-[#e8eaed]' 
                                : 'text-[#5f6672] hover:bg-[#f1f3f5] hover:text-[#1a1d2e]'
                          } ${collapsed ? 'justify-center' : ''}`}
                        >
                          {isActive && (
                            <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full ${
                              theme === 'dark' ? 'bg-[#5c7cfa]' : 'bg-[#4263eb]'
                            }`} />
                          )}
                          
                          <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-transform duration-200 ${
                            isActive ? 'scale-110' : 'group-hover:scale-105'
                          }`} />
                          
                          {!collapsed && (
                            <span className={`font-medium text-sm transition-colors duration-200`}>
                              {item.label}
                            </span>
                          )}

                          {collapsed && (
                            <div className={`absolute left-full ml-2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50 ${
                              theme === 'dark' 
                                ? 'bg-[#252840] text-[#e8eaed] shadow-lg shadow-black/20' 
                                : 'bg-[#1a1d2e] text-white shadow-lg shadow-black/10'
                            }`}>
                              {item.label}
                              <div className={`absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent ${
                                theme === 'dark' ? 'border-r-[#252840]' : 'border-r-[#1a1d2e]'
                              }`} />
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* 底部操作区 */}
        <div className={`border-t p-3 space-y-0.5 ${
          theme === 'dark' ? 'border-[#2a2d3e]' : 'border-[#e5e7eb]'
        }`}>
          <button
            onClick={() => navigate('/messages')}
            className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group ${
              collapsed ? 'justify-center' : ''
            } ${theme === 'dark' ? 'text-[#9aa0b0] hover:bg-[#1e2030] hover:text-[#e8eaed]' : 'text-[#5f6672] hover:bg-[#f1f3f5] hover:text-[#1a1d2e]'}`}
          >
            <MessageSquare className="w-[18px] h-[18px] flex-shrink-0 group-hover:scale-105 transition-transform" />
            {!collapsed && <span className="font-medium text-sm">消息中心</span>}
            {messageStore.unreadCount > 0 && (
              <span className={`${collapsed ? 'absolute top-1.5 right-1.5' : 'ml-auto'} min-w-[18px] h-[18px] px-1 bg-[#ff6b6b] text-white text-[10px] font-bold rounded-full flex items-center justify-center`}>
                {messageStore.unreadCount > 99 ? '99+' : messageStore.unreadCount}
              </span>
            )}
            
            {collapsed && (
              <div className={`absolute left-full ml-2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50 ${
                theme === 'dark' ? 'bg-[#252840] text-[#e8eaed] shadow-lg shadow-black/20' : 'bg-[#1a1d2e] text-white shadow-lg shadow-black/10'
              }`}>
                消息中心
              </div>
            )}
          </button>
          
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group ${
              collapsed ? 'justify-center' : ''
            } ${theme === 'dark' ? 'text-[#636983] hover:bg-[#1e2030] hover:text-[#ff6b6b]' : 'text-[#9aa0b0] hover:bg-[#fff5f5] hover:text-[#e03131]'}`}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0 group-hover:scale-105 transition-transform" />
            {!collapsed && <span className="font-medium text-sm">退出登录</span>}
          </button>
        </div>

        {/* 折叠按钮 */}
        <button
          onClick={onToggle}
          className={`absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 border rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 ${
            theme === 'dark' 
              ? 'bg-[#161822] border-[#2a2d3e] text-[#636983] hover:text-[#e8eaed] hover:border-[#5c7cfa]' 
              : 'bg-white border-[#e5e7eb] text-[#9aa0b0] hover:text-[#1a1d2e] hover:border-[#4263eb] shadow-sm'
          }`}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
}
