# Changelog

## 2.10.2-storage - 2026-07-24

- Creator 数据查看权限与管理权限分离：具有 `creator:data:view` 的系统角色可查看已完成标准化同步的公开平台账号，管理操作仍仅限 admin、director。
- Creator Agent 抖音驾驶舱、作品库、趋势、同步日志和运营分析查询统一使用公开查看范围；同步、绑定和授权管理继续保留权限隔离。
- 抖音作品库 API 增加 cursor 分页，默认 20 条、最大 100 条，前端按页加载。
- 统一作品封面解析顺序，并为作品库与驾驶舱 TOP5 增加懒加载和失败占位。
- 本阶段不修改数据库结构、不执行生产数据库变更，也不清理历史数据。

## 2.10.2-sync - 2026-07-24

- 服务端按 `contract_version` 分流，支持 v2.10.2 严格 `DouyinWorkInput`，并兼容无版本/v2.10.1 payload。
- 同一作品在单个事务中写入 `creator_content_items` 与 `douyin_works`，通过 `content_id` 关联。
- 同步日志增加契约、采集模式、快照和统计摘要字段；`snapshot_id` 支持幂等提交。
- 历史直接删除逻辑改为只读污染候选报告，本阶段不清理历史数据。

## 2.10.2-agent - 2026-07-24

- Agent 增加安全 JSON 解析、超长 ID 字符串保真、严格作品识别、cursor 分页及 v2.10.2 上传契约。
- 修复编辑器右键菜单定位和 BubbleMenu 互斥问题，保留多人协作光标链路。

## 2.10.1 - 2026-07-24

- 新增标准 `douyin_*` 账号、作品、日快照、作品快照、分析和同步日志模型。
- Creator Center 运营分析与趋势改为读取标准抖音真实表。

## 2.10.0 - 2026-07-23

- Creator Data Center 升级为独立账号数据分析中心，新增数据驾驶舱、作品库、作品复盘、趋势分析、粉丝分析与运营报告。
- 新增数据库规则驱动的 `CreatorAnalyticsService`，提供账号健康度、作品透明评分、评论关键词、流量结构与周期趋势计算。
- 新增日报、周报、月报数据分析报告，以及 `creator:report:view`、`creator:report:manage` 权限。
- 保持 Creator Agent、真实 Chrome CDP、Network Collector、Page Explorer、AES-256-GCM、HMAC-SHA256 与 `/data-sync` 协议不变。

## 2.9.1 - 2026-07-23

### 稳定性与治理

- Agent 新增本地同步任务账本，记录运行、成功、部分成功和失败状态及模块计数。
- 上传层按 `platform_item_id` 增量发送新作品，指标继续按 `snapshot_time` 保存历史。
- 服务端改为模块级独立事务，作品、指标、画像、原始数据或页面知识库单模块失败不再回滚其他模块。
- 原始 API 响应新增 SHA-256 哈希去重与 gzip 压缩，降低长期存储增长。
- Page Explorer 增加响应字段路径提取并同步至 `creator_page_schema` 页面知识库。

### 分析、权限与协作

- 新增 `creator_insights` 与本地规则分析服务，生成日、周、月、作品和粉丝洞察。
- 新增作品详情路由 `/analytics/creator-center/work/:id`，展示基础指标、趋势、标签和表现评级。
- 新增 `creator:data:view`、`creator:data:manage` 及账号授权范围表。
- 远程光标标签支持平滑移动、淡入淡出、最多显示最近活跃三人，其余以头像列表收纳。

## 2.9.0 - 2026-07-23

### Creator Data Center

- 新增平台无关的创作者账号、内容资产、指标快照、趋势、账号经营、粉丝画像和原始 API 数据模型。
- 新增 `POST /api/creator-agent/data-sync`，沿用 AES-256-GCM 加密与 HMAC-SHA256 签名，服务端统一完成身份校验、解密、事务入库、去重和快照创建。
- Creator Agent 上传层将真实采集快照映射为统一协议；保留旧 `/report` 服务端接口用于兼容既有客户端。
- 新增真实 Page Explorer，扫描创作者中心按钮和 Tab，记录点击后新增的 XHR/fetch 到 `page-capability-map.json`。
- 新增 `/analytics/creator-center` 运营数据中心，包含账号驾驶舱、作品库、作品分析、粉丝画像和历史复盘。

### 多人协作编辑

- 远程光标用户名改为编辑区行侧动态标签，不再覆盖正文。
- 标签仅在远程光标活跃时短暂显示，支持多人光标、滚动与窗口尺寸变化，并保持 pointer-events 隔离。
- 保持既有 Yjs 同步、断线重连、版本历史与撤销链路不变。
