# Phase D7-C Production Graceful Dispose Integration

## 1. 修改文件

- `src/pages/ProductionDetail.tsx`
- `docs/PhaseD7-C-Production-Graceful-Dispose-Integration.md`

未修改 Runtime、AutosaveCoordinator、DisposeController、ContentEditorRuntime、Yjs、Socket.IO、Adapter、API、数据库、权限、版本规则、workflow 或 Shooting。

## 2. 接入方式

ProductionDetail 现在通过 ContentEditor 的通用 handle bridge 保存 `ContentEditorRuntimeHandle` ref：

```tsx
<ContentEditor
  adapter={productionEditorAdapter}
  onRuntimeHandleChange={handleRuntimeHandleChange}
/>
```

页面只持有 Runtime contract，不访问 Tiptap editor、Yjs document、Provider、Socket 或 Adapter 内部对象。

页面创建 `useEditorLeaveGuard({ runtimeHandleRef })`，并使用统一的 `handleGuardedNavigate(to)` 包装受控导航。包装调用：

```text
requestLeave -> Runtime gracefulDispose -> aggregate result -> navigate(to)
```

## 3. 覆盖的导航路径

以下 ProductionDetail 中原本直接调用 `navigate()` 的普通离开路径已接入 guard：

- 返回创作管理：`/production`；
- 顶部关联选题：`/topics/:topicId`；
- 侧栏关联选题：`/topics/:topicId`；
- 已审核状态进入成片制作：`/shooting`。

删除成功后的 `/production` 跳转保持原有直接导航。它属于“删除记录与潜在 in-flight autosave”竞态，D6 已明确要求独立评审，未被混入本阶段。

浏览器关闭、刷新、window unload、Layout 全局导航、back/forward 均未处理。

## 4. 结果行为

| gracefulDispose 聚合结果 | ProductionDetail 行为 |
| --- | --- |
| `durable` | 正常执行原有 `navigate(to)` |
| `durable + degraded` | 正常导航，并通过现有全局通知记录“内容已保存；协作交接尚未确认” |
| `not_durable` | 阻止导航，并显示“最后修改尚未保存”警告 |
| `interrupted` | 与未持久化结果相同，阻止导航并显示警告 |
| 无 Runtime handle | 直接执行原有导航，保持只读/未挂载编辑器场景兼容 |

连续点击由 `useEditorLeaveGuard` 复用同一个 in-flight Promise；不会创建重复 gracefulDispose 或重复 continuation。

本阶段只提供阻止离开的通知。retry / discard 的确认 UI 已由 D7-B hook 支持，但尚未在 Production 页面上渲染，留给后续 UX 接入任务。

## 5. 兼容性

Production 的如下行为未改变：

- Adapter `persist()` 仍调用既有 `updateProduction`，并保持 `version_action: 'none'`；
- major/minor 保存、`production_history` 与版本按钮逻辑；
- 审批、状态更新、权限和资源归属判断；
- `production:<id>` 协作 room 与 Yjs/Socket.IO 链路。

## 6. 验证结果

执行成功：

```text
npm run check
npx tsx src/hooks/useEditorLeaveGuard.test.ts
npx tsx src/editor/runtime/GracefulDisposeController.test.ts
npx tsx src/editor/runtime/RuntimeHandleBridge.test.ts
```

自动 mock 覆盖了 Production 接入所依赖的离开决策：

1. 无 handle 正常继续（对应只读/未挂载 editor 的返回）；
2. durable 自动继续；
3. durable + degraded 自动继续并返回 warning；
4. not_durable 阻止 continuation；
5. retry 成功；
6. 连续 requestLeave 复用 in-flight Promise。

本阶段未启动浏览器/开发服务器，也未执行真实 Production 文档交互；真实页面的“编辑后返回”和 API 失败场景需在后续受控验收任务中用可回滚 Production 测试记录验证，不能用 mock 结果替代。

## 7. 回滚方式

回滚时移除 ProductionDetail 的 handle ref、`useEditorLeaveGuard` 调用、`handleGuardedNavigate` 和 `onRuntimeHandleChange` prop，并将上述四个页面内导航按钮恢复为原有 `navigate()`。不涉及数据迁移、API 或协作协议回滚。

