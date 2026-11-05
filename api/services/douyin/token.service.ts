import { getTokenEncryptionKey } from '../../config/token-encryption.js';
import { decryptTokenWithKey, encryptTokenWithKey } from './token-crypto.js';

export function encryptToken(value: string): string {
  return encryptTokenWithKey(value, getTokenEncryptionKey());
}

export function decryptToken(value: string): string {
  return decryptTokenWithKey(value, getTokenEncryptionKey());
}
