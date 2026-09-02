import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Dashboard from './Dashboard';
import type { DesktopState } from '../types';

const secretId='fixture-account-id-7391', secretName='Fixture Creator Nickname';
const state:DesktopState={connected:true,configured:true,syncing:false,account:{is_bound:true,platform_label:'抖音',account_audit_tag:'A1B2C3D4E5',scope_status:'confirmed'},settings:{serverUrl:'https://fixture.invalid',syncConfig:{enabled:false,interval:'manual',dailyHour:2},browserConfig:{id:'fixture-browser'}},logs:[],autoLaunch:false,portableMode:false,browserConnected:false,douyinLoggedIn:true,profileAuthentication:'authenticated',loginWindowState:'closed',capabilities:{profileAuthenticated:true,loginWindowState:'closed',browserReady:true,bindingReady:true,tokenReady:true,databaseReady:true,syncInProgress:false,canSync:true,loginAction:'relogin'},browserAvailable:true,currentBrowser:{id:'fixture-browser',displayName:'Fixture Browser',type:'custom',engine:'chromium',runtime:'system',compatibilityStatus:'compatible'},runtimeIdentity:{systemVersion:'2.20.9',agentVersion:'2.13.4-agent',buildId:'fixture-build',mainPid:1,packaged:true,databaseReady:true,databaseSchemaVersion:1,uploadQueue:true,workerRuntime:'packaged',apiTarget:'loopback'},browsers:[]};

test('dashboard DOM and accessible name contain only the short audit identity',()=>{
  const html=renderToStaticMarkup(<Dashboard state={state} onLogin={async()=>undefined} onLoginComplete={async()=>undefined} onSync={async()=>({} as never)} onInspectCoverMetadata={async()=>({} as never)}/>);
  for(const raw of [secretId,secretName,'accountId','platform_uid','creator_account_id']) assert.equal(html.includes(raw),false,raw);
  assert.match(html,/已绑定抖音账号/); assert.match(html,/审计标识 A1B2C3D4E5/); assert.match(html,/aria-label="检查最新封面来源，仅本地执行"/);
});

test('unconfirmed or mismatched scope fails closed for metadata-only UI',()=>{
  for(const scope_status of ['unconfirmed','mismatch'] as const){
    const html=renderToStaticMarkup(<Dashboard state={{...state,account:{...state.account,scope_status}}} onLogin={async()=>undefined} onLoginComplete={async()=>undefined} onSync={async()=>({} as never)} onInspectCoverMetadata={async()=>({} as never)}/>);
    assert.match(html,/aria-label="检查最新封面来源，仅本地执行" disabled=""/);
  }
});
