import { ReactBitsTextSlot } from '../ReactBitsTextSlot';

export function ReactBitsHeadingSlot({ semantic = 'page-title', children, className = '' }: { semantic?: 'brand-title' | 'page-title'; children: string; className?: string }) {
  return (
    <>
      <span className="sr-only">{children}</span>
      <span aria-hidden="true" className="inline-block max-w-full align-baseline">
        <ReactBitsTextSlot semantic={semantic} className={className}>{children}</ReactBitsTextSlot>
      </span>
    </>
  );
}
