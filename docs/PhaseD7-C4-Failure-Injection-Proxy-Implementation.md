# Phase D7-C.4 Failure Injection Proxy Implementation

## 1. 文件变更

- `scripts/failure-injection-proxy.mjs`
  - 新增本地/CI 专用 HTTP failure-injection proxy。
  - 导出 `startFailureInjectionProxy()` 供测试调用，也支持作为独立 Node 脚本启动。
- `tests/failure-injection-proxy.test.mjs`
  - 新增代理自身的 Node 测试：一次性拒绝、一次性超时、透明转发与生产环境拒绝启动。
- `docs/PhaseD7-C4-Failure-Injection-Proxy-Implementation.md`
  - 本实现报告。

未修改 ProductionDetail、ShootingDetail、ContentEditor Runtime、AutosaveCoordinator、Adapter、API 业务逻辑、数据库、权限、workflow、Yjs 或 Socket.IO。

## 2. 启动方式

代理仅用于本地或 CI。启动前必须提供本地 upstream：

```powershell
$env:FAILURE_INJECTION_UPSTREAM = 'http://127.0.0.1:3001'
$env:FAILURE_INJECTION_PROFILE = 'reject_once'
node scripts/failure-injection-proxy.mjs
```

可选变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `FAILURE_INJECTION_PROFILE` | `passthrough` | `passthrough`、`reject_once` 或 `timeout_once` |
| `FAILURE_INJECTION_PORT` | `0` | 仅绑定 `127.0.0.1`；`0` 由系统分配临时端口 |
| `FAILURE_INJECTION_TIMEOUT_MS` | `1500` | 测试的 dispose timeout 预算 |
| `FAILURE_INJECTION_DELAY_MS` | `1600` | `timeout_once` 的延迟；必须严格大于 timeout 预算 |

启动输出只包含本地监听地址，不输出请求 header、Authorization、密码或正文。E2E 浏览器应访问该本地代理地址，而不是把测试开关放进 Production 页面或 API。

## 3. Profile 说明

白名单目标固定为：

```text
PUT /api/workflow/production/85
```

| Profile | 第一次匹配白名单请求 | 后续同类请求 | 是否转发第一次请求 |
| --- | --- | --- | --- |
| `reject_once` | 立即响应 HTTP 503 | 正常透明转发 | 否 |
| `timeout_once` | 延迟超过测试 timeout 预算后响应 HTTP 504 | 正常透明转发 | 否 |
| `passthrough` | 正常透明转发 | 正常透明转发 | 是 |

未匹配白名单的请求不会被故障注入，会透明转发到已验证的本地 upstream。这样浏览器加载、登录、协作等非保存请求不受影响；代理本身仍不会向任何非本地地址建立连接。

## 4. 安全限制

1. 代理只监听 `127.0.0.1`，不接受对外监听地址配置。
2. upstream 必须是 `http://127.0.0.1`、`http://localhost` 或 `http://[::1]`；其他 host 或 HTTPS origin 会被拒绝。
3. `NODE_ENV=production` 时启动立即失败。
4. profile 默认 `passthrough`，`reject_once` 与 `timeout_once` 只消费一次。
5. 注入的请求不会转发，因此不会触发 Production 保存、版本、workflow 或数据库写入。
6. 代理不读取、记录或输出 request body、Authorization、cookie、密码或编辑内容。
7. 该工具不启动业务服务、不修改 Vite 配置，也不包含任何产品运行时 flag。

## 5. 测试结果

已执行：

```text
node tests/failure-injection-proxy.test.mjs
npm run check
```

结果：均通过。

| 用例 | 结果 |
| --- | --- |
| `reject_once` 只消费一次，第一次 HTTP 503 且不触达 upstream | 通过 |
| `timeout_once` 延迟超过配置预算后第一次 HTTP 504，且不触达 upstream | 通过 |
| `passthrough` 正常转发白名单请求 | 通过 |
| `NODE_ENV=production` 启动失败 | 通过 |
| TypeScript 检查 | 通过：`tsc --noEmit` |

本阶段仅完成测试基础设施。尚未实现 Production 失败确认 UI，也未执行 Production 的 `not_durable` / `interrupted` 浏览器验收，更未进入 Shooting。
