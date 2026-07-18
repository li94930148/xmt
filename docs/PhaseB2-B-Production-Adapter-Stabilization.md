# Phase B2-B：Production Adapter Stabilization

## 1. 测试环境

- 工作区：`D:\xmt`
- 本地前端：`http://127.0.0.1:4173`
- 类型检查：TypeScript `tsc --noEmit`
- Runtime 验证：`tsx` 临时 mock（不写入数据库、不调用 Production API）
- 浏览器验证：本地登录页可正常渲染、无 console warning/error，并验证了一个可见控件交互。

未使用生产环境、未部署、未执行数据库写入，也未使用或猜测认证凭据。

## 2. 验证项目

| 项目 | 方法 | 结果 |
| --- | --- | --- |
| Runtime 替代页面 debounce | 检查 `ProductionDetail`：Production 不再调用 `syncToDatabase`；Adapter 将既有保存回调交给 Runtime coordinator。 | 通过 |
| 保存次数与内容 | mock 在 debounce 窗口内调度 revision 1、2，验证只持久化 revision 2 的最新内容。 | 通过 |
| 保存状态 | mock 验证 `saving` 与最终 `synced` 状态均产生；旧 revision 结束时不会覆盖较新保存的 `saving` 状态。 | 通过 |
| revision 防护 | mock 令 revision 1 先发出、后返回，再排队 revision 2；验证 revision 2 随后持久化，重复 revision 不会产生第二次保存。 | 通过 |
| autosave 版本语义 | 静态核对 Adapter `persist` 载荷：`version_action: 'none'`。 | 通过 |
| minor / major 版本 | 静态核对原 `handleVersionedSave('minor' | 'major')` 未变，仍传入 `version_action: versionAction`。 | 通过 |
| 协作 room | 静态核对 Adapter、`activeDocId` 和 `ContentEditor.collaborationKey` 均使用 `getCollaborationRoomId('production', production.id)`。 | 通过 |
| readonly / 权限 | 静态核对 `canEditProduction` 仍由页面原权限模型计算，Adapter 仅接收 `readonly: !canEditProduction || selectedVersionId !== 'current'`。 | 通过 |
| 本地 UI smoke | 登录页非空、无框架错误覆盖层或 console warning/error；密码可见性从 `password` 切换到 `text`。 | 通过 |
| 双用户 Yjs 同步与 presence | 需要两个已授权 Production 测试用户和可控文档；当前本地浏览器没有此认证上下文。 | 未执行，非代码失败 |

## 3. 结果

Production Adapter 的自动保存已由 Runtime coordinator 承担，实际持久化仍为既有调用：

```ts
updateProduction(production.id, {
  topic_id: production.topic_id,
  version: production.version,
  content,
  status: editData.status,
  version_action: 'none',
})
```

自动保存不会触发 minor 或 major 版本。版本按钮、权限计算、Yjs 配置、Socket.IO 协议及协作 room 均未改动。Runtime 对旧 revision 的完成结果采用最新 revision 保护，因此不会将新保存状态回退为已同步。

## 4. 问题修复

未发现需要修复的问题；本阶段没有新增或修改业务代码、协议、数据库、API、权限或版本规则。

唯一的验证限制是缺少本地已认证的双用户 Production 测试上下文。因此无法在本轮完成真实的两用户同步和 presence 人工验收；该项应在受控测试账号环境中执行，重点观察同一 `production:<id>` room 的编辑、断线重连与成员列表。

## 5. 回滚方案

若受控双用户验收发现 Runtime 接入问题，可单独回滚 Phase B2-A 的 Production 接线：

1. 在 `ProductionDetail` 恢复原 `syncToDatabase` debounce effect 与 `cancelDatabaseSync` cleanup。
2. 移除 `productionEditorAdapter` 的创建及 `ContentEditor` 的 `adapter` prop。
3. 保留 Phase A/B1 Contract 与 Runtime 文件，不影响既有未接入页面。

该回滚不涉及数据库迁移、API 回滚、Socket.IO 或 Yjs 状态迁移。

## 6. git diff 摘要

本阶段仅新增本报告。工作树中的代码变更均来自此前 Phase A、B1 与 B2-A：

- `src/editor/adapters/productionEditorAdapter.ts`：新增通用 Production Adapter 映射。
- `src/pages/ProductionDetail.tsx`：将已有 autosave `persist` 回调接至 Adapter；版本/权限/协作逻辑仍留在页面。
- `src/components/ContentEditor.tsx` 与 `src/editor/runtime/*`：此前阶段建立的通用 Runtime 接线与 autosave 边界。

本阶段未提交 Git，未进入 Shooting Adapter。
