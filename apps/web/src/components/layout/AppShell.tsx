import type { ReactNode } from 'react';

type AppShellProps = {
  className?: string;
  children: ReactNode;
};

export function AppShell(props: AppShellProps) {
  return (
    <div
      className={[
        'mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 lg:px-8',
        props.className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.children}
    </div>
  );
}
