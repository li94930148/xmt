# 抖音生产配置边界

抖音运营数据只允许由 macOS/Windows Creator Agent 从创作者中心采集。Linux 服务器不运行浏览器，不配置运营数据 OpenAPI 地址，也不启动官方 API 同步任务。

生产部署要求：

1. 备份 SQLite 主库、WAL 和 SHM，并验证备份可读。
2. 使用 HTTPS 暴露 `/api/creator-agent`。
3. 保持 Agent 设备令牌仅在创建或重置时显示一次。
4. 发布后检查协议版本、心跳、账号绑定和最近同步状态。
5. 在 Agent 在线且抖音登录有效时执行一次小样本同步，再执行完整同步。

`DOUYIN_CLIENT_KEY`、`DOUYIN_CLIENT_SECRET`、OAuth 回调和 Webhook配置仅供独立的授权/Webhook功能使用，不参与运营数据采集。不要为运营中心配置粉丝、作品或统计 OpenAPI URL。
