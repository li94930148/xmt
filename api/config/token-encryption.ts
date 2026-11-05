import crypto from 'node:crypto';

const TOKEN_ENCRYPTION_KEY_BYTES = 32;

export class TokenEncryptionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenEncryptionConfigurationError';
  }
}

export function parseTokenEncryptionKey(value: string | undefined): Buffer {
  const encoded = value?.trim();
  if (!encoded) {
    throw new TokenEncryptionConfigurationError('XMT_TOKEN_ENCRYPTION_KEY is required to encrypt or decrypt stored Douyin tokens.');
  }

  const key = Buffer.from(encoded, 'base64');
  if (
    key.length !== TOKEN_ENCRYPTION_KEY_BYTES ||
    key.toString('base64') !== encoded
  ) {
    throw new TokenEncryptionConfigurationError('XMT_TOKEN_ENCRYPTION_KEY must be canonical base64 for exactly 32 random bytes.');
  }

  return key;
}

export function getTokenEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  return parseTokenEncryptionKey(env.XMT_TOKEN_ENCRYPTION_KEY);
}

export function assertTokenEncryptionKeyConfigured(env: NodeJS.ProcessEnv = process.env): void {
  getTokenEncryptionKey(env);
}

export function assertProductionTokenEncryptionKeyConfigured(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') assertTokenEncryptionKeyConfigured(env);
}

export function generateTokenEncryptionKey(): string {
  return crypto.randomBytes(TOKEN_ENCRYPTION_KEY_BYTES).toString('base64');
}
