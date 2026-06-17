export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: {
    type: 'feature' | 'improvement' | 'fix' | 'security';
    description: string;
  }[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: '2.2.0',
    date: '2026-06-17',
    title: '权限细化与前端基础框架试点',
    changes: [
      {
        type: 'security',
        description: '继续收紧默认角色权限绑定与管理接口访问边界，避免 member、editor 在权限点迁移过程中出现实际能力放大。',
      },
      {
        type: 'improvement',
        description: '补齐角色与权限在前端导航、角色守卫和人员管理中的一致性处理，新增角色后可更稳定地联动页面访问控制与角色选择。',
      },
      {
        type: 'feature',
        description: '新增 PageHeader、PageToolbar、BaseModal、ConfirmModal、FormModal、LoadingState、ErrorState 等基础组件，为后续页面统一迁移提供低侵入骨架。',
      },
      {
        type: 'improvement',
        description: 'Messages 页面完成第一批试点迁移，统一了页面头部、清空确认、加载态与空状态，同时保持原有消息读取与跳转逻辑不变。',
      },
      {
        type: 'fix',
        description: '恢复登录页样式 1 到指定旧版布局与文案，保留现有登录功能、记住密码和系统设置联动能力。',
      },
      {
        type: 'improvement',
        description: '补充页面级空状态、无权限提示文案与基础交互整理，并同步修复若干固定角色名文案残留问题，降低后续页面治理成本。',
      },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-06-16',
    title: '系统设置后端统一化',
    changes: [
      {
        type: 'feature',
        description: '新增系统设置后端接口，统一管理系统名称、页签标题、Logo、品牌文案与登录页配置。',
      },
      {
        type: 'security',
        description: '新增 system:settings 权限点，系统配置修改必须通过登录认证与权限校验。',
      },
      {
        type: 'improvement',
        description: '设置中心拆分为系统设置、品牌设置、登录页设置与个人偏好，避免全局配置和本地偏好混放。',
      },
      {
        type: 'improvement',
        description: '登录页、侧边栏与应用品牌展示改为读取统一配置来源，管理员设备间的系统展示保持一致。',
      },
      {
        type: 'fix',
        description: '移除对 localStorage 中 xmt_system_settings 的全局依赖，修复不同浏览器配置不一致的问题。',
      },
      {
        type: 'fix',
        description: '系统更新说明文件改为 UTF-8 干净内容，修复历史乱码导致的阅读与维护问题。',
      },
    ],
  },
  {
    version: '2.0.1',
    date: '2026-06-11',
    title: '稳定性与安全修复',
    changes: [
      { type: 'fix', description: '修复资源与日历相关 SQL 更新异常。' },
      { type: 'security', description: 'Socket.IO 握手增加 JWT 认证。' },
      { type: 'improvement', description: '补充接口异常处理，避免数据库失败后误报成功。' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-06-05',
    title: '文档编辑器升级',
    changes: [
      { type: 'feature', description: '编辑器支持标题级别切换、颜色、右键菜单与目录高亮。' },
      { type: 'improvement', description: '打印与编辑体验优化。' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-05',
    title: '登录体验优化',
    changes: [
      { type: 'feature', description: '新增记住密码与快速登录体验。' },
      { type: 'fix', description: '修复人员管理与选题提报的相关问题。' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-05',
    title: '编辑器迁移完成',
    changes: [
      { type: 'feature', description: '引入新的编辑器组件与 Markdown 双向转换。' },
      { type: 'improvement', description: '同步更新服务端接口和页面适配。' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-04',
    title: '系统基础架构优化',
    changes: [
      { type: 'security', description: '加强 JWT、登录频率限制与 Socket.IO 来源控制。' },
      { type: 'improvement', description: '统一 API 响应与数据库索引策略。' },
      { type: 'feature', description: '补充 Docker、PM2 与系统设置入口。' },
    ],
  },
];

export function getLatestVersion(): ChangelogEntry {
  return changelog[0];
}

export function getVersion(version: string): ChangelogEntry | undefined {
  return changelog.find((entry) => entry.version === version);
}

export function getChangeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    feature: '新增',
    improvement: '优化',
    fix: '修复',
    security: '安全',
  };
  return labels[type] || type;
}

export function getChangeTypeColor(type: string): string {
  const colors: Record<string, string> = {
    feature: 'bg-green-500/20 text-green-400 border-green-500/30',
    improvement: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    fix: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    security: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return colors[type] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}
