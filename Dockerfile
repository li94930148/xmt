# XMT 新媒体协作管理系统 - Docker 配置

# 使用 Node.js 20 Alpine 镜像
FROM node:20-alpine AS base

# 安装依赖所需工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --production=false

# 复制源代码
COPY . .

# 构建前端
RUN npm run build

# 生产阶段
FROM node:20-alpine AS production

WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache tini

# 复制 package 文件
COPY package*.json ./

# 只安装生产依赖
RUN npm ci --production

# 复制构建产物和后端代码
COPY --from=base /app/dist ./dist
COPY --from=base /app/api ./api
COPY --from=base /app/shared ./shared
COPY --from=base /app/tsconfig.json ./
COPY --from=base /app/tsconfig.node.json ./

# 创建数据目录
RUN mkdir -p data backups

# 设置权限
RUN chown -R node:node /app

# 切换到非 root 用户
USER node

# 暴露端口
EXPOSE 3001

# 使用 tini 作为 init 进程
ENTRYPOINT ["/sbin/tini", "--"]

# 启动命令
CMD ["node", "--import", "tsx", "api/server.ts"]
