import type { BrowserEngine, BrowserRuntime, BrowserSelection, BrowserType } from "../browser/types.js";

/** The non-sensitive browser contract passed to the local Collector worker. */
export type CollectorBrowserLaunch = {
  id: string;
  type: BrowserType;
  engine: BrowserEngine;
  runtime: BrowserRuntime;
  executablePath?: string;
  cdpEndpoint?: string;
  headless: boolean;
};

export type CollectorBrowserEvidence = Pick<CollectorBrowserLaunch, "type" | "engine" | "runtime"> & {
  launchMode: "executable_path" | "external_cdp";
};

export class CollectorBrowserUnsupportedError extends Error {
  readonly code = "COLLECTOR_BROWSER_UNSUPPORTED" as const;
  constructor(readonly browser: Pick<CollectorBrowserLaunch, "type" | "engine" | "runtime">) {
    super(`COLLECTOR_BROWSER_UNSUPPORTED: Scrapling Creator Collector 仅支持 Chromium-compatible 浏览器（type=${browser.type}, engine=${browser.engine}, runtime=${browser.runtime}）。`);
    this.name = "CollectorBrowserUnsupportedError";
  }
}

export function collectorBrowserLaunch(selection: BrowserSelection): CollectorBrowserLaunch {
  const launch: CollectorBrowserLaunch = {
    id: selection.id, type: selection.type, engine: selection.engine, runtime: selection.runtime,
    executablePath: selection.executablePath, cdpEndpoint: selection.cdpEndpoint, headless: selection.headless,
  };
  if (launch.engine !== "chromium") throw new CollectorBrowserUnsupportedError(launch);
  if (launch.runtime === "external-cdp") {
    if (!launch.cdpEndpoint) throw new Error("COLLECTOR_BROWSER_LAUNCH_FAILED: external-cdp 缺少 CDP endpoint。");
    return launch;
  }
  if (!launch.executablePath) throw new Error("COLLECTOR_BROWSER_LAUNCH_FAILED: Chromium 浏览器缺少已解析的 executablePath。");
  return launch;
}

export function collectorBrowserEvidence(launch: CollectorBrowserLaunch): CollectorBrowserEvidence {
  return { type: launch.type, engine: launch.engine, runtime: launch.runtime, launchMode: launch.runtime === "external-cdp" ? "external_cdp" : "executable_path" };
}
