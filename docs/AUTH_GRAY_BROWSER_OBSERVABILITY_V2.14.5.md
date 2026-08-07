# Auth 灰度浏览器观测夹具

适用阶段：Phase 2-C3-8-C3.11 及下一次获批的生产 member allowlist 灰度。
当前实现版本：v2.14.6。

## 目标

将同一次登录的服务端结果与浏览器的响应接收、适配器、Auth Runtime 和路由结果关联起来。夹具只采集诊断必需的安全字段，不读取、打印或落盘 token、Cookie、密码、Refresh Token 或 Session secret。

## 观测字段

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `requestId` | 登录请求/响应头 | 与服务端 Auth Event、访问日志关联 |
| `loginAttemptId` | 浏览器生成并作为 requestId 发送 | 标识单次浏览器登录尝试 |
| `responseType` | 浏览器网络事件 | 记录 `http_success`、`http_failure` 或未收到响应 |
| `adapterMode` | 安全 Trace | 确认 `legacy` 或 `v1-web` 响应适配路径 |
| `runtimeState` | Auth Runtime 安全快照 | 仅记录模式、状态、完成标志和是否有内存 token |
| `pathname` | 浏览器地址 | 确认是否进入首页 |
| `stopReason` | 夹具停止规则 | 记录是否因成功登录未跳转而中止 |

## 运行方式

生产灰度获批后，通过临时环境变量向 `test:auth-gray-browser-observer` 提供生产 URL 和本轮专用测试账号。凭据只在进程环境中使用，不写入项目目录、Git、测试输出或报告。

浏览器夹具会先启用本页面会话内的安全 Trace 开关；生产常规用户不会获得该开关，也不会输出前端认证 Trace。

## 强制停止规则

出现以下条件时，夹具在登录阶段立即结束：

```
POST /api/auth/login 返回 2xx
且
最终 pathname != /
```

停止后禁止继续执行 Refresh、Socket、Yjs 或 Version Sync。应先关闭灰度门禁、保留安全观测输出并根据 `requestId` 查询服务端 Auth Event。

## 产出与保留

夹具可将仅含上述字段的 JSON 写入调用方指定的临时受限路径；正式生产报告只引用账号 ID、时间、requestId、结果和停止原因。临时文件在灰度结束后删除。

## 本阶段验证状态

本阶段仅在本地项目 Chromium 和受控 mock v1 response 下验证，不开启生产灰度。实际生产运行必须另行完成审批、运行态 `READY` 检查、固定 allowlist 复核与回滚窗口确认。
