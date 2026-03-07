import type { ReactNode } from 'react';

type FilterBarProps = {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function FilterBar(props: FilterBarProps) {
  const rootClassName = [
    'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm dark:!border-[#24456f] dark:!bg-[#10294d]',
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
