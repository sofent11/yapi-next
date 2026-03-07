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
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-[28px] border border-slate-200 bg-white/92 px-5 py-5 shadow-sm backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="space-y-2">
          {props.eyebrow ? (
            <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
              {props.eyebrow}
            </span>
          ) : null}
          <h1 className="m-0 text-2xl font-semibold text-slate-900 md:text-3xl">{props.title}</h1>
          {props.subtitle ? <p className="m-0 max-w-4xl text-sm leading-7 text-slate-600">{props.subtitle}</p> : null}
          {props.meta || props.status ? (
            <div className="flex flex-wrap items-center gap-3 pt-1 text-sm text-slate-500">
              {props.meta ? <div>{props.meta}</div> : null}
              {props.status ? <div>{props.status}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
      {props.actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{props.actions}</div> : null}
    </header>
  );
}
