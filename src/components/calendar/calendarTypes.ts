import type { CalendarEventCreatePayload } from '../../api/calendar';

export type PendingCalendarCreate = {
  userId: number;
  clientRequestId: string;
  payload: CalendarEventCreatePayload;
  phase: 'uncertain' | 'ready' | 'cleanup-created' | 'cleanup-deleted' | 'cleanup-rejected';
};

export type CalendarEventFormValues = {
  title: string;
  description: string;
  event_type: string;
  topic_id: string;
};

export type PendingCalendarFocus = {
  date: string;
  year: number;
  month: number;
};
