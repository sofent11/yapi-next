import type { ReactNode } from 'react';

type InfoGridProps = {
  children: ReactNode;
  className?: string;
};

type InfoGridItemProps = {
  label: ReactNode;
  value: ReactNode;
  span?: boolean;
};

export function InfoGrid(props: InfoGridProps) {
  return <div className={['app-info-grid', props.className].filter(Boolean).join(' ')}>{props.children}</div>;
}

export function InfoGridItem(props: InfoGridItemProps) {
  return (
    <div className={props.span ? 'app-info-item app-info-item-span' : 'app-info-item'}>
      <div className="app-info-item-label">{props.label}</div>
      <div className="app-info-item-value">{props.value}</div>
    </div>
  );
}
