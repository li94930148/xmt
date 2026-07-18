import { apiRequest, login } from './social-review-test-utils.mjs';
const token = await login();
const list = await apiRequest('GET', '/accounts/2/videos?limit=1', token);
const video = list.payload?.data?.items?.[0];
if (!video) throw new Error('no video available');
for (const path of [`/videos/${video.id}/lifecycle`, `/videos/${video.id}/features`, `/videos/${video.id}/insights`]) await apiRequest('GET', path, token);
console.log('video detail contracts passed');
