# 抖音开放平台生产配置记录

检查日期：2026-07-21

## 当前控制台核验

应用“岚曜新媒体协作平台”可访问，但控制台总览明确显示当前为**测试应用**，每日调用存在上限；因此“审核通过”不等于“已上线转正”。控制台显示以下项尚未完成：Web 授权回调 URL、Webhook 请求网址及订阅事件、JSBridge 安全域名、测试抖音号预览白名单。

未读取或记录 Client Secret；请仅在部署密钥管理中写入。Client Key 可由管理员从“应用信息”核验后填入部署环境。

## 待人工提交的值

| 配置项 | 值 |
| --- | --- |
| Web 授权回调 URL | `https://lanyaomedia.com/api/douyin/oauth/callback` |
| Webhook URL | `https://lanyaomedia.com/api/douyin/webhook` |
| 安全域名 / JSBridge 域名 | `lanyaomedia.com` |
| 测试期白名单 | 用于真实 OAuth 联调的授权抖音号 |

提交这些控制台配置会改变第三方应用配置，因此本次未自动操作。完成后还需执行“上线转正”。

## 权限申请清单

1. `user_info`：获取已授权用户的 open_id、union_id、昵称、头像。
2. 与当前网站应用类型相匹配的“视频数据查询 / 账号数据 / 互动数据”能力：必须以控制台实际展示的 capability 与 scope 名称为准；不同应用类型、经营关系和视频来源的接口并不通用。
3. `aweme.webhook`：订阅授权、视频或互动相关事件，并配置验签密钥。

不能以猜测的 scope 名称申请。当前代码将视频列表和视频统计 OpenAPI URL 置于 `DOUYIN_VIDEO_LIST_URL`、`DOUYIN_VIDEO_STATISTICS_URL`，待控制台审批返回准确接口和 scope 后填写，避免误调不属于网站应用的接口。

## 联调核验记录

尚未进行真实账号绑定：需要先完成上述回调地址与测试白名单。OAuth 回调会持久化加密令牌，再调用官方用户公开信息接口回填昵称和头像；用户信息同步失败不会丢失已成功换取的 token，后续可由账号同步重试。
