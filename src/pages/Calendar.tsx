import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useAuthStore } from '../store';
import { createCalendarEvent, getCalendarEventCreateStatus, getCalendarEvents, getTopics } from '../api';
import type { CalendarEvent, CalendarEventCreatePayload } from '../api/calendar';
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
const CALENDAR_CREATE_REQUEST_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PendingCalendarCreate = {
  userId: number;
  clientRequestId: string;
  payload: CalendarEventCreatePayload;
  phase: 'uncertain' | 'ready';
};

function calendarCreateRecoveryKey(userId: number) {
  return `xmt:calendar-create-pending:v1:user:${userId}`;
}

function readPendingCalendarCreate(userId: number): PendingCalendarCreate | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(calendarCreateRecoveryKey(userId)) || 'null') as Partial<PendingCalendarCreate> | null;
    if (!value || Number(value.userId) !== userId || typeof value.clientRequestId !== 'string' || !CALENDAR_CREATE_REQUEST_PATTERN.test(value.clientRequestId)) return null;
    if (!value.payload || typeof value.payload.title !== 'string' || typeof value.payload.event_date !== 'string') return null;
    if (value.phase !== 'uncertain' && value.phase !== 'ready') return null;
    return {
      userId,
      clientRequestId: value.clientRequestId,
      payload: {
        title: value.payload.title,
        description: typeof value.payload.description === 'string' ? value.payload.description : undefined,
        event_date: value.payload.event_date,
        event_type: typeof value.payload.event_type === 'string' ? value.payload.event_type : 'other',
        topic_id: Number.isSafeInteger(Number(value.payload.topic_id)) ? Number(value.payload.topic_id) : undefined,
      },
      phase: value.phase,
    };
  } catch {
    return null;
  }
}

