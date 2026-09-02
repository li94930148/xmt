import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesktopApi, type SafeIpcRenderer } from './preloadApi.js';

const rawState={configured:true,connected:true,syncing:false,account:{is_bound:true,platform_label:'抖音',account_audit_tag:'A1B2C3D4E5',scope_status:'confirmed',accountId:'raw-account-id'},capabilities:{profileAuthenticated:true,loginWindowState:'closed',browserReady:true,bindingReady:true,tokenReady:true,databaseReady:true,syncInProgress:false,canSync:true,loginAction:'relogin'},runtimeIdentity:{systemVersion:'2.20.10',agentVersion:'2.13.5-agent',buildId:'fixture',mainPid:1,packaged:true,databaseReady:true,databaseSchemaVersion:1,uploadQueue:true,workerRuntime:'packaged',apiTarget:'loopback'},malicious:'token=secret'};

test('browser-safe preload API initializes with a sandbox-compatible IPC shape and reprojects hostile state',async()=>{
  let listener:((event:unknown,state:unknown)=>void)|undefined;
  const channels:string[]=[];
  const ipc:SafeIpcRenderer={invoke:async(channel)=>{channels.push(channel);return rawState;},on:(_channel, callback)=>{listener=callback;},removeListener:()=>{listener=undefined;}};
  const api=createDesktopApi(ipc);
  const state=await api.getState();
  assert.equal(state.account.account_audit_tag,'A1B2C3D4E5');
  assert.equal(JSON.stringify(state).includes('raw-account-id'),false);
  assert.equal(JSON.stringify(state).includes('secret'),false);
  let emitted=''; const dispose=api.onState((next)=>{emitted=JSON.stringify(next);}); listener?.({},rawState); dispose();
  assert.equal(emitted.includes('raw-account-id'),false);
  assert.deepEqual(channels,['agent:get-state']);
});
