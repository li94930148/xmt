const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root=path.resolve(__dirname,'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version.replace(/-agent$/,'');
const archive=path.join(process.env.XMT_AGENT_RELEASE_DIRECTORY?path.resolve(process.env.XMT_AGENT_RELEASE_DIRECTORY):path.join(root,'release'),`XMT-Creator-Agent-v${version}-macos-arm64.zip`);
const appName='XMT Creator Agent.app';
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const assert=(value,message)=>{if(!value)throw new Error(message);};
const run=(command,args)=>{const result=spawnSync(command,args,{encoding:'utf8',stdio:'pipe',shell:false});if(result.status!==0)throw new Error(`${command} failed: ${result.stderr||result.stdout}`);return result.stdout;};
async function waitFor(file) { const until=Date.now()+20_000; while(Date.now()<until){if(fs.existsSync(file)){try{const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.renderer)return data;}catch{} } await sleep(150);} throw new Error('PACKAGED_PRELOAD_RENDERER_PROBE_TIMEOUT'); }
async function stop(child) { if(child.exitCode!==null)return; const exited=new Promise((resolve)=>child.once('exit',resolve));child.kill('SIGTERM');await Promise.race([exited,sleep(3_000)]);if(child.exitCode===null)child.kill('SIGKILL'); }
async function main(){
  if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('MACOS_ARM64_HOST_REQUIRED');
  assert(fs.existsSync(archive),`Missing macOS archive: ${archive}`);
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'xmt-preload-sandbox-smoke-'));
  try {
    run('/usr/bin/ditto',['-x','-k',archive,temporary]);
    const app=path.join(temporary,appName); const executable=path.join(app,'Contents','MacOS','XMT-Creator-Agent'); const probe=path.join(temporary,'probe.json'); const data=path.join(temporary,'user-data');
    run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
    const child=spawn(executable,[],{cwd:path.dirname(executable),env:{...process.env,PATH:'/usr/bin:/bin',HOME:temporary,NODE_ENV:'test',XMT_AGENT_TEST_DATA_ROOT:data,XMT_AGENT_RUNTIME_PROBE_FILE:probe,XMT_AGENT_PRELOAD_SMOKE:'1',XMT_AGENT_PRELOAD_SMOKE_BOOTSTRAP:JSON.stringify({serverUrl:'http://127.0.0.1:9'}),ELECTRON_RENDERER_URL:''},stdio:['ignore','pipe','pipe']});
    let diagnostics='';child.stdout.on('data',(part)=>diagnostics+=String(part));child.stderr.on('data',(part)=>diagnostics+=String(part));
    try { const runtime=await waitFor(probe); assert(runtime.renderer?.preloadApi===true,'PACKAGED_PRELOAD_API_MISSING');assert(runtime.renderer?.surface==='content','PACKAGED_RENDERER_BLANK_OR_SAFE_ERROR');assert(runtime.rendererUrl===null,'PACKAGED_RENDERER_USES_DEV_SERVER');assert(runtime.runtimeIdentity?.packaged===true,'PACKAGED_FLAG_NOT_TRUE');assert(runtime.runtimeIdentity?.apiTarget==='loopback','PRELOAD_SMOKE_NOT_LOOPBACK');assert(!/node:crypto|contextBridge.*missing|module not found/i.test(diagnostics),'PACKAGED_PRELOAD_RUNTIME_ERROR'); }
    finally { await stop(child); }
    const { DatabaseSync }=require('node:sqlite');const db=new DatabaseSync(path.join(data,'creator.db'));const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('upload_queue','sync_tasks','batches','snapshots')").all();for(const {name} of tables){const count=db.prepare(`SELECT count(*) AS count FROM ${name}`).get().count;assert(count===0,`PRELOAD_SMOKE_SIDE_EFFECT_${name}`);}db.close();
    console.log('macOS arm64 packaged preload sandbox smoke passed: isolated userData, sandbox/contextIsolation/nodeIntegration defaults, preload bridge available, renderer nonblank, loopback fixture only, no queue/batch/snapshot rows');
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
}
main().catch((error)=>{console.error(error.stack||error.message);process.exitCode=1;});
