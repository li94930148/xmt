# Phase C1 Test Data Creation

## 1 创建时间

- 创建时间：2026-07-15 15:04:37 +08:00（Asia/Shanghai）
- 创建方式：使用现有前端业务入口及既有 API 链路；未直接修改 SQLite 数据库。
- 创建范围：一条专用测试选题及其自动生成的 Production、一条关联的 Shooting。未修改或覆盖任何已有业务记录。

## 2 Production 测试数据

|项目|值|
|-|-|
|名称|`[C1 TEST] Runtime Collaboration Production`|
|测试选题 ID|`111`|
|Production ID|`85`|
|预期协作 room|`production:85`|
|状态|`draft`，当前版本 `v1.0`|
|初始化内容|`C1 Runtime Collaboration Production Test Content`|
|创建链路|提报专用测试选题 → 审核通过 → 既有审核流程自动创建 Production|

创建后已在 Production 详情页确认其初始正文与上述内容一致。未执行小修保存、另开新版、审核提交或其他版本动作；后续自动保存验证应保持 `version_action: 'none'`。

## 3 Shooting 测试数据

|项目|值|
|-|-|
|可识别标签|`[C1 TEST] Runtime Collaboration Shooting`|
|Shooting ID|`34`|
|关联测试选题 ID|`111`|
|预期协作 room|`shooting:34`|
|状态|`planned`|
|初始化 `script_content`|`C1 Runtime Collaboration Shooting Test Content`|
|创建链路|成片制作页面的既有“添加制作计划”入口|

当前 Shooting 数据模型没有独立的名称字段，界面以关联选题标题显示。因此测试选题名称保留为 Production 的指定名称；Shooting 的指定可识别标签存放在 `location` 字段，值为 `[C1 TEST] Runtime Collaboration Shooting`。这避免新增字段、变更 API 或额外创建第二条 Production。

初始化脚本通过既有 Shooting 编辑器写入，并重新打开 `shooting/34` 后确认读取值仍为 `C1 Runtime Collaboration Shooting Test Content`。未执行完成操作，未创建或触发 Publishing 流程。

## 4 数据安全说明

- 所有记录均使用 `[C1 TEST]` 前缀或对应的测试标签，能在列表中快速识别。
- 创建前未对已有 Production、Shooting 或业务选题执行写入；本次新增的依赖选题 ID 为 `111`。
- 沿用了既有权限与资源归属规则；此前 C1 已确认两个测试账号均能登录并以管理员角色访问。未修改权限模型或账号配置。
- 本阶段未执行双用户协同、复制粘贴、断线重连、自动保存并发或页面卸载测试；也未改动 Runtime、Adapter、Yjs、Socket.IO、版本、workflow 或 autosave 实现。
- 未创建发布记录。测试 Shooting 保持 `planned`，禁止点击“完成”。

## 5 删除/回滚方式

在后续 C1 验证结束后，由具有现有删除权限的管理员通过正常 UI/API 清理仅以下 ID：

1. 删除 Shooting `34`（成片制作列表的删除操作）。
2. 删除 Production `85`（创作详情的删除操作），如需单独清理。
3. 删除专用测试选题 `111`（选题管理的删除操作）。现有选题删除链路会清理该选题关联的 Shooting、Production、Production history 和 Topic history；因此若直接执行第 3 步，可覆盖第 1、2 步的关联数据清理。

删除前应再次核对标题为 `[C1 TEST] Runtime Collaboration Production` 且 ID 为 `111`，避免误操作任何业务数据。不得通过直接 SQL 或修改数据库文件清理。
