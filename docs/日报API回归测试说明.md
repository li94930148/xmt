# 日报 API 回归测试说明

## 脚本

```bash
npm run test:daily-reports
```

默认 API 地址为 `http://localhost:3001/api`，可通过 `API_BASE_URL` 覆盖。

## 环境变量

- `TOKEN`：普通用户登录 token，完整回归需要。
- `ADMIN_TOKEN`：管理员或具备日报审核权限的用户 token，可选。
- `API_BASE_URL`：API 根路径，可选。

未提供 `TOKEN` 时，脚本只输出用法提示并正常退出，不内置任何真实 token。

## 第 11 轮真实回归结果

- 已使用临时测试账号登录。
- 已获取 `TOKEN`：是。
- 已获取 `ADMIN_TOKEN`：是，账号角色为 admin。
- 执行命令：`npm run test:daily-reports`。
- 结果：真实 token 链路通过。
- 覆盖接口：我的日报查询、非法日期校验、空日报提交校验、保存草稿、版本冲突校验、提交日报、归档查询、归档范围校验、团队日报查询、审核通过。
- 失败接口：无。
- 未覆盖：浏览器手工填写六段、保存、提交、审核的深度 UI 流程。
- 安全说明：未记录账号、密码或 token 明文。

## 有 Token 时的本地命令

仅在本地临时命令行使用 token，不写入代码、文档或提交记录：

```bash
API_BASE_URL=http://localhost:3001/api TOKEN=本地临时token ADMIN_TOKEN=本地临时管理员token npm run test:daily-reports
```

