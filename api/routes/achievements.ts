import express from 'express';
import { queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { createMessage } from '../utils/messageHelper';

const router = express.Router();

// GET / - 获取所有成就定义（支持分类筛选）
router.get('/', authenticate, async (req, res) => {
  try {
    const { category, rarity } = req.query;
    let sql = `SELECT * FROM achievements WHERE 1=1`;
    const params: any[] = [];

    if (category && category !== 'all') {
      sql += ` AND category = ?`;
      params.push(category);
    }
    if (rarity && rarity !== 'all') {
      sql += ` AND rarity = ?`;
      params.push(rarity);
    }
    sql += ` ORDER BY sort_order ASC, id ASC`;

    const achievements = await queryAll(sql, params);
    res.json({ data: achievements });
  } catch (error) {
    res.status(500).json({ message: '获取成就列表失败', error });
  }
});

// GET /me - 获取当前用户的成就（包含已获得的 earned_at 和进度）
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;

    const achievements = await queryAll(`
      SELECT a.*,
        CASE WHEN ua.id IS NOT NULL THEN 1 ELSE 0 END as earned,
        ua.earned_at
      FROM achievements a
      LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
      ORDER BY earned DESC, a.sort_order ASC, a.id ASC
    `, [userId]);

    res.json({ data: achievements });
  } catch (error) {
    res.status(500).json({ message: '获取用户成就失败', error });
  }
});

// GET /progress - 获取当前用户每个成就的进度
router.get('/progress', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const achievements = await queryAll(`SELECT * FROM achievements ORDER BY id ASC`);
    const progress: Record<number, { current: number; target: number; percentage: number }> = {};

    for (const a of achievements) {
      let current = 0;
      switch (a.condition_type) {
        case 'topic_count': {
          const r: any = await queryOne(`SELECT COUNT(*) as count FROM topics WHERE creator_id = ?`, [userId]);
          current = r?.count || 0;
          break;
        }
        case 'completed_topics': {
          const r: any = await queryOne(`SELECT COUNT(*) as count FROM topics WHERE creator_id = ? AND status = 'completed'`, [userId]);
          current = r?.count || 0;
          break;
        }
        case 'pomodoro_count': {
          const r: any = await queryOne(`SELECT COUNT(*) as count FROM pomodoro_sessions WHERE user_id = ? AND completed = 1`, [userId]);
          current = r?.count || 0;
          break;
        }
        case 'pomodoro_hours': {
          const r: any = await queryOne(`SELECT COALESCE(SUM(duration), 0) as total FROM pomodoro_sessions WHERE user_id = ? AND completed = 1`, [userId]);
          current = r?.total || 0;
          break;
        }
        case 'inspiration_count': {
          const r: any = await queryOne(`SELECT COUNT(*) as count FROM inspirations WHERE creator_id = ?`, [userId]);
          current = r?.count || 0;
          break;
        }
        case 'login_streak': {
          const r: any = await queryOne(
            `SELECT COUNT(DISTINCT DATE(created_at)) as days FROM activity_log WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' days')`,
            [userId, a.condition_value]
          );
          current = r?.days || 0;
          break;
        }
        case 'publish_count': {
          const r: any = await queryOne(`SELECT COUNT(*) as count FROM publishing WHERE operator_id = ?`, [userId]);
          current = r?.count || 0;
          break;
        }
        case 'total_views': {
          const r: any = await queryOne(
            `SELECT COALESCE(SUM(p.views), 0) as total FROM publishing p WHERE p.operator_id = ?`,
            [userId]
          );
          current = r?.total || 0;
          break;
        }
        case 'total_likes': {
          const r: any = await queryOne(
            `SELECT COALESCE(SUM(p.likes), 0) as total FROM publishing p WHERE p.operator_id = ?`,
            [userId]
          );
          current = r?.total || 0;
          break;
        }
      }

      const target = Number(a.condition_value) || 1;
      progress[Number(a.id)] = {
        current,
        target,
        percentage: Math.min(100, Math.round((current / target) * 100)),
      };
    }

    res.json({ data: progress });
  } catch (error) {
    res.status(500).json({ message: '获取成就进度失败', error });
  }
});

