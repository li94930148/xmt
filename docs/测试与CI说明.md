# 测试与 CI 说明

## 当前 CI

`.github/workflows/ci.yml` 在 `main` 分支 push 和 pull request 时执行：

- `npm ci`
- `npm run check`
- `npm run build`

全仓 `npm run lint` 暂不纳入 CI 阻塞项，因为当前仍有既有 238 个 lint 问题。后续建议先增加专项 lint，再逐步治理历史债务。

## 第 11 轮本地真实回归

- `npm run check`：通过。
- `npm run build`：通过。
- `npm run lint`：失败，仍为既有 238 个问题。
- 专项 eslint：通过。
- 日报 smoke：真实 token 链路通过。
- 复盘 smoke：真实 token 链路通过。
- E2E：登录态分支通过。
- API health：smoke 后为 `ok`。

## 本地 Smoke 命令

日报：

```bash
API_BASE_URL=http://localhost:3001/api TOKEN=本地临时token ADMIN_TOKEN=本地临时管理员token npm run test:daily-reports
```

复盘：

```bash
API_BASE_URL=http://localhost:3001/api TOKEN=本地临时token ADMIN_TOKEN=本地临时管理员token npm run test:retrospectives
```

E2E：

```bash
E2E_BASE_URL=http://localhost:5174 E2E_USERNAME=本地测试账号 E2E_PASSWORD=本地测试密码 npm run test:e2e
```

不要把 token、账号或密码写入代码、脚本、文档、CI 配置或提交记录。

## 后续纳入 CI 的建议

- 准备隔离测试数据库和稳定测试账号后，再考虑把 smoke 或 E2E 纳入非生产 CI。
- 不在 GitHub Actions 中写入真实生产 token。
- 全仓 lint 应在历史债务分批清理后再作为 CI 阻塞项。

## 第 12 轮中文化专项补充

- smoke 脚本后续不再生成英文测试标题或英文测试正文。
- 本地已将明确匹配 `Smoke retrospective%` 和 `Smoke follow-up action` 的开发测试数据改为中文。
- 非沙箱 `npm run build` 已通过。
- 专项 eslint 已通过。
- 日报 smoke 和复盘 smoke 均已使用本地临时 token 真实链路通过。
- 登录态 E2E smoke 已通过。
- 中文化浏览器深度补测已覆盖日报、复盘列表、复盘详情、Markdown 导出、HTML 打印页、暗色模式和移动端窄屏。
- CI 仍只执行 `check/build`，不注入真实 token，不把 smoke/E2E 作为阻塞项。
