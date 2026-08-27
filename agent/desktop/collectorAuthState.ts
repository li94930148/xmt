import type { LoginState } from "../core/browser/types.js";

export type CollectorDesktopAuthState = {
  douyinLoggedIn: boolean;
  browserConnected: boolean;
  browserLoginStatus: LoginState;
  lastError?: string;
};

export function applyCollectorLoginRequired(): CollectorDesktopAuthState {
  return {
    douyinLoggedIn: false,
    browserConnected: false,
    browserLoginStatus: "login_required",
    lastError: "抖音 Creator Center 登录已失效，请在 Creator Agent 专用浏览器中完成认证后重试。",
  };
}

export function heartbeatLoginStatus(status: LoginState): "valid" | "invalid" | "unknown" {
  return status === "logged_in" ? "valid" : status === "login_required" ? "invalid" : "unknown";
}
