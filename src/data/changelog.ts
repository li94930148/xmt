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
    version: '2.6.0',
    date: '2026年7月',
    title: '传媒内容中台能力升级版',
    changes: [
      { type: 'security', description: '权限管理体系重构：完成角色权限重新规划；admin 拥有完整系统权限，member 仅可查看选题、创作及详情，文案、后期、摄像等生产角色具备内容编辑权限，普通人员可提交选题并编辑自己的内容；系统设置仅管理员可用，个人设置对所有用户开放。同步优化页面权限控制、数据归属过滤与操作权限校验。' },
      { type: 'improvement', description: '多人实时协作编辑优化：基于 Tiptap + Yjs + Socket.IO 优化实时同步、断线重连与连接策略，修复编辑器高频操作卡顿，并增强异常日志。' },
      { type: 'improvement', description: '内容版本管理升级：Production / Shooting 版本规则优化，小版本在当前 major 下自动递增且同一 major 仅保留最新 minor；新版本自动生成 major 并保留历史主版本最新记录。同步优化历史展示、版本聚合和数据冗余清理。' },
      { type: 'feature', description: '工作流系统升级：完成 Shadow Logging、Analytics、Decision、Enforcement、Explainability 能力建设，增强流程追踪、操作记录及后续 AI 自动化扩展能力。' },
      { type: 'improvement', description: '系统稳定性优化：优化登录错误提示与登录限流、API 请求限制和 429 异常提示，并修复系统设置接口异常。' },
      { type: 'improvement', description: 'Socket.IO 生产环境优化：完成单例连接复用、连接异常日志增强与断线恢复优化，提升生产环境稳定运行能力。' },
      { type: 'feature', description: '部署运维升级：完善 PM2 服务管理、Caddy 代理配置、健康检查接口、自动部署脚本与数据备份机制，提升生产环境可靠性。' },
      { type: 'feature', description: '数据资料库建设：完成山东省情资料采集方案、泰安节点数据抓取、本地资料归档、目录结构保存、断点续爬和数据索引生成，为知识库与 AI 能力提供数据基础。' },
      { type: 'feature', description: 'AI 能力准备：完成 llama.cpp 本地模型运行验证、Qwen GGUF 模型部署测试及 OpenAI API 兼容调用准备，支持后续 AI 内容助手、AI 选题分析与私有知识库。' },
      { type: 'fix', description: 'Bug 修复：覆盖登录异常反馈、Socket 连接、编辑器性能、版本历史、点赞接口限流、环境变量及部署异常等问题。' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-06-17',
    title: '编辑器统一入口与低风险页面接入',
    changes: [
      {
        type: 'feature',
        description: '新增 ContentEditor 统一编辑器入口，统一 rich、legacy、readonly 三种模式，为业务页面后续收敛编辑器引用提供稳定入口。',
      },
      {
        type: 'improvement',
        description: 'Topics 创建弹窗与 AddTopic 大纲编辑区已接入 ContentEditor legacy 模式，保持原 HTML 内容字段和保存流程不变。',
      },
      {
        type: 'improvement',
        description: '完成 RichTextEditor 直接业务页面引用核对，旧编辑器进入 legacy 兼容期，后续新页面应优先通过 ContentEditor 使用编辑器能力。',
      },
      {
        type: 'improvement',
        description: '补充组件规范、重构规划和系统架构中的编辑器路线治理说明，明确 Tiptap Editor 为长期主线、协同编辑作为后续专项推进。',
      },
    ],
  },
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
