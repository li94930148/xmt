import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useAuthStore } from '../store';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
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
  phase: 'uncertain' | 'ready' | 'cleanup-created' | 'cleanup-deleted' | 'cleanup-rejected';
};

function calendarCreateRecoveryKey(userId: number) {
  return `xmt:calendar-create-pending:v1:user:${userId}`;
}

function readPendingCalendarCreate(userId: number): PendingCalendarCreate | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(calendarCreateRecoveryKey(userId)) || 'null') as Partial<PendingCalendarCreate> | null;
    if (!value || Number(value.userId) !== userId || typeof value.clientRequestId !== 'string' || !CALENDAR_CREATE_REQUEST_PATTERN.test(value.clientRequestId)) return null;
    if (!value.payload || typeof value.payload.title !== 'string' || typeof value.payload.event_date !== 'string') return null;
    if (value.phase !== 'uncertain'
      && value.phase !== 'ready'
      && value.phase !== 'cleanup-created'
      && value.phase !== 'cleanup-deleted'
      && value.phase !== 'cleanup-rejected') return null;
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
    const key = calendarCreateRecoveryKey(pending.userId);
    const serialized = JSON.stringify(pending);
    window.sessionStorage.setItem(key, serialized);
    return window.sessionStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function persistPendingCalendarCreatePhase(pending: PendingCalendarCreate) {
  try {
    const stored = readPendingCalendarCreate(pending.userId);
    if (stored?.clientRequestId !== pending.clientRequestId) return false;
    return savePendingCalendarCreate(pending);
  } catch {
    return false;
  }
}

