import { ActionButton, PageHeader, PageShell } from '../components/studio';
import AdminFeedbackTable from '../components/anonymous-feedback/AdminFeedbackTable';
import BaseModal from '../components/common/BaseModal';
import FormModal from '../components/common/FormModal';
import ConfirmModal from '../components/common/ConfirmModal';
import { useAnonymousFeedbackAdmin } from '../hooks/useAnonymousFeedbackAdmin';

export default function AnonymousFeedbackAdmin() {
  const {
    items, loading, selected, setSelected, replying, setReplying, deleting, setDeleting,
    reply, setReply, busy, refreshing, listError, refreshNotice,
    activeDeleteRecovery, activeUpdateRecovery, writeLocked, updateStorageBlocked,
    deleteRecoveryState, deleteRecoveryError, deleteOutcomeNotice,
    updateRecoveryState, updateRecoveryError, updateOutcomeNotice, statusLabels,
    retryList, update, togglePublic, submitReply, remove,
    retryDeleteRecoveryCleanup, retryDeleteStatusCheck,
    retryUpdateRequest, retryUpdateCleanup, retryUpdateStatusCheck,
  } = useAnonymousFeedbackAdmin();

  return <PageShell>
    <PageHeader title="匿名意见管理" description="查看和处理团队成员提交的匿名意见" />
    {activeUpdateRecovery ? <div role="alert" data-testid="feedback-update-recovery" className="mb-4 space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">{updateRecoveryState === 'not_found'
        ? '服务端尚未找到这次修改。核对下方原载荷后，可明确使用相同请求编号重试；其他写操作保持锁定。'
        : updateRecoveryState === 'conflict'
          ? '修改请求发生编号或指纹冲突。所有写操作保持锁定，只能进行只读核实。'
          : updateRecoveryState === 'unavailable'
            ? '修改结果暂时无法核实。请勿重复操作；所有写操作保持锁定。'
            : updateRecoveryState === 'processed_cleanup'
              ? '本次修改已确认，但恢复标记尚未安全清除。写操作继续锁定。'
                : updateRecoveryState === 'target_missing_cleanup'
                  ? '这条意见已不存在，但恢复标记尚未安全清除。写操作继续锁定。'
              : updateRecoveryState === 'rejected_cleanup'
                ? '本次修改已被拒绝，恢复标记尚未安全清除。不会重试该请求，写操作继续锁定。'
                : updateRecoveryState === 'rejected_mark_failed'
                  ? '本次修改已被拒绝，但浏览器未能保存拒绝标记。写操作保持锁定，请重试保存标记。'
                : updateRecoveryState === 'storage_blocked'
                  ? '浏览器恢复信息无法安全读取或保存，因此没有发送新的修改请求；写操作保持锁定。'
                  : updateRecoveryState === 'submitting'
                    ? '正在发送或恢复这次修改；期间其他写操作保持锁定。'
                    : '正在只读核实上次修改结果；核实完成前，其他写操作保持锁定。'}</p>
      <div className="rounded-lg border border-studio-border-soft bg-studio-surface/70 p-3 text-studio-text-secondary">
        <p>原请求编号：<span className="font-mono text-xs">{activeUpdateRecovery.requestId}</span></p>
        <p className="mt-1">修改目标：{activeUpdateRecovery.payload.status ? `状态改为${statusLabels[activeUpdateRecovery.payload.status]}` : ''}{activeUpdateRecovery.payload.is_public !== undefined ? `设为${activeUpdateRecovery.payload.is_public ? '公开' : '隐藏'}` : ''}{activeUpdateRecovery.payload.reply_content !== undefined ? '保存回复' : ''}</p>
        {activeUpdateRecovery.payload.reply_content !== undefined ? <div className="mt-2"><p className="text-xs text-studio-text-muted">原回复内容</p><p className="mt-1 whitespace-pre-wrap break-words">{activeUpdateRecovery.payload.reply_content || '（空内容）'}</p></div> : null}
      </div>
      {updateRecoveryError ? <p className="text-studio-text-secondary">{updateRecoveryError}</p> : null}
      <div className="flex flex-wrap gap-2">
        {updateRecoveryState === 'not_found' && !activeUpdateRecovery.rejected ? <ActionButton variant="primary" onClick={retryUpdateRequest} disabled={busy}>使用原请求重试</ActionButton> : null}
        {updateRecoveryState === 'processed_cleanup' || updateRecoveryState === 'target_missing_cleanup' || updateRecoveryState === 'rejected_cleanup' || updateRecoveryState === 'rejected_mark_failed' || updateRecoveryState === 'storage_blocked' ? <ActionButton variant="secondary" onClick={retryUpdateCleanup} disabled={busy}>{updateRecoveryState === 'rejected_mark_failed' ? '重试保存拒绝标记' : '重试清理恢复标记'}</ActionButton> : null}
        {updateRecoveryState !== 'processed_cleanup' && updateRecoveryState !== 'target_missing_cleanup' && updateRecoveryState !== 'rejected_cleanup' && updateRecoveryState !== 'rejected_mark_failed' && updateRecoveryState !== 'storage_blocked' ? <ActionButton variant="secondary" onClick={retryUpdateStatusCheck} disabled={busy || updateRecoveryState === 'checking' || updateRecoveryState === 'submitting'}>
          {updateRecoveryState === 'checking' ? '正在核实…' : '只读重新核实'}
        </ActionButton> : null}
      </div>
    </div> : updateRecoveryState === 'storage_blocked' ? <div role="alert" className="mb-4 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">浏览器恢复信息无法安全读取，因此暂停所有写操作。</p>
      {updateRecoveryError ? <p className="mt-2 text-studio-text-secondary">{updateRecoveryError}</p> : null}
      <ActionButton variant="secondary" className="mt-3" onClick={() => window.location.reload()}>重新检查</ActionButton>
    </div> : null}
    {updateOutcomeNotice ? <div role="status" className="mb-4 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-secondary">{updateOutcomeNotice}</div> : null}
    {activeDeleteRecovery ? <div role="alert" className="mb-4 space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">{deleteRecoveryState === 'not_found'
        ? '服务端当前没有找到本操作者对这条意见的删除记录。只有明确点击下方按钮才会使用原请求编号重试；其他写操作仍保持锁定。'
        : deleteRecoveryState === 'conflict'
          ? '删除请求编号与操作者或目标意见不匹配，无法安全判断结果；所有写操作保持锁定。'
          : deleteRecoveryState === 'unavailable'
            ? '删除结果暂时无法核实。请勿重复操作；所有写操作保持锁定。'
            : deleteRecoveryState === 'storage_blocked'
              ? '删除结果已确认，但浏览器恢复记录无法安全清除。恢复记录清理前，其他写操作保持锁定。'
              : '正在核实上次删除结果；核实完成前，其他写操作保持锁定。'}</p>
      {deleteRecoveryError ? <p className="text-studio-text-secondary">{deleteRecoveryError}</p> : null}
      <div className="flex flex-wrap gap-2">
        {deleteRecoveryState === 'not_found' ? <ActionButton variant="danger" onClick={() => void remove()} disabled={busy}>使用原请求重试</ActionButton> : null}
        {deleteRecoveryState === 'storage_blocked'
          ? <ActionButton variant="secondary" onClick={retryDeleteRecoveryCleanup} disabled={busy}>{activeDeleteRecovery ? '重试清理恢复记录' : '重新检查'}</ActionButton>
          : <ActionButton variant="secondary" onClick={retryDeleteStatusCheck} disabled={busy || deleteRecoveryState === 'checking' || deleteRecoveryState === 'submitting'}>
            {deleteRecoveryState === 'checking' ? '正在核实…' : '只读重新核实'}
          </ActionButton>}
      </div>
    </div> : deleteRecoveryState === 'storage_blocked' ? <div role="alert" className="mb-4 space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">浏览器恢复信息无法安全读取，因此暂停所有意见写操作。</p>
      {deleteRecoveryError ? <p className="text-studio-text-secondary">{deleteRecoveryError}</p> : null}
      <ActionButton variant="secondary" onClick={retryDeleteRecoveryCleanup}>重新检查</ActionButton>
    </div> : null}
    {deleteOutcomeNotice ? <div role="status" className="mb-4 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">{deleteOutcomeNotice}</div> : null}
    <AdminFeedbackTable
      items={items}
      loading={loading}
      listError={listError}
      refreshNotice={refreshNotice}
      refreshing={refreshing}
      activeDeleteRecovery={Boolean(activeDeleteRecovery)}
      busy={busy}
      writeLocked={writeLocked}
      statusLabels={statusLabels}
      onRetryList={() => void retryList()}
      onView={setSelected}
      onUpdate={(item, status) => void update(item, status)}
      onTogglePublic={(item) => void togglePublic(item)}
      onReply={(item) => { setReplying(item); setReply(item.reply_content || ''); }}
      onDelete={setDeleting}
    />
    <BaseModal open={Boolean(selected)} onClose={() => setSelected(null)} title="意见详情" closeOnEscape><div className="space-y-4 text-sm"><p className="whitespace-pre-wrap leading-7 text-studio-text-primary">{selected?.content}</p>{selected?.reply_content ? <div className="rounded-button bg-studio-surface-soft p-4"><p className="mb-2 text-xs text-studio-text-muted">管理员回复</p><p className="whitespace-pre-wrap text-studio-text-secondary">{selected.reply_content}</p></div> : null}</div></BaseModal>
    <FormModal open={Boolean(replying)} onCancel={() => setReplying(null)} onSubmit={submitReply} loading={writeLocked} title="回复意见" submitText="保存回复">
      <label className="block space-y-2 text-sm text-studio-text-secondary">
        回复内容
        <textarea rows={6} maxLength={2000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="输入回复内容" disabled={writeLocked} className="xmt-field w-full resize-y disabled:opacity-60" />
      </label>
    </FormModal>
    <ConfirmModal
      open={Boolean(deleting)}
      onCancel={() => setDeleting(null)}
      onConfirm={remove}
      loading={busy}
      confirmDisabled={Boolean(activeUpdateRecovery || updateStorageBlocked || deleteRecoveryState === 'storage_blocked' || (activeDeleteRecovery && deleteRecoveryState !== 'not_found'))}
      variant="danger"
      title="删除意见"
      description={deleteRecoveryState === 'storage_blocked' && deleteRecoveryError
        ? deleteRecoveryError
        : activeDeleteRecovery && deleteRecoveryState === 'not_found'
        ? '服务端当前没有找到本操作者对这条意见的删除记录。确认后会使用原请求编号重试；其他写操作仍保持锁定。'
        : activeDeleteRecovery
          ? '上次删除结果尚未核实。确认前请先完成只读核实；核实期间不会再次发送删除请求。'
          : '删除后无法恢复，确认继续吗？'}
      confirmText={activeDeleteRecovery ? '使用原请求重试' : '删除'}
    />
  </PageShell>;
}
