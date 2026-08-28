import crypto from "node:crypto";
import path from "node:path";
import { CreatorDatabase } from "../database/creatorDatabase.js";
import { upload } from "../uploader/client.js";
import { toOfficialExportPayload } from '../uploader/officialPayload.js';
import { canonicalJson, canonicalJsonHash } from '../database/sqliteValues.js';
import type { AgentConfig, CollectionMode, SyncResult } from "../types.js";
import { ScraplingCreatorCollector } from "./scrapling.js";
import { ScraplingWorkerBridge } from "./workerBridge.js";
import { collectorBrowserEvidence, collectorBrowserLaunch } from "./browserLaunch.js";

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
  flushOfficialQueue?: () => Promise<void>;
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
    flushOfficialQueue,
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
    database.recoverUploading();
    const knownContentIds = database.knownContentIds();
    const browser = collectorBrowserLaunch(config.browserConfig);
    await note("collector:start", { mode, browser: collectorBrowserEvidence(browser) });
    await note("snapshot:start");
    const snapshot = await new ScraplingCreatorCollector(
      bridge,
      profilePath,
      dataRoot,
      config.accountId,
      browser,
    ).collect({ collectionMode: mode, taskId });
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
    const officialPayload = snapshot.official_data?.length ? toOfficialExportPayload(snapshot, config.accountId, taskId) : null;
    const canonicalPayloadJson = officialPayload ? canonicalJson('canonical_payload_json', officialPayload) : null;
    const queueJob = officialPayload && canonicalPayloadJson ? database.enqueueUpload({ batch_id: officialPayload.batch_id, platform: config.platform, platform_account_id: config.accountId, source_file_sha256: String(officialPayload.source_files[0]?.sha256 || ''), parser_version: officialPayload.parser_version, payload_json: canonicalPayloadJson, payload_sha256: canonicalJsonHash(canonicalPayloadJson) }) : null;
    let result;
    if (queueJob && officialPayload) {
      // The desktop-owned scheduler is the only official-export sender.  It
      // rebuilds the encrypted transport envelope for every attempt from this
      // persisted canonical payload.
      if (!flushOfficialQueue) throw new Error('官方导出已入队，等待 Electron 队列调度器发送');
      await flushOfficialQueue();
      const completed = database.uploadJob(queueJob.job_id); if (completed?.status !== 'succeeded') throw new Error(completed?.last_error_message_sanitized || '官方导出已入队，等待重试');
      result = { success: true, status: 'success' as const, success_count: 1, failed_count: 0, modules: {}, errors: {} } as Awaited<ReturnType<typeof upload>>;
    } else try { result = await upload(config, token, snapshot, {
      knownContentIds,
      taskId,
    }); if (queueJob) database.finishUpload(queueJob.job_id, result); }
    catch (error) { if (queueJob) database.failUpload(queueJob.job_id, 'retryable_failed', 'NETWORK_OR_UPLOAD_FAILED', error instanceof Error ? error.message : String(error), new Date(Date.now() + 30_000).toISOString()); throw error; }
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
      taskId,
      collectedAt: new Date().toISOString(),
      snapshot,
      exportReceipts: snapshot.export_receipts || [],
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
