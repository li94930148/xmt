# XMT 系统级设计系统 · Studio Atelier

> 适用范围：Web 端全部页面、壳层、组件与交互。任何新界面必须遵循本规范，禁止另起炉灶。

## 1. 风格锚点

**内容生产控制台（Content Ops Control Room）**

- 参照气质：Linear 的交互精度 × Apple Pro App 的材质深度 × Arc 的空间层级
- 不是营销落地页，不是廉价霓虹赛博；是**克制、精密、有呼吸感**的专业工作台
- 关键词：深空墨蓝底、发丝线、玻璃层、镜面高光、数据排版、键盘优先

## 2. 色彩

### 深色（默认）

| Token | 值 | 用途 |
|-------|-----|------|
| `--xmt-app-bg` | `#080B12` | 全局底 |
| `--xmt-app-bg-soft` | `#0C1018` | 次级底/轨道 |
| `--xmt-surface` | `#121826` | 卡片/面板 |
| `--xmt-surface-soft` | `#171E2E` | 嵌套面/hover |
| `--xmt-surface-glass` | `rgba(18,24,38,0.72)` | 玻璃壳 |
| `--xmt-border-soft` | `rgba(148,163,184,0.12)` | 发丝线 |
| `--xmt-border-active` | `rgba(107,140,255,0.50)` | 激活描边 |
| `--xmt-text-primary` | `#F2F5FA` | 主文案 |
| `--xmt-text-secondary` | `#A3AFC4` | 次文案 |
| `--xmt-text-muted` | `#6B7A93` | 弱化/占位 |
| `--xmt-primary` | `#6B8CFF` | 主强调（长春花蓝） |
| `--xmt-cyan` | `#5CE1E6` | 数据/信息 |
| `--xmt-violet` | `#A78BFA` | AI/创意 |
| `--xmt-coral` | `#FF7A93` | 危险/热度 |
| `--xmt-amber` | `#F5C86B` | 警示/待办 |
| `--xmt-success` | `#3DDBA0` | 成功 |

### 浅色

底 `#F4F6FA` / 面 `#FFFFFF` / 次面 `#EEF2F8` / 墨 `#0F172A` / 主强调 `#3D5AFE`。
语义色与深色同族，对比色使用更深饱和变体。

### 使用原则

1. 全局只允许 **1 个主强调色**（primary）+ 语义色；cyan/violet/coral/amber 仅作数据分层
2. 禁止大面积彩虹渐变；渐变只作图标底、进度、极淡氛围
3. 文案对比：主文案 ≥ 7:1，次文案 ≥ 4.5:1

## 3. 字体与排版

| 角色 | 字体 | 规格 |
|------|------|------|
| 标题 | Inter / PingFang SC | 24–32px / 600–700 / tracking -0.02em |
| 正文 | Inter / PingFang SC | 14px / 400 / lh 1.6 |
| 标签 | 同上 | 12px / 500–600 |
| 数据 | Inter tabular-nums | 数字 28–36px / 600 |
| 代码 | JetBrains Mono | 12–13px |

- 中文界面默认 `font-family: Inter, 'PingFang SC', 'Noto Sans SC', system-ui`
- 所有指标、时间、金额使用 `font-variant-numeric: tabular-nums`（`.xmt-data-number`）

## 4. 布局与密度

- 栅格：8px 基数；常用间距 8 / 12 / 16 / 24 / 32
- 侧栏：展开 240px，折叠 72px；顶栏 56–64px
- 内容最大宽：1440px；页边距 24px（移动 16px）
- 卡片内边距：16–24px；卡片间距 16px
- 圆角：按钮 12px / 卡片 18px / 面板 22px / 胶囊 full
- 密度：专业工具偏紧，但卡片之间必须留呼吸；禁止 4 种以上卡片样式并存

## 5. 材质与阴影

| 层级 | 处理 |
|------|------|
| 背景 | 极淡网格 `studio-grid-bg` + 双径向氛围光 |
| 玻璃 | `backdrop-blur-xl` + `--xmt-surface-glass` + 1px 发丝线 |
| 卡片 | `shadow-card`，hover 时 `border-active` + `shadow-glow-primary` |
| 浮层 | `shadow-floating` / 模态 `shadow-modal` |
| 镜面 | 卡片顶边 1px 渐变高光（`.studio-sheen`），按钮 primary 可选 specular |

禁止：重投影堆叠、全息彩虹边、无意义 glow 铺满屏。

## 6. 组件契约

