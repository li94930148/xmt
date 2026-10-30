import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Clock, Database, Download, HardDrive, RefreshCw, Shield, TriangleAlert } from 'lucide-react';
import { downloadInventoryBackup, getBackupInventory, type BackupInventory } from '../api/backup';
import { ActionButton, EmptyState, ErrorState, GlassPanel, LoadingState, MetricCard, PageHeader, PageShell, StatusPill } from '../components/studio';
import { formatBeijingDate } from '../lib/utils';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import { useAppStore } from '../store';
import { useBackupCreateRecovery } from '../hooks/useBackupCreateRecovery';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function BackupPage() {
  const appStore = useAppStore();
  const [inventory, setInventory] = useState<BackupInventory>({ files: [], sources: [] });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [confirmedBackupNotice, setConfirmedBackupNotice] = useState('');
  const inventoryRequestGenerationRef = useRef(0);

  const load = useCallback(async (): Promise<{ status: 'loaded' | 'failed' | 'stale'; requestId: number }> => {
    const requestId = ++inventoryRequestGenerationRef.current;
    setLoading(true);
    setError('');
    try {
      const nextInventory = await getBackupInventory();
      if (requestId !== inventoryRequestGenerationRef.current) return { status: 'stale', requestId };
      setInventory(nextInventory);
      setConfirmedBackupNotice('');
      return { status: 'loaded', requestId };
    } catch (cause) {
      if (requestId !== inventoryRequestGenerationRef.current) return { status: 'stale', requestId };
      setError(getUserFacingErrorMessage(cause, '服务器备份清单暂时无法读取，请检查连接后重试。'));
      return { status: 'failed', requestId };
    } finally {
      if (requestId === inventoryRequestGenerationRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleBackupConfirmed = useCallback(async (result: { name: string }, recovered: boolean) => {
    appStore.addNotification({
      title: recovered ? '备份结果已核实' : '备份成功',
      message: `已创建 ${result.name}`,
      type: 'success',
    });
    const refresh = await load();
    if (refresh.status === 'failed' && refresh.requestId === inventoryRequestGenerationRef.current) {
      setConfirmedBackupNotice(`服务端已确认备份 ${result.name}，但备份清单刷新失败；请重新加载清单确认，不要重复创建。`);
    }
  }, [appStore, load]);
  const backupRecovery = useBackupCreateRecovery(handleBackupConfirmed);

  const totalSize = useMemo(() => inventory.files.reduce((sum, file) => sum + file.size, 0), [inventory.files]);
  const availableSources = inventory.sources.filter((source) => source.available);
  const unavailableSources = inventory.sources.filter((source) => !source.available);

  const handleCreate = async () => {
    if (backupRecovery.busy || backupRecovery.pending) return;
    setCreating(true);
    try {
      await backupRecovery.start();
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (source: string, name: string) => {
    try {
      await downloadInventoryBackup(source, name);
      appStore.addNotification({ title: '开始下载', message: name, type: 'success' });
    } catch (cause) {
      appStore.addNotification({
        title: '下载失败',
        message: getUserFacingErrorMessage(cause, '备份文件下载失败，请检查连接后重试。'),
        type: 'error',
      });
    }
  };

  return (
    <PageShell className="mx-auto max-w-[1400px] pb-12">
      <PageHeader
        title="备份管理"
        description="统一查看应用备份、部署应急备份和服务器定时备份"
        actions={(
          <>
            <ActionButton type="button" onClick={() => void load()} disabled={loading} className="min-h-10">
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新清单
            </ActionButton>
            <ActionButton type="button" variant="primary" onClick={() => void handleCreate()} disabled={creating || backupRecovery.busy || backupRecovery.phase !== 'idle' || loading || Boolean(confirmedBackupNotice)} aria-busy={creating || backupRecovery.busy} className="min-h-10">
              {creating || backupRecovery.busy ? <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Database aria-hidden="true" className="h-4 w-4" />}{creating || backupRecovery.busy ? '正在处理备份…' : backupRecovery.phase !== 'idle' ? '备份结果待核实' : '立即备份'}
            </ActionButton>
          </>
        )}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="已发现备份" value={inventory.files.length} icon={Archive} tone="primary" />
        <MetricCard title="备份总大小" value={formatSize(totalSize)} icon={Database} tone="cyan" />
        <MetricCard title="已连接来源" value={`${availableSources.length}/${inventory.sources.length}`} icon={HardDrive} tone="success" />
      </section>

      <GlassPanel className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Shield aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-studio-success" />
          <div><p className="text-sm font-medium text-studio-text-primary">多来源只读发现</p><p className="mt-1 text-sm leading-relaxed text-studio-text-secondary">页面只读取服务端允许的备份目录，不扫描业务文件。外部定时备份和部署应急备份可下载，但不能在页面删除。</p></div>
        </div>
      </GlassPanel>

      {confirmedBackupNotice || error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-panel border border-studio-amber/25 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">{confirmedBackupNotice || `备份清单暂不可用：${error}`}</p>
          <ActionButton type="button" onClick={() => void load()} disabled={loading} className="self-start sm:self-auto">
            {loading ? '正在重新加载' : '重新加载清单'}
          </ActionButton>
        </div>
      ) : null}
      {backupRecovery.message ? (
        <div role={backupRecovery.phase === 'storage_error' ? 'alert' : 'status'} aria-live="polite" className="flex flex-col gap-3 rounded-panel border border-studio-amber/25 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">{backupRecovery.message}</p>
          {backupRecovery.phase === 'not_found' ? (
            <ActionButton type="button" onClick={() => void backupRecovery.retry()} disabled={backupRecovery.busy} className="self-start sm:self-auto">使用同一编号明确重试</ActionButton>
          ) : backupRecovery.pending ? (
            <ActionButton type="button" onClick={() => void backupRecovery.verify()} disabled={backupRecovery.busy} className="self-start sm:self-auto">{backupRecovery.busy ? '正在核实…' : '只读核实备份状态'}</ActionButton>
          ) : null}
        </div>
      ) : null}
      {unavailableSources.length > 0 ? <div role="status" className="flex items-start gap-3 rounded-panel border border-studio-amber/25 bg-studio-amber/10 p-4 text-sm"><TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-studio-amber-contrast"/><div><p className="font-medium text-studio-text-primary">有 {unavailableSources.length} 个备份来源当前不可访问</p><p className="mt-1 text-sm leading-relaxed text-studio-text-secondary">{unavailableSources.map((source) => source.label).join('、')}。请检查服务进程权限或备份来源配置。</p></div></div> : null}

      <GlassPanel data-testid="backup-inventory" className="min-w-0">
        <div className="flex min-w-0 flex-col gap-3 border-b border-studio-border-soft px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2"><Archive aria-hidden="true" className="h-5 w-5 shrink-0 text-studio-primary"/><h2 className="font-semibold text-studio-text-primary">服务器备份清单</h2></div>
          {inventory.sources.length > 0 ? <ul aria-label="备份来源状态" className="flex min-w-0 flex-wrap gap-2">{inventory.sources.map((source) => <li key={source.id}><StatusPill tone={source.available ? 'success' : 'muted'}>{source.label} · {source.fileCount} 个文件</StatusPill></li>)}</ul> : null}
        </div>
        {loading && inventory.files.length === 0 ? <div className="px-4 py-8 sm:px-5"><LoadingState variant="list" rows={3} label="正在加载备份清单…" /></div>
          : error && inventory.files.length === 0 ? <div className="p-4 sm:p-5">{confirmedBackupNotice
            ? <EmptyState icon={HardDrive} title="备份清单暂不可用" description="服务端已确认创建备份；请重新加载清单进行核实后再继续。" />
            : <ErrorState title="备份清单暂不可用" description="请重新加载清单后再确认备份状态。" onRetry={() => void load()} />}</div>
            : inventory.files.length === 0 ? <div className="p-4 sm:p-5">{creating
              ? <LoadingState variant="inline" label="正在创建备份…" />
              : <EmptyState icon={HardDrive} title="没有发现备份文件" description={confirmedBackupNotice ? '服务端已确认创建备份；请先重新加载清单进行核实。' : '可先创建应用备份，或检查上方不可访问的来源。'} actionLabel={confirmedBackupNotice ? undefined : '创建首份备份'} onAction={confirmedBackupNotice ? undefined : () => void handleCreate()} />}</div>
              : <ul data-testid="backup-file-list" className="divide-y divide-studio-border-soft">
                {inventory.files.map((backup) => <li key={backup.id || `${backup.source}:${backup.name}`} data-testid="backup-file-row" className="flex min-w-0 items-start gap-3 px-4 py-4 sm:items-center sm:gap-4 sm:px-5">
                  <div aria-hidden="true" className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-card border border-studio-border-soft bg-studio-primary/10 sm:mt-0"><Database className="h-5 w-5 text-studio-primary"/></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p title={backup.name} className="max-w-full truncate text-sm font-medium text-studio-text-primary">{backup.name}</p>
                      {backup.compressed ? <StatusPill tone="violet">已压缩</StatusPill> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-studio-text-secondary">
                      <span>{backup.sourceLabel || '应用内备份'}</span>
                      <span className="inline-flex items-center gap-1"><HardDrive aria-hidden="true" className="h-3 w-3"/>{formatSize(backup.size)}</span>
                      <span className="inline-flex items-center gap-1"><Clock aria-hidden="true" className="h-3 w-3"/>{formatBeijingDate(backup.created)}</span>
                    </div>
                  </div>
                  <ActionButton type="button" onClick={() => void handleDownload(backup.source || 'application', backup.name)} aria-label={`下载备份 ${backup.name}`} className="min-h-10 shrink-0 self-center px-3">
                    <Download aria-hidden="true" className="h-4 w-4" /><span>下载</span>
                  </ActionButton>
                </li>)}
              </ul>}
      </GlassPanel>
    </PageShell>
  );
}
