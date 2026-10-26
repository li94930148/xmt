import { ExternalLink } from 'lucide-react';
import GlassPanel from '@/components/studio/GlassPanel';
import { formatBeijingTime } from '@/lib/utils';
import { normalizeLegacyEditorHtmlTheme } from '@/utils/editorTheme';
import { sanitizeHtml } from '@/utils/sanitizeHtml';
import { getPlatformLabel } from '@/platform/platform-labels';
import { getSafeArchiveHttpUrl, type PublishedArchiveSnapshot } from './parseLegacyPublishedArchive';

const metricLabels = [
  { field: 'views', label: '播放' },
  { field: 'likes', label: '点赞' },
  { field: 'shares', label: '分享' },
  { field: 'comments', label: '评论' },
] as const;

function displayTime(value?: string) {
  return value ? formatBeijingTime(value) || value : '未记录';
}

function displayPlatform(value?: string) {
  const normalized = value?.trim();
  if (!normalized) return '平台未记录';
  return getPlatformLabel(normalized);
}

function displayStatus(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'published') return '已发布';
  if (normalized === 'scheduled') return '已定时';
  if (normalized === 'pending') return '待发布';
  if (normalized === 'failed' || normalized === 'exception') return '发布异常';
  return normalized ? '处理状态待确认' : '未记录';
}

function statusBadgeClass(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'published') return 'border-studio-success/25 bg-studio-success/10 text-studio-success-contrast';
  if (normalized === 'scheduled' || normalized === 'pending') return 'border-studio-amber/25 bg-studio-amber/10 text-studio-amber-contrast';
  if (normalized === 'failed' || normalized === 'exception') return 'border-studio-coral/25 bg-studio-coral/10 text-studio-coral-contrast';
  return 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary';
}

function MetricValue({ value }: { value?: number }) {
  return <span>{typeof value === 'number' ? value.toLocaleString('zh-CN') : '—'}</span>;
}

function PublishedRecordCard({ record }: { record: PublishedArchiveSnapshot['publishedRecords'][number] }) {
  const url = getSafeArchiveHttpUrl(record.url);
  return <GlassPanel className="min-w-0 space-y-4 p-4" data-testid="legacy-published-record">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="break-words font-semibold text-studio-text-primary">{displayPlatform(record.platform)}</h4>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(record.status)}`}>{displayStatus(record.status)}</span>
    </div>
    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div><p className="text-xs text-studio-text-muted">发布时间</p><p className="mt-1 break-words text-studio-text-primary">{displayTime(record.publishTime)}</p></div>
      <div><p className="text-xs text-studio-text-muted">数据日期</p><p className="mt-1 break-words text-studio-text-primary">{record.analytics?.dataDate || '未记录'}</p></div>
    </div>
    <div className="grid grid-cols-2 gap-3 border-t border-studio-border-soft pt-3 sm:grid-cols-4">
      {metricLabels.map(({ field, label }) => (
        <div key={field} className="min-w-0">
          <p className="text-xs text-studio-text-muted">{label}</p>
          <p className="mt-1 break-words text-sm font-semibold text-studio-text-primary"><MetricValue value={record.analytics?.[field]} /></p>
        </div>
      ))}
    </div>
    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-studio-cyan-contrast">打开发布链接 <ExternalLink className="h-3.5 w-3.5" /></a> : null}
  </GlassPanel>;
}

export function LegacyPublishedArchiveSnapshotView({ snapshot }: { snapshot: PublishedArchiveSnapshot }) {
  const scriptHtml = snapshot.script?.content
    ? sanitizeHtml(normalizeLegacyEditorHtmlTheme(snapshot.script.content))
    : '';

  return <div className="min-w-0 space-y-4" data-testid="legacy-published-archive-snapshot">
    <GlassPanel className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-studio-text-primary">历史发布快照</h2>
        <span className="text-xs text-studio-text-muted">归档时间：{displayTime(snapshot.archivedAt)}</span>
      </div>
      <p className="text-sm text-studio-text-secondary">以下内容来自系统保存的发布归档；归档会随相关发布同步更新。</p>
      {snapshot.topic ? <div className="space-y-1 border-t border-studio-border-soft pt-3 text-sm">
        {snapshot.topic.title ? <p className="font-medium text-studio-text-primary">{snapshot.topic.title}</p> : null}
        <p className="text-studio-text-secondary">选题平台：{displayPlatform(snapshot.topic.platform)}</p>
        {snapshot.topic.deadline ? <p className="text-studio-text-secondary">截止日期：{snapshot.topic.deadline}</p> : null}
        {snapshot.topic.description ? <p className="break-words text-studio-text-secondary">{snapshot.topic.description}</p> : null}
      </div> : null}
    </GlassPanel>

    {snapshot.script?.content ? <GlassPanel className="min-w-0 space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-studio-text-primary">归档稿件</h3>
        {snapshot.script.version ? <span className="rounded-full border border-studio-border-soft px-2.5 py-1 text-xs text-studio-text-secondary">版本 {snapshot.script.version}</span> : null}
      </div>
      <div
        className="editor-content-preview prose prose-sm max-w-none break-words rounded-card border border-studio-border-soft bg-studio-surface-soft p-4 text-studio-text-secondary"
        data-testid="legacy-archive-script"
        dangerouslySetInnerHTML={{ __html: scriptHtml }}
      />
    </GlassPanel> : null}

    <section className="min-w-0 space-y-3" aria-labelledby="legacy-archive-publishing-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="legacy-archive-publishing-heading" className="font-semibold text-studio-text-primary">发布记录</h3>
        <span className="text-sm text-studio-text-muted">共 {snapshot.publishedRecords.length} 条；各平台数据分别展示</span>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
        {snapshot.publishedRecords.map((record, index) => (
          <PublishedRecordCard key={record.publishingId || `${record.platform}-${record.publishTime || index}`} record={record} />
        ))}
      </div>
    </section>

    {snapshot.shootingComments.length > 0 ? <section className="min-w-0 space-y-3" aria-labelledby="legacy-archive-shooting-heading">
      <h3 id="legacy-archive-shooting-heading" className="font-semibold text-studio-text-primary">制作批注</h3>
      <div className="space-y-2">
        {snapshot.shootingComments.map((comment, index) => <GlassPanel key={`${comment.createdAt || 'comment'}-${index}`} className="min-w-0 space-y-2 p-4">
          <p className="whitespace-pre-wrap break-words text-sm text-studio-text-primary">{comment.content}</p>
          {(comment.operatorName || comment.createdAt) ? <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-studio-text-muted">
            {comment.operatorName ? <span>{comment.operatorName}</span> : null}
            {comment.createdAt ? <span>{displayTime(comment.createdAt)}</span> : null}
          </p> : null}
        </GlassPanel>)}
      </div>
    </section> : null}
  </div>;
}

export function InvalidLegacyPublishedArchiveNotice() {
  return <GlassPanel className="p-4" data-testid="legacy-published-archive-invalid" role="status">
    <h2 className="font-semibold text-studio-text-primary">旧版归档内容暂时无法识别</h2>
    <p className="mt-2 text-sm text-studio-text-secondary">为避免误读或显示原始数据，这份快照暂不展开；原始归档内容未被修改。</p>
  </GlassPanel>;
}
