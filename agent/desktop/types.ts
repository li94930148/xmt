import type { AgentConfig,SyncResult } from '../core/types.js';
export type DesktopState={connected:boolean;configured:boolean;syncing:boolean;lastSyncAt?:string;lastError?:string;config?:AgentConfig;logs:string[];autoLaunch:boolean;portableMode:boolean};
export type SetupInput={serverUrl:string;username:string;password:string;accountId:string};
export type SettingsInput={serverUrl:string;enabled:boolean;interval:'manual'|'12h'|'daily';dailyHour:number;autoLaunch:boolean;browserMode:'system_chrome'|'embedded_chromium'};
export type DesktopApi={getState():Promise<DesktopState>;setup(input:SetupInput):Promise<DesktopState>;openDouyinLogin():Promise<void>;completeDouyinLogin():Promise<DesktopState>;syncNow():Promise<SyncResult>;saveSettings(input:SettingsInput):Promise<DesktopState>;openLogs():Promise<void>;onState(listener:(state:DesktopState)=>void):()=>void};
declare global{interface Window{xmtAgent:DesktopApi}}
