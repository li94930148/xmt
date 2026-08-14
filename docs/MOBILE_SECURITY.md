# XMT Mobile 安全

- Release 禁止 cleartext；API 必须 HTTPS、Socket 必须 WSS/HTTPS。
- Android refresh credential 由 `SecureCredentialPlugin` 使用 Android Keystore AES-GCM 保存；access token 仅保留在运行内存。
- 后端 CORS 使用来源 allowlist，绝不以 `*` 配合 credentials；Android Capacitor/WebView 本地资源 Origin 仅允许明确的 `http://localhost` 与 `https://localhost`，不允许任意端口、局域网 IP 或 lookalike 域名。
- API、工作流、Socket 与 Yjs 仍在服务端执行 RBAC 和资源授权。

FCM 为可选后续集成：需提供 Firebase 项目与 `google-services.json`，并由管理员显式设置 `XMT_ANDROID_PUSH_ENABLED=true`；缺失时应用仍可构建，不得伪造凭据。Android 登录后会以当前用户身份登记 `mobile_devices` 中的设备标识和版本；推送令牌仅在未来接入 Provider 时写入，接口不记录完整令牌，注销时会撤销该设备登记。
