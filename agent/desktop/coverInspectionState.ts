export type CoverInspectionFailureCode =
  | 'COVER_METADATA_SAFETY_GATE_BLOCKED'
  | 'COVER_METADATA_BINDING_NOT_READY'
  | 'COVER_METADATA_BROWSER_SESSION_BUSY'
  | 'COVER_METADATA_PROFILE_NOT_READY'
  | 'COVER_METADATA_BRIDGE_NOT_READY'
  | 'COVER_METADATA_PROFILE_NOT_AUTHENTICATED'
  | 'COVER_METADATA_WORKER_FAILED';

const knownCodes: CoverInspectionFailureCode[] = [
  'COVER_METADATA_SAFETY_GATE_BLOCKED',
  'COVER_METADATA_BINDING_NOT_READY',
  'COVER_METADATA_BROWSER_SESSION_BUSY',
  'COVER_METADATA_PROFILE_NOT_READY',
  'COVER_METADATA_BRIDGE_NOT_READY',
  'COVER_METADATA_PROFILE_NOT_AUTHENTICATED',
  'COVER_METADATA_WORKER_FAILED',
];

export function coverInspectionFailureCode(cause: unknown): CoverInspectionFailureCode {
  const value = cause instanceof Error ? cause.message : String(cause || '');
  const known = knownCodes.find(code => value.includes(code));
  if (known) return known;
  if (/SingletonLock|existing browser session|Target page, context or browser has been closed/i.test(value)) return 'COVER_METADATA_BROWSER_SESSION_BUSY';
  return 'COVER_METADATA_WORKER_FAILED';
}

export function coverInspectionActionError(cause: unknown) {
  switch (coverInspectionFailureCode(cause)) {
    case 'COVER_METADATA_SAFETY_GATE_BLOCKED': return '同步或上传队列正在运行，请完成后再检查封面来源。';
    case 'COVER_METADATA_BINDING_NOT_READY': return '当前账号尚未完成绑定，暂时无法检查封面来源。';
    case 'COVER_METADATA_BROWSER_SESSION_BUSY': return 'Agent 专用浏览器仍在退出，请关闭该专用 Chrome 窗口后重试。';
    case 'COVER_METADATA_PROFILE_NOT_READY': return 'Agent 专用浏览器资料尚未就绪，请重新登录抖音后重试。';
    case 'COVER_METADATA_BRIDGE_NOT_READY': return '本地采集运行时未就绪，请重启或重新安装 Agent。';
    case 'COVER_METADATA_PROFILE_NOT_AUTHENTICATED': return '抖音登录状态需要重新确认后再检查。';
    default: return '封面来源检查未完成，请查看本地诊断后重试。';
  }
}
