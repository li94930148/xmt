import crypto from "node:crypto";
import path from "node:path";
import type { CollectionMode, CreatorSnapshot, CreatorWork } from "../types.js";
import { ScraplingWorkerBridge } from "./workerBridge.js";

export class ScraplingCreatorCollector {
  constructor(
    private readonly bridge: ScraplingWorkerBridge,
    private readonly profilePath: string,
    private readonly outputRoot: string,
    private readonly accountId: string,
  ) {}
  async collect(
    options: { collectionMode?: CollectionMode } = {},
  ): Promise<CreatorSnapshot> {
    const result = await this.bridge.request(
      "collect",
      {
        platform: "douyin",
        accountId: this.accountId,
        scope: options.collectionMode || "full_snapshot",
        profilePath: this.profilePath,
        outputPath: path.join(
          this.outputRoot,
          "collector",
          "douyin",
          this.accountId,
        ),
      },
      180_000,
    );
    const data = result.data as {
      xhrResponses?: number;
      works?: Array<Record<string, unknown>>;
      pages?: number;
    };
    if (!data.xhrResponses)
      throw new Error("未捕获到抖音 XHR，已停止同步以避免用空结果覆盖数据。");
    const works: CreatorWork[] = (data.works || []).map((work) => ({
      aweme_id: String(work.item_id || ""),
      item_id: String(work.item_id || ""),
      title: String(work.title || ""),
      cover_url: String(work.cover_uri || ""),
      publish_time: String(work.published_at || ""),
      video_url: "",
      metrics: (work.metrics || {}) as CreatorWork["metrics"],
      ...work,
    }));
    return {
      schema_version: 1,
      protocol_version: 1,
      agent_version: "2.12.1-agent",
      platform: "douyin",
      source: "local_creator_center",
      contract_version: "2.10.2",
      snapshot_id: crypto.randomUUID(),
      collection_mode: options.collectionMode || "full_snapshot",
      collection_stats: {
        raw_response_count: Number(data.xhrResponses),
        aweme_candidate_count: works.length,
        normalized_success_count: works.length,
        rejected_count: 0,
        rejected_reasons: {},
        page_count: Number(data.pages || 0),
        new_count: works.length,
      },
      collected_at: new Date().toISOString(),
      account: {
        uid: this.accountId,
        nickname: "",
        avatar: "",
        fans_count: null,
      },
      works,
      work_details: [],
      dashboard: {},
      content_analysis: {},
      fans: {},
      raw: { api_map: [], captures: [] },
      videos: works,
      operations: {
        last7Days: {},
        last30Days: {},
        trafficSources: [],
        contentPerformance: {},
      },
    };
  }
}
