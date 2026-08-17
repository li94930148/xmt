import assert from 'node:assert/strict';
import { InvalidApiResponseError, assertApiHealthResponse, readJsonApiResponse } from '../../src/platform/api-health.js';

const jsonResponse = (body: unknown, contentType = 'application/json') => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': contentType } });
await assert.doesNotReject(() => assertApiHealthResponse(jsonResponse({ success: true, status: 'ok' })));
await assert.rejects(() => assertApiHealthResponse(new Response('<html>app shell</html>', { status: 200, headers: { 'content-type': 'text/html' } })), (error: unknown) => error instanceof InvalidApiResponseError && error.code === 'INVALID_API_RESPONSE');
await assert.rejects(() => assertApiHealthResponse(jsonResponse({ success: true, status: 'warming' })), InvalidApiResponseError);
await assert.rejects(() => readJsonApiResponse(new Response('{not-json', { status: 200, headers: { 'content-type': 'application/json' } })), InvalidApiResponseError);
console.log('Mobile health response contract tests passed');
