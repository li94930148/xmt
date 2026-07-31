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
- Auth v1 实验接口在 OpenAPI 中使用 `x-experimental: true` 标记；运行时默认关闭且生产环境强制不可挂载。
- Auth v1 Web 模式的 Refresh Token 只通过 `__Host-xmt_refresh` HttpOnly Cookie 交付；login/refresh JSON 不含原值，refresh 不接受 body Token，并要求受信 Origin 与 `X-XMT-CSRF`。
- Auth Rollout 管理诊断使用 `GET /api/v1/auth-rollout/status`，接受当前 legacy Bearer JWT 以支持迁移期管理员访问；只读返回灰度、指标、风险和审计，不提供配置写接口。
