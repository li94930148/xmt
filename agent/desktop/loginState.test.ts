import assert from "node:assert/strict";
import test from "node:test";
import { capabilities, loginActionError, mayConfirmLogin, profileAuthenticationFromBrowser } from "./loginState.js";

const ready = (profileAuthentication: Parameters<typeof capabilities>[0]["profileAuthentication"], loginWindowState: Parameters<typeof capabilities>[0]["loginWindowState"] = "closed") => capabilities({ profileAuthentication, loginWindowState, browserReady: true, bindingReady: true, tokenReady: true, databaseReady: true, syncInProgress: false });

test("authenticated managed profile does not require a temporary login window", () => {
  const state = ready("authenticated");
  assert.equal(state.canSync, true);
  assert.equal(state.loginAction, "relogin");
  assert.equal(state.profileAuthenticated, true);
});

test("unauthenticated profile with a closed window must open login and cannot sync", () => {
  const state = ready("unauthenticated");
  assert.equal(state.canSync, false);
  assert.equal(state.loginAction, "open");
});

test("only an awaiting Main-owned window may be confirmed", () => {
  assert.equal(ready("unauthenticated", "awaiting_confirmation").loginAction, "confirm");
  assert.equal(mayConfirmLogin("awaiting_confirmation", true), true);
  assert.equal(mayConfirmLogin("closed", true), false);
});

test("gates fail closed and browser login maps only authentication fact", () => {
  assert.equal(ready("expired").canSync, false);
  assert.equal(capabilities({ profileAuthentication: "authenticated", loginWindowState: "closed", browserReady: false, bindingReady: true, tokenReady: true, databaseReady: true, syncInProgress: false }).canSync, false);
  assert.equal(capabilities({ profileAuthentication: "authenticated", loginWindowState: "closed", browserReady: true, bindingReady: false, tokenReady: true, databaseReady: true, syncInProgress: false }).canSync, false);
  assert.equal(capabilities({ profileAuthentication: "authenticated", loginWindowState: "closed", browserReady: true, bindingReady: true, tokenReady: false, databaseReady: true, syncInProgress: false }).canSync, false);
  assert.equal(capabilities({ profileAuthentication: "authenticated", loginWindowState: "closed", browserReady: true, bindingReady: true, tokenReady: true, databaseReady: false, syncInProgress: false }).canSync, false);
  assert.equal(profileAuthenticationFromBrowser("logged_in"), "authenticated");
  assert.equal(profileAuthenticationFromBrowser("login_required"), "unauthenticated");
});

test("login IPC failures are renderer-safe and stable", () => {
  assert.equal(loginActionError(new Error("Error invoking remote method 'agent:login-complete': Error: LOGIN_WINDOW_NOT_OPEN")), "登录窗口已关闭，请点击“打开登录窗口”后重试。");
  assert.equal(loginActionError(new Error("LOGIN_NOT_CONFIRMED")), "当前抖音创作者中心仍处于登录页面，请完成登录后重试。");
});
