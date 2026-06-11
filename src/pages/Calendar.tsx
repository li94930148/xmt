import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { getCalendarEvents, createCalendarEvent, getTopics } from '../api';
import type { CalendarEvent } from '../api/calendar';
import type { Topic } from '../types';
import { useThemeStyles } from '../hooks/useThemeStyles';
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar as CalendarIcon
} from 'lucide-react';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday-based
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
        getTopics({ limit: 200 })
      ]);
      setEvents(eventsRes.data || []);
      setTopics(topicsRes.data || []);
    } catch (error) {
      appStore.addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [year, month]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const prevMonthDays = getDaysInMonth(year, month === 1 ? 12 : month - 1);

  const calendarDays = useMemo(() => {
    const days: { day: number; isCurrentMonth: boolean; date: string }[] = [];

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month === 1 ? 12 : month - 1;
      const y = month === 1 ? year - 1 : year;
      days.push({ day: d, isCurrentMonth: false, date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, isCurrentMonth: true, date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }

    // Next month days to fill 6 rows
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = month === 12 ? 1 : month + 1;
      const y = month === 12 ? year + 1 : year;
      days.push({ day: d, isCurrentMonth: false, date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }

    return days;
  }, [year, month, daysInMonth, firstDay, prevMonthDays]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(e => {
      const dateKey = e.event_date?.slice(0, 10);
      if (dateKey) {
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(e);
      }
    });
    // Also add topic deadlines
    topics.forEach(t => {
      if (t.deadline) {
        const dateKey = t.deadline.slice(0, 10);
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push({
          id: -t.id,
          title: `📋 ${t.title}`,
          event_date: t.deadline,
          event_type: 'deadline',
          topic_id: t.id,
          topic_title: t.title,
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
      setYear(y => y - 1);
      setMonth(12);
    } else {
      setMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setYear(y => y + 1);
      setMonth(1);
    } else {
      setMonth(m => m + 1);
    }
  };

  const handleDateClick = (date: string) => {
    setSelectedDate(date);
    setFormData({ title: '', description: '', event_type: 'other', topic_id: '' });
    setShowModal(true);
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      appStore.addNotification({ title: '创建失败', message: '请输入事件标题', type: 'error' });
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
      appStore.addNotification({ title: '创建成功', message: '日历事件已创建', type: 'success' });
      setShowModal(false);
      fetchEvents();
    } catch (error) {
      appStore.addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
    }
  };

  const isToday = (date: string) => {
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return date === todayStr;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={styles.pageTitle}>排期日历</h1>
          <p className={`${styles.subtitle} mt-1`}>查看选题截止日期和团队日程</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevMonth} className={`p-2 ${styles.buttonSecondary} rounded-lg`}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className={`text-lg font-semibold ${styles.textPrimary} min-w-[140px] text-center`}>
            {year}年{month}月
          </span>
          <button onClick={goToNextMonth} className={`p-2 ${styles.buttonSecondary} rounded-lg`}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className={`w-8 h-8 border-4 ${styles.spinner} border-t-transparent rounded-full animate-spin`}></div>
        </div>
      ) : (
        <div className={`${styles.card} overflow-hidden`}>
          {/* 星期头 */}
          <div className={`grid grid-cols-7 border-b ${styles.border}`}>
            {WEEKDAYS.map(day => (
              <div key={day} className={`px-3 py-2.5 text-center text-xs font-semibold ${styles.textMuted} ${styles.bgTertiary}`}>
                {day}
              </div>
            ))}
          </div>

          {/* 日期格子 */}
          <div className="grid grid-cols-7">
            {calendarDays.map((cell, idx) => {
              const cellEvents = eventsByDate[cell.date] || [];
              return (
                <div
                  key={idx}
                  onClick={() => handleDateClick(cell.date)}
                  className={`min-h-[100px] p-2 border-b border-r ${styles.border} cursor-pointer transition-colors ${
                    !cell.isCurrentMonth ? styles.bgSecondary : ''
                  } ${isToday(cell.date) ? 'bg-[#5c7cfa]/5' : ''} ${styles.hoverBg}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium ${
                      isToday(cell.date)
                        ? 'bg-[#5c7cfa] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs'
                        : cell.isCurrentMonth
                          ? styles.textPrimary
                          : styles.textMuted
                    }`}>
                      {cell.day}
                    </span>
                    {cellEvents.length > 0 && cell.isCurrentMonth && (
                      <span className={`text-[10px] ${styles.textMuted}`}>{cellEvents.length}</span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {cellEvents.slice(0, 3).map((evt, i) => (
                      <div
                        key={i}
                        className={`text-[10px] px-1.5 py-0.5 rounded truncate ${eventTypeColors[evt.event_type || 'other'] || eventTypeColors.other}`}
                      >
                        {evt.title}
                      </div>
                    ))}
                    {cellEvents.length > 3 && (
                      <div className={`text-[10px] ${styles.textMuted} text-center`}>
                        +{cellEvents.length - 3}更多
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 创建事件弹窗 */}
      {showModal && (
        <div className={`fixed inset-0 ${styles.overlay} flex items-center justify-center z-50`}>
          <div className={`${styles.modal} p-6 w-full max-w-md mx-4`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#5c7cfa]" />
                <h2 className={`text-lg font-bold ${styles.textPrimary}`}>创建事件</h2>
              </div>
              <button onClick={() => setShowModal(false)} className={`${styles.textMuted} hover:${styles.textPrimary}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`text-sm ${styles.textSecondary} mb-4`}>
              日期：{selectedDate}
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm`}
                  placeholder="事件标题"
                />
              </div>
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm resize-none`}
                  rows={3}
                  placeholder="事件描述（可选）"
                />
              </div>
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>类型</label>
                <select
                  value={formData.event_type}
                  onChange={e => setFormData({ ...formData, event_type: e.target.value })}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm`}
                >
                  <option value="deadline">截止日期</option>
                  <option value="meeting">会议</option>
                  <option value="review">评审</option>
                  <option value="publish">发布</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>关联选题</label>
                <select
                  value={formData.topic_id}
                  onChange={e => setFormData({ ...formData, topic_id: e.target.value })}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm`}
                >
                  <option value="">不关联</option>
                  {topics.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className={`flex-1 px-4 py-2.5 ${styles.buttonSecondary} rounded-xl text-sm`}>
                  取消
                </button>
                <button onClick={handleCreate} className={`flex-1 px-4 py-2.5 ${styles.buttonPrimary} rounded-xl text-sm`}>
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
