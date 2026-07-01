import type { LucideIcon } from 'lucide-react';
import { FileAudio, FileImage, FileText, FileVideo, Link2, Package } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type ResourceTone = {
  label: string;
  icon: LucideIcon;
  className: string;
};

function getResourceTone(type?: string): ResourceTone {
  const value = (type || '').trim().toLowerCase();

  if (value.includes('image') || value.includes('图片') || value.includes('photo')) {
    return { label: '图片', icon: FileImage, className: 'border-studio-cyan/35 bg-studio-cyan/12 text-[#A5F3FC]' };
  }

  if (value.includes('video') || value.includes('视频')) {
    return { label: '视频', icon: FileVideo, className: 'border-studio-violet/35 bg-studio-violet/12 text-[#DDD6FE]' };
  }

  if (value.includes('audio') || value.includes('音频')) {
    return { label: '音频', icon: FileAudio, className: 'border-studio-amber/35 bg-studio-amber/12 text-[#FDE7B2]' };
  }

  if (value.includes('link') || value.includes('链接') || value.includes('url')) {
    return { label: '链接', icon: Link2, className: 'border-studio-success/35 bg-studio-success/12 text-[#B8F7E3]' };
  }

  if (value.includes('doc') || value.includes('文档') || value.includes('script')) {
    return { label: '文档', icon: FileText, className: 'border-studio-primary/35 bg-studio-primary/12 text-[#BFD0FF]' };
  }

  return { label: type || '其他', icon: Package, className: 'border-studio-border-soft bg-white/[0.04] text-studio-text-secondary' };
}

export default function ResourceTypeBadge({ type, className = '' }: { type?: string; className?: string }) {
  const tone = getResourceTone(type);
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
