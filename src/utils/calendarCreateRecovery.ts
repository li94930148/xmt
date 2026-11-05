import type { CalendarEventCreatePayload } from '../api/calendar';
import type { PendingCalendarCreate } from '../components/calendar/calendarTypes';

const CALENDAR_CREATE_REQUEST_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function calendarCreateRecoveryKey(userId: number) {
  return `xmt:calendar-create-pending:v1:user:${userId}`;
}

export function readPendingCalendarCreate(userId: number): PendingCalendarCreate | null {
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

export function savePendingCalendarCreate(pending: PendingCalendarCreate) {
  try {
    const key = calendarCreateRecoveryKey(pending.userId);
    const serialized = JSON.stringify(pending);
    window.sessionStorage.setItem(key, serialized);
    return window.sessionStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

export function persistPendingCalendarCreatePhase(pending: PendingCalendarCreate) {
  try {
    const stored = readPendingCalendarCreate(pending.userId);
    if (stored?.clientRequestId !== pending.clientRequestId) return false;
    return savePendingCalendarCreate(pending);
  } catch {
    return false;
  }
}

export function clearPendingCalendarCreate(userId: number, clientRequestId: string) {
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

export function buildCalendarCreatePayload(formData: {
  title: string;
  description: string;
  event_type: string;
  topic_id: string;
}, selectedDate: string): CalendarEventCreatePayload {
  return {
    title: formData.title,
    description: formData.description || undefined,
    event_date: selectedDate,
    event_type: formData.event_type,
    topic_id: formData.topic_id ? Number(formData.topic_id) : undefined,
  };
}
