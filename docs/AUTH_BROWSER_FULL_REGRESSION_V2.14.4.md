# Auth Browser 完整回归报告（v2.14.4）

## 浏览器环境

- Playwright：v1.60.0。
- 浏览器：项目 Playwright Chromium v1223（Chrome for Testing 148.0.7778.96）。
- 系统 Chrome：未使用；测试在找不到项目 Chromium 时直接失败。

## 覆盖场景

1. legacy 登录契约保持不变。
2. v1 Web allowlist 登录、内存 Access Token、HttpOnly Refresh Cookie、页面刷新与新标签恢复。
3. 并发 401 的单飞 Refresh，以及 Refresh 失败、Token reuse、CSRF 失败与 Logout 清理。
4. Socket 重握手、Room 恢复、Yjs 状态恢复、Awareness / Lock 与多标签 Logout 协调。
5. 双浏览器版本替代事件、旧版本只读锁定与进入最新版本恢复。

## 结果

| 命令 | 结果 |
| --- | --- |
| `npm run test:auth-browser` | PASS：v1 Cookie、刷新、重放防护、CSRF、退出和内存令牌恢复。 |
| `npm run test:browser-auth-recovery` | PASS：Socket 重连、恢复状态与多标签协调。 |
| `npm run test:auth-socket-yjs-e2e` | PASS：Auth → Socket → Room → Yjs 完整闭环。 |
| `npm run test:auth` | PASS：legacy 认证行为冻结。 |
| `npm run test:login-gateway` | PASS：legacy / allowlist 路由与受保护角色。 |
| `npm run test:auth-rollout` | PASS：灰度门禁策略。 |
| `npm run check`、`npm run build` | PASS。 |

本次使用的 Chromium 是项目 Playwright v1223。之前的失败来自缺少独立 headless shell 与受限进程环境；测试已改为显式使用已验证可启动的项目 Chromium，而非系统 Chrome。

日志与截图：浏览器测试运行期文件位于系统临时目录，测试结束会自动清理；未保留用户凭据或生产数据。

## 生产边界

本阶段未开启生产灰度、未创建生产账号、未修改生产配置、数据库或 Yjs 协议。
