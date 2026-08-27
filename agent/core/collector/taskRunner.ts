import crypto from "node:crypto";
import path from "node:path";
import { CreatorDatabase } from "../database/creatorDatabase.js";
import { upload } from "../uploader/client.js";
import type { AgentConfig, CollectionMode, SyncResult } from "../types.js";
import { ScraplingCreatorCollector } from "./scrapling.js";
import { ScraplingWorkerBridge } from "./workerBridge.js";

export type CollectorCheckpoint = (
  name: string,
  data: Record<string, unknown>,
) => void | Promise<void>;
export async function runCreatorCollectorTask(options: {
  config: AgentConfig;
  dataRoot: string;
  repositoryRoot: string;
  profilePath: string;
  token: string;
  mode: CollectionMode;
  packaged?: boolean;
  checkpoint?: CollectorCheckpoint;
}): Promise<SyncResult> {
  const {
    config,
    dataRoot,
    repositoryRoot,
    profilePath,
    token,
    mode,
    packaged = false,
    checkpoint = () => undefined,
  } = options;
  const taskId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const note = async (name: string, data: Record<string, unknown> = {}) =>
    checkpoint(name, {
      task_id: taskId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  const database = new CreatorDatabase(path.join(dataRoot, "creator.db"));
  const bridge = new ScraplingWorkerBridge(
    repositoryRoot,
    (message) => void note("collector:diagnostic", { message }),
    packaged,
  );
  const unsubscribe = bridge.onEvent((event) => {
    if (event.event === "progress") void note("collector:progress", event.data);
    if (event.event === "export")
      void note(String(event.data.checkpoint || "export:event"), event.data);
  });
  try {
    database.startSyncTask(
      taskId,
      config.platform,
      config.accountId,
      startedAt,
    );
    const knownContentIds = database.knownContentIds();
    await note("collector:start", { mode, profile: profilePath });
    await note("snapshot:start");
    const snapshot = await new ScraplingCreatorCollector(
      bridge,
      profilePath,
      dataRoot,
      config.accountId,
    ).collect({ collectionMode: mode });
    await note("snapshot:complete", {
      works: snapshot.works.length,
      xhr: snapshot.collection_stats.raw_response_count,
    });
    await note("persistence:start", { works_input: snapshot.works.length });
    const local = database.save(snapshot);
    const worksFailed = local.works === "success" ? 0 : snapshot.works.length;
    await note("persistence:complete", {
      works_input: snapshot.works.length,
      works_failed: worksFailed,
      status: local.works,
    });
    await note("upload:start");
    const result = await upload(config, token, snapshot, {
      knownContentIds,
      taskId,
    });
    database.finishSyncTask(
      taskId,
      local.works === "success" ? result.status : "partial_success",
      result.success_count,
      result.failed_count + worksFailed,
      Object.values(local.errors).join("; "),
    );
    await note("upload:complete", {
      status: result.status,
      success_count: result.success_count,
      failed_count: result.failed_count,
    });
    await note("collector:complete");
    return {
      collectedAt: new Date().toISOString(),
      snapshot,
      local,
      upload: result,
    };
  } catch (error) {
    database.finishSyncTask(
      taskId,
      "failed",
      0,
      1,
      error instanceof Error ? error.message : String(error),
    );
    await note("collector:failed", {
      message:
        error instanceof Error
          ? error.message.slice(0, 300)
          : String(error).slice(0, 300),
    });
    throw error;
  } finally {
    unsubscribe();
    await bridge.shutdown().catch(() => undefined);
    database.close();
  }
}
