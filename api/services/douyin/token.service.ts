import crypto from 'node:crypto';
import { getDouyinConfig } from './constants.js';

function key() { return crypto.createHash('sha256').update(getDouyinConfig().clientSecret || process.env.JWT_SECRET || 'xmt-douyin-development-only').digest(); }
export function encryptToken(value: string) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`; }
export function decryptToken(value: string) { const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64')); const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'); }
