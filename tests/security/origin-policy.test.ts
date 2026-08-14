import assert from 'node:assert/strict';
import { isAllowedRequestOrigin, parseConfiguredOrigins } from '../../api/security/origin-policy.js';

const defaults = parseConfiguredOrigins();
assert.equal(isAllowedRequestOrigin('http://localhost', defaults), true, 'Capacitor local origin is allowed');
assert.equal(isAllowedRequestOrigin('https://localhost', defaults), true, 'Capacitor HTTPS local origin is allowed');
assert.equal(isAllowedRequestOrigin('http://localhost:5173', defaults), true, 'local web development origin is allowed');
assert.equal(isAllowedRequestOrigin('http://192.168.1.10:5173', defaults), false, 'private-network hosts are never reflected');
assert.equal(isAllowedRequestOrigin('http://localhost.evil.test', defaults), false, 'lookalike host is rejected');
assert.equal(isAllowedRequestOrigin('https://localhost.evil.test', defaults), false, 'HTTPS lookalike host is rejected');
assert.equal(isAllowedRequestOrigin('capacitor://localhost', defaults), false, 'unsupported origin scheme is rejected');
assert.equal(isAllowedRequestOrigin(undefined, defaults), true, 'non-browser requests without Origin remain supported');

const production = parseConfiguredOrigins('https://office.example.com, https://admin.example.com');
assert.equal(isAllowedRequestOrigin('https://office.example.com', production), true);
assert.equal(isAllowedRequestOrigin('https://office.example.com:443', production), true, 'default ports normalize to the same origin');
assert.equal(isAllowedRequestOrigin('https://admin.example.com', production), true);
assert.equal(isAllowedRequestOrigin('http://office.example.com', production), false);

const mobileProduction = parseConfiguredOrigins('https://lanyaomedia.com,http://localhost,https://localhost');
assert.equal(isAllowedRequestOrigin('https://lanyaomedia.com', mobileProduction), true);
assert.equal(isAllowedRequestOrigin('http://localhost', mobileProduction), true);
assert.equal(isAllowedRequestOrigin('https://localhost', mobileProduction), true);
assert.equal(isAllowedRequestOrigin('http://localhost:5173', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('https://localhost:5173', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('https://localhost:5174', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('http://localhost:9999', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('https://127.0.0.1', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('http://127.0.0.1:5174', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('https://127.0.0.1:5174', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('https://evil.localhost', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('capacitor://localhost', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('http://192.168.0.45', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('https://192.168.0.45', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('http://47.104.77.65', mobileProduction), false);
assert.equal(isAllowedRequestOrigin('https://evil.example', mobileProduction), false);

console.log('Origin policy contract tests passed');
