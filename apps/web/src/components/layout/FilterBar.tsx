import type { ReactNode } from 'react';

type FilterBarProps = {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function FilterBar(props: FilterBarProps) {
  const rootClassName = [
    'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border-shell-subtle)] bg-[var(--surface-shell-subtle)] px-4 py-3 text-[var(--text-primary)] shadow-[var(--shadow-panel)]',
    props.className
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={rootClassName}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{props.left}</div>
      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">{props.right}</div>
    </div>
  );
}
