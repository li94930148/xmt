# 抖音能力迁移记录

## 本次扫描结果

旧短视频能力位于 `api/services/social-review/`、`api/routes/social-review.ts`、`src/pages/SocialReview*.tsx` 和 `scripts/*social-review*`。旧的 `api/services/douyin.ts` 与旧 `api/routes/douyin.ts` 也使用 Playwright 网页抓取。它们包含网页抓取、CDP/浏览器登录、导出下载、人工/模拟采集链路，均不再是抖音运营中心的数据来源；旧 API 路由和定时抓取调度器已停止挂载/启动。

## 本次替代

`api/services/douyin/` 是新的唯一接入边界，采用 OAuth 授权码模式、服务端加密令牌、OpenAPI 数据适配器、同步日志和 Webhook 幂等事件表。`/api/douyin` 已不再暴露抓取、快照或浏览器关闭接口；前端入口已切换至“抖音运营中心”。

## 非破坏性迁移路径

1. 保留 `social_*`、`douyin_snapshots` 和旧页面/脚本，标记为 deprecated，不由新导航或新路由调用。
2. 将原 `douyin_videos` 重命名为 `douyin_videos_legacy_deprecated`，保留全部历史数据；新 `douyin_videos` 仅存 OpenAPI 数据。
3. 扩展已有 `douyin_accounts`，其中旧 `name`、`profile_url`、`douyin_id` 为 deprecated；不删除字段。
4. 审核通过后，先配置回调并进行小范围授权、核对 OpenAPI 数据，再决定历史数据归档与旧代码物理删除的发布版本。

## 本轮未删除内容

为避免生产数据和既有工作流受损，本轮没有物理删除 `social-review` 服务、页面、脚本或旧表；它们应在连续观察期结束、备份和回滚演练完成后，由独立变更删除。
