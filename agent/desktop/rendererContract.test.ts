import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { rendererAccountIdentity, sanitizeRendererState } from './rendererContract.js';
import type { AgentConfig } from '../core/types.js';

const raw:AgentConfig={accountId:'fixture-account-id-7391',accountName:'Fixture Creator Nickname',deviceId:'fixture-device-id-1001',agentId:17,serverUrl:'https://fixture.invalid',platform:'douyin',browserConfig:{id:'browser-fixture',type:'custom',engine:'chromium',runtime:'system',sessionMode:'persistent',profileName:'fixture',headless:false,launchArgs:[],autoFallback:false},syncConfig:{enabled:false,interval:'manual',dailyHour:2}};
const forbidden=[raw.accountId,raw.accountName,raw.deviceId,String(raw.agentId),'fixture-unknown-field'];

test('account identity exposes only a device-keyed short audit tag',()=>{
  const first=rendererAccountIdentity(raw,true), second=rendererAccountIdentity(raw,true);
  assert.deepEqual(first,second); assert.match(first.account_audit_tag,/^[A-F0-9]{10}$/); assert.equal(first.scope_status,'confirmed');
  assert.equal(JSON.stringify(first).includes(raw.accountId),false);
  assert.equal(JSON.stringify(first).includes(raw.deviceId),false);
});

test('preload state contract drops raw binding fields, unknown fields, logs and error context',()=>{
  const account=rendererAccountIdentity(raw,true);
  const output=sanitizeRendererState({connected:true,configured:true,syncing:false,lastError:raw.accountId,logs:[raw.accountName],account,settings:{serverUrl:raw.serverUrl,syncConfig:raw.syncConfig,browserConfig:{id:raw.browserConfig.id},accountId:raw.accountId},browserConnected:false,douyinLoggedIn:true,profileAuthentication:'authenticated',loginWindowState:'closed',capabilities:{profileAuthenticated:true,browserReady:true,bindingReady:true,tokenReady:true,databaseReady:true,syncInProgress:false,canSync:true,loginAction:'relogin'},browserAvailable:true,currentBrowser:{id:'browser-fixture',displayName:'Fixture Browser',type:'custom',engine:'chromium',runtime:'system',compatibilityStatus:'compatible'},runtimeIdentity:{systemVersion:'2.20.9',agentVersion:'2.13.4-agent',buildId:'fixture-build',mainPid:1,packaged:true,databaseReady:true,databaseSchemaVersion:1,uploadQueue:true,workerRuntime:'packaged',apiTarget:'loopback'},browsers:[],accountId:raw.accountId,platform_uid:raw.accountId,creator_account_id:raw.accountId,nickname:raw.accountName,device_binding_id:raw.deviceId,unknown:'fixture-unknown-field'});
  const serialized=JSON.stringify(output); for(const value of forbidden) assert.equal(serialized.includes(value),false,value);
  assert.deepEqual(output.logs,[]); assert.equal('settings' in output,true); assert.equal('config' in output,false); assert.equal('lastError' in output,false);
});

test('metadata-only bridge takes no renderer account parameter and renderer sources avoid client storage or raw error rendering',()=>{
  const root=process.cwd(), preload=readFileSync(path.join(root,'desktop/preload.ts'),'utf8');
  assert.match(preload,/inspectCoverMetadata:\(\)=>ipcRenderer\.invoke\('cover-metadata:inspect'\)/);
  for(const file of ['renderer/App.tsx','renderer/Dashboard.tsx','renderer/Settings.tsx','renderer/Login.tsx']){
    const source=readFileSync(path.join(root,'desktop',file),'utf8');
    assert.doesNotMatch(source,/localStorage|sessionStorage|console\.|cause\.message|accountName|accountId/);
  }
});
