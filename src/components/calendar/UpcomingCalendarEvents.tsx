import type { CalendarEvent } from '../../api/calendar';
import ActionButton from '../studio/ActionButton';
import GlassPanel from '../studio/GlassPanel';
import StatusPill, { type StatusTone } from '../studio/StatusPill';
import TimelineCard from '../studio/TimelineCard';
import { Plus } from 'lucide-react';

type UpcomingCalendarEventsProps = {
  events: CalendarEvent[];
  eventTypeText: Record<string, string>;
  getEventTone: (eventType?: string) => StatusTone;
  onCreate: () => void;
  onOpenTopic: (topicId: number) => void;
};

export default function UpcomingCalendarEvents({ events, eventTypeText, getEventTone, onCreate, onOpenTopic }: UpcomingCalendarEventsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-studio-text-primary">近期节点</h2>
        <ActionButton type="button" variant="ghost" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          新增
        </ActionButton>
      </div>
      {events.length === 0 ? (
        <GlassPanel className="p-5 text-sm text-studio-text-secondary">近期暂无排期事项。</GlassPanel>
      ) : (
        events.map((eventItem) => (
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
            {eventItem.topic_id ? (
              <ActionButton type="button" variant="ghost" className="mt-2 min-h-11" onClick={() => eventItem.topic_id && onOpenTopic(eventItem.topic_id)}>
                查看关联选题
              </ActionButton>
            ) : null}
          </TimelineCard>
        ))
      )}
    </div>
  );
}
