import { useMemo } from 'react';
import { ArrowRight, CalendarDays, Clock3, PenLine, Play, Send } from 'lucide-react';
import { XMTMagicBentoAdapter, type BentoCardProps } from '@/features/reactbits-appearance/adapters/cards/XMTMagicBentoAdapter';
import { ReactBitsBackgroundSlot } from '@/features/reactbits-appearance/ReactBitsBackgroundSlot';
import { ReactBitsTextSlot } from '@/features/reactbits-appearance/ReactBitsTextSlot';
import { ReactBitsButtonSlot } from '@/features/reactbits-appearance/ReactBitsButtonSlot';
import { ReactBitsRevealSlot } from '@/features/reactbits-appearance/ReactBitsRevealSlot';

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
  const todayTasks = pendingTopics + inProduction + toPublish;
  const cards = useMemo<BentoCardProps[]>(() => [
    {
      color: '#071522',
      label: '内容生产指数',
      title: `${completionRate}%`,
      description: '今日完成度 · 推动内容链路持续向前',
      progress: completionRate,
      ariaLabel: `内容生产指数 ${completionRate}%`,
      onClick: () => onNavigate('/topics'),
    },
    {
      color: '#0d1b31',
      label: '今日任务',
      title: `${todayTasks} 项`,
      description: `${inProduction} 项正在创作 · ${toPublish} 项等待发布`,
      ariaLabel: `今日任务 ${todayTasks} 项`,
      onClick: () => onNavigate('/production'),
    },
    {
      color: '#10243a',
      label: '新增选题',
      title: `${todayTopics} 个`,
      description: '今日进入选题池的内容线索',
      ariaLabel: `新增选题 ${todayTopics} 个`,
      onClick: () => onNavigate('/topics/add'),
    },
    {
      color: '#191631',
      label: '待审核',
      title: `${pendingTopics} 个`,
      description: '需要优先处理的内容源头',
      ariaLabel: `待审核 ${pendingTopics} 个`,
      onClick: () => onNavigate('/topics?status=pending'),
    },
    {
      color: '#0b2527',
      label: '发布数据',
      title: `${toPublish} 条`,
      description: '进入今日发布链路与排期',
      ariaLabel: `发布数据 ${toPublish} 条`,
      onClick: () => onNavigate('/publishing'),
    },
    {
      color: '#172033',
      label: '播放表现',
      title: `${formatCompact(totalViews)} 次`,
      description: '本月内容播放汇总',
      ariaLabel: `播放表现 ${formatCompact(totalViews)} 次`,
    },
    {
      color: '#24162f',
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
    <section aria-labelledby="home-showcase-title" className="relative isolate overflow-hidden rounded-[32px] border border-slate-700/70 bg-[#030b18] px-4 py-5 text-white shadow-[0_32px_90px_rgba(4,12,30,0.3)] sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      <ReactBitsBackgroundSlot page="home" className="-z-20 opacity-80" fallbackClassName="bg-[radial-gradient(circle_at_78%_8%,rgba(34,211,238,0.23),transparent_32%),radial-gradient(circle_at_90%_22%,rgba(126,34,206,0.22),transparent_35%),linear-gradient(145deg,#020817,#071325)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(2,8,23,0.98)_0%,rgba(2,8,23,0.9)_43%,rgba(2,8,23,0.38)_76%,rgba(2,8,23,0.72)_100%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />

      <ReactBitsRevealSlot className="block">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(480px,0.9fr)] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold tracking-[0.08em] text-cyan-300">岚曜 XMT 新媒体协作平台</p>
            <h1 id="home-showcase-title" className="mt-4 text-[clamp(2.45rem,5vw,4.9rem)] font-black leading-[1.08] tracking-[-0.05em] text-white"><ReactBitsTextSlot semantic="brand-title" className="text-inherit">内容生产驾驶舱</ReactBitsTextSlot></h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
              让选题、创作、发布与复盘在同一节奏里前进。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ReactBitsButtonSlot type="button" variant="primary" onClick={() => onNavigate('/topics')} className="h-12 rounded-xl bg-cyan-400 text-slate-950">
                进入选题池 <ArrowRight className="h-4 w-4" />
              </ReactBitsButtonSlot>
              <ReactBitsButtonSlot type="button" variant="secondary" onClick={() => onNavigate('/calendar')} className="h-12 rounded-xl border-white/20 bg-white/[0.06] text-white">
                查看今日排期 <CalendarDays className="h-4 w-4" />
              </ReactBitsButtonSlot>
            </div>
          </div>

          <ReactBitsRevealSlot className="block">
            <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/45 shadow-[0_18px_60px_rgba(2,8,23,0.35)] backdrop-blur-xl sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {heroMetrics.map((metric) => (
                <button key={metric.label} type="button" disabled={!metric.path} onClick={() => metric.path && onNavigate(metric.path)} className="group min-w-0 border-b border-r border-white/10 p-4 text-left transition hover:bg-white/[0.08] disabled:cursor-default sm:border-b-0 lg:border-b xl:border-b-0">
                  <metric.icon className="h-4 w-4 text-cyan-300 transition group-hover:scale-110" />
                  <p className="mt-4 text-xs text-slate-400">{metric.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-white">{metric.value}</p>
                </button>
              ))}
            </div>
          </ReactBitsRevealSlot>
        </div>
      </ReactBitsRevealSlot>

      <ReactBitsRevealSlot className="mt-8 block">
        <div className="xmt-home-bento">
          <XMTMagicBentoAdapter
            cards={cards}
          />
          <style>{`
            .xmt-home-bento .bento-section { width: 100%; max-width: none; padding: 0; }
            .xmt-home-bento .card-responsive { width: 100%; margin: 0; padding: 0; gap: 14px; }
            .xmt-home-bento .card { aspect-ratio: auto; min-width: 0; min-height: clamp(176px, 14vw, 210px); border-color: rgba(148, 163, 184, 0.2) !important; }
            .xmt-home-bento .card[role="button"] { cursor: pointer; }
            .xmt-home-bento .card__label { color: rgba(226, 232, 240, 0.76); font-size: 0.78rem; font-weight: 650; letter-spacing: 0.04em; }
            .xmt-home-bento .card__title { display: block; max-width: 100%; overflow: visible; white-space: nowrap; padding-block: .08em; color: #fff; font-size: clamp(1.65rem, 2.8vw, 2.45rem); font-weight: 760; line-height: 1.12; letter-spacing: -0.04em; }
            .xmt-home-bento .card__description { margin-top: .7rem; color: rgba(203, 213, 225, 0.76); }
            .xmt-home-bento .card__progress { margin-top: 22px; }
            .xmt-home-bento .card__progress-track { height: 7px; overflow: hidden; border-radius: 999px; background: rgba(148, 163, 184, 0.2); }
            .xmt-home-bento .card__progress-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #22d3ee, #818cf8, #c084fc); box-shadow: 0 0 24px rgba(34, 211, 238, 0.55); }
            .xmt-home-bento .card:first-child { min-height: 360px; background-image: radial-gradient(circle at 15% 100%, rgba(34,211,238,.2), transparent 38%), radial-gradient(circle at 90% 15%, rgba(129,140,248,.22), transparent 42%); }
            .xmt-home-bento .card:not(:first-child):not(:nth-child(3)):not(:nth-child(4)):not(:nth-child(5)):not(:nth-child(6)) { min-height: clamp(190px, 16vw, 230px); }
            .xmt-home-bento .card:first-child .card__title { font-size: clamp(4.75rem, 9vw, 7.8rem); line-height: 1.12; color: #67e8f9; text-shadow: 0 0 38px rgba(34,211,238,.28); }
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
