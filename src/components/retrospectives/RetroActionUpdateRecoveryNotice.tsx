import type { RetroActionUpdateRecoveryState } from '../../api/retrospectives';
import type { RetroAction, UpdateRetroActionPayload } from '../../api/retrospectives';
import { ActionButton } from '../studio';
import { retroActionStatusLabels } from './retroLabels';

type Props = {
  state: RetroActionUpdateRecoveryState;
  submittedDraft?: UpdateRetroActionPayload;
  currentAction?: RetroAction;
  onVerify?: () => void;
  onRetry?: () => void;
  onRefresh?: () => void;
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '（空）';
  return String(value);
}

export default function RetroActionUpdateRecoveryNotice({ state, submittedDraft, currentAction, onVerify, onRetry, onRefresh }: Props) {
  const reviewRows: Array<{ label: string; submitted: string; current: string }> = [];
  if (state === 'conflict_reedit' && submittedDraft && currentAction) {
    if (submittedDraft.title !== undefined) reviewRows.push({ label: '标题', submitted: formatValue(submittedDraft.title), current: formatValue(currentAction.title) });
    if (submittedDraft.descriptionMd !== undefined) reviewRows.push({ label: '说明', submitted: formatValue(submittedDraft.descriptionMd), current: formatValue(currentAction.descriptionMd) });
    if (submittedDraft.ownerId !== undefined) reviewRows.push({ label: '负责人编号', submitted: formatValue(submittedDraft.ownerId), current: formatValue(currentAction.ownerName || currentAction.ownerId) });
    if (submittedDraft.dueDate !== undefined) reviewRows.push({ label: '截止日期', submitted: formatValue(submittedDraft.dueDate), current: formatValue(currentAction.dueDate) });
    if (submittedDraft.status !== undefined) reviewRows.push({ label: '状态', submitted: retroActionStatusLabels[submittedDraft.status], current: retroActionStatusLabels[currentAction.status] });
    if (submittedDraft.resultMd !== undefined) reviewRows.push({ label: '处理结果', submitted: formatValue(submittedDraft.resultMd), current: formatValue(currentAction.resultMd) });
  }
  const title = state === 'not_found'
    ? '尚未查到这次行动项更新记录'
    : state === 'processed_refresh'
      ? '已确认更新，正在刷新行动项'
      : state === 'conflict_refresh'
        ? '行动项内容已变化，正在刷新当前内容'
        : state === 'conflict_reedit'
          ? '行动项已刷新，请核对后手动保存'
        : state === 'rejected_refresh'
          ? '服务器未接受本次更新，正在刷新当前内容'
        : state === 'storage_error'
          ? '本地恢复记录暂不可用'
          : state === 'posting'
            ? '正在保存行动项'
            : state === 'checking' || state === 'needs_check'
              ? '正在只读核实更新结果'
              : '行动项更新结果暂时无法核实';

  const message = state === 'not_found'
    ? '当前内容保持锁定。确认后可使用原请求编号和原内容安全重试。'
    : state === 'processed_refresh'
      ? '不会再次提交；只读刷新成功后，操作才会解除锁定。'
      : state === 'conflict_refresh'
        ? '当前表单暂时锁定；只读刷新完成后会保留本次内容供你核对，不会自动重放。'
      : state === 'conflict_reedit'
        ? '服务器已刷新；表单保留本次未提交内容，请对照后手动编辑/保存。'
      : state === 'rejected_refresh'
        ? '先确认当前行动项内容和权限，再重新编辑后保存。'
        : state === 'storage_error'
          ? '为避免重复写入，当前行动项保持锁定；刷新页面后会重新读取恢复记录。'
          : '在确认结果前，当前行动项保持锁定，不会自动重发更新请求。';

  return (
    <div role="alert" className="mt-2 rounded-button border border-studio-border-soft bg-studio-surface-soft p-2 text-xs text-studio-text-primary">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-studio-text-secondary">{message}</p>
      {reviewRows.length > 0 ? (
        <dl className="mt-2 space-y-2 rounded-button bg-studio-surface px-2 py-2">
          {reviewRows.map((row) => (
            <div key={row.label}>
              <dt className="font-semibold">{row.label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-studio-text-secondary">本次保留：{row.submitted}</dd>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-studio-text-secondary">服务器当前：{row.current}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-2 flex flex-col gap-2">
        {state === 'not_found' && onRetry ? (
          <ActionButton variant="primary" className="min-h-10 whitespace-normal" onClick={onRetry}>使用原请求编号重试</ActionButton>
        ) : null}
        {state === 'unknown' && onVerify ? (
          <ActionButton variant="ghost" className="min-h-10 whitespace-normal" onClick={onVerify}>重新核实结果</ActionButton>
        ) : null}
        {(state === 'processed_refresh' || state === 'conflict_refresh' || state === 'rejected_refresh') && onRefresh ? (
          <ActionButton variant="ghost" className="min-h-10 whitespace-normal" onClick={onRefresh}>只读刷新当前复盘</ActionButton>
        ) : null}
      </div>
    </div>
  );
}
