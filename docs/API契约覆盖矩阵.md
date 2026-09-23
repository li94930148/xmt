# API 契约覆盖矩阵

`/api/openapi.json` 只承诺下表中的接口。未列出的 legacy `/api/*` 仍按兼容接口维护，不能从 OpenAPI 的存在推断为全量覆盖。

| 领域 | 已登记路径 | 状态 |
| --- | --- | --- |
| Auth v1 | Web 登录、刷新、退出、会话；移动登录、刷新、退出、会话 | 实验性，受灰度开关控制 |
| Auth 灰度治理 | `/api/v1/auth-rollout/status` | 管理员只读 |
| Topics v1 | 列表、详情、创建、更新、删除、审核、状态变更 | v1 契约 |
| 选题模板 | `/api/templates` CRUD | 已登记 legacy 契约 |
| 专注计时 | 开始、完成、放弃、个人统计、团队排行 | 已登记 legacy 契约 |

`shadow-analytics`、协作遥测等没有前端入口的路由属于内部诊断接口，不纳入面向客户端的公开契约。旧抖音抓取客户端及其不符合 OAuth 载荷的共享类型已删除；当前页面统一使用 Creator Center 契约。

接口变更必须同时更新 Zod schema、OpenAPI 登记和 `tests/api-contract/api-contract.test.ts` 快照断言。
