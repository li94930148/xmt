import express from 'express';
import { queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { canAccessTopic, canManageCalendarEvent, getTopicScopeById, isPrivilegedUser } from '../utils/access';

const router = express.Router();
type CalendarListItem = { event_date: string };

router.get('/', authenticate, async (req, res) => {
  try {
    const { year, month } = req.query;

    let eventDateFilter = '';
    const eventParams: string[] = [];

    if (year && month) {
      eventDateFilter = `AND strftime('%Y', ce.event_date) = ? AND strftime('%m', ce.event_date) = ?`;
      eventParams.push(String(year), String(month).padStart(2, '0'));
    } else if (year) {
      eventDateFilter = `AND strftime('%Y', ce.event_date) = ?`;
      eventParams.push(String(year));
    }

    if (!isPrivilegedUser(req.user)) {
      eventDateFilter += ` AND ce.creator_id = ?`;
      eventParams.push(String(req.user?.id));
    }

    const events = await queryAll<CalendarListItem>(`
      SELECT ce.*, u.name as creator_name, 'event' as source_type
      FROM calendar_events ce
      LEFT JOIN users u ON ce.creator_id = u.id
      WHERE 1=1 ${eventDateFilter}
      ORDER BY ce.event_date ASC
    `, eventParams);

    let topicsQuery = `
      SELECT
        t.id,
        t.title,
        t.description,
        t.deadline as event_date,
        t.platform as event_type,
        t.creator_id,
        u.name as creator_name,
        t.status,
        'topic' as source_type
      FROM topics t
      LEFT JOIN users u ON t.creator_id = u.id
      WHERE t.deadline IS NOT NULL AND t.deadline != ''
    `;

    const topicParams: string[] = [];
    if (year && month) {
      topicsQuery += ` AND strftime('%Y', t.deadline) = ? AND strftime('%m', t.deadline) = ?`;
      topicParams.push(String(year), String(month).padStart(2, '0'));
    } else if (year) {
      topicsQuery += ` AND strftime('%Y', t.deadline) = ?`;
      topicParams.push(String(year));
    }

    if (!isPrivilegedUser(req.user)) {
      topicsQuery += ` AND (t.creator_id = ? OR t.assignee_id = ?)`;
      topicParams.push(String(req.user?.id), String(req.user?.id));
    }

    topicsQuery += ` ORDER BY t.deadline ASC`;
    const topics = await queryAll<CalendarListItem>(topicsQuery, topicParams);

    const allEvents = [...events, ...topics].sort((a: CalendarListItem, b: CalendarListItem) => {
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    });

    res.json({ data: allEvents });
  } catch (error) {
    res.status(500).json({ message: '获取日历事件失败', error });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, event_date, event_type, topic_id } = req.body;
    const userId = req.user?.id;

    if (!title || !event_date) {
      return res.status(400).json({ message: '标题和日期不能为空' });
    }

    if (topic_id) {
      const topic = await getTopicScopeById(topic_id);
      if (!topic) {
        return res.status(404).json({ message: '关联选题不存在' });
      }
      if (!canAccessTopic(req.user, topic)) {
        return res.status(403).json({ message: '无权限为该选题创建日历事件' });
      }
    }

    const eventId = await executeInsert(
      `INSERT INTO calendar_events (title, description, event_date, event_type, topic_id, creator_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description, event_date, event_type || 'other', topic_id, userId]
    );

    res.json({ message: '日历事件创建成功', id: eventId });
  } catch (error) {
    res.status(500).json({ message: '创建日历事件失败', error });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, event_date, event_type } = req.body;

    const event = await queryOne(`SELECT * FROM calendar_events WHERE id = ?`, [id]);
    if (!event) {
      return res.status(404).json({ message: '日历事件不存在' });
    }
    if (!canManageCalendarEvent(req.user, event as Record<string, unknown>)) {
      return res.status(403).json({ message: '无权限更新该日历事件' });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (event_date !== undefined) { updates.push('event_date = ?'); params.push(event_date); }
    if (event_type !== undefined) { updates.push('event_type = ?'); params.push(event_type); }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    params.push(id);
    await execute(`UPDATE calendar_events SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: '日历事件更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新日历事件失败', error });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const event = await queryOne(`SELECT * FROM calendar_events WHERE id = ?`, [id]);
    if (!event) {
      return res.status(404).json({ message: '日历事件不存在' });
    }
    if (!canManageCalendarEvent(req.user, event as Record<string, unknown>)) {
      return res.status(403).json({ message: '无权限删除该日历事件' });
    }

    await execute(`DELETE FROM calendar_events WHERE id = ?`, [id]);

    res.json({ message: '日历事件删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除日历事件失败', error });
  }
});

export default router;
