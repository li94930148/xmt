# XMT 新媒体协作管理系统 — 系统架构文档

> 文档版本：v1.0 | 生成日期：2026-06-06  
> 适用范围：全栈开发、系统解耦、后续维护

---

## 目录

1. [系统总览](#1-系统总览)
2. [技术栈](#2-技术栈)
3. [项目目录结构](#3-项目目录结构)
4. [系统架构图](#4-系统架构图)
5. [核心工作流 — 选题全生命周期](#5-核心工作流--选题全生命周期)
6. [数据库 ER 图与表结构](#6-数据库-er-图与表结构)
7. [后端 API 架构](#7-后端-api-架构)
8. [前端架构](#8-前端架构)
9. [状态管理](#9-状态管理)
10. [权限系统](#10-权限系统)
11. [实时通信](#11-实时通信)
12. [各子系统详解](#12-各子系统详解)
13. [数据流转全景图](#13-数据流转全景图)
14. [解耦指南](#14-解耦指南)
15. [附录](#15-附录)

---

## 1. 系统总览

XMT（新媒体台）是一套面向**视频内容创作团队**的全流程管理系统，覆盖从选题策划、剧本创作、拍摄执行、成片制作、发布管理到数据复盘的完整业务闭环。

### 核心业务流程

```
选题策划 → 审核 → 剧本创作 → 拍摄 → 成片 → 发布 → 数据复盘
```

### 系统定位

| 维度 | 说明 |
|------|------|
| 目标用户 | 新媒体团队（管理员、编导、成员） |
| 部署方式 | 单机部署（Express + SQLite），支持局域网 |
| 数据库 | SQLite（通过 @libsql/client 访问） |
| 实时性 | Socket.IO 推送 + 轮询降级 |
| 编辑器 | Tiptap 富文本（创作）+ Quill（选题描述） |

---

## 2. 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18 | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 6.x | 构建工具 |
| Tailwind CSS | 3.x | 样式方案 |
| Zustand | 4.x | 状态管理 |
| React Router | 6 | 路由 |
| Tiptap | 2.x | 富文本编辑器（创作/大纲） |
| Quill | 2.x | 富文本编辑器（选题描述，旧版） |
| Socket.IO Client | 4.x | 实时通信 |
| Lucide React | - | 图标库 |
| Recharts | - | 图表 |
| react-beautiful-dnd | - | 拖拽（看板） |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Express | 4.x | HTTP 框架 |
| TypeScript | 5.x | 类型安全 |
| @libsql/client | - | SQLite 数据库驱动 |
| Socket.IO | 4.x | WebSocket 服务 |
| bcrypt | - | 密码加密 |
| jsonwebtoken | - | JWT 认证 |
| multer | - | 文件上传 |
| node-cron | - | 定时任务 |

### 共享层

| 模块 | 说明 |
|------|------|
| `shared/types/` | 前后端共用的 TypeScript 类型定义 |
| `shared/constants/` | 共享常量（如状态枚举） |

---

## 3. 项目目录结构

```
xmt/
├── api/                          # 后端服务
│   ├── app.ts                    # Express 应用入口（路由注册、中间件、Socket.IO）
│   ├── server.ts                 # 服务器启动入口
│   ├── index.ts                  # 导出入口
│   ├── database/
│   │   ├── db.ts                 # 数据库初始化（建表、索引、迁移、默认数据）
│   │   └── utils.ts              # 数据库查询工具函数
│   ├── middleware/
│   │   ├── auth.ts               # JWT 认证中间件
│   │   ├── permissions.ts        # 权限检查中间件（带缓存）
│   │   └── rateLimit.ts          # API 限流
│   ├── routes/                   # API 路由（按模块拆分）
│   │   ├── auth.ts               # 认证（登录、改密码）
│   │   ├── topics.ts             # 选题 CRUD + 审核 + 状态流转
│   │   ├── workflow.ts           # 创作/拍摄/发布 CRUD
│   │   ├── workflow-templates.ts # 审批流模板管理
│   │   ├── users.ts              # 用户管理 + 操作日志
│   │   ├── messages.ts           # 站内消息
│   │   ├── analytics.ts          # 数据分析
│   │   ├── resources.ts          # 资源库
│   │   ├── inspirations.ts       # 灵感池
│   │   ├── templates.ts          # 选题模板
│   │   ├── achievements.ts       # 成就系统
│   │   ├── announcements.ts      # 公告系统
│   │   ├── pomodoro.ts           # 番茄钟
│   │   ├── calendar.ts           # 排期日历
│   │   ├── export.ts             # 数据导出
│   │   ├── douyin.ts             # 抖音数据采集
│   │   ├── backup.ts             # 数据备份
│   │   ├── roles.ts              # 角色管理
│   │   ├── permissions.ts        # 权限管理
│   │   └── notifications.ts      # 通知偏好
│   ├── services/
│   │   └── douyin.ts             # 抖音数据抓取服务
│   ├── utils/
│   │   ├── jwt.ts                # JWT 工具
│   │   ├── messageHelper.ts      # 消息创建工具
│   │   ├── response.ts           # 统一响应格式
│   │   ├── socket.ts             # Socket.IO 单例管理
│   │   └── workflow.ts           # 状态机（合法转换校验）
│   └── types/
│       └── index.ts              # 后端类型入口（re-export shared/types）
│
├── src/                          # 前端应用
│   ├── main.tsx                  # React 入口
│   ├── App.tsx                   # 路由定义（懒加载）
│   ├── index.css                 # 全局样式 + Tailwind
│   ├── api/                      # API 调用层（按模块拆分）
│   │   ├── index.ts              # 统一导出入口
│   │   ├── auth.ts               # 认证 API
│   │   ├── topics.ts             # 选题 API
│   │   ├── workflow.ts           # 工作流 API（创作/拍摄/发布/评论）
│   │   ├── users.ts              # 用户 API
│   │   ├── messages.ts           # 消息 API
│   │   ├── analytics.ts          # 分析 API
│   │   ├── resources.ts          # 资源 API
│   │   ├── inspirations.ts       # 灵感 API
│   │   ├── templates.ts          # 模板 API
│   │   ├── achievements.ts       # 成就 API
│   │   ├── announcements.ts      # 公告 API
│   │   ├── pomodoro.ts           # 番茄钟 API
│   │   ├── calendar.ts           # 日历 API
│   │   ├── export.ts             # 导出 API
│   │   ├── douyin.ts             # 抖音 API
│   │   ├── backup.ts             # 备份 API
│   │   └── permissions.ts        # 权限 API
│   ├── pages/                    # 页面组件（每个模块一个页面）
│   │   ├── Login.tsx             # 登录页
│   │   ├── Home.tsx              # 首页仪表盘
│   │   ├── Topics.tsx            # 选题列表
│   │   ├── TopicDetail.tsx       # 选题详情（含大纲编辑）
│   │   ├── AddTopic.tsx          # 新建选题
│   │   ├── Production.tsx        # 创作管理列表
│   │   ├── ProductionDetail.tsx  # 创作详情（Tiptap 编辑器）
│   │   ├── Shooting.tsx          # 拍摄管理列表
│   │   ├── ShootingDetail.tsx    # 拍摄详情
│   │   ├── Publishing.tsx        # 发布管理列表
│   │   ├── PublishingDetail.tsx  # 发布详情
│   │   ├── Analytics.tsx         # 数据分析
│   │   ├── DouyinAnalytics.tsx   # 抖音数据分析
│   │   ├── Users.tsx             # 用户管理
│   │   ├── Resources.tsx         # 资源库
│   │   ├── Messages.tsx          # 消息中心
│   │   ├── Kanban.tsx            # 看板视图
│   │   ├── Calendar.tsx          # 排期日历
│   │   ├── Inspirations.tsx      # 灵感池
│   │   ├── Achievements.tsx      # 成就系统
│   │   ├── ActivityLog.tsx       # 活动日志
│   │   ├── PermissionManagement.tsx # 角色权限管理
│   │   ├── WorkflowDesigner.tsx  # 审批流设计
│   │   ├── NotificationSettings.tsx # 系统设置（通知/个人/外观/系统/备份）
│   │   ├── ExportPage.tsx        # 数据导出
│   │   ├── PomodoroPage.tsx      # 番茄钟
│   │   └── BackupPage.tsx        # 备份管理
│   ├── components/               # 通用组件
│   │   ├── Layout.tsx            # 主布局（侧边栏 + 内容区 + 通知）
│   │   ├── Sidebar.tsx           # 侧边栏导航
│   │   ├── RichTextEditor.tsx    # Quill 富文本编辑器（旧版，用于选题描述）
│   │   ├── editor/               # Tiptap 编辑器组件集
│   │   │   ├── Editor.tsx        # 主编辑器组件
│   │   │   ├── Toolbar.tsx       # 工具栏
│   │   │   ├── BubbleMenu.tsx    # 浮动工具栏
│   │   │   ├── FloatingMenu.tsx  # 空行浮动菜单
│   │   │   ├── ContextMenu.tsx   # 右键菜单
│   │   │   ├── TableOfContents.tsx # 目录面板
│   │   │   ├── MarkdownPreview.tsx # Markdown 预览
│   │   │   └── extensions/
│   │   │       └── CommentExtension.ts # 批注 Mark 扩展
│   │   ├── CommandPalette.tsx    # 命令面板（Ctrl+K）
│   │   ├── PomodoroTimer.tsx     # 番茄钟组件
│   │   ├── WeeklyReport.tsx      # 周报组件
│   │   ├── AnnouncementBoard.tsx # 公告栏
│   │   ├── TopicSpinner.tsx      # 选题转盘（随机选题）
│   │   ├── BatchActions.tsx      # 批量操作
│   │   ├── DataExport.tsx        # 数据导出组件
│   │   ├── CollaborationHeatmap.tsx # 协作热力图
│   │   ├── UpdateNotification.tsx # 更新提示
│   │   ├── ErrorBoundary.tsx     # 错误边界
│   │   └── ...                   # 其他通用组件
│   ├── store/
│   │   └── index.ts              # Zustand 状态管理（auth/topic/message/app）
│   ├── hooks/                    # 自定义 Hooks
│   │   ├── usePermission.ts      # 权限检查
│   │   ├── useSocket.ts          # Socket.IO 连接
│   │   ├── useRealtimeSync.ts    # 实时数据同步
│   │   ├── useThemeStyles.ts     # 主题样式
│   │   ├── useDesktopNotification.ts # 桌面通知
│   │   ├── useKeyboardShortcuts.ts # 键盘快捷键
│   │   ├── useTopics.ts          # 选题数据
│   │   ├── useApi.ts             # API 请求封装
│   │   └── ...
│   ├── utils/
│   │   ├── markdown.ts           # HTML ↔ Markdown 转换
│   │   ├── htmlUtils.ts          # HTML 工具
│   │   ├── notification.ts       # 通知工具
│   │   └── apiInterceptor.ts     # API 拦截器
│   ├── constants/
│   │   └── index.ts              # 全局常量（状态颜色/文本/平台/成就）
│   ├── types/
│   │   └── index.ts              # 前端类型入口（re-export shared/types）
│   ├── hooks/
│   │   └── useThemeStyles.ts     # 主题样式 Hook
│   ├── styles/
│   │   └── print.css             # 打印样式
│   ├── data/
│   │   └── changelog.ts          # 更新日志
│   └── lib/
│       └── utils.ts              # 工具函数
│
├── shared/                       # 前后端共享
│   └── types/
│       └── index.ts              # 统一类型定义（所有实体、DTO、枚举）
│
├── public/                       # 静态资源
│   └── logo.png                  # 系统 Logo
│
├── data/                         # 运行时数据
│   └── xmt.db                    # SQLite 数据库文件
│
├── dist/                         # 前端构建产物
├── backups/                      # 自动备份目录
├── uploads/                      # 上传文件目录
├── certs/                        # SSL 证书（可选）
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── .env                          # 环境变量
```

---

## 4. 系统架构图

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          浏览器 (Client)                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │  React UI  │  │  Zustand  │  │  Tiptap   │  │ Socket.IO │       │
│  │  (Pages)   │  │  (Store)  │  │ (Editor)  │  │ (Client)  │       │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘       │
│        │              │              │              │               │
│  ┌─────┴──────────────┴──────────────┴──────────────┴─────┐        │
│  │                    API 调用层 (src/api/)                 │        │
│  │         fetch + JWT Token + 统一错误处理                  │        │
│  └─────────────────────────┬───────────────────────────────┘        │
└────────────────────────────┼────────────────────────────────────────┘
                             │ HTTP / WebSocket
┌────────────────────────────┼────────────────────────────────────────┐
│                     Express Server (api/)                            │
│  ┌─────────────────────────┴───────────────────────────────┐        │
│  │                    中间件层                               │        │
│  │   CORS → RateLimit → JWT Auth → Permission Check         │        │
│  └─────────────────────────┬───────────────────────────────┘        │
│  ┌─────────────────────────┴───────────────────────────────┐        │
│  │                    路由层 (routes/)                       │        │
│  │  auth│topics│workflow│users│messages│analytics│...        │        │
│  └─────────────────────────┬───────────────────────────────┘        │
│  ┌─────────────────────────┴───────────────────────────────┐        │
│  │                    工具层 (utils/)                        │        │
│  │   JWT │ MessageHelper │ Socket │ Workflow │ Response      │        │
│  └─────────────────────────┬───────────────────────────────┘        │
│  ┌─────────────────────────┴───────────────────────────────┐        │
│  │                 数据库层 (database/)                      │        │
│  │            @libsql/client → SQLite (data/xmt.db)         │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │              Socket.IO Server (实时推送)                   │        │
│  │   用户通知 │ 房间广播 │ 选题/灵感/创作 实时同步             │        │
│  └─────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 前端模块依赖图

```
App.tsx (路由)
  │
  ├── Layout.tsx (主布局)
  │     ├── Sidebar.tsx (导航)
  │     │     └── 读取 systemSettings (logo/name)
  │     ├── RealtimeToast.tsx (实时通知弹窗)
  │     └── <Outlet /> (页面内容)
  │
  ├── pages/* (页面组件)
  │     ├── 使用 api/* 调用后端
  │     ├── 使用 store/* 读写状态
  │     ├── 使用 hooks/* 复用逻辑
  │     └── 使用 components/* 构建 UI
  │
  ├── components/* (通用组件)
  │     ├── editor/* (Tiptap 编辑器)
  │     │     ├── Editor.tsx → Toolbar + BubbleMenu + ContextMenu + TOC
  │     │     └── extensions/CommentExtension.ts (批注)
  │     └── RichTextEditor.tsx (Quill 编辑器，旧版)
  │
  └── shared/types/* (类型定义)
```

---

## 5. 核心工作流 — 选题全生命周期

### 5.1 状态机

```
                    ┌──────────────────────────────────────────────┐
                    │              选题状态机 (TopicStatus)          │
                    └──────────────────────────────────────────────┘

    ┌─────────┐    审核通过     ┌──────────┐    进入创作    ┌────────────┐
    │ pending  │──────────────→│ approved  │──────────────→│ production │
    │ (待审核)  │               │ (已通过)   │               │  (创作中)   │
    └────┬─────┘               └──────────┘               └─────┬──────┘
         │                                                      │
         │ 审核驳回                                              │ 进入拍摄
         ▼                                                      ▼
    ┌─────────┐               ┌──────────┐               ┌────────────┐
    │ rejected │──重新提交──→ │ pending   │               │  shooting  │
    │ (已驳回)  │               │ (待审核)  │               │  (拍摄中)   │
    └─────────┘               └──────────┘               └─────┬──────┘
                                                               │
                                                               │ 进入发布
                                                               ▼
                                                         ┌────────────┐
                                                         │ publishing │
                                                         │  (发布中)   │
                                                         └─────┬──────┘
                                                               │
                                                               │ 完成
                                                               ▼
                                                         ┌────────────┐
                                                         │ completed  │
                                                         │  (已完成)   │
                                                         └────────────┘
```

### 5.2 合法状态转换表

| 当前状态 | 可转换为 | 触发条件 | 自动创建 |
|---------|---------|---------|---------|
| `pending` | `approved` | 管理员/编导审核通过 | 创建 Production 记录 |
| `pending` | `rejected` | 管理员/编导审核驳回 | — |
| `rejected` | `pending` | 成员重新提交 | — |
| `approved` | `production` | 状态推进 | 创建 Production 记录（如不存在） |
| `production` | `shooting` | 状态推进 | 创建 Shooting 记录（如不存在） |
| `shooting` | `publishing` | 状态推进 | 创建 Publishing 记录（如不存在） |
| `publishing` | `completed` | 状态推进 | — |

### 5.3 各阶段关联实体

```
选题 (Topic)
  │
  ├── 创作 (Production)        ← 1:1，审核通过后自动创建
  │     ├── 剧本内容 (content / content_json / content_markdown)
  │     ├── 版本历史 (ProductionHistory)
  │     └── 评论 (Comments)
  │
  ├── 拍摄 (Shooting)          ← 1:1，进入拍摄阶段后自动创建
  │     ├── 拍摄计划 (plan_date / location / equipment)
  │     └── 剧本副本 (script_content)
  │
  ├── 发布 (Publishing)        ← 1:1，进入发布阶段后自动创建
  │     ├── 发布信息 (platform / url / publish_time)
  │     ├── 数据指标 (views / likes / shares / comments)
  │     └── 剧本副本 (script_content)
  │
  └── 数据分析 (Analytics)     ← 1:N，按日期记录
        └── 每日数据 (views / likes / shares / comments / data_date)
```

---

## 6. 数据库 ER 图与表结构

### 6.1 ER 关系图

```
┌──────────────┐     1:N     ┌──────────────────┐
│    users     │────────────→│   topic_history   │
│              │             └──────────────────┘
│  id (PK)     │     1:N     ┌──────────────────┐
│  username    │────────────→│    production     │
│  password    │             │                  │
│  role        │     1:N     │  id (PK)         │
│  name        │────────────→│  topic_id (FK)   │
│  email       │             │  version         │
│  enabled     │             │  content         │
└──────┬───────┘             │  content_json    │
       │                     │  content_markdown│
       │ 1:N                 │  status          │
       ▼                     └────────┬─────────┘
┌──────────────┐                      │ 1:N
│   messages   │                      ▼
│              │             ┌──────────────────┐
│  id (PK)     │             │production_history│
│  user_id(FK) │             └──────────────────┘
│  title       │
│  content     │     1:1     ┌──────────────────┐
│  type        │             │     shooting     │
│  read        │             │                  │
│  link        │             │  id (PK)         │
└──────────────┘             │  topic_id (FK)   │
                             │  plan_date       │
┌──────────────┐             │  location        │
│    topics    │             │  equipment       │
│              │     1:1     │  status          │
│  id (PK)     │────────────→│  script_content  │
│  title       │             └──────────────────┘
│  description │
│  outline     │     1:1     ┌──────────────────┐
│  outline_json│             │    publishing    │
│  status      │────────────→│                  │
│  platform    │             │  id (PK)         │
│  deadline    │             │  topic_id (FK)   │
│  creator_id  │             │  platform        │
│  assignee_id │             │  url             │
│  workflow_   │             │  status          │
│  template_id │             │  publish_time    │
│  submitted_at│             │  views/likes/... │
└──────┬───────┘             │  script_content  │
       │                     └──────────────────┘
       │ 1:N
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  analytics   │     │   comments   │     │activity_log  │
│              │     │              │     │              │
│  topic_id    │     │  target_type │     │  user_id     │
│  views       │     │  target_id   │     │  action      │
│  likes       │     │  content     │     │  target      │
│  shares      │     │  operator_id │     │  detail      │
│  comments    │     └──────────────┘     └──────────────┘
│  data_date   │
└──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ inspirations │     │ achievements │     │   calendar   │
│              │     │              │     │   _events    │
│  id (PK)     │     │  id (PK)     │     │              │
│  title       │     │  name        │     │  title       │
│  category    │     │  description │     │  event_date  │
│  votes       │     │  icon        │     │  event_type  │
│  creator_id  │     │  condition_  │     │  topic_id    │
│  status      │     │  type/value  │     │  creator_id  │
└──────────────┘     │  points      │     └──────────────┘
                     │  category    │
┌──────────────┐     │  rarity      │     ┌──────────────┐
│  resources   │     └──────┬───────┘     │  pomodoro    │
│              │            │ 1:N         │  _sessions   │
│  id (PK)     │            ▼             │              │
│  name        │     ┌──────────────┐     │  user_id     │
│  type        │     │    user_     │     │  topic_id    │
│  file_path   │     │ achievements │     │  duration    │
│  category    │     │              │     │  completed   │
│  content     │     │  user_id     │     │  started_at  │
│  uploader_id │     │  achievement │     │  ended_at    │
└──────────────┘     │  _id         │     └──────────────┘
                     │  earned_at   │
┌──────────────┐     └──────────────┘     ┌──────────────┐
│  templates   │                          │  roles       │
│              │     ┌──────────────┐     │              │
│  id (PK)     │     │  workflow_   │     │  code        │
│  name        │     │  templates   │     │  name        │
│  platform    │     │              │     │  is_system   │
│  template_   │     │  id (PK)     │     └──────┬───────┘
│  data        │     │  name        │            │ M:N
│  creator_id  │     │  is_default  │     ┌──────┴───────┐
│  is_default  │     └──────┬───────┘     │    role_     │
└──────────────┘            │ 1:N         │ permissions  │
                            ▼             │              │
                     ┌──────────────┐     │  role_id     │
                     │  workflow_   │     │  permission  │
                     │  nodes       │     │  _id         │
                     │              │     └──────┬───────┘
                     │  template_id │            │
                     │  name        │     ┌──────┴───────┐
                     │  node_order  │     │ permissions  │
                     │  status_from │     │              │
                     │  status_to   │     │  code        │
                     │  approver_   │     │  name        │
                     │  type/value  │     │  module      │
                     └──────────────┘     └──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  workflow_   │     │  user_roles  │     │ notification │
│  templates   │     │              │     │ _preferences │
│              │     │  user_id     │     │              │
│  ...         │     │  role_id     │     │  user_id     │
└──────────────┘     └──────────────┘     │  channel     │
                                          │  event_type  │
┌──────────────┐     ┌──────────────┐     │  enabled     │
│  approval_   │     │ announcement │     └──────────────┘
│  records     │     │              │
│              │     │  content     │     ┌──────────────┐
│  topic_id    │     │  type        │     │    douyin_   │
│  node_id     │     │  pinned      │     │   accounts   │
│  approver_id │     │  creator_id  │     │              │
│  status      │     └──────────────┘     │  name        │
│  comment     │                          │  profile_url │
└──────────────┘                          │  douyin_id   │
                                          └──────┬───────┘
                                                 │ 1:N
                                          ┌──────┴───────┐
                                          │  douyin_     │
                                          │  snapshots   │
                                          │              │
                                          │  account_id  │
                                          │  followers   │
                                          │  likes       │
                                          │  video_count │
                                          └──────┬───────┘
                                                 │ 1:N
                                          ┌──────┴───────┐
                                          │  douyin_     │
                                          │  videos      │
                                          │              │
                                          │  snapshot_id │
                                          │  title       │
                                          │  likes       │
                                          │  comments    │
                                          │  shares      │
                                          └──────────────┘
```

### 6.2 核心表字段详解

#### topics（选题表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 主键 |
| title | TEXT | 选题标题 |
| description | TEXT | 选题描述（HTML） |
| outline | TEXT | 剧本大纲（HTML） |
| outline_json | TEXT | 剧本大纲（Tiptap JSON） |
| outline_markdown | TEXT | 剧本大纲（Markdown） |
| status | TEXT | 状态：pending/approved/rejected/production/shooting/publishing/completed |
| platform | TEXT | 目标平台 |
| deadline | DATETIME | 截止日期 |
| creator_id | INTEGER FK | 创建者 |
| assignee_id | INTEGER FK | 负责人 |
| workflow_template_id | INTEGER FK | 关联审批流模板 |
| submitted_at | DATETIME | 提交时间 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### production（创作表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 主键 |
| topic_id | INTEGER FK | 关联选题 |
| version | TEXT | 版本号（如 v1.0） |
| content | TEXT | 剧本内容（HTML） |
| content_json | TEXT | 剧本内容（Tiptap JSON） |
| content_markdown | TEXT | 剧本内容（Markdown） |
| status | TEXT | 状态：draft/reviewing/approved |
| file_path | TEXT | 附件路径 |
| operator_id | INTEGER FK | 操作者 |
| toc_json | TEXT | 目录结构（JSON） |
| comments_json | TEXT | 批注数据（JSON） |
| editor_version | TEXT | 编辑器版本 |
| last_saved_at | DATETIME | 最后保存时间 |

#### workflow_templates / workflow_nodes（审批流模板）

| 表 | 字段 | 说明 |
|----|------|------|
| workflow_templates | id, name, description, is_default | 审批流模板 |
| workflow_nodes | id, template_id, name, node_order, status_from, status_to, approver_type, approver_value, is_required | 审批节点 |

#### roles / permissions / role_permissions / user_roles（权限系统）

| 表 | 说明 |
|----|------|
| roles | 角色定义（admin/director/member/editor + 自定义） |
| permissions | 权限定义（25 个权限，按模块分组） |
| role_permissions | 角色-权限映射（M:N） |
| user_roles | 用户-角色映射（M:N，支持多角色） |

---

## 7. 后端 API 架构

### 7.1 路由注册顺序

```typescript
// api/app.ts
app.use('/api/auth', authRoutes)              // 认证
app.use('/api/topics', topicsRoutes)           // 选题
app.use('/api/users', usersRoutes)             // 用户
app.use('/api/messages', messagesRoutes)       // 消息
app.use('/api/analytics', analyticsRoutes)     // 分析
app.use('/api/resources', resourcesRoutes)     // 资源
app.use('/api/workflow', workflowRoutes)       // 工作流（创作/拍摄/发布）
app.use('/api/inspirations', inspirationsRoutes) // 灵感
app.use('/api/templates', templatesRoutes)     // 模板
app.use('/api/achievements', achievementsRoutes) // 成就
app.use('/api/announcements', announcementsRoutes) // 公告
app.use('/api/pomodoro', pomodoroRoutes)       // 番茄钟
app.use('/api/calendar', calendarRoutes)       // 日历
app.use('/api/export', exportRoutes)           // 导出
app.use('/api/douyin', douyinRoutes)           // 抖音
app.use('/api/backup', backupRoutes)           // 备份
app.use('/api/roles', rolesRoutes)             // 角色
app.use('/api/permissions', permissionsRoutes) // 权限
app.use('/api/workflow-templates', workflowTemplatesRoutes) // 审批流模板
app.use('/api/notifications', notificationsRoutes) // 通知偏好
```

### 7.2 中间件链

```
请求进入
  │
  ▼
CORS（允许局域网 IP）
  │
  ▼
express.json({ limit: '10mb' })
  │
  ▼
apiLimiter（全局限流）
  │
  ▼
authenticate（JWT 验证 → 查库获取用户 → 注入 req.user）
  │
  ▼
requireRole（角色检查，可选）
  │
  ▼
requirePermission（权限检查，可选，带 5 分钟缓存）
  │
  ▼
路由处理函数
  │
  ▼
统一响应格式（sendSuccess / sendError / sendNotFound）
```

### 7.3 统一响应格式

```typescript
// 成功
{ success: true, data: T, message?: string }

// 成功（分页）
{ success: true, data: T[], pagination: { page, limit, total } }

// 错误
{ success: false, message: string, error?: string }
```

### 7.4 API 模块清单

| 模块 | 路径 | 主要端点 | 认证 | 权限 |
|------|------|---------|------|------|
| 认证 | `/api/auth` | POST /login, GET /me, PUT /password | 部分 | — |
| 选题 | `/api/topics` | GET /, POST /, PUT /:id, DELETE /:id, POST /:id/audit, POST /:id/status | ✅ | topic:* |
| 工作流 | `/api/workflow` | GET/POST/PUT/DELETE production/shooting/publishing, comments | ✅ | workflow:* |
| 审批流模板 | `/api/workflow-templates` | GET/POST/PUT/DELETE templates, nodes | ✅ | system:role |
| 用户 | `/api/users` | GET /, POST /, PUT /:id, DELETE /:id, GET /logs | ✅ | user:* |
| 消息 | `/api/messages` | GET /, GET /unread, PUT /:id/read, DELETE / | ✅ | — |
| 分析 | `/api/analytics` | GET /team-stats, /monthly, /user-stats, POST / | ✅ | analytics:* |
| 资源 | `/api/resources` | GET /, POST /, PUT /:id, DELETE /:id | ✅ | — |
| 灵感 | `/api/inspirations` | GET /, POST /, POST /:id/vote, DELETE /:id | ✅ | — |
| 模板 | `/api/templates` | GET /, POST /, PUT /:id, DELETE /:id | ✅ | system:template |
| 成就 | `/api/achievements` | GET /, POST /check, GET /leaderboard, CRUD | ✅ | system:achievement |
| 公告 | `/api/announcements` | GET /, POST /, PUT /:id, DELETE /:id | ✅ | system:announcement |
| 番茄钟 | `/api/pomodoro` | POST /start, POST /complete, GET /stats, GET /ranking | ✅ | — |
| 日历 | `/api/calendar` | GET /, POST /, PUT /:id, DELETE /:id | ✅ | — |
| 导出 | `/api/export` | GET /topics, GET /analytics, GET /weekly-report | ✅ | export:data |
| 抖音 | `/api/douyin` | GET /accounts, POST /scrape, GET /snapshots, GET /videos | ✅ | system:douyin |
| 备份 | `/api/backup` | POST /create, GET /list, GET /download/:name, DELETE /:name | ✅ | system:backup |
| 角色 | `/api/roles` | GET /, POST /, PUT /:id, DELETE /:id | ✅ | system:role |
| 权限 | `/api/permissions` | GET /, GET /my, POST /, DELETE /:id | ✅ | system:permission |
| 通知 | `/api/notifications` | GET /preferences, PUT /preferences, GET /channels, GET /events | ✅ | — |

---

## 8. 前端架构

### 8.1 路由结构

```typescript
// App.tsx — 所有页面懒加载
/login                    → Login
/                         → Home (仪表盘)
/topics                   → Topics (选题列表)
/topics/add               → AddTopic (新建选题)
/topics/:id               → TopicDetail (选题详情)
/production               → Production (创作列表)
/production/:id           → ProductionDetail (创作详情，Tiptap 编辑器)
/shooting                 → Shooting (拍摄列表)
/shooting/:id             → ShootingDetail (拍摄详情)
/publishing               → Publishing (发布列表)
/publishing/:id           → PublishingDetail (发布详情)
/analytics                → Analytics (数据分析)
/douyin                   → DouyinAnalytics (抖音数据)
/users                    → Users (用户管理)
/resources                → Resources (资源库)
/messages                 → Messages (消息中心)
/kanban                   → Kanban (看板视图)
/calendar                 → Calendar (排期日历)
/inspirations             → Inspirations (灵感池)
/achievements             → Achievements (成就系统)
/activity                 → ActivityLog (活动日志)
/permissions              → PermissionManagement (角色权限)
/workflow-designer        → WorkflowDesigner (审批流设计)
/notification-settings    → NotificationSettings (系统设置)
/export                   → ExportPage (数据导出)
/pomodoro                 → PomodoroPage (番茄钟)
/backup                   → BackupPage (备份管理)
```

### 8.2 API 调用层

前端 API 调用层 (`src/api/`) 封装了所有与后端的通信：

```typescript
// 统一模式
const token = useAuthStore.getState().token;
const response = await fetch('/api/xxx', {
  headers: { Authorization: `Bearer ${token}` },
  method: 'POST',
  body: JSON.stringify(data),
});
const result = await response.json();
```

每个 API 模块导出一组函数，如：
```typescript
// src/api/topics.ts
export async function getTopics(params): Promise<PaginatedResponse<Topic>>
export async function getTopic(id: number): Promise<Topic>
export async function createTopic(data: CreateTopicRequest): Promise<{ topicId: number }>
export async function updateTopic(id: number, data: UpdateTopicRequest): Promise<void>
export async function deleteTopic(id: number): Promise<void>
export async function auditTopic(id: number, data: AuditTopicRequest): Promise<void>
export async function updateTopicStatus(id: number, status: TopicStatus): Promise<void>
```

### 8.3 编辑器架构

系统有两套编辑器：

| 编辑器 | 技术 | 用途 | 位置 |
|--------|------|------|------|
| Tiptap Editor | Tiptap 2 + StarterKit | 创作管理（剧本）、选题大纲 | `components/editor/` |
| Quill Editor | Quill 2 | 选题描述（旧版） | `components/RichTextEditor.tsx` |

#### Tiptap Editor 扩展列表

| 扩展 | 功能 |
|------|------|
| StarterKit | 基础格式（标题/粗体/斜体/列表/引用/代码...） |
| Table + TableRow + TableCell + TableHeader | 表格 |
| Image | 图片插入 |
| TaskList + TaskItem | 待办列表 |
| Link | 超链接 |
| Placeholder | 占位符 |
| Underline | 下划线 |
| Highlight (multicolor) | 多色高亮 |
| Typography | 排版增强 |
| TextAlign | 文本对齐 |
| TextStyle + Color | 文字颜色 |
| CommentExtension | 批注（自定义 Mark） |

---

## 9. 状态管理

### 9.1 Zustand Stores

```typescript
// store/index.ts — 4 个 Store

useAuthStore     // 认证状态
  ├── user: User | null
  ├── token: string | null
  ├── isLoggedIn: boolean
  ├── login(user, token)
  └── logout()

useTopicStore    // 选题状态
  ├── topics: Topic[]
  ├── currentTopic: Topic | null
  ├── setTopics / setCurrentTopic / addTopic / updateTopic

useMessageStore  // 消息状态
  ├── messages: Message[]
  ├── unreadCount: number
  ├── setMessages / setUnreadCount / markAsRead / addMessage

useAppStore      // 应用状态
  ├── sidebarCollapsed: boolean
  ├── theme: 'light' | 'dark'
  ├── fontSize: number
  ├── notifications: Notification[]
  ├── toggleSidebar / toggleTheme / setFontSize
  └── addNotification / removeNotification
```

### 9.2 持久化策略

| 数据 | 存储位置 | 说明 |
|------|---------|------|
| 用户信息 + Token | localStorage (`xmt_user`, `xmt_token`) | 登录态 |
| 主题 | localStorage (`xmt_theme`) | 深色/浅色 |
| 字体大小 | localStorage (`xmt_fontSize`) | 界面字号 |
| 系统设置 | localStorage (`xmt_system_settings`) | 系统名称/图标/Logo/默认主题/字号 |
| 桌面通知偏好 | localStorage (`xmt_desktop_notify`) | 开关/声音 |
| 更新日志版本 | localStorage (`xmt_last_seen_version`) | 已读版本 |

---

## 10. 权限系统

### 10.1 角色模型

```
┌─────────────────────────────────────────────────────────┐
│                    RBAC 权限模型                          │
│                                                          │
│   User ──M:N──→ Role ──M:N──→ Permission                │
│                                                          │
│   预设角色：                                              │
│   ├── admin (管理员)    → 所有权限（通配符 *）              │
│   ├── director (编导)   → 除系统管理外的所有权限            │
│   ├── member (成员)     → 基础权限（创建/查看/编辑选题）     │
│   └── editor (编辑)     → 内容编辑权限                     │
│                                                          │
│   权限编码格式：模块:操作                                   │
│   ├── topic:create / topic:view / topic:update / ...     │
│   ├── workflow:production / workflow:shooting / ...       │
│   ├── user:view / user:create / ...                      │
│   ├── analytics:view / analytics:create / ...            │
│   └── system:backup / system:role / ...                  │
└─────────────────────────────────────────────────────────┘
```

### 10.2 权限模块分组

| 模块 | 权限编码 | 说明 |
|------|---------|------|
| topic | create, view, update, delete, audit, status | 选题管理 |
| workflow | production, shooting, publishing, comment | 工作流管理 |
| user | view, create, update, delete, logs | 用户管理 |
| analytics | view, create | 数据分析 |
| export | data | 数据导出 |
| system | backup, announcement, template, achievement, douyin, role, permission | 系统管理 |

### 10.3 权限检查流程

```
前端：
  usePermission() Hook
    → GET /api/permissions/my
    → 返回 permissions[] 数组
    → hasPermission('topic:create') 检查

后端：
  requirePermission('topic:create') 中间件
    → 从缓存或数据库查询用户权限
    → admin 角色直接通过
    → 检查是否拥有所需权限（任一即可）
    → 403 权限不足 / next()
```

---

## 11. 实时通信

### 11.1 Socket.IO 架构

```
┌──────────────┐                    ┌──────────────┐
│   Client A   │──── WebSocket ────│              │
│  (Socket.IO) │                    │   Server     │
└──────────────┘                    │  (Socket.IO) │
                                    │              │
┌──────────────┐                    │  Rooms:      │
│   Client B   │──── WebSocket ────│  ├── topics  │
│  (Socket.IO) │                    │  ├── inspirations │
└──────────────┘                    │  ├── user_{id} │
                                    │  └── admin_channel │
                                    └──────────────┘
```

### 11.2 事件类型

| 事件 | 方向 | 说明 |
|------|------|------|
| `subscribe` | Client→Server | 用户订阅自己的通知频道 |
| `join` | Client→Server | 加入房间（如 topics, inspirations） |
| `leave` | Client→Server | 离开房间 |
| `topic:created` | Server→Client | 新选题创建 |
| `topic:updated` | Server→Client | 选题更新 |
| `topic:audited` | Server→Client | 选题审核 |
| `topic:deleted` | Server→Client | 选题删除 |
| `inspiration:voted` | Server→Client | 灵感投票 |
| `new_message` | Server→Client | 新站内消息 |
| `unread_count` | Server→Client | 未读消息数更新 |

### 11.3 广播工具

```typescript
// 单播：推送给指定用户
notifyUser(userId, event, data)

// 广播：推送给房间内所有人（可排除操作者）
broadcastToRoom(room, event, data, excludeSocketId?)
```

---

## 12. 各子系统详解

### 12.1 选题管理子系统

**职责**：选题的创建、审核、状态流转、大纲编辑

**前端页面**：
- `Topics.tsx` — 选题列表（筛选/搜索/分页/批量操作）
- `AddTopic.tsx` — 新建选题（表单 + Quill 编辑器）
- `TopicDetail.tsx` — 选题详情（信息/大纲/流程/历史/评论）

**后端路由**：`/api/topics`

**关键逻辑**：
- 状态机校验（`api/utils/workflow.ts`）
- 审核时自动创建 Production 记录
- 状态推进时自动创建对应阶段记录
- 消息通知（创建者 + 负责人 + 管理员）

**数据流**：
```
用户创建选题 → POST /api/topics → 插入 topics 表
  → 插入 topic_history → 发送消息通知 → Socket 广播

管理员审核 → POST /api/topics/:id/audit → 更新 status
  → 插入 topic_history → 创建 Production → 发送消息 → Socket 广播

状态推进 → POST /api/topics/:id/status → 状态机校验
  → 更新 status → 创建对应阶段记录 → 发送消息 → Socket 广播
```

---

### 12.2 创作管理子系统

**职责**：剧本编辑、版本管理、批注评论

**前端页面**：
- `Production.tsx` — 创作列表
- `ProductionDetail.tsx` — 创作详情（Tiptap 编辑器 + 侧边栏）

**后端路由**：`/api/workflow` (production 相关)

**关键逻辑**：
- Tiptap 编辑器：HTML + JSON + Markdown 三格式存储
- 版本历史：每次保存创建 ProductionHistory 记录
- 批注：CommentExtension（自定义 Mark），存储在 HTML 中
- 高亮：多色高亮（8 种颜色），`<mark data-color="yellow">`

**编辑器数据流**：
```
编辑器内容变化 → onChange(html)
  → 保存时：同时生成 JSON + Markdown
  → POST /api/workflow/production
  → 存入 production 表（content + content_json + content_markdown）
  → 创建 production_history 记录
```

---

### 12.3 拍摄管理子系统

**职责**：拍摄计划、场地设备管理

**前端页面**：
- `Shooting.tsx` — 拍摄列表
- `ShootingDetail.tsx` — 拍摄详情

**后端路由**：`/api/workflow` (shooting 相关)

**关键字段**：plan_date, location, equipment, status, script_content

---

### 12.4 发布管理子系统

**职责**：内容发布、平台管理、数据追踪

**前端页面**：
- `Publishing.tsx` — 发布列表
- `PublishingDetail.tsx` — 发布详情

**后端路由**：`/api/workflow` (publishing 相关)

**关键字段**：platform, url, publish_time, views, likes, shares, comments, script_content

---

### 12.5 数据分析子系统

**职责**：团队/个人/月度数据统计、抖音数据采集

**前端页面**：
- `Analytics.tsx` — 综合数据分析（图表/趋势/排名）
- `DouyinAnalytics.tsx` — 抖音数据（账号/粉丝/视频/趋势）

**后端路由**：`/api/analytics`, `/api/douyin`

**数据来源**：
- 手动录入（views/likes/shares/comments）
- 抖音爬虫（`api/services/douyin.ts`）

---

### 12.6 用户管理子系统

**职责**：用户 CRUD、操作日志、密码管理

**前端页面**：
- `Users.tsx` — 用户管理
- `PermissionManagement.tsx` — 角色权限管理

**后端路由**：`/api/users`, `/api/roles`, `/api/permissions`

**默认用户**：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |
| director | director123 | 编导 |
| member1 | member123 | 成员 |
| member2 | member123 | 成员 |

> ⚠️ 首次登录强制修改密码（`force_change_password`）

---

### 12.7 灵感池子系统

**职责**：团队灵感收集、投票、转化为选题

**前端页面**：`Inspirations.tsx`

**后端路由**：`/api/inspirations`

**关键逻辑**：
- 投票去重（`inspiration_votes` 表，UNIQUE 约束）
- 灵感转选题（`promoteInspiration`）
- Socket 实时同步投票数

---

### 12.8 成就系统子系统

**职责**：游戏化激励、徽章收集、排行榜

**前端页面**：`Achievements.tsx`

**后端路由**：`/api/achievements`

**成就类别**：创作达人、效率之星、社交达人、里程碑、特殊成就

**稀有度**：普通、稀有、史诗、传说

**条件类型**：选题数、完成数、番茄钟数、灵感数、登录天数、发布数、播放量、点赞量

---

### 12.9 番茄钟子系统

**职责**：专注计时、效率统计、团队排名

**前端页面**：`PomodoroPage.tsx` + `PomodoroTimer.tsx`（全局悬浮组件）

**后端路由**：`/api/pomodoro`

---

### 12.10 系统设置子系统

**职责**：通知偏好、个人信息、外观、系统配置、备份

**前端页面**：`NotificationSettings.tsx`（一个页面，多个 Tab）

**Tab 结构**：
- 通知设置 — 通知矩阵（事件 × 渠道）+ 桌面通知
- 个人信息 — 名称/邮箱/角色
- 修改密码 — 旧密码/新密码
- 外观设置 — 主题/字体大小
- 系统设置（管理员）— 系统名称/图标/Logo/默认主题/字号
- 数据管理（管理员）— 备份创建/下载/删除
- 系统更新说明 — Changelog
- 关于系统 — 版本/技术栈/功能模块

---

### 12.11 审批流子系统

**职责**：自定义审批流程、节点配置

**前端页面**：`WorkflowDesigner.tsx`

**后端路由**：`/api/workflow-templates`

**数据模型**：
- `workflow_templates` — 审批流模板
- `workflow_nodes` — 审批节点（顺序/状态转换/审批人）
- `approval_records` — 审批记录

---

### 12.12 看板/日历子系统

**前端页面**：
- `Kanban.tsx` — 看板视图（拖拽排序，按状态分列）
- `Calendar.tsx` — 排期日历（事件管理，自动同步选题截止日期）

---

## 13. 数据流转全景图

### 13.1 选题创建到发布的完整数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户操作层                                 │
│                                                                  │
│  1. 创建选题          2. 审核           3. 编辑剧本              │
│  AddTopic.tsx         TopicDetail.tsx   ProductionDetail.tsx     │
│     │                    │                  │                    │
│     ▼                    ▼                  ▼                    │
│  POST /topics      POST /topics/      PUT /workflow/             │
│                    :id/audit          production/:id              │
│                                                                  │
│  4. 拍摄计划          5. 发布           6. 数据录入              │
│  ShootingDetail.tsx   PublishingDetail  Analytics.tsx            │
│     │                    │                  │                    │
│     ▼                    ▼                  ▼                    │
│  PUT /workflow/     PUT /workflow/     POST /analytics           │
│  shooting/:id       publishing/:id                              │
└─────────────────────────────────────────────────────────────────┘
         │                │                   │
         ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API 路由层                                 │
│                                                                  │
│  topics.ts ──→ workflow.ts ──→ analytics.ts                     │
│       │              │               │                           │
│       ▼              ▼               ▼                           │
│  状态机校验      CRUD 操作        数据聚合                        │
│  (workflow.ts)                                                    │
│       │                                                           │
│       ▼                                                           │
│  消息通知 ──→ messageHelper.ts ──→ messages 表                   │
│  实时推送 ──→ socket.ts ──→ Socket.IO 广播                       │
│  活动日志 ──→ activity_log 表                                    │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        数据库层                                   │
│                                                                  │
│  topics ←→ production ←→ shooting ←→ publishing                │
│     ↕           ↕                                               │
│  topic_history  production_history                               │
│     ↕                                                           │
│  comments (target_type + target_id 多态关联)                     │
│     ↕                                                           │
│  analytics (按 topic_id + data_date 记录)                        │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        实时推送层                                 │
│                                                                  │
│  Socket.IO ──→ 前端 useSocket/useRealtimeSync                   │
│     │                                                            │
│     ├── topic:created/updated/audited/deleted                   │
│     ├── inspiration:voted                                       │
│     ├── new_message                                             │
│     └── unread_count                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 14. 解耦指南

### 14.1 当前耦合点分析

| 耦合点 | 位置 | 问题 | 建议 |
|--------|------|------|------|
| 选题删除级联 | `topics.ts` DELETE | 手动删除 production/shooting/comments/history | 改为数据库外键 CASCADE 或软删除 |
| 状态推进自动创建记录 | `topics.ts` POST /status | 状态变更时自动创建 production/shooting/publishing | 抽取为独立的 WorkflowService |
| 消息通知内联 | 各路由文件 | 每个路由都直接调用 createMessage | 统一为事件驱动（EventEmitter） |
| 编辑器三格式存储 | production 表 | content + content_json + content_markdown 冗余 | 只存 JSON，其他按需生成 |
| 前端 API 层与页面耦合 | pages/* | 部分页面直接 fetch，部分用 api/* | 统一使用 api/* 层 |
| 系统设置用 localStorage | NotificationSettings | 系统级配置存在客户端 | 迁移到数据库 + API |

### 14.2 推荐解耦方案

#### 方案一：事件驱动架构

```
当前：路由直接调用各工具函数
目标：路由 → 发布事件 → 各订阅者处理

示例：
  topic:created → 消息通知服务 / 活动日志服务 / Socket 广播服务
  topic:status_changed → 自动创建记录 / 消息通知 / Socket 广播
```

#### 方案二：服务层抽取

```
当前：路由文件包含业务逻辑
目标：routes/ → services/ → database/

api/
├── routes/          # 只负责参数校验 + 调用 service + 返回响应
├── services/        # 业务逻辑层
│   ├── TopicService.ts
│   ├── ProductionService.ts
│   ├── NotificationService.ts
│   └── WorkflowService.ts
├── repositories/    # 数据访问层
│   ├── TopicRepository.ts
│   └── ...
└── events/          # 事件总线
    └── EventBus.ts
```

#### 方案三：前端模块化

```
当前：pages/* 直接引用 api/* + store + hooks
目标：每个模块独立

src/
├── modules/
│   ├── topic/
│   │   ├── api.ts           # 该模块的 API
│   │   ├── store.ts         # 该模块的状态
│   │   ├── hooks.ts         # 该模块的 hooks
│   │   ├── types.ts         # 该模块的类型
│   │   ├── pages/           # 该模块的页面
│   │   └── components/      # 该模块的组件
│   ├── production/
│   ├── shooting/
│   └── ...
└── shared/                  # 共享层
    ├── components/
    ├── hooks/
    └── utils/
```

### 14.3 子系统独立性评估

| 子系统 | 可独立性 | 依赖 | 说明 |
|--------|---------|------|------|
| 选题管理 | ⭐⭐⭐ | users, messages | 核心模块，其他模块依赖它 |
| 创作管理 | ⭐⭐⭐⭐ | topics (仅 topic_id) | 可独立，只通过 topic_id 关联 |
| 拍摄管理 | ⭐⭐⭐⭐ | topics (仅 topic_id) | 可独立 |
| 发布管理 | ⭐⭐⭐⭐ | topics (仅 topic_id) | 可独立 |
| 数据分析 | ⭐⭐⭐⭐⭐ | topics (仅 topic_id) | 完全可独立 |
| 灵感池 | ⭐⭐⭐⭐⭐ | users | 完全可独立 |
| 成就系统 | ⭐⭐⭐⭐ | users | 几乎可独立，需用户数据 |
| 番茄钟 | ⭐⭐⭐⭐⭐ | users, topics (可选) | 完全可独立 |
| 日历 | ⭐⭐⭐⭐⭐ | topics (可选) | 完全可独立 |
| 抖音数据 | ⭐⭐⭐⭐⭐ | 无 | 完全独立 |
| 资源库 | ⭐⭐⭐⭐⭐ | users | 完全可独立 |
| 系统设置 | ⭐⭐⭐⭐ | users | 几乎可独立 |
| 权限系统 | ⭐⭐⭐ | users | 可独立，但被其他模块依赖 |
| 公告系统 | ⭐⭐⭐⭐⭐ | users | 完全可独立 |

---

## 15. 附录

### 15.1 环境变量

```env
PORT=3001
JWT_SECRET=your-secret-key
CORS_ORIGINS=http://localhost:5174,http://localhost:3001
```

### 15.2 启动命令

```bash
# 开发模式
npm run dev          # 同时启动前端 (Vite) + 后端 (Express)

# 生产模式
npm run build        # 构建前端
npm start            # 启动后端（服务 dist/ 静态文件）
```

### 15.3 数据库迁移策略

系统使用 **增量 ALTER TABLE** 方式迁移：

```typescript
// 每次启动时尝试添加新列，已存在则忽略
try { await db.execute(`ALTER TABLE xxx ADD COLUMN yyy TEXT`); } catch (e) {}
```

> ⚠️ 此方式简单但不适合复杂迁移。如需正式迁移，建议引入 migrate-ts 等工具。

### 15.4 备份机制

- **自动备份**：服务启动时 + 每天凌晨 3:00
- **手动备份**：系统设置 → 数据管理
- **备份目录**：`backups/`
- **备份格式**：SQLite 文件副本（`.db`）
- **清理策略**：保留最近 30 个备份

### 15.5 关键文件快速索引

| 需求 | 文件 |
|------|------|
| 修改数据库表结构 | `api/database/db.ts` |
| 添加新 API | `api/routes/xxx.ts` + `api/app.ts` 注册 |
| 修改状态机 | `api/utils/workflow.ts` |
| 添加新权限 | `api/database/db.ts` (初始化) + `api/middleware/permissions.ts` |
| 修改编辑器 | `src/components/editor/Editor.tsx` |
| 添加新页面 | `src/pages/Xxx.tsx` + `src/App.tsx` 路由 |
| 修改全局样式 | `src/index.css` |
| 修改常量 | `src/constants/index.ts` |
| 修改类型定义 | `shared/types/index.ts` |
| Socket 事件 | `api/utils/socket.ts` (后端) + `src/hooks/useSocket.ts` (前端) |
| 系统设置 | `src/pages/NotificationSettings.tsx` |
| 侧边栏导航 | `src/components/Sidebar.tsx` |

---

> 📝 文档由小叶 🦊 自动生成，如有疑问随时问我
