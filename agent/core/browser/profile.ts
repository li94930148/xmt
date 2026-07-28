import path from 'node:path';
import type { BrowserSelection } from './types.js';
export function managedProfile(root:string,selection:Pick<BrowserSelection,'type'|'profileName'>,accountId='default'){
  const safe=(value:string)=>value.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,80)||'default';
  return path.resolve(root,'profiles',selection.type,safe(accountId),safe(selection.profileName));
}
export function assertManagedProfile(profile:string,root:string){const resolved=path.resolve(profile),base=path.resolve(root);if(resolved===base||!resolved.startsWith(`${base}${path.sep}`))throw new Error('浏览器资料目录必须位于 Creator Agent 数据目录内');return resolved;}
