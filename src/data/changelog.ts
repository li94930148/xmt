// 系统更新日志
// 每次更新时在此文件顶部添加新版本记录
// 版本号会自动从 package.json 读取

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: {
    type: 'feature' | 'improvement' | 'fix' | 'security';
    description: string;
  }[];
}

// 更新日志 - 按版本倒序排列（最新版本在最上面）
export const changelog: ChangelogEntry[] = [
  {
    version: '2.0.0',
    date: '2026-06-05',
    title: '文档编辑器全新升级',
    changes: [
      {
        type: 'improvement',
        description: '标题下拉菜单：正文/H1-H2-H3-H4 一键切换',
      },
      {
        type: 'feature',
        description: '🎨 8色高亮 + 8色文字颜色：选择器带预览色块',
      },
      {
        type: 'feature',
        description: '📋 右键菜单：替换浏览器默认，含批注增删改',
      },
      {
        type: 'feature',
        description: '📑 目录实时高亮：滚动自动检测当前位置，蓝色边框标识',
      },
      {
        type: 'feature',
        description: '🖨️ 打印优化：A4 纸，仅打印编辑器内容',
      },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-05',
    title: '登录页面记住密码',
    changes: [
      {
        type: 'fix',
        description: '打印按钮仅打印编辑器内容',
      },
      {
        type: 'improvement',
        description: '编辑器无感自动保存',
      },
      {
        type: 'fix',
        description: '人员管理更新 Bug 修复',
      },
      {
        type: 'feature',
        description: '选题管理增加提交时间列',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-05',
    title: '编辑器迁移完成',
    changes: [
      {
        type: 'improvement',
        description: '数据库迁移',
      },
      {
        type: 'feature',
        description: '新编辑器组件 src/components/editor',
      },
      {
        type: 'feature',
        description: 'Markdown 双向转换',
      },
      {
        type: 'improvement',
        description: '类型定义更新',
      },
      {
        type: 'improvement',
        description: '服务端路由兼容',
      },
      {
        type: 'improvement',
        description: '客户端 API 更新',
      },
      {
        type: 'improvement',
        description: '页面组件替换（TopicDetail + ProductionDetail）',
      },
      {
        type: 'feature',
        description: '协作预留接口 src/collaboration/',
      },
    ],
  },
  {
    version: '1.0.3',
    date: '2026-06-04',
    title: '选题管理内容缺失',
    changes: [
      {
        type: 'fix',
        description: 'src/api/topics.ts 的 getTopic 函数',
      },
    ],
  },
  {
    version: '1.0.2',
    date: '2026-06-04',
    title: '页面布局更新',
    changes: [
      {
        type: 'improvement',
        description: '1. 重写 NotificationSettings.tsx',
      },
      {
        type: 'improvement',
        description: '修改 App.tsx',
      },
      {
        type: 'fix',
        description: '修改 Layout.tsx',
      },
      {
        type: 'fix',
        description: '4. 修改 Sidebar.tsx',
      },
      {
        type: 'security',
        description: '修改 CommandPalette.tsx',
      },
      {
        type: 'fix',
        description: '删除 Settings.tsx',
      },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-06-04',
    title: '新增系统更新说明功能',
    changes: [
      {
        type: 'feature',
        description: '新增系统更新说明页面，查看完整更新历史',
      },
      {
        type: 'feature',
        description: '新增版本更新提示弹窗，登录时自动显示新版本信息',
      },
      {
        type: 'improvement',
        description: '版本号自动管理，从 package.json 读取',
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-04',
    title: '系统架构优化与安全性增强',
    changes: [
      {
        type: 'security',
        description: 'JWT Secret 强制检查，移除硬编码默认值',
      },
      {
        type: 'security',
        description: '添加登录频率限制，防止暴力破解',
      },
      {
        type: 'security',
        description: 'Socket.io CORS 限制为具体来源',
      },
      {
        type: 'improvement',
        description: '统一 API 响应格式，提升前后端协作效率',
      },
      {
        type: 'improvement',
        description: '数据库添加索引，提升查询性能',
      },
      {
        type: 'improvement',
        description: '启用数据库外键约束，保障数据完整性',
      },
      {
        type: 'improvement',
        description: '移除未读消息轮询，完全依赖 Socket.io 实时推送',
      },
      {
        type: 'feature',
        description: '新增 Docker 容器化部署支持',
      },
      {
        type: 'feature',
        description: '新增 PM2 进程管理配置',
      },
      {
        type: 'feature',
        description: '引入 React Query 数据缓存',
      },
      {
        type: 'feature',
        description: '系统设置整合为统一入口',
      },
      {
        type: 'feature',
        description: '系统界面字体大小可调节',
      },
      {
        type: 'fix',
        description: '修复选题提报时负责人不显示的问题',
      },
      {
        type: 'fix',
        description: '修复版本号硬编码问题',
      },
    ],
  },
];

// 获取最新版本信息
export function getLatestVersion(): ChangelogEntry {
  return changelog[0];
}

// 获取指定版本信息
export function getVersion(version: string): ChangelogEntry | undefined {
  return changelog.find((entry) => entry.version === version);
}

// 获取变更类型标签
export function getChangeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    feature: '新增',
    improvement: '优化',
    fix: '修复',
    security: '安全',
  };
  return labels[type] || type;
}

// 获取变更类型颜色
export function getChangeTypeColor(type: string): string {
  const colors: Record<string, string> = {
    feature: 'bg-green-500/20 text-green-400 border-green-500/30',
    improvement: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    fix: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    security: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return colors[type] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}
