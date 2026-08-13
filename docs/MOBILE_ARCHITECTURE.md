# XMT Mobile 架构

XMT Mobile 使用 React/Vite 共享 Web 页面、业务组件、RBAC、API 与 Yjs 协作能力，并由 Capacitor Android Runtime 承载本地打包资源。`src/platform/runtime.ts` 统一解析 API、Socket 与平台差异；Android Release 必须注入 HTTPS/WSS 地址。

移动端使用独立 `MobileShell`（底部导航、Safe Area、系统返回键），桌面端继续使用 Sidebar Shell。Socket 保留 polling 后升级 WebSocket、重连、前后台与网络恢复；Yjs 仍由服务端房间授权裁决。
