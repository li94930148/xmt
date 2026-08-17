import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ANDROID_PRODUCTION_ENDPOINTS, buildEnvironmentForProfile, resolveAndroidBuildProfile, validateAndroidProductionEndpoints } from '../../scripts/mobile-build-contract.mjs';
import { getNativeEndpointConfigurationErrorFor } from '../../src/platform/native-endpoint-contract.js';

const runtime = fs.readFileSync(path.join(process.cwd(), 'src/platform/runtime.ts'), 'utf8');
const nativeContract = fs.readFileSync(path.join(process.cwd(), 'src/platform/native-endpoint-contract.ts'), 'utf8');
assert.deepEqual(resolveAndroidBuildProfile('production', {
  VITE_API_BASE_URL: 'https://localhost/api', VITE_SOCKET_BASE_URL: 'http://localhost',
}), ANDROID_PRODUCTION_ENDPOINTS, 'production profile must ignore ambient shell endpoints');
assert.equal(validateAndroidProductionEndpoints(ANDROID_PRODUCTION_ENDPOINTS), null);
assert.equal(validateAndroidProductionEndpoints({ apiBaseUrl: '', socketBaseUrl: '' }), 'ANDROID_PRODUCTION_ENDPOINT_MISSING');
assert.equal(validateAndroidProductionEndpoints({ apiBaseUrl: '/api', socketBaseUrl: '/socket.io' }), 'ANDROID_PRODUCTION_ENDPOINT_FORBIDDEN');
assert.equal(validateAndroidProductionEndpoints({ apiBaseUrl: 'https://localhost/api', socketBaseUrl: 'https://localhost' }), 'ANDROID_PRODUCTION_ENDPOINT_FORBIDDEN');
assert.equal(validateAndroidProductionEndpoints({ apiBaseUrl: 'http://lanyaomedia.com/api', socketBaseUrl: 'http://lanyaomedia.com' }), 'ANDROID_PRODUCTION_API_ENDPOINT_INVALID');
assert.throws(() => resolveAndroidBuildProfile('development', {}), /ANDROID_DEVELOPMENT_ENDPOINT_MISSING/);
assert.equal(buildEnvironmentForProfile(ANDROID_PRODUCTION_ENDPOINTS, { VITE_API_BASE_URL: 'https://localhost/api' }).VITE_API_BASE_URL, 'https://lanyaomedia.com/api');
assert.equal(getNativeEndpointConfigurationErrorFor({ native: false, development: false }), null, 'web retains same-origin behavior');
assert.equal(getNativeEndpointConfigurationErrorFor({ native: true, development: true }), null, 'explicit Android development remains supported');
assert.equal(getNativeEndpointConfigurationErrorFor({ native: true, development: false }), '移动端构建配置无效，请安装正确版本。', 'missing native endpoint must fail closed');
assert.equal(getNativeEndpointConfigurationErrorFor({ native: true, development: false, apiBaseUrl: '/api', socketBaseUrl: '/socket.io' }), '移动端构建配置无效，请安装正确版本。');
assert.equal(getNativeEndpointConfigurationErrorFor({ native: true, development: false, apiBaseUrl: 'https://localhost/api', socketBaseUrl: 'https://localhost' }), '移动端构建配置无效，请安装正确版本。');
assert.equal(getNativeEndpointConfigurationErrorFor({ native: true, development: false, apiBaseUrl: 'http://lanyaomedia.com/api', socketBaseUrl: 'http://lanyaomedia.com' }), '移动端构建配置无效，请安装正确版本。');
assert.equal(getNativeEndpointConfigurationErrorFor({ native: true, development: false, apiBaseUrl: 'https://lanyaomedia.com/api', socketBaseUrl: 'https://lanyaomedia.com' }), null);
assert.match(runtime, /NativeEndpointConfigurationError/);
assert.match(nativeContract, /移动端构建配置无效，请安装正确版本/);
assert.doesNotMatch(runtime, /if \(isNative\(\)\) return '\/api'/);
console.log('Android production endpoint contract tests passed');
