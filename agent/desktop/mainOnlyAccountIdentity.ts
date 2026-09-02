import crypto from 'node:crypto';
import type { AgentConfig } from '../core/types.js';
import type { RendererAccountIdentity, RendererSettings } from './types.js';

/** Main-process-only identity projection. Never import this from preload or renderer code. */
const auditTag = (accountId:string, deviceId:string) => crypto
  .createHmac('sha256', deviceId)
  .update(`renderer-account-audit:v1:${accountId}`)
  .digest('hex')
  .slice(0, 10)
  .toUpperCase();

export function rendererAccountIdentity(config:AgentConfig|undefined, authenticated:boolean):RendererAccountIdentity {
  if (!config?.accountId || !config.deviceId) return {is_bound:false,platform_label:'抖音',account_audit_tag:'',scope_status:'unconfirmed'};
  return {is_bound:true,platform_label:'抖音',account_audit_tag:auditTag(config.accountId,config.deviceId),scope_status:authenticated?'confirmed':'unconfirmed'};
}

export function rendererSettings(config:AgentConfig|undefined):RendererSettings|undefined {
  if (!config) return undefined;
  return {serverUrl:config.serverUrl,syncConfig:{enabled:config.syncConfig.enabled,interval:config.syncConfig.interval,dailyHour:config.syncConfig.dailyHour},browserConfig:{id:config.browserConfig.id,executablePath:config.browserConfig.executablePath}};
}
