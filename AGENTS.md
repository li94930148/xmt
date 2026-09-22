# XMT 开发与设计约定

## 设计系统

**唯一视觉规范见根目录 [`DESIGN.md`](./DESIGN.md)（Studio Atelier）。**

新页面/改界面时：

1. 颜色、圆角、阴影、动效一律走 `src/styles/tokens.css` 的 CSS 变量 / Tailwind `studio-*` / `theme-*`
2. 禁止新的 hex 硬编码色板
3. 布局从 `PageShell` + `PageHeader` + `GlassPanel` / `MotionCard` / `XMTCard` 拼装
4. 按钮用 `ActionButton`（ReactBitsButtonSlot）或 `.xmt-btn*`；输入框优先 `.xmt-field`
5. 页面入场用 `AnimatedPage` / `pageVariants`；卡片 hover 走 `cardHover`
6. 尊重 `prefers-reduced-motion`

## 调用关系

```
DESIGN.md                      规范说明
src/styles/tokens.css          唯一令牌源（深/浅色）
src/index.css                  材质、工具类（studio-sheen / xmt-card / xmt-btn / xmt-field）
tailwind.config.js             studio.* / theme.* 映射
src/components/studio/*        壳层与控件
src/design-system/*            XMTCard / ProgressBar / AnimatedNumber
```

## 签名时刻（全站一致）

- 卡片顶边镜面高光 `studio-sheen`
- 玻璃壳层叠（侧栏 / 顶栏 / 面板）
- 数据区 `xmt-data-number` + 渐变图标砖
- 统一入场 stagger 节奏

## 常用命令

- `npm run client:dev` 前端
- `npm run check` 类型检查
- `npm run lint` ESLint
- `npm run build` 生产构建
