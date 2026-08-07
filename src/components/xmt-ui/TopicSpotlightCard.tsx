import { Flame, UserRound } from 'lucide-react';
import type { Topic } from '../../types';
import SpotlightCard from '../reactbits/SpotlightCard';

type TopicSpotlightCardProps = {
  topic: Topic;
  statusLabel: string;
  formattedTime: string;
  heat?: number | null;
  onOpen: () => void;
};

export default function TopicSpotlightCard({
  topic,
  statusLabel,
  formattedTime,
  heat,
  onOpen,
}: TopicSpotlightCardProps) {
  return (
    <SpotlightCard
      className="!rounded-2xl !border-studio-border-soft !bg-studio-card !p-5 transition-transform duration-200 hover:-translate-y-0.5"
      spotlightColor="rgba(14, 165, 233, 0.16)"
    >
      <button type="button" onClick={onOpen} className="relative z-[1] flex h-full w-full flex-col text-left">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-studio-cyan/10 px-2.5 py-1 text-xs font-semibold text-studio-cyan">重点选题</span>
          <span className="text-xs text-studio-text-muted">{statusLabel}</span>
        </div>
        <h3 className="mt-5 line-clamp-2 text-base font-semibold leading-6 text-studio-text-primary">{topic.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-studio-text-secondary">{topic.description || '暂无选题描述'}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-studio-text-muted">
          <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{topic.creator_name || '未署名'}</span>
          <span>{formattedTime}</span>
          <span className="inline-flex items-center gap-1.5"><Flame className="h-3.5 w-3.5" />{heat == null ? '热度暂无' : `热度 ${heat}`}</span>
        </div>
      </button>
    </SpotlightCard>
  );
}
