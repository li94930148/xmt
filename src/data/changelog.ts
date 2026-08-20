export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  impactScope?: string[];
  changes: {
    type: 'feature' | 'improvement' | 'fix' | 'security';
    description: string;
  }[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: '2.20.0', date: '2026-08-18', title: 'Creator Collector Scrapling First',
    impactScope: ['Creator Agent', '抖音采集', '本地安全'],
    changes: [
      { type: 'feature', description: '新增 Scrapling Python Worker 与抖音能力清单采集。' },
      { type: 'security', description: '本地 Worker 仅输出脱敏 JSON 协议事件，不记录会话凭据。' },
    ],
  },
  {
    version: '2.19.10', date: '2026-08-20', title: '认证与角色权限安全补充',
    impactScope: ['认证', '权限', 'Android'],
    changes: [
      { type: 'security', description: 'Legacy 401 Recovery 仅接受精确可信 Origin，拒绝伪同源、错误端口和 HTTP 降级地址。' },
      { type: 'security', description: '角色批量授予与角色权限定义在写入前执行调用者有效权限上限检查，避免自举提权。' },
      { type: 'fix', description: '新增认证 Origin 与角色权限安全回归合同，并纳入核心安全 CI 门禁。' },
    ],
  },
  {
    version: '2.19.9', date: '2026-08-20', title: '权限、编辑器与认证安全硬化',
    impactScope: ['权限', '编辑器', '协作', '认证', 'Android'],
    changes: [
      { type: 'security', description: '限制角色授予上限，统一净化富文本渲染，并拒绝畸形协作 update。' },
      { type: 'security', description: 'Webhook fail-closed；禁用账号立即撤销会话并断开实时连接。' },
      { type: 'fix', description: 'Legacy Web 与 Android HTTP 401 复用既有 refresh runtime 后只重试一次。' },
    ],
  },
  {
    version: '2.19.8', date: '2026-08-17', title: 'Android 生产端点构建合同',
    impactScope: ['Android', '构建安全', 'API 运行时'],
    changes: [
      { type: 'fix', description: '正式 Android 构建固定注入生产 API/Socket 地址，并将非敏感构建元数据随 APK 打包。' },
      { type: 'security', description: 'Native Production 缺失或错误端点时 fail-closed；API Health 不再接受 HTTP 200 HTML。' },
    ],
  },
  {
    version: '2.19.7', date: '2026-08-17', title: 'Android Native Auth 自动续期修复',
    impactScope: ['Android', '认证', '运行时安全'],
    changes: [
      { type: 'fix', description: 'Native Runtime 独立安排 access token 临期 refresh，不再依赖可选 Socket Coordinator。' },
      { type: 'security', description: '瞬时网络失败保留 Keystore refresh credential 并有界重试；终态认证失败才清理会话。' },
    ],
  },
  {
    version: '2.19.6', date: '2026-08-14', title: 'Android HTTPS localhost Origin 兼容',
    impactScope: ['Android', 'CORS', '运行时安全'],
    changes: [
      { type: 'fix', description: '精确允许 Capacitor WebView 的 HTTPS localhost Origin，并拒绝任意端口、局域网与 lookalike 来源。' },
      { type: 'security', description: '新增真实 HTTP CORS 合同测试，验证 GET、OPTIONS、credentials 与恶意 Origin 不反射。' },
    ],
  },
  {
    version: '2.19.5', date: '2026-08-14', title: '编辑器 Word 式格式刷',
    impactScope: ['编辑器', '协作编辑'],
    changes: [
      { type: 'feature', description: '新增单次和连续格式刷，支持文字样式、颜色、高亮、标题、对齐与首行缩进。' },
      { type: 'improvement', description: '格式应用使用独立 ProseMirror transaction，链接、批注和业务 metadata 不会复制。' },
    ],
  },
  {
    version: '2.19.4', date: '2026-08-14', title: '部署门禁可靠性修复',
    impactScope: ['生产部署', '运行时安全'],
    changes: [
      { type: 'fix', description: '公网内部路由检查读取权威运行时文件，并为重启健康检查加入受限重试。' },
    ],
  },
  {
    version: '2.19.3', date: '2026-08-14', title: '日报 Glass Surface 布局修复',
    impactScope: ['日报', '界面布局'],
    changes: [
      { type: 'fix', description: '修复宽屏日报卡片将多个区块横向挤压的问题。' },
    ],
  },
  {
    version: '2.19.2', date: '2026-08-13', title: '内部接口与生产运行时配置硬化',
    impactScope: ['生产安全', '部署运行时'],
    changes: [
      { type: 'security', description: '统一保护 /internal Direct Loopback 边界并拒绝反向代理转发访问。' },
      { type: 'security', description: '建立生产运行环境确定性加载、回读与公网暴露部署门禁。' },
    ],
  },
  {
    version: '2.19.1', date: '2026-08-13', title: '移动认证生产准入安全热修',
    impactScope: ['Android', '认证', 'Socket.IO'],
    changes: [
      { type: 'security', description: '新增独立 Mobile allowlist、刷新持续准入和 Mobile Socket 授权。' },
    ],
  },
  {
    version: '2.19.0', date: '2026-08-13', title: 'Android 移动办公客户端',
    impactScope: ['Android', '认证', '实时协作'],
    changes: [
      { type: 'feature', description: '新增 Capacitor Android 工程、移动办公壳与底部导航。' },
      { type: 'security', description: '新增 Android Keystore 刷新凭据保护和 HTTPS/WSS 运行时约束。' },
    ],
  },
  {
    version: '2.18.4',
    date: '2026-08-13',
    title: '正式部署版本 Gate 补齐',
    impactScope: ['部署脚本'],
    changes: [
      { type: 'fix', description: '正式部署在服务重启前验证版本事实源一致。' },
    ],
  },
  {
    version: '2.18.3',
    date: '2026-08-13',
    title: '正式部署 Gate 修复',
    impactScope: ['部署脚本'],
    changes: [
      { type: 'fix', description: '正式部署固定精确目标 SHA，并在服务重启前验证在线备份可进行非破坏恢复演练。' },
    ],
  },
  {
    version: '2.18.2',
    date: '2026-08-12',
    title: '运维可靠性与仓库治理硬化',
    impactScope: ['备份与恢复演练', '部署迁移 Gate', '版本治理'],
    changes: [
      { type: 'improvement', description: '备份关键流程增加跨进程互斥与非破坏恢复演练。' },
      { type: 'security', description: '部署前增加迁移兼容性检查，避免不可安全回退的演进自动上线。' },
    ],
  },
  {
    version: '2.18.0',
    date: '2026-08-12',
    title: 'React Bits 场景化视觉编排与全系统体验升级',
    impactScope: ['Home', 'Topics', 'Daily Report', 'Creator', 'Analytics', 'Workflow', 'Editor', 'Settings / Appearance Center'],
    changes: [
      { type: 'feature', description: '建立 React Bits 官方组件、Typed Adapter、Semantic Slot 与 Page Scene 的统一视觉架构。' },
      { type: 'feature', description: '提供岚曜极光、深空科技、丝绸创意、线性协作、极简无扰、自由搭配六套视觉方案。' },
      { type: 'feature', description: 'Appearance Center 支持 Scene Preview、配置导入导出、恢复默认、持久化与页面应用范围控制。' },
      { type: 'improvement', description: '优化多页面视觉表现、响应式体验、字号、深浅主题、motionMode 与 Canvas 生命周期管理。' },
      { type: 'fix', description: '修复 Silk / React Three Fiber 生命周期兼容、动效关闭后的 Canvas 残留风险及 Settings 主题 select 可访问名称问题。' },
      { type: 'security', description: 'Workflow Engine、Backend、API、权限、Socket.IO、Yjs 与数据库保持不变。' },
    ],
  },
  {
    version: '2.17.2',
    date: '2026-08-08',
    title: 'React Bits 认证态兼容测试补充',
    impactScope: ['本地认证态兼容测试', 'React Bits 外观设置验证'],
    changes: [
      { type: 'fix', description: '认证态测试仅从临时 XMT_E2E 环境变量读取专用测试账号，不提供明文 fallback。' },
      { type: 'improvement', description: '补充登录后双主题、六套预设、字号、视口、按钮、配置持久化与恢复默认验证。' },
      { type: 'security', description: '测试目标限制为 localhost 或 127.0.0.1，不连接生产环境。' },
    ],
  },
  {
    version: '2.17.1',
    date: '2026-08-08',
    title: 'React Bits 浅色主题与字体兼容修复',
    impactScope: ['外观与动效设置', 'React Bits 按钮与文本适配层', '业务正文排版'],
    changes: [
      { type: 'fix', description: '修复浅色模式中 React Bits 按钮的文字、边框与高光对比。' },
      { type: 'fix', description: '修复 SpecularButton 主题色，以及 GlareHover、ClickSpark、Magnet 的尺寸与布局。' },
      { type: 'fix', description: '修复文本动画裁切；用户字号不再改变 html rem 基准。' },
      { type: 'improvement', description: '新增深色、浅色双主题真实预览与仅开发环境可见的主题兼容矩阵。' },
    ],
  },
  {
    version: '2.17.0',
    date: '2026-08-08',
    title: 'React Bits 原生动效主题系统',
    impactScope: ['外观与动效设置', 'Login', 'Home', '通用 ActionButton', '当前浏览器本地配置'],
    changes: [
      { type: 'feature', description: '新增 React Bits 原生动效外观中心、六套官方组件预设和自由搭配能力。' },
      { type: 'feature', description: '支持背景、标题、数字、按钮、卡片、内容进入和导航风格的实时预览、导入导出与恢复默认。' },
      { type: 'improvement', description: '新增 reduced-motion、移动端低强度、单主背景限制与 WebGL 静态 fallback。' },
      { type: 'security', description: '所有动效均来自 React Bits 官方 TS + Tailwind 源码；后端 API、数据库、权限、Workflow、Socket.IO 与 Yjs 保持不变。' },
    ],
  },
  {
    version: '2.16.1',
    date: '2026-08-07',
    title: '首页驾驶舱视觉增强',
    impactScope: ['Home 首页', '前端视觉与交互', '桌面端与移动端'],
    changes: [
      { type: 'feature', description: '新增品牌级 Hero 区域，融合平台名称、内容生产驾驶舱标题、核心指标与主要业务入口。' },
      { type: 'improvement', description: '增强 Aurora 动态背景，并提供 WebGL 不可用及减少动态效果偏好下的静态渐变降级。' },
      { type: 'improvement', description: 'MagicBento 升级为非对称布局，以内容生产指数作为主视觉大卡，并配置任务、选题、审核、发布、播放和 AI 辅助卡。' },
      { type: 'improvement', description: '启用 Spotlight、粒子、3D 倾斜、磁吸、点击反馈与 AnimatedContent 动态进入动画。' },
      { type: 'security', description: '后端 API、数据库、权限、Workflow Engine、Socket.IO 与 Yjs 保持不变。' },
    ],
  },
  {
    version: '2.16.0',
    date: '2026-08-06',
    title: 'React Bits 原生体验升级',
    impactScope: ['Login', 'Home / Dashboard', 'Topics 重点内容', 'Creator Dashboard'],
    changes: [
      { type: 'feature', description: '正式接入 React Bits 官方 TypeScript + Tailwind 组件源码。' },
      { type: 'feature', description: '接入 AuroraBackground、MagicBento、AnimatedContent、SpotlightCard 与 ProfileCard。' },
      { type: 'improvement', description: '完成 Login、Dashboard、Topics 重点内容与 Creator 展示体验升级。' },
      { type: 'security', description: '后端 API、数据库、权限、Workflow Engine、Socket.IO 与 Yjs 保持不变。' },
    ],
  },
  {
    version: '2.15.4',
    date: '2026-08-06',
    title: 'UI 应用补全升级',
    impactScope: ['Dashboard', 'Topics', 'Workflow', 'Creator'],
    changes: [
      { type: 'improvement', description: '将 XMT 自研 Design System 实际应用到核心业务页面，不作为 React Bits 官方组件集成。' },
      { type: 'improvement', description: '统一 Dashboard 卡片体系并优化 Topics 页面统计卡与核心列表卡片。' },
      { type: 'improvement', description: '统一 Workflow 模板、节点和流程预览视觉，并优化 Creator 指标卡展示。' },
      { type: 'security', description: '业务数据、权限规则与 Workflow 状态机保持不变。' },
    ],
  },
  {
    version: '2.15.3',
    date: '2026-08-05',
    title: 'React Bits 风格 Design System 基础升级',
    impactScope: ['XMT Design System', 'Dashboard 基础指标', 'Sidebar', 'Modal / Loading / EmptyState'],
    changes: [
      { type: 'feature', description: '建立 XMT Design System 基础层，新增 XMTTheme 与 XMTCard。' },
      { type: 'feature', description: '新增 AnimatedNumber 与 ProgressBar，统一指标数字和进度展示。' },
      { type: 'improvement', description: '优化页面基础动效以及 Sidebar 展开收缩体验。' },
      { type: 'improvement', description: '统一 Modal、Loading 与 EmptyState 的视觉和进入反馈。' },
    ],
  },
  {
    version: '2.13.2',
    date: '2026-07-30',
    title: 'Auth 模块边界拆分',
    changes: [
      { type: 'improvement', description: '认证登录建立 Repository、Service、Controller、Token、Password 与 Mapper 模块边界。' },
      { type: 'improvement', description: '旧 /api/auth/login 改为兼容委托 Auth Module，外部契约和错误行为保持不变。' },
      { type: 'security', description: '新增临时 SQLite 冻结测试，覆盖登录、JWT、角色回查及 logout 不撤销令牌的当前行为。' },
      { type: 'security', description: '未引入 Refresh Token，数据库、权限、Socket、前端登录和 7 天 JWT 时效均未改变。' },
    ],
  },
  {
    version: '2.13.1',
    date: '2026-07-30',
    title: '资料创建与档案导入修复',
    changes: [
      { type: 'fix', description: '修复资料库新增资料按钮无响应，补齐创建表单、校验和详情跳转。' },
      { type: 'improvement', description: '山东地情档案导入增加统一编码、换行、不可见字符、空白和空行清洗。' },
      { type: 'security', description: 'manifest 保留原始与清洗后哈希，导入继续支持 ZIP 安全检查、批次审计、幂等和回滚。' },
    ],
  },
  {
    version: '2.13.0',
    date: '2026-07-30',
    title: '创作生产资料引用',
    changes: [
      { type: 'feature', description: '生产详情新增参考资料模块，支持搜索、关联、查看和解除资料。' },
      { type: 'feature', description: '新增生产资料关联接口，统一使用 production/reference 关系记录。' },
      { type: 'security', description: '关联操作同时校验生产编辑范围和资料查看权限，普通查看用户保持只读。' },
      { type: 'improvement', description: '资料关联独立于编辑器、版本历史、协作编辑和保存流程，解除关联不删除资料。' },
    ],
  },
  {
    version: '2.12.0',
    date: '2026-07-29',
    title: 'API Contract 标准化建设',
    changes: [
      { type: 'feature', description: '建立 /api/v1 成功、错误、分页、错误码和 HTTP 状态码公共契约。' },
      { type: 'feature', description: '新增 requestId 生成与透传，并提供 Zod 驱动的 OpenAPI 文档和 Swagger UI。' },
      { type: 'improvement', description: 'Topic v1 接入统一 envelope，新增 api-client 基础骨架和契约测试。' },
      { type: 'security', description: 'legacy API、数据库、权限、状态机及业务逻辑保持不变。' },
    ],
  },
  {
    version: '2.11.0',
    date: '2026-07-29',
    title: 'Topic 模块化基础落地',
    changes: [
      { type: 'feature', description: 'Topic 新增 Repository、Policy、Service、Controller 与模块路由边界，legacy 接口继续兼容。' },
      { type: 'feature', description: '新增默认关闭的 /api/v1/topics 严格 Zod 契约，为后续客户端迁移做准备。' },
      { type: 'improvement', description: '新增临时 SQLite 专项测试，覆盖数据访问、业务错误和 legacy/v1 API 契约。' },
      { type: 'security', description: '权限、状态机、通知、Socket 与历史日志行为保持原样，未修改数据库结构。' },
    ],
  },
  {
    version: '2.10.3',
    date: '2026-07-29',
    title: '修复抖音粉丝与作品封面显示并优化数据驾驶舱',
    changes: [
      { type: 'fix', description: '修复粉丝总数未进入统一上传载荷的问题，兼容分隔符、万/亿单位、加号与嵌套对象。' },
      { type: 'fix', description: '修复作品主封面在数据裁剪和规范化过程中丢失的问题，并避免缺失值覆盖有效封面。' },
      { type: 'improvement', description: '移除账号健康度模块，将六个核心指标调整为两行三列并优化窄屏显示。' },
      { type: 'improvement', description: '封面统一使用无 Referer 懒加载与失败占位，Creator Agent 继续作为唯一运营数据主链路。' },
    ],
  },
  {
    version: '2.10.2-storage',
    date: '2026-07-24',
    title: '数据可见性治理与作品库展示优化',
    changes: [
      { type: 'improvement', description: 'Creator 数据查看权限与管理权限分离，具有查看权限的成员可读取已标准化同步的公开平台账号数据。' },
      { type: 'security', description: '同步、绑定、授权管理仍仅限 admin 与 director，普通成员的操作权限不放大。' },
      { type: 'improvement', description: '作品库增加默认 20 条、最大 100 条的 cursor 分页和下一页加载。' },
      { type: 'fix', description: '统一解析 douyin_works、creator_content_items 与 raw_json 中的封面，并为作品库和驾驶舱 TOP5 增加懒加载失败占位。' },
    ],
  },
  {
    version: '2.10.2-sync',
    date: '2026-07-24',
    title: '抖音服务端同步契约升级',
    changes: [
      { type: 'feature', description: '支持 contract_version=2.10.2 严格 DouyinWorkInput 链路，并继续兼容无版本和 v2.10.1 Agent。' },
      { type: 'improvement', description: '同一作品在单事务内写入 creator_content_items 与 douyin_works，并通过 content_id 建立一致性关系。' },
      { type: 'improvement', description: '同步日志增加 contract_version、collection_mode、snapshot_id 与只含统计摘要的 summary_json。' },
      { type: 'fix', description: '移除同步过程中的直接删除动作，改为只读污染候选报告；本版本不修改前端页面。' },
    ],
  },
  {
    version: '2.10.2-agent',
    date: '2026-07-24',
    title: 'Creator Agent 契约与编辑器稳定性升级',
    changes: [
      { type: 'feature', description: 'Agent 增加安全 JSON 解析、超长 ID 保真、严格作品识别、cursor 分页、collection_mode 和 snapshot_id。' },
      { type: 'fix', description: '修复编辑器右键菜单定位及 BubbleMenu 互斥问题，保留 Yjs 与多人协作光标。' },
    ],
  },
  {
    version: '2.10.1',
    date: '2026-07-24',
    title: '标准抖音数据中心',
    changes: [
      { type: 'feature', description: '新增 douyin_works、daily snapshots、work snapshots、analysis records 与增强同步日志模型。' },
      { type: 'improvement', description: 'Creator Center 运营分析、作品复盘和趋势改为使用标准 douyin_* 真实数据。' },
    ],
  },
  {
    version: '2.10.0',
    date: '2026-07-23',
    title: 'Creator Data Center 运营分析',
    changes: [
      { type: 'feature', description: '新增账号驾驶舱、作品库、作品复盘、趋势、粉丝分析和运营报告。' },
      { type: 'feature', description: '新增规则驱动的作品评分、账号健康度和日报、周报、月报能力。' },
    ],
  },
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
