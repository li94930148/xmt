import { useMemo } from 'react';
import { ArrowRight, CalendarDays, Clock3, PenLine, Play, Send } from 'lucide-react';
import { XMTMagicBentoAdapter, type BentoCardProps } from '@/features/reactbits-appearance/adapters/cards/XMTMagicBentoAdapter';
import { ReactBitsBackgroundSlot } from '@/features/reactbits-appearance/ReactBitsBackgroundSlot';
import { ReactBitsTextSlot } from '@/features/reactbits-appearance/ReactBitsTextSlot';
import { ReactBitsButtonSlot } from '@/features/reactbits-appearance/ReactBitsButtonSlot';
import { ReactBitsRevealSlot } from '@/features/reactbits-appearance/ReactBitsRevealSlot';
import { useAppStore } from '@/store';

type DashboardBentoProps = {
  pendingTopics: number;
  inProduction: number;
  toPublish: number;
  todayTopics: number;
  completionRate: number;
  totalViews: number;
  hotInspirations: number;
  onNavigate: (path: string) => void;
};

function formatCompact(value: number) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export default function DashboardBento({
  pendingTopics,
  inProduction,
  toPublish,
  todayTopics,
  completionRate,
  totalViews,
  hotInspirations,
  onNavigate,
}: DashboardBentoProps) {
  const isDark = useAppStore((state) => state.theme === 'dark');
  const todayTasks = pendingTopics + inProduction + toPublish;
  const cards = useMemo<BentoCardProps[]>(() => [
    {
      color: 'var(--xmt-surface)',
      label: '内容生产指数',
      title: `${completionRate}%`,
      description: '按选题、创作、发布的实际推进阶段计算',
      progress: completionRate,
      ariaLabel: `内容生产指数 ${completionRate}%`,
      onClick: () => onNavigate('/topics'),
    },
    {
      color: 'var(--xmt-surface-soft)',
      label: '今日任务',
      title: `${todayTasks} 项`,
      description: `${inProduction} 项正在创作 · ${toPublish} 项等待发布`,
      ariaLabel: `今日任务 ${todayTasks} 项`,
      onClick: () => onNavigate('/production'),
    },
    {
      color: 'var(--xmt-surface-elevated)',
      label: '新增选题',
      title: `${todayTopics} 个`,
      description: '今日进入选题池的内容线索',
      ariaLabel: `新增选题 ${todayTopics} 个`,
      onClick: () => onNavigate('/topics/add'),
    },
    {
      color: 'var(--xmt-surface)',
      label: '待审核',
      title: `${pendingTopics} 个`,
      description: '需要优先处理的内容源头',
      ariaLabel: `待审核 ${pendingTopics} 个`,
      onClick: () => onNavigate('/topics?status=pending'),
    },
    {
      color: 'var(--xmt-surface-soft)',
      label: '发布数据',
      title: `${toPublish} 条`,
      description: '当前等待发布的内容与排期',
      ariaLabel: `发布数据 ${toPublish} 条`,
      onClick: () => onNavigate('/publishing'),
    },
    {
      color: 'var(--xmt-surface-elevated)',
      label: '播放表现',
      title: `${formatCompact(totalViews)} 次`,
      description: '抖音运营中心作品累计播放',
      ariaLabel: `播放表现 ${formatCompact(totalViews)} 次`,
    },
    {
      color: 'var(--xmt-surface)',
      label: 'AI 能力入口',
      title: `${hotInspirations} 条灵感`,
      description: '从灵感库发现下一条内容线索',
      ariaLabel: `AI 能力入口 ${hotInspirations} 条灵感`,
      onClick: () => onNavigate('/inspirations'),
    },
  ], [completionRate, hotInspirations, inProduction, onNavigate, pendingTopics, toPublish, todayTasks, todayTopics, totalViews]);

  const heroMetrics = [
    { label: '待审核', value: pendingTopics, icon: Clock3, path: '/topics?status=pending' },
    { label: '创作中', value: inProduction, icon: PenLine, path: '/production' },
    { label: '待发布', value: toPublish, icon: Send, path: '/publishing' },
    { label: '播放表现', value: formatCompact(totalViews), icon: Play, path: '' },
  ];

  return (
    <section aria-labelledby="home-showcase-title" className={`xmt-home-showcase studio-sheen relative isolate overflow-hidden rounded-panel border border-studio-border-soft px-4 py-5 shadow-card sm:px-6 sm:py-7 lg:px-8 lg:py-8 ${isDark ? 'bg-studio-app-bg text-studio-text-primary' : 'bg-studio-surface text-studio-text-primary'}`}>
      <ReactBitsBackgroundSlot page="home" className="-z-20 opacity-80" fallbackClassName={isDark ? 'bg-[radial-gradient(circle_at_78%_8%,var(--xmt-ambient-a),transparent_34%),radial-gradient(circle_at_90%_22%,var(--xmt-ambient-b),transparent_36%),linear-gradient(145deg,var(--xmt-app-bg),var(--xmt-app-bg-soft)_50%,var(--xmt-surface))]' : 'bg-studio-surface'} />
      {isDark ? <>
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(2,8,23,0.98)_0%,rgba(2,8,23,0.9)_43%,rgba(2,8,23,0.38)_76%,rgba(2,8,23,0.72)_100%)]" />
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 [background-image:linear-gradient(var(--xmt-grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--xmt-grid-line)_1px,transparent_1px)] [background-size:48px_48px]" />
      </> : null}

      <ReactBitsRevealSlot className="block">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(480px,0.9fr)] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-studio-cyan">岚曜 XMT 新媒体协作平台</p>
            <h1 id="home-showcase-title" className="mt-4 text-[clamp(2.35rem,5vw,4.6rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-studio-text-primary"><ReactBitsTextSlot semantic="brand-title" className="text-inherit">内容生产驾驶舱</ReactBitsTextSlot></h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-studio-text-secondary md:text-lg">
              让选题、创作、发布与复盘在同一节奏里前进。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ReactBitsButtonSlot type="button" variant="primary" onClick={() => onNavigate('/topics')} className="h-11 rounded-button">
                进入选题池 <ArrowRight className="h-4 w-4" />
              </ReactBitsButtonSlot>
              <ReactBitsButtonSlot type="button" variant="secondary" onClick={() => onNavigate('/calendar')} className="h-11 rounded-button border-studio-border-soft bg-studio-surface-soft text-studio-text-primary hover:bg-studio-surface-elevated">
                查看今日排期 <CalendarDays className="h-4 w-4" />
              </ReactBitsButtonSlot>
            </div>
          </div>

          <ReactBitsRevealSlot className="block">
            <div className="grid grid-cols-2 overflow-hidden rounded-card border border-studio-border-soft bg-studio-surface-glass shadow-floating backdrop-blur-xl sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {heroMetrics.map((metric) => (
                <button key={metric.label} type="button" disabled={!metric.path} onClick={() => metric.path && onNavigate(metric.path)} className="group min-w-0 border-b border-r border-studio-border-soft p-4 text-left transition hover:bg-studio-surface-soft disabled:cursor-default sm:border-b-0 lg:border-b xl:border-b-0">
                  <metric.icon className="h-4 w-4 text-studio-cyan transition group-hover:scale-110" />
                  <p className="mt-4 text-xs text-studio-text-muted">{metric.label}</p>
                  <p className="xmt-data-number mt-1 text-2xl font-semibold tracking-tight text-studio-text-primary">{metric.value}</p>
                </button>
              ))}
            </div>
          </ReactBitsRevealSlot>
        </div>
      </ReactBitsRevealSlot>

      <ReactBitsRevealSlot className="mt-8 block">
        <div className="xmt-home-bento">
          <XMTMagicBentoAdapter cards={cards} glowColor={isDark ? '92, 225, 230' : '8, 145, 178'} />
          <style>{`
            .xmt-home-bento .bento-section { width: 100%; max-width: none; padding: 0; }
            .xmt-home-bento .card-responsive { width: 100%; margin: 0; padding: 0; gap: 14px; }
            .xmt-home-bento .card { aspect-ratio: auto; min-width: 0; min-height: clamp(176px, 14vw, 210px); border-color: var(--xmt-border-soft) !important; }
            .xmt-home-bento .card__header, .xmt-home-bento .card__content { color: var(--xmt-text-primary); }
            .xmt-home-bento .card[role="button"] { cursor: pointer; }
            .xmt-home-bento .card__label { color: var(--xmt-text-secondary); font-size: 0.78rem; font-weight: 650; letter-spacing: 0.04em; }
            .xmt-home-bento .card__title { display: block; max-width: 100%; overflow: visible; white-space: nowrap; padding-block: .08em; color: var(--xmt-text-primary); font-size: clamp(1.65rem, 2.8vw, 2.45rem); font-weight: 760; line-height: 1.12; letter-spacing: -0.04em; }
            .xmt-home-bento .card__description { margin-top: .7rem; color: var(--xmt-text-secondary); }
            .xmt-home-bento .card__progress { margin-top: 22px; }
            .xmt-home-bento .card__progress-track { height: 7px; overflow: hidden; border-radius: 999px; background: var(--xmt-border-soft); }
            .xmt-home-bento .card__progress p { color: var(--xmt-text-muted); }
            .xmt-home-bento .card__progress-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--xmt-cyan), var(--xmt-primary), var(--xmt-violet)); box-shadow: 0 0 24px rgba(34, 211, 238, 0.55); }
            .xmt-home-bento .card:first-child { min-height: 360px; background-image: radial-gradient(circle at 15% 100%, color-mix(in srgb, var(--xmt-cyan) 20%, transparent), transparent 38%), radial-gradient(circle at 90% 15%, color-mix(in srgb, var(--xmt-violet) 22%, transparent), transparent 42%); }
            .xmt-home-bento .card:not(:first-child):not(:nth-child(3)):not(:nth-child(4)):not(:nth-child(5)):not(:nth-child(6)) { min-height: clamp(190px, 16vw, 230px); }
            .xmt-home-bento .card:first-child .card__title { font-size: clamp(4.75rem, 9vw, 7.8rem); line-height: 1.12; color: var(--xmt-cyan-contrast); text-shadow: 0 0 38px color-mix(in srgb, var(--xmt-cyan) 28%, transparent); }
            @media (min-width: 600px) {
              .xmt-home-bento .card-responsive { grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .xmt-home-bento .card:first-child, .xmt-home-bento .card:nth-child(2), .xmt-home-bento .card:nth-child(7) { grid-column: span 2; }
            }
            @media (min-width: 1024px) {
              .xmt-home-bento .card-responsive { grid-template-columns: repeat(4, minmax(0, 1fr)); }
              .xmt-home-bento .card:first-child { grid-column: span 2; grid-row: span 2; }
              .xmt-home-bento .card:nth-child(2) { grid-column: span 2; grid-row: auto; }
              .xmt-home-bento .card:nth-child(3), .xmt-home-bento .card:nth-child(4), .xmt-home-bento .card:nth-child(5), .xmt-home-bento .card:nth-child(6) { grid-column: span 1; grid-row: auto; }
              .xmt-home-bento .card:nth-child(7) { grid-column: span 2; grid-row: auto; }
            }
            @media (max-width: 599px) {
              .xmt-home-bento .card-responsive { width: 100%; padding: 0; }
              .xmt-home-bento .card { min-height: 176px; }
              .xmt-home-bento .card:first-child { min-height: 300px; }
            }
          `}</style>
        </div>
      </ReactBitsRevealSlot>
    </section>
  );
}
