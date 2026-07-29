"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginXmt = loginXmt;
exports.register = register;
exports.bind = bind;
exports.heartbeat = heartbeat;
exports.upload = upload;
const node_crypto_1 = __importDefault(require("node:crypto"));
const envelope_js_1 = require("../crypto/envelope.js");
const unifiedPayload_js_1 = require("./unifiedPayload.js");
async function responseJson(response) { const value = await response.json().catch(() => ({})); if (!response.ok)
    throw new Error(String(value.message || `请求失败 HTTP ${response.status}`)); return value; }
async function loginXmt(serverUrl, username, password) { const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) }); return responseJson(response); }
async function register(serverUrl, webToken, accountId, deviceId) { const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/creator-agent/register`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${webToken}` }, body: JSON.stringify({ platform: 'douyin', account_id: accountId, device_id: deviceId }) }); return responseJson(response); }
async function bind(serverUrl, bindingCode, device) { const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/creator-agent/bind`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ binding_code: bindingCode, device }) }); return responseJson(response); }
async function heartbeat(config, agentToken, state) { const browser = config.browserConfig; const response = await fetch(`${config.serverUrl.replace(/\/$/, '')}/api/creator-agent/heartbeat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentToken}` }, body: JSON.stringify({ agent_id: config.agentId, account_id: config.accountId, device_name: state.deviceName, os: state.os, agent_version: '2.11.0-agent', protocol_version: 1, browser_login_status: state.browserLoginStatus, browser_type: browser.type, browser_version: browser.browserVersion || '', browser_engine: browser.engine, browser_runtime: browser.runtime, session_mode: browser.sessionMode, compatibility_status: browser.compatibilityStatus || 'not_tested' }) }); return responseJson(response); }
async function upload(config, agentToken, snapshot, options = {}) { const body = { protocol_version: 1, agent_version: snapshot.agent_version, agent_id: config.agentId, device_id: config.deviceId, platform: config.platform, account_id: config.accountId, timestamp: new Date().toISOString(), nonce: node_crypto_1.default.randomUUID(), collected_at: snapshot.collected_at || new Date().toISOString(), data: (0, envelope_js_1.encrypt)((0, unifiedPayload_js_1.toUnifiedCreatorPayload)(snapshot, options), agentToken) }; body.signature = (0, envelope_js_1.sign)(body, agentToken); const serialized = JSON.stringify(body); const clientPayloadBytes = Buffer.byteLength(serialized); if (clientPayloadBytes > 12 * 1024 * 1024)
    throw new Error('同步数据包超过 12MB 限制，请缩小采集范围后重试'); const response = await fetch(`${config.serverUrl.replace(/\/$/, '')}/api/creator-agent/data-sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentToken}` }, body: serialized }); const result = await responseJson(response); return { ...result, client_payload_bytes: clientPayloadBytes }; }
