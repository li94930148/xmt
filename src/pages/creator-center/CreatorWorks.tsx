import { useCallback, useEffect, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getDouyinWorks, type DouyinWork } from '@/api/creatorCenter';
import { EmptyState, LoadingState, PageHeader, Panel, formatDate, formatNumber } from './shared';
import CreatorCoverImage from '@/components/common/CreatorCoverImage';

const sortOptions = [['score', '表现评分'], ['latest', '最新发布'], ['plays', '最高播放'], ['interactions', '最高互动率'], ['likes', '最高点赞']] as const;

function WorkThumbnail({ work }: { work: DouyinWork }) {
  return <CreatorCoverImage work={work} className="h-14 w-20 shrink-0 rounded-lg object-cover" />;
}

export default function CreatorWorks({ reviewMode = false }: { reviewMode?: boolean }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState('score');
  const [works, setWorks] = useState<DouyinWork[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    const append = Boolean(cursor);
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');

    try {
      const page = await getDouyinWorks(sort, 20, cursor);
      setWorks(current => append
        ? [...new Map([...current, ...page.items].map(work => [work.id, work])).values()]
        : page.items);
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
      setFailedCursor(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '抖音作品库加载失败');
      setFailedCursor(cursor ?? null);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    setWorks([]);
    setNextCursor(null);
    void load();
  }, [load]);

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <PageHeader
      title={reviewMode ? '作品复盘中心' : '作品库'}
      description="作品表现与互动数据"
      loading={loading || loadingMore}
      onRefresh={() => void load()}
      actions={<label className="flex h-10 items-center gap-2 rounded-lg border border-studio-border bg-studio-card px-3 text-sm">
        <ArrowUpDown aria-hidden="true" className="h-4 w-4 text-studio-text-muted" />
        <select
          name="sort"
          aria-label="作品排序"
          value={sort}
          disabled={loading || loadingMore}
          onChange={event => setSort(event.target.value)}
          className="bg-transparent outline-none disabled:opacity-60"
        >
          {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>}
    />

    {error ? <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral-contrast sm:flex-row sm:items-center sm:justify-between">
      <p>{works.length ? `作品列表刷新失败，仍保留已确认的 ${works.length} 条作品。` : '作品列表暂时无法读取。'} {error}</p>
      {failedCursor === null ? <button
        type="button"
        disabled={loading || loadingMore}
        onClick={() => void load()}
        className="shrink-0 rounded-lg border border-studio-border bg-studio-card px-3 py-2 font-medium disabled:opacity-60"
      >重试加载作品</button> : null}
    </div> : null}

    {loading && !works.length ? <LoadingState /> : null}
    {error && !works.length ? <Panel title="作品数据暂不可用"><p className="text-sm text-studio-text-secondary">尚未成功读取作品列表；恢复前不会显示为空库。</p></Panel> : null}
    {!loading && !error && !works.length ? <EmptyState title="没有识别到合法抖音作品" /> : null}
    {works.length > 0 ? <Panel title={`已加载作品（${works.length}）`} description="按综合表现排序">
      <div className="grid gap-3 md:hidden">
        {works.map(work => <button
          key={`mobile-${work.id}`}
          type="button"
          onClick={() => navigate(`/analytics/creator-center/work/${work.id}`)}
          className="w-full rounded-xl border border-studio-border bg-studio-surface p-4 text-left transition hover:border-studio-cyan/50"
        >
          <div className="flex min-w-0 items-center gap-3">
            <WorkThumbnail work={work} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-medium">{work.title}</p>
              <p className="mt-1 text-xs text-studio-text-secondary">{work.content_category || '未分类'}{work.performance.is_viral ? ' · 爆款' : ''}</p>
            </div>
            <span className="shrink-0 text-right"><span className="block text-xs text-studio-text-secondary">评分</span><strong className="mt-1 block text-studio-cyan-contrast">{work.performance.score}</strong></span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-studio-border pt-3 text-sm">
            <span className="flex items-center justify-between gap-2"><span className="text-studio-text-secondary">播放</span><strong>{formatNumber(work.play_count)}</strong></span>
            <span className="flex items-center justify-between gap-2"><span className="text-studio-text-secondary">点赞</span><strong>{formatNumber(work.like_count)}</strong></span>
            <span className="flex items-center justify-between gap-2"><span className="text-studio-text-secondary">互动率</span><strong>{(work.performance.interaction_rate * 100).toFixed(2)}%</strong></span>
            <span className="flex items-center justify-between gap-2"><span className="text-studio-text-secondary">完播率</span><strong>{work.performance.completion_rate_available ? `${(work.performance.completion_rate * 100).toFixed(2)}%` : '—'}</strong></span>
          </div>
        </button>)}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-studio-border text-xs text-studio-text-secondary">
            <tr>
              <th className="pb-3 font-medium">作品</th>
              <th className="pb-3 font-medium">发布时间</th>
              <th className="pb-3 text-right font-medium">评分</th>
              <th className="pb-3 text-right font-medium">播放</th>
              <th className="pb-3 text-right font-medium">点赞</th>
              <th className="pb-3 text-right font-medium">评论</th>
              <th className="pb-3 text-right font-medium">分享</th>
              <th className="pb-3 text-right font-medium">互动率</th>
              <th className="pb-3 text-right font-medium">分享率</th>
              <th className="pb-3 text-right font-medium">完播率</th>
            </tr>
          </thead>
          <tbody>{works.map(work => <tr
            key={work.id}
            onClick={() => navigate(`/analytics/creator-center/work/${work.id}`)}
            className="cursor-pointer border-b border-studio-border/70 transition hover:bg-studio-surface"
          >
            <td className="py-3"><div className="flex max-w-[440px] items-center gap-3">
              <WorkThumbnail work={work} />
              <div className="min-w-0">
                <Link
                  to={`/analytics/creator-center/work/${work.id}`}
                  aria-label={`打开作品 ${work.title}`}
                  onClick={event => event.stopPropagation()}
                  className="line-clamp-2 rounded-sm font-medium text-studio-text-primary transition hover:text-studio-cyan-contrast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-primary/40"
                >{work.title}</Link>
                <p className="mt-1 text-xs text-studio-text-secondary">{work.content_category || '未分类'}{work.performance.is_viral ? ' · 爆款' : ''}</p>
              </div>
            </div></td>
            <td className="py-3 text-studio-text-secondary">{formatDate(work.publish_time, true)}</td>
            <td className="py-3 text-right font-semibold text-studio-cyan">{work.performance.score}</td>
            <td className="py-3 text-right font-medium">{formatNumber(work.play_count)}</td>
            <td className="py-3 text-right">{formatNumber(work.like_count)}</td>
            <td className="py-3 text-right">{formatNumber(work.comment_count)}</td>
            <td className="py-3 text-right">{formatNumber(work.share_count)}</td>
            <td className="py-3 text-right">{(work.performance.interaction_rate * 100).toFixed(2)}%</td>
            <td className="py-3 text-right">{(work.performance.share_rate * 100).toFixed(2)}%</td>
            <td className="py-3 text-right">{work.performance.completion_rate_available ? `${(work.performance.completion_rate * 100).toFixed(2)}%` : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {hasMore && nextCursor ? <div className="mt-5 flex justify-center">
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void load(failedCursor ?? nextCursor)}
          className="h-10 rounded-lg border border-studio-border bg-studio-surface px-5 text-sm font-medium transition hover:border-studio-cyan/60 disabled:opacity-60"
        >{loadingMore ? '加载中…' : failedCursor ? '重试加载下一页' : '下一页'}</button>
      </div> : <p className="mt-5 text-center text-xs text-studio-text-secondary">已加载全部作品</p>}
    </Panel> : null}
  </div>;
}
