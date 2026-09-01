import crypto from 'node:crypto';
import type { AgentConfig } from '../types.js';
import type { CollectorRuntime } from './workerBridge.js';

export type CoverProbeSummary = {
  valid_images:number; forbidden:number; not_found:number; non_image:number; timeout:number;
  invalid_url:number; signed:number; expiring:number; expired_at_collection:number;
};
export type CoverMetadataSummary = {
  account_scope_hash:string; collected_at:string; works_seen:number; works_with_candidates:number;
  works_without_candidates:number; candidates_seen:number; probe_summary:CoverProbeSummary;
  ttl_summary?:{minimum_seconds:number;median_seconds:number;maximum_seconds:number};
};
export type CoverMetadataBridge = {
  runtime:()=>CollectorRuntime;
  request:(method:string, params:Record<string,unknown>, timeout?:number)=>Promise<{data:Record<string,unknown>}>;
  shutdown:()=>Promise<void>;
};

const keys = ['account_scope_hash','collected_at','works_seen','works_with_candidates','works_without_candidates','candidates_seen','probe_summary','ttl_summary'] as const;
const probeKeys = ['valid_images','forbidden','not_found','non_image','timeout','invalid_url','signed','expiring','expired_at_collection'] as const;
const number = (value:unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
const scopeHash = (accountId:string) => crypto.createHash('sha256').update(accountId).digest('hex');

/** Rejects anything except the explicitly documented, aggregate-only result shape. */
export function parseCoverMetadataSummary(value:Record<string,unknown>, expectedAccountId:string):CoverMetadataSummary {
  if (Object.keys(value).some(key => !keys.includes(key as typeof keys[number]))) throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');
  const hash = typeof value.account_scope_hash === 'string' ? value.account_scope_hash : '';
  if (!/^[a-f0-9]{64}$/.test(hash) || hash !== scopeHash(expectedAccountId)) throw new Error('COVER_METADATA_ACCOUNT_SCOPE_MISMATCH');
  const source = value.probe_summary && typeof value.probe_summary === 'object' ? value.probe_summary as Record<string,unknown> : {};
  if (Object.keys(source).some(key => !probeKeys.includes(key as typeof probeKeys[number]))) throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');
  const ttl = value.ttl_summary && typeof value.ttl_summary === 'object' ? value.ttl_summary as Record<string,unknown> : undefined;
  const ttlSummary = ttl && ['minimum_seconds','median_seconds','maximum_seconds'].every(key => Number.isFinite(Number(ttl[key])) && Number(ttl[key]) >= 0)
    ? { minimum_seconds:Number(ttl.minimum_seconds), median_seconds:Number(ttl.median_seconds), maximum_seconds:Number(ttl.maximum_seconds) } : undefined;
  return { account_scope_hash:hash, collected_at:typeof value.collected_at === 'string' ? value.collected_at : new Date().toISOString(), works_seen:number(value.works_seen), works_with_candidates:number(value.works_with_candidates), works_without_candidates:number(value.works_without_candidates), candidates_seen:number(value.candidates_seen), probe_summary:Object.fromEntries(probeKeys.map(key => [key,number(source[key])])) as CoverProbeSummary, ...(ttlSummary ? {ttl_summary:ttlSummary} : {}) };
}

/**
 * A deliberately separate call graph: no CreatorDatabase, snapshot, exporter,
 * queue, scheduler, batch builder, or uploader is imported or reachable here.
 */
export async function inspectCoverMetadata(input:{config:AgentConfig;profilePath:string;browser:Record<string,unknown>;bridge:CoverMetadataBridge}):Promise<CoverMetadataSummary> {
  if (input.config.platform !== 'douyin' || !input.config.accountId) throw new Error('COVER_METADATA_BINDING_NOT_READY');
  if (!input.profilePath) throw new Error('COVER_METADATA_PROFILE_NOT_READY');
  if (!input.bridge.runtime().available) throw new Error('COVER_METADATA_BRIDGE_NOT_READY');
  try {
    // Account identity remains in Main. The worker receives only an opaque
    // scope hash, so no account identifier can cross Bridge/IPC.
    const result = await input.bridge.request('cover_metadata_only', { platform:'douyin', accountScopeHash:scopeHash(input.config.accountId), profilePath:input.profilePath, browser:input.browser }, 180_000);
    return parseCoverMetadataSummary(result.data, input.config.accountId);
  } finally {
    await input.bridge.shutdown().catch(() => undefined);
  }
}
