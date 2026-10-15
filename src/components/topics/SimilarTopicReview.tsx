import BaseModal from '../common/BaseModal';
import ActionButton from '../studio/ActionButton';
import type { SimilarTopic } from '../../utils/topic-title-similarity';

type SimilarTopicReviewProps = {
  open: boolean;
  title: string;
  topics: SimilarTopic[];
  checkFailed?: boolean;
  continueLabel: string;
  onCancel: () => void;
  onContinue: () => void;
};

const statusLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  production: '创作中',
  shooting: '制作中',
  publishing: '发布中',
  completed: '已完成',
};

export default function SimilarTopicReview({
  open,
  title,
  topics,
  checkFailed = false,
  continueLabel,
  onCancel,
  onContinue,
}: SimilarTopicReviewProps) {
  return (
    <BaseModal
      open={open}
      onClose={onCancel}
      title={topics.length > 0 ? '发现标题相似的选题' : '暂时无法检查相似选题'}
      description={topics.length > 0
        ? '以下结果来自当前账号可查看的选题，仅作重复创作提醒，不代表内容重复。'
        : '为避免重复，请确认是否仍要继续。检查失败不会阻止你后续提报。'}
      size="md"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton type="button" variant="ghost" onClick={onCancel}>返回修改</ActionButton>
          <ActionButton type="button" variant="primary" onClick={onContinue}>{continueLabel}</ActionButton>
        </div>
      )}
    >
      <div className="space-y-4">
        <p className="rounded-xl border border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-sm font-medium text-studio-text-primary">
          当前标题：{title}
        </p>
        {topics.length > 0 ? (
          <ul aria-label="标题相似的已有选题" className="space-y-2">
            {topics.map((topic) => (
              <li key={topic.id} className="rounded-xl border border-studio-border-soft px-4 py-3">
                <p className="font-medium text-studio-text-primary">{topic.title}</p>
                <p className="mt-1 text-xs text-studio-text-muted">{statusLabels[topic.status] || '状态待确认'}</p>
              </li>
            ))}
          </ul>
        ) : checkFailed ? (
          <p role="status" className="text-sm leading-6 text-studio-text-secondary">
            当前无法完成相似选题检查。你可以返回稍后重试，也可以确认后继续。
          </p>
        ) : null}
      </div>
    </BaseModal>
  );
}