function clearPendingCalendarCreate(userId: number, clientRequestId: string) {
  try {
    const key = calendarCreateRecoveryKey(userId);
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return true;
    const stored = JSON.parse(raw) as { clientRequestId?: unknown } | null;
    if (stored?.clientRequestId !== clientRequestId) return false;
    window.sessionStorage.removeItem(key);
    return window.sessionStorage.getItem(key) === null;
  } catch {
    return false;
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
  const [activeCalendarDate, setActiveCalendarDate] = useState(toDateKey(today));
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
  const calendarDayButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingCalendarFocusRef = useRef<{ date: string; year: number; month: number } | null>(null);
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
      setLoadError(getUserFacingErrorMessage(error, '日历暂时无法加载，请检查连接后重试。'));
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
      setCalendarCreateRecoveryMessage(pending.phase.startsWith('cleanup-')
        ? '本机恢复记录尚未确认清除，日历创建操作保持暂停；请继续只读核实。'
        : '发现一条尚未确认结果的日历创建请求，正在只读核实；不会自动重复创建。');
    }
  }, [authUserId]);

  const verifyPendingCalendarCreate = useCallback(async (pending: PendingCalendarCreate) => {
    if (verifyingCalendarCreateRef.current) return;
    verifyingCalendarCreateRef.current = true;
    setVerifyingCalendarCreate(true);
    try {
      const result = await getCalendarEventCreateStatus(pending.clientRequestId);
      if (result.status === 'created') {
        if (!clearPendingCalendarCreate(pending.userId, pending.clientRequestId)) {
          const cleanupPending: PendingCalendarCreate = { ...pending, phase: 'cleanup-created' };
          persistPendingCalendarCreatePhase(cleanupPending);
          setPendingCalendarCreate(cleanupPending);
          setCalendarCreateRecoveryMessage('服务器已确认事件创建成功，但本机恢复记录尚未清除。为避免重复创建，操作保持暂停；请继续只读核实。');
          setConfirmedCreatedEventTitle(pending.payload.title.trim());
          setShowModal(true);
          void fetchEvents();
          return;
        }
        setPendingCalendarCreate(null);
        setCalendarCreateRecoveryMessage('');
        setConfirmedCreatedEventTitle(pending.payload.title.trim());
        setShowModal(false);
        addNotification({ title: '创建成功', message: '服务器已确认日历事件创建成功。', type: 'success' });
        void fetchEvents();
        return;
      }
      if (result.status === 'deleted') {
        if (!clearPendingCalendarCreate(pending.userId, pending.clientRequestId)) {
          const cleanupPending: PendingCalendarCreate = { ...pending, phase: 'cleanup-deleted' };
          persistPendingCalendarCreatePhase(cleanupPending);
          setPendingCalendarCreate(cleanupPending);
          setCalendarCreateRecoveryMessage('服务器已确认原请求对应的事件已删除，但本机恢复记录尚未清除。日历创建操作保持暂停；请继续只读核实。');
          setShowModal(true);
          return;
        }
        setPendingCalendarCreate(null);
        setCalendarCreateRecoveryMessage('该请求对应的事件已被删除，不会因恢复而重新创建。');
        setShowModal(false);
        addNotification({ title: '事件已删除', message: '原创建请求已完成，不会重复创建。', type: 'info' });
        return;
      }
      if (pending.phase === 'cleanup-rejected') {
        if (clearPendingCalendarCreate(pending.userId, pending.clientRequestId)) {
          setPendingCalendarCreate(null);
          setCalendarCreateRecoveryMessage('服务器确认本次请求未创建，恢复记录已清除；原表单已保留，可修正后再提交。');
          setShowModal(true);
          addNotification({ title: '请求未创建', message: '服务器确认事件未创建，恢复记录已清除；可修正原表单后重新提交。', type: 'info' });
        } else {
          const cleanupPending: PendingCalendarCreate = { ...pending, phase: 'cleanup-rejected' };
          persistPendingCalendarCreatePhase(cleanupPending);
          setPendingCalendarCreate(cleanupPending);
          setCalendarCreateRecoveryMessage('服务器确认本次请求未创建，但本机恢复记录仍未清除。为避免重复操作，创建保持暂停；请稍后继续只读核实。');
        }
        return;
      }
      if (pending.phase === 'cleanup-created' || pending.phase === 'cleanup-deleted') {
        setCalendarCreateRecoveryMessage('服务器暂未找到原请求，但此前的结果已确认且本机恢复记录仍未清除。为避免重复创建，操作继续锁定；请稍后继续只读核实。');
        return;
      }
      const ready = { ...pending, phase: 'ready' as const };
      if (!persistPendingCalendarCreatePhase(ready)) {
        setPendingCalendarCreate(pending);
        setShowModal(true);
        setCalendarCreateRecoveryMessage('服务器尚未找到原请求，但本机恢复记录无法更新。创建操作保持暂停；请稍后继续只读核实。');
        return;
      }
      setPendingCalendarCreate(ready);
      setShowModal(true);
      setCalendarCreateRecoveryMessage('服务器尚未找到这次请求。原表单已保留；确认后会用同一请求编号安全重试。');
    } catch (error) {
      setCalendarCreateRecoveryMessage(`${getUserFacingErrorMessage(error, '暂时无法核实创建结果')}。请先重新核实，不要另建同一事件。`);
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

  useEffect(() => {
    const pendingFocus = pendingCalendarFocusRef.current;
    if (!pendingFocus || loading || loadError || year !== pendingFocus.year || month !== pendingFocus.month) return;
    const target = calendarDayButtonRefs.current.get(pendingFocus.date);
    if (!target) return;
    target.focus();
    pendingCalendarFocusRef.current = null;
  }, [activeCalendarDate, loadError, loading, month, year]);

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
    const nextYear = month === 1 ? year - 1 : year;
    const nextMonth = month === 1 ? 12 : month - 1;
    setActiveCalendarDate(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`);
    if (month === 1) {
      setYear(nextYear);
      setMonth(12);
    } else {
      setMonth(nextMonth);
    }
  };

  const goToNextMonth = () => {
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    setActiveCalendarDate(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`);
    if (month === 12) {
      setYear(nextYear);
      setMonth(1);
    } else {
      setMonth(nextMonth);
    }
  };

  const handleCalendarDayKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, dateKey: string) => {
    let dayOffset: number | null = null;
    if (event.key === 'ArrowLeft') dayOffset = -1;
    else if (event.key === 'ArrowRight') dayOffset = 1;
    else if (event.key === 'ArrowUp') dayOffset = -7;
    else if (event.key === 'ArrowDown') dayOffset = 7;

    const [dateYear, dateMonth, dateDay] = dateKey.split('-').map(Number);
    const currentDate = new Date(dateYear, dateMonth - 1, dateDay);
    let targetDate: Date | null = null;
    if (dayOffset !== null) {
      targetDate = new Date(dateYear, dateMonth - 1, dateDay + dayOffset);
    } else if (event.key === 'Home' || event.key === 'End') {
      const mondayOffset = (currentDate.getDay() + 6) % 7;
      targetDate = new Date(dateYear, dateMonth - 1, dateDay + (event.key === 'Home' ? -mondayOffset : 6 - mondayOffset));
    }

    if (!targetDate) return;
    event.preventDefault();

    const targetDateKey = toDateKey(targetDate);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth() + 1;
    setActiveCalendarDate(targetDateKey);
    pendingCalendarFocusRef.current = { date: targetDateKey, year: targetYear, month: targetMonth };

    if (targetYear !== year || targetMonth !== month) {
      setLoading(true);
      setLoadError('');
      setYear(targetYear);
      setMonth(targetMonth);
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
    if (pendingCalendarCreate && pendingCalendarCreate.phase !== 'ready') {
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
    let pending: PendingCalendarCreate = pendingCalendarCreate || {
      userId: Number(authUserId),
      clientRequestId: window.crypto.randomUUID(),
      payload,
      phase: 'uncertain' as const,
    };
    if (!pendingCalendarCreate && !savePendingCalendarCreate(pending)) {
      addNotification({ title: '暂不能创建', message: '浏览器无法保存本次恢复信息，请检查会话存储后重试。', type: 'error' });
      return;
    }
    if (pendingCalendarCreate?.phase === 'ready') {
      pending = { ...pendingCalendarCreate, phase: 'uncertain' };
      if (!persistPendingCalendarCreatePhase(pending)) {
        addNotification({ title: '暂不能重试', message: '本机恢复记录无法更新，日历事件未重新提交。请检查会话存储后继续核实。', type: 'error' });
        return;
      }
      setPendingCalendarCreate(pending);
    }
    if (!pendingCalendarCreate) setPendingCalendarCreate(pending);

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await createCalendarEvent(payload, pending.clientRequestId);
      if (!clearPendingCalendarCreate(pending.userId, pending.clientRequestId)) {
        const cleanupPending: PendingCalendarCreate = { ...pending, phase: 'cleanup-created' };
        persistPendingCalendarCreatePhase(cleanupPending);
        setPendingCalendarCreate(cleanupPending);
        setCalendarCreateRecoveryMessage('服务器已确认事件创建成功，但本机恢复记录尚未清除。为避免重复创建，操作保持暂停；请继续只读核实。');
        setConfirmedCreatedEventTitle(payload.title.trim());
        setShowModal(true);
        addNotification({ title: '事件已创建', message: '本机恢复记录尚未清除；为避免重复创建，日历创建操作已暂停。', type: 'error' });
        void fetchEvents();
        return;
      }
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
        if (clearPendingCalendarCreate(pending.userId, pending.clientRequestId)) {
          setPendingCalendarCreate(null);
          setCalendarCreateRecoveryMessage('');
          addNotification({ title: '创建失败', message: getUserFacingErrorMessage(error, '服务器未接受本次创建请求，日历事件未创建。'), type: 'error' });
        } else {
          const cleanupPending: PendingCalendarCreate = { ...pending, phase: 'cleanup-rejected' };
          persistPendingCalendarCreatePhase(cleanupPending);
          setPendingCalendarCreate(cleanupPending);
          setCalendarCreateRecoveryMessage('服务器未接受本次创建请求，但本机恢复记录尚未清除。原表单已保留；创建操作保持暂停，请继续只读核实。');
          setShowModal(true);
          addNotification({ title: '创建结果需核实', message: '服务器未接受本次创建请求，但本机恢复记录尚未清除；创建操作已暂停。', type: 'error' });
        }
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
            {pendingCalendarCreate.phase === 'ready' ? '继续处理' : '继续只读核实'}
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
                <div role="grid" aria-label={`${year}年${month}月日历`}>
                  <div role="row" aria-label="星期" className="grid grid-cols-7 border-b border-studio-border-soft bg-studio-surface-soft">
                    {WEEKDAYS.map((day) => (
                      <div key={day} role="columnheader" aria-label={`星期${day}`} className="px-0.5 py-2 text-center text-[10px] font-semibold text-studio-text-secondary sm:px-3 sm:text-xs sm:py-3">
                        周{day}
                      </div>
                    ))}
                  </div>

                  {Array.from({ length: 6 }, (_, weekIndex) => (
                    <div key={weekIndex} role="row" aria-label={`第${weekIndex + 1}周`} className="grid grid-cols-7">
                      {calendarDays.slice(weekIndex * 7, weekIndex * 7 + 7).map((cell) => {
                        const cellEvents = eventsByDate[cell.date] || [];
                        const eventDescriptionId = cellEvents.length > 0 ? `calendar-day-events-${cell.date}` : undefined;

                        return (
                          <div key={cell.date} role="gridcell" className="min-w-0">
                            <button
                              ref={(element) => {
                                if (element) calendarDayButtonRefs.current.set(cell.date, element);
                                else calendarDayButtonRefs.current.delete(cell.date);
                              }}
                              type="button"
                              tabIndex={activeCalendarDate === cell.date ? 0 : -1}
                              aria-label={`${cell.date}，${cellEvents.length ? `${cellEvents.length} 项日程` : '无日程'}`}
                              aria-current={isToday(cell.date) ? 'date' : undefined}
                              aria-describedby={eventDescriptionId}
                              onFocus={() => setActiveCalendarDate(cell.date)}
                              onKeyDown={(event) => handleCalendarDayKeyDown(event, cell.date)}
                              onClick={() => handleDateClick(cell.date)}
                              className={`min-h-16 w-full border-b border-r border-studio-border-soft p-1 text-left transition hover:bg-studio-surface-soft sm:min-h-20 sm:p-1.5 md:min-h-[118px] md:p-2 ${
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
                          </div>
                        );
                      })}
                    </div>
                  ))}
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
        submitText={pendingCalendarCreate?.phase === 'ready' ? '确认重试创建' : pendingCalendarCreate ? '重新核实' : '创建'}
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
              required
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
