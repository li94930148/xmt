import type { BrowserCapabilities, BrowserEngine, BrowserRuntime } from './types.js';
export function capabilities(engine:BrowserEngine,runtime:BrowserRuntime):BrowserCapabilities{
  const chromium=engine==='chromium';
  return{supportsPersistentContext:runtime!=='external-cdp',supportsCdp:chromium,supportsNetworkResponseInspection:true,supportsRequestInterception:true,supportsDownloads:true,supportsMultiPage:true,supportsExistingSessionConnection:runtime==='external-cdp',supportsManagedProfile:runtime!=='external-cdp',supportsHeadless:runtime!=='external-cdp',supportsCreatorCenter:chromium};
}
