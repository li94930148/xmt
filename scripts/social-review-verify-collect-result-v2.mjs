import { apiRequest, createDb, isSafeErrorText, login, parseAccountId } from './social-review-test-utils.mjs';

const accountId = parseAccountId(process.argv.slice(2));

if (!accountId) {
  console.error('请传入要验证的账号 ID，本脚本不会自动选择账号。');
  process.exit(1);
}

function readDiagnostics(rawJson) {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(String(rawJson));
    return Array.isArray(parsed?.diagnostics) ? parsed.diagnostics : [];
  } catch {
    return [];
  }
}

function emptyVideoReason(diagnostics) {
  if (countDiagnostics(diagnostics, 'video_candidate_skipped_no_id_field') > 0) return '作品候选未命中允许的稳定标识字段路径';
  if (countDiagnostics(diagnostics, 'video_candidate_skipped_empty_id') > 0) return '作品候选标识字段为空';
  if (countDiagnostics(diagnostics, 'video_candidate_skipped_unstable_id') > 0) return '作品候选标识不具备稳定性';
  if (countDiagnostics(diagnostics, 'video_candidate_skipped_no_work_semantics') > 0) return '候选标识缺少作品语义';
  if (countDiagnostics(diagnostics, 'video_candidate_skipped_url_id_extract_failed') > 0) return '候选链接未提取到稳定作品标识';
  if (diagnostics.some((item) => item.type === 'content_entry_not_found')) return '未发现作品管理入口';
  if (diagnostics.some((item) => item.type === 'content_entry_permission_denied')) return '当前账号无权访问作品管理页';
  if (diagnostics.some((item) => item.type === 'content_entry_matched') && diagnostics.some((item) => item.type === 'work_api_not_triggered')) return '已进入疑似作品页但未触发作品接口';
  if (diagnostics.some((item) => item.type === 'work_api_field_mismatch')) return '接口已触发但缺少稳定作品字段';
  if (diagnostics.some((item) => item.type === 'api_work_items_skipped_no_stable_id')) return '作品接口存在候选，但未找到稳定视频标识';
  if (diagnostics.some((item) => item.type === 'api_candidate_work_list')) return '作品接口未抽取到可确认作品';
  if (diagnostics.some((item) => item.type === 'api_candidate_comment_notice')) return '本次仅捕获到评论或通知类接口，未捕获到作品列表接口';
  if (diagnostics.some((item) => item.type === 'video_list_empty')) return '作品列表为空';
  if (diagnostics.some((item) => item.type === 'video_list_parse_failed')) return '作品列表解析失败';
  if (diagnostics.some((item) => item.type === 'video_items_skipped')) return '未找到稳定视频标识或部分作品已跳过';
  return '本次未执行视频列表采集或页面未返回可确认作品';
}

function countDiagnostics(diagnostics, type) {
  return diagnostics.filter((item) => item.type === type).reduce((sum, item) => sum + Number(item.count || 0), 0);
}

function printApiDiagnosticSummary(diagnostics) {
  const classified = diagnostics.filter((item) => item.type === 'api_candidate_classified' || String(item.type || '').startsWith('api_candidate_'));
  const fieldHitTotal = countDiagnostics(diagnostics, 'api_field_sample_counted');
  const arrayPathTotal = countDiagnostics(diagnostics, 'api_array_path_candidate_found');
  const workListCount = diagnostics.filter((item) => item.type === 'api_candidate_work_list').length;
  const commentNoticeCount = diagnostics.filter((item) => item.type === 'api_candidate_comment_notice').length;
  const accountMetricCount = diagnostics.filter((item) => item.type === 'api_candidate_account_metric').length;
  const extractedCount = countDiagnostics(diagnostics, 'api_work_items_extracted');
  const skippedNoStableId = countDiagnostics(diagnostics, 'api_work_items_skipped_no_stable_id');
  console.log(`异步接口分类数量：${classified.length}`);
  console.log(`作品接口候选数量：${workListCount}`);
  console.log(`评论通知接口候选数量：${commentNoticeCount}`);
  console.log(`账号指标接口候选数量：${accountMetricCount}`);
  console.log(`白名单字段命中数量：${fieldHitTotal}`);
  console.log(`数组路径候选数量：${arrayPathTotal}`);
  console.log(`作品接口抽取数量：${extractedCount}`);
  console.log(`缺少稳定标识跳过数量：${skippedNoStableId}`);
}

