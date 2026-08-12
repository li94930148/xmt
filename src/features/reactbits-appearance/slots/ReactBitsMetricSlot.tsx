import { ReactBitsTextSlot } from '../ReactBitsTextSlot';

export function ReactBitsMetricSlot({ value, children, className = '' }: { value?: number; children: string; className?: string }) {
  return <ReactBitsTextSlot semantic="metric" value={value} className={className}>{children}</ReactBitsTextSlot>;
}
