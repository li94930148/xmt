import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { CalendarEvent } from '../../api/calendar';
import GlassPanel from '../studio/GlassPanel';
import type { StatusTone } from '../studio/StatusPill';
import type { PendingCalendarFocus } from './calendarTypes';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

type CalendarCell = { day: number; isCurrentMonth: boolean; date: string };

type CalendarGridProps = {
  year: number;
  month: number;
  days: CalendarCell[];
  eventsByDate: Record<string, CalendarEvent[]>;
  activeDate: string;
  onActiveDateChange: (date: string) => void;
  todayKey: string;
  onDayKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, dateKey: string) => void;
  onDateClick: (date: string) => void;
  pendingFocusRef: { current: PendingCalendarFocus | null };
  loading: boolean;
  loadError: string;
  getEventTone: (eventType?: string) => StatusTone;
  eventTypeText: Record<string, string>;
  eventTypeBadgeClass: Record<StatusTone, string>;
  eventTypeDotClass: Record<StatusTone, string>;
};

export default function CalendarGrid({
  year,
  month,
  days,
  eventsByDate,
  activeDate,
  onActiveDateChange,
  todayKey,
  onDayKeyDown,
  onDateClick,
  pendingFocusRef,
  loading,
  loadError,
  getEventTone,
  eventTypeText,
  eventTypeBadgeClass,
  eventTypeDotClass,
}: CalendarGridProps) {
  const dayButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (!pendingFocus || loading || loadError || year !== pendingFocus.year || month !== pendingFocus.month) return;
    const target = dayButtonRefs.current.get(pendingFocus.date);
    if (!target) return;
    target.focus();
    pendingFocusRef.current = null;
  }, [activeDate, loadError, loading, month, pendingFocusRef, year]);

  const isToday = (date: string) => date === todayKey;

  return (
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
                {days.slice(weekIndex * 7, weekIndex * 7 + 7).map((cell) => {
                  const cellEvents = eventsByDate[cell.date] || [];
                  const eventDescriptionId = cellEvents.length > 0 ? `calendar-day-events-${cell.date}` : undefined;

                  return (
                    <div key={cell.date} role="gridcell" className="min-w-0">
                      <button
                        ref={(element) => {
                          if (element) dayButtonRefs.current.set(cell.date, element);
                          else dayButtonRefs.current.delete(cell.date);
                        }}
                        type="button"
                        tabIndex={activeDate === cell.date ? 0 : -1}
                        aria-label={`${cell.date}，${cellEvents.length ? `${cellEvents.length} 项日程` : '无日程'}`}
                        aria-current={isToday(cell.date) ? 'date' : undefined}
                        aria-describedby={eventDescriptionId}
                        onFocus={() => onActiveDateChange(cell.date)}
                        onKeyDown={(event) => onDayKeyDown(event, cell.date)}
                        onClick={() => onDateClick(cell.date)}
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
                            {cellEvents.slice(0, 3).map((eventItem, eventIndex) => (
                              <span key={eventIndex} className={`h-1.5 w-1.5 rounded-full ${eventTypeDotClass[getEventTone(eventItem.event_type)]}`} />
                            ))}
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
  );
}