function printCandidateIdDiagnosticSummary(diagnostics) {
  const idSummaries = diagnostics.filter((item) => item.type === 'video_candidate_id_path_summary');
  const semanticSummaries = diagnostics.filter((item) => item.type === 'video_candidate_work_semantics_summary');
  const latestIdSummary = idSummaries.at(-1);
  const latestSemanticSummary = semanticSummaries.at(-1);
  const stats = latestIdSummary?.fieldPathStats && typeof latestIdSummary.fieldPathStats === 'object'
    ? latestIdSummary.fieldPathStats
    : {};
  const paths = Object.entries(stats).slice(0, 12);
  console.log(`候选标识路径统计数量：${paths.length}`);
  for (const [path, stat] of paths) {
    const types = Object.keys(stat?.typeCounts || {}).join('、') || '暂无';
    const stable = Number(stat?.looksLike?.numericLong || 0) + Number(stat?.looksLike?.alphaNumeric || 0);
    console.log(`标识路径：${path}；命中：${stat?.hits || 0}；类型：${types}；长度：${stat?.minLength ?? '暂无'}-${stat?.maxLength ?? '暂无'}，平均 ${stat?.avgLength ?? '暂无'}；稳定标识特征：${stable}；黑名单语义：${stat?.blacklisted ? '是' : '否'}；来源：${(stat?.sources || []).join('、') || '暂无'}`);
  }
  const semantics = latestSemanticSummary?.workSemanticHitCounts && typeof latestSemanticSummary.workSemanticHitCounts === 'object'
    ? Object.entries(latestSemanticSummary.workSemanticHitCounts).slice(0, 12)
    : [];
  console.log(`作品语义字段种类：${semantics.length}`);
  const skipTypes = [
    'video_candidate_skipped_no_id_field',
    'video_candidate_skipped_empty_id',
    'video_candidate_skipped_comment_notice_id',
    'video_candidate_skipped_unstable_id',
    'video_candidate_skipped_no_work_semantics',
    'video_candidate_skipped_url_id_extract_failed',
    'video_candidate_skipped_duplicate',
  ];
  for (const type of skipTypes) console.log(`细分跳过统计 ${type}：${countDiagnostics(diagnostics, type)}`);
}