// GET /stats - 获取当前用户的成就统计
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;

    const totalResult = await queryOne(`SELECT COUNT(*) as count FROM achievements`);
    const total = totalResult?.count || 0;
    const earnedResult = await queryOne(`SELECT COUNT(*) as count FROM user_achievements WHERE user_id = ?`, [userId]);
    const earned = earnedResult?.count || 0;
    const pointsResult = await queryOne(`
      SELECT COALESCE(SUM(a.points), 0) as total 
      FROM user_achievements ua 
      JOIN achievements a ON a.id = ua.achievement_id 
      WHERE ua.user_id = ?
    `, [userId]);
    const totalPoints = pointsResult?.total || 0;

    // 按分类统计
    const byCategory = await queryAll(`
      SELECT a.category, 
        COUNT(*) as total,
        SUM(CASE WHEN ua.id IS NOT NULL THEN 1 ELSE 0 END) as earned
      FROM achievements a
      LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
      GROUP BY a.category
    `, [userId]);

    // 按稀有度统计
    const byRarity = await queryAll(`
      SELECT a.rarity,
        COUNT(*) as total,
        SUM(CASE WHEN ua.id IS NOT NULL THEN 1 ELSE 0 END) as earned
      FROM achievements a
      LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
      GROUP BY a.rarity
    `, [userId]);

    res.json({
      data: { total, earned, totalPoints, byCategory, byRarity }
    });
  } catch (error) {
    res.status(500).json({ message: '获取成就统计失败', error });
  }
});

// GET /leaderboard - 成就积分排行榜
router.get('/leaderboard', authenticate, async (req, res) => {
  try {
    const leaderboard = await queryAll(`
      SELECT 
        u.id as user_id,
        u.name as user_name,
        u.avatar,
        COUNT(ua.id) as achievement_count,
        COALESCE(SUM(a.points), 0) as total_points
      FROM users u
      LEFT JOIN user_achievements ua ON ua.user_id = u.id
      LEFT JOIN achievements a ON a.id = ua.achievement_id
      WHERE u.enabled = 1
      GROUP BY u.id
      ORDER BY total_points DESC, achievement_count DESC
      LIMIT 20
    `);

    res.json({ data: leaderboard });
  } catch (error) {
    res.status(500).json({ message: '获取排行榜失败', error });
  }
});

// GET /recent - 最近获得的成就（全团队）
router.get('/recent', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const recent = await queryAll(`
      SELECT ua.*, u.name as user_name, a.name as achievement_name, a.icon, a.points, a.rarity
      FROM user_achievements ua
      JOIN users u ON u.id = ua.user_id
      JOIN achievements a ON a.id = ua.achievement_id
      ORDER BY ua.earned_at DESC
      LIMIT ?
    `, [limit]);

    res.json({ data: recent });
  } catch (error) {
    res.status(500).json({ message: '获取最近成就失败', error });
  }
});

// POST / - 创建成就定义（管理员）
router.post('/', authenticate, requirePermission('system:achievement'), async (req, res) => {
  try {
    const { name, description, icon, condition_type, condition_value, points, category, rarity, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({ message: '成就名称不能为空' });
    }

    const achievementId = await executeInsert(
      `INSERT INTO achievements (name, description, icon, condition_type, condition_value, points, category, rarity, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description, icon || '🏆', condition_type, condition_value || 0, points || 10, category || 'milestone', rarity || 'common', sort_order || 0]
    );

    res.json({ message: '成就创建成功', id: achievementId });
  } catch (error) {
    res.status(500).json({ message: '创建成就失败', error });
  }
});

// PUT /:id - 更新成就定义（管理员）
router.put('/:id', authenticate, requirePermission('system:achievement'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, condition_type, condition_value, points, category, rarity, sort_order } = req.body;

    const existing = await queryOne(`SELECT * FROM achievements WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ message: '成就不存在' });
    }

    await execute(
      `UPDATE achievements SET name = ?, description = ?, icon = ?, condition_type = ?, condition_value = ?, points = ?, category = ?, rarity = ?, sort_order = ? WHERE id = ?`,
      [name || existing.name, description ?? existing.description, icon || existing.icon,
       condition_type || existing.condition_type, condition_value ?? existing.condition_value,
       points ?? existing.points, category || existing.category, rarity || existing.rarity,
       sort_order ?? existing.sort_order, id]
    );

    res.json({ message: '成就更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新成就失败', error });
  }
});

// DELETE /:id - 删除成就（管理员）
router.delete('/:id', authenticate, requirePermission('system:achievement'), async (req, res) => {
  try {
    const { id } = req.params;
    await execute(`DELETE FROM user_achievements WHERE achievement_id = ?`, [id]);
    await execute(`DELETE FROM achievements WHERE id = ?`, [id]);
    res.json({ message: '成就删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除成就失败', error });
  }
});

