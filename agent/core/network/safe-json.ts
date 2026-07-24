const PLATFORM_ID_KEY = /(?:^|_)(?:aweme|item|group|author|user|sec_user|uid|id)(?:_id)?$|(?:aweme|item|group|author|user|secUser|uid)Id$/i;

function quoteUnsafeIntegers(source: string): string {
  let output = '';
  let index = 0;
  let inString = false;
  let escaped = false;
  while (index < source.length) {
    const char = source[index];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      index += 1;
      continue;
    }
    if (char === '-' || (char >= '0' && char <= '9')) {
      const match = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        const token = match[0];
        const integer = /^-?(?:0|[1-9]\d*)$/.test(token);
        const digits = token.replace('-', '');
        output += integer && digits.length >= 16 && !Number.isSafeInteger(Number(token))
          ? JSON.stringify(token)
          : token;
        index += token.length;
        continue;
      }
    }
    output += char;
    index += 1;
  }
  return output;
}

export function normalizePlatformIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizePlatformIds);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (PLATFORM_ID_KEY.test(key) && (typeof item === 'number' || typeof item === 'bigint')) {
      return [key, String(item)];
    }
    return [key, normalizePlatformIds(item)];
  }));
}

export function safeJsonParse(source: string): unknown {
  return normalizePlatformIds(JSON.parse(quoteUnsafeIntegers(source)) as unknown);
}
