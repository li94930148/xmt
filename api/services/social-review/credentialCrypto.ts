import crypto from 'crypto';

type EncryptedEnvelope = {
  version?: number;
  algorithm?: string;
  iv?: string;
  tag?: string;
  authTag?: string;
  ciphertext?: string;
  data?: string;
};

const SAFE_ERROR = '采集凭据无法解密，请重新扫码登录。';

function getSecretBuffers() {
  const secret = process.env.SOCIAL_CREDENTIAL_SECRET || '';
  if (secret.length < 32) {
    throw new Error(SAFE_ERROR);
  }

  const candidates: Buffer[] = [crypto.createHash('sha256').update(secret).digest()];
  try {
    const decoded = Buffer.from(secret, 'base64');
    if (decoded.length === 32) {
      candidates.push(decoded);
    }
  } catch {
    // 忽略无效 base64，保留字符串派生密钥
  }

  return candidates;
}

function readEnvelope(payload: string): EncryptedEnvelope {
  try {
    const parsed = JSON.parse(payload) as EncryptedEnvelope;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(SAFE_ERROR);
    }
    return parsed;
  } catch {
    throw new Error(SAFE_ERROR);
  }
}

export function decryptCredentialPayload<T = unknown>(encryptedPayload: string): T {
  const envelope = readEnvelope(encryptedPayload);
  const ivText = envelope.iv;
  const tagText = envelope.authTag || envelope.tag;
  const cipherText = envelope.ciphertext || envelope.data;

  if (!ivText || !tagText || !cipherText) {
    throw new Error(SAFE_ERROR);
  }

  for (const secretBuffer of getSecretBuffers()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', secretBuffer, Buffer.from(ivText, 'base64'));
      decipher.setAuthTag(Buffer.from(tagText, 'base64'));
      const plainText = Buffer.concat([
        decipher.update(Buffer.from(cipherText, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      return JSON.parse(plainText) as T;
    } catch {
      // 继续尝试兼容密钥格式
    }
  }
  throw new Error(SAFE_ERROR);
}

export function sanitizeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!message) {
    return '采集失败，请稍后重试。';
  }

  if (/凭据|登录|扫码/.test(message)) {
    return message;
  }
  if (/browser|chromium|executable|launch/i.test(message)) {
    return '浏览器启动失败，请检查运行环境。';
  }
  if (/timeout|net::|ERR_|Navigation|load/i.test(message)) {
    return '页面加载失败，请稍后重试。';
  }
  if (/parse|selector|locator|数据|结构/i.test(message)) {
    return '账号数据解析失败，请检查页面结构。';
  }
  return '采集失败，请稍后重试。';
}

export function assertSafeText(text: string) {
  return !/(cookie|authorization|headers|session|storageState|localStorage|raw_json|<html|token)/i.test(text);
}
