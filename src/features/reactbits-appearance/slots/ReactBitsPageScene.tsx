import type { ReactNode } from 'react';
import type { AppearancePage } from '../types';
import { ReactBitsBackgroundSlot } from '../ReactBitsBackgroundSlot';

type Props = { page: AppearancePage; children: ReactNode; className?: string; fallbackClassName?: string; previewMode?: boolean; forceRender?: boolean };

/** Page-level scene boundary. It keeps one background slot behind page business content. */
export function ReactBitsPageScene({ page, children, className = '', fallbackClassName = '', previewMode = false, forceRender = false }: Props) {
  return <section data-reactbits-scene={page} className={`relative isolate ${className}`}><ReactBitsBackgroundSlot page={page} previewMode={previewMode} forceRender={forceRender} className="-z-10 opacity-60" fallbackClassName={fallbackClassName} />{children}</section>;
}
