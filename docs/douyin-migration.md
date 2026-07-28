# 抖音运营数据 Creator Agent 架构

正式数据链路：

`抖音创作者中心 → macOS/Windows Creator Agent → 规范化协议 → XMT 服务端 → SQLite → 运营中心`

## 职责

- Agent：管理本地浏览器登录、监听页面网络响应、低频补采详情、分页、断点任务、本地日志和加密上传。
- 服务端：设备认证、时间窗和 nonce 防重放、数据包限制、账号绑定校验、幂等入库、聚合分析和前端 API。
- 前端：展示 Agent 在线状态、最后同步时间、数据完整度和已入库的真实指标。

Linux 服务器不得登录抖音创作者中心或保存浏览器 Profile。

## 协议

当前 `schema_version=1`、`protocol_version=1`。请求包含 Agent ID、设备 ID、Agent 版本、平台账号、时间戳、nonce、采集时间和加密数据。服务端拒绝超时、重放、跨账号和超过12MB的数据包。

字段缺失使用 `null` 和 availability，不转换为0。业务日期统一按 `Asia/Shanghai`。

## 官方开放平台隔离

`/api/douyin` 的运营数据读取与同步入口返回410，不再调用官方 API。OAuth绑定、解绑和 Webhook仍保留，供与运营数据无关的既有能力使用。运营中心路由全部指向 Creator Agent 数据页面，官方定时同步器不再启动。

## 兼容与回滚

- 既有32条作品和319条作品快照不删除、不改写。
- 新 migration 均采用 `CREATE IF NOT EXISTS` 或可重复执行的列补充。
- 不自动合并数字抖音号与 `sec_uid` 两条历史身份链路。
- 部署前备份数据库及 WAL/SHM；回滚应用代码不会删除新增列或真实数据。

## 历史凭据

`douyin_tokens` 只保留用于审计。`npm run audit:douyin-legacy-tokens` 默认只报告记录数量；只有显式传入 `--confirm-delete` 和已存在的 `--backup=/absolute/path.db` 才会清空。旧凭据仍建议在平台侧轮换。
