import { useMemo } from 'react';
import AnimatedContent from '../reactbits/AnimatedContent';
import MagicBento, { type BentoCardProps } from '../reactbits/MagicBento';

type DashboardBentoProps = {
  pendingTopics: number;
  inProduction: number;
  toPublish: number;
  completionRate: number;
  totalViews: number;
  hotInspirations: number;
};

export default function DashboardBento({
  pendingTopics,
  inProduction,
  toPublish,
  completionRate,
  totalViews,
  hotInspirations,
}: DashboardBentoProps) {
  const cards = useMemo<BentoCardProps[]>(() => [
    { color: '#102235', label: '今日任务', title: `${pendingTopics} 个待审核`, description: `${inProduction} 个内容正在生产` },
    { color: '#17152b', label: '内容指数', title: `${completionRate}% 完成率`, description: '持续推进内容交付节奏' },
    { color: '#17261f', label: '发布数据', title: `${toPublish} 条待发布`, description: '查看今日发布链路与排期' },
    { color: '#211b2b', label: '播放数据', title: `${totalViews.toLocaleString('zh-CN')} 播放`, description: '聚合内容表现与复盘信号' },
    { color: '#142333', label: '粉丝变化', title: '团队趋势', description: '账号表现数据将在同步后更新' },
    { color: '#2b2116', label: 'AI 能力入口', title: `${hotInspirations} 条热门灵感`, description: '从创意池发现下一条内容线索' },
  ], [completionRate, hotInspirations, inProduction, pendingTopics, toPublish, totalViews]);

  return (
    <AnimatedContent className="w-full" distance={28} duration={0.65} threshold={0.08}>
      <section aria-labelledby="dashboard-bento-title" className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-studio-cyan">Content cockpit</p>
          <h2 id="dashboard-bento-title" className="mt-1 text-lg font-semibold text-studio-text-primary">内容生产驾驶舱</h2>
        </div>
        <MagicBento
          cards={cards}
          glowColor="14, 165, 233"
          particleCount={4}
          spotlightRadius={260}
          enableTilt={false}
          enableMagnetism={false}
          clickEffect={false}
        />
      </section>
    </AnimatedContent>
  );
}
