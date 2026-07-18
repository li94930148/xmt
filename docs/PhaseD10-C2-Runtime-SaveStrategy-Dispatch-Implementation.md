# Phase D10-C2 Runtime SaveStrategy Dispatch Implementation

## 1. 修改文件

|文件|本阶段修改|
|-|-|
|`src/editor/runtime/ManualSaveController.ts`|新增 manual 保存控制器|
|`src/editor/runtime/SaveStrategyDispatch.ts`|新增策略分流与 non-autosave dispose result 工具|
|`src/editor/runtime/ContentEditorRuntime.tsx`|按策略分派 schedule/manual/dispose/status/destroy 行为|
|`src/components/ContentEditor.tsx`|按 resolved strategy 路由编辑变更；fallback 显式标记 `external`|
|`src/editor/runtime/ManualSaveController.test.ts`|新增 manual controller 单元测试|
|`src/editor/runtime/SaveStrategyDispatch.test.ts`|新增 Runtime strategy dispatch 单元测试|

未修改 TopicDetail、AddTopic、Publishing、Production/Shooting 页面、AutosaveCoordinator、Adapter、API、数据库、Yjs 或 Socket.IO。

## 2. Runtime 行为变化

### autosave

- `ContentEditor` 仅在 resolved strategy 为 `autosave` 时递增 revision 并调用 `scheduleSave()`；
- `ContentEditorRuntime` 仅在该策略下将 `scheduleSave()` 委托给既有 `RuntimeAutosaveCoordinator`；
- Production/Shooting 现有 Adapter 未声明策略时仍默认解析为 `autosave`。

### manual

- `onChange` 只更新受控内容，不创建 debounce timer、不调用 `scheduleSave()`、不调用 `persist()`；
- 新增 `ManualSaveController`：通过显式 `manualSave(content, revision)` 调用 Adapter `persist()`，context 的 `reason` 为 `manual`；
- 支持同 revision in-flight Promise 复用、revision stale 防护、失败后同 revision retry、destroy 后拒绝新保存；
- `getStatus()` 在 manual 模式返回 ManualSaveController 状态。

### external

- 无 Adapter 的 ContentEditor fallback 显式标记为 `external`；
- 内容变更不触发 Runtime 持久化；页面既有显式保存仍是唯一业务保存入口；
- `manualSave()` 对非 manual strategy 返回 `cancelled`，不调用 `persist()`。

## 3. destroy 与 gracefulDispose

- `destroy()` 仍是幂等、立即释放、不等待网络；它会销毁 autosave 与 manual controller，已发出的网络 Promise 不被伪造为已取消。
- `autosave` 保持原有 GracefulDisposeController 语义。
- `manual` 和 `external` 的 `gracefulDispose()` 返回 `outcome: 'not_applicable'`，durability participant 为 `skipped/not_applicable`，不会返回 `durable`。
- 因此 Runtime 不会把未保存的 Topic aggregate form 误判为 durable；Topic 页面接入仍未开始，未来必须由 form dirty guard 决定离开。

## 4. Autosave 兼容说明

`RuntimeAutosaveCoordinator` 没有任何修改。其 debounce、revision、防旧写覆盖、flush 与 Production/Shooting graceful dispose 行为均保持原样。

ManualSaveController 是独立实现，不复用或扩展 AutosaveCoordinator。这样 manual 保存不会引入 Production/Shooting 的 timer 或 autosave 状态副作用。

## 5. 测试结果

通过：

```text
npm run check
npx tsx src/editor/runtime/ManualSaveController.test.ts
npx tsx src/editor/runtime/SaveStrategyDispatch.test.ts
npx tsx src/editor/runtime/GracefulDisposeController.test.ts
npx tsx src/editor/runtime/RuntimeHandleBridge.test.ts
npx tsx src/hooks/useEditorLeaveGuard.test.ts
npx tsx src/pages/ShootingLeaveFlow.test.ts
```

新增覆盖：

- ManualSaveController：success、failure + retry、duplicate revision、stale revision、destroy；
- strategy dispatch：autosave 仍被选中、manual 才调用 persist、external 不调用 persist、non-autosave dispose 为 `not_applicable`。

## 6. 下一阶段建议

建议先执行 D10-C3 stabilization，而不是接入 Topic：

1. 复核 ContentEditor strategy routing 与 fallback external 的页面兼容；
2. 进行 Production/Shooting 浏览器回归，确认 autosave 请求数量与 graceful dispose 不变；
3. 仅在 C3 通过后，按 D10-A/D10-B 的准入条件另开 TopicDetail manual-save bridge 实施任务。

本阶段完成后停止，未接入 Topic 页面。
