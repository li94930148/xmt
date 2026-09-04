import crypto from 'node:crypto';
import type { AgentConfig } from '../types.js';
import type { CollectorRuntime } from './workerBridge.js';

export type CoverProbeSummary = {
  valid_images:number; forbidden:number; not_found:number; non_image:number; timeout:number;
  invalid_url:number; signed:number; expiring:number; expired_at_collection:number;
};
export type CoverSourceClassification = Record<'DIRECT_PUBLIC'|'HEAD_UNSUPPORTED_GET_VALID'|'REFERER_BOUND'|'SESSION_BOUND'|'SIGNED_VALID'|'SIGNED_EXPIRING'|'SIGNED_EXPIRED'|'REMOTE_FORBIDDEN'|'INVALID_CONTENT'|'UNSAFE_REDIRECT'|'UNSAFE_NETWORK_TARGET'|'UNKNOWN',number>;
export type CoverDiagnosticSummary = {host_hash_groups:number;query_candidates:number;signature_candidates:number;expiry_candidates:number;head_results:Record<string,number>;range_results:Record<string,number>;referer_results:Record<string,number>};
export type CoverMetadataSummary = {
  account_scope_hash:string; collected_at:string; works_seen:number; works_with_candidates:number;
  works_without_candidates:number; candidates_seen:number; probe_summary:CoverProbeSummary;
  ttl_summary?:{minimum_seconds:number;median_seconds:number;maximum_seconds:number}; source_classification:CoverSourceClassification; diagnostic_summary:CoverDiagnosticSummary;
  execution_status:'completed'|'failed'; termination_reason:'completed'|'source_not_found'|'login_required'|'worker_failed'; diagnostics:CoverMetadataDiagnostic[];
};
export type CoverMetadataDiagnostic = { stage:'bridge_health'|'browser_session'|'login_state'|'entry_page'|'page_ready'|'source_discovery'|'page_iteration'|'raw_items_seen'|'scope_items_matched'|'scope_items_rejected'|'items_parsed'|'items_deduplicated'|'items_with_candidates'|'image_validation'|'termination'; status:'ok'|'failed'|'empty'|'skipped'; count:number; code?:CoverMetadataErrorCode; termination_reason?:'completed'|'source_not_found'|'login_required'|'worker_failed'; duration_bucket:'lt_10s'|'lt_1m'|'lt_3m'|'unknown'; boolean:boolean };
export type CoverMetadataErrorCode = 'BRIDGE_UNAVAILABLE'|'BROWSER_SESSION_UNAVAILABLE'|'LOGIN_REQUIRED'|'ACCOUNT_SCOPE_UNCONFIRMED'|'ACCOUNT_SCOPE_MISMATCH'|'ENTRY_PAGE_UNAVAILABLE'|'PAGE_NOT_READY'|'COVER_METADATA_SOURCE_NOT_FOUND'|'SOURCE_SCHEMA_CHANGED'|'PAGE_PARSE_FAILED'|'PAGINATION_FAILED'|'NO_ITEMS_IN_VISIBLE_SCOPE'|'ALL_ITEMS_REJECTED'|'AGGREGATION_CONTRACT_FAILED';
export type CoverMetadataBridge = {
  runtime:()=>CollectorRuntime;
  request:(method:string, params:Record<string,unknown>, timeout?:number)=>Promise<{data:Record<string,unknown>}>;
  shutdown:()=>Promise<void>;
};

