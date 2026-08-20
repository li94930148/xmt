# XMT v2.20.0 Creator Collector：Scrapling First

## 架构

旧链路为 Electron 内嵌 Node Playwright Collector、网络拦截和页面探测。新链路为 Electron 通过 `child_process.spawn` 启动 Python Worker，经 stdin/stdout 的 JSON Lines 协议调用 Scrapling `AsyncDynamicSession`；XMT 仅保留平台 Adapter、规范化、脱敏、Manifest、同步和桌面 Bridge。

Worker 方法：`start`、`health`、`login`、`collect`、`cancel`、`shutdown`。事件：`started`、`progress`、`login_required`、`capture`、`export`、`warning`、`error`、`completed`、`cancelled`。普通库日志被禁用，stdout 只允许 JSON 事件。

## Profile 与安全边界

Profile 必须由 Agent 提供，格式为 `profiles/<browser>/<account>/<profile>`，Scrapling 使用 `user_data_dir`，不复用日常 Chrome Profile。默认真实 Chrome、非 headless、无 Stealth、无代理、无验证码绕过。Cookie、Authorization、Token、CSRF、密码和二维码数据会在落盘前递归脱敏；原始响应、Profile、导出和运行输出均被 Git 忽略。

## 数据与能力

采集优先级为 XHR、官方导出、DOM、原始 HTML、截图诊断。每次 run 写入 `manifest.json`、`capability.json`、`xhr/schema-report.json`、`xhr/schema-report.md` 与最小 `audit/acceptance-evidence.json`；不保存完整 XHR。Schema 按响应结构优先归类为 CONTENT_LIST、ACCOUNT_METRIC、TREND_METRIC、EXPORT_TASK、EXPORT_DOWNLOAD 或 UNKNOWN，并把真实交互检查点、页面侧 XHR 计数、可见行计数和 schema 指纹回填到 Capability Manifest。导出文件记录来源、文件名、大小和 SHA-256。当前仅实现 douyin Adapter，其它平台为未实现状态。

## 回滚与限制

旧 Node Collector 已从 Git 删除，可通过回退本提交恢复。不会迁移或清空已有 Profile，也不改动生产数据库。已在用户正常登录的专用 Profile 内验证内容列表、数据中心原始指标/趋势与抖音官方导出；这仍是 POC，不构成生产部署授权。
