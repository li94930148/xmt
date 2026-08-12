import { ReactBitsTextSlot } from '../ReactBitsTextSlot';

export function ReactBitsHeadingSlot({ semantic = 'page-title', children, className = '' }: { semantic?: 'brand-title' | 'page-title'; children: string; className?: string }) {
  return <ReactBitsTextSlot semantic={semantic} className={className}>{children}</ReactBitsTextSlot>;
}