const keys = ['account_scope_hash','collected_at','works_seen','works_with_candidates','works_without_candidates','candidates_seen','probe_summary','ttl_summary','source_classification','diagnostic_summary','execution_status','termination_reason','diagnostics'] as const;
const probeKeys = ['valid_images','forbidden','not_found','non_image','timeout','invalid_url','signed','expiring','expired_at_collection'] as const;
const number = (value:unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
const scopeHash = (accountId:string) => crypto.createHash('sha256').update(accountId).digest('hex');
const stageNames = ['bridge_health','browser_session','login_state','entry_page','page_ready','source_discovery','page_iteration','raw_items_seen','scope_items_matched','scope_items_rejected','items_parsed','items_deduplicated','items_with_candidates','image_validation','termination'] as const;
const diagnosticStatuses = ['ok','failed','empty','skipped'] as const;
const errorCodes = ['BRIDGE_UNAVAILABLE','BROWSER_SESSION_UNAVAILABLE','LOGIN_REQUIRED','ACCOUNT_SCOPE_UNCONFIRMED','ACCOUNT_SCOPE_MISMATCH','ENTRY_PAGE_UNAVAILABLE','PAGE_NOT_READY','COVER_METADATA_SOURCE_NOT_FOUND','SOURCE_SCHEMA_CHANGED','PAGE_PARSE_FAILED','PAGINATION_FAILED','NO_ITEMS_IN_VISIBLE_SCOPE','ALL_ITEMS_REJECTED','AGGREGATION_CONTRACT_FAILED'] as const;
const terminations = ['completed','source_not_found','login_required','worker_failed'] as const;
const sourceClasses = ['DIRECT_PUBLIC','HEAD_UNSUPPORTED_GET_VALID','REFERER_BOUND','SESSION_BOUND','SIGNED_VALID','SIGNED_EXPIRING','SIGNED_EXPIRED','REMOTE_FORBIDDEN','INVALID_CONTENT','UNSAFE_REDIRECT','UNSAFE_NETWORK_TARGET','UNKNOWN'] as const;
const probeOutcomes=['head_ok','forbidden','valid','invalid_content','unsafe_redirect','unsafe_network_target','not_found','timeout','unknown','skipped'] as const;
const headResultKeys=probeOutcomes.map(value=>`head_${value}`);
const rangeResultKeys=probeOutcomes.map(value=>`get_${value}`);
const refererResultKeys=probeOutcomes.map(value=>`referer_${value}`);
const objectNumbers=(value:unknown,keys:readonly string[])=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value as Record<string,unknown>).some(key=>!keys.includes(key)))throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');return Object.fromEntries(keys.map(key=>[key,number((value as Record<string,unknown>)[key])]))};

