# Auth 灰度运行态配置来源

## 唯一可信来源

Auth 灰度配置只在 PM2 工作进程启动时从 `process.env` 解析一次，并冻结为 `authRolloutRuntimeConfig`。`.env` 是部署输入，不是运行中进程的实时配置来源；修改 `.env` 后必须通过受控部署或 PM2 重启加载新环境。

```text
PM2 Runtime Environment
        ↓
api/config/auth-rollout-runtime.ts（启动快照）
        ↓
Login Gateway / Auth v1 Web / Socket Bridge / Admin Diagnostic
        ↓
/internal/auth-rollout/runtime（仅本机）
        ↓
auth:gray-readiness
```

## 诊断方式

- 管理员使用 `/api/v1/auth-rollout/status` 查看不含敏感信息的有效配置：来源、Auth v1/Web、Login Rollout、Socket Bridge、模式、allowlist 数量、进程 ID 与加载时间。
- 服务器执行 `npm run auth:gray-readiness`。脚本仅查询 `127.0.0.1` 的运行态端点，再按该端点返回的 allowlist 查询测试账号状态；端点不可达时必定返回 `NOT_READY`。
- `/internal/auth-rollout/runtime` 不经 Caddy 暴露，仅接受 loopback 请求；它会额外返回 allowlist ID 供服务器就绪脚本核验，不能作为公网管理接口使用。

## 灰度开启流程

1. 备份数据库和当前 PM2/部署配置。
2. 在唯一的 PM2 配置来源中写入已审批的 allowlist 与门禁；禁止只改 `.env` 后假定已生效。
3. 受控重启服务。
4. 运行 `auth:production-preflight` 与 `auth:gray-readiness`；两者必须反映同一运行态，后者必须为 `READY`。
5. 管理员诊断接口核对同一模式、名单数量、进程 ID 和加载时间后，才进入浏览器观察窗口。

## 排障与回滚

- `.env` 与运行态不一致、端点不可达、Auth v1/Web/Socket 任一门禁关闭、名单为空或包含受保护角色时，均停止并保持/恢复 legacy。
- 回滚时在 PM2 的实际配置来源关闭门禁并重启服务，再通过运行态端点、预检和 readiness 复核；不要只修改 `.env`。
- 不记录 Pepper、Token、Cookie、密码或 allowlist 账号明细到公开诊断响应。
