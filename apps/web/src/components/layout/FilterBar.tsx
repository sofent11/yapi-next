import type { ReactNode } from 'react';

type FilterBarProps = {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function FilterBar(props: FilterBarProps) {
  const rootClassName = ['legacy-filter-bar', props.className].filter(Boolean).join(' ');
  return (
    <div className={rootClassName}>
      <div className="legacy-filter-bar-left">{props.left}</div>
      <div className="legacy-filter-bar-right">{props.right}</div>
    </div>
  );
}
