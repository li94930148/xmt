# Phase D7-D4-A Shooting Failure Proxy Implementation

## 1. 文件变更

- `scripts/failure-injection-proxy.mjs`
  - 增加 Shooting 专用 profile 与 fixture manifest 校验。
- `tests/failure-injection-proxy.test.mjs`
  - 扩展 Production/Shooting 隔离、manifest fail-closed 与 Shooting profile 自测。
- `docs/PhaseD7-D4-A-Shooting-Failure-Proxy-Implementation.md`
  - 本报告。

未修改 ShootingDetail、ProductionDetail、Runtime、AutosaveCoordinator、DisposeController、LeaveGuard contract、Adapter、API 业务逻辑、数据库、权限、workflow、Yjs 或 Socket.IO。未创建任何 fixture。

## 2. Shooting Profile

| Profile | 目标 | 首次精确匹配 | 后续请求 |
| --- | --- | --- | --- |
| `shooting_reject_once` | `PUT /api/workflow/shooting/<manifest.shootingId>` | HTTP 503，不转发 | 透明转发 |
| `shooting_timeout_once` | 同上 | 超过 timeout budget 后 HTTP 504，不转发 | 透明转发 |
| `shooting_passthrough` | 同上 | 透明转发 | 透明转发 |

Production 的 `passthrough`、`reject_once`、`timeout_once` 继续固定匹配 `PUT /api/workflow/production/85`。Shooting profile 不能命中该 Production path，Production profile 也不能命中 Shooting path。

## 3. Manifest 与 fail-closed 规则

Shooting profile 必须提供 `SHOOTING_FAILURE_FIXTURE_MANIFEST`，其最小结构为：

```json
{
  "shootingGracefulDispose": {
    "shootingId": 123,
    "productionId": 456,
    "allowedPath": "/api/workflow/shooting/123"
  }
}
```

代理从 `shootingId` 推导唯一 target，并要求 `allowedPath` 完全一致。不存在“任意 ID”或调用方自定义 target 的启动路径。

启动会在以下情况直接失败：

- `NODE_ENV=production`；
- 非 localhost 监听（实现固定绑定 `127.0.0.1`）；
- upstream 不是本地 `http` origin；
- Shooting profile 缺失 manifest、manifest 不可解析或 `shootingId` 非正整数；
- manifest path 与 `shootingId` 不一致；
- profile 不受支持；
- 非法端口或 timeout delay 未超过 timeout budget。

代理仍不读取、记录或输出 Authorization、Cookie、密码或 `script_content` 正文。一次性 profile 状态仅保留在进程内存，关闭代理即清除。

## 4. 启动方式

在 fixture 创建任务完成并生成临时 manifest 后，本地/CI 可以使用：

```powershell
$env:FAILURE_INJECTION_UPSTREAM = 'http://127.0.0.1:5174'
$env:FAILURE_INJECTION_PROFILE = 'shooting_reject_once'
$env:SHOOTING_FAILURE_FIXTURE_MANIFEST = 'C:\temp\xmt-shooting-fixture.json'
node scripts/failure-injection-proxy.mjs
```

`shooting_timeout_once` 可额外设置：

```powershell
$env:FAILURE_INJECTION_TIMEOUT_MS = '1500'
$env:FAILURE_INJECTION_DELAY_MS = '1800'
```

此工具只允许本地/CI 使用。manifest 是测试过程临时文件，不应提交、部署或保留在产品配置中。

## 5. 测试结果

执行：

```text
node tests/failure-injection-proxy.test.mjs
npm run check
```

结果：均通过。

覆盖：

1. `shooting_reject_once`：首次 503、upstream 0 次、第二次正常转发；
2. `shooting_timeout_once`：首次 504、upstream 0 次、第二次正常转发；
3. `shooting_passthrough`：正常透明转发；
4. Production profile 不命中 Shooting target；
5. Shooting profile 不命中 Production 85 target；
6. 缺失 manifest 与 path 不一致 manifest 均拒绝启动；
7. production 环境拒绝启动；
8. TypeScript 检查通过：`tsc --noEmit`。

## 6. 后续边界

本阶段只提供基础设施能力。下一步必须先按 D7-D3 创建独立、可回滚、已关联 Production 的 Shooting fixture 与临时 manifest，之后才能执行 Shooting failure-flow 浏览器验收。不得修改 Shooting 34，也不进入 D8 或 Runtime 清理。
