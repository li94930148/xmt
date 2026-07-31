# Changelog

## 2.13.8 - 2026-07-31

- 为显式开启且命中用户 ID 白名单的非生产 v1 Web Auth 增加 HttpOnly Refresh Cookie 与 CSRF HTTP 适配。
- Web login/refresh JSON 不再返回 Refresh Token；refresh 只接受 Cookie，并在成功轮换后覆盖 Cookie。
- Web login 将 session、generation 0 Refresh hash 和登录活动记录纳入同一 SQLite 事务。
- logout 验证 Access/Session/Origin/CSRF 后撤销 session，并以相同 Cookie 范围清除凭据。
- legacy 登录、持久 Token、JWT、Socket、Caddy 和生产开关不变。

## 2.13.7 - 2026-07-31

- 新增未接入现有登录页的 Web Auth Runtime，Access Token 仅保存在内存，并提供认证状态机和刷新单飞能力。
- api-client 增加 `credentials: include`、显式 v1 模式 401 刷新和原请求最多一次重试，并新增 Auth v1 客户端封装。
- 新增未挂载的 Refresh Cookie、CSRF 签名服务、Web Auth 开关与用户 ID allowlist 基础能力。
- legacy 登录、浏览器持久 Token、JWT、Socket、Caddy 和生产 v1 开关均保持不变。

## 2.13.6 - 2026-07-30

- 新增由 `XMT_AUTH_V1_ENABLED` 控制的实验性 `/api/v1/auth/login|refresh|logout|sessions`，默认关闭且生产环境强制不挂载。
- 新增 Auth v1 Zod Schema、标准响应/错误码和 OpenAPI `x-experimental` 标记。
- 新增 HTTP 集成测试，覆盖 token 轮换、复用撤销、session 查询和 logout，并验证 legacy 7 天 JWT 不变。
- 未修改 Login 页面、Cookie、前端 token 存储或 Socket 认证。

## 2.13.5 - 2026-07-30

- 新增未接线的 Session Service 和 Refresh Token Service，支持会话生命周期、256-bit 随机凭据、分版本 HMAC、单次轮换与复用检测。
- 新增 SQLite 原子轮换 Repository，在一个事务内消费旧 token、创建替换记录并更新会话活动。
- 为 Token Service 增加独立 v1 Access Token 方法，旧 `signToken`、`verifyToken`、payload 和 7 天有效期保持不变。
- 新增 Session Service 专项测试；未开放 `/api/v1/auth/*`，未修改前端或 Socket 认证。

## 2.13.4 - 2026-07-30

- 通过正式 migration 新增 `auth_sessions` 与 `auth_refresh_tokens`，包含会话到期、撤销、轮换链及必要索引。
- 新增独立 Session Repository 接口与 SQLite 基础实现，但不接入 Auth Service。
- 新增 migration 专项测试，验证表、字段、索引、外键、幂等执行和既有用户数据完整性。
- legacy `/api/auth/*`、7 天 JWT、前端 token 存储、Socket 认证和生产登录行为保持不变。

## 2.13.3 - 2026-07-30

- 将 legacy `GET /api/auth/me`、`POST /api/auth/change-password` 和 `POST /api/auth/logout` 收口到 Auth Module。
- Controller、Service、Repository 与密码服务分别承担 HTTP、流程、SQLite 和 bcrypt 职责，旧路由只保留模块入口。
- 扩展认证行为冻结测试，覆盖当前用户、禁用账号、修改密码、强制改密标记清除、完整认证链路及退出后 JWT 仍有效。
- 未修改数据库、JWT、权限、Socket、前端 token 存储或 logout 语义，未引入 Refresh Token。

## 2.13.2 - 2026-07-30

- 建立 Auth Repository、Service、Controller、Token、Password 与 Mapper 模块边界。
- legacy `POST /api/auth/login` 改为委托 Auth Module，响应、错误、JWT、日志和限流行为保持不变。
- 新增临时 SQLite 认证冻结测试，覆盖登录、JWT 验证、角色回查以及 logout 不撤销令牌的现状。
- 未修改数据库、权限、Socket、前端登录或 7 天 JWT 有效期，未引入 Refresh Token。

## 2.13.1 - 2026-07-30

- 修复资料库“新增资料”按钮没有交互的问题，补齐创建表单、校验、真实写入和详情跳转。
- 山东地情档案导入增加 UTF-8、BOM、换行、不可见字符、行尾空白和过量空行清洗。
- manifest 同时记录原始与清洗后 SHA256、清洗数量和字符变化，继续支持批次审计、幂等、恢复和回滚。

## 2.13.0 - 2026-07-30

- 创作生产详情新增参考资料模块，支持搜索资料中心、添加关联、查看详情和解除关联。
- 新增生产资料关联 API，复用 `resource_relations` 保存 `production/reference` 关系，不新增业务数据表。
- 生产编辑者可在具备资料查看权限时使用关联能力，普通查看用户只读，资料管理权限保持不变。
- 资料关联操作独立于编辑器正文、版本历史、协作编辑和保存流程，解除关联不会删除原资料。

## 2.12.0 - 2026-07-29

- 建立 `/api/v1/*` 成功、错误、分页、错误码和 HTTP 状态码契约。
- 新增 requestId 生成、透传和响应回写机制，Topic v1 envelope 统一携带 requestId。
- 新增 Zod 驱动的 OpenAPI 3.0.3 文档与 `/api/docs` Swagger UI，首批覆盖四个 Topic v1 接口。
- 新增 `packages/api-client` 基础骨架和 API Contract 临时 SQLite 测试；legacy API 与业务规则保持不变。

## 2.11.0 - 2026-07-29

- 将 Topic 的 Repository、Policy、Service、Controller 与 HTTP 路由抽离到 `api/modules/topics`，旧 `/api/topics` 保持兼容。
- 新增默认关闭的 `/api/v1/topics` 严格 Zod 契约；只有设置 `XMT_TOPICS_V1_ENABLED=true` 才挂载，Web 仍使用旧接口。
- 新增临时 SQLite Topic 专项测试，覆盖 Repository、Service 失败分支及 legacy/v1 API 契约。
- 保持数据库结构、权限判断、状态机、通知、Socket 事件和 history/activity 写入行为不变。

## 2.10.3 - 2026-07-29

- 修复 Creator Agent 未上传粉丝总数的问题，兼容分隔符、万/亿单位、加号和嵌套对象。
- 修复作品主封面在统一载荷裁剪时丢失的问题，并保留有效旧封面。
- 限制全量同步中审计原始响应的上传体积，保留标准化作品和指标，避免代理链路长时间传输后断开。
- 全量同步默认采集全部作品列表并抽取 3 条详情，缩短浏览器采集时间且不影响粉丝、封面和作品指标入库。
- 移除账号健康度模块，将六个指标调整为桌面端两行三列。
- 封面统一使用无 Referer 懒加载和失败占位；官方 API 运营调度继续关闭。

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
