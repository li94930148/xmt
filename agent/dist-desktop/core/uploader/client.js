"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginXmt = loginXmt;
exports.register = register;
exports.upload = upload;
const envelope_js_1 = require("../crypto/envelope.js");
async function responseJson(response) { const value = await response.json().catch(() => ({})); if (!response.ok)
    throw new Error(String(value.message || `请求失败 HTTP ${response.status}`)); return value; }
async function loginXmt(serverUrl, username, password) { const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) }); return responseJson(response); }
async function register(serverUrl, webToken, accountId, deviceId) { const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/creator-agent/register`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${webToken}` }, body: JSON.stringify({ platform: 'douyin', account_id: accountId, device_id: deviceId }) }); return responseJson(response); }
async function upload(config, agentToken, snapshot) { const body = { agent_id: config.agentId, platform: config.platform, account_id: config.accountId, collected_at: new Date().toISOString(), data: (0, envelope_js_1.encrypt)(snapshot, agentToken) }; body.signature = (0, envelope_js_1.sign)(body, agentToken); const response = await fetch(`${config.serverUrl.replace(/\/$/, '')}/api/creator-agent/report`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentToken}` }, body: JSON.stringify(body) }); return responseJson(response); }
