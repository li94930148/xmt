# XMT 部署的 HTTPS 硬性要求

XMT 服务（`api/app.ts`）通过 helmet 启用了 CSP 指令 `upgrade-insecure-requests`，
浏览器会把所有 `http://` 资源请求自动升级为 `https://`。

因此，**XMT 必须部署在 HTTPS 站点之后**（Caddy 自动签发证书或自有证书均可）。

## 不满足时的现象

- 页面在浏览器中完全无法加载（HTML/CSS/JS 都被升级到 https 后请求失败）。
- 没有任何 4xx/5xx 错误，仅显示 ERR_CONNECTION_REFUSED 或空白页。
- `curl http://example.com/api/health` 在 HTTP 下返回 200，但浏览器访问整站空白。

## 合规的部署方式

- ✅ Caddy 自动证书（参考 `deploy/linux/Caddyfile.example`，Let's Encrypt）
- ✅ Nginx + 自有 TLS 证书
- ✅ 云厂商负载均衡终止 TLS
- ❌ 仅 HTTP（内网演示环境需自行去掉 `upgrade-insecure-requests` 指令或改走 HTTPS）

## 临时 HTTP 演示环境的处理

如果仅在内网临时测试且无法启用 HTTPS，请注释 `api/app.ts` 中 helmet 的
`upgradeInsecureRequests: []` 配置行，并相应放宽 `connectSrc` 等指令；并在重新
暴露公网前恢复，避免潜在混合内容降级。