function printOfficialExportSummary(diagnostics) {
  const downloaderEntered = countDiagnostics(diagnostics, 'export_downloader_entered');
  const pageOpened = countDiagnostics(diagnostics, 'export_page_opened');
  const searchStarted = countDiagnostics(diagnostics, 'export_button_search_started');
  const buttonNotFound = countDiagnostics(diagnostics, 'export_button_not_found');
  const modeReceived = countDiagnostics(diagnostics, 'collect_mode_received');
  const modeSelected = countDiagnostics(diagnostics, 'collect_mode_official_export_selected');
  const exportModeSelected = countDiagnostics(diagnostics, 'export_mode_selected');
  const found = countDiagnostics(diagnostics, 'export_button_found');
  const downloaded = countDiagnostics(diagnostics, 'export_download_completed');
  const parsed = countDiagnostics(diagnostics, 'export_rows_parsed');
  const skipped = countDiagnostics(diagnostics, 'export_rows_skipped_no_stable_id');
  const saved = countDiagnostics(diagnostics, 'export_videos_saved');
  const unmapped = countDiagnostics(diagnostics, 'export_fields_unmapped');
  const latest = diagnostics.filter((item) => item.type === 'export_file_parse_success').at(-1);
  const columnSummary = diagnostics.filter((item) => item.type === 'export_file_columns_analyzed').at(-1);
  const idSummary = diagnostics.filter((item) => item.type === 'export_id_candidates_identified').at(-1);
  if (!modeReceived && !modeSelected && !exportModeSelected && !found && !downloaded && !parsed && !saved) return;
  console.log(`下载器已进入：${downloaderEntered > 0 ? '是' : '否'}`);
  console.log(`页面已打开：${pageOpened > 0 ? '是' : '否'}`);
  console.log(`按钮搜索已开始：${searchStarted > 0 ? '是' : '否'}`);
  console.log(`按钮未找到数量：${buttonNotFound}`);
  console.log(`采集模式已接收：${modeReceived > 0 ? '是' : '否'}`);
  console.log(`官方导出模式已选择：${modeSelected > 0 ? '是' : '否'}`);
  console.log(`官方导出分支已进入：${exportModeSelected > 0 ? '是' : '否'}`);
  console.log(`导出按钮发现数量：${found}`);
  console.log(`导出下载完成数量：${downloaded}`);
  console.log(`导出文件类型：${latest?.fileType || '暂无'}`);
  console.log(`导出列数量：${columnSummary?.count ?? '暂无'}`);
  console.log(`导出列名摘要：${Array.isArray(columnSummary?.columnNames) ? columnSummary.columnNames.join('、') : '暂无'}`);
  console.log(`导出解析行数：${parsed}`);
  console.log(`识别作品 ID 数量：${idSummary?.count ?? 0}`);
  console.log(`导出跳过行数：${skipped}`);
  console.log(`导出写入视频数量：${saved}`);
  console.log(`未映射字段数量：${unmapped}`);
}

function printContentEntryDiagnosticSummary(diagnostics) {
  const manualPathUsedCount = countDiagnostics(diagnostics, 'content_manual_path_used');
  const manualPathMatchedCount = countDiagnostics(diagnostics, 'content_manual_path_matched');
  const manualPathNormalizedCount = countDiagnostics(diagnostics, 'content_manual_path_normalized');
  const candidateCount = countDiagnostics(diagnostics, 'content_entry_candidate_seen');
  const clickedCount = countDiagnostics(diagnostics, 'content_entry_clicked');
  const matchedCount = countDiagnostics(diagnostics, 'content_entry_matched');
  const pathChangedCount = countDiagnostics(diagnostics, 'content_entry_path_changed');
  const notFoundCount = diagnostics.filter((item) => item.type === 'content_entry_not_found').length;
  const failedCount = diagnostics.filter((item) => item.type === 'content_entry_failed').length;
  const permissionDeniedCount = diagnostics.filter((item) => item.type === 'content_entry_permission_denied').length;
  const loginRequiredCount = diagnostics.filter((item) => item.type === 'content_entry_login_required').length;
  const workApiTriggeredCount = countDiagnostics(diagnostics, 'work_api_triggered');
  const workApiNotTriggeredCount = diagnostics.filter((item) => item.type === 'work_api_not_triggered').length;
  const workApiFieldMismatchCount = diagnostics.filter((item) => item.type === 'work_api_field_mismatch').length;
  const workApiItemsSavedCount = countDiagnostics(diagnostics, 'work_api_items_saved');
  console.log(`人工路径使用数量：${manualPathUsedCount}`);
  console.log(`人工路径规范化数量：${manualPathNormalizedCount}`);
  console.log(`人工路径命中数量：${manualPathMatchedCount}`);
  console.log(`作品入口候选数量：${candidateCount}`);
  console.log(`作品入口点击数量：${clickedCount}`);
  console.log(`入口路径变化数量：${pathChangedCount}`);
  console.log(`疑似作品页命中数量：${matchedCount}`);
  console.log(`未发现作品入口次数：${notFoundCount}`);
  console.log(`作品入口探测失败次数：${failedCount}`);
  console.log(`作品页权限不足次数：${permissionDeniedCount}`);
  console.log(`作品入口要求登录次数：${loginRequiredCount}`);
  console.log(`作品接口触发数量：${workApiTriggeredCount}`);
  console.log(`作品接口未触发次数：${workApiNotTriggeredCount}`);
  console.log(`作品接口字段不匹配次数：${workApiFieldMismatchCount}`);
  console.log(`作品明细写入数量：${workApiItemsSavedCount}`);
}

