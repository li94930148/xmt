import { useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  Inbox,
  Radio,
  Trash2,
  XCircle,
} from 'lucide-react';
import { ConfirmModal, LoadingState } from '../components/common';
import {
  ActionButton,
  EmptyState,
  GlassPanel,
  MetricCard,
  PageHeader,
  PageShell,
  StatusPill,
} from '../components/studio';
import { formatBeijingTime } from '../lib/utils';
import { MESSAGE_PAGE_SIZE } from './messages/messageRecovery';
import { useMessagesPage, type MessageFilter } from '../hooks/useMessagesPage';

const filters: { key: MessageFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'actionable', label: '待处理' },
  { key: 'system', label: '系统' },
];

const typeMeta: Record<string, { icon: ReactNode; tone: 'success' | 'coral' | 'amber' | 'cyan'; label: string }> = {
  success: { icon: <CheckCircle className="h-5 w-5" />, tone: 'success', label: '完成' },
  error: { icon: <XCircle className="h-5 w-5" />, tone: 'coral', label: '异常' },
  warning: { icon: <AlertTriangle className="h-5 w-5" />, tone: 'amber', label: '提醒' },
  info: { icon: <Info className="h-5 w-5" />, tone: 'cyan', label: '通知' },
};

export default function Messages() {
  const {
    userId,
    messages,
    loading,
    loadError,
    setReloadKey,
    page,
    setPage,
    total,
    summary,
    unreadCount,
    summaryPendingLabel,
    totalPages,
    activeFilter,
    setActiveFilter,
    filteredMessages,
    hasCurrentResults,
    pendingMessageReadAllRecovery,
    messageReadAllRecoveryState,
    messageReadAllRecoveryError,
    messageReadAllOutcomeNotice,
    recheckMessageReadAllRecovery,
    markingAll,
    handleMarkAllAsRead,
    currentActorMarkingMessageIds,
    currentSingleMessageReadVerification,
    verifyingSingleMessageReadActors,
    verifyPendingSingleMessageRead,
    currentActorClearing,
    currentPendingClearRecovery,
    currentClearRecoveryState,
    currentClearOutcomeNotice,
    currentShowClearConfirm,
    setClearConfirmActorId,
    setShowClearConfirm,
    handleClearAll,
    handleMessageClick,
  } = useMessagesPage();

  useEffect(() => {
    const refreshMessages = () => setReloadKey((current) => current + 1);
    window.addEventListener('xmt-messages-refresh', refreshMessages);
    return () => window.removeEventListener('xmt-messages-refresh', refreshMessages);
  }, [setReloadKey]);

  return (
    <>
      <PageShell>
        <PageHeader
          title="消息中心"
          description="聚合协作提醒、审核反馈和系统通知，优先处理仍未读的内容节点。"
          actions={
            <>
              {(pendingMessageReadAllRecovery && messageReadAllRecoveryState === 'unavailable') || messageReadAllRecoveryError ? (
                <ActionButton type="button" variant="ghost" onClick={recheckMessageReadAllRecovery} disabled={markingAll}>
                  只读核实
                </ActionButton>
              ) : null}
              <ActionButton onClick={handleMarkAllAsRead}
                disabled={loading || markingAll || (currentActorMarkingMessageIds?.size ?? 0) > 0 || currentSingleMessageReadVerification !== null || messageReadAllRecoveryError !== null
                  || (pendingMessageReadAllRecovery !== null && messageReadAllRecoveryState !== 'not_found')
                  || ((unreadCount === null || unreadCount === 0) && !(pendingMessageReadAllRecovery && messageReadAllRecoveryState === 'not_found'))}>
                <CheckCircle2 className="h-4 w-4" />
                {markingAll || messageReadAllRecoveryState === 'checking' || messageReadAllRecoveryState === 'submitting'
                  ? '处理中'
                  : messageReadAllRecoveryError || messageReadAllRecoveryState === 'unavailable'
                    ? '结果待核实'
                    : pendingMessageReadAllRecovery && messageReadAllRecoveryState === 'not_found'
                      ? '确认重试全部已读'
                      : '全部已读'}
              </ActionButton>
              <ActionButton onClick={() => {
                if (userId == null) return;
                setClearConfirmActorId(userId);
                setShowClearConfirm(true);
              }} variant="danger" disabled={currentActorClearing}>
                <Trash2 className="h-4 w-4" />
                {currentPendingClearRecovery ? '核实清空' : '清空'}
              </ActionButton>
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="未读消息"
            value={summary ? summary.unread : <span role="status" aria-live="polite">{summaryPendingLabel}</span>}
            trend={summary ? { label: '需要关注', up: summary.unread === 0 } : undefined}
            icon={Bell}
            tone="cyan"
          />
          <MetricCard
            title="待处理跳转"
            value={summary ? summary.actionable : summaryPendingLabel}
            trend={summary ? { label: '关联业务页面', up: summary.actionable === 0 } : undefined}
            icon={Radio}
            tone="violet"
          />
          <MetricCard
            title="消息总量"
            value={summary ? summary.total : summaryPendingLabel}
            trend={summary ? { label: '本地通知流', up: true } : undefined}
            icon={Inbox}
            tone="amber"
          />
        </div>

        <GlassPanel className="overflow-hidden">
          {currentSingleMessageReadVerification ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-3 border-b border-studio-amber/30 bg-studio-amber/10 px-5 py-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0">《{currentSingleMessageReadVerification.message.title}》的已读状态暂时无法确认。只读核实前不会再次提交。{currentSingleMessageReadVerification.error ? ` ${currentSingleMessageReadVerification.error}` : ''}</p>
              <ActionButton
                type="button"
                disabled={verifyingSingleMessageReadActors.has(userId ?? -1)}
                onClick={() => void verifyPendingSingleMessageRead()}
              >
                {verifyingSingleMessageReadActors.has(userId ?? -1) ? '核实中…' : '只读核实'}
              </ActionButton>
            </div>
          ) : null}
          {messageReadAllOutcomeNotice ? (
            <div role="status" className="border-b border-studio-border-soft bg-studio-primary-soft px-5 py-3 text-sm leading-6 text-studio-text-primary">
              {messageReadAllOutcomeNotice}
            </div>
          ) : null}
          {currentClearOutcomeNotice ? (
            <div role="status" className="border-b border-studio-border-soft bg-studio-primary-soft px-5 py-3 text-sm leading-6 text-studio-text-primary">
              {currentClearOutcomeNotice}
            </div>
          ) : null}
          <div className="flex flex-col gap-3 border-b border-studio-border-soft px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div role="group" aria-label="消息筛选" className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={activeFilter === filter.key}
                  onClick={() => {
                    setPage(1);
                    setActiveFilter(filter.key);
                  }}
                  className={`min-h-10 rounded-button border px-3 py-2 text-sm font-semibold leading-snug transition ${
                    activeFilter === filter.key
                      ? 'border-studio-border-active bg-studio-primary/14 text-studio-text-primary'
                      : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary hover:border-studio-border-active hover:text-studio-text-primary'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <span className="text-sm text-studio-text-secondary">本页 {filteredMessages.length} 条，共 {total} 条</span>
          </div>

          {loading ? (
            <div className="px-6 py-12">
              <LoadingState type="section" text="正在同步消息流..." />
            </div>
          ) : loadError && !hasCurrentResults ? (
            <div className="flex flex-col items-center gap-4 p-6">
              <EmptyState icon={AlertTriangle} title="消息加载失败" description={loadError} />
              <ActionButton type="button" onClick={() => setReloadKey((current) => current + 1)}>重试加载</ActionButton>
            </div>
          ) : (
            <>
              {loadError ? (
                <div role="alert" className="flex flex-col gap-3 border-b border-studio-amber/30 bg-studio-amber/10 px-5 py-4 text-studio-text-primary md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-studio-amber-contrast" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">刷新失败，仍显示上次成功加载的消息</p>
                      <p className="mt-1 break-words text-sm text-studio-text-secondary">{loadError} 当前内容可能不是最新。</p>
                    </div>
                  </div>
                  <ActionButton type="button" onClick={() => setReloadKey((current) => current + 1)}>重新加载</ActionButton>
                </div>
              ) : null}
              {messages.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Bell} title="暂无消息" description="协作通知、审核反馈和系统提醒会出现在这里。" />
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Inbox} title="当前筛选无消息" description="切换筛选条件查看其他消息类型。" />
                </div>
              ) : (
                <div className="divide-y divide-studio-border-soft">
                  {filteredMessages.map((message) => {
                    const meta = typeMeta[message.type] || typeMeta.info;
                    const isMarking = currentActorMarkingMessageIds?.has(message.id) ?? false;
                    const isReadLocked = !message.read
                      && (currentSingleMessageReadVerification !== null || (currentActorMarkingMessageIds?.size ?? 0) > 0);

                    return (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => handleMessageClick(message)}
                        disabled={isMarking || isReadLocked}
                        aria-busy={isMarking}
                        className={`group w-full px-5 py-4 text-left transition hover:bg-studio-surface-soft ${
                          !message.read ? 'bg-studio-primary/[0.055] shadow-[inset_3px_0_0_rgb(var(--xmt-cyan-rgb)_/_0.65)]' : ''
                        } ${isMarking ? 'cursor-wait' : message.link ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border bg-studio-surface-soft ${
                            meta.tone === 'success'
                              ? 'border-studio-success/35 text-studio-success-contrast'
                              : meta.tone === 'coral'
                                ? 'border-studio-coral/35 text-studio-coral-contrast'
                                : meta.tone === 'amber'
                                  ? 'border-studio-amber/35 text-studio-amber-contrast'
                                  : 'border-studio-cyan/35 text-studio-cyan-contrast'
                          }`}
                          >
                            {meta.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-studio-text-primary">{message.title}</h2>
                              <StatusPill tone={message.read ? 'muted' : 'cyan'}>{isMarking ? '标记中' : message.read ? '已读' : '未读'}</StatusPill>
                              {message.link ? <ExternalLink className="h-4 w-4 text-studio-text-secondary transition-colors group-hover:text-studio-text-primary" /> : null}
                            </div>
                            <p className="mt-1 text-sm leading-6 text-studio-text-secondary">{message.content}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-studio-text-muted">
                              <span>{formatBeijingTime(message.created_at)}</span>
                              <span>{meta.label}</span>
                              {message.link ? <span className="text-studio-cyan-contrast">可进入关联页面</span> : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {!loading && (!loadError || hasCurrentResults) && total > MESSAGE_PAGE_SIZE ? (
            <div className="flex flex-col gap-3 border-t border-studio-border-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-studio-text-secondary">共 {total} 条，第 {page} / {totalPages} 页</span>
              <div className="flex items-center gap-2">
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> 上一页
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  下一页 <ChevronRight className="h-4 w-4" />
                </ActionButton>
              </div>
            </div>
          ) : null}
        </GlassPanel>
      </PageShell>

      <ConfirmModal
        open={currentShowClearConfirm}
        title={currentPendingClearRecovery ? '核实清空消息结果' : '确认清空消息'}
        description={currentPendingClearRecovery
          ? currentClearRecoveryState === 'checking'
            ? '正在只读核实此前的清空请求；核实期间不会再次发送删除。'
            : currentClearRecoveryState === 'unavailable'
              ? '暂时无法核实此前的清空请求。恢复编号已保留，点击“只读重新核实”再次查询，不会重复删除。'
              : currentClearRecoveryState === 'not_found'
                ? '服务器暂未找到此前请求的完成记录。确认后将沿用原请求编号；如果原请求稍后完成，服务器会返回原结果，避免再次删除后来到达的消息。本次显式重试仍会清空当时账户内的消息。'
                : '清空请求正在提交，请稍候。'
          : '确定要清空当前账户的所有消息吗？操作不可恢复；若响应丢失，系统会先核实原请求，不会盲目重复清空。'}
        confirmText={currentPendingClearRecovery
          ? currentClearRecoveryState === 'unavailable' ? '只读重新核实' : currentClearRecoveryState === 'not_found' ? '同编号安全重试' : '正在核实'
          : '确认清空'}
        cancelText="取消"
        variant="danger"
        loading={currentActorClearing}
        confirmDisabled={currentActorClearing || Boolean(currentPendingClearRecovery && currentClearRecoveryState !== 'unavailable' && currentClearRecoveryState !== 'not_found')}
        onConfirm={handleClearAll}
        onCancel={() => {
          if (!currentActorClearing) {
            setShowClearConfirm(false);
          }
        }}
      />
    </>
  );
}
