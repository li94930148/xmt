import { apiRequest, login } from './social-review-test-utils.mjs';
const token = await login();
const response = await apiRequest('POST', '/accounts/2/credential-health', token);
if (response.status !== 200 || !['active', 'expired', 'need_login', 'checking'].includes(response.payload?.data?.status)) throw new Error('credential health contract invalid');
console.log(`credential health: ${response.payload.data.status}`);
