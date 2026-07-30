import { useCallback, useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import FormModal from './common/FormModal';
import LoadingState from './common/LoadingState';
import { getPublicAnonymousFeedback, submitAnonymousFeedback, type AnonymousFeedbackType, type PublicAnonymousFeedback } from '../api/anonymousFeedback';
import { useAppStore } from '../store';
import { formatBeijingDate } from '../lib/utils';

const types: Array<{ value: AnonymousFeedbackType; label: string }> = [
  { value: 'feature', label: '功能建议' },
  { value: 'usage', label: '使用问题' },
  { value: 'process', label: '流程优化' },
  { value: 'team', label: '团队建议' },
  { value: 'other', label: '其他' },
];

const typeLabels = Object.fromEntries(types.map((item) => [item.value, item.label])) as Record<AnonymousFeedbackType, string>;

export default function AnonymousFeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [feedback, setFeedback] = useState<PublicAnonymousFeedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<AnonymousFeedbackType | ''>('');
  const [content, setContent] = useState('');
  const [needReply, setNeedReply] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const addNotification = useAppStore((state) => state.addNotification);

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    try {
      setFeedback(await getPublicAnonymousFeedback());
    } catch (error) {
      addNotification({ title: '加载失败', message: error instanceof Error ? error.message : '无法获取意见列表', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    if (open) void loadFeedback();
  }, [loadFeedback, open]);

  const handleClose = () => {
    setType(''); setContent(''); setNeedReply(false); onClose();
  };

  const handleSubmit = async () => {
    if (!type || !content.trim()) {
      addNotification({ title: '请完善意见', message: '意见类型和意见内容均为必填项', type: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      await submitAnonymousFeedback({ type, content: content.trim(), needReply });
      setType(''); setContent(''); setNeedReply(false);
      await loadFeedback();
      addNotification({ title: '提交成功', message: '感谢你的声音，意见已匿名发布', type: 'success' });
    } catch (error) {
      addNotification({ title: '提交失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal open={open} onCancel={handleClose} onSubmit={handleSubmit} loading={submitting} size="lg" title="匿名意见箱" description="所有意见均匿名展示，管理员回复后团队成员都能看到" submitText="提交意见">
      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-studio-text-primary">大家的意见</h3>
            <span className="text-xs text-studio-text-muted">共 {feedback.length} 条</span>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-card border border-studio-border-soft bg-white/[0.025]">
            {loading ? <LoadingState type="inline" text="正在加载意见..." className="p-5" /> : feedback.length > 0 ? (
              <div className="divide-y divide-studio-border-soft">
                {feedback.map((item) => (
                  <article key={item.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full border border-studio-border-soft bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-studio-text-secondary">{typeLabels[item.type]}</span>
                      <time className="text-xs text-studio-text-muted">{formatBeijingDate(item.created_at)}</time>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-studio-text-primary">{item.content}</p>
                    {item.reply_content ? (
                      <div className="mt-3 rounded-button border border-studio-primary/20 bg-studio-primary/8 p-3">
                        <p className="text-xs font-semibold text-studio-cyan">管理员回复</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{item.reply_content}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <MessageSquareText className="h-6 w-6 text-studio-text-muted" />
                <p className="mt-3 text-sm font-medium text-studio-text-secondary">还没有意见</p>
                <p className="mt-1 text-xs text-studio-text-muted">成为第一个留下想法的人</p>
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-studio-border-soft pt-5">
          <h3 className="mb-4 text-sm font-semibold text-studio-text-primary">提出新意见</h3>
          <div className="space-y-4">
            <label className="block text-sm font-medium text-studio-text-secondary">
              意见类型 <span className="text-studio-coral">*</span>
              <select value={type} onChange={(event) => setType(event.target.value as AnonymousFeedbackType)} className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2.5 text-studio-text-primary outline-none transition focus:border-studio-border-active">
                <option value="">请选择意见类型</option>
                {types.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-studio-text-secondary">
              意见内容 <span className="text-studio-coral">*</span>
              <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} rows={4} placeholder="请输入你的想法..." className="mt-2 w-full resize-y rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2.5 text-studio-text-primary outline-none transition placeholder:text-studio-text-muted focus:border-studio-border-active" />
              <span className="mt-1 block text-right text-xs text-studio-text-muted">{content.length}/2000</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-studio-text-secondary">
              <input type="checkbox" checked={needReply} onChange={(event) => setNeedReply(event.target.checked)} className="h-4 w-4 rounded border-studio-border-soft accent-studio-primary" />
              希望收到管理员回复
            </label>
          </div>
        </section>
      </div>
    </FormModal>
  );
}
