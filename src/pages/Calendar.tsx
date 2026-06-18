import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { getCalendarEvents, createCalendarEvent, getTopics } from '../api';
import type { CalendarEvent } from '../api/calendar';
import type { Topic } from '../types';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { FormModal, LoadingState, PageHeader, PageToolbar } from '../components/common';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

const eventTypeColors: Record<string, string> = {
  deadline: 'bg-red-500/20 text-red-400',
  meeting: 'bg-blue-500/20 text-blue-400',
  review: 'bg-yellow-500/20 text-yellow-400',
  publish: 'bg-green-500/20 text-green-400',
  other: 'bg-gray-500/20 text-gray-400',
};

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'other',
    topic_id: '',
  });
  const appStore = useAppStore();
  const styles = useThemeStyles();

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const [eventsRes, topicsRes] = await Promise.all([
        getCalendarEvents({ year, month }),
        getTopics({ limit: 200 }),
      ]);
      setEvents(eventsRes.data || []);
      setTopics(topicsRes.data || []);
    } catch (error) {
      appStore.addNotification({
        title: '获取数据失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchEvents();
  }, [year, month]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const prevMonthDays = getDaysInMonth(year, month === 1 ? 12 : month - 1);

  const calendarDays = useMemo(() => {
    const days: { day: number; isCurrentMonth: boolean; date: string }[] = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month === 1 ? 12 : month - 1;
      const y = month === 1 ? year - 1 : year;
      days.push({
        day: d,
        isCurrentMonth: false,
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        day: d,
        isCurrentMonth: true,
        date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      });
    }

    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = month === 12 ? 1 : month + 1;
      const y = month === 12 ? year + 1 : year;
      days.push({
        day: d,
        isCurrentMonth: false,
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      });
    }

    return days;
  }, [year, month, daysInMonth, firstDay, prevMonthDays]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((eventItem) => {
      const dateKey = eventItem.event_date?.slice(0, 10);
      if (dateKey) {
        if (!map[dateKey]) {
          map[dateKey] = [];
        }
        map[dateKey].push(eventItem);
      }
    });

    topics.forEach((topic) => {
      if (topic.deadline) {
        const dateKey = topic.deadline.slice(0, 10);
        if (!map[dateKey]) {
          map[dateKey] = [];
        }
        map[dateKey].push({
          id: -topic.id,
          title: `📍 ${topic.title}`,
          event_date: topic.deadline,
          event_type: 'deadline',
          topic_id: topic.id,
          topic_title: topic.title,
          creator_id: 0,
          created_at: '',
          updated_at: '',
        } as CalendarEvent);
      }
    });

    return map;
  }, [events, topics]);

  const goToPrevMonth = () => {
    if (month === 1) {
      setYear((currentYear) => currentYear - 1);
      setMonth(12);
    } else {
      setMonth((currentMonth) => currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setYear((currentYear) => currentYear + 1);
      setMonth(1);
    } else {
      setMonth((currentMonth) => currentMonth + 1);
    }
  };

  const handleDateClick = (date: string) => {
    setSelectedDate(date);
    setFormData({ title: '', description: '', event_type: 'other', topic_id: '' });
    setShowModal(true);
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      appStore.addNotification({
        title: '创建失败',
        message: '请输入事件标题',
        type: 'error',
      });
      return;
    }

    try {
      await createCalendarEvent({
        title: formData.title,
        description: formData.description || undefined,
        event_date: selectedDate,
        event_type: formData.event_type,
        topic_id: formData.topic_id ? Number(formData.topic_id) : undefined,
      });
      appStore.addNotification({
        title: '创建成功',
        message: '日历事件已创建',
        type: 'success',
      });
      setShowModal(false);
      void fetchEvents();
    } catch (error) {
      appStore.addNotification({
        title: '创建失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const isToday = (date: string) => {
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    return date === todayStr;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="排期日历"
        description="查看选题截止日期和团队日程"
      />

      <PageToolbar
        left={
          <div className="flex items-center gap-2">
            <button type="button" onClick={goToPrevMonth} className={`rounded-lg p-2 ${styles.buttonSecondary}`}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className={`min-w-[140px] text-center text-lg font-semibold ${styles.textPrimary}`}>
              {year}年{month}月
            </span>
            <button type="button" onClick={goToNextMonth} className={`rounded-lg p-2 ${styles.buttonSecondary}`}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {loading ? (
        <LoadingState type="page" text="正在加载日历..." />
      ) : (
        <div className={`${styles.card} overflow-hidden`}>
          <div className={`grid grid-cols-7 border-b ${styles.border}`}>
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className={`px-3 py-2.5 text-center text-xs font-semibold ${styles.textMuted} ${styles.bgTertiary}`}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((cell, index) => {
              const cellEvents = eventsByDate[cell.date] || [];

              return (
                <div
                  key={index}
                  onClick={() => handleDateClick(cell.date)}
                  className={`min-h-[100px] cursor-pointer border-b border-r p-2 transition-colors ${styles.border} ${
                    !cell.isCurrentMonth ? styles.bgSecondary : ''
                  } ${isToday(cell.date) ? 'bg-[#5c7cfa]/5' : ''} ${styles.hoverBg}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`text-sm font-medium ${
                        isToday(cell.date)
                          ? 'flex h-6 w-6 items-center justify-center rounded-full bg-[#5c7cfa] text-xs text-white'
                          : cell.isCurrentMonth
                            ? styles.textPrimary
                            : styles.textMuted
                      }`}
                    >
                      {cell.day}
                    </span>
                    {cellEvents.length > 0 && cell.isCurrentMonth ? (
                      <span className={`text-[10px] ${styles.textMuted}`}>{cellEvents.length}</span>
                    ) : null}
                  </div>
                  <div className="space-y-0.5">
                    {cellEvents.slice(0, 3).map((eventItem, eventIndex) => (
                      <div
                        key={eventIndex}
                        className={`truncate rounded px-1.5 py-0.5 text-[10px] ${
                          eventTypeColors[eventItem.event_type || 'other'] || eventTypeColors.other
                        }`}
                      >
                        {eventItem.title}
                      </div>
                    ))}
                    {cellEvents.length > 3 ? (
                      <div className={`text-center text-[10px] ${styles.textMuted}`}>+{cellEvents.length - 3}更多</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <FormModal
        open={showModal}
        onCancel={() => setShowModal(false)}
        onSubmit={handleCreate}
        title={
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-[#5c7cfa]" />
            <span>创建事件</span>
          </div>
        }
        description={`日期：${selectedDate}`}
        submitText="创建"
        cancelText="取消"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className={`mb-1.5 block text-sm font-medium ${styles.textSecondary}`}>标题 *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(event) => setFormData({ ...formData, title: event.target.value })}
              className={`w-full px-4 py-2.5 text-sm ${styles.input}`}
              placeholder="事件标题"
            />
          </div>
          <div>
            <label className={`mb-1.5 block text-sm font-medium ${styles.textSecondary}`}>描述</label>
            <textarea
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              className={`w-full resize-none px-4 py-2.5 text-sm ${styles.input}`}
              rows={3}
              placeholder="事件描述（可选）"
            />
          </div>
          <div>
            <label className={`mb-1.5 block text-sm font-medium ${styles.textSecondary}`}>类型</label>
            <select
              value={formData.event_type}
              onChange={(event) => setFormData({ ...formData, event_type: event.target.value })}
              className={`w-full px-4 py-2.5 text-sm ${styles.input}`}
            >
              <option value="deadline">截止日期</option>
              <option value="meeting">会议</option>
              <option value="review">评审</option>
              <option value="publish">发布</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div>
            <label className={`mb-1.5 block text-sm font-medium ${styles.textSecondary}`}>关联选题</label>
            <select
              value={formData.topic_id}
              onChange={(event) => setFormData({ ...formData, topic_id: event.target.value })}
              className={`w-full px-4 py-2.5 text-sm ${styles.input}`}
            >
              <option value="">不关联</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FormModal>
    </div>
  );
}
