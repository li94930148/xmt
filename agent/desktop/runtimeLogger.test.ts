import assert from "node:assert/strict";
import test from "node:test";
import {
  collectorCheckpointLog,
  safeErrorClass,
  serializeAgentRuntimeLog,
} from "./runtimeLogger.js";

test("Agent runtime logs serialize only safe structured fields", () => {
  const line = serializeAgentRuntimeLog(
    {
      event: "sync.failed",
      level: "error",
      fields: {
        reasonCode: "UPLOAD_QUEUE_FAILURE",
        accountId: "private-account-123",
        errorMessage: "token=private-token",
        serverUrl: "https://private.example/path?token=private-token",
      },
    },
    "2026-09-30T00:00:00.000Z",
  );
  const record = JSON.parse(line) as Record<string, unknown>;

  assert.deepEqual(record, {
    timestamp: "2026-09-30T00:00:00.000Z",
    level: "error",
    service: "xmt-creator-agent",
    component: "desktop",
    event: "sync.failed",
    reasonCode: "UPLOAD_QUEUE_FAILURE",
  });
  assert.doesNotMatch(line, /private-account|private-token|private\.example|errorMessage|serverUrl/);
});

test("collector checkpoints keep bounded stage and aggregate counts only", () => {
  const input = collectorCheckpointLog("snapshot:complete", {
    task_id: "private-task-id",
    mode: "full_snapshot",
    works: 12,
    xhr: 4,
    platform_account_id: "private-account-id",
    message: "cookie=private-cookie",
  });
  const line = serializeAgentRuntimeLog(input, "2026-09-30T00:00:00.000Z");
  const record = JSON.parse(line) as Record<string, unknown>;

  assert.deepEqual(record, {
    timestamp: "2026-09-30T00:00:00.000Z",
    level: "info",
    service: "xmt-creator-agent",
    component: "desktop",
    event: "collector.checkpoint",
    stage: "snapshot_complete",
    mode: "full_snapshot",
    works: 12,
    xhr: 4,
  });
  assert.doesNotMatch(line, /private-task|private-account|private-cookie|platform_account_id|message/);
});

test("unclassified failures collapse to a stable class", () => {
  assert.equal(safeErrorClass(new TypeError("contains private path")), "TypeError");
  assert.equal(safeErrorClass(new Error("contains private path")), "Error");
  assert.equal(safeErrorClass("token=private-token"), "OtherError");
});

test("renderer error codes retain safe negative Electron codes only", () => {
  const line = serializeAgentRuntimeLog({
    event: "renderer.load_failed",
    level: "error",
    fields: { errorCode: -105, url: "https://private.example/?token=secret" },
  });
  const record = JSON.parse(line) as Record<string, unknown>;
  assert.equal(record.errorCode, -105);
  assert.equal("url" in record, false);
  assert.doesNotMatch(line, /private\.example|secret/);
});
