export type IngestionFailureType = 'credential_expired' | 'download_failed' | 'parse_failed' | 'network_failed' | 'unknown';

export function classifyIngestionFailure(error: unknown): IngestionFailureType {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/登录凭据已失效|登录状态失效|重新扫码登录|credential.*expired/i.test(message)) return 'credential_expired';
  if (/导出|下载|download|export/i.test(message)) return 'download_failed';
  if (/解析|结构|parse|selector|locator/i.test(message)) return 'parse_failed';
  if (/网络|页面加载|timeout|net::|ERR_|navigation|load/i.test(message)) return 'network_failed';
  return 'unknown';
}
