import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { scrapeDouyinProfile, parseDouyinNumber, closeBrowser } from '../services/douyin';
import { db } from '../database/db';

const router = express.Router();

// GET /api/douyin/accounts - 获取已添加的账号列表
router.get('/accounts', authenticate, async (req, res) => {
  try {
    const result = await db.execute(`SELECT * FROM douyin_accounts ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: '获取账号列表失败', error: (error as Error).message });
  }
});

// POST /api/douyin/accounts - 添加抖音账号
router.post('/accounts', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { name, profileUrl } = req.body;
    if (!name || !profileUrl) {
      return res.status(400).json({ message: '账号名称和主页链接不能为空' });
    }
    const result = await db.execute({
      sql: `INSERT INTO douyin_accounts (name, profile_url) VALUES (?, ?)`,
      args: [name, profileUrl],
    });
    res.json({ message: '账号添加成功', id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ message: '添加账号失败', error: (error as Error).message });
  }
});

// DELETE /api/douyin/accounts/:id - 删除账号
router.delete('/accounts/:id', authenticate, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute({ sql: `DELETE FROM douyin_videos WHERE snapshot_id IN (SELECT id FROM douyin_snapshots WHERE account_id = ?)`, args: [id] });
    await db.execute({ sql: `DELETE FROM douyin_snapshots WHERE account_id = ?`, args: [id] });
    await db.execute({ sql: `DELETE FROM douyin_accounts WHERE id = ?`, args: [id] });
    res.json({ message: '账号删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除账号失败', error: (error as Error).message });
  }
});

// POST /api/douyin/scrape/:accountId - 抓取指定账号数据
router.post('/scrape/:accountId', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { accountId } = req.params;

    const accountResult = await db.execute({
      sql: `SELECT * FROM douyin_accounts WHERE id = ?`,
      args: [accountId],
    });
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: '账号不存在' });
    }
    const account = accountResult.rows[0];

    const profile = await scrapeDouyinProfile(String(account.profile_url));

    // 保存快照
    const snapshotResult = await db.execute({
      sql: `INSERT INTO douyin_snapshots (account_id, username, followers, likes, following_count, ip_location, bio, video_count, raw_data, scraped_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        accountId,
        profile.username,
        parseDouyinNumber(profile.followers),
        parseDouyinNumber(profile.likes),
        parseDouyinNumber(profile.following),
        profile.ipLocation,
        profile.bio,
        profile.videos.length,
        JSON.stringify(profile),
        profile.scrapedAt,
      ],
    });

    const snapshotId = Number(snapshotResult.lastInsertRowid);

    // 保存视频数据
    for (const video of profile.videos) {
      await db.execute({
        sql: `INSERT INTO douyin_videos (snapshot_id, title, likes, is_pinned) VALUES (?, ?, ?, ?)`,
        args: [snapshotId, video.title, parseDouyinNumber(video.likes), video.isPinned ? 1 : 0],
      });
    }

    res.json({ message: '抓取成功', snapshot: { id: snapshotId, ...profile } });
  } catch (error) {
    console.error('[Douyin] 抓取失败:', error);
    res.status(500).json({ message: '抓取失败', error: (error as Error).message });
  }
});

// GET /api/douyin/snapshots/:accountId - 获取某账号的历史快照
router.get('/snapshots/:accountId', authenticate, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 30 } = req.query;

    const snapshots = await db.execute({
      sql: `SELECT * FROM douyin_snapshots WHERE account_id = ? ORDER BY scraped_at DESC LIMIT ?`,
      args: [accountId, parseInt(limit as string)],
    });

    res.json(snapshots.rows);
  } catch (error) {
    res.status(500).json({ message: '获取快照失败', error: (error as Error).message });
  }
});

// GET /api/douyin/snapshot/:snapshotId/videos - 获取某次快照的视频列表
router.get('/snapshot/:snapshotId/videos', authenticate, async (req, res) => {
  try {
    const { snapshotId } = req.params;

    const videos = await db.execute({
      sql: `SELECT * FROM douyin_videos WHERE snapshot_id = ? ORDER BY is_pinned DESC, likes DESC`,
      args: [snapshotId],
    });

    res.json(videos.rows);
  } catch (error) {
    res.status(500).json({ message: '获取视频列表失败', error: (error as Error).message });
  }
});

// GET /api/douyin/trend/:accountId - 获取涨粉趋势数据
router.get('/trend/:accountId', authenticate, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { days = 30 } = req.query;

    const trend = await db.execute({
      sql: `SELECT followers, likes, video_count, scraped_at 
            FROM douyin_snapshots 
            WHERE account_id = ? AND scraped_at >= datetime('now', ?)
            ORDER BY scraped_at ASC`,
      args: [accountId, `-${parseInt(days as string)} days`],
    });

    res.json(trend.rows);
  } catch (error) {
    res.status(500).json({ message: '获取趋势数据失败', error: (error as Error).message });
  }
});

// POST /api/douyin/close-browser - 关闭浏览器实例（释放资源）
router.post('/close-browser', authenticate, requireRole(['admin']), async (req, res) => {
  try {
    await closeBrowser();
    res.json({ message: '浏览器已关闭' });
  } catch (error) {
    res.status(500).json({ message: '关闭浏览器失败', error: (error as Error).message });
  }
});

export default router;
