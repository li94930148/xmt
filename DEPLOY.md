# XMT 新媒体协作管理系统 - 部署指南

## 一、环境要求

- Node.js >= 18.x（推荐 20.x）
- npm 或 pnpm
- 操作系统：Linux / Windows / macOS

## 二、快速部署（传统方式）

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，并修改配置：

```bash
cp .env.example .env
```

**必须修改的配置：**
- `JWT_SECRET`：使用随机生成的长字符串

生成随机密钥：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. 构建前端

```bash
npm run build
```

### 4. 启动服务

**开发模式：**
```bash
npm run dev
```

**生产模式：**
```bash
npm start
```

**使用 PM2（推荐）：**
```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start ecosystem.config.cjs

# 查看状态
pm2 status

# 查看日志
pm2 logs xmt

# 重启服务
pm2 restart xmt

# 停止服务
pm2 stop xmt

# 保存并设置开机启动
pm2 save
pm2 startup
```

## 三、Docker 部署

### 1. 构建镜像

```bash
docker build -t xmt .
```

### 2. 使用 Docker Compose（推荐）

创建 `.env` 文件后运行：

```bash
docker-compose up -d
```

查看日志：
```bash
docker-compose logs -f
```

停止服务：
```bash
docker-compose down
```

### 3. 单独运行 Docker

```bash
docker run -d \
  --name xmt \
  -p 3001:3001 \
  -v xmt-data:/app/data \
  -v xmt-backups:/app/backups \
  -e JWT_SECRET=your-secret-key \
  xmt
```

## 四、HTTPS 配置

### 方式 1：自签名证书（局域网）

```bash
# 运行证书生成脚本
node scripts/generate-cert.mjs
```

生成的证书在 `certs/` 目录，重启服务后自动启用 HTTPS。

### 方式 2：Let's Encrypt（公网）

使用 Certbot 获取免费证书，然后将证书文件放到 `certs/` 目录。

## 五、反向代理配置（Nginx）

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.IO 支持
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 六、备份与恢复

### 自动备份
- 启动时自动备份一次
- 每天凌晨 3 点自动备份
- 保留最近 30 份备份

### 手动备份
通过系统设置 -> 数据管理 -> 手动备份数据库

### 备份文件位置
- Docker：`/app/backups/`
- 传统部署：`./backups/`

## 七、常见问题

### 1. 忘记管理员密码

直接修改数据库或删除 `data/xmt.db` 重新初始化。

### 2. 端口被占用

修改 `.env` 中的 `PORT` 配置。

### 3. 桌面通知不工作

需要 HTTPS 环境，参考 HTTPS 配置章节。

### 4. 外网无法访问

1. 检查防火墙设置
2. 配置反向代理
3. 修改 `CORS_ORIGINS` 添加前端地址

## 八、系统默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |
| director | director123 | 编导 |
| member1 | member123 | 成员 |
| member2 | member123 | 成员 |

**首次登录必须修改密码！**