async function readLatestJob(db) {
  const result = await db.execute({
    sql: `SELECT id, account_id, platform, strategy, status, retry_count, last_error,
                 started_at, finished_at, created_at
            FROM social_ingestion_jobs
           WHERE account_id = ?
           ORDER BY id DESC
           LIMIT 1`,
    args: [accountId],
  });
  return result.rows[0] || null;
}

async function readLatestSnapshot(db) {
  const result = await db.execute({
    sql: `SELECT id, account_id, platform, snapshot_date, followers, following_count,
                 likes_total, video_count, works_count, fetched_at, raw_json
            FROM social_snapshots
           WHERE account_id = ?
           ORDER BY fetched_at DESC, id DESC
           LIMIT 1`,
    args: [accountId],
  });
  return result.rows[0] || null;
}

async function readVideos(db, snapshotId) {
  if (!snapshotId) return [];
  const result = await db.execute({
    sql: `SELECT id, internal_video_key, external_video_id, title, publish_time, likes, comments, shares, collects, views
            FROM social_videos
           WHERE account_id = ? AND snapshot_id = ?
           ORDER BY id DESC
           LIMIT 100`,
    args: [accountId, snapshotId],
  });
  return result.rows;
}

async function readDuplicateGroups(db, snapshotId) {
  if (!snapshotId) return [];
  const result = await db.execute({
    sql: `SELECT platform, external_video_id, snapshot_id, COUNT(*) AS count
            FROM social_videos
           WHERE account_id = ? AND snapshot_id = ?
           GROUP BY platform, external_video_id, snapshot_id
          HAVING COUNT(*) > 1`,
    args: [accountId, snapshotId],
  });
  return result.rows;
}

function assertMetricFields(video) {
  for (const key of ['likes', 'comments', 'shares', 'collects', 'views']) {
    const value = video[key];
    if (value != null && typeof value !== 'number') {
      throw new Error('视频指标字段必须是数字或为空。');
    }
  }
}

