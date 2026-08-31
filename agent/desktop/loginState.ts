import type { LoginState } from "../core/browser/types.js";

export type LoginFlowState = "idle" | "opening" | "awaiting_confirmation" | "authenticated" | "closed" | "error";

export function loginStateAfterBrowserCheck(status: LoginState, windowOpen: boolean): LoginFlowState {
  if (!windowOpen) return "closed";
  return status === "logged_in" ? "authenticated" : "awaiting_confirmation";
}

export function mayConfirmLogin(state: LoginFlowState, windowOpen: boolean) {
  return state === "awaiting_confirmation" && windowOpen;
}

export function loginActionError(message: unknown) {
  const value = message instanceof Error ? message.message : String(message || "");
  if (/LOGIN_WINDOW_NOT_OPEN/.test(value)) return "登录窗口已关闭，请点击“打开登录窗口”后重试。";
  if (/LOGIN_NOT_CONFIRMED/.test(value)) return "当前抖音创作者中心仍处于登录页面，请完成登录后重试。";
  if (/LOGIN_STATUS_UNKNOWN/.test(value)) return "暂时无法确认登录状态，请保持登录窗口打开后重试。";
  return "登录操作未完成，请检查浏览器状态后重试。";
}
