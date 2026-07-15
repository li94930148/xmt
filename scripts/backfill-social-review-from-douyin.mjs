import 'dotenv/config';
import { createClient } from '@libsql/client';
import path from 'path';

const args = new Set(process.argv.slice(2));
const writeMode = args.has('--write');

const dbPath = getDatabasePath();
const db = createClient({ url: `file:${dbPath}` });

const stats = {
  legacyAccounts: 0,
  accountsToCreate: 0,
  accountsToUpdate: 0,
  accountsSkipped: 0,
  legacySnapshots: 0,
  snapshotsToWrite: 0,
  snapshotsSkipped: 0,
  legacyVideos: 0,
  videosToWrite: 0,
  videosSkipped: 0,
  failedAccounts: 0,
  skipReasons: new Map(),
};

function getDatabasePath() {
  const configured = process.env.XMT_DB_PATH || process.env.DATABASE_PATH;
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }

  if (process.env.DATABASE_URL?.startsWith('file:')) {
    const configuredPath = process.env.DATABASE_URL.slice('file:'.length);
    return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath);
  }

  return path.resolve(process.cwd(), 'data', 'xmt.db');
}

function addSkip(reason) {
  stats.skipReasons.set(reason, (stats.skipReasons.get(reason) || 0) + 1);
}

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function datePart(value) {
  const normalized = text(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  const match = normalized.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || null;
}

function nowText() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function safeJson(value) {
  if (!value) return null;
  return JSON.stringify(sanitize(value));
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;

  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/(cookie|token|authorization|headers?|session|html|password|secret)/i.test(key)) continue;
    output[key] = sanitize(nested);
  }
  return output;
}

function stableAccountExternalId(account) {
  return (
    text(account.douyin_id) ||
    text(account.profile_url) ||
    (text(account.name) ? `legacy_douyin_name_${text(account.name)}` : null) ||
    `legacy_douyin_account_${account.id}`
  );
}

