export type ProfileAuthentication = "unknown" | "unauthenticated" | "authenticated" | "expired" | "error";
export type LoginWindowState = "closed" | "opening" | "awaiting_confirmation" | "closing" | "error";

export type AgentCapabilities = {
  profileAuthenticated: boolean;
  loginWindowState: LoginWindowState;
  browserReady: boolean;
  bindingReady: boolean;
  tokenReady: boolean;
  databaseReady: boolean;
  syncInProgress: boolean;
  canSync: boolean;
  loginAction: "open" | "confirm" | "relogin" | "unavailable";
};

export function profileAuthenticationFromBrowser(status: "logged_in" | "login_required" | "unknown"): ProfileAuthentication {
  return status === "logged_in" ? "authenticated" : status === "login_required" ? "unauthenticated" : "unknown";
}

export function capabilities(input: Omit<AgentCapabilities, "canSync" | "loginAction" | "profileAuthenticated"> & { profileAuthentication: ProfileAuthentication }): AgentCapabilities {
  const profileAuthenticated = input.profileAuthentication === "authenticated";
  const canSync = profileAuthenticated && input.browserReady && input.bindingReady && input.tokenReady && input.databaseReady && !input.syncInProgress;
  const loginAction = !input.browserReady ? "unavailable" : input.loginWindowState === "awaiting_confirmation" ? "confirm" : profileAuthenticated ? "relogin" : "open";
  return { ...input, profileAuthenticated, canSync, loginAction };
}

export function mayConfirmLogin(state: LoginWindowState, windowOpen: boolean) {
  return state === "awaiting_confirmation" && windowOpen;
}

export function loginActionError(message: unknown) {
  const value = message instanceof Error ? message.message : String(message || "");
  if (/LOGIN_WINDOW_NOT_OPEN/.test(value)) return "登录窗口已关闭，请点击“打开登录窗口”后重试。";
  if (/LOGIN_NOT_CONFIRMED/.test(value)) return "当前抖音创作者中心仍处于登录页面，请完成登录后重试。";
  if (/LOGIN_STATUS_UNKNOWN/.test(value)) return "暂时无法确认登录状态，请保持登录窗口打开后重试。";
  return "登录操作未完成，请检查浏览器状态后重试。";
}
