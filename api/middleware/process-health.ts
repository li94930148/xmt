let failureCode: string | null = null;

export function markProcessUnhealthy(code: string) {
  failureCode = code;
}

export function getProcessReadiness() {
  return failureCode ? { ready: false as const, failureCode } : { ready: true as const, failureCode: null };
}
