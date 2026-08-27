import assert from "node:assert/strict";
import test from "node:test";
import { applyCollectorLoginRequired, heartbeatLoginStatus } from "./collectorAuthState.js";

test("Collector login_required 立即使 Desktop 登录状态失效", () => {
  const state = applyCollectorLoginRequired();
  assert.equal(state.douyinLoggedIn, false);
  assert.equal(state.browserConnected, false);
  assert.equal(state.browserLoginStatus, "login_required");
  assert.equal(heartbeatLoginStatus(state.browserLoginStatus), "invalid");
});

test("unknown 保持 unknown，不降级为 login_required", () => {
  assert.equal(heartbeatLoginStatus("unknown"), "unknown");
});
