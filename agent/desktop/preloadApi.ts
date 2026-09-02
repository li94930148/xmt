import type { DesktopApi, DesktopState, SetupInput } from './types.js';
import type { SyncResult } from '../core/types.js';
import type { CoverMetadataSummary } from '../core/collector/coverMetadata.js';
import { sanitizeRendererState } from './browserSafeRendererContract.js';

export type SafeIpcRenderer = {
  invoke(channel:string, ...arguments_:unknown[]):Promise<unknown>;
  on(channel:string, listener:(event:unknown, state:unknown)=>void):void;
  removeListener(channel:string, listener:(event:unknown, state:unknown)=>void):void;
};

const safeState=(value:unknown)=>sanitizeRendererState(value);

/** Browser-safe preload API factory. It never receives raw Main identity state. */
export function createDesktopApi(ipcRenderer:SafeIpcRenderer):DesktopApi {
  return {getState:async()=>safeState(await ipcRenderer.invoke('agent:get-state')),setup:async(input:SetupInput)=>safeState(await ipcRenderer.invoke('agent:setup',input)),rebind:async input=>safeState(await ipcRenderer.invoke('agent:rebind',input)),openDouyinLogin:()=>ipcRenderer.invoke('agent:login-open').then(()=>undefined),completeDouyinLogin:async()=>safeState(await ipcRenderer.invoke('agent:login-complete')),syncSample:()=>ipcRenderer.invoke('agent:sync-sample') as Promise<SyncResult>,syncNow:()=>ipcRenderer.invoke('agent:sync') as Promise<SyncResult>,inspectCoverMetadata:()=>ipcRenderer.invoke('cover-metadata:inspect') as Promise<CoverMetadataSummary>,saveSettings:async input=>safeState(await ipcRenderer.invoke('agent:settings',input)),chooseBrowser:async()=>{const value=await ipcRenderer.invoke('agent:choose-browser');return typeof value==='string'?value:null;},restartBrowser:async()=>safeState(await ipcRenderer.invoke('agent:browser-restart')),clearBrowserProfile:async()=>{const result=await ipcRenderer.invoke('agent:browser-profile-clear') as {cleared?:unknown;state?:unknown};return {cleared:result?.cleared===true,state:safeState(result?.state)};},onState(listener){const handler=(_event:unknown,state:unknown)=>listener(safeState(state));ipcRenderer.on('agent:state',handler);return()=>ipcRenderer.removeListener('agent:state',handler);}};
}
