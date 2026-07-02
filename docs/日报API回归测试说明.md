# 日报 API 回归测试说明

## 脚本

本轮新增 `scripts/smoke-daily-reports.mjs`，并在 `package.json` 增加：

```bash
npm run test:daily-reports
```

默认 API 地址为 `http://localhost:3001/api`，可通过 `API_BASE_URL` 覆盖。

## 环境变量

- `TOKEN`：普通用户登录 token，必填。
- `ADMIN_TOKEN`：管理员或具备日报审核权限用户 token，可选。
- `API_BASE_URL`：API 根路径，可选。

未提供 `TOKEN` 时脚本只输出用法提示并退出，不会内置任何真实 token。

## 覆盖项

- `GET /daily-reports/me`
- `POST /daily-reports/draft`
- `POST /daily-reports/:id/submit`
- `GET /daily-reports/archive`
- 普通用户访问 `GET /daily-reports/team` 的 200/403 兼容检查
- 设置 `ADMIN_TOKEN` 后检查团队列表与审核接口
- 非法日期 400
- 空日报提交 400
- 版本冲突 409
- 归档范围超过 31 天 400

## 注意

脚本会创建未来日期的 smoke 日报，避免影响当天真实工作流。它只通过公开 API 测试，不直接访问数据库。
