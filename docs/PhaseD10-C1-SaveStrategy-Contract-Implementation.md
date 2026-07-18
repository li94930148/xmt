# Phase D10-C1 SaveStrategy Contract Implementation

## 1. 修改文件

|文件|修改|
|-|-|
|`src/editor/contracts/contentEditorAdapter.ts`|新增保存策略、resolver、ManualSaveResult、`not_applicable` outcome 和可选 `manualSave` handle 类型|
|`src/editor/contracts/SaveStrategy.contract.test.ts`|新增纯 Contract 测试|
|`src/editor/runtime/RuntimeHandleBridge.test.ts`|更新 Runtime handle mock，覆盖新增可选成员|
|`src/hooks/useEditorLeaveGuard.test.ts`|更新 Runtime handle mock|
|`src/pages/ShootingLeaveFlow.test.ts`|更新 Runtime handle mock|

未修改任何业务页面、Runtime 实现、AutosaveCoordinator、Adapter、API、数据库、Yjs 或 Socket.IO。

## 2. 类型变化

新增：

```ts
type ContentEditorSaveStrategy = 'autosave' | 'manual' | 'external';
```

新增 resolver：

```ts
resolveContentEditorSaveStrategy(adapter?)
```

解析规则：

|输入|结果|
|-|-|
|无 adapter / `null`|`external`|
|adapter 未声明 `saveStrategy`|`autosave`|
|adapter 声明策略|使用声明值|

另外新增：

- `ManualSaveResult`：`saved | failed | cancelled | already_destroyed` 以及 revision/error；
- `AggregateDisposeOutcome` 的 `not_applicable`；
- `ContentEditorRuntimeHandle.manualSave?()` 可选类型成员。

`manualSave` 在 C1 保持可选，因为本阶段只落地类型，尚未实现 ManualSaveController。C2 Runtime 实现阶段负责提供实际命令；在此之前现有 Runtime 和页面行为不变。

## 3. 兼容性说明

- Production/Shooting 现有 Adapter 未设置 `saveStrategy`，resolver 默认 `autosave`，因此无需修改页面或 Adapter。
- 当前无 Adapter 页面通过 resolver 获得 `external` 的明确语义，但 ContentEditor 尚未接入该 routing；本阶段不会改变其保存路径。
- `manualSave?` 为 optional，不会破坏当前 Runtime handle 实现；所有现有测试 mock 已补齐该成员以提前验证未来 handle 形状。
- `not_applicable` 仅增加类型成员；GracefulDisposeController 与 LeaveGuard 的行为尚未改变，留待后续 Runtime implementation 阶段。

## 4. 测试结果

执行并通过：

```text
npm run check
npx tsx src/editor/contracts/SaveStrategy.contract.test.ts
npx tsx src/editor/runtime/RuntimeHandleBridge.test.ts
npx tsx src/hooks/useEditorLeaveGuard.test.ts
npx tsx src/pages/ShootingLeaveFlow.test.ts
```

新增 Contract 测试覆盖：

- adapter 未设置策略时解析为 `autosave`；
- 无 adapter / `null` 时解析为 `external`；
- `manual` 策略可识别；
- `not_applicable` 与 `ManualSaveResult` 可作为有效 Contract 值。

## 5. 下一阶段建议

进入 D10-C2 前应仅实现独立的 ManualSaveController 与 Runtime strategy dispatch：

1. `manual` 输入不创建 autosave timer，也不调用 `persist`；
2. `manualSave()` 处理 revision、in-flight 去重、成功/失败/销毁结果；
3. `autosave` 继续使用既有 AutosaveCoordinator，不修改其实现；
4. 不接入 TopicDetail，先完成 Production/Shooting 回归和 Runtime mock 验证。

本阶段已完成后停止，未进入 Topic 页面接入。
