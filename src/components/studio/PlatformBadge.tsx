import type { LucideIcon } from 'lucide-react';
import { BookOpen, Clapperboard, Music2, PlaySquare, Radio, Share2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { getPlatformLabel } from '../../platform/platform-labels';

type PlatformTone = {
  label: string;
  icon: LucideIcon;
  className: string;
};

function normalizePlatform(platform?: string) {
  return (platform || 'other').trim().toLowerCase();
}

function getPlatformTone(platform?: string): PlatformTone {
  const value = normalizePlatform(platform);
  const label = getPlatformLabel(platform) || '其他平台';

  if (value.includes('抖音') || value.includes('douyin') || value.includes('tiktok')) {
    return {
      label,
      icon: Music2,
      className: 'border-studio-cyan/35 bg-studio-cyan/12 text-studio-cyan-contrast',
    };
  }

  if (value.includes('小红书') || value.includes('xiaohongshu') || value.includes('red')) {
    return {
      label,
      icon: BookOpen,
      className: 'border-studio-coral/35 bg-studio-coral/12 text-studio-coral-contrast',
    };
  }

  if (value.includes('视频号') || value.includes('wechat') || value.includes('weixin')) {
    return {
      label,
      icon: Radio,
      className: 'border-studio-success/35 bg-studio-success/12 text-studio-success-contrast',
    };
  }

  if (value.includes('快手') || value.includes('kuaishou')) {
    return {
      label,
      icon: Clapperboard,
      className: 'border-studio-amber/35 bg-studio-amber/12 text-studio-amber-contrast',
    };
  }

  if (value.includes('b站') || value.includes('bilibili')) {
    return {
      label,
      icon: PlaySquare,
      className: 'border-studio-violet/35 bg-studio-violet/12 text-studio-violet-contrast',
    };
  }

  return {
    label,
    icon: Share2,
    className: 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary',
  };
}

export default function PlatformBadge({ platform, className = '' }: { platform?: string; className?: string }) {
  const tone = getPlatformTone(platform);
  const Icon = tone.icon;

  return (
    <span
      className={twMerge(
        'inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-snug',
        tone.className,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{tone.label}</span>
    </span>
  );
}
