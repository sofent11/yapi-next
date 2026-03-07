import type { ReactNode } from 'react';

type AdaptiveDataViewProps = {
  desktop: ReactNode;
  mobile: ReactNode;
  className?: string;
};

export function AdaptiveDataView(props: AdaptiveDataViewProps) {
  return (
    <div className={['adaptive-data-view', props.className].filter(Boolean).join(' ')}>
      <div className="hidden md:block">{props.desktop}</div>
      <div className="adaptive-data-view-mobile md:hidden">{props.mobile}</div>
    </div>
  );
}
