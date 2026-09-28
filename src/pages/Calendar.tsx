import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { createCalendarEvent, getCalendarEvents, getTopics } from '../api';
import type { CalendarEvent } from '../api/calendar';
import type { Topic } from '../types';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock3, Plus, Send, Video, AlertTriangle } from 'lucide-react';
import { ErrorState, FormModal, LoadingState } from '../components/common';
import ActionButton from '../components/studio/ActionButton';
import GlassPanel from '../components/studio/GlassPanel';
import MetricCard from '../components/studio/MetricCard';
import PageHeader from '../components/studio/PageHeader';
import PageShell from '../components/studio/PageShell';
import StatusPill, { type StatusTone } from '../components/studio/StatusPill';
import TimelineCard from '../components/studio/TimelineCard';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

const eventTypeText: Record<string, string> = {
  deadline: '截止',
  meeting: '会议',
  review: '审核',
  publish: '发布',
  shooting: '拍摄',
  other: '事项',
};

const eventTypeTone: Record<string, StatusTone> = {
  deadline: 'coral',
  meeting: 'primary',
  review: 'amber',
  publish: 'success',
  shooting: 'cyan',
  other: 'muted',
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'other',
    topic_id: '',
  });
  const addNotification = useAppStore((state) => state.addNotification);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [eventsRes, topicsRes] = await Promise.all([
        getCalendarEvents({ year, month }),
        getTopics({ limit: 200 }),
      ]);
      setEvents(eventsRes.data || []);
      setTopics(topicsRes.data || []);
    } catch (error) {
      setLoadError((error as Error).message || '获取日历事件失败');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const prevMonthDays = getDaysInMonth(year, month === 1 ? 12 : month - 1);
  const todayKey = toDateKey(today);

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
          title: `截止 ${topic.title}`,
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

  const monthEvents = useMemo(() => Object.values(eventsByDate).flat(), [eventsByDate]);
  const todayEvents = eventsByDate[todayKey] || [];
  const thisWeekPublishCount = monthEvents.filter((eventItem) => eventItem.event_type === 'publish').length;
  const shootingCount = monthEvents.filter((eventItem) => eventItem.event_type === 'shooting').length;
  const deadlineCount = monthEvents.filter((eventItem) => eventItem.event_type === 'deadline').length;

  const upcomingEvents = useMemo(
    () =>
      monthEvents
        .filter((eventItem) => eventItem.event_date?.slice(0, 10) >= todayKey)
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .slice(0, 5),
    [monthEvents, todayKey],
  );

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
    if (submittingRef.current) return;
    if (!formData.title.trim()) {
      addNotification({
        title: '创建失败',
        message: '请输入事件标题',
        type: 'error',
      });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await createCalendarEvent({
        title: formData.title,
        description: formData.description || undefined,
        event_date: selectedDate,
        event_type: formData.event_type,
        topic_id: formData.topic_id ? Number(formData.topic_id) : undefined,
      });
      addNotification({
        title: '创建成功',
        message: '日历事件已创建',
        type: 'success',
      });
      setShowModal(false);
      void fetchEvents();
    } catch (error) {
      addNotification({
        title: '创建失败',
        message: (error as Error).message,
        type: 'error',
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const isToday = (date: string) => date === todayKey;

  return (
    <PageShell>
      <PageHeader
        title="排期日历"
        description="查看近期待发布、待拍摄、待审核和截止内容，安排团队内容节奏。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton type="button" variant="secondary" onClick={goToPrevMonth}>
              <ChevronLeft className="h-4 w-4" />
              上月
            </ActionButton>
            <div className="rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-sm font-semibold text-studio-text-primary">
              {year}年{month}月
            </div>
            <ActionButton type="button" variant="secondary" onClick={goToNextMonth}>
              下月
              <ChevronRight className="h-4 w-4" />
            </ActionButton>
          </div>
        }
      />

      {!loading && !loadError ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="今日事项" value={todayEvents.length} icon={Clock3} tone="cyan" />
          <MetricCard title="本月发布" value={thisWeekPublishCount} icon={Send} tone="success" />
          <MetricCard title="待拍摄" value={shootingCount} icon={Video} tone="primary" />
          <MetricCard title="风险延期" value={deadlineCount} icon={AlertTriangle} tone="coral" />
        </div>
      ) : null}

      {loading ? (
        <LoadingState type="page" text="正在加载日历..." />
      ) : loadError ? (
        <ErrorState title="日历加载失败" description={loadError} actionText="重试加载" onRetry={() => void fetchEvents()} />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <GlassPanel className="min-w-0 overflow-hidden">
            <div className="min-w-0">
              <div className="w-full min-w-0 md:min-w-[820px]">
                <div className="grid grid-cols-7 border-b border-studio-border-soft bg-studio-surface-soft">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="px-0.5 py-2 text-center text-[10px] font-semibold text-studio-text-muted sm:px-3 sm:text-xs sm:py-3">
                      周{day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {calendarDays.map((cell, index) => {
                    const cellEvents = eventsByDate[cell.date] || [];

                    return (
                      <button
                        key={index}
                        type="button"
                        aria-label={`${cell.date}，${cellEvents.length ? `${cellEvents.length} 项日程` : '无日程'}`}
                        onClick={() => handleDateClick(cell.date)}
                        className={`min-h-16 border-b border-r border-studio-border-soft p-1 text-left transition hover:bg-studio-surface-soft sm:min-h-20 sm:p-1.5 md:min-h-[118px] md:p-2 ${
                          !cell.isCurrentMonth ? 'bg-studio-surface-soft/50 text-studio-text-muted' : 'text-studio-text-primary'
                        } ${isToday(cell.date) ? 'bg-studio-primary/10' : ''}`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:h-7 sm:w-7 sm:text-sm ${
                              isToday(cell.date)
                                ? 'bg-studio-primary text-white shadow-glow-primary'
                                : cell.isCurrentMonth
                                  ? 'text-studio-text-primary'
                                  : 'text-studio-text-muted'
                            }`}
                          >
                            {cell.day}
                          </span>
                          {cellEvents.length > 0 && cell.isCurrentMonth ? (
                            <span className="rounded-full bg-studio-surface-elevated px-2 py-0.5 text-[10px] text-studio-text-muted">{cellEvents.length}</span>
                          ) : null}
                        </div>
                        <div className="hidden space-y-1 md:block">
                          {cellEvents.slice(0, 3).map((eventItem, eventIndex) => (
                            <div
                              key={eventIndex}
                              className={`truncate rounded-md border px-2 py-1 text-[11px] font-medium ${
                                eventTypeTone[eventItem.event_type || 'other'] === 'coral'
                                  ? 'border-studio-coral/30 bg-studio-coral/10 text-studio-coral-contrast'
                                  : eventTypeTone[eventItem.event_type || 'other'] === 'success'
                                    ? 'border-studio-success/30 bg-studio-success/10 text-studio-success-contrast'
                                    : eventTypeTone[eventItem.event_type || 'other'] === 'amber'
                                      ? 'border-studio-amber/30 bg-studio-amber/10 text-studio-amber-contrast'
                                      : eventTypeTone[eventItem.event_type || 'other'] === 'cyan'
                                        ? 'border-studio-cyan/30 bg-studio-cyan/10 text-studio-cyan-contrast'
                                        : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary'
                              }`}
                            >
                              {eventItem.title}
                            </div>
                          ))}
                          {cellEvents.length > 3 ? <div className="text-center text-[10px] text-studio-text-muted">+{cellEvents.length - 3} 更多</div> : null}
                        </div>
                        {cellEvents.length > 0 ? (
                          <div aria-hidden="true" className="mt-1 flex min-h-1.5 items-center gap-0.5 md:hidden">
                            {cellEvents.slice(0, 3).map((eventItem, eventIndex) => {
                              const tone = eventTypeTone[eventItem.event_type || 'other'];
                              const dot = tone === 'coral' ? 'bg-studio-coral' : tone === 'success' ? 'bg-studio-success' : tone === 'amber' ? 'bg-studio-amber' : tone === 'cyan' ? 'bg-studio-cyan' : 'bg-studio-text-muted';
                              return <span key={eventIndex} className={`h-1.5 w-1.5 rounded-full ${dot}`} />;
                            })}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </GlassPanel>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-studio-text-primary">近期节点</h2>
              <ActionButton type="button" variant="ghost" onClick={() => handleDateClick(todayKey)}>
                <Plus className="h-4 w-4" />
                新增
              </ActionButton>
            </div>
            {upcomingEvents.length === 0 ? (
              <GlassPanel className="p-5 text-sm text-studio-text-secondary">近期暂无排期事项。</GlassPanel>
            ) : (
              upcomingEvents.map((eventItem) => (
                <TimelineCard
                  key={`${eventItem.id}-${eventItem.event_date}`}
                  title={eventItem.title}
                  time={eventItem.event_date?.slice(0, 10)}
                  status={
                    <StatusPill tone={eventTypeTone[eventItem.event_type || 'other'] || 'muted'}>
                      {eventTypeText[eventItem.event_type || 'other'] || '事项'}
                    </StatusPill>
                  }
                >
                  <div>{eventItem.topic_title || eventItem.description || '未关联具体内容'}</div>
                  {eventItem.topic_id ? <ActionButton type="button" variant="ghost" className="mt-2 min-h-11" onClick={() => navigate(`/topics/${eventItem.topic_id}`, { state: { mobileReturnTo: '/calendar' } })}>查看关联选题</ActionButton> : null}
                </TimelineCard>
              ))
            )}
          </div>
        </div>
      )}

      <FormModal
        open={showModal}
        onCancel={() => setShowModal(false)}
        onSubmit={handleCreate}
        title={
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-studio-cyan" />
            <span>创建事件</span>
          </div>
        }
        description={`日期：${selectedDate}`}
        submitText="创建"
        cancelText="取消"
        loading={submitting}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-studio-text-secondary">标题 *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(event) => setFormData({ ...formData, title: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2.5 text-sm text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
              placeholder="事件标题"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-studio-text-secondary">描述</label>
            <textarea
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              className="w-full resize-none rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2.5 text-sm text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
              rows={3}
              placeholder="事件描述（可选）"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-studio-text-secondary">类型</label>
            <select
              value={formData.event_type}
              onChange={(event) => setFormData({ ...formData, event_type: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2.5 text-sm text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
            >
              <option value="deadline">截止日期</option>
              <option value="meeting">会议</option>
              <option value="review">审核</option>
              <option value="publish">发布</option>
              <option value="shooting">拍摄</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-studio-text-secondary">关联选题</label>
            <select
              value={formData.topic_id}
              onChange={(event) => setFormData({ ...formData, topic_id: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2.5 text-sm text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
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
    </PageShell>
  );
}