function savePendingCalendarCreate(pending: PendingCalendarCreate) {
  try {
    window.sessionStorage.setItem(calendarCreateRecoveryKey(pending.userId), JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

function clearPendingCalendarCreate(userId: number, clientRequestId: string) {
  try {
    const key = calendarCreateRecoveryKey(userId);
    const stored = JSON.parse(window.sessionStorage.getItem(key) || 'null') as { clientRequestId?: unknown } | null;
    if (stored?.clientRequestId === clientRequestId) window.sessionStorage.removeItem(key);
  } catch {
    // A stale marker is safe: the next page load will reconcile it read-only.
  }
}

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

const eventTypeBadgeClass: Record<StatusTone, string> = {
  primary: 'border-studio-primary/30 bg-studio-primary/10 text-studio-primary-contrast',
  cyan: 'border-studio-cyan/30 bg-studio-cyan/10 text-studio-cyan-contrast',
  violet: 'border-studio-violet/30 bg-studio-violet/10 text-studio-violet-contrast',
  coral: 'border-studio-coral/30 bg-studio-coral/10 text-studio-coral-contrast',
  amber: 'border-studio-amber/30 bg-studio-amber/10 text-studio-amber-contrast',
  success: 'border-studio-success/30 bg-studio-success/10 text-studio-success-contrast',
  muted: 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary',
};

const eventTypeDotClass: Record<StatusTone, string> = {
  primary: 'bg-studio-primary-contrast',
  cyan: 'bg-studio-cyan-contrast',
  violet: 'bg-studio-violet-contrast',
  coral: 'bg-studio-coral-contrast',
  amber: 'bg-studio-amber-contrast',
  success: 'bg-studio-success-contrast',
  muted: 'bg-studio-text-muted',
};

function getEventTone(eventType?: string): StatusTone {
  return eventTypeTone[eventType || 'other'] || 'muted';
}

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
  const [confirmedCreatedEventTitle, setConfirmedCreatedEventTitle] = useState('');
  const [pendingCalendarCreate, setPendingCalendarCreate] = useState<PendingCalendarCreate | null>(null);
  const [calendarCreateRecoveryMessage, setCalendarCreateRecoveryMessage] = useState('');
  const [verifyingCalendarCreate, setVerifyingCalendarCreate] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const verifyingCalendarCreateRef = useRef(false);
  const eventsRequestSequenceRef = useRef(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'other',
    topic_id: '',
  });
  const addNotification = useAppStore((state) => state.addNotification);
  const authUserId = useAuthStore((state) => state.user?.id);

  const fetchEvents = useCallback(async () => {
    const requestSequence = ++eventsRequestSequenceRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const [eventsRes, topicsRes] = await Promise.all([
        getCalendarEvents({ year, month }),
        getTopics({ limit: 200 }),
      ]);
      if (requestSequence !== eventsRequestSequenceRef.current) return;
      setEvents(eventsRes.data || []);
      setTopics(topicsRes.data || []);
      setConfirmedCreatedEventTitle('');
    } catch (error) {
      if (requestSequence !== eventsRequestSequenceRef.current) return;
      setLoadError((error as Error).message || '获取日历事件失败');
    } finally {
      if (requestSequence === eventsRequestSequenceRef.current) setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void fetchEvents();
    return () => {
      eventsRequestSequenceRef.current += 1;
    };
  }, [fetchEvents]);

  useEffect(() => {
    if (!authUserId) return;
    const pending = readPendingCalendarCreate(Number(authUserId));
    setPendingCalendarCreate(pending);
    if (pending) {
      setSelectedDate(pending.payload.event_date);
      setFormData({
        title: pending.payload.title,
        description: pending.payload.description || '',
        event_type: pending.payload.event_type || 'other',
        topic_id: pending.payload.topic_id ? String(pending.payload.topic_id) : '',
      });
      setShowModal(true);
      setCalendarCreateRecoveryMessage('发现一条尚未确认结果的日历创建请求，正在只读核实；不会自动重复创建。');
    }
  }, [authUserId]);

  const verifyPendingCalendarCreate = useCallback(async (pending: PendingCalendarCreate) => {
    if (verifyingCalendarCreateRef.current) return;
    verifyingCalendarCreateRef.current = true;
    setVerifyingCalendarCreate(true);
    try {
      const result = await getCalendarEventCreateStatus(pending.clientRequestId);
      if (result.status === 'created') {
        clearPendingCalendarCreate(pending.userId, pending.clientRequestId);
        setPendingCalendarCreate(null);
        setCalendarCreateRecoveryMessage('');
        setConfirmedCreatedEventTitle(pending.payload.title.trim());
        setShowModal(false);
        addNotification({ title: '创建成功', message: '服务器已确认日历事件创建成功。', type: 'success' });
        void fetchEvents();
        return;
      }
      if (result.status === 'deleted') {
        clearPendingCalendarCreate(pending.userId, pending.clientRequestId);
        setPendingCalendarCreate(null);
        setCalendarCreateRecoveryMessage('该请求对应的事件已被删除，不会因恢复而重新创建。');
        setShowModal(false);
        addNotification({ title: '事件已删除', message: '原创建请求已完成，不会重复创建。', type: 'info' });
        return;
      }
      const ready = { ...pending, phase: 'ready' as const };
      savePendingCalendarCreate(ready);
      setPendingCalendarCreate(ready);
      setShowModal(true);
      setCalendarCreateRecoveryMessage('服务器尚未找到这次请求。原表单已保留；确认后会用同一请求编号安全重试。');
    } catch (error) {
      setCalendarCreateRecoveryMessage(`${(error as Error).message || '暂时无法核实创建结果'}。请先重新核实，不要另建同一事件。`);
    } finally {
      verifyingCalendarCreateRef.current = false;
      setVerifyingCalendarCreate(false);
    }
  }, [addNotification, fetchEvents]);

  useEffect(() => {
    if (!pendingCalendarCreate || pendingCalendarCreate.phase !== 'uncertain' || Number(authUserId) !== pendingCalendarCreate.userId) return;
    void verifyPendingCalendarCreate(pendingCalendarCreate);
  }, [authUserId, pendingCalendarCreate, verifyPendingCalendarCreate]);

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
    if (pendingCalendarCreate) {
      setSelectedDate(pendingCalendarCreate.payload.event_date);
      setFormData({
        title: pendingCalendarCreate.payload.title,
        description: pendingCalendarCreate.payload.description || '',
        event_type: pendingCalendarCreate.payload.event_type || 'other',
        topic_id: pendingCalendarCreate.payload.topic_id ? String(pendingCalendarCreate.payload.topic_id) : '',
      });
      setShowModal(true);
      return;
    }
    setSelectedDate(date);
    setFormData({ title: '', description: '', event_type: 'other', topic_id: '' });
    setShowModal(true);
  };

  const handleCreate = async () => {
    if (submittingRef.current || verifyingCalendarCreateRef.current) return;
    if (pendingCalendarCreate?.phase === 'uncertain') {
      await verifyPendingCalendarCreate(pendingCalendarCreate);
      return;
    }
    if (!pendingCalendarCreate && !formData.title.trim()) {
      addNotification({
        title: '创建失败',
        message: '请输入事件标题',
        type: 'error',
      });
      return;
    }

    const payload: CalendarEventCreatePayload = pendingCalendarCreate?.payload || {
      title: formData.title,
      description: formData.description || undefined,
      event_date: selectedDate,
      event_type: formData.event_type,
      topic_id: formData.topic_id ? Number(formData.topic_id) : undefined,
    };
    const pending = pendingCalendarCreate || {
      userId: Number(authUserId),
      clientRequestId: window.crypto.randomUUID(),
      payload,
      phase: 'uncertain' as const,
    };
    if (!pendingCalendarCreate && !savePendingCalendarCreate(pending)) {
      addNotification({ title: '暂不能创建', message: '浏览器无法保存本次恢复信息，请检查会话存储后重试。', type: 'error' });
      return;
    }
    if (!pendingCalendarCreate) setPendingCalendarCreate(pending);

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await createCalendarEvent(payload, pending.clientRequestId);
      clearPendingCalendarCreate(pending.userId, pending.clientRequestId);
      setPendingCalendarCreate(null);
      setCalendarCreateRecoveryMessage('');
      setConfirmedCreatedEventTitle(payload.title.trim());
      addNotification({
        title: '创建成功',
        message: '日历事件已创建',
        type: 'success',
      });
      setShowModal(false);
      void fetchEvents();
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status);
      if (status >= 400 && status < 500 && status !== 408) {
        clearPendingCalendarCreate(pending.userId, pending.clientRequestId);
        setPendingCalendarCreate(null);
        setCalendarCreateRecoveryMessage('');
        addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
      } else {
        const uncertain = { ...pending, phase: 'uncertain' as const };
        savePendingCalendarCreate(uncertain);
        setPendingCalendarCreate(uncertain);
        setCalendarCreateRecoveryMessage('创建请求未收到明确结果，正在只读核实；不会自动再次提交。');
        await verifyPendingCalendarCreate(uncertain);
      }
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
            <div role="status" aria-live="polite" aria-atomic="true" className="rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2 text-sm font-semibold text-studio-text-primary">
              {year}年{month}月
            </div>
            <ActionButton type="button" variant="secondary" onClick={goToNextMonth}>
              下月
              <ChevronRight className="h-4 w-4" />
            </ActionButton>
          </div>
        }
      />

      {pendingCalendarCreate && !showModal ? (
        <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-studio-amber/30 bg-studio-surface-soft p-4 text-sm text-studio-text-secondary">
          <span>{calendarCreateRecoveryMessage || '有一条日历创建请求尚未完成核实，当前不会开始另一条创建。'}</span>
          <ActionButton type="button" variant="secondary" onClick={() => setShowModal(true)}>
            {pendingCalendarCreate.phase === 'uncertain' ? '继续核实' : '继续处理'}
          </ActionButton>
        </div>
      ) : null}

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
        <ErrorState
          title={confirmedCreatedEventTitle ? '事件已创建，日历未刷新' : '日历加载失败'}
          description={
            confirmedCreatedEventTitle
              ? `“${confirmedCreatedEventTitle}”已由服务器确认创建。重新加载只会读取日历，不会重复创建事件。`
              : loadError
          }
          actionText={confirmedCreatedEventTitle ? '重新加载日历' : '重试加载'}
          onRetry={() => void fetchEvents()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <GlassPanel className="min-w-0 overflow-hidden">
            <div className="min-w-0">
              <div className="w-full min-w-0">
                <div className="grid grid-cols-7 border-b border-studio-border-soft bg-studio-surface-soft">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="px-0.5 py-2 text-center text-[10px] font-semibold text-studio-text-secondary sm:px-3 sm:text-xs sm:py-3">
                      周{day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {calendarDays.map((cell, index) => {
                    const cellEvents = eventsByDate[cell.date] || [];
                    const eventDescriptionId = cellEvents.length > 0 ? `calendar-day-events-${cell.date}` : undefined;

                    return (
                      <button
                        key={index}
                        type="button"
                        aria-label={`${cell.date}，${cellEvents.length ? `${cellEvents.length} 项日程` : '无日程'}`}
                        aria-describedby={eventDescriptionId}
                        onClick={() => handleDateClick(cell.date)}
                        className={`min-h-16 border-b border-r border-studio-border-soft p-1 text-left transition hover:bg-studio-surface-soft sm:min-h-20 sm:p-1.5 md:min-h-[118px] md:p-2 ${
                          !cell.isCurrentMonth ? 'bg-studio-surface-soft/50 text-studio-text-secondary' : 'text-studio-text-primary'
                        } ${isToday(cell.date) ? 'bg-studio-primary/10' : ''}`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:h-7 sm:w-7 sm:text-sm ${
                              isToday(cell.date)
                                ? 'bg-studio-primary-button text-white shadow-glow-primary'
                                : cell.isCurrentMonth
                                  ? 'text-studio-text-primary'
                                  : 'text-studio-text-secondary'
                            }`}
                          >
                            {cell.day}
                          </span>
                          {cellEvents.length > 0 && cell.isCurrentMonth ? (
                            <span className="rounded-full bg-studio-surface-elevated px-2 py-0.5 text-[10px] text-studio-text-secondary">{cellEvents.length}</span>
                          ) : null}
                        </div>
                        <div className="hidden space-y-1 md:block">
                          {cellEvents.slice(0, 3).map((eventItem, eventIndex) => (
                            <div
                              key={eventIndex}
                              className={`truncate rounded-md border px-2 py-1 text-[11px] font-medium ${eventTypeBadgeClass[getEventTone(eventItem.event_type)]}`}
                            >
                              {eventItem.title}
                            </div>
                          ))}
                          {cellEvents.length > 3 ? <div className="text-center text-[10px] text-studio-text-secondary">+{cellEvents.length - 3} 更多</div> : null}
                        </div>
                        {cellEvents.length > 0 ? (
                          <div aria-hidden="true" className="mt-1 flex min-h-1.5 items-center gap-0.5 md:hidden">
                            {cellEvents.slice(0, 3).map((eventItem, eventIndex) => {
                              return <span key={eventIndex} className={`h-1.5 w-1.5 rounded-full ${eventTypeDotClass[getEventTone(eventItem.event_type)]}`} />;
                            })}
                          </div>
                        ) : null}
                        {cellEvents.length > 0 ? (
                          <span id={eventDescriptionId} className="sr-only">
                            {cellEvents.map((eventItem) => `${eventTypeText[eventItem.event_type || 'other'] || '事项'}：${eventItem.title}`).join('；')}
                          </span>
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
                    <StatusPill tone={getEventTone(eventItem.event_type)}>
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
        submitText={pendingCalendarCreate?.phase === 'uncertain'
          ? '重新核实'
          : pendingCalendarCreate?.phase === 'ready' ? '确认重试创建' : '创建'}
        cancelText="取消"
        loading={submitting || verifyingCalendarCreate}
        size="md"
      >
        <div className="space-y-4">
          {pendingCalendarCreate ? (
            <p role="status" aria-live="polite" className="rounded-xl border border-studio-amber/30 bg-studio-surface-soft p-3 text-sm text-studio-text-secondary">
              {calendarCreateRecoveryMessage || '请先核实当前请求；不会自动重复创建。'}
            </p>
          ) : null}
          <div>
            <label htmlFor="calendar-event-title" className="mb-1.5 block text-sm font-medium text-studio-text-secondary">标题 *</label>
            <input
              id="calendar-event-title"
              name="title"
              type="text"
              value={formData.title}
              readOnly={Boolean(pendingCalendarCreate)}
              onChange={(event) => setFormData({ ...formData, title: event.target.value })}
              className="w-full rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2.5 text-sm text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
              placeholder="事件标题"
            />
          </div>
          <div>
            <label htmlFor="calendar-event-description" className="mb-1.5 block text-sm font-medium text-studio-text-secondary">描述</label>
            <textarea
              id="calendar-event-description"
              name="description"
              value={formData.description}
              readOnly={Boolean(pendingCalendarCreate)}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              className="w-full resize-none rounded-button border border-studio-border-soft bg-studio-surface-soft px-4 py-2.5 text-sm text-studio-text-primary outline-none focus:border-studio-border-active focus:ring-2 focus:ring-studio-primary/20"
              rows={3}
              placeholder="事件描述（可选）"
            />
          </div>
          <div>
            <label htmlFor="calendar-event-type" className="mb-1.5 block text-sm font-medium text-studio-text-secondary">类型</label>
            <select
              id="calendar-event-type"
              name="event_type"
              value={formData.event_type}
              disabled={Boolean(pendingCalendarCreate)}
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
            <label htmlFor="calendar-event-topic" className="mb-1.5 block text-sm font-medium text-studio-text-secondary">关联选题</label>
            <select
              id="calendar-event-topic"
              name="topic_id"
              value={formData.topic_id}
              disabled={Boolean(pendingCalendarCreate)}
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
