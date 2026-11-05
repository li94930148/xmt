import crypto from 'node:crypto';

const TOKEN_FORMAT_VERSION = 'v1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error('Douyin token encryption key must contain exactly 32 bytes.');
  }
}

function decodeBase64Part(part: string, expectedBytes?: number): Buffer {
  const decoded = Buffer.from(part, 'base64');
  if (
    !part ||
    decoded.toString('base64') !== part ||
    (expectedBytes !== undefined && decoded.length !== expectedBytes)
  ) {
    throw new Error('Stored Douyin token has an invalid encrypted format.');
  }
  return decoded;
}

function decryptParts(ivPart: string, tagPart: string, encryptedPart: string, key: Buffer): string {
  assertKey(key);
  const iv = decodeBase64Part(ivPart, IV_BYTES);
  const tag = decodeBase64Part(tagPart, AUTH_TAG_BYTES);
  const encrypted = decodeBase64Part(encryptedPart);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function encryptTokenWithKey(value: string, key: Buffer): string {
  assertKey(key);
  if (!value) throw new Error('Douyin token must not be empty.');

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    TOKEN_FORMAT_VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

export function decryptTokenWithKey(value: string, key: Buffer): string {
  const [version, iv, tag, encrypted, ...extra] = value.split('.');
  if (version !== TOKEN_FORMAT_VERSION || !iv || !tag || encrypted === undefined || extra.length > 0) {
    throw new Error('Stored Douyin token requires the current encryption format.');
  }
  return decryptParts(iv, tag, encrypted, key);
}

/** Only the one-time migration script should read the legacy three-part format. */
export function decryptLegacyTokenWithKey(value: string, key: Buffer): string {
  const [iv, tag, encrypted, ...extra] = value.split('.');
  if (!iv || !tag || encrypted === undefined || extra.length > 0) {
    throw new Error('Stored legacy Douyin token has an invalid encrypted format.');
  }
  return decryptParts(iv, tag, encrypted, key);
}
