import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCalendarEvents, getTopics } from '../api';
import type { CalendarEvent } from '../api/calendar';
import type { Topic } from '../types';
import { getUserFacingErrorMessage } from '../lib/userFacingError';

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

function buildCalendarDays(year: number, month: number) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const prevMonthDays = getDaysInMonth(year, month === 1 ? 12 : month - 1);
  const days: { day: number; isCurrentMonth: boolean; date: string }[] = [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    const day = prevMonthDays - i;
    const dateMonth = month === 1 ? 12 : month - 1;
    const dateYear = month === 1 ? year - 1 : year;
    days.push({
      day,
      isCurrentMonth: false,
      date: `${dateYear}-${String(dateMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({
      day,
      isCurrentMonth: true,
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    });
  }

  const remaining = 42 - days.length;
  for (let day = 1; day <= remaining; day += 1) {
    const dateMonth = month === 12 ? 1 : month + 1;
    const dateYear = month === 12 ? year + 1 : year;
    days.push({
      day,
      isCurrentMonth: false,
      date: `${dateYear}-${String(dateMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    });
  }

  return days;
}

export function useCalendarData(year: number, month: number) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [confirmedCreatedEventTitle, setConfirmedCreatedEventTitle] = useState('');
  const eventsRequestSequenceRef = useRef(0);
  const [today] = useState(() => new Date());
  const todayKey = toDateKey(today);

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

  const prepareForMonthChange = useCallback(() => {
    setLoading(true);
    setLoadError('');
  }, []);

  useEffect(() => {
    void fetchEvents();
    return () => {
      eventsRequestSequenceRef.current += 1;
    };
  }, [fetchEvents]);

  const calendarDays = useMemo(() => buildCalendarDays(year, month), [year, month]);
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((eventItem) => {
      const dateKey = eventItem.event_date?.slice(0, 10);
      if (dateKey) {
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(eventItem);
      }
    });

    topics.forEach((topic) => {
      if (!topic.deadline) return;
      const dateKey = topic.deadline.slice(0, 10);
      if (!map[dateKey]) map[dateKey] = [];
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
    });

    return map;
  }, [events, topics]);

  const monthEvents = useMemo(() => Object.values(eventsByDate).flat(), [eventsByDate]);
  const todayEvents = eventsByDate[todayKey] || [];
  const thisWeekPublishCount = monthEvents.filter((eventItem) => eventItem.event_type === 'publish').length;
  const shootingCount = monthEvents.filter((eventItem) => eventItem.event_type === 'shooting').length;
  const deadlineCount = monthEvents.filter((eventItem) => eventItem.event_type === 'deadline').length;
  const upcomingEvents = useMemo(
    () => monthEvents
      .filter((eventItem) => eventItem.event_date?.slice(0, 10) >= todayKey)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
      .slice(0, 5),
    [monthEvents, todayKey],
  );

  return {
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
  };
}
