# Creator Agent 官方导出数据契约 v2.20.3

## 覆盖状态

- 已确认：`作品列表导出.xlsx`，按表头识别作品名称、发布时间、播放、互动、完播、主页访问和粉丝增量；作品行以 `SHA-256(作品名称 + 发布时间)` 作为本地来源键。
- 已确认：`数据表现_收获音浪数据.xlsx`，按日期和收获音浪表头识别；当前真实样本只有表头、没有业务行（`NOT_OBSERVED`）。
- `COVERAGE_PASS_CURRENT_VISIBLE_SCOPE：是`。内容管理和数据中心的当前可见范围各有一个直接下载入口。
- `ASYNC_EXPORT_NOT_OBSERVED：是`。当前登录账号、权限和 UI 版本未观察到异步任务列表、导出历史或下载中心。
- `BLOCKED_OFFICIAL_EXPORT_COVERAGE：否`。本轮以当前可见范围为验收边界，不将未观察到的异步入口虚构为阻塞项。

## 当前可见入口矩阵（2026-08-28）

| 页面路径 | 页面标题/菜单 | 标签或筛选 | 导出按钮 | 类型 | 文件 | 解析 |
| --- | --- | --- | --- | --- | --- | --- |
| `/creator-micro/content/manage` | 内容管理 | 全部、已发布、审核中、未通过；所有时间 | 导出数据 | 直接下载 | 作品列表导出.xlsx | 已确认 |
| `/creator-micro/data-center/operation` | 数据中心 | 投稿、直播；08.11-08.17 | 导出数据 | 直接下载 | 数据表现_收获音浪数据.xlsx | 文件类型确认；真实业务行未观察到 |

基于当前登录账号、权限和 UI 版本共观察 3 个页面、2 个导出入口。未观察到异步任务列表或下载中心，因此不会虚构异步任务状态。

## 本地处理与上传边界

处理顺序：下载副本 → SHA-256 → XLSX 工作表/表头识别 → 类型/日期归一 → 空行与缺少核心字段拒绝 → 值去重 → 加密上传。解析使用锁定 Python runtime 的标准库，未将 `xlsx@0.18.5` 引入 Agent 打包依赖。

原始文件仅留在 Agent 数据目录。上传包只含文件名、哈希、字节数、标准指标、解析器版本和质量摘要；不含原始单元格、Cookie、Profile、密码、完整 URL 或 XHR。

## 本地离线队列

Agent SQLite 的 `upload_queue` 保存 canonical payload、其哈希、批次、文件哈希、状态与脱敏回执，不保存原始 Excel，也不保存任何已加密的传输信封。状态为 `pending`、`uploading`、`succeeded`、`retryable_failed`、`permanent_failed`；重启会把遗留 `uploading` 回收为可重试。相同账号、文件哈希与解析器版本不能重复入队。每次发送都从 canonical payload 新建 timestamp、nonce、AES-GCM 密文和 HMAC；成功记录保留以支持服务端重复批次回执核验。

队列调度器由 Electron 主进程单例持有，启动时恢复租约并立即扫描、运行中每 15 秒扫描、退出前停止并关闭本地数据库。未打包开发环境只允许向 loopback 测试服务器清队，不能使用用户已保存的生产服务器地址；打包应用保留原有合法服务器配置。即时同步仅入队后触发同一个调度器，不存在官方 v2 数据绕过队列的直接上传路径。

## 幂等与口径

文件级键：账号 + 文件 SHA-256 + 解析器版本；批次由稳定 UUID 表示。服务端按 Agent + batch_id 返回原结果。指标业务键为账号 + 来源作品键（收益为空）+ 日期 + metric_code；相同规范值计入 `unchanged`，变化才更新。

仪表盘读取模式由 `CREATOR_OFFICIAL_DASHBOARD_MODE` 白名单控制：默认 `existing_only`，保持既有公开响应；`shadow_compare` 仍返回旧口径，只记录不含标题、昵称或原始指标值的对账状态（`matched`、`different`、`existing_only`、`official_only`、`not_comparable`）；`official_preferred` 仅在已确认 `views` 指标存在时选择 `creator_official_metrics` 作为播放量单一来源，不叠加旧值，缺失时确定性回退旧来源。

## 安全与回滚

继续使用 `/api/creator-agent/data-sync`、protocol v1 信封、AES-256-GCM、HMAC-SHA256、timestamp、nonce、五分钟窗口、原子 nonce 保留和 Agent/账号绑定。`schema_version: 2` 仅路由业务载荷；v1 Agent 与现有 OAuth、Webhook、OpenAPI 不变。回滚为停止发送 v2；新审计表不影响既有读取路径。
