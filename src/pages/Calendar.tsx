import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useAuthStore } from '../store';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import { createCalendarEvent, getCalendarEventCreateStatus } from '../api';
import type { CalendarEventCreatePayload } from '../api/calendar';
import { ChevronLeft, ChevronRight, Clock3, Send, Video, AlertTriangle } from 'lucide-react';
import { ErrorState, LoadingState } from '../components/common';
import ActionButton from '../components/studio/ActionButton';
import MetricCard from '../components/studio/MetricCard';
import PageHeader from '../components/studio/PageHeader';
import PageShell from '../components/studio/PageShell';
import type { StatusTone } from '../components/studio/StatusPill';
import CalendarGrid from '../components/calendar/CalendarGrid';
import CalendarCreateDialog from '../components/calendar/CalendarCreateDialog';
import UpcomingCalendarEvents from '../components/calendar/UpcomingCalendarEvents';
import type { CalendarEventFormValues, PendingCalendarCreate, PendingCalendarFocus } from '../components/calendar/calendarTypes';
import { buildCalendarCreatePayload, clearPendingCalendarCreate, persistPendingCalendarCreatePhase, readPendingCalendarCreate, savePendingCalendarCreate } from '../utils/calendarCreateRecovery';
import { useCalendarData } from '../hooks/useCalendarData';

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

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [activeCalendarDate, setActiveCalendarDate] = useState(toDateKey(today));
  const [pendingCalendarCreate, setPendingCalendarCreate] = useState<PendingCalendarCreate | null>(null);
  const [calendarCreateRecoveryMessage, setCalendarCreateRecoveryMessage] = useState('');
  const [verifyingCalendarCreate, setVerifyingCalendarCreate] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const verifyingCalendarCreateRef = useRef(false);
  const pendingCalendarFocusRef = useRef<PendingCalendarFocus | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [formData, setFormData] = useState<CalendarEventFormValues>({
    title: '',
    description: '',
    event_type: 'other',
    topic_id: '',
  });
  const addNotification = useAppStore((state) => state.addNotification);
  const authUserId = useAuthStore((state) => state.user?.id);
  const {
    calendarDays,
    deadlineCount,
    eventsByDate,
    fetchEvents,
    loadError,
    loading,
    prepareForMonthChange,
    setConfirmedCreatedEventTitle,
    confirmedCreatedEventTitle,
    thisWeekPublishCount,
    todayEvents,
    todayKey,
    topics,
    upcomingEvents,
    shootingCount,
  } = useCalendarData(year, month);

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
  }, [addNotification, fetchEvents, setConfirmedCreatedEventTitle]);

  useEffect(() => {
    if (!pendingCalendarCreate || pendingCalendarCreate.phase !== 'uncertain' || Number(authUserId) !== pendingCalendarCreate.userId) return;
    void verifyPendingCalendarCreate(pendingCalendarCreate);
  }, [authUserId, pendingCalendarCreate, verifyPendingCalendarCreate]);

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
      prepareForMonthChange();
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

    const payload: CalendarEventCreatePayload = pendingCalendarCreate?.payload || buildCalendarCreatePayload(formData, selectedDate);
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
          <CalendarGrid
            year={year}
            month={month}
            days={calendarDays}
            eventsByDate={eventsByDate}
            activeDate={activeCalendarDate}
            onActiveDateChange={setActiveCalendarDate}
            todayKey={todayKey}
            onDayKeyDown={handleCalendarDayKeyDown}
            onDateClick={handleDateClick}
            pendingFocusRef={pendingCalendarFocusRef}
            loading={loading}
            loadError={loadError}
            getEventTone={getEventTone}
            eventTypeText={eventTypeText}
            eventTypeBadgeClass={eventTypeBadgeClass}
            eventTypeDotClass={eventTypeDotClass}
          />
          <UpcomingCalendarEvents
            events={upcomingEvents}
            eventTypeText={eventTypeText}
            getEventTone={getEventTone}
            onCreate={() => handleDateClick(todayKey)}
            onOpenTopic={(topicId) => navigate(`/topics/${topicId}`, { state: { mobileReturnTo: '/calendar' } })}
          />
        </div>
      )}

      <CalendarCreateDialog
        open={showModal}
        onCancel={() => setShowModal(false)}
        onSubmit={handleCreate}
        selectedDate={selectedDate}
        pendingCalendarCreate={pendingCalendarCreate}
        recoveryMessage={calendarCreateRecoveryMessage}
        submitting={submitting}
        verifying={verifyingCalendarCreate}
        formData={formData}
        topics={topics}
        onFormDataChange={setFormData}
      />
    </PageShell>
  );
}