| 组件 | 文件 | 要求 |
|------|------|------|
| AppShell | `studio/AppShell` | 全局底 + 网格 |
| GlassPanel | `studio/GlassPanel` | 玻璃面板默认容器 |
| MotionCard / XMTCard | studio / design-system | 统一 hover：抬升 2px + 描边发光 + sheen |
| MetricCard | `studio/MetricCard` | 标题小标 + 大数字 + 趋势 + 图标块 |
| ActionButton | `studio/ActionButton` | primary / secondary / ghost / danger / icon / ai |
| StatusPill | `studio/StatusPill` | 语义色胶囊 + 呼吸点 |
| PageHeader | `studio/PageHeader` | 大标题 + 操作区 |
| SearchBar | `studio/SearchBar` | 统一输入框视觉 |
| EmptyState | `studio/EmptyState` | 图标 + 标题 + 可选行动 |
| Topbar | `studio/Topbar` | 毛玻璃吸顶 |

按钮高度统一 `min-h-10`；输入框统一 `min-h-10 rounded-button` + focus 环。

## 7. 动效

| Token | 时长 | 缓动 |
|-------|------|------|
| micro | 120ms | `cubic-bezier(0.22,1,0.36,1)` |
| standard | 200ms | 同上 |
| page | 320ms | 同上 |
| enter | 220ms | 同上 |

- 页面：淡入 + 上移 8–10px（`AnimatedPage` / `pageVariants`）
- 卡片 hover：`y: -2` + 描边/光晕过渡
- 列表新条目：顶部滑入 + 高亮渐隐
- 一律尊重 `prefers-reduced-motion`
- 禁止：弹跳、夸张缩放、全屏旋转

## 8. 交互高级感

1. **焦点可见**：`:focus-visible` 2px primary 环，offset 2px
2. **按压反馈**：active 轻微 scale(0.98)
3. **命令面板**：⌘K / Ctrl+K，遮罩 blur，键盘导航
4. **表格行 hover**：仅背景微亮，不位移
5. **空态 / 加载 / 错误** 三态组件化，禁止白屏
6. **Toast**：右上滑入，语义色描边，自动消失

## 9. 签名时刻（全站必须一致）

1. 卡片顶边镜面高光 `studio-sheen`
2. 玻璃壳层叠（侧栏 / 顶栏 / 面板同材质语言）
3. 数据区 tabular-nums + 渐变图标砖
4. 页面入场 stagger 节奏

## 10. 禁止事项

- 另建第二套色板 / 随机 hex 硬编码（必须走 token）
- 多种按钮圆角、阴影、字重混用
- 装饰性 emoji 当图标
- 长说明文案堆进 UI
- 无 hover/focus/empty 状态的交互控件

---

## 调用关系（实现层）

```
styles/tokens.css     → 唯一色板与圆角/阴影源
index.css             → 全局材质、工具类、动效 keyframes
tailwind.config.js    → studio.* / theme.* 映射 token
components/studio/*   → 业务页应优先复用的壳层与控件
design-system/*       → XMTCard / ProgressBar / AnimatedNumber
```

新页面请从 `PageShell` + `PageHeader` + `GlassPanel`/`MotionCard` 开始拼装。

## 11. 富文本编辑器

- **Chrome（工具栏/菜单/边框/焦点环）** 必须走 `--editor-*` 与 `studio-*` token
- **内容色板**（高亮 mark、文字颜色、导出打印 CSS）是正文语义色，独立于 UI 色板，不要强行映射到 brand 色
- 批注（comment mark）用 `--xmt-amber` 语义，与内容高亮区分

## 12. 空态 / 加载 / 错误

- 列表与详情页统一使用 `components/common/LoadingState` / `ErrorState` 与 `studio/EmptyState`
- 加载骨架走 `SkeletonCard` / `SkeletonTable` / `StudioSkeleton*`（shimmer + surface token）
- 空态必须有图标 + 标题 + 可选描述/行动；禁止空白区域
- 错误态语义色用 `studio-coral`，提供「重试」行动
- creator-center 等业务页的本地 Empty/Loading/Error 只做文案包装，视觉必须走上述组件

## 13. 浮层入场编排

- 命令面板 / 帮助 / 模态统一使用 `.xmt-overlay` + `.xmt-panel-enter`
- 命令面板用 `.xmt-overlay-top`（顶部 15vh），其余用 `.xmt-overlay-center`
- 节奏：遮罩 180ms 淡入 → 面板 220ms 上浮缩放（`cubic-bezier(0.22,1,0.36,1)`）
- 尊重 `prefers-reduced-motion`；禁止再混用 ad-hoc `animate-in` / 各写各的 zoom
