import { useEffect, useMemo, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getDouyinManagedCover, type DouyinWork } from '@/api/creatorCenter';

type Props = { work: DouyinWork; accountUid?: string; className?: string; fallbackClassName?: string; loading?: 'eager'|'lazy'; decorative?: boolean };

export default function CreatorCoverImage({ work, accountUid, className = '', fallbackClassName = '', loading = 'lazy', decorative = false }: Props) {
  const candidates = useMemo(() => [...new Set([work.cover_url, ...(work.cover_candidates || [])]
    .filter((value): value is string => typeof value === 'string' && /^https?:\/\//i.test(value.trim())))].slice(0, 4), [work.cover_url, work.cover_candidates]);
  const [managed, setManaged] = useState<string | null>(null);
  const [managedFailed, setManagedFailed] = useState(false);
  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => {
    setCandidateIndex(0); setManaged(null); setManagedFailed(false);
    if (!work.managed_cover_available) { setManagedFailed(true); return; }
    const controller = new AbortController(); let objectUrl = '';
    void getDouyinManagedCover(work.id, controller.signal, accountUid).then(blob => { if (!controller.signal.aborted) { objectUrl=URL.createObjectURL(blob);setManaged(objectUrl); } }).catch(() => { if (!controller.signal.aborted) setManagedFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [accountUid, work.id, work.managed_cover_available]);
  const source = managed || (managedFailed ? candidates[candidateIndex] : undefined);
  if (!source) return <span role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `${work.title||'作品'}暂无封面`} aria-hidden={decorative || undefined} className={`grid shrink-0 place-items-center bg-studio-surface text-studio-text-muted ${className} ${fallbackClassName}`}><ImageOff className="h-4 w-4"/></span>;
  return <img src={source} alt={decorative ? '' : work.title} loading={loading} decoding="async" referrerPolicy="no-referrer" onError={()=>{if(managed){setManaged(null);setManagedFailed(true);}else setCandidateIndex(index=>index+1<candidates.length?index+1:index);}} className={className}/>;
}
