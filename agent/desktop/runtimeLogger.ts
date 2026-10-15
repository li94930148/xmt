export type AgentRuntimeEvent =
  | "agent.started"
  | "agent.startup_failed"
  | "logging.write_failed"
  | "browser.fallback_succeeded"
  | "browser.start_failed"
  | "browser.login_session_started"
  | "browser.login_confirmed"
  | "browser.session_test_completed"
  | "browser.profile_cleared"
  | "renderer.loaded"
  | "renderer.load_failed"
  | "renderer.loading"
  | "collector.checkpoint"
  | "sync.completed"
  | "sync.failed"
  | "sync.scheduled_failed"
  | "agent.heartbeat_failed"
  | "cover_metadata.completed"
  | "cover_metadata.failed"
  | "device.bound"
  | "server.rebound"
  | "settings.updated";

export type AgentRuntimeLevel = "debug" | "info" | "warn" | "error";

export interface AgentRuntimeLogInput {
  event: AgentRuntimeEvent;
  level?: AgentRuntimeLevel;
  fields?: Record<string, unknown>;
}

const allowedFields: Record<AgentRuntimeEvent, readonly string[]> = {
  "agent.started": ["mode"],
  "agent.startup_failed": ["errorClass"],
  "logging.write_failed": [],
  "browser.fallback_succeeded": ["engine"],
  "browser.start_failed": ["engine", "errorClass"],
  "browser.login_session_started": ["engine", "loginWindowState"],
  "browser.login_confirmed": ["engine"],
  "browser.session_test_completed": ["engine", "profileAuthentication"],
  "browser.profile_cleared": ["engine"],
  "renderer.loaded": ["preloadApi"],
  "renderer.load_failed": ["errorCode"],
  "renderer.loading": ["target"],
  "collector.checkpoint": [
    "stage",
    "mode",
    "status",
    "reasonCode",
    "works",
    "xhr",
    "worksInput",
    "worksFailed",
    "successCount",
    "failedCount",
  ],
  "sync.completed": ["status"],
  "sync.failed": ["reasonCode"],
  "sync.scheduled_failed": ["errorClass"],
  "agent.heartbeat_failed": ["errorClass"],
  "cover_metadata.completed": ["status", "reasonCode"],
  "cover_metadata.failed": ["reasonCode"],
  "device.bound": [],
  "server.rebound": [],
  "settings.updated": ["engine", "mode"],
};

const allowedValues: Record<string, readonly string[]> = {
  mode: ["portable", "standard", "full_snapshot", "metrics_refresh"],
  engine: ["chromium", "webkit", "firefox"],
  loginWindowState: ["opening", "awaiting_confirmation", "closed", "error"],
  profileAuthentication: ["authenticated", "expired", "unauthenticated", "unknown"],
  target: ["file", "dev_server"],
  stage: [
    "collector_start",
    "snapshot_start",
    "snapshot_complete",
    "persistence_start",
    "persistence_complete",
    "upload_start",
    "upload_complete",
    "collector_complete",
    "collector_failed",
    "diagnostic",
    "progress",
    "export_event",
    "other",
  ],
  status: ["success", "failed", "completed", "partial_success", "pending", "unknown"],
  reasonCode: [
    "UPLOAD_QUEUE_FAILURE",
    "LOCAL_UPLOAD_QUEUE_WRITE_FAILED",
    "LOGIN_REQUIRED",
    "OTHER",
  ],
  errorClass: [
    "Error",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "AbortError",
    "OtherError",
  ],
};

const countFields = new Set([
  "works",
  "xhr",
  "worksInput",
  "worksFailed",
  "successCount",
  "failedCount",
  "errorCode",
]);
const allowedLevels = new Set<AgentRuntimeLevel>(["debug", "info", "warn", "error"]);

function safeFieldValue(key: string, value: unknown): string | number | boolean | undefined {
  if (key === "preloadApi") return typeof value === "boolean" ? value : undefined;
  if (countFields.has(key)) {
    const validRange = key === "errorCode" ? Math.abs(Number(value)) <= 100_000 : Number(value) >= 0;
    return typeof value === "number" && Number.isSafeInteger(value) && validRange
      ? value
      : undefined;
  }
  if (typeof value === "string" && allowedValues[key]?.includes(value)) return value;
  return undefined;
}

export function serializeAgentRuntimeLog(
  input: AgentRuntimeLogInput,
  timestamp = new Date().toISOString(),
): string {
  const fields: Record<string, string | number | boolean> = {};
  for (const key of allowedFields[input.event] || []) {
    const safe = safeFieldValue(key, input.fields?.[key]);
    if (safe !== undefined) fields[key] = safe;
  }
  return JSON.stringify({
    timestamp,
    level: input.level && allowedLevels.has(input.level) ? input.level : "info",
    service: "xmt-creator-agent",
    component: "desktop",
    event: input.event,
    ...fields,
  });
}

export function safeErrorClass(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  return allowedValues.errorClass.includes(name) ? name : "OtherError";
}

export function collectorCheckpointLog(
  name: string,
  data: Record<string, unknown>,
): AgentRuntimeLogInput {
  const stages: Record<string, string> = {
    "collector:start": "collector_start",
    "snapshot:start": "snapshot_start",
    "snapshot:complete": "snapshot_complete",
    "persistence:start": "persistence_start",
    "persistence:complete": "persistence_complete",
    "upload:start": "upload_start",
    "upload:complete": "upload_complete",
    "collector:complete": "collector_complete",
    "collector:failed": "collector_failed",
    "collector:diagnostic": "diagnostic",
    "collector:progress": "progress",
  };
  const stage = stages[name] || (name.startsWith("export:") ? "export_event" : "other");
  const fields: Record<string, unknown> = { stage };
  if (stage === "collector_failed") fields.reasonCode = "OTHER";
  for (const key of ["mode", "status", "works", "xhr", "works_input", "works_failed", "success_count", "failed_count"]) {
    if (key in data) fields[key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = data[key];
  }
  return { event: "collector.checkpoint", level: stage === "collector_failed" ? "error" : "info", fields };
}
