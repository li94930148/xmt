import express from 'express';
import { queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// GET / - 获取日历事件（支持月份筛选 year, month），同时合并 topics 的 deadline 作为事件返回
router.get('/', authenticate, async (req, res) => {
  try {
    const { year, month } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (year && month) {
      dateFilter = `AND strftime('%Y', event_date) = ? AND strftime('%m', event_date) = ?`;
      params.push(year as string, (month as string).padStart(2, '0'));
    } else if (year) {
      dateFilter = `AND strftime('%Y', event_date) = ?`;
      params.push(year as string);
    }

    const events = await queryAll(`
      SELECT ce.*, u.name as creator_name, 'event' as source_type
      FROM calendar_events ce
      LEFT JOIN users u ON ce.creator_id = u.id
      WHERE 1=1 ${dateFilter}
      ORDER BY ce.event_date ASC
    `, params);

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
      WHERE t.deadline IS NOT NULL AND t.deadline != '
    `;

    const topicParams: any[] = [];
    if (year && month) {
      topicsQuery += ` AND strftime('%Y', t.deadline) = ? AND strftime('%m', t.deadline) = ?`;
      topicParams.push(year as string, (month as string).padStart(2, '0'));
    } else if (year) {
      topicsQuery += ` AND strftime('%Y', t.deadline) = ?`;
      topicParams.push(year as string);
    }

    topicsQuery += ` ORDER BY t.deadline ASC`;
    const topics = await queryAll(topicsQuery, topicParams);

    const allEvents = [...events, ...topics].sort((a: any, b: any) => {
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    });

    res.json({ data: allEvents });
  } catch (error) {
    res.status(500).json({ message: '获取日历事件失败', error });
  }
});

// POST / - 创建日历事件
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, event_date, event_type, topic_id } = req.body;
    const userId = req.user?.id;

    if (!title || !event_date) {
      return res.status(400).json({ message: '标题和日期不能为空' });
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

// PUT /:id - 更新事件
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, event_date, event_type } = req.body;

    const event = await queryOne(`SELECT * FROM calendar_events WHERE id = ?`, [id]);
    if (!event) {
      return res.status(404).json({ message: '日历事件不存在' });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (title) { updates.push('title = '); params.push(title); }
    if (description !== undefined) { updates.push('description = '); params.push(description); }
    if (event_date) { updates.push('event_date = '); params.push(event_date); }
    if (event_type) { updates.push('event_type = '); params.push(event_type); }

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

// DELETE /:id - 删除事件
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const event = await queryOne(`SELECT * FROM calendar_events WHERE id = ?`, [id]);
    if (!event) {
      return res.status(404).json({ message: '日历事件不存在' });
    }

    await execute(`DELETE FROM calendar_events WHERE id = ?`, [id]);

    res.json({ message: '日历事件删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除日历事件失败', error });
  }
});

export default router;
