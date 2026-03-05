import type { ReactNode } from 'react';

type AppShellProps = {
  className?: string;
  children: ReactNode;
};

export function AppShell(props: AppShellProps) {
  return <div className={`legacy-page-shell ${props.className || ''}`.trim()}>{props.children}</div>;
}
