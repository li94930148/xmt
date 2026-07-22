"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.sign = sign;
const node_crypto_1 = __importDefault(require("node:crypto"));
const key = (token) => node_crypto_1.default.createHash('sha256').update(token).digest();
function encrypt(data, token) { const iv = node_crypto_1.default.randomBytes(12); const cipher = node_crypto_1.default.createCipheriv('aes-256-gcm', key(token), iv); const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]); return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }; }
function sign(body, token) { return node_crypto_1.default.createHmac('sha256', token).update([body.agent_id, body.platform, body.account_id, body.collected_at, JSON.stringify(body.data)].join('\n')).digest('hex'); }
