import { detectServerLogin } from '../api/services/social-review/serverBrowserService.ts';
const status = await detectServerLogin(2);
if (!['logged_in','need_login','expired'].includes(status)) throw new Error('invalid server browser status');
console.log(`server browser status: ${status}`);
