import 'dotenv/config';
import { apiRequest, login } from './social-review-test-utils.mjs';
const token = await login();
for (let i = 0; i < 2; i += 1) {
  const result = await apiRequest('POST', '/accounts/2/performance-sync', token, { source: 'manual' });
  const data = result.payload.data;
  console.log(`${i + 1} received=${data.summary.received} matched=${data.summary.matched} updated=${data.summary.updated} skipped=${data.summary.skipped}`);
}
