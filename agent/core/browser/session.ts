import fs from 'node:fs';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const CREATOR_URL='https://creator.douyin.com/';
export function findSystemChrome(preferredPath?:string){
  if(preferredPath&&fs.existsSync(preferredPath)&&path.basename(preferredPath).toLowerCase()==='chrome.exe')return preferredPath;
  const candidates=[process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google','Chrome','Application','chrome.exe'),process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Google','Chrome','Application','chrome.exe'),process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe')].filter((value):value is string=>Boolean(value));
  const executable=candidates.find(candidate=>fs.existsSync(candidate));if(!executable)throw new Error('Chrome启动失败，请检查Chrome安装。');return executable;
}
export function stopSystemChrome(){const result=spawnSync('taskkill.exe',['/F','/IM','chrome.exe'],{windowsHide:true,stdio:'ignore'});if(result.error)throw new Error(`无法关闭现有 Chrome：${result.error.message}`);}
export async function launchSystemChrome(profileDir:string,port=9222,preferredPath?:string){
  const executable=findSystemChrome(preferredPath);fs.mkdirSync(profileDir,{recursive:true});stopSystemChrome();
  const child=spawn(executable,[`--remote-debugging-port=${port}`,`--user-data-dir=${profileDir}`,'--no-first-run','--no-default-browser-check',CREATOR_URL],{detached:true,stdio:'ignore',windowsHide:false});child.unref();
  const endpoint=`http://127.0.0.1:${port}`;const deadline=Date.now()+30_000;
  while(Date.now()<deadline){try{const response=await fetch(`${endpoint}/json/version`,{signal:AbortSignal.timeout(1_500)});if(response.ok)return endpoint;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  throw new Error('Chrome启动失败，请检查Chrome安装。');
}
export async function isDouyinCreatorLoggedIn(page:import('playwright').Page){
  await page.waitForLoadState('domcontentloaded').catch(()=>{});const url=page.url();const body=await page.locator('body').innerText({timeout:10_000}).catch(()=>'');
  const loginPrompt=/扫码登录|手机号登录|验证码登录|登录抖音/.test(body);const creatorShell=/作品管理|数据中心|发布作品|创作中心|创作服务/.test(body);
  return url.includes('creator.douyin.com')&&!url.includes('/login')&&!loginPrompt&&creatorShell;
}
