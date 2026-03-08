import type { ReactNode } from 'react';

type AppShellProps = {
  className?: string;
  children: ReactNode;
};

export function AppShell(props: AppShellProps) {
  return (
    <div
      className={[
        'mx-auto w-full max-w-[1440px] px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-7',
        props.className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.children}
    </div>
  );
}
