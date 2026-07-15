import { apiRequest, login } from './social-review-test-utils.mjs';

const ACCOUNT_ID = 2;

async function main() {
  console.log('开始验证短视频采集凭据只读接口。');
  const token = await login();
  const response = await apiRequest('GET', `/accounts/${ACCOUNT_ID}/credentials`, token);
  const data = response.payload?.data || {};
  console.log(`账号 ID：${ACCOUNT_ID}`);
  console.log(`凭据状态：${data.status || '暂无凭据'}`);
  console.log(`凭据类型：${data.credentialType || '暂无凭据'}`);
  console.log(`是否存在可用凭据：${data.hasCredential ? '是' : '否'}`);
  console.log(`最近验证时间：${data.lastVerifiedAt || '暂无'}`);
  console.log('短视频采集凭据只读接口验证通过。');
}

main().catch((error) => {
  console.error('短视频采集凭据只读接口验证失败：', error.message);
  process.exit(1);
});
