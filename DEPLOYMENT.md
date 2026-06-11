# 新媒体协作管理系统 - 部署文档

## 系统概述

本系统是一套纯局域网内网使用、完全私有化、无外网依赖的新媒体协作管理系统，复刻飞书新媒体协作平台的完整业务流程。

## 技术栈

- **前端**: React + TypeScript + Vite + TailwindCSS
- **后端**: Express + TypeScript
- **数据库**: SQLite (使用 sql.js，无需编译依赖)
- **实时消息**: Socket.io

## 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式运行

```bash
npm run dev
```

启动后访问:
- 前端: http://localhost:5173
- 后端API: http://localhost:3001

### 3. 生产构建

```bash
npm run build
```

### 4. 生产环境运行

```bash
npm start
```

## 访问方式

### 小型团队部署 (单台办公电脑)

直接在办公电脑上运行，团队成员通过内网IP访问：

```bash
# 获取内网IP
ipconfig  # Windows
ifconfig  # Linux/Mac

# 启动服务
npm start
```

访问地址: `http://<内网IP>:5173`

### 标准团队部署 (内网服务器/NAS)

1. 将项目文件复制到服务器
2. 安装依赖并构建
3. 使用 PM2 或 systemd 管理进程

#### 使用 PM2 (推荐)

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start npm --name "xmt-system" -- start

# 设置开机自启
pm2 startup
pm2 save
```

## 内置账号

系统初始化时会自动创建以下测试账号：

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| admin | admin123 | 管理员 | 拥有全部权限 |
| director | director123 | 编导 | 审核选题、管理流程 |
| member1 | member123 | 普通成员 | 提交选题、执行任务 |
| member2 | member123 | 普通成员 | 提交选题、执行任务 |

## 功能模块

### 1. 选题管理
- 员工提报选题
- 状态流转（待审核 → 已通过 → 创作中 → 拍摄中 → 剪辑中 → 发布中 → 已完成）
- 审核驳回功能
- 指派负责人
- 历史留痕
- 筛选搜索

### 2. 全流程进度管控
- 创作上传版本管理
- 拍摄计划登记
- 剪辑进度审核
- 发布记录管理

### 3. 数据复盘台账
- 播放、点赞、分享、评论数据录入
- 月度个人/团队统计
- 完成率、逾期率计算

### 4. 人员权限管理
- 角色体系：管理员 / 编导 / 普通成员
- 账号增删禁用
- 操作日志记录

### 5. 本地文件资源库
- 模板管理
- 内网文件关联
- 版本留存

### 6. 消息通知
- 选题提交通知管理员
- 审核结果通知负责人
- 任务截止预警
- 状态变更同步
- 超时提醒

## 数据库说明

数据库使用 SQLite，数据文件存储在 `data/xmt.db`。

### 备份与恢复

```bash
# 备份数据库
cp data/xmt.db data/xmt_backup.db

# 恢复数据库
cp data/xmt_backup.db data/xmt.db
```

## 安全说明

1. 系统仅在内网运行，无公网依赖
2. 密码使用 bcrypt 加密存储
3. 基于角色的权限控制
4. 操作日志记录所有关键操作

## 扩展功能预留

系统预留以下扩展接口：
- 内网打卡
- 设备登记
- 素材共享
- 绩效考核
- 数据备份

## 常见问题

### Q1: 启动时提示端口占用

```bash
# 查找占用进程
netstat -ano | findstr :3001  # Windows
lsof -i :3001  # Linux/Mac

# 结束进程
taskkill /F /PID <进程ID>  # Windows
kill -9 <进程ID>  # Linux/Mac
```

### Q2: 数据库文件权限问题

确保 `data` 目录有读写权限：

```bash
chmod -R 755 data  # Linux/Mac
```

### Q3: 页面加载缓慢

确保前端已构建：
```bash
npm run build
```

## 技术支持

如有问题，请检查：
1. Node.js 版本是否符合要求
2. 端口 3001 和 5173 是否被占用
3. 防火墙是否允许内网访问