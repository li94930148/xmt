import type { AgentConfig,SyncResult } from '../core/types.js';
export type DesktopState={connected:boolean;configured:boolean;syncing:boolean;lastSyncAt?:string;lastError?:string;config?:AgentConfig;logs:string[];autoLaunch:boolean;portableMode:boolean;browserConnected:boolean;douyinLoggedIn:boolean;browsers:Array<{id:string;displayName:string;type:string;engine:string;runtime:string;version?:string;compatibilityStatus:string}>};
export type SetupInput={serverUrl:string;bindingCode:string};
export type RebindInput={serverUrl:string;bindingCode:string};
export type SettingsInput={serverUrl:string;enabled:boolean;interval:'manual'|'12h'|'daily';dailyHour:number;autoLaunch:boolean;browserId:string;executablePath?:string};
export type DesktopApi={getState():Promise<DesktopState>;setup(input:SetupInput):Promise<DesktopState>;rebind(input:RebindInput):Promise<DesktopState>;openDouyinLogin():Promise<void>;completeDouyinLogin():Promise<DesktopState>;syncSample():Promise<SyncResult>;syncNow():Promise<SyncResult>;saveSettings(input:SettingsInput):Promise<DesktopState>;chooseBrowser():Promise<string|null>;restartBrowser():Promise<DesktopState>;clearBrowserProfile():Promise<{cleared:boolean;state:DesktopState}>;openLogs():Promise<void>;onState(listener:(state:DesktopState)=>void):()=>void};
declare global{interface Window{xmtAgent:DesktopApi}}
