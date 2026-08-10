# Socket Polling SID Lifecycle Investigation（v2.17.2 基线）

日期：2026-08-10

## 结论

### B 类旧 SID 根因

当前证据表明，B 类 `client_repeated_polling_old_sid` 并非来自同一页面创建多个 Socket 实例：

- `useSocket` 使用模块级单例；同一用户与 token 会复用已有实例。
- React StrictMode 再次执行 effect 时命中同一单例，不会重复创建连接。
- 浏览器刷新、关标签或网络中断会使旧 polling 连接在服务器端先因 `ping timeout` 或 transport error 结束；短时间内仍到达的旧 polling 请求会被 observer 归为 B 类。
- 新基线样本中，2 个 B 类事件都紧跟 `ping timeout` 断连，并随后建立了新的 polling 连接。

这符合旧 polling SID 的延迟请求/浏览器恢复窗口特征；尚无多实例、代理 5xx 或 websocket transport switch 证据。

## 参数审计

| 层 | 当前设置 |
| --- | --- |
| Client transports | `['polling']` |
| Client upgrade | `false` |
| Client reconnect | 开启，最多 5 次，初始延迟 1 秒 |
| Server Engine.IO | 未显式覆写 `pingInterval`、`pingTimeout`、`allowUpgrades`，使用 Socket.IO 默认值 |
| 生产样本 transport | 全部 polling；无 upgrade 样本 |

生产保持 polling 是现有 HTTP 环境的兼容策略；本阶段不改变该策略或代理配置。

## 新增开发诊断

新增开发环境专用的客户端 Socket 生命周期诊断，记录：

- `instanceId`、`createdAt`；
- create、connect、disconnect、reconnect attempt、destroy；
- disconnect reason 和 reconnect attempt。

诊断不记录 Socket ID、用户信息、token、Cookie、房间或消息内容；生产构建不启用。

## Chromium 验证

项目管理的 Playwright Chromium 与本地真实 Socket.IO polling 夹具验证通过：

1. 首页式初始连接；
2. 页面刷新后建立一个新的浏览器 Socket 实例；
3. 关闭后新开标签建立新的实例；
4. 网络断开/恢复后产生 reconnect 并恢复连接；
5. visibility 事件被观察；headless 环境不对操作系统后台节流做结论；
6. logout/login 等价的 disconnect/connect 能释放并重新建立 polling 会话。

## 是否需要客户端修复

当前不需要变更 Socket/Auth/Yjs 业务逻辑。先上线开发诊断，并继续在 legacy 下观察 B 类频率与内存趋势。若 B 类在完整业务时段持续偏高，再单独评审 polling timeout、页面卸载释放策略与反向代理超时配置。

## C3.12-A 准入结论

**暂不满足。** 虽已定位 B 类主要行为并完成客户端回归，但生产样本中 `Session ID unknown` 为 3/10，且 heap 仍需继续验证是否稳定。所有 Auth 灰度开关继续保持关闭。
