# XMT Mobile 架构

XMT Mobile 使用 React/Vite 共享 Web 页面、业务组件、RBAC、API 与 Yjs 协作能力，并由 Capacitor Android Runtime 承载本地打包资源。`src/platform/runtime.ts` 统一解析 API、Socket 与平台差异；Android Release 必须注入 HTTPS/WSS 地址。

移动端使用独立 `MobileShell`（底部导航、Safe Area、系统返回键），桌面端继续使用 Sidebar Shell。Socket 保留 polling 后升级 WebSocket、重连、前后台与网络恢复；Yjs 仍由服务端房间授权裁决。

推送采用可选 Provider 架构：Android 客户端通过受认证的 `/api/notifications/mobile-devices` 登记设备，后端以 `mobile_devices` 保存用户归属、设备标识和版本。`XMT_ANDROID_PUSH_ENABLED=true` 是显式功能开关；默认关闭。未配置 Firebase 时不发送推送，应用功能不受影响。