async function main() {
  console.log('开始验证短视频真实采集结果。');
  const db = createDb();
  const accountResult = await db.execute({
    sql: `SELECT id, platform, active, fetch_strategy, account_name, display_name,
                 external_account_id, profile_url, credential_ref, last_fetched_at
            FROM social_accounts
           WHERE id = ?`,
    args: [accountId],
  });
  const account = accountResult.rows[0];
  if (!account) throw new Error('账号不存在，无法验证采集结果。');
  console.log(`账号 ID：${account.id}`);
  console.log(`平台：${account.platform}`);
  console.log(`采集策略：${account.fetch_strategy}`);
  console.log(`采集凭据引用：${account.credential_ref ? '已绑定' : '未绑定'}`);
  console.log(`最近采集时间：${account.last_fetched_at || '暂无'}`);

  const job = await readLatestJob(db);
  if (!job) throw new Error('未找到该账号的采集任务。');
  if (!['success', 'failed'].includes(String(job.status))) throw new Error('最新采集任务尚未结束。');
  if (!job.finished_at) throw new Error('最新采集任务缺少结束时间。');
  if (!isSafeErrorText(job.last_error)) throw new Error('最新采集任务错误摘要包含敏感内容。');
  console.log(`最新任务 ID：${job.id}`);
  console.log(`任务账号 ID：${job.account_id}`);
  console.log(`任务平台：${job.platform}`);
  console.log(`任务策略：${job.strategy}`);
  console.log(`任务状态：${job.status}`);
  console.log(`任务开始时间：${job.started_at || '暂无'}`);
  console.log(`任务结束时间：${job.finished_at || '暂无'}`);
  console.log(`错误摘要：${job.last_error ? '已记录安全摘要' : '无'}`);

  const snapshot = await readLatestSnapshot(db);
  const diagnostics = readDiagnostics(snapshot?.raw_json);
  if (diagnostics.length > 0) {
    console.log(`诊断摘要数量：${diagnostics.length}`);
    for (const item of diagnostics.slice(0, 6)) {
      console.log(`诊断：${item.message || item.type}，数量：${item.count ?? '无'}`);
    }
    printContentEntryDiagnosticSummary(diagnostics);
    printApiDiagnosticSummary(diagnostics);
    printCandidateIdDiagnosticSummary(diagnostics);
    printOfficialExportSummary(diagnostics);
  }

  if (job.status === 'success') {
    if (!snapshot) throw new Error('采集成功但未找到快照数据。');
    if (snapshot.video_count == null && snapshot.works_count == null) throw new Error('最新快照缺少作品数量字段。');
    if (!account.last_fetched_at) throw new Error('采集成功但账号最近采集时间未更新。');
    const videos = await readVideos(db, snapshot.id);
    const duplicateGroups = await readDuplicateGroups(db, snapshot.id);
    if (duplicateGroups.length > 0) throw new Error('发现重复视频写入分组。');
    console.log(`最新快照 ID：${snapshot.id}`);
    console.log(`快照日期：${snapshot.snapshot_date}`);
    console.log(`粉丝数：${snapshot.followers ?? '暂无'}`);
    console.log(`总获赞：${snapshot.likes_total ?? '暂无'}`);
    console.log(`视频数：${snapshot.video_count ?? '暂无'}`);
    console.log(`作品数：${snapshot.works_count ?? '暂无'}`);
    console.log(`采集时间：${snapshot.fetched_at || '暂无'}`);
    console.log(`写入视频数量：${videos.length}`);

    if (videos.length === 0) {
      console.log(`视频为空原因：${emptyVideoReason(diagnostics)}`);
      console.log('重复视频分组数量：0');
    } else {
    for (const video of videos) {
        if (!video.external_video_id && !video.internal_video_key) throw new Error('视频缺少外部标识和内部资产键。');
        assertMetricFields(video);
      }
      console.log('视频资产标识验证：已通过');
      console.log('重复视频分组数量：0');
      console.log('最近 3 条视频摘要：');
      for (const video of videos.slice(0, 3)) {
        console.log(`视频：${video.title || '暂无标题'}；发布时间：${video.publish_time || '暂无'}；指标：${video.likes != null || video.comments != null || video.shares != null || video.collects != null || video.views != null ? '已读取部分指标' : '暂无可确认指标'}`);
      }
    }
  } else {
    if (!job.last_error) throw new Error('采集失败但未记录安全错误摘要。');
    if (String(job.last_error).includes('登录凭据已失效')) {
      const credential = await db.execute({
        sql: 'SELECT status FROM social_credentials WHERE credential_ref = ? ORDER BY updated_at DESC LIMIT 1',
        args: [String(account.credential_ref || '')],
      });
      if (credential.rows[0]?.status !== 'expired') throw new Error('登录凭据失效但凭据状态未标记为失效。');
      console.log('凭据失效处理：已标记为失效。');
    } else {
      console.log('采集失败原因不是凭据失效，凭据状态不应被误标记。');
    }
    console.log('本次失败未写入伪造快照或伪造视频。');
  }
  await db.close?.();

  const token = await login();
  const accountPayload = await apiRequest('GET', `/accounts/${accountId}`, token);
  if (accountPayload.payload?.data?.account && !('latestSnapshot' in accountPayload.payload.data.account)) {
    throw new Error('账号详情未返回最新快照摘要。');
  }
  await apiRequest('GET', `/accounts/${accountId}/snapshots`, token);
  await apiRequest('GET', `/accounts/${accountId}/videos`, token);
  await apiRequest('GET', `/accounts/${accountId}/credentials`, token);
  await apiRequest('GET', '/jobs', token);
  console.log('短视频真实采集结果验证通过。');
}

main().catch((error) => {
  console.error('短视频真实采集结果验证失败：', error.message);
  process.exit(1);
});
