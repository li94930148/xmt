type ErrorPayload = { message?: unknown };

const technicalErrorMessages = [
  /^internal server error\b/i,
  /^internal error\b/i,
  /^http(?: error)?\s*[:(]?\s*\d{3}\b/i,
  /^request failed with status code \d{3}\b/i,
  /^request failed\b/i,
  /^failed to fetch\b/i,
  /^fetch failed\b/i,
  /^load failed\b/i,
  /^failed to load resource\b/i,
  /^networkerror\b/i,
  /^network error\b/i,
  /^(?:timeout|abort)error\b/i,
  /^the network connection was lost\b/i,
  /^connection (?:refused|reset|timed out)\b/i,
  /^(?:connect|read|write|socket)\s+econn(?:refused|reset|aborted|timedout)\b/i,
  /^(?:getaddrinfo\s+)?(?:enotfound|eai_again)\b/i,
  /^network request failed\b/i,
  /^(?:net::)?err_[a-z0-9_]+\b/i,
  /^socket hang up\b/i,
  /^(?:type|reference|syntax)error\b/i,
  /^(?:quotaexceeded|invalidstate|security|notallowed)error\b/i,
  /^(?:the )?quota (?:has been )?exceeded\b/i,
  /^failed to execute\b/i,
  /^the operation is insecure\b/i,
  /^storage (?:is )?(?:full|unavailable)\b/i,
  /^error:\s/i,
  /^(?:unauthorized|forbidden|not found|bad request|service unavailable|bad gateway|gateway timeout|method not allowed)\b/i,
  /^(?:conflict|unprocessable entity|payload too large|unsupported media type)\b/i,
];

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getUserFacingErrorMessage(payload: unknown, fallback: string): string {
  if (!isErrorPayload(payload) || typeof payload.message !== 'string') return fallback;

  const message = payload.message.trim();
  if (!message || message.length > 240 || /\n\s*at\s+/.test(message) || /<html\b/i.test(message)) return fallback;
  if (technicalErrorMessages.some((pattern) => pattern.test(message))) return fallback;
  return message;
}
