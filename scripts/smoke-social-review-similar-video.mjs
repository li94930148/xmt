import { apiRequest, login } from './social-review-test-utils.mjs';
const token = await login();
const list = await apiRequest('GET', '/accounts/2/videos?limit=1', token);
const video = list.payload?.data?.items?.[0];
if (!video) throw new Error('no video available');
const response = await apiRequest('GET', `/videos/${video.id}/similar`, token);
if (!Array.isArray(response.payload?.data?.items)) throw new Error('similar-video response invalid');
console.log('similar video contract passed');