/** Rejects anything except the explicitly documented, aggregate-only result shape. */
export function parseCoverMetadataSummary(value:Record<string,unknown>, expectedAccountId:string):CoverMetadataSummary {
  if (Object.keys(value).some(key => !keys.includes(key as typeof keys[number]))) throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');
  const hash = typeof value.account_scope_hash === 'string' ? value.account_scope_hash : '';
  if (!/^[a-f0-9]{64}$/.test(hash) || hash !== scopeHash(expectedAccountId)) throw new Error('COVER_METADATA_ACCOUNT_SCOPE_MISMATCH');
  const source = value.probe_summary && typeof value.probe_summary === 'object' ? value.probe_summary as Record<string,unknown> : {};
  if (Object.keys(source).some(key => !probeKeys.includes(key as typeof probeKeys[number]))) throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');
  const ttl = value.ttl_summary && typeof value.ttl_summary === 'object' ? value.ttl_summary as Record<string,unknown> : undefined;
  const source_classification=objectNumbers(value.source_classification,sourceClasses) as CoverSourceClassification;
  const rawDiagnostic=value.diagnostic_summary;
  if(!rawDiagnostic||typeof rawDiagnostic!=='object'||Array.isArray(rawDiagnostic)||Object.keys(rawDiagnostic as Record<string,unknown>).some(key=>!['host_hash_groups','query_candidates','signature_candidates','expiry_candidates','head_results','range_results','referer_results'].includes(key)))throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');
  const diagnostic_summary={host_hash_groups:number((rawDiagnostic as Record<string,unknown>).host_hash_groups),query_candidates:number((rawDiagnostic as Record<string,unknown>).query_candidates),signature_candidates:number((rawDiagnostic as Record<string,unknown>).signature_candidates),expiry_candidates:number((rawDiagnostic as Record<string,unknown>).expiry_candidates),head_results:objectNumbers((rawDiagnostic as Record<string,unknown>).head_results,headResultKeys),range_results:objectNumbers((rawDiagnostic as Record<string,unknown>).range_results,rangeResultKeys),referer_results:objectNumbers((rawDiagnostic as Record<string,unknown>).referer_results,refererResultKeys)};
  const ttlSummary = ttl && ['minimum_seconds','median_seconds','maximum_seconds'].every(key => Number.isFinite(Number(ttl[key])) && Number(ttl[key]) >= 0)
    ? { minimum_seconds:Number(ttl.minimum_seconds), median_seconds:Number(ttl.median_seconds), maximum_seconds:Number(ttl.maximum_seconds) } : undefined;
  const execution_status = value.execution_status === 'completed' || value.execution_status === 'failed' ? value.execution_status : null;
  const termination_reason = typeof value.termination_reason === 'string' && terminations.includes(value.termination_reason as typeof terminations[number]) ? value.termination_reason as CoverMetadataSummary['termination_reason'] : null;
  const rawDiagnostics = Array.isArray(value.diagnostics) ? value.diagnostics : null;
  if (!execution_status || !termination_reason || !rawDiagnostics || rawDiagnostics.length > stageNames.length) throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');
  const seenStages = new Set<string>();
  const diagnostics = rawDiagnostics.map(item => {
    if (!item || typeof item !== 'object') throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');
    const row = item as Record<string,unknown>; const allowed=['stage','status','count','code','termination_reason','duration_bucket','boolean'];
    if (Object.keys(row).some(key => !allowed.includes(key)) || typeof row.stage !== 'string' || !stageNames.includes(row.stage as typeof stageNames[number]) || seenStages.has(row.stage) || typeof row.status !== 'string' || !diagnosticStatuses.includes(row.status as typeof diagnosticStatuses[number]) || !Number.isSafeInteger(row.count) || Number(row.count) < 0 || typeof row.duration_bucket !== 'string' || !['lt_10s','lt_1m','lt_3m','unknown'].includes(row.duration_bucket) || typeof row.boolean !== 'boolean') throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');
    seenStages.add(row.stage);
    if (row.code !== undefined && (typeof row.code !== 'string' || !errorCodes.includes(row.code as typeof errorCodes[number]))) throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');
    if (row.termination_reason !== undefined && (typeof row.termination_reason !== 'string' || !terminations.includes(row.termination_reason as typeof terminations[number]))) throw new Error('COVER_METADATA_UNSAFE_WORKER_RESPONSE');
    return {stage:row.stage as CoverMetadataDiagnostic['stage'],status:row.status as CoverMetadataDiagnostic['status'],count:Number(row.count),...(row.code ? {code:row.code as CoverMetadataErrorCode}:{}),...(row.termination_reason ? {termination_reason:row.termination_reason as CoverMetadataDiagnostic['termination_reason']}:{}),duration_bucket:row.duration_bucket as CoverMetadataDiagnostic['duration_bucket'],boolean:row.boolean};
  });
  return { account_scope_hash:hash, collected_at:typeof value.collected_at === 'string' ? value.collected_at : '', works_seen:number(value.works_seen), works_with_candidates:number(value.works_with_candidates), works_without_candidates:number(value.works_without_candidates), candidates_seen:number(value.candidates_seen), probe_summary:Object.fromEntries(probeKeys.map(key => [key,number(source[key])])) as CoverProbeSummary, source_classification, diagnostic_summary, execution_status, termination_reason, diagnostics, ...(ttlSummary ? {ttl_summary:ttlSummary} : {}) };
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
    const parsed = parseCoverMetadataSummary(result.data, input.config.accountId);
    // Bridge health is established in Main and deliberately never delegated to
    // the Python process.  Keep it in the same aggregate-only projection.
    return parsed.diagnostics.some(item => item.stage === 'bridge_health') ? parsed : {
      ...parsed,
      diagnostics: [{stage:'bridge_health',status:'ok',count:1,duration_bucket:'lt_10s',boolean:true}, ...parsed.diagnostics],
    };
  } finally {
    await input.bridge.shutdown().catch(() => undefined);
  }
}
