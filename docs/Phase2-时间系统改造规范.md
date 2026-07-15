# Phase 2：XMT 时间系统改造规范

## 统一契约

- 时区：`Asia/Shanghai`。
- 数据库存储：`YYYY-MM-DD HH:mm:ss`，代表北京时间民用时间。
- API：`YYYY-MM-DDTHH:mm:ss+08:00`。
- 前端展示：必须通过 `shared/time` 或在 `Intl` 中显式声明 `timeZone: 'Asia/Shanghai'`；不得依赖浏览器系统时区。

## 使用规则

- 写入数据库时使用 `formatBjtDatabase(nowBjt())`，并把结果作为 SQL 参数传入。
- 读取历史数据库时间使用 `parseStoredBjt()`；无偏移的旧值按北京时间解释，带 `Z` 或偏移的值按其自身偏移解释。
- 日期筛选使用 `rangeBjt()` 的半开区间（`>= start AND < endExclusive`），避免 23:59:59 和跨月边界问题。
- API 序列化使用 `formatBjtApi()`；页面展示使用 `formatBjtDisplay()` 或既有 `formatBeijingTime()`。
- 不再在新增业务代码中使用 `CURRENT_TIMESTAMP`、`datetime('now')`、`toISOString()` 或无 `timeZone` 的 `toLocaleString()`。

## 存量兼容

既有表不执行 ALTER。保留原有默认列定义以兼容已部署数据库；运行时数据库访问层会将旧 SQL 中精确匹配的 `datetime('now', '+8 hours')` 改写为绑定的北京时间参数，作为逐文件清理期间的过渡措施。新代码不得依赖此过渡能力。

历史数据迁移必须以时间字段审计报告为输入，逐字段确认来源。无法判定来源的值保持原样并记录风险，禁止全库 `+8`。
