import type { SyncResult } from '../core/types.js';
import type { CoverMetadataSummary } from '../core/collector/coverMetadata.js';
import type { AgentCapabilities, LoginWindowState, ProfileAuthentication } from './loginState.js';
export type RuntimeIdentity={systemVersion:string;agentVersion:string;buildId:string;mainPid:number;packaged:boolean;databaseReady:boolean;databaseSchemaVersion:number;uploadQueue:boolean;workerRuntime:'packaged'|'development';apiTarget:'loopback'|'production'|'invalid'};
export type DesktopBrowser={id:string;displayName:string;type:string;engine:string;runtime:string;version?:string;compatibilityStatus:string};
export type RendererAccountIdentity={is_bound:boolean;platform_label:'抖音';account_audit_tag:string;scope_status:'confirmed'|'unconfirmed'|'mismatch'};
export type RendererSettings={serverUrl:string;syncConfig:{enabled:boolean;interval:'manual'|'12h'|'daily';dailyHour:number};browserConfig:{id:string;executablePath?:string}};
export type DesktopState={connected:boolean;configured:boolean;syncing:boolean;lastSyncAt?:string;account:RendererAccountIdentity;settings?:RendererSettings;logs:string[];autoLaunch:boolean;portableMode:boolean;browserConnected:boolean;douyinLoggedIn:boolean;profileAuthentication:ProfileAuthentication;loginWindowState:LoginWindowState;capabilities:AgentCapabilities;browserAvailable:boolean;currentBrowser?:DesktopBrowser;runtimeIdentity:RuntimeIdentity;browsers:DesktopBrowser[]};
export type SetupInput={serverUrl:string;bindingCode:string};
export type RebindInput={serverUrl:string;bindingCode:string};
export type SettingsInput={serverUrl:string;enabled:boolean;interval:'manual'|'12h'|'daily';dailyHour:number;autoLaunch:boolean;browserId:string;executablePath?:string};
export type DesktopApi={getState():Promise<DesktopState>;setup(input:SetupInput):Promise<DesktopState>;rebind(input:RebindInput):Promise<DesktopState>;openDouyinLogin():Promise<void>;completeDouyinLogin():Promise<DesktopState>;syncSample():Promise<SyncResult>;syncNow():Promise<SyncResult>;inspectCoverMetadata():Promise<CoverMetadataSummary>;saveSettings(input:SettingsInput):Promise<DesktopState>;chooseBrowser():Promise<string|null>;restartBrowser():Promise<DesktopState>;clearBrowserProfile():Promise<{cleared:boolean;state:DesktopState}>;onState(listener:(state:DesktopState)=>void):()=>void};
declare global{interface Window{xmtAgent:DesktopApi}}
