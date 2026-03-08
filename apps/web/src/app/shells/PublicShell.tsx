import type { ReactNode } from 'react';

type PublicShellProps = {
  backdrop?: ReactNode;
  containerClassName?: string;
  children: ReactNode;
};

export function PublicShell(props: PublicShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--surface-public-canvas)] text-[var(--text-public-primary)]">
      {props.backdrop}
      <div
        className={[
          'relative z-10 mx-auto min-h-screen w-full max-w-6xl px-6 py-10 md:px-8',
          props.containerClassName
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {props.children}
      </div>
    </div>
  );
}