// POST /check - 检查并授予当前用户成就
router.post('/check', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const newAchievements: any[] = [];

    // 获取所有成就定义
    const achievements = await queryAll(`SELECT * FROM achievements`);

    for (const rawAchievement of achievements) {
      const achievement = rawAchievement as Record<string, unknown>;
      const conditionValue = Number(achievement.condition_value) || 0;
      const conditionType = String(achievement.condition_type || '');
      // 检查用户是否已获得该成就
      const existing = await queryOne(
        `SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?`,
        [userId, achievement.id]
      );

      if (existing) return; // 已获得，跳过

      let earned = false;

      // 根据 condition_type 判断是否满足条件
      switch (conditionType) {
        case 'topic_count': {
          const result: any = await queryOne(`SELECT COUNT(*) as count FROM topics WHERE creator_id = ?`, [userId]);
          earned = (result?.count || 0) >= conditionValue;
          break;
        }
        case 'completed_topics': {
          const result: any = await queryOne(`SELECT COUNT(*) as count FROM topics WHERE creator_id = ? AND status = 'completed'`, [userId]);
          earned = (result?.count || 0) >= conditionValue;
          break;
        }
        case 'pomodoro_count': {
          const result: any = await queryOne(`SELECT COUNT(*) as count FROM pomodoro_sessions WHERE user_id = ? AND completed = 1`, [userId]);
          earned = (result?.count || 0) >= conditionValue;
          break;
        }
        case 'pomodoro_hours': {
          const result: any = await queryOne(`SELECT COALESCE(SUM(duration), 0) as total FROM pomodoro_sessions WHERE user_id = ? AND completed = 1`, [userId]);
          earned = (result?.total || 0) >= conditionValue;
          break;
        }
        case 'inspiration_count': {
          const result: any = await queryOne(`SELECT COUNT(*) as count FROM inspirations WHERE creator_id = ?`, [userId]);
          earned = (result?.count || 0) >= conditionValue;
          break;
        }
        case 'login_streak': {
          const result: any = await queryOne(
            `SELECT COUNT(DISTINCT DATE(created_at)) as days FROM activity_log WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' days')`,
            [userId, conditionValue]
          );
          earned = (result?.days || 0) >= conditionValue;
          break;
        }
        case 'publish_count': {
          const result: any = await queryOne(`SELECT COUNT(*) as count FROM publishing WHERE operator_id = ?`, [userId]);
          earned = (result?.count || 0) >= conditionValue;
          break;
        }
        case 'total_views': {
          const result: any = await queryOne(`SELECT COALESCE(SUM(views), 0) as total FROM publishing WHERE operator_id = ?`, [userId]);
          earned = (result?.total || 0) >= conditionValue;
          break;
        }
        case 'total_likes': {
          const result: any = await queryOne(`SELECT COALESCE(SUM(likes), 0) as total FROM publishing WHERE operator_id = ?`, [userId]);
          earned = (result?.total || 0) >= conditionValue;
          break;
        }
        default:
          break;
      }

      if (earned) {
        // 授予成就
        await execute(
          `INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)`,
          [userId, achievement.id]
        );
        newAchievements.push(achievement);

        // 发送通知
        createMessage(
          userId!,
          '🏆 获得新成就',
          `恭喜获得成就「${achievement.name}」！${achievement.description || ''}（+${achievement.points || 0}积分）`,
          'success'
        );
      }
    }

    res.json({
      message: newAchievements.length > 0 ? `获得 ${newAchievements.length} 个新成就` : '暂无新成就',
      newAchievements
    });
  } catch (error) {
    res.status(500).json({ message: '检查成就失败', error });
  }
});

