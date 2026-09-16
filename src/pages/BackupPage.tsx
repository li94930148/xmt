import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Clock, Database, Download, HardDrive, RefreshCw, Shield, TriangleAlert } from 'lucide-react';
import { createBackup, downloadInventoryBackup, getBackupInventory, type BackupInventory } from '../api/backup';
import { formatBeijingDate } from '../lib/utils';
import { useAppStore } from '../store';

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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setInventory(await getBackupInventory());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '服务器备份清单加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalSize = useMemo(() => inventory.files.reduce((sum, file) => sum + file.size, 0), [inventory.files]);
  const availableSources = inventory.sources.filter((source) => source.available);
  const unavailableSources = inventory.sources.filter((source) => !source.available);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createBackup();
      appStore.addNotification({ title: '备份成功', message: `已创建 ${result.name}`, type: 'success' });
      await load();
    } catch (cause) {
      appStore.addNotification({ title: '备份失败', message: cause instanceof Error ? cause.message : '创建备份失败', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (source: string, name: string) => {
    try {
      await downloadInventoryBackup(source, name);
      appStore.addNotification({ title: '开始下载', message: name, type: 'success' });
    } catch (cause) {
      appStore.addNotification({ title: '下载失败', message: cause instanceof Error ? cause.message : '下载失败', type: 'error' });
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-12">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-theme-text">备份管理</h1>
          <p className="mt-2 text-sm text-theme-text-muted">统一查看应用备份、部署应急备份和服务器定时备份</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-theme-border bg-theme-secondary px-4 text-sm font-medium disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新清单
          </button>
          <button type="button" onClick={() => void handleCreate()} disabled={creating} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-60">
            {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}{creating ? '备份中…' : '立即备份'}
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-theme-border bg-theme-secondary p-5"><p className="text-xs text-theme-text-muted">已发现备份</p><p className="mt-3 text-3xl font-semibold text-theme-text">{inventory.files.length}</p></div>
        <div className="rounded-2xl border border-theme-border bg-theme-secondary p-5"><p className="text-xs text-theme-text-muted">备份总大小</p><p className="mt-3 text-3xl font-semibold text-theme-text">{formatSize(totalSize)}</p></div>
        <div className="rounded-2xl border border-theme-border bg-theme-secondary p-5"><p className="text-xs text-theme-text-muted">已连接来源</p><p className="mt-3 text-3xl font-semibold text-theme-text">{availableSources.length}/{inventory.sources.length}</p></div>
      </section>

      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          <div><p className="text-sm font-medium text-emerald-500">多来源只读发现</p><p className="mt-1 text-xs leading-5 text-theme-text-muted">页面只读取服务端允许的备份目录，不扫描业务文件。外部定时备份和部署应急备份可下载但不能在页面删除。</p></div>
        </div>
      </section>

      {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error}</div> : null}
      {unavailableSources.length > 0 ? <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"/><div><p className="font-medium text-theme-text">有 {unavailableSources.length} 个备份来源当前不可访问</p><p className="mt-1 text-xs text-theme-text-muted">{unavailableSources.map((source) => source.label).join('、')}。请检查服务进程目录权限或备份目录配置。</p></div></div> : null}

      <section className="overflow-hidden rounded-2xl border border-theme-border bg-theme-secondary">
        <div className="flex flex-col gap-3 border-b border-theme-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><Archive className="h-5 w-5 text-blue-500"/><h2 className="font-semibold text-theme-text">服务器备份清单</h2></div>
          <div className="flex flex-wrap gap-2">{inventory.sources.map((source) => <span key={source.id} className={`rounded-full px-2.5 py-1 text-xs ${source.available ? 'bg-blue-500/10 text-blue-500' : 'bg-theme-tertiary text-theme-text-muted'}`}>{source.label} {source.fileCount}</span>)}</div>
        </div>
        {loading && inventory.files.length === 0 ? <div className="grid min-h-64 place-items-center"><RefreshCw className="h-6 w-6 animate-spin text-theme-text-muted"/></div> : inventory.files.length === 0 ? <div className="grid min-h-64 place-items-center text-center"><div><HardDrive className="mx-auto h-10 w-10 text-theme-text-muted"/><p className="mt-3 text-sm text-theme-text-muted">没有发现备份文件</p><p className="mt-1 text-xs text-theme-text-muted">可先创建应用备份，或检查上方不可访问的来源</p></div></div> : <div className="divide-y divide-theme-border">
          {inventory.files.map((backup) => <div key={backup.id || `${backup.source}:${backup.name}`} className="flex items-center gap-4 px-5 py-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10"><Database className="h-5 w-5 text-blue-500"/></div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium text-theme-text">{backup.name}</p>{backup.compressed ? <span className="rounded bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-500">已压缩</span> : null}</div><div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-theme-text-muted"><span>{backup.sourceLabel || '应用内备份'}</span><span className="inline-flex items-center gap-1"><HardDrive className="h-3 w-3"/>{formatSize(backup.size)}</span><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3"/>{formatBeijingDate(backup.created)}</span></div></div>
            <CheckCircle2 className="hidden h-4 w-4 text-emerald-500 sm:block"/>
            <button type="button" onClick={() => void handleDownload(backup.source || 'application', backup.name)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-theme-border bg-theme-tertiary px-3 text-xs font-medium text-theme-text"><Download className="h-3.5 w-3.5"/>下载</button>
          </div>)}
        </div>}
      </section>
    </div>
  );
}
