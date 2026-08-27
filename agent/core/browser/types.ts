import type { BrowserContext, Page } from 'playwright';

export type BrowserType = 'chrome'|'chromium'|'edge'|'brave'|'arc'|'firefox'|'webkit'|'custom';
export type BrowserEngine = 'chromium'|'firefox'|'webkit';
export type BrowserRuntime = 'system'|'playwright'|'external-cdp';
export type BrowserSessionMode = 'persistent'|'temporary'|'connect-cdp';
export type BrowserCompatibility = 'compatible'|'partially_compatible'|'incompatible'|'not_tested';
export type LoginState = 'logged_in'|'login_required'|'unknown';
export type LoginStateResult = { status:LoginState; evidence:string[]; finalHost?:string; finalPath?:string; source:'browser' };
export type BrowserCapabilities = {
  supportsPersistentContext:boolean; supportsCdp:boolean; supportsNetworkResponseInspection:boolean;
  supportsRequestInterception:boolean; supportsDownloads:boolean; supportsMultiPage:boolean;
  supportsExistingSessionConnection:boolean; supportsManagedProfile:boolean; supportsHeadless:boolean;
  supportsCreatorCenter:boolean;
};
export type BrowserInfo = {
  id:string; displayName:string; browserType:BrowserType; engine:BrowserEngine; runtime:BrowserRuntime;
  executablePath?:string; version?:string; source:string; capabilities:BrowserCapabilities;
  compatibilityStatus:BrowserCompatibility; compatibilityReason:string;
};
export type BrowserSelection = {
  id:string; type:BrowserType; engine:BrowserEngine; runtime:BrowserRuntime; executablePath?:string;
  sessionMode:BrowserSessionMode; profileName:string; headless:boolean; cdpEndpoint?:string;
  launchArgs:string[]; autoFallback:boolean;
};
export interface BrowserSession {
  start():Promise<void>; stop():Promise<void>; restart():Promise<void>; isConnected():boolean;
  getContext():BrowserContext; getActivePage():Promise<Page>; openPage(url:string):Promise<Page>;
  listPages():Page[]; ensurePage(url:string):Promise<Page>; getCapabilities():BrowserCapabilities;
  getBrowserInfo():BrowserInfo; checkLoginState():Promise<LoginStateResult>;
  withPage<T>(run:(page:Page)=>Promise<T>):Promise<T>;
}
