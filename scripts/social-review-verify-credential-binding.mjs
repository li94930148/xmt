import { apiRequest, createDb, isSafeErrorText, login, parseAccountId } from './social-review-test-utils.mjs';

const accountId = parseAccountId(process.argv.slice(2));

if (!accountId) {
  console.error('请传入要验证的账号 ID，本脚本不会自动选择账号。');
  process.exit(1);
}

async function main() {
  console.log('开始验证短视频采集凭据绑定状态。');
  const db = createDb();
  const accountResult = await db.execute({
    sql: 'SELECT id, platform, credential_ref FROM social_accounts WHERE id = ?',
    args: [accountId],
  });
  const account = accountResult.rows[0];
  if (!account) throw new Error('账号不存在，无法验证凭据绑定。');
  console.log(`账号 ID：${account.id}`);
  console.log(`平台：${account.platform}`);
  console.log(`账号凭据引用：${account.credential_ref ? '已绑定' : '未绑定'}`);

  const credentialResult = await db.execute({
    sql: `SELECT credential_ref, credential_type, status, encrypted_payload IS NOT NULL AS has_payload,
                 last_verified_at, last_error
            FROM social_credentials
           WHERE account_id = ?
           ORDER BY updated_at DESC
           LIMIT 1`,
    args: [accountId],
  });
  const credential = credentialResult.rows[0] || null;
  if (!credential) {
    console.log('该账号暂无采集凭据记录。');
  } else {
    if (!isSafeErrorText(credential.last_error)) throw new Error('凭据错误摘要包含不应展示的敏感内容。');
    console.log(`凭据引用：${credential.credential_ref || ''}`);
    console.log(`凭据类型：${credential.credential_type || ''}`);
    console.log(`凭据状态：${credential.status || ''}`);
    console.log(`是否存在加密载荷：${Number(credential.has_payload) === 1 ? '是' : '否'}`);
    console.log(`最近验证时间：${credential.last_verified_at || '暂无'}`);
  }
  await db.close?.();

  const token = await login();
  const response = await apiRequest('GET', `/accounts/${accountId}/credentials`, token);
  console.log(`接口凭据状态：${response.payload?.data?.status || '暂无凭据'}`);
  console.log(`接口是否显示可用凭据：${response.payload?.data?.hasCredential ? '是' : '否'}`);
  console.log('短视频采集凭据绑定状态验证通过。');
}

main().catch((error) => {
  console.error('短视频采集凭据绑定状态验证失败：', error.message);
  process.exit(1);
});
