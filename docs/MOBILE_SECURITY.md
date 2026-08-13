# XMT Mobile 安全

- Release 禁止 cleartext；API 必须 HTTPS、Socket 必须 WSS/HTTPS。
- Android refresh credential 由 `SecureCredentialPlugin` 使用 Android Keystore AES-GCM 保存；access token 仅保留在运行内存。
- 后端 CORS 使用来源 allowlist，绝不以 `*` 配合 credentials；部署时将正式 Web 域名写入 `ALLOWED_ORIGINS` 或 `CORS_ORIGINS`，Android 原生壳仅允许明确的 `http://localhost` 来源。
- API、工作流、Socket 与 Yjs 仍在服务端执行 RBAC 和资源授权。

FCM 为可选后续集成：需提供 Firebase 项目与 `google-services.json`，缺失时应用仍可构建，不得伪造凭据。
