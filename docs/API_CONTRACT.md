# XMT API Contract 规范

## 1. API 版本规则

- 新接口统一使用 `/api/v1/*`。
- 现有 `/api/*` 是 legacy 接口，在 Web、Agent 和其他调用方完成迁移及观察窗口前继续可用。
- legacy 路径保持当前认证、权限、业务行为、状态码和响应格式，不为追求统一而批量改造。
- v1 路径使用共享 Zod Schema、标准响应 envelope、稳定错误码和 requestId。
- legacy 与 v1 可以使用不同 HTTP 适配器，但必须调用同一 Service，不复制业务逻辑。
- 破坏性契约变更必须进入新的 API 主版本；向后兼容的字段只能以可选字段形式增加。

## 2. 成功响应

v1 成功响应统一为：

```json
{
  "success": true,
  "data": {},
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "requestId": "8d90f6cc-4f87-47a5-86ad-284cb92832d4"
  }
}
```

- `success` 固定为 `true`。
- `data` 始终存在；无返回实体时使用 `null`。
- `meta` 可选，用于分页和请求级元数据。
- 分页字段统一为 `page`、`limit`、`total`，直接位于 `meta`。
- 当请求经过 requestId 中间件时，`meta.requestId` 必须存在。

## 3. 错误响应

v1 错误响应统一为：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数不合法",
    "requestId": "8d90f6cc-4f87-47a5-86ad-284cb92832d4",
    "details": {}
  }
}
```

- `success` 固定为 `false`。
- `error.code` 是稳定、可供客户端分支处理的机器码。
- `error.message` 是面向用户或调用方的安全文案，不暴露 SQL、堆栈或密钥。
- `error.requestId` 必须存在，用于日志关联和问题排查。
- `error.details` 可选，只携带安全、结构化、可操作的信息；Zod 校验错误可放置字段级问题。

## 4. 错误码规范

| 错误码 | 含义 | 常用状态码 |
| --- | --- | --- |
| `AUTH_REQUIRED` | 未登录、token 缺失或失效 | 401 |
| `AUTH_INVALID_CREDENTIALS` | v1 登录凭据错误 | 401 |
| `AUTH_SESSION_EXPIRED` | v1 session 已过期 | 401 |
| `AUTH_SESSION_REVOKED` | v1 session 已撤销 | 401 |
| `AUTH_REFRESH_INVALID` | v1 Refresh Token 缺失、未知、过期或不可用 | 401 |
| `AUTH_REFRESH_REUSED` | 检测到 v1 Refresh Token 重复使用并已撤销会话 | 401 |
| `PERMISSION_DENIED` | 已认证但无权访问资源或执行动作 | 403 |
| `RESOURCE_NOT_FOUND` | 资源不存在 | 404 |
| `VALIDATION_ERROR` | 请求参数、路径参数或查询参数不合法 | 400 / 422 |
| `INVALID_STATUS` | 当前状态不允许目标操作或流转 | 409 |
| `CONFLICT` | 并发、唯一性或业务事实冲突 | 409 |
| `INTERNAL_ERROR` | 未预期的服务端错误 | 500 |

领域模块可增加稳定的细分错误码，但应映射到上述公共语义。例如 Topic 的 `TOPIC_NOT_FOUND` 可在 HTTP 层映射为 `RESOURCE_NOT_FOUND`，领域原始码可放入安全的 `details.domainCode`。

## 5. HTTP 状态码规范

| 状态码 | 使用规则 |
| --- | --- |
| `400 Bad Request` | 请求格式、路径参数或查询参数不合法，且服务端无需执行业务判断 |
| `401 Unauthorized` | 缺少有效身份凭证；不要用于普通权限不足 |
| `403 Forbidden` | 身份有效，但角色、权限点或数据范围不允许访问 |
| `404 Not Found` | 指定资源不存在；不得用 200 + 空对象代替 |
| `409 Conflict` | 状态机冲突、并发冲突、重复创建或当前事实不允许操作 |
| `422 Unprocessable Entity` | 请求结构有效，但字段语义无法处理；首批接口可继续用 400，统一后再切换 |
| `500 Internal Server Error` | 未预期错误；响应不得包含内部异常、SQL 或堆栈 |

## 6. requestId 规则

- 服务端接受客户端提供的 `X-Request-ID`；非空且长度不超过 128 字符时沿用。
- 缺失或不合法时，由服务端生成 UUID。
- 服务端在响应头 `X-Request-ID` 中回传，并在 v1 成功响应 `meta.requestId` 或错误响应 `error.requestId` 中返回。
- 客户端应记录最近一次 requestId，并在问题反馈或日志中携带。

## 7. Schema 与 OpenAPI

- `shared/schema` 是 v1 请求、响应、错误和 OpenAPI Schema 的单一来源。
- TypeScript 类型从 Zod Schema 推导，不重复手写同形类型。
- `/api/docs` 提供只读 Swagger UI，OpenAPI JSON 位于 `/api/docs/openapi.json`。
- 首批文档覆盖 Topic 列表、详情、创建和更新；legacy API 不纳入 v1 Contract 保证。
- Auth v1 实验接口在 OpenAPI 中使用 `x-experimental: true` 标记；运行时默认关闭，生产只允许独立批准后的明确用户 ID allowlist。
- Auth v1 Web 模式的 Refresh Token 只通过 `__Host-xmt_refresh` HttpOnly Cookie 交付；login/refresh JSON 不含原值，refresh 不接受 body Token，并要求受信 Origin 与 `X-XMT-CSRF`。
- Auth Rollout 管理诊断使用 `GET /api/v1/auth-rollout/status`，接受当前 legacy Bearer JWT 以支持迁移期管理员访问；只读返回 5 分钟、60 分钟、24 小时统一 Auth Event 聚合、风险和审计，不提供配置写接口。

### 番茄钟活动会话读取（Legacy）

- `GET /api/pomodoro/active` 要求登录，仅按当前账号读取一条未完成会话；响应头为 `Cache-Control: no-store`。没有活动会话时返回 `{ "session": null }`。
- 有会话时返回 `{ "session": { "id", "sessionId", "duration", "topicId", "startedAt", "remainingSeconds" } }`。`remainingSeconds` 由服务端根据开始时间计算，可为 `0`；会话是否未完成由持久化 `completed` 状态决定。
- 此接口只读，不创建计时、不修改会话、不读取其他账号数据；无需数据库迁移。客户端对响应结构和值域做严格校验，异常时保持计时操作锁定并允许只读重试。

### 选题列表过滤与分页（Legacy 与 v1）

- `GET /api/topics` 和 `GET /api/v1/topics` 可选接收 `status`、`search`、`topic_filter`、`page`、`limit`；`topic_filter` 当前仅接受 `mine` 或 `active`。
- `topic_filter=mine` 将结果收窄到当前操作者创建或负责的选题，即使该角色默认可查看全库也不扩大“我的”结果；不改变详情、编辑或默认列表的权限规则。
- `topic_filter=active` 只包含已通过、创作中、拍摄中、发布中四种状态。`status`、`search` 与 `topic_filter` 同时提供时取交集。
- 所有过滤条件在分页和总数统计之前应用，返回的 `pagination.total` / `meta.total` 与筛选后的列表一致。
- `GET /api/topics/{id}` 的成功响应必须包含 `data` 对象，且 `data.id` 与路径编号一致；缺少对象、编号无效或不匹配的响应按格式异常处理，调用方不得据此确认状态变化或解锁待核实写入。

### 选题创建结果恢复（Legacy 与 v1）

- `POST /api/topics` 与 `POST /api/v1/topics` 继续要求 `topic:create`。新客户端可附带 UUID `client_request_id`；旧客户端不带该字段时沿用原创建路径与响应。相同操作者、相同规范化载荷与请求编号重放会返回首次创建的 `topicId`；请求编号被其他操作者或不同载荷复用时返回 `409`。选题、建议归因、历史、活动记录和回执在一个事务中提交；成功重放不会重复这些写入，也不会再次发送通知或广播。
- `GET /api/topics/create-requests/{requestId}` 及 `/api/v1/topics/create-requests/{requestId}` 只要求登录，按当前操作者隔离。Legacy 响应仅为 `{ "state": "created", "topicId": 123 }` 或 `{ "state": "not_found" }`；v1 使用标准 success envelope 包装同一最小状态对象。未知和其他操作者的请求均为 `not_found`，所有成功与错误响应带 `Cache-Control: no-store`；状态读取不返回选题内容，也不改变创建权限。
- SAFE_EXPAND 迁移 058 只新增请求回执表，不改写既有选题；旧应用继续支持无请求编号的创建。

### 审批流模板创建结果恢复（Legacy）

- `POST /api/workflow-templates` 仍要求 `system:template`。新客户端可附带 UUID `client_request_id`；模板、节点与操作者/请求载荷指纹账本在同一事务提交。相同操作者和相同载荷重放返回原模板；请求编号被其他操作者或其他载荷使用时返回 `409`。旧客户端可以继续不带请求编号创建。
- `GET /api/workflow-templates/create-requests/{requestId}` 只要求登录，不授予创建权限；结果按当前操作者隔离，未知或其他操作者的编号统一为 `404`，对应模板已被删除时返回 `410` 墓碑。所有响应带 `Cache-Control: no-store`。
- 该 legacy 接口仍返回既有未封装响应体；契约只描述新增的可选幂等字段与状态读取行为，不代表 legacy API 已迁移至 v1 envelope。

### 审批流模板更新结果恢复（Legacy）

- `GET /api/workflow-templates/{id}` 在按 `node_order,id` 排序的详情中返回服务端计算的 `base_fingerprint`。编辑器应保存此指纹与原模板快照。
- `PUT /api/workflow-templates/{id}` 继续要求 `system:template`。新客户端需附带 UUID `client_request_id`、64 位十六进制 `base_fingerprint`，并提交完整名称、说明和节点列表。`payload_fingerprint = SHA256(JSON.stringify([name, description || '', nodes.map(n => [n.name, n.status_from, n.status_to, n.approver_type || 'role', n.approver_value || '', n.is_required !== false])]))`；回执/状态查询指纹为 `SHA256(JSON.stringify([base_fingerprint, payload_fingerprint]))`。服务端先查已处理回执，再在一个写事务内按 `node_order,id` 读取当前模板和节点；只有当前 `base_fingerprint` 匹配时才更新模板、整组节点并写入操作者/模板/基线/载荷回执。相同操作者、模板、请求编号、基线与载荷重放返回此前成功结果，不重复替换节点。
- `409 WORKFLOW_TEMPLATE_UPDATE_BASE_CONFLICT` 明确表示服务端确认本次没有写入模板、节点或回执；响应包含最新 `base_fingerprint`，客户端可读取详情并关闭这次旧请求。`409 WORKFLOW_TEMPLATE_UPDATE_REQUEST_CONFLICT` 表示 UUID 已关联其他操作者、模板、基线或载荷；客户端必须继续只读核实，不能把它当作未写入。旧客户端不带请求编号时仍执行既有更新路径。
- `GET /api/workflow-templates/{id}/update-requests/{requestId}?fingerprint={composite_sha256}` 只要求登录、不授予模板写权限。查询指纹必须是同一个基线与载荷复合指纹；状态按当前操作者、模板和请求编号隔离，返回 `updated + templateId` 或 `not_found`；本人请求复合指纹不符返回 `409`，所有响应均带 `Cache-Control: no-store`。
- SAFE_EXPAND 迁移 061 只新增更新请求回执表，不修改既有模板和节点。审批流模板更新当前没有独立审计日志表或写审计副作用，本次不扩展审计范围。

### 旧版选题模板操作结果恢复（Legacy）

- `GET /api/templates` 仍只要求登录，并为每个模板返回服务端计算的 `base_fingerprint`。创建、更新、删除写接口继续要求 `system:template`，旧客户端可不带请求字段并沿用原行为。
- 新客户端在 `POST /api/templates`、`PUT /api/templates/{id}`、`DELETE /api/templates/{id}` 提交 UUID `client_request_id` 与规范化 `request_fingerprint`；更新和删除还提交列表读取到的 `base_fingerprint`。规范化字段顺序为名称、平台、说明、模板数据、默认状态；名称/平台/说明分别 trim 并限制为 120/50/1000 字，模板数据对象序列化为 JSON、字符串保持原样，默认状态转为布尔值。部分更新只对请求中提供的字段计算指纹。
- 指纹为 `SHA256(JSON.stringify(['create', normalizedPayload]))`、`SHA256(JSON.stringify(['update', id, base_fingerprint, normalizedPartialPayload]))` 或 `SHA256(JSON.stringify(['delete', id, base_fingerprint]))`。服务端对写回执和更新/删除基线在同一事务中处理；更新基线变化时不会覆盖新模板，删除使用账本墓碑避免已删除模板的回执被外键级联清除。
- `GET /api/templates/requests/{requestId}?operation=create|update|delete&target_id={id}&request_fingerprint={sha256}` 继续要求 `system:template`。创建不带 `target_id`，更新/删除必须带目标。查询按操作者、操作、目标和指纹隔离，仅返回 `processed`、`not_found`、`target_missing` 或 `conflict`；创建已处理时附带 `target_id`，不返回模板内容，所有响应禁止缓存。SAFE_EXPAND 迁移 064 仅新增回执表。

### 匿名意见状态、回复与公开状态更新恢复（Legacy）

- `GET /api/admin/anonymous-feedback` 和 `PATCH /api/admin/anonymous-feedback/{id}` 继续要求管理员角色。管理列表提供服务端 `base_fingerprint`；新客户端可用 PATCH 更新 `status`、`reply_content`、`is_public` 的任意非空子集，并附 UUID `client_request_id`、基线和请求指纹。旧客户端无恢复字段时保持原接口行为。
- 更新指纹为 `SHA256(JSON.stringify([id, base_fingerprint, status ?? null, reply_content === undefined ? null : (reply_content.trim() || null), is_public ?? null]))`。在一个事务中比较完整意见基线、更新指定字段并写操作者回执。同请求重放不重复更新时间；基线变化返回确定未写入的 `409 ANONYMOUS_FEEDBACK_UPDATE_BASE_CONFLICT`；请求编号与其他操作者/目标/载荷冲突返回 `409 ANONYMOUS_FEEDBACK_UPDATE_REQUEST_CONFLICT`，该冲突必须继续核实，不能当作未提交。
- `GET /api/admin/anonymous-feedback/{targetId}/update-requests/{requestId}?request_fingerprint={sha256}` 需要管理员角色，不扩大写权限。只返回 `processed`、`not_found`、`target_missing` 或 `conflict`，不返回意见正文；成功和错误响应均使用 `Cache-Control: no-store`。SAFE_EXPAND 迁移 063 仅新增回执表；管理员列表客户端使用 `cache: no-store`，防止条件式 304 响应缺少列表 JSON 正文。

### 稿件批注回复结果恢复（Legacy）

- `POST /api/workflow/production/{productionId}/review-threads/{threadId}/replies` 继续要求 `workflow:comment` 和现有稿件范围权限。新客户端可附带 UUID `client_request_id`；回复与操作者、稿件、线程及 SHA-256 内容指纹账本在同一事务提交。相同操作者、线程及载荷重放返回原回复；请求编号跨操作者、线程或载荷使用时返回 `409`。旧客户端仍可省略请求编号。
- `GET /api/workflow/production/{productionId}/review-threads/{threadId}/replies/requests/{requestId}?fingerprint={sha256}` 只读核实当前操作者的请求结果，响应使用 `Cache-Control: no-store`。匹配时返回 `applied`，未知或其他操作者的编号返回 `not_found`，载荷指纹不匹配返回 `409`。
- 浏览器仅在当前会话暂存原回复和请求 UUID。结果未确认时锁定原文；服务端确认 `not_found` 后才允许沿用原编号和原载荷显式重试。该 legacy 接口沿用既有未封装响应体，不代表 legacy API 已迁移至 v1 envelope。

### 稿件批注与修改建议创建结果恢复（Legacy）

- `POST /api/workflow/production/{productionId}/review-threads` 继续要求 `workflow:comment` 和现有稿件范围权限。新客户端可附带 UUID `client_request_id`；批注/建议与操作者、稿件及 SHA-256 载荷指纹账本在同一事务提交。相同操作者、稿件和载荷重放返回原线程；请求编号被其他操作者、稿件或载荷使用时返回 `409`。旧客户端仍可省略请求编号。
- `GET /api/workflow/production/{productionId}/review-threads/requests/{requestId}?fingerprint={sha256}` 只要求登录，用于只读核实当前操作者的请求，响应使用 `Cache-Control: no-store`。匹配时返回 `applied` 与线程编号；未知或其他操作者/稿件的编号统一返回 `not_found`，载荷指纹不匹配返回 `409`。
- 浏览器在当前会话暂存原批注/建议内容和请求 UUID。结果未确认时锁定表单；服务端确认 `not_found` 后才允许沿用同编号、同载荷显式重试。该 legacy 接口沿用既有未封装响应体，不代表 legacy API 已迁移至 v1 envelope。

### Creator Agent 绑定凭据结果恢复（Legacy）

- `POST /api/creator-agent/bind` 继续接受旧客户端的 `{ binding_code, device }`。新 Agent 另带 UUID `request_id` 与 32 字节 Base64URL `recovery_secret`；两项必须同时提供。仅 request ID 不能恢复凭据。绑定响应始终 `Cache-Control: no-store`。
- 同一请求、恢复能力和载荷在服务端提交后重放，会返回相同的短期凭据结果；设备、绑定码或设备信息变化时返回 `409`，恢复能力错误时统一返回 `404`。服务端以 AES-256-GCM 加密保存最多 24 小时的凭据回执，数据库不保存恢复能力明文。
- 已有设备重绑采用暂存凭据：旧 token 在客户端确认本机安全存储与配置写入前保持有效。客户端持久化后调用 `POST /api/creator-agent/bind/ack`，该接口按 request ID 和恢复能力鉴权、幂等确认并立即清除凭据密文；仅确认后才激活新凭据。确认或过期后的凭据不可恢复。
- 新 Agent 在本机安全存储不可用时不会发起绑定；待处理数据在请求前以 Electron `safeStorage` 加密落盘，包含完成重试所需的一次性码，收到响应并本机保存后改为仅保留确认材料。若连接的是不支持该能力的旧服务端，成功响应仍可保存，但旧服务端无法提供响应丢失恢复。
- 恢复使用 `XMT_CREATOR_AGENT_BINDING_KEY_V1`；密钥缺失、错误或实例间不一致时 fail closed。SAFE_EXPAND 迁移 053 仅新增账本，旧客户端不带恢复字段时继续原行为；真实库迁移及运行时密钥配置需走受控部署。

### 灵感点赞结果恢复（Legacy）

- `POST /api/inspirations/{id}/vote` 继续兼容旧客户端的无请求体 toggle。新客户端同时提供 UUID `client_request_id` 和布尔 `voted` 目标状态；两项必须同时出现。投票状态与操作者/灵感/请求编号/目标状态回执同一事务提交，同键同目标重放不会再次切换；跨操作者、灵感或目标状态复用返回 `409`。
- 新客户端以 `GET /api/inspirations/vote-requests/{requestId}` 只读核实，响应带 `Cache-Control: no-store`，只返回当前操作者的状态。已处理时同时返回 `processedVoted`（该请求最初处理的目标）和 `voted`（当前状态）；未知或其他操作者的编号返回 `404`，对应灵感已删除时返回 `410`。
- 浏览器在当前标签会话按操作者和灵感分别保存待处理 UUID。结果不明时锁定该条操作；刷新后继续只读核实。只有请求回执明确不存在且灵感当前状态可读时，才提供沿用同一编号的安全重试。SAFE_EXPAND 迁移 054 新增独立回执表，不改写历史投票；回执目前不自动清理，以保留延迟重试的幂等性。

### 复盘标题与结论更新结果恢复（Legacy）

- `PUT /api/retrospectives/{id}` 继续兼容无幂等编号的旧客户端。新客户端可附加 UUID `X-Idempotency-Key`；带编号的请求必须提供写前 `version`。服务端以操作者、复盘与请求编号隔离回执，并以字段是否提供、对应值和请求版本计算稳定指纹，因此省略字段的重放不会依赖后来变化的数据库值。复盘更新、审计记录和成功回执在同一事务提交；版本过期时原子记录 `conflict` 并返回 `409 VERSION_CONFLICT`，不同载荷复用同一编号返回 `409 RETROSPECTIVE_UPDATE_REQUEST_CONFLICT`。
- `GET /api/retrospectives/{id}/update-requests/{requestId}` 只要求登录，按当前操作者/复盘/请求编号读取 `processed`、`conflict` 或 `not_found`，不返回复盘正文，也不授予写权限；响应带 `Cache-Control: no-store`。仅明确的 `not_found` 可进入同编号显式重试，已处理或冲突只允许只读刷新与人工核对。
- 新客户端在当前标签会话先保存请求标记，再发起更新。刷新后先只读核实；冲突时保留本地草稿和服务器当前值，人工确认后另用新编号保存。SAFE_EXPAND 迁移 057 只新增回执表；回执当前没有自动清理策略，真实数据库迁移需走受控发布流程。

### 备份创建结果恢复（Legacy）

- `POST /api/backup/create` 继续要求 `system:backup`。新客户端提供 UUID `client_request_id`；相同操作者与请求编号并发或重放时，在备份文件保留期间返回同一个应用备份。旧客户端仍可省略编号并沿用既有创建响应，但不具备结果恢复能力。
- `GET /api/backup/create-requests/{requestId}` 同样要求 `system:backup`，按当前操作者和请求编号隔离，只返回 `created + name`、`pending` 或 `not_found`，不暴露绝对路径。状态读取不写入数据库，所有响应均 `Cache-Control: no-store`；只有明确显示 `not_found` 后，客户端才允许用户确认以同一编号重试。
- 请求关联由备份文件名中的单向摘要实现，文件被删除或轮转清理后状态会变为 `not_found`；没有新增数据库迁移或自动清理回执。

### Creator Analytics 自然日窗口（Legacy）

- `GET /api/creator-agent/data` 返回的账号健康度，以及 `/api/creator-agent/trends?period=7d|30d|90d` 的区间均按北京时间自然日闭区间计算：开始日和当天都包含，未来日期排除。窗口不随最新快照时刻滚动。
- `health.fan_growth_rate` 在区间内缺少两条可比较的有效粉丝快照时为 `null`；不得将缺失日期补为 0 或外推趋势。`GET /api/creator-agent/works/{id}/analysis?period=7d|30d` 同样使用包含当天的北京时间自然日；`24h` 保持滚动 24 小时。

### 月报与年报总结更新结果恢复（Legacy）

- `GET /api/report-summaries/monthly?year={year}&month={month}` 与 `/api/report-summaries/yearly?year={year}` 继续要求登录并只读取当前用户自己的记录。响应新增 `baseline_fingerprint`；它覆盖操作者、种类、期间、行 ID 和该周期完整原始字段。无记录时采用带操作者和周期的明确 `no-row` 基线，重复 GET 得到同一值。月报/年报归档读取权限仍只限管理员/负责人。
- 新客户端 PUT 可提供 `client_request_id` 和写前 `base_fingerprint`。月报字段顺序为 `[content_md, work_summary_md, key_projects_md, issues_plan_md]`，年报为 `[content_md, annual_summary_md, achievements_md, shortcomings_md, next_year_plan_md]`；每项按现有兼容映射转为字符串、缺失补空字符串。`payload_fingerprint = SHA256(JSON.stringify([kind, year, monthOr0, fieldValuesInOrder]))`，`request_fingerprint = SHA256(JSON.stringify([base_fingerprint.toLowerCase(), payload_fingerprint]))`。
- 服务端在同一事务内先查操作者隔离回执，再比较当前记录基线，随后执行自然键 upsert、读回保存快照并写回执。更新基线过期返回 `409 REPORT_SUMMARY_UPDATE_BASE_CONFLICT` 且不覆盖当前记录；同 UUID 跨操作者、种类、期间或内容复用返回 `409 REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT`。旧客户端不带恢复字段时仍沿用原 upsert 合同。
- 月报状态为 `GET /api/report-summaries/monthly/requests/{requestId}?year={year}&month={month}&fingerprint={sha256}`，年报状态为 `/api/report-summaries/yearly/requests/{requestId}?year={year}&fingerprint={sha256}`。仅返回 `processed` 与原请求保存快照、`not_found`，或指纹冲突 `409 conflict`；状态查询按当前操作者、种类、周期和 UUID 隔离，响应均 `Cache-Control: no-store`。SAFE_EXPAND 迁移 065 仅新增回执表，不改动月报/年报表或历史迁移 006/007。

### 匿名意见提交结果恢复（Legacy）

- `POST /api/anonymous-feedback` 继续要求登录并保留原有意见字段。旧客户端可不带编号；新客户端提供随机 UUID `client_request_id`。服务端只保存该编号、规范化载荷的 SHA-256 指纹、关联意见 ID 和创建时间，不保存提交人身份，也不在回执中复制意见正文。
- 带编号的首次提交与回执在同一事务中写入；相同编号和载荷重放返回原成功结果，不产生第二条意见；相同编号搭配不同载荷返回 `409 ANONYMOUS_FEEDBACK_SUBMISSION_REQUEST_CONFLICT`。客户端在当前标签会话先保存待核实编号和原内容，页面刷新后先只读核实；只有明确返回 `not_found` 时才提供沿用同一编号的显式重试。处理中、冲突或状态读取失败时锁定原内容，不自动重发。
- `GET /api/anonymous-feedback/submission-requests/{requestId}?request_fingerprint={sha256}` 需要登录，只返回 `processed`、`not_found` 或 `conflict`，不返回意见正文或提交人信息，所有响应均 `Cache-Control: no-store`。SAFE_EXPAND 迁移 066 新增永久回执表，不自动清理；管理端删除意见时，在同一事务中删除对应回执，外键级联作为额外保护。真实数据库迁移仍须走受控发布流程。

### Creator Reports 发布作品日期窗口（Legacy）

- 日报、周报、月报 `work_performance.published` 始终按已采集作品数统计：有效官方周期文件存在时用其校验通过的日期窗口；缺失或无效时统一回退到包含报告生成日的北京时间自然日，日报为当天 1 日、周报为近 7 日、月报为近 30 日。发布时间按共享 BJT 解析并依作品身份去重，不以最近快照日期代替报表窗口。完整官方日报文件仍表示平台的“昨天”窗口。
- `work_performance.published_period_start` 与 `published_period_end` 明确返回计数窗口的含首尾日期。官方流量文件缺失/不完整时，发布作品数仍可用，但官方逐日流量合计必须保持不可用/缺失状态，不能以作品数量填补流量字段。
- `DELETE /api/announcements/{id}` 结果不明时，客户端将账号和公告 ID 写入当前会话恢复记录，仅以 `GET /api/announcements`（客户端 `cache: no-store`）核实。列表格式无效或读取失败时 fail closed 并保持公告写入锁；目标缺席不归因于本次删除，也不会自动重试，目标仍存在时需用户再次确认。该流程不改变服务端 DELETE 权限或既有响应语义。

### 主题内容资产可见资料（Legacy）

- `GET /api/resource-center/content-topics` 在主题汇总中返回 `linked_resources` 和 `referenced_resources`，字段均为资料 `id`、显示标题、`library_type` 与 `updated_at`。前者由正式资料关联关系去重；后者仅从当前最新正式稿件解析编辑器标准 `/asset-center/resources/{id}` 且链接文字以“来源：”开头的显式引用，并从中去除已经列入 `linked_resources` 的资料。两者都应用现有资料可见范围；无权访问或已删除的资料不返回。不会解析资料草稿、任意链接或历史稿件来猜测当前选题归属，也不创建资源关系。
- 同一接口的 `dimension_coverage` 按当前账号可见范围返回 `visible_topics_total` 与城市/人物/项目各自的 `registered_topic_counts`。统计以 `COUNT(DISTINCT topic_id)` 计数，不随关键词或维度筛选缩小范围；同一主题同类可有多个值，但在类型登记数中只计一个主题。该数据只描述明确登记现状，不代表每个主题都必须登记，也不作为完整率或质量评分。

### 资料编辑结果恢复（Legacy）

- `PUT /api/resource-center/resources/{id}` 继续要求 `resource:update` 和现有资料编辑范围权限。新客户端可附加 UUID `client_request_id`；资料字段、标签关系、审计记录及按操作者/资料/请求编号/载荷指纹隔离的回执在同一事务提交。相同操作者、资料、请求编号和载荷指纹重放返回原成功响应，不重复更新或新增审计记录；请求编号跨操作者、资料或载荷复用时返回 `409 RESOURCE_UPDATE_REQUEST_CONFLICT`。旧客户端省略编号时沿用原合同与行为。
- `GET /api/resource-center/resources/{id}/update-requests/{requestId}` 只要求登录，按当前操作者、资料编号与请求编号隔离，只返回 `{ "state": "updated", "resourceId": 123 }` 或 `{ "state": "not_found" }`，不返回资料正文或其它字段。成功、错误响应均使用 `Cache-Control: no-store`；无效 UUID 或资料编号返回 `400`。
- SAFE_EXPAND 迁移 060 仅新增资料更新回执表，不改写既有资源数据。更新请求未带 UUID 时不写回执；状态查询也不授予或改变资料编辑权限。

### 资料分类操作结果恢复（Legacy）

- `POST /api/resource-center/categories`、`PUT /api/resource-center/categories/{id}`、`DELETE /api/resource-center/categories/{id}` 的新客户端可提交 UUID `client_request_id`；更新/删除同时提交原 `library_type`。分类写入、路径更新/删除和请求回执在同一事务提交。请求 UUID 全局唯一；重复编号先比较操作者、操作类型、资料库、目标分类和载荷指纹，不匹配时返回 `409 RESOURCE_CATEGORY_MUTATION_REQUEST_CONFLICT`，不会执行第二次写入。旧客户端省略编号时沿用原合同。
- `GET /api/resource-center/categories/mutation-requests/{requestId}?fingerprint={sha256}` 要求现有 `resource:category_manage` 权限，匹配指纹后仅返回 `created`、`updated`、`deleted` 与分类 ID，或 `not_found`；当前操作者之外的请求统一返回 `not_found`。成功和错误响应均 `Cache-Control: no-store`。SAFE_EXPAND 迁移 062 仅新增回执表，不修改既有分类数据。
