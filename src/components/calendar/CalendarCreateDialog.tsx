import { Calendar as CalendarIcon } from 'lucide-react';
import { FormModal } from '../common';
import type { Topic } from '../../types';
import type { CalendarEventFormValues, PendingCalendarCreate } from './calendarTypes';

type CalendarCreateDialogProps = {
  open: boolean;
  selectedDate: string;
  pendingCalendarCreate: PendingCalendarCreate | null;
  recoveryMessage: string;
  submitting: boolean;
  verifying: boolean;
  formData: CalendarEventFormValues;
  topics: Topic[];
  onCancel: () => void;
  onSubmit: () => void;
  onFormDataChange: (next: CalendarEventFormValues) => void;
};

export default function CalendarCreateDialog({
  open,
  selectedDate,
  pendingCalendarCreate,
  recoveryMessage,
  submitting,
  verifying,
  formData,
  topics,
  onCancel,
  onSubmit,
  onFormDataChange,
}: CalendarCreateDialogProps) {
  return (
    <FormModal
      open={open}
      onCancel={onCancel}
      onSubmit={onSubmit}
      title={
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-studio-cyan" />
          <span>创建事件</span>
        </div>
      }
      description={`日期：${selectedDate}`}
      submitText={pendingCalendarCreate?.phase === 'ready' ? '确认重试创建' : pendingCalendarCreate ? '重新核实' : '创建'}
      cancelText="取消"
      loading={submitting || verifying}
      size="md"
    >
      <div className="space-y-4">
        {pendingCalendarCreate ? (
          <p role="status" aria-live="polite" className="rounded-xl border border-studio-amber/30 bg-studio-surface-soft p-3 text-sm text-studio-text-secondary">
            {recoveryMessage || '请先核实当前请求；不会自动重复创建。'}
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
            onChange={(event) => onFormDataChange({ ...formData, title: event.target.value })}
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
            onChange={(event) => onFormDataChange({ ...formData, description: event.target.value })}
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
            onChange={(event) => onFormDataChange({ ...formData, event_type: event.target.value })}
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
            onChange={(event) => onFormDataChange({ ...formData, topic_id: event.target.value })}
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
  );
}
