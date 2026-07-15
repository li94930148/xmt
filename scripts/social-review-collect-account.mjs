import { apiRequest, login, parseAccountId } from './social-review-test-utils.mjs';

const args = process.argv.slice(2);
const accountId = parseAccountId(args);

function readContentPath(argv) {
  const rawArg = argv.find((item) => item.startsWith('--content-path='));
  if (!rawArg) return null;
  const raw = rawArg.slice('--content-path='.length).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.hostname !== 'creator.douyin.com') throw new Error('采集路径无效，请传入抖音创作者中心路径。');
    return url.pathname || null;
  }
  return raw.startsWith('/') ? raw.split('?')[0] : null;
}

const contentPath = readContentPath(args);
const exportPath = readContentPath(args.map((item) => item.startsWith('--export-path=') ? `--content-path=${item.slice('--export-path='.length)}` : item));
const collectMode = args.includes('--mode=official-export') ? 'official-export' : 'standard';

if (accountId !== 2) {
  console.error('本阶段仅允许显式采集账号 ID 2。');
  process.exit(1);
}

async function main() {
  console.log('开始执行短视频真实采集验证。');
  console.log('本次验证会启动浏览器并访问抖音页面，只使用已保存的采集凭据。');
  if (contentPath) console.log(`人工路径：${contentPath}`);
  console.log(`账号 ID：${accountId}`);
  console.log(`采集模式：${collectMode === 'official-export' ? '官方导出' : '标准采集'}`);
  const token = await login();
  const result = await apiRequest('POST', `/accounts/${accountId}/collect`, token, { ...(contentPath ? { contentPath } : {}), ...(exportPath ? { exportPath } : {}), collectMode }, [200]);
  const data = result.payload?.data || {};
  console.log('真实采集验证已完成。');
  console.log(`任务 ID：${data.job?.id ?? ''}`);
  console.log(`账号 ID：${data.account?.id ?? accountId}`);
  console.log(`任务状态：${data.job?.status ?? ''}`);
  console.log(`错误摘要：${data.job?.lastError ? '已记录安全摘要' : '无'}`);
  console.log(`快照 ID：${data.snapshot?.id ?? '暂无'}`);
  console.log(`快照日期：${data.snapshot?.snapshotDate ?? '暂无'}`);
  console.log(`视频数量：${data.videoCount ?? 0}`);
  const diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics : [];
  if (diagnostics.length > 0) {
    console.log(`诊断摘要数量：${diagnostics.length}`);
    for (const item of diagnostics.slice(0, 5)) {
      console.log(`诊断：${item.message || item.type}，数量：${item.count ?? '无'}`);
    }
  }
}

main().catch((error) => {
  console.error('短视频真实采集验证失败：', error.message);
  process.exit(1);
});
