import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

type ImageFallbackProps = {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  loading?: 'eager' | 'lazy';
};

export default function ImageFallback({ src, alt, className = '', fallbackClassName = '', loading = 'lazy' }: ImageFallbackProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <span role="img" aria-label={`${alt || '图片'}加载失败`} className={`grid shrink-0 place-items-center bg-studio-surface text-studio-text-muted ${className} ${fallbackClassName}`}><ImageOff className="h-4 w-4"/></span>;
  }
  return <img src={src} alt={alt} loading={loading} decoding="async" onError={() => setFailed(true)} className={className}/>;
}