// POST /seed - 初始化预设成就（管理员）
router.post('/seed', authenticate, requirePermission('system:achievement'), async (req, res) => {
  try {
    const existing: any = await queryOne(`SELECT COUNT(*) as count FROM achievements`);
    if (existing && existing.count > 0) {
      return res.json({ message: '成就数据已存在，跳过初始化' });
    }

    const seeds = [
      // 创作达人
      { name: '初出茅庐', description: '创建第一个选题', icon: '🎬', condition_type: 'topic_count', condition_value: 1, points: 10, category: 'production', rarity: 'common', sort_order: 1 },
      { name: '选题新手', description: '累计创建5个选题', icon: '📝', condition_type: 'topic_count', condition_value: 5, points: 20, category: 'production', rarity: 'common', sort_order: 2 },
      { name: '选题达人', description: '累计创建20个选题', icon: '📋', condition_type: 'topic_count', condition_value: 20, points: 50, category: 'production', rarity: 'rare', sort_order: 3 },
      { name: '选题大师', description: '累计创建50个选题', icon: '🏅', condition_type: 'topic_count', condition_value: 50, points: 100, category: 'production', rarity: 'epic', sort_order: 4 },
      { name: '选题传奇', description: '累计创建100个选题', icon: '👑', condition_type: 'topic_count', condition_value: 100, points: 200, category: 'production', rarity: 'legendary', sort_order: 5 },

      // 完成里程碑
      { name: '初次完成', description: '完成第一个选题', icon: '✅', condition_type: 'completed_topics', condition_value: 1, points: 15, category: 'milestone', rarity: 'common', sort_order: 10 },
      { name: '小有成就', description: '完成10个选题', icon: '🎯', condition_type: 'completed_topics', condition_value: 10, points: 50, category: 'milestone', rarity: 'rare', sort_order: 11 },
      { name: '内容收割机', description: '完成50个选题', icon: '🔥', condition_type: 'completed_topics', condition_value: 50, points: 150, category: 'milestone', rarity: 'epic', sort_order: 12 },

      // 效率之星
      { name: '番茄入门', description: '完成第一个番茄钟', icon: '🍅', condition_type: 'pomodoro_count', condition_value: 1, points: 10, category: 'efficiency', rarity: 'common', sort_order: 20 },
      { name: '专注达人', description: '完成50个番茄钟', icon: '⏰', condition_type: 'pomodoro_count', condition_value: 50, points: 50, category: 'efficiency', rarity: 'rare', sort_order: 21 },
      { name: '时间管理大师', description: '完成200个番茄钟', icon: '⏳', condition_type: 'pomodoro_count', condition_value: 200, points: 150, category: 'efficiency', rarity: 'epic', sort_order: 22 },
      { name: '深度工作', description: '累计专注1000分钟', icon: '🧠', condition_type: 'pomodoro_hours', condition_value: 1000, points: 100, category: 'efficiency', rarity: 'rare', sort_order: 23 },

      // 社交达人
      { name: '灵感闪现', description: '创建第一个灵感', icon: '💡', condition_type: 'inspiration_count', condition_value: 1, points: 10, category: 'social', rarity: 'common', sort_order: 30 },
      { name: '创意源泉', description: '创建10个灵感', icon: '🌟', condition_type: 'inspiration_count', condition_value: 10, points: 40, category: 'social', rarity: 'rare', sort_order: 31 },

      // 发布里程碑
      { name: '首次发布', description: '发布第一个内容', icon: '🚀', condition_type: 'publish_count', condition_value: 1, points: 15, category: 'milestone', rarity: 'common', sort_order: 40 },
      { name: '发布达人', description: '发布10个内容', icon: '📺', condition_type: 'publish_count', condition_value: 10, points: 50, category: 'milestone', rarity: 'rare', sort_order: 41 },
      { name: '万人迷', description: '总播放量达到10000', icon: '👁️', condition_type: 'total_views', condition_value: 10000, points: 80, category: 'milestone', rarity: 'rare', sort_order: 42 },
      { name: '百万博主', description: '总播放量达到1000000', icon: '💎', condition_type: 'total_views', condition_value: 1000000, points: 300, category: 'milestone', rarity: 'legendary', sort_order: 43 },
      { name: '点赞收割机', description: '总点赞量达到10000', icon: '❤️', condition_type: 'total_likes', condition_value: 10000, points: 100, category: 'milestone', rarity: 'epic', sort_order: 44 },

      // 特殊成就
      { name: '坚持不懈', description: '连续登录7天', icon: '📅', condition_type: 'login_streak', condition_value: 7, points: 30, category: 'special', rarity: 'common', sort_order: 50 },
      { name: '铁杆用户', description: '连续登录30天', icon: '💪', condition_type: 'login_streak', condition_value: 30, points: 100, category: 'special', rarity: 'epic', sort_order: 51 },
    ];

    for (const s of seeds) {
      await execute(
        `INSERT INTO achievements (name, description, icon, condition_type, condition_value, points, category, rarity, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.name, s.description, s.icon, s.condition_type, s.condition_value, s.points, s.category, s.rarity, s.sort_order]
      );
    }

    res.json({ message: `成功初始化 ${seeds.length} 个成就` });
  } catch (error) {
    res.status(500).json({ message: '初始化成就失败', error });
  }
});

export default router;
