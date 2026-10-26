import type { RetrospectiveUpdateRecoveryState } from '../../api/retrospectives';
import { ActionButton } from '../studio';

type Props = {
  state: RetrospectiveUpdateRecoveryState;
  submitted?: { title: string; summaryMd: string };
  current?: { title: string; summaryMd: string };
  onVerify?: () => void;
  onRetry?: () => void;
  onRetryStorage?: () => void;
  onRefresh?: () => void;
};

function formatValue(value: string) {
  return value.trim() ? value : '（空）';
}

export default function RetroSummaryUpdateRecoveryNotice({ state, submitted, current, onVerify, onRetry, onRetryStorage, onRefresh }: Props) {
  const reviewVisible = state === 'conflict_reedit' || state === 'superseded_reedit';
  const title = state === 'not_found'
    ? '尚未查到这次复盘结论更新记录'
    : state === 'processed_refresh'
      ? '已确认保存，正在刷新复盘'
      : state === 'superseded_reedit'
        ? '保存后结论又有更新，请核对后再继续'
        : state === 'conflict_refresh'
          ? '复盘结论已被更新，正在刷新当前内容'
          : state === 'conflict_reedit'
            ? '复盘已刷新，请核对后手动保存'
            : state === 'rejected_refresh'
              ? '服务器未接受本次结论更新，正在刷新'
              : state === 'storage_error'
                ? '本地恢复记录暂不可用'
                : state === 'posting'
                  ? '正在保存复盘结论'
                  : state === 'checking' || state === 'needs_check'
                    ? '正在只读核实复盘结论保存结果'
                    : '复盘结论保存结果暂时无法核实';
  const message = state === 'not_found'
    ? '服务器明确没有这次请求的回执。内容保持锁定；确认后可用原编号和原内容显式重试。'
    : state === 'processed_refresh'
      ? '不会再次提交；正在只读刷新服务器已确认的内容。'
      : state === 'superseded_reedit'
        ? '原请求已经保存，但之后服务器内容又变化了。本地提交内容仍保留，请对照后修改并另行保存。'
        : state === 'conflict_refresh'
          ? '检测到版本冲突。本地提交内容会保留，刷新完成后供你与服务器当前内容对照。'
          : state === 'conflict_reedit'
            ? '不会重放旧请求。你可以对照两侧内容，手动修改后以新请求保存。'
            : state === 'rejected_refresh'
              ? '正在只读刷新当前内容；本次请求不会自动重发。'
              : state === 'storage_error'
                ? '浏览器无法保存恢复记录，已阻止新的写入。请先复制保留本页文字，再恢复存储后重试。'
                : '确认服务器结果前，结论编辑保持锁定，系统不会自动重发保存请求。';

  return (
    <div role="alert" className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-studio-text-secondary">{message}</p>
      {reviewVisible && submitted && current ? (
        <dl className="mt-3 grid gap-3 rounded-panel bg-studio-surface p-3 md:grid-cols-2">
          <div className="min-w-0">
            <dt className="font-semibold">本次保留</dt>
            <dd className="mt-1 break-words text-studio-text-secondary">标题：{formatValue(submitted.title)}</dd>
            <dd className="mt-1 whitespace-pre-wrap break-words text-studio-text-secondary">结论：{formatValue(submitted.summaryMd)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="font-semibold">服务器当前</dt>
            <dd className="mt-1 break-words text-studio-text-secondary">标题：{formatValue(current.title)}</dd>
            <dd className="mt-1 whitespace-pre-wrap break-words text-studio-text-secondary">结论：{formatValue(current.summaryMd)}</dd>
          </div>
        </dl>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {state === 'not_found' && onRetry ? (
          <ActionButton variant="primary" className="min-h-10 whitespace-normal" onClick={onRetry}>使用原请求编号重试</ActionButton>
        ) : null}
        {state === 'unknown' && onVerify ? (
          <ActionButton variant="ghost" className="min-h-10 whitespace-normal" onClick={onVerify}>重新核实结果</ActionButton>
        ) : null}
        {state === 'storage_error' && onRetryStorage ? (
          <ActionButton variant="ghost" className="min-h-10 whitespace-normal" onClick={onRetryStorage}>重试保存恢复记录</ActionButton>
        ) : null}
        {(state === 'processed_refresh' || state === 'conflict_refresh' || state === 'rejected_refresh') && onRefresh ? (
          <ActionButton variant="ghost" className="min-h-10 whitespace-normal" onClick={onRefresh}>只读刷新当前复盘</ActionButton>
        ) : null}
      </div>
    </div>
  );
}