function extractVideoId(url) {
  const normalized = text(url);
  if (!normalized) return null;
  const videoMatch = normalized.match(/\/video\/([^/?#]+)/);
  if (videoMatch?.[1]) return videoMatch[1];
  try {
    const parsed = new URL(normalized);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts.at(-1) || null;
  } catch {
    return null;
  }
}

function parseRawSnapshot(rawData) {
  const raw = text(rawData);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function tableExists(name) {
  const result = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [name],
  });
  return result.rows.length > 0;
}

async function findSocialAccountByExternalId(externalAccountId, executor = db) {
  const result = await executor.execute({
    sql: 'SELECT * FROM social_accounts WHERE platform = ? AND external_account_id = ? LIMIT 1',
    args: ['douyin', externalAccountId],
  });
  return result.rows[0] || null;
}

async function upsertAccount(account, latestFetchedAt, executor) {
  const externalId = stableAccountExternalId(account);
  if (!externalId) {
    stats.accountsSkipped += 1;
    addSkip('账号缺少稳定标识');
    return null;
  }

  const existing = await findSocialAccountByExternalId(externalId, executor);
  const createdAt = text(account.created_at) || nowText();
  const fetchedAt = text(latestFetchedAt);

  if (!writeMode) {
    if (existing) stats.accountsToUpdate += 1;
    else stats.accountsToCreate += 1;
    return { id: existing?.id || 0, externalId };
  }

  const result = await executor.execute({
    sql: `INSERT INTO social_accounts (
      platform, external_account_id, account_name, display_name, profile_url, owner_id,
      active, fetch_strategy, remark, last_fetched_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, external_account_id) DO UPDATE SET
      account_name = excluded.account_name,
      display_name = excluded.display_name,
      profile_url = excluded.profile_url,
      fetch_strategy = excluded.fetch_strategy,
      remark = CASE
        WHEN social_accounts.remark IS NULL OR trim(social_accounts.remark) = '' THEN excluded.remark
        ELSE social_accounts.remark
      END,
      last_fetched_at = COALESCE(excluded.last_fetched_at, social_accounts.last_fetched_at),
      updated_at = excluded.updated_at
    RETURNING *`,
    args: [
      'douyin',
      externalId,
      text(account.name) || text(account.profile_url) || `抖音账号 ${account.id}`,
      text(account.name),
      text(account.profile_url),
      null,
      1,
      'native_playwright',
      '由旧抖音数据回填',
      fetchedAt,
      createdAt,
      nowText(),
    ],
  });

  if (existing) stats.accountsToUpdate += 1;
  else stats.accountsToCreate += 1;

  return { id: Number(result.rows[0].id), externalId };
}

async function upsertSnapshot(snapshot, socialAccountId, executor) {
  const snapshotDate = datePart(snapshot.scraped_at) || datePart(snapshot.created_at);
  if (!snapshotDate) {
    stats.snapshotsSkipped += 1;
    addSkip('快照缺少日期');
    return null;
  }

  stats.snapshotsToWrite += 1;
  if (!writeMode) {
    return { id: 0, legacySnapshotId: snapshot.id };
  }

  const rawSummary = {
    legacySnapshotId: snapshot.id,
    username: snapshot.username,
    ipLocation: snapshot.ip_location,
    bio: snapshot.bio,
  };

  const result = await executor.execute({
    sql: `INSERT INTO social_snapshots (
      account_id, platform, snapshot_date, followers, following_count, likes_total,
      video_count, works_count, engagement_est, source_method, source_project,
      raw_json, fetched_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, snapshot_date) DO UPDATE SET
      platform = excluded.platform,
      followers = excluded.followers,
      following_count = excluded.following_count,
      likes_total = excluded.likes_total,
      video_count = excluded.video_count,
      works_count = excluded.works_count,
      engagement_est = excluded.engagement_est,
      source_method = excluded.source_method,
      source_project = excluded.source_project,
      raw_json = excluded.raw_json,
      fetched_at = excluded.fetched_at
    RETURNING *`,
    args: [
      socialAccountId,
      'douyin',
      snapshotDate,
      number(snapshot.followers),
      number(snapshot.following_count),
      number(snapshot.likes),
      number(snapshot.video_count),
      number(snapshot.video_count),
      0,
      'backfill_douyin',
      'legacy_douyin',
      safeJson(rawSummary),
      text(snapshot.scraped_at) || text(snapshot.created_at) || nowText(),
      text(snapshot.created_at) || nowText(),
    ],
  });

  return { id: Number(result.rows[0].id), legacySnapshotId: snapshot.id };
}

async function upsertVideo(video, rawVideo, socialAccountId, socialSnapshotId, executor) {
  const videoUrl = text(rawVideo?.url);
  const externalVideoId = extractVideoId(videoUrl);
  if (!externalVideoId) {
    stats.videosSkipped += 1;
    addSkip('视频缺少稳定标识');
    return;
  }

  stats.videosToWrite += 1;
  if (!writeMode) return;

  await executor.execute({
    sql: `INSERT INTO social_videos (
      account_id, snapshot_id, platform, external_video_id, title, video_url,
      publish_time, likes, comments, shares, collects, views, raw_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, external_video_id, snapshot_id) DO UPDATE SET
      account_id = excluded.account_id,
      title = excluded.title,
      video_url = excluded.video_url,
      publish_time = excluded.publish_time,
      likes = excluded.likes,
      comments = excluded.comments,
      shares = excluded.shares,
      collects = excluded.collects,
      views = excluded.views,
      raw_json = excluded.raw_json`,
    args: [
      socialAccountId,
      socialSnapshotId,
      'douyin',
      externalVideoId,
      text(video.title),
      videoUrl,
      null,
      number(video.likes),
      number(video.comments),
      number(video.shares),
      0,
      0,
      safeJson({
        legacyVideoId: video.id,
        isPinned: video.is_pinned,
      }),
      text(video.created_at) || nowText(),
    ],
  });
}

async function loadLegacyData() {
  for (const table of ['douyin_accounts', 'douyin_snapshots', 'douyin_videos', 'social_accounts', 'social_snapshots', 'social_videos']) {
    if (!(await tableExists(table))) {
      throw new Error(`数据库缺少必要数据表：${table}`);
    }
  }

  const accounts = await db.execute('SELECT * FROM douyin_accounts ORDER BY id ASC');
  const snapshots = await db.execute('SELECT * FROM douyin_snapshots ORDER BY account_id ASC, scraped_at ASC, id ASC');
  const videos = await db.execute('SELECT * FROM douyin_videos ORDER BY snapshot_id ASC, id ASC');

  stats.legacyAccounts = accounts.rows.length;
  stats.legacySnapshots = snapshots.rows.length;
  stats.legacyVideos = videos.rows.length;

  return {
    accounts: accounts.rows,
    snapshots: snapshots.rows,
    videos: videos.rows,
  };
}

async function processAccount(account, snapshotsByAccount, videosBySnapshot) {
  const accountSnapshots = snapshotsByAccount.get(Number(account.id)) || [];
  const latestFetchedAt = accountSnapshots
    .map((snapshot) => text(snapshot.scraped_at) || text(snapshot.created_at))
    .filter(Boolean)
    .sort()
    .at(-1);

  const executor = writeMode ? await db.transaction('write') : db;
  try {
    const socialAccount = await upsertAccount(account, latestFetchedAt, executor);
    if (!socialAccount) return;

    for (const snapshot of accountSnapshots) {
      const socialSnapshot = await upsertSnapshot(snapshot, Number(socialAccount.id), executor);
      if (!socialSnapshot) continue;

      const parsedRaw = parseRawSnapshot(snapshot.raw_data);
      const rawVideos = Array.isArray(parsedRaw?.videos) ? parsedRaw.videos : [];
      const legacyVideos = videosBySnapshot.get(Number(snapshot.id)) || [];
      for (let index = 0; index < legacyVideos.length; index += 1) {
        await upsertVideo(
          legacyVideos[index],
          rawVideos[index],
          Number(socialAccount.id),
          Number(socialSnapshot.id),
          executor
        );
      }
    }

    if (writeMode) await executor.commit();
  } catch (error) {
    stats.failedAccounts += 1;
    addSkip(`账号 ${account.id} 回填失败`);
    if (writeMode) await executor.rollback();
    console.log(`账号 ${account.id} 回填失败，已跳过该账号。`);
  } finally {
    if (writeMode) executor.close();
  }
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = Number(row[key]);
    const list = map.get(value) || [];
    list.push(row);
    map.set(value, list);
  }
  return map;
}

function printSummary() {
  console.log(`读取旧抖音账号：${stats.legacyAccounts} 个`);
  console.log(`准备新增统一账号：${stats.accountsToCreate} 个`);
  console.log(`准备更新统一账号：${stats.accountsToUpdate} 个`);
  console.log(`跳过账号：${stats.accountsSkipped} 个`);
  console.log(`读取旧快照：${stats.legacySnapshots} 条`);
  console.log(`准备写入统一快照：${stats.snapshotsToWrite} 条`);
  console.log(`跳过快照：${stats.snapshotsSkipped} 条`);
  console.log(`读取旧视频：${stats.legacyVideos} 条`);
  console.log(`准备写入统一视频：${stats.videosToWrite} 条`);
  console.log(`跳过视频：${stats.videosSkipped} 条`);
  console.log(`失败账号：${stats.failedAccounts} 个`);
  if (stats.skipReasons.size > 0) {
    console.log('跳过原因摘要：');
    for (const [reason, count] of stats.skipReasons.entries()) {
      console.log(`- ${reason}：${count}`);
    }
  }
}

async function main() {
  if (writeMode) {
    console.log('当前为写入模式，将回填数据到统一短视频数据表。');
  } else {
    console.log('当前为预检查模式，不会写入数据库。');
  }

  const { accounts, snapshots, videos } = await loadLegacyData();
  const snapshotsByAccount = groupBy(snapshots, 'account_id');
  const videosBySnapshot = groupBy(videos, 'snapshot_id');

  for (const account of accounts) {
    await processAccount(account, snapshotsByAccount, videosBySnapshot);
  }

  printSummary();
  console.log(writeMode ? '写入完成。' : '预检查完成，未写入任何数据。');
}

main().catch((error) => {
  console.error('旧抖音数据回填失败：', error.message);
  process.exit(1);
});
