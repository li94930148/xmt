import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { queryAll, execute } from '../database/utils';

const router = Router();

function boundedString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

// Registration prepares a device for a future push provider. No token is logged
// and no notification is sent from this endpoint.
router.post('/mobile-devices', authenticate, async (req, res) => {
  const platform = boundedString(req.body?.platform, 16);
  const deviceId = boundedString(req.body?.deviceId, 128);
  const pushToken = boundedString(req.body?.pushToken, 4096) || null;
  const appVersion = boundedString(req.body?.appVersion, 64) || null;
  if (platform !== 'android' || !deviceId) return res.status(400).json({ message: 'Android 设备标识不合法' });
  try {
    await execute(`
      INSERT INTO mobile_devices (user_id, platform, device_id, push_token, app_version, last_seen_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT(user_id, platform, device_id) DO UPDATE SET
        push_token = excluded.push_token, app_version = excluded.app_version,
        last_seen_at = CURRENT_TIMESTAMP, revoked_at = NULL
    `, [req.user!.id, platform, deviceId, pushToken, appVersion]);
    return res.status(204).end();
  } catch { return res.status(500).json({ message: '移动设备登记失败' }); }
});

router.delete('/mobile-devices/:deviceId', authenticate, async (req, res) => {
  const deviceId = boundedString(req.params.deviceId, 128);
  if (!deviceId) return res.status(400).json({ message: 'Android 设备标识不合法' });
  try {
    await execute('UPDATE mobile_devices SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND platform = ? AND device_id = ?', [req.user!.id, 'android', deviceId]);
    return res.status(204).end();
  } catch { return res.status(500).json({ message: '移动设备注销失败' }); }
});

// 获取当前用户的通知偏好
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;

    const preferences = await queryAll(`
      SELECT * FROM notification_preferences
      WHERE user_id = ?
      ORDER BY channel, event_type
    `, [userId]);

    res.json(preferences);
  } catch (error) {
    res.status(500).json({ message: '获取通知偏好失败', error });
  }
});

// 更新通知偏好
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { preferences } = req.body;

    if (!preferences || !Array.isArray(preferences)) {
      return res.status(400).json({ message: '请提供偏好设置列表' });
    }

    // 清除旧偏好
    await execute(`DELETE FROM notification_preferences WHERE user_id = ?`, [userId]);

    // 插入新偏好
    for (const pref of preferences) {
      await execute(
        `INSERT INTO notification_preferences (user_id, channel, event_type, enabled, config) VALUES (?, ?, ?, ?, ?)`,
        [userId, pref.channel, pref.event_type, pref.enabled ? 1 : 0, pref.config || null]
      );
    }

    res.json({ message: '通知偏好更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新通知偏好失败', error });
  }
});

// 获取支持的通知渠道
router.get('/channels', authenticate, async (req, res) => {
  res.json([
    { id: 'web', name: '站内通知', description: '通过站内消息中心接收通知' },
    { id: 'email', name: '邮件通知', description: '通过邮件接收通知（需配置邮箱）' },
    { id: 'webhook', name: 'Webhook', description: '通过 HTTP 回调接收通知' },
    { id: 'android_push', name: 'Android 推送', description: '需要管理员启用推送提供方并配置 Firebase。' },
  ]);
});

// 获取支持的事件类型
router.get('/events', authenticate, async (req, res) => {
  res.json([
    { id: 'topic_created', name: '选题创建', description: '有新选题被创建时通知' },
    { id: 'topic_audited', name: '选题审核', description: '选题被审核时通知' },
    { id: 'topic_assigned', name: '任务指派', description: '被指派为选题负责人时通知' },
    { id: 'status_changed', name: '状态变更', description: '选题状态发生变化时通知' },
    { id: 'comment_added', name: '新评论', description: '有新评论时通知' },
    { id: 'deadline_approaching', name: '截止日期提醒', description: '选题截止日期临近时通知' },
  ]);
});

export default router;
