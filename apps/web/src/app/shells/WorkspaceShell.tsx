import type { ReactNode } from 'react';

type WorkspaceShellProps = {
  header?: ReactNode;
  notices?: ReactNode;
  banner?: ReactNode;
  footer?: ReactNode;
  mainClassName?: string;
  children: ReactNode;
};

export function WorkspaceShell(props: WorkspaceShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {props.header}
      {props.notices}
      <main
        id="app-main-content"
        role="main"
        tabIndex={-1}
        className={['flex-1 px-6 py-6', props.mainClassName].filter(Boolean).join(' ')}
      >
        {props.banner}
        {props.children}
      </main>
      {props.footer}
    </div>
  );
}
