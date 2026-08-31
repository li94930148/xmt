import assert from "node:assert/strict";
import test from "node:test";
import { loginActionError, loginStateAfterBrowserCheck, mayConfirmLogin } from "./loginState.js";

test("only a live Main-owned login window may be confirmed", () => {
  assert.equal(loginStateAfterBrowserCheck("login_required", true), "awaiting_confirmation");
  assert.equal(mayConfirmLogin("awaiting_confirmation", true), true);
  assert.equal(mayConfirmLogin("awaiting_confirmation", false), false);
  assert.equal(mayConfirmLogin("closed", true), false);
});

test("profile-authenticated and restarted states cannot retain a fake confirmation window", () => {
  assert.equal(loginStateAfterBrowserCheck("logged_in", true), "authenticated");
  assert.equal(loginStateAfterBrowserCheck("unknown", false), "closed");
  assert.equal(loginStateAfterBrowserCheck("login_required", false), "closed");
});

test("login IPC failures are renderer-safe and stable", () => {
  assert.equal(loginActionError(new Error("Error invoking remote method 'agent:login-complete': Error: LOGIN_WINDOW_NOT_OPEN")), "登录窗口已关闭，请点击“打开登录窗口”后重试。");
  assert.equal(loginActionError(new Error("LOGIN_NOT_CONFIRMED")), "当前抖音创作者中心仍处于登录页面，请完成登录后重试。");
});
