import { RefreshCw } from 'lucide-react';
import { ActionButton } from '../studio';

export type RetroAssigneeDirectoryStatus = 'loading' | 'ready' | 'restricted' | 'error';

type Props = {
  status: RetroAssigneeDirectoryStatus;
  error: string | null;
  onRetry: () => void;
};

export default function RetroAssigneeDirectoryNotice({ status, error, onRetry }: Props) {
  if (status === 'ready') return null;

  const errorDetail = error && /[\u4e00-\u9fff]/.test(error) && !/成员名单.{0,3}不可用/.test(error)
    ? `：${error}`
    : '';
  const message = status === 'loading'
    ? '正在加载成员名单…'
    : status === 'restricted'
      ? '当前账号暂未确认具备查看成员名单的权限，负责人选择仅限本人或系统默认。'
      : `成员名单暂不可用${errorDetail}。负责人选择可能不完整，可重试后选择其他成员。`;

  return (
    <div
      role={status === 'error' ? 'alert' : 'status'}
      className="mt-2 flex flex-col gap-3 rounded-panel border border-studio-amber/30 bg-studio-amber-soft px-3 py-2 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between"
    >
      <p>{message}</p>
      {status === 'restricted' || status === 'error' ? (
        <ActionButton type="button" variant="secondary" onClick={onRetry} className="shrink-0">
          <RefreshCw className="h-4 w-4" />
          {status === 'restricted' ? '重新检查权限' : '重新加载成员名单'}
        </ActionButton>
      ) : null}
    </div>
  );
}
