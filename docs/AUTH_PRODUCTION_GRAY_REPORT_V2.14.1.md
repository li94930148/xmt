# Auth 生产 Member Allowlist 灰度报告（v2.14.1）

## 结论

本次 Phase 2-C3-8-C3 在灰度准入检查阶段安全中止，未进入真实浏览器验证，也未向正式用户开放 Auth v1、Socket Bridge 或版本同步协作链路。

## 范围与时间窗口

- 生产版本：`v2.14.1`
- 生产提交：`db27744`
- 执行时间：2026-08-01 21:39–21:41 CST
- 测试账号：新建 2 个专用 member 账号；未使用 admin、director 或正式业务账号。
- 浏览器、Socket、Yjs、Version Sync 测试：未执行。

## 已执行事项

1. 已在修改前备份生产 `.env` 与 SQLite 数据库。
2. 已创建 2 个随机强密码的隔离 member 测试账号，并写入 activity_log；密码未输出、未写入 Git。
3. 已按 allowlist 方案准备 Auth v1、Login Gateway 与 Socket Bridge 配置。
4. 已执行 `npm run auth:production-preflight` 和 `npm run auth:gray-readiness`。

## 准入结果与中止原因

灰度就绪检查返回 `NOT_READY`。预检仍显示 Login Rollout 和 Socket Bridge 为 legacy，allowlist 数量为 0。

根因是生产预检和就绪检查以独立进程运行，但当前实现未加载 `.env`；它们无法可靠读取刚准备的灰度配置，因此不能作为“配置已被运行时采纳”的证据。按照“必须 READY 才能进入浏览器验证”的控制规则，本次立即停止，未尝试绕过检查或继续测试。

## 回滚与验收

- 已恢复灰度前 `.env` 备份，并重启 `xmt-api` 回到 legacy。
- 已确认 Login Rollout、Auth v1、Auth Web、生产审批、Socket Bridge 与 Socket Bridge 审批均为 `false`。
- 两个测试账号已 disabled；保留 activity_log、Session、Refresh Token 和 Auth Event 审计数据。
- 本机 `/private/tmp` 的临时凭据已删除，生产服务器的临时凭据文件已删除。
- 回滚后 SQLite `quick_check` 为 `ok`，Auth 生产预检正常。

## 指标与异常

| 项目 | 结果 |
| --- | --- |
| login.success / v1 login | 未进入浏览器测试，无有效灰度登录 |
| refresh / csrf / token reuse | 未触发 |
| Socket / Yjs | 未接入测试 |
| `version:superseded` / 409 | 未触发 |
| 发现异常 | 就绪检查与运行配置来源不一致 |

## 后续建议

在下一次 C3 执行前，先修复或替换生产配置的单一可信来源：让预检、就绪检查与 PM2 运行时读取同一套配置，并通过只读状态接口确认实际生效值。该改动应单独评审、测试和部署；在其完成前，不应重新开启生产 allowlist 灰度。

