import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { getAnnouncements, type Announcement } from '@/api/announcements';
import { ActionButton } from '@/components/studio';
import { formatBeijingDate } from '@/lib/utils';

const AnnouncementBoard = lazy(() => import('@/components/AnnouncementBoard'));

export default function AnnouncementStrip({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const readLockRef = useRef(false);

  const reload = useCallback(async () => {
    if (readLockRef.current) return;
    readLockRef.current = true;
    setLoading(true);
    try {
      setItems(await getAnnouncements());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      readLockRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const featured = items[0];

  return (
    <div className={embedded ? 'w-full' : 'px-4 pt-3 sm:px-6'} data-testid="home-announcement-strip">
      <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-7xl'}>
        <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-studio-border-soft bg-studio-surface-soft/55 px-4 py-2.5" aria-label="系统公告">
          <Megaphone className="h-4 w-4 shrink-0 text-studio-primary-contrast" aria-hidden="true" />
          <span className="shrink-0 text-xs font-semibold text-studio-text-secondary">公告</span>
          <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
            {loading ? <p className="text-sm text-studio-text-secondary">正在读取公告…</p> : loadError ? <p className="text-sm text-studio-coral-contrast">公告暂时无法读取</p> : featured ? (
              <p className="flex min-w-0 items-center gap-x-2 text-sm text-studio-text-primary">
                {featured.pinned ? <span className="hidden shrink-0 rounded-full bg-studio-primary-soft px-2 py-0.5 text-[10px] font-semibold text-studio-primary-contrast sm:inline-flex">置顶</span> : null}
                <span className="min-w-0 flex-1 truncate" title={featured.content}>{featured.content}</span>
                <time className="sr-only shrink-0 text-xs text-studio-text-secondary sm:not-sr-only" dateTime={featured.created_at}>{formatBeijingDate(featured.created_at)}</time>
                {items.length > 1 ? <span className="hidden shrink-0 text-xs text-studio-text-secondary sm:inline">另有 {items.length - 1} 条</span> : null}
              </p>
            ) : <p className="text-sm text-studio-text-secondary">暂无公告</p>}
          </div>
          {loadError ? <ActionButton variant="ghost" disabled={loading} onClick={() => void reload()}>{loading ? '正在重试…' : '重试'}</ActionButton> : null}
          <ActionButton
            variant="ghost"
            aria-expanded={expanded}
            aria-controls="home-announcement-board"
            onClick={() => {
              if (expanded) void reload();
              setExpanded((value) => !value);
            }}
          >
            {expanded ? '收起公告板' : '查看公告'}
          </ActionButton>
        </section>
        {expanded ? (
          <div id="home-announcement-board" className="mt-3">
            <Suspense fallback={<p className="p-4 text-sm text-studio-text-secondary" role="status">正在打开公告板…</p>}>
              <AnnouncementBoard />
            </Suspense>
          </div>
        ) : null}
      </div>
    </div>
  );
}
