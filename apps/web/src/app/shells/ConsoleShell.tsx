import type { ReactNode } from 'react';

type ConsoleShellProps = {
  aside: ReactNode;
  children: ReactNode;
  className?: string;
  asideClassName?: string;
  contentClassName?: string;
};

export function ConsoleShell(props: ConsoleShellProps) {
  return (
    <div className={['flex flex-col gap-4 lg:flex-row', props.className].filter(Boolean).join(' ')}>
      <aside className={['w-full lg:w-[260px] lg:flex-none', props.asideClassName].filter(Boolean).join(' ')}>
        {props.aside}
      </aside>
      <section className={['min-w-0 flex-1', props.contentClassName].filter(Boolean).join(' ')}>
        {props.children}
      </section>
    </div>
  );
}
