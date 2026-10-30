import type { HTMLAttributes, ReactNode } from 'react';
import { useIsInsideMobileShell } from '../mobile/MobileShellContext';

type PageHeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  children: ReactNode;
};

export default function PageHeading({ children, ...props }: PageHeadingProps) {
  const mobileShell = useIsInsideMobileShell();
  const Heading = mobileShell ? 'h2' : 'h1';

  return <Heading {...props} data-mobile-page-heading={mobileShell ? '' : undefined}>{children}</Heading>;
}
