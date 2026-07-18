# Phase B1-C：ContentEditor Runtime 接管报告

## 1. 修改文件

|文件|修改内容|
|-|-|
|`src/components/ContentEditor.tsx`|rich 模式将既有 `Editor` 放入 `ContentEditorRuntime`；根据原有 props 构造无业务语义 adapter。|
|`src/editor/runtime/ContentEditorRuntime.tsx`|更新阶段说明：Runtime 已拥有 adapter、生命周期和内部 autosave handle，但仍未拥有业务持久化或协作实现。|
|`docs/PhaseB1-C-ContentEditor-Runtime-Integration.md`|本阶段集成与验证记录。|

没有修改 `Editor.tsx`、ProductionDetail、ShootingDetail、Yjs、Socket.IO、writeConsistency、API、数据库、权限或版本系统。

## 2. ContentEditor 调用链变化

```text
此前：ContentEditor -> Editor
现在：ContentEditor -> ContentEditorRuntime -> Editor
```

外部 `ContentEditorProps` 没有改变。`ContentEditor` 仍然拥有原有 socket、`useCollaborativeDocument`、presence、状态事件、telemetry 和 legacy 分支；`Editor` 仍然接收原有 `value/onChange/onSave/collaboration/stateDocId` props，继续拥有 Tiptap、extensions、toolbar 与 collaboration props 的处理。

## 3. Runtime 接入方式

rich 分支在 `ContentEditor` 内部生成纯通用 adapter：

- `documentId` / `collaborationRoom` 来自既有 `collaborationKey`，未解释或按资源类型分支；
- `initialContent` 来自既有 `value`；
- `readonly` 由既有 `readOnly || mode === 'readonly'` 结果提供；
- capabilities 透传既有 collaboration、manualSave、immersive、pageScroll 状态；
- Runtime render-prop 将 readonly、immersive、pageScroll 继续传入原 `Editor`。

本阶段没有为该通用 adapter 配置实际业务 `persist`。现有页面仍通过它们原有的 `syncToDatabase` effect 保存内容；Runtime 的 autosave handle 未被编辑变更触发，因此不会增加请求、替代页面保存或产生重复保存。该无副作用 bridge 是 B1-C 保持线上行为不变的关键。

## 4. 行为兼容验证

|行为|验证结果|依据|
|-|-|-|
|rich 模式|通过静态验证|`Editor` 的 value、onChange、onSave、placeholder、collaboration、stateDocId 均原样保留，仅增加 Runtime 父层。|
|legacy 模式|通过静态验证|`if (mode === 'legacy')` 的 `RichTextEditor` 分支位于 Runtime 之前，未修改。|
|readonly|通过静态验证|原 `resolvedReadOnly` 被放入 adapter，并由 `runtime.readonly` 传给同一 `Editor` prop。|
|autosave|保持现状|Runtime coordinator 未收到 `scheduleSave`；Production/Shooting 页面已有 `syncToDatabase` 路径未修改。|
|destroy|通过代码审查|Runtime unmount 调用幂等 `destroy()`，清理其内部 coordinator pending 状态；ContentEditor 原有 collaboration hook cleanup 未变。|

## 5. 测试结果

- `npm run check`：通过（`tsc --noEmit`，退出码 0）。
- 本地浏览器 smoke：`http://127.0.0.1:4173/login` 正常加载，DOM 非空、无 Vite 错误覆盖层、控制台无 error/warn；点击“切换密码可见状态”后密码 input 从 password 切换为 text。
- 项目未提供可在未认证状态下进入 Production/Shooting 富文本页的既有编辑器测试。未登录业务页以避免写入或改变线上数据；Production/Shooting 的真实 rich 协作与保存回归应在后续认证测试会话中单独执行。

## 6. git diff 摘要

本阶段仅修改 `ContentEditor.tsx`（新增 Runtime import、通用 adapter 及 Runtime 包裹）和 `ContentEditorRuntime.tsx`（阶段职责说明），并新增本报告。未创建 Production/Shooting adapter，未进入 Phase B2。
