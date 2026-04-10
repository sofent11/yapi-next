import type { ReactNode } from 'react';

type AppShellProps = {
  className?: string;
  children: ReactNode;
};

export function AppShell(props: AppShellProps) {
  return (
    <div
      className={[
        'w-full px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-7 min-[1800px]:mx-auto min-[1800px]:max-w-[1760px]',
        props.className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.children}
    </div>
  );
}
