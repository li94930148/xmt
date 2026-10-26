import express from 'express';
import { createHash } from 'node:crypto';
import { beijingNow, queryOne, queryAll, execute, executeInsert, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { canAccessTopic, canManageCalendarEvent, getTopicScopeById, isPrivilegedUser } from '../utils/access';

const router = express.Router();
type CalendarListItem = { event_date: string };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createRequestFingerprint(payload: {
  title: unknown;
  description: unknown;
  event_date: unknown;
  event_type: unknown;
  topic_id: unknown;
}) {
  return createHash('sha256').update(JSON.stringify([
    payload.title,
    payload.description ?? null,
    payload.event_date,
    payload.event_type || 'other',
    payload.topic_id ?? null,
  ])).digest('hex');
}

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
  } catch {
    res.status(500).json({ message: '获取日历事件失败' });
  }
});

router.get('/create-request/:requestId', authenticate, async (req, res) => {
  try {
    const requestId = String(req.params.requestId || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(requestId)) return res.status(400).json({ message: '日历事件请求编号无效' });
    const request = await queryOne<{ event_id: number; creator_id: number }>(
      `SELECT event_id,creator_id FROM calendar_event_create_request_keys WHERE client_request_id=?`,
      [requestId],
    );
    if (!request || Number(request.creator_id) !== Number(req.user?.id)) {
      return res.status(404).json({ message: '尚未找到对应日历事件' });
    }
    const event = await queryOne<{ id: number }>('SELECT id FROM calendar_events WHERE id=?', [request.event_id]);
    if (!event) return res.status(410).json({ deleted: true, message: '对应日历事件已删除' });
    return res.json({ eventId: Number(event.id) });
  } catch {
    return res.status(500).json({ message: '核实日历事件创建状态失败' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, event_date, event_type, topic_id } = req.body;
    const userId = req.user?.id;
    const rawClientRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim().toLowerCase() : '';

    if (rawClientRequestId !== undefined && rawClientRequestId !== null && !UUID_PATTERN.test(clientRequestId)) {
      return res.status(400).json({ message: '日历事件请求编号无效' });
    }

    if (!title || !event_date) {
      return res.status(400).json({ message: '标题和日期不能为空' });
    }

    const priorRequest = clientRequestId
      ? await queryOne<{ creator_id: number }>(
        'SELECT creator_id FROM calendar_event_create_request_keys WHERE client_request_id=?',
        [clientRequestId],
      )
      : null;
    if (topic_id && !priorRequest) {
      const topic = await getTopicScopeById(topic_id);
      if (!topic) {
        return res.status(404).json({ message: '关联选题不存在' });
      }
      if (!canAccessTopic(req.user, topic)) {
        return res.status(403).json({ message: '无权限为该选题创建日历事件' });
      }
    }

    const requestFingerprint = clientRequestId
      ? createRequestFingerprint({ title, description, event_date, event_type, topic_id })
      : '';
    let eventId: number;
    if (!clientRequestId) {
      eventId = await executeInsert(
        `INSERT INTO calendar_events (title, description, event_date, event_type, topic_id, creator_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [title, description, event_date, event_type || 'other', topic_id, userId]
      );
    } else {
      const creation = await runInTransaction(async (tx) => {
        const existing = await tx.queryOne<{
          event_id: number;
          creator_id: number;
          request_fingerprint: string;
        }>(
          `SELECT event_id,creator_id,request_fingerprint FROM calendar_event_create_request_keys WHERE client_request_id=?`,
          [clientRequestId],
        );
        if (existing) {
          if (Number(existing.creator_id) !== Number(userId) || existing.request_fingerprint !== requestFingerprint) {
            return { conflict: true as const };
          }
          const event = await tx.queryOne<{ id: number }>('SELECT id FROM calendar_events WHERE id=?', [existing.event_id]);
          return event ? { ok: true as const, id: Number(event.id), replayed: true } : { deleted: true as const };
        }

        const id = await tx.executeInsert(
          `INSERT INTO calendar_events (title, description, event_date, event_type, topic_id, creator_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [title, description, event_date, event_type || 'other', topic_id, userId],
        );
        await tx.execute(
          `INSERT INTO calendar_event_create_request_keys(client_request_id,creator_id,event_id,request_fingerprint,created_at)
           VALUES(?,?,?,?,?)`,
          [clientRequestId, Number(userId), id, requestFingerprint, beijingNow()],
        );
        return { ok: true as const, id, replayed: false };
      });
      if ('conflict' in creation) {
        return res.status(409).json({ message: '日历事件请求编号已用于其他内容，请先核实原请求状态。', code: 'CALENDAR_CREATE_REQUEST_CONFLICT' });
      }
      if ('deleted' in creation) {
        return res.status(410).json({ message: '该请求对应的日历事件已删除，不会因为重试而重新创建。', deleted: true });
      }
      eventId = creation.id;
      return res.json({ message: '日历事件创建成功', id: eventId, idempotent_replay: creation.replayed });
    }

    res.json({ message: '日历事件创建成功', id: eventId });
  } catch {
    res.status(500).json({ message: '创建日历事件失败' });
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
  } catch {
    res.status(500).json({ message: '更新日历事件失败' });
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
  } catch {
    res.status(500).json({ message: '删除日历事件失败' });
  }
});

export default router;
