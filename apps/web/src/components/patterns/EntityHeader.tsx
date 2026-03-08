import type { ReactNode } from 'react';

export type EntityHeaderProps = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
};

export function EntityHeader(props: EntityHeaderProps) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-shell-subtle)] pb-4 text-[var(--text-primary)]">
      <div className="min-w-0 flex-1">
        <div className="space-y-2">
          {props.eyebrow ? (
            <span className="inline-flex text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {props.eyebrow}
            </span>
          ) : null}
          <h1 className="m-0 text-[26px] font-semibold tracking-tight text-[var(--text-primary)] md:text-[32px]">{props.title}</h1>
          {props.subtitle ? (
            <p className="m-0 max-w-4xl text-sm leading-6 text-[var(--text-secondary)]">{props.subtitle}</p>
          ) : null}
          {props.meta || props.status ? (
            <div className="flex flex-wrap items-center gap-3 pt-1 text-sm text-[var(--text-muted)]">
              {props.meta ? <div>{props.meta}</div> : null}
              {props.status ? <div>{props.status}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
      {props.actions ? <div className="ml-auto flex flex-wrap items-center gap-2 self-start">{props.actions}</div> : null}
    </header>
  );
}
