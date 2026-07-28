import { useState } from 'react';
import FormModal from './common/FormModal';
import { submitAnonymousFeedback, type AnonymousFeedbackType } from '../api/anonymousFeedback';
import { useAppStore } from '../store';

const types: Array<{ value: AnonymousFeedbackType; label: string }> = [
  { value: 'feature', label: '功能建议' },
  { value: 'usage', label: '使用问题' },
  { value: 'process', label: '流程优化' },
  { value: 'team', label: '团队建议' },
  { value: 'other', label: '其他' },
];

export default function AnonymousFeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<AnonymousFeedbackType | ''>('');
  const [content, setContent] = useState('');
  const [needReply, setNeedReply] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const addNotification = useAppStore((state) => state.addNotification);

  const resetAndClose = () => {
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
      addNotification({ title: '提交成功', message: '感谢你的声音，意见已匿名提交', type: 'success' });
      resetAndClose();
    } catch (error) {
      addNotification({ title: '提交失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal open={open} onCancel={resetAndClose} onSubmit={handleSubmit} loading={submitting} title="提交匿名意见" description="不会记录或关联你的账号信息" submitText="提交意见">
      <div className="space-y-5">
        <label className="block text-sm font-medium text-studio-text-secondary">
          意见类型 <span className="text-studio-coral">*</span>
          <select value={type} onChange={(event) => setType(event.target.value as AnonymousFeedbackType)} className="mt-2 w-full rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2.5 text-studio-text-primary outline-none transition focus:border-studio-border-active">
            <option value="">请选择意见类型</option>
            {types.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-studio-text-secondary">
          意见内容 <span className="text-studio-coral">*</span>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} rows={6} placeholder="请输入你的想法..." className="mt-2 w-full resize-y rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2.5 text-studio-text-primary outline-none transition placeholder:text-studio-text-muted focus:border-studio-border-active" />
          <span className="mt-1 block text-right text-xs text-studio-text-muted">{content.length}/2000</span>
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-studio-text-secondary">
          <input type="checkbox" checked={needReply} onChange={(event) => setNeedReply(event.target.checked)} className="h-4 w-4 rounded border-studio-border-soft accent-studio-primary" />
          希望收到反馈
        </label>
      </div>
    </FormModal>
  );
}